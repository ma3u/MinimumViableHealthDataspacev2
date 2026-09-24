/**
 * FHIR R4 Observations for the patient overview (issue #271).
 *
 * `rowsToBundle` turns the graph's Observation rows into the searchset
 * Bundle that `GET /api/patient/observations` returns; `bundleToParameters`
 * groups a Bundle by LOINC code into series with the printed reference
 * range. Both are pure and shared by the route, the view builder and the
 * fixture generator.
 */
import type { Range, SeriesPoint } from "./derive";

export interface ObservationRow {
  id: string;
  code: string;
  display: string;
  value: number;
  unit: string;
  low?: number | null;
  high?: number | null;
  rangeText?: string | null;
  category?: string | null;
  /** ISO date or timestamp */
  effective: string;
  performer?: string | null;
}

export interface FhirQuantity {
  value: number;
  unit: string;
  system?: string;
  code?: string;
}

export interface FhirObservation {
  resourceType: "Observation";
  id: string;
  meta?: { tag?: { system?: string; code: string }[] };
  status: string;
  category?: { coding: { system?: string; code: string }[] }[];
  code: {
    coding: { system?: string; code: string; display?: string }[];
    text?: string;
  };
  subject: { reference: string; display?: string };
  effectiveDateTime: string;
  performer?: { display: string }[];
  valueQuantity: FhirQuantity;
  referenceRange?: { low?: FhirQuantity; high?: FhirQuantity; text?: string }[];
}

export interface FhirBundle {
  resourceType: "Bundle";
  id?: string;
  type: "searchset";
  meta?: { tag?: { system?: string; code: string }[] };
  total: number;
  link?: { relation: string; url: string }[];
  entry: { fullUrl?: string; resource: FhirObservation }[];
}

const FICTIONAL_TAG = {
  system: "https://ehds.mabu.red/tag",
  code: "fictional",
};

function toIsoDateTime(v: string): string {
  const s = String(v);
  return s.length === 10 ? `${s}T00:00:00Z` : s;
}

/** The searchset Bundle for one patient's Observations. */
export function rowsToBundle(
  rows: ObservationRow[],
  patient: { id: string; name?: string | null },
  selfUrl: string,
): FhirBundle {
  const entry = rows.map((r) => {
    const rr: FhirObservation["referenceRange"] =
      r.low != null || r.high != null
        ? [
            {
              ...(r.low != null ? { low: { value: r.low, unit: r.unit } } : {}),
              ...(r.high != null
                ? { high: { value: r.high, unit: r.unit } }
                : {}),
              ...(r.rangeText ? { text: r.rangeText } : {}),
            },
          ]
        : undefined;
    const resource: FhirObservation = {
      resourceType: "Observation",
      id: r.id,
      meta: { tag: [FICTIONAL_TAG] },
      status: "final",
      category: [
        {
          coding: [
            {
              system:
                "http://terminology.hl7.org/CodeSystem/observation-category",
              code: r.category ?? "laboratory",
            },
          ],
        },
      ],
      code: {
        coding: [
          { system: "http://loinc.org", code: r.code, display: r.display },
        ],
        text: r.display,
      },
      subject: {
        reference: `Patient/${patient.id}`,
        ...(patient.name ? { display: patient.name } : {}),
      },
      effectiveDateTime: toIsoDateTime(r.effective),
      ...(r.performer ? { performer: [{ display: r.performer }] } : {}),
      valueQuantity: {
        value: r.value,
        unit: r.unit,
        system: "http://unitsofmeasure.org",
        code: r.unit,
      },
      ...(rr ? { referenceRange: rr } : {}),
    };
    return { fullUrl: `urn:uuid:${r.id}`, resource };
  });
  return {
    resourceType: "Bundle",
    id: `observations-${patient.id}`,
    type: "searchset",
    meta: { tag: [FICTIONAL_TAG] },
    total: entry.length,
    link: [{ relation: "self", url: selfUrl }],
    entry,
  };
}

export interface Parameter {
  code: string;
  display: string;
  unit: string;
  range: Range | null;
  performer?: string;
  /** Sorted by date, oldest first; `id` is the Observation id */
  series: (SeriesPoint & { id: string })[];
}

/** Group a Bundle by LOINC code into series, oldest first. */
export function bundleToParameters(bundle: FhirBundle): Parameter[] {
  const byCode = new Map<string, Parameter>();
  for (const { resource: r } of bundle.entry ?? []) {
    const coding = r.code?.coding?.[0];
    if (!coding || !r.valueQuantity) continue;
    const rr = r.referenceRange?.[0];
    let p = byCode.get(coding.code);
    if (!p) {
      p = {
        code: coding.code,
        display: coding.display ?? r.code.text ?? coding.code,
        unit: r.valueQuantity.unit,
        range: rr
          ? {
              low: rr.low?.value ?? null,
              high: rr.high?.value ?? null,
              text: rr.text,
            }
          : null,
        performer: r.performer?.[0]?.display,
        series: [],
      };
      byCode.set(coding.code, p);
    }
    p.series.push({
      date: r.effectiveDateTime.slice(0, 10),
      value: r.valueQuantity.value,
      id: r.id,
    });
  }
  for (const p of byCode.values()) {
    p.series.sort((a, b) => a.date.localeCompare(b.date));
  }
  return [...byCode.values()];
}

import { runQuery } from "@/lib/neo4j";
import { SOURCE_KIND_EXTENSION } from "@/lib/overview/observations";

/**
 * Values the Klarbefund app sends into the patient's own record (#473
 * phase 3, "insert my values").
 *
 * The app sends the FHIR R4 document it already writes for a report: Patient,
 * DocumentReference, Observations, DiagnosticReport, Provenance. Only the
 * Observations are taken, and only ones that say what they are:
 *
 * - `status: preliminary`. A value read from a photograph or typed in is
 *   never `final`; that is the laboratory's word, and only its own document
 *   carries it (ADR-033).
 * - A LOINC code. A value LOINC does not code (a microbiome organism, the
 *   night-time dip of blood pressure) is reported back as skipped, not stored
 *   under a code it does not have.
 * - A number with a UCUM unit, and a date.
 *
 * Its provenance (`ocr-transcribed`, `self-tracked`, `lab-issued-digital`)
 * travels with it and is shown with it.
 */

const LOINC = "http://loinc.org";
const UCUM = "http://unitsofmeasure.org";
/** One report's worth, generously: a microbiome panel is about 80. */
export const MAX_OBSERVATIONS = 500;

export interface IncomingRow {
  resourceId: string;
  code: string;
  display: string;
  value: number;
  unit: string;
  low: number | null;
  high: number | null;
  rangeText: string | null;
  effective: string;
  category: string;
  sourceKind: string | null;
  performer: string | null;
}

export interface Parsed {
  rows: IncomingRow[];
  /** Why each refused Observation was refused, by its id in the bundle. */
  skipped: { id: string; reason: string }[];
}

type Json = Record<string, unknown>;
const obj = (v: unknown): Json =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : {};
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string | null => (typeof v === "string" ? v : null);
const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

/**
 * The Observations of one report's bundle, as rows to store. Throws on a
 * body that is not a FHIR Bundle at all.
 */
export function parseReportBundle(
  body: unknown,
  ids: { patientId: string; reportId: string },
): Parsed {
  const bundle = obj(body);
  if (bundle.resourceType !== "Bundle") {
    throw new Error("the body is not a FHIR Bundle");
  }
  const resources = arr(bundle.entry).map((e) => obj(obj(e).resource));
  const performer =
    resources
      .filter((r) => r.resourceType === "DiagnosticReport")
      .map((r) => str(obj(arr(r.performer)[0]).display))
      .find(Boolean) ?? null;

  const rows: IncomingRow[] = [];
  const skipped: Parsed["skipped"] = [];
  resources
    .filter((r) => r.resourceType === "Observation")
    .forEach((r, index) => {
      const id = str(r.id) ?? `#${index + 1}`;
      const refuse = (reason: string) => skipped.push({ id, reason });
      if (r.status !== "preliminary") {
        return refuse("only preliminary values are accepted from the app");
      }
      const code = obj(r.code);
      const loinc = arr(code.coding)
        .map(obj)
        .find((c) => c.system === LOINC && str(c.code));
      if (!loinc) return refuse("no LOINC code");
      const quantity = obj(r.valueQuantity);
      const value = num(quantity.value);
      const unit = str(quantity.code) ?? str(quantity.unit);
      if (value === null || !unit) return refuse("no number with a unit");
      if (quantity.system && quantity.system !== UCUM) {
        return refuse("the unit is not UCUM");
      }
      const effective = str(r.effectiveDateTime);
      if (!effective || Number.isNaN(Date.parse(effective))) {
        return refuse("no date");
      }
      const range = obj(arr(r.referenceRange)[0]);
      const source = arr(r.extension)
        .map(obj)
        .find((e) => e.url === SOURCE_KIND_EXTENSION);
      rows.push({
        resourceId: `${ids.patientId}-${ids.reportId}-${index + 1}`,
        code: str(loinc.code)!,
        display:
          str(code.text) ?? str(loinc.display) ?? str(loinc.code) ?? "Unknown",
        value,
        unit,
        low: num(obj(range.low).value),
        high: num(obj(range.high).value),
        rangeText: str(range.text),
        effective,
        category:
          str(obj(arr(obj(arr(r.category)[0]).coding)[0]).code) ?? "laboratory",
        sourceKind: str(source?.valueCode) ?? str(source?.valueString),
        performer,
      });
    });
  return { rows, skipped };
}

/**
 * Replaces one report's values in the sandbox record with these. Sending a
 * report again therefore updates it rather than doubling it. Returns how
 * many are stored. Never touches a record that is not a sandbox.
 */
export async function storeReportRows(input: {
  patientId: string;
  reportId: string;
  rows: IncomingRow[];
}): Promise<number> {
  const result = await runQuery<{ stored: number }>(
    `MATCH (p:Patient {id: $patientId, sandbox: true})
     OPTIONAL MATCH (p)-[:HAS_OBSERVATION]->(old:Observation {sourceReport: $reportId})
     WITH p, collect(old) AS previous
     FOREACH (n IN previous | DETACH DELETE n)
     WITH p
     UNWIND $rows AS r
     MERGE (o:Observation {resourceId: r.resourceId})
       ON CREATE SET o.createdAt = datetime()
     SET o.code = r.code, o.display = r.display, o.valueQuantity = r.value,
         o.unit = r.unit, o.referenceLow = r.low, o.referenceHigh = r.high,
         o.referenceText = r.rangeText, o.effectiveDate = r.effective,
         o.category = r.category, o.status = 'preliminary',
         o.sourceKind = r.sourceKind, o.performer = r.performer,
         o.sourceReport = $reportId, o.contributedBy = 'klarbefund-app'
     MERGE (p)-[:HAS_OBSERVATION]->(o)
     RETURN count(o) AS stored`,
    input,
  );
  return result[0]?.stored ?? 0;
}

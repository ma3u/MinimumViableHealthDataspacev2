import { runQuery } from "@/lib/neo4j";

/**
 * Weekly device values the Klarbefund app sends into the patient's own
 * record (ADR-057): the four series its Trends screen shows, read from
 * Apple Health, one mean per metric and week. Never a single day's value
 * or a raw sample: a week is the finest grain that leaves the phone.
 *
 * The app sends a FHIR R4 Bundle of Observations. Each must be exactly one
 * of the four metrics below, with its LOINC code and UCUM unit, a plausible
 * value and an `effectivePeriod` of at most a week; anything else is
 * reported back as skipped. Each sync replaces the previous one, so the
 * record holds the series once, as the phone last saw it.
 */

const LOINC = "http://loinc.org";
const UCUM = "http://unitsofmeasure.org";
const SOURCE_REPORT = "apple-health-weekly";
export const SOURCE_KIND = "device-weekly-mean";
/** Four metrics over two years of weeks, with room to spare. */
export const MAX_WEARABLE_OBSERVATIONS = 1000;

/** The metrics the app may send: LOINC code, UCUM unit, plausible range. */
export const WEARABLE_METRICS: Record<
  string,
  {
    display: string;
    unit: string;
    category: "vital-signs" | "activity";
    min: number;
    max: number;
  }
> = {
  "40443-4": {
    display: "Resting heart rate",
    unit: "/min",
    category: "vital-signs",
    min: 20,
    max: 250,
  },
  "80404-7": {
    display: "Heart rate variability (SDNN)",
    unit: "ms",
    category: "vital-signs",
    min: 1,
    max: 500,
  },
  "41950-7": {
    display: "Steps per day",
    unit: "/d",
    category: "activity",
    min: 0,
    max: 100_000,
  },
  "29463-7": {
    display: "Body weight",
    unit: "kg",
    category: "vital-signs",
    min: 2,
    max: 400,
  },
};

export interface WearableRow {
  resourceId: string;
  code: string;
  display: string;
  value: number;
  unit: string;
  start: string;
  end: string;
  category: string;
  devices: string | null;
}

type Json = Record<string, unknown>;
const obj = (v: unknown): Json =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : {};
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string | null => (typeof v === "string" ? v : null);
const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

const DAY = 86_400_000;

/** The week's Observations as rows to store. Throws on a body that is not a Bundle. */
export function parseWearableBundle(
  body: unknown,
  patientId: string,
): { rows: WearableRow[]; skipped: { id: string; reason: string }[] } {
  const bundle = obj(body);
  if (bundle.resourceType !== "Bundle") {
    throw new Error("the body is not a FHIR Bundle");
  }
  const rows: WearableRow[] = [];
  const skipped: { id: string; reason: string }[] = [];
  const seen = new Set<string>();
  arr(bundle.entry)
    .map((e) => obj(obj(e).resource))
    .filter((r) => r.resourceType === "Observation")
    .forEach((r, index) => {
      const id = str(r.id) ?? `#${index + 1}`;
      const refuse = (reason: string) => skipped.push({ id, reason });
      if (r.status !== "final") {
        return refuse("a device value is sent as final");
      }
      const loinc = arr(obj(r.code).coding)
        .map(obj)
        .find((c) => c.system === LOINC && str(c.code));
      const code = loinc ? str(loinc.code)! : null;
      const metric = code ? WEARABLE_METRICS[code] : undefined;
      if (!code || !metric) {
        return refuse("not one of the four device metrics");
      }
      const quantity = obj(r.valueQuantity);
      const value = num(quantity.value);
      const unit = str(quantity.code);
      if (value === null || quantity.system !== UCUM || unit !== metric.unit) {
        return refuse(`a number in ${metric.unit} (UCUM) is required`);
      }
      if (value < metric.min || value > metric.max) {
        return refuse("the value is not plausible");
      }
      const period = obj(r.effectivePeriod);
      const start = str(period.start);
      const end = str(period.end);
      const from = start ? Date.parse(start) : NaN;
      const to = end ? Date.parse(end) : NaN;
      if (Number.isNaN(from) || Number.isNaN(to) || to < from) {
        return refuse("a week (effectivePeriod start and end) is required");
      }
      if (to - from > 8 * DAY) {
        return refuse("a period longer than a week");
      }
      const key = `${code}-${start!.slice(0, 10)}`;
      if (seen.has(key)) return refuse("the same metric and week twice");
      seen.add(key);
      const devices = arr(r.device ? [r.device] : [])
        .map((d) => str(obj(d).display))
        .filter(Boolean)
        .join(", ");
      rows.push({
        resourceId: `${patientId}-wear-${key}`,
        code,
        display: metric.display,
        value,
        unit,
        start: start!,
        end: end!,
        category: metric.category,
        devices: devices || null,
      });
    });
  return { rows, skipped };
}

/**
 * Replaces the patient's device series with these rows. Never touches a
 * record that is not a sandbox, and never the patient's other values.
 */
export async function storeWearableRows(input: {
  patientId: string;
  rows: WearableRow[];
}): Promise<number> {
  const result = await runQuery<{ stored: number }>(
    `MATCH (p:Patient {id: $patientId, sandbox: true})
     OPTIONAL MATCH (p)-[:HAS_OBSERVATION]->(old:Observation {sourceReport: $source})
     WITH p, collect(old) AS previous
     FOREACH (n IN previous | DETACH DELETE n)
     WITH p
     UNWIND $rows AS r
     MERGE (o:Observation {resourceId: r.resourceId})
       ON CREATE SET o.createdAt = datetime()
     SET o.code = r.code, o.display = r.display, o.valueQuantity = r.value,
         o.unit = r.unit, o.effectiveStart = r.start, o.effectiveDate = r.end,
         o.category = r.category, o.status = 'final',
         o.sourceKind = $kind, o.performer = r.devices,
         o.sourceReport = $source, o.contributedBy = 'klarbefund-app'
     MERGE (p)-[:HAS_OBSERVATION]->(o)
     RETURN count(o) AS stored`,
    { ...input, source: SOURCE_REPORT, kind: SOURCE_KIND },
  );
  return result[0]?.stored ?? 0;
}

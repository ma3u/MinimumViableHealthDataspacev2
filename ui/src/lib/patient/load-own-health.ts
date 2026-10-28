import { runQuery } from "@/lib/neo4j";
import { SOURCE_KIND as DEVICE_KIND } from "@/lib/patient/app-wearables";
import type { OwnHealth, OwnSeries } from "@/lib/patient/own-health";

interface Row {
  kind: "device" | "lab" | null;
  code: string | null;
  display: string | null;
  unit: string | null;
  date: string | null;
  value: number | null;
}

/**
 * The values the Klarbefund app put into a record it created, grouped into
 * series. Null for any other record: a demo persona's record is synthetic
 * and keeps the illustrative cards. Only the patient's own record reaches
 * this (GET /api/patient, own-record branch).
 */
export async function loadOwnHealth(
  patientId: string,
): Promise<OwnHealth | null> {
  const rows = await runQuery<Row>(
    `MATCH (p:Patient {id: $patientId, sandbox: true})
     OPTIONAL MATCH (p)-[:HAS_OBSERVATION]->(o:Observation {contributedBy: 'klarbefund-app'})
     WHERE o.code IS NOT NULL AND toFloat(o.valueQuantity) IS NOT NULL
     RETURN CASE WHEN o IS NULL THEN null
                 WHEN o.sourceKind = $deviceKind THEN 'device'
                 ELSE 'lab' END                              AS kind,
            o.code                                           AS code,
            coalesce(o.display, o.code)                      AS display,
            coalesce(o.unit, '')                             AS unit,
            toString(coalesce(o.effectiveDate, o.effectiveStart)) AS date,
            toFloat(o.valueQuantity)                         AS value
     ORDER BY date`,
    { patientId, deviceKind: DEVICE_KIND },
  );
  // No row at all: not a record the app created.
  if (rows.length === 0) return null;

  const series = new Map<string, OwnSeries & { kind: "device" | "lab" }>();
  for (const r of rows) {
    if (!r.kind || !r.code || r.value === null || !r.date) continue;
    const key = `${r.kind}|${r.code}|${r.unit}`;
    let s = series.get(key);
    if (!s) {
      s = {
        kind: r.kind,
        code: r.code,
        display: r.display ?? r.code,
        unit: r.unit ?? "",
        points: [],
      };
      series.set(key, s);
    }
    s.points.push({ date: r.date, value: r.value });
  }
  const all = [...series.values()];
  const strip = ({ kind: _kind, ...s }: OwnSeries & { kind: string }) => s;
  return {
    devices: all.filter((s) => s.kind === "device").map(strip),
    labs: all.filter((s) => s.kind === "lab").map(strip),
  };
}

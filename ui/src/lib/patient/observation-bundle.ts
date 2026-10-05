import { runQuery } from "@/lib/neo4j";
import {
  rowsToBundle,
  type FhirBundle,
  type ObservationRow,
} from "@/lib/overview/observations";

/**
 * One patient's Observations as a FHIR R4 searchset Bundle, each with the
 * range the laboratory printed. Shared by `/api/patient/observations` (a
 * session) and `/api/patient/app/record` (the Klarbefund app, #473), so the
 * phone and the browser read the record the same way.
 *
 * Null when there is no such patient. Throws when Neo4j does; the routes
 * answer that with 502.
 */
export async function loadObservationBundle(
  patientId: string,
  selfUrl: string,
  code: string | null = null,
): Promise<FhirBundle | null> {
  const [patientRows, rows] = await Promise.all([
    runQuery<{ id: string; name: string; sandbox: boolean | null }>(
      `MATCH (p:Patient)
       WHERE coalesce(p.id, p.resourceId, elementId(p)) = $patientId
       RETURN coalesce(p.id, p.resourceId, elementId(p)) AS id,
              coalesce(p.name, 'Anonymous') AS name,
              p.sandbox AS sandbox
       LIMIT 1`,
      { patientId },
    ),
    runQuery<ObservationRow>(
      `MATCH (p:Patient)-[:HAS_OBSERVATION]->(o:Observation)
       WHERE coalesce(p.id, p.resourceId, elementId(p)) = $patientId
         AND o.valueQuantity IS NOT NULL
         AND ($code IS NULL OR o.code = $code)
       RETURN coalesce(o.resourceId, elementId(o)) AS id,
              coalesce(o.code, '') AS code,
              coalesce(o.display, o.name, o.code, 'Unknown') AS display,
              toFloat(o.valueQuantity) AS value,
              coalesce(o.unit, o.valueUnit, '') AS unit,
              o.referenceLow AS low,
              o.referenceHigh AS high,
              o.referenceText AS rangeText,
              o.category AS category,
              coalesce(toString(o.effectiveDate), o.dateTime, '') AS effective,
              o.performer AS performer,
              o.status AS status,
              o.sourceKind AS sourceKind
       ORDER BY code, effective
       LIMIT 2000`,
      { patientId, code },
    ),
  ]);
  if (patientRows.length === 0) return null;
  return rowsToBundle(
    rows.filter((r) => r.code && Number.isFinite(r.value)),
    patientRows[0],
    selfUrl,
  );
}

import { NextResponse } from "next/server";
import { runQuery } from "@/lib/neo4j";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const patientId = searchParams.get("patientId") ?? "";

  // List mode: return all patients + cohort stats
  if (!patientId) {
    const [patients, stats] = await Promise.all([
      runQuery<{ id: string; name: string; gender: string; birthDate: string }>(
        `MATCH (p:Patient)
         WHERE coalesce(p.id, p.resourceId) IS NOT NULL
         RETURN coalesce(p.id, p.resourceId) AS id,
                p.name      AS name,
                p.gender    AS gender,
                p.birthDate AS birthDate
         ORDER BY p.name
         LIMIT 200`,
      ),
      runQuery<{
        patients: number;
        encounters: number;
        conditions: number;
        observations: number;
        medications: number;
        procedures: number;
      }>(
        `MATCH (p:Patient)   WITH count(p) AS patients
         MATCH (e:Encounter)  WITH patients, count(e) AS encounters
         MATCH (c:Condition)  WITH patients, encounters, count(c) AS conditions
         MATCH (o:Observation) WITH patients, encounters, conditions, count(o) AS observations
         MATCH (m:MedicationRequest) WITH patients, encounters, conditions, observations, count(m) AS medications
         OPTIONAL MATCH (pr:Procedure)
         RETURN patients, encounters, conditions, observations, medications, count(pr) AS procedures`,
      ),
    ]);
    return NextResponse.json({ patients, stats: stats[0] ?? {}, timeline: [] });
  }

  // Timeline mode: FHIR clinical events + OMOP mappings for one patient
  const rows = await runQuery<{
    fhirType: string;
    fhirId: string;
    date: string;
    display: string;
    omopType: string;
    omopId: string;
  }>(
    `MATCH (p:Patient)
     WHERE coalesce(p.id, p.resourceId) = $patientId
     MATCH (p)-[:HAS_ENCOUNTER|HAS_CONDITION|HAS_OBSERVATION|HAS_MEDICATION|HAS_PROCEDURE]->(fhir)
     OPTIONAL MATCH (fhir)-[:MAPPED_TO]->(omop)
     RETURN labels(fhir)[0]                                   AS fhirType,
            fhir.id                                           AS fhirId,
            coalesce(fhir.date, fhir.onsetDate, fhir.dateTime, fhir.performedStart) AS date,
            coalesce(fhir.display, fhir.code)                 AS display,
            labels(omop)[0]                                   AS omopType,
            omop.id                                           AS omopId
     ORDER BY date`,
    { patientId },
  );

  return NextResponse.json({ timeline: rows });
}

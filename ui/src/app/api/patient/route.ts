import { NextResponse } from "next/server";
import { runQuery } from "@/lib/neo4j";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const patientId = searchParams.get("patientId") ?? "";

  // FHIR encounters + conditions + OMOP mappings for timeline
  const rows = await runQuery<{
    fhirType: string;
    fhirId: string;
    date: string;
    omopType: string;
    omopId: string;
  }>(
    `MATCH (p:Patient {id: $patientId})-[:HAS_ENCOUNTER|HAS_CONDITION|HAS_OBSERVATION|HAS_MEDICATION]->(fhir)
     OPTIONAL MATCH (fhir)-[:MAPS_TO]->(omop)
     RETURN labels(fhir)[0] AS fhirType,
            fhir.id AS fhirId,
            coalesce(fhir.date, fhir.onsetDate, fhir.dateTime) AS date,
            labels(omop)[0] AS omopType,
            omop.id AS omopId
     ORDER BY date`,
    { patientId },
  );

  // Also return list of available patient ids if none specified
  if (!patientId) {
    const patients = await runQuery<{ id: string; name: string }>(
      `MATCH (p:Patient) RETURN p.id AS id, p.name AS name LIMIT 50`,
    );
    return NextResponse.json({ patients, timeline: [] });
  }

  return NextResponse.json({ timeline: rows });
}

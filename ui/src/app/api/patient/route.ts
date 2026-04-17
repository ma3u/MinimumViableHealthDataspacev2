import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { runQuery } from "@/lib/neo4j";

export const dynamic = "force-dynamic";

/**
 * Maps demo patient usernames to their assigned FHIR Patient resource IDs.
 * In production this would come from an identity provider claim or mapping table.
 * patient1 = first Synthea patient (AlphaKlinik Berlin)
 * patient2 = second Synthea patient (Limburg Medical Centre)
 */
const PATIENT_RESOURCE_MAP: Record<string, number> = {
  patient1: 0, // first patient by name order
  patient2: 1, // second patient by name order
};

/**
 * Sensitive clinical entries that should not appear in a patient-facing EHR view.
 * Synthea generates death certificates, autopsy, and hospice entries for deceased
 * patients — these are inappropriate for patient self-service portals.
 * Researchers and admins see unfiltered data via /analytics or /graph.
 */
const FILTERED_DISPLAYS = [
  "cause of death",
  "death certification",
  "certificate of death",
  "autopsy",
  "hospice",
  "sudden cardiac death",
] as const;

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const patientId = searchParams.get("patientId") ?? "";

    // Check session for PATIENT role restriction
    const session = await getServerSession(authOptions);
    const roles = (session as { roles?: string[] } | null)?.roles ?? [];
    const username = session?.user?.name ?? "";
    const isPatientRole =
      roles.includes("PATIENT") && !roles.includes("EDC_ADMIN");

    // List mode: return patients + cohort stats
    if (!patientId) {
      if (isPatientRole) {
        // PATIENT role: only return their own record (EHDS Art. 3 / GDPR Art. 15)
        const patientIndex = PATIENT_RESOURCE_MAP[username] ?? 0;
        const allPatients = await runQuery<{
          id: string;
          name: string;
          gender: string;
          birthDate: string;
        }>(
          `MATCH (p:Patient)
           WHERE coalesce(p.id, p.resourceId) IS NOT NULL
           RETURN coalesce(p.id, p.resourceId) AS id,
                  p.name      AS name,
                  p.gender    AS gender,
                  p.birthDate AS birthDate
           ORDER BY p.name
           LIMIT 200`,
        );
        // Pick only the patient's own record
        const myPatient =
          patientIndex < allPatients.length
            ? [allPatients[patientIndex]]
            : allPatients.slice(0, 1);
        // Stats for just this patient
        const myId = myPatient[0]?.id;
        const myStats = myId
          ? await runQuery<{
              encounters: number;
              conditions: number;
              observations: number;
              medications: number;
              procedures: number;
            }>(
              `MATCH (p:Patient) WHERE coalesce(p.id, p.resourceId) = $myId
               OPTIONAL MATCH (p)-[:HAS_ENCOUNTER]->(e:Encounter)
               WITH p, count(e) AS encounters
               OPTIONAL MATCH (p)-[:HAS_CONDITION]->(c:Condition)
               WITH p, encounters, count(c) AS conditions
               OPTIONAL MATCH (p)-[:HAS_OBSERVATION]->(o:Observation)
               WITH p, encounters, conditions, count(o) AS observations
               OPTIONAL MATCH (p)-[:HAS_MEDICATION|HAS_MEDICATION_REQUEST]->(m:MedicationRequest)
               WITH p, encounters, conditions, observations, count(m) AS medications
               OPTIONAL MATCH (p)-[:HAS_PROCEDURE]->(pr:Procedure)
               RETURN encounters, conditions, observations, medications, count(pr) AS procedures`,
              { myId },
            )
          : [];
        return NextResponse.json({
          patients: myPatient,
          stats: {
            patients: 1,
            ...(myStats[0] ?? {
              encounters: 0,
              conditions: 0,
              observations: 0,
              medications: 0,
              procedures: 0,
            }),
          },
          timeline: [],
          restricted: true, // signal to the UI that patient selector should be hidden
        });
      }

      // Non-patient roles: return all patients + full cohort stats
      const [patients, stats] = await Promise.all([
        runQuery<{
          id: string;
          name: string;
          gender: string;
          birthDate: string;
        }>(
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
           OPTIONAL MATCH (m:MedicationRequest) WITH patients, encounters, conditions, observations, count(m) AS medications
           OPTIONAL MATCH (pr:Procedure)
           RETURN patients, encounters, conditions, observations, medications, count(pr) AS procedures`,
        ),
      ]);
      return NextResponse.json({
        patients,
        stats: stats[0] ?? {},
        timeline: [],
        restricted: false,
      });
    }

    // Timeline mode: FHIR clinical events + OMOP mappings for one patient
    // If PATIENT role, verify they're requesting their own record
    if (isPatientRole) {
      const patientIndex = PATIENT_RESOURCE_MAP[username] ?? 0;
      const allPatients = await runQuery<{ id: string }>(
        `MATCH (p:Patient)
         WHERE coalesce(p.id, p.resourceId) IS NOT NULL
         RETURN coalesce(p.id, p.resourceId) AS id
         ORDER BY p.name LIMIT 200`,
      );
      const myId =
        patientIndex < allPatients.length
          ? allPatients[patientIndex].id
          : allPatients[0]?.id;
      if (patientId !== myId) {
        return NextResponse.json(
          { error: "Access denied — you can only view your own health data" },
          { status: 403 },
        );
      }
    }

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
       MATCH (p)-[:HAS_ENCOUNTER|HAS_CONDITION|HAS_OBSERVATION|HAS_MEDICATION|HAS_MEDICATION_REQUEST|HAS_PROCEDURE]->(fhir)
       OPTIONAL MATCH (fhir)-[:MAPPED_TO]->(omop)
       RETURN labels(fhir)[0]                                                          AS fhirType,
              coalesce(fhir.id, fhir.resourceId)                                       AS fhirId,
              coalesce(fhir.date, fhir.onsetDate, fhir.dateTime, fhir.performedStart)  AS date,
              coalesce(fhir.display, fhir.name, fhir.code)                             AS display,
              labels(omop)[0]                                                          AS omopType,
              coalesce(omop.id, omop.personId, omop.visitOccurrenceId,
                       omop.conditionOccurrenceId, omop.measurementId,
                       omop.drugExposureId)                                            AS omopId
       ORDER BY date`,
      { patientId },
    );

    // Filter out sensitive end-of-life entries (death certificates, hospice, autopsy)
    // that Synthea generates for deceased synthetic patients.
    // These are inappropriate for patient-facing EHR views.
    const filtered = rows.filter((row) => {
      if (!row.display) return true;
      const lower = row.display.toLowerCase();
      return !FILTERED_DISPLAYS.some((term) => lower.includes(term));
    });

    return NextResponse.json({ timeline: filtered });
  } catch (err) {
    console.error("GET /api/patient error:", err);
    return NextResponse.json({ error: "Neo4j unavailable" }, { status: 502 });
  }
}

import { NextResponse } from "next/server";
import { runQuery } from "@/lib/neo4j";

export const dynamic = "force-dynamic";

/**
 * GET /api/patient/profile?patientId=<id>
 *
 * GDPR Art. 15 / EHDS Art. 3 — Patient right to access own health data.
 * Returns patient demographics, conditions, medications, and computed
 * risk scores derived from FHIR clinical events.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const patientId = searchParams.get("patientId");

  if (!patientId) {
    // List mode — return top 20 patients for demo
    const patients = await runQuery<{
      id: string;
      name: string;
      gender: string;
      birthDate: string;
      conditionCount: number;
    }>(
      `MATCH (p:Patient)
       OPTIONAL MATCH (p)-[:HAS_CONDITION]->(c:Condition)
       RETURN coalesce(p.id, p.resourceId, elementId(p)) AS id,
              coalesce(p.name, 'Anonymous') AS name,
              coalesce(p.gender, 'unknown') AS gender,
              coalesce(p.birthDate, '') AS birthDate,
              count(c) AS conditionCount
       ORDER BY conditionCount DESC
       LIMIT 20`,
    );
    return NextResponse.json({ patients });
  }

  // Profile mode — full health profile for one patient
  const [patientRows, conditionRows, medicationRows, observationRows] =
    await Promise.all([
      runQuery<{
        id: string;
        name: string;
        gender: string;
        birthDate: string;
      }>(
        `MATCH (p:Patient)
         WHERE coalesce(p.id, p.resourceId, elementId(p)) = $patientId
         RETURN coalesce(p.id, p.resourceId, elementId(p)) AS id,
                coalesce(p.name, 'Anonymous') AS name,
                coalesce(p.gender, 'unknown') AS gender,
                coalesce(p.birthDate, '') AS birthDate
         LIMIT 1`,
        { patientId },
      ),
      runQuery<{ code: string; display: string; onsetDate: string }>(
        `MATCH (p:Patient)-[:HAS_CONDITION]->(c:Condition)
         WHERE coalesce(p.id, p.resourceId, elementId(p)) = $patientId
         RETURN coalesce(c.code, '') AS code,
                coalesce(c.display, c.code, 'Unknown') AS display,
                coalesce(c.onsetDate, c.date, '') AS onsetDate
         ORDER BY c.onsetDate DESC
         LIMIT 20`,
        { patientId },
      ),
      runQuery<{ code: string; display: string }>(
        `MATCH (p:Patient)-[:HAS_MEDICATION_REQUEST]->(m:MedicationRequest)
         WHERE coalesce(p.id, p.resourceId, elementId(p)) = $patientId
         RETURN coalesce(m.medicationCode, '') AS code,
                coalesce(m.medicationDisplay, m.medicationCode, 'Unknown') AS display
         LIMIT 10`,
        { patientId },
      ),
      runQuery<{ code: string; display: string; value: string; unit: string }>(
        `MATCH (p:Patient)-[:HAS_OBSERVATION]->(o:Observation)
         WHERE coalesce(p.id, p.resourceId, elementId(p)) = $patientId
           AND o.category = 'laboratory'
         RETURN coalesce(o.code, '') AS code,
                coalesce(o.display, o.code, 'Unknown') AS display,
                coalesce(toString(o.valueQuantity), '') AS value,
                coalesce(o.unit, '') AS unit
         LIMIT 10`,
        { patientId },
      ),
    ]);

  if (patientRows.length === 0) {
    return NextResponse.json({ error: "Patient not found" }, { status: 404 });
  }

  const patient = patientRows[0];

  // Compute simple risk scores from conditions (clinical rule-based approach)
  const conditionCodes = conditionRows.map((c) => c.code.toLowerCase());
  const conditionDisplays = conditionRows.map((c) => c.display.toLowerCase());

  const hasCardioCondition = conditionCodes.some(
    (c) =>
      c.includes("410.9") || // AMI ICD-9
      c.includes("i21") || // AMI ICD-10
      c.includes("i10") || // Hypertension ICD-10
      c.includes("414") || // CAD ICD-9
      c.startsWith("z82.49"), // Family history CVD
  );
  const hasDiabetes = conditionCodes.some(
    (c) => c.includes("e11") || c.includes("250.") || c.includes("73211009"),
  );
  const hasHypertension =
    conditionDisplays.some(
      (d) => d.includes("hypertension") || d.includes("blood pressure"),
    ) || conditionCodes.some((c) => c.includes("i10"));

  const cardiovascularScore = Math.min(
    1,
    (hasCardioCondition ? 0.4 : 0) +
      (hasDiabetes ? 0.2 : 0) +
      (hasHypertension ? 0.2 : 0) +
      (conditionRows.length > 5 ? 0.1 : 0),
  );

  const diabetesScore = Math.min(
    1,
    (hasDiabetes ? 0.6 : 0) + (conditionRows.length > 3 ? 0.1 : 0),
  );

  const riskLevel = (score: number) =>
    score >= 0.5 ? "high" : score >= 0.25 ? "moderate" : "low";

  // Interests derived from conditions
  const interests: string[] = ["preventive-care"];
  if (hasCardioCondition || hasHypertension) interests.push("cardiology");
  if (hasDiabetes) interests.push("endocrinology");
  if (conditionRows.length > 5) interests.push("chronic-disease-management");
  interests.push("longevity");

  return NextResponse.json({
    patient,
    conditions: conditionRows,
    medications: medicationRows,
    observations: observationRows,
    riskScores: {
      cardiovascular: {
        score: Math.round(cardiovascularScore * 100) / 100,
        level: riskLevel(cardiovascularScore),
        factors: [
          hasCardioCondition && "cardiovascular disease history",
          hasDiabetes && "diabetes",
          hasHypertension && "hypertension",
        ].filter(Boolean),
      },
      diabetes: {
        score: Math.round(diabetesScore * 100) / 100,
        level: riskLevel(diabetesScore),
        factors: [hasDiabetes && "diabetes mellitus diagnosis"].filter(Boolean),
      },
    },
    interests,
    gdprRights: {
      rightToAccess: "GDPR Art. 15",
      rightToPortability: "GDPR Art. 20",
      rightToRectification: "GDPR Art. 16",
      ehdsAccess: "EHDS Art. 3",
    },
  });
}

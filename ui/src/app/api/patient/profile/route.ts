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
  const [
    patientRows,
    conditionRows,
    medicationRows,
    observationRows,
    totalCountRows,
  ] = await Promise.all([
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
    runQuery<{ total: number }>(
      `MATCH (p:Patient)-[:HAS_CONDITION]->(c:Condition)
         WHERE coalesce(p.id, p.resourceId, elementId(p)) = $patientId
         RETURN count(c) AS total`,
      { patientId },
    ),
  ]);

  if (patientRows.length === 0) {
    return NextResponse.json({ error: "Patient not found" }, { status: 404 });
  }

  const patient = patientRows[0];

  // Compute risk scores: ICD codes + SNOMED codes + social determinants of health
  const conditionCodes = conditionRows.map((c) => c.code.toLowerCase());
  const conditionDisplays = conditionRows.map((c) => c.display.toLowerCase());
  const totalConditionCount = totalCountRows[0]?.total ?? conditionRows.length;

  const has = (codes: string[], terms: string[]) =>
    codes.some((c) => terms.some((t) => c.includes(t))) ||
    conditionDisplays.some((d) => terms.some((t) => d.includes(t)));

  const hasCardioCondition = has(conditionCodes, [
    "i21",
    "i10",
    "410.",
    "414.",
    "z82.49",
    "38341003",
    "53741008",
    "44054006",
  ]);
  const hasDiabetes = has(conditionCodes, [
    "e11",
    "250.",
    "73211009",
    "44054006",
  ]);
  const hasHypertension = has(conditionCodes, [
    "i10",
    "38341003",
    "hypertension",
    "blood pressure",
  ]);
  const hasObesity = has(conditionCodes, [
    "e66",
    "obesity",
    "overweight",
    "bmi",
  ]);
  const hasAtrial = has(conditionCodes, ["i48", "atrial", "fibrillation"]);
  const hasSmoking = has(conditionCodes, [
    "tobacco",
    "smoke",
    "nicotine",
    "f17",
  ]);
  // Social determinants — clinically validated cardiovascular risk amplifiers
  const hasStress = has(conditionCodes, [
    "73595000",
    "stress",
    "anxiety",
    "f41",
  ]);
  const hasSocialIsolation = has(conditionCodes, [
    "423315002",
    "social contact",
    "isolation",
    "lonely",
  ]);
  const hasAdverseEvents = has(conditionCodes, [
    "706893006",
    "abuse",
    "violence",
    "trauma",
    "victim",
  ]);
  const hasUnemployment = has(conditionCodes, [
    "73438004",
    "unemployed",
    "employment",
  ]);
  const hasDepression = has(conditionCodes, [
    "f32",
    "f33",
    "depression",
    "depressive",
  ]);

  // SDOH risk contribution (evidence-based: each adds 10-15% CVD risk)
  const sdohScore =
    (hasStress ? 0.15 : 0) +
    (hasSocialIsolation ? 0.1 : 0) +
    (hasAdverseEvents ? 0.12 : 0) +
    (hasUnemployment ? 0.08 : 0) +
    (hasDepression ? 0.1 : 0);

  // Condition burden: high count signals multimorbidity
  const burdenScore =
    totalConditionCount >= 20
      ? 0.2
      : totalConditionCount >= 10
        ? 0.15
        : totalConditionCount >= 5
          ? 0.1
          : 0.05;

  const cardiovascularScore = Math.min(
    1,
    (hasCardioCondition ? 0.4 : 0) +
      (hasDiabetes ? 0.2 : 0) +
      (hasHypertension ? 0.2 : 0) +
      (hasAtrial ? 0.2 : 0) +
      (hasObesity ? 0.1 : 0) +
      (hasSmoking ? 0.15 : 0) +
      sdohScore +
      burdenScore,
  );

  const diabetesScore = Math.min(
    1,
    (hasDiabetes ? 0.6 : 0) +
      (hasObesity ? 0.2 : 0) +
      (hasSmoking ? 0.1 : 0) +
      burdenScore,
  );

  const riskLevel = (score: number) =>
    score >= 0.5 ? "high" : score >= 0.25 ? "moderate" : "low";

  // Interests derived from conditions
  const interests: string[] = ["preventive-care"];
  if (hasCardioCondition || hasHypertension) interests.push("cardiology");
  if (hasDiabetes) interests.push("endocrinology");
  if (totalConditionCount > 5) interests.push("chronic-disease-management");
  if (hasStress || hasDepression) interests.push("mental-health");
  interests.push("longevity");

  return NextResponse.json({
    patient,
    conditions: conditionRows,
    medications: medicationRows,
    observations: observationRows,
    totalConditionCount,
    riskScores: {
      cardiovascular: {
        score: Math.round(cardiovascularScore * 100) / 100,
        level: riskLevel(cardiovascularScore),
        factors: [
          hasCardioCondition && "cardiovascular disease history",
          hasDiabetes && "diabetes",
          hasHypertension && "hypertension",
          hasAtrial && "atrial fibrillation",
          hasObesity && "obesity",
          hasSmoking && "smoking",
          hasStress && "chronic stress (SDOH)",
          hasSocialIsolation && "social isolation (SDOH)",
          hasAdverseEvents && "adverse life events (SDOH)",
          hasUnemployment && "unemployment (SDOH)",
          hasDepression && "depression",
        ].filter(Boolean),
      },
      diabetes: {
        score: Math.round(diabetesScore * 100) / 100,
        level: riskLevel(diabetesScore),
        factors: [
          hasDiabetes && "diabetes mellitus diagnosis",
          hasObesity && "obesity",
          hasSmoking && "smoking",
        ].filter(Boolean),
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

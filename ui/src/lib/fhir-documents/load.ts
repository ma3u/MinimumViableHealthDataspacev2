import { runQuery } from "@/lib/neo4j";
import type { DocumentPatient, Run } from "./shared";
import {
  groupLabReports,
  type LabObservationRow,
  type LabReportInput,
} from "./lab-report";
import type {
  AllergyRow,
  ConditionRow,
  ImmunizationRow,
  MedicationRow,
  PatientSummaryInput,
  ProcedureRow,
} from "./patient-summary";

/**
 * The graph reads behind the two documents (#1171). Primary use only: a
 * person's own record, read for that person or for the holder treating them.
 * Nothing here runs in a secondary-use session; research reads go through
 * the proxy, which drops Art. 71 opt-outs (ADR-062).
 *
 * The seeds disagree on property names (`id` or `resourceId`, `status` or
 * `clinicalStatus`, `date` or `effectiveDate`); each query coalesces them, as
 * `loadObservationBundle` does.
 */

const PATIENT_MATCH = `MATCH (p:Patient)
       WHERE coalesce(p.id, p.resourceId, elementId(p)) = $patientId`;

export async function loadDocumentPatient(
  patientId: string,
  run: Run = runQuery,
): Promise<DocumentPatient | null> {
  const rows = await run<DocumentPatient>(
    `${PATIENT_MATCH}
     RETURN coalesce(p.id, p.resourceId, elementId(p)) AS id,
            p.name AS name,
            p.gender AS gender,
            toString(p.birthDate) AS birthDate
     LIMIT 1`,
    { patientId },
  );
  return rows[0] ?? null;
}

/** Every laboratory report of the record, newest first. */
export async function loadLabReports(
  patientId: string,
  run: Run = runQuery,
): Promise<LabReportInput[]> {
  const rows = await run<LabObservationRow>(
    `${PATIENT_MATCH}
     MATCH (p)-[:HAS_OBSERVATION]->(o:Observation)
     WHERE o.code IS NOT NULL
       AND (
         (o.valueQuantity IS NOT NULL AND coalesce(o.category, 'laboratory') = 'laboratory')
         OR (o.valueQuantity IS NULL AND o.value IS NOT NULL AND o.category = 'laboratory')
       )
     OPTIONAL MATCH (d:DiagnosticReport)-[:HAS_RESULT]->(o)
       WHERE d.category IN ['LAB', 'laboratory']
     WITH o, head(collect(d)) AS d
     RETURN coalesce(o.resourceId, o.id, elementId(o)) AS id,
            o.code AS code,
            coalesce(o.display, o.name, o.code) AS display,
            toFloat(coalesce(o.valueQuantity, o.value)) AS value,
            coalesce(o.unit, o.valueUnit, '1') AS unit,
            toFloat(o.referenceLow) AS low,
            toFloat(o.referenceHigh) AS high,
            o.referenceText AS rangeText,
            coalesce(o.dateTime, toString(o.effectiveDate), o.date, '') AS effective,
            o.status AS status,
            o.performer AS performer,
            o.sourceKind AS sourceKind,
            o.sourceLine AS sourceLine,
            o.sourceRegion AS sourceRegion,
            o.sourceReport AS sourceReport,
            coalesce(d.resourceId, d.id) AS reportNodeId,
            coalesce(d.name, d.display) AS reportTitle,
            d.issued AS reportIssued,
            d.conclusion AS reportConclusion
     ORDER BY effective, code
     LIMIT 2000`,
    { patientId },
  );
  return groupLabReports(
    rows.filter((r) => r.effective && Number.isFinite(r.value)),
    patientId,
  );
}

export async function loadPatientSummaryInput(
  patientId: string,
  run: Run = runQuery,
): Promise<PatientSummaryInput> {
  const [
    conditions,
    requests,
    statements,
    immunizations,
    procedures,
    allergies,
  ] = await Promise.all([
    run<ConditionRow>(
      `${PATIENT_MATCH}
         MATCH (p)-[:HAS_CONDITION]->(c:Condition)
         RETURN coalesce(c.resourceId, c.id, elementId(c)) AS id,
                c.code AS code,
                coalesce(c.codeSystem, c.system) AS system,
                coalesce(c.display, c.name, c.code, 'Condition') AS display,
                coalesce(c.clinicalStatus, c.status) AS clinicalStatus,
                toString(c.onsetDate) AS onset
         ORDER BY onset, id
         LIMIT 500`,
      { patientId },
    ),
    run<Omit<MedicationRow, "kind" | "dosage" | "reason">>(
      `${PATIENT_MATCH}
         MATCH (p)-[:HAS_MEDICATION_REQUEST|HAS_MEDICATION]->(m:MedicationRequest)
         WITH DISTINCT m
         RETURN coalesce(m.resourceId, m.id, elementId(m)) AS id,
                coalesce(m.medicationCode, m.code) AS code,
                coalesce(m.codeSystem, m.system) AS system,
                coalesce(m.display, m.name, 'Medication') AS display,
                m.status AS status,
                toString(m.date) AS date
         ORDER BY date, id
         LIMIT 500`,
      { patientId },
    ),
    run<Omit<MedicationRow, "kind">>(
      `${PATIENT_MATCH}
         MATCH (p)-[:HAS_MEDICATION_STATEMENT]->(m:MedicationStatement)
         RETURN coalesce(m.resourceId, m.id, elementId(m)) AS id,
                m.medicationCode AS code,
                m.codeSystem AS system,
                coalesce(m.display, m.name, 'Medication') AS display,
                m.status AS status,
                toString(m.effectiveStart) AS date,
                m.dosageText AS dosage,
                m.reason AS reason
         ORDER BY date, id
         LIMIT 500`,
      { patientId },
    ),
    run<ImmunizationRow>(
      `${PATIENT_MATCH}
         MATCH (p)-[:HAS_IMMUNIZATION]->(i:Immunization)
         WHERE i.vaccineCode IS NOT NULL
         RETURN coalesce(i.resourceId, i.id, elementId(i)) AS id,
                i.vaccineCode AS code,
                i.codeSystem AS system,
                coalesce(i.display, i.name, 'Vaccination') AS display,
                i.status AS status,
                toString(i.occurrenceDate) AS occurrence,
                i.lotNumber AS lot,
                i.performer AS performer
         ORDER BY occurrence, id
         LIMIT 500`,
      { patientId },
    ),
    run<ProcedureRow>(
      `${PATIENT_MATCH}
         MATCH (p)-[:HAS_PROCEDURE]->(x:Procedure)
         RETURN coalesce(x.resourceId, x.id, elementId(x)) AS id,
                x.code AS code,
                coalesce(x.codeSystem, x.system) AS system,
                coalesce(x.display, x.name, x.code, 'Procedure') AS display,
                x.status AS status,
                toString(coalesce(x.performedStart, x.performedDate, x.date)) AS performed
         ORDER BY performed, id
         LIMIT 500`,
      { patientId },
    ),
    run<AllergyRow>(
      `${PATIENT_MATCH}
         MATCH (p)-[:HAS_ALLERGY_INTOLERANCE]->(a:AllergyIntolerance)
         RETURN coalesce(a.resourceId, a.id, elementId(a)) AS id,
                a.code AS code,
                coalesce(a.codeSystem, a.system) AS system,
                coalesce(a.display, a.name, a.code, 'Allergy') AS display,
                a.clinicalStatus AS clinicalStatus,
                a.verificationStatus AS verificationStatus,
                a.type AS type,
                a.category AS category,
                a.criticality AS criticality,
                toString(a.onsetDate) AS onset
         ORDER BY onset, id
         LIMIT 500`,
      { patientId },
    ),
  ]);
  return {
    conditions,
    allergies,
    medications: [
      ...statements.map((m) => ({ ...m, kind: "statement" as const })),
      ...requests.map((m) => ({
        ...m,
        kind: "request" as const,
        dosage: null,
        reason: null,
      })),
    ],
    immunizations: immunizations.filter((i) => i.occurrence),
    procedures,
  };
}

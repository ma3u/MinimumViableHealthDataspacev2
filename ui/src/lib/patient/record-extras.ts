import { runQuery } from "@/lib/neo4j";
import type { FhirRecordResource } from "@/lib/overview/observations";

/**
 * The resources a record holds besides laboratory Observations (ADR-059),
 * as FHIR R4: DiagnosticReports with their results (a resting ECG, an imaging
 * report), Immunizations (the vaccination record) and MedicationStatements
 * (the medication plan). `/api/patient/observations?include=all` appends them
 * to the Bundle, so an ePA or EHR integrator receives the whole record in
 * one answer; without `include` the Bundle stays Observations only, which is
 * what the Klarbefund app parses.
 */

interface ReportRow {
  id: string;
  code: string;
  display: string;
  category: string;
  categoryDisplay: string | null;
  status: string | null;
  effective: string;
  issued: string | null;
  performer: string | null;
  conclusion: string | null;
  results: string[];
}

interface ImmunizationRow {
  id: string;
  code: string;
  system: string | null;
  display: string;
  status: string | null;
  occurrence: string;
  lot: string | null;
  performer: string | null;
}

interface MedicationStatementRow {
  id: string;
  code: string;
  system: string | null;
  display: string;
  status: string | null;
  dosage: string | null;
  dose: number | null;
  doseUnit: string | null;
  reason: string | null;
  since: string;
  planId: string | null;
  planPrinted: string | null;
  source: string | null;
}

function coding(code: string, system: string | null, display: string) {
  return {
    coding: [{ system: system ?? undefined, code, display }],
    text: display,
  };
}

export function reportToFhir(r: ReportRow): FhirRecordResource {
  return {
    resourceType: "DiagnosticReport",
    id: r.id,
    status: r.status ?? "final",
    category: [
      {
        coding: [
          {
            system: "http://terminology.hl7.org/CodeSystem/v2-0074",
            code: r.category,
            display: r.categoryDisplay ?? undefined,
          },
        ],
      },
    ],
    code: coding(r.code, "http://loinc.org", r.display),
    effectiveDateTime: r.effective,
    issued: r.issued ?? undefined,
    performer: r.performer ? [{ display: r.performer }] : undefined,
    result: r.results.map((id) => ({ reference: `urn:uuid:${id}` })),
    conclusion: r.conclusion ?? undefined,
  };
}

export function immunizationToFhir(r: ImmunizationRow): FhirRecordResource {
  return {
    resourceType: "Immunization",
    id: r.id,
    status: r.status ?? "completed",
    vaccineCode: coding(r.code, r.system, r.display),
    occurrenceDateTime: r.occurrence,
    lotNumber: r.lot ?? undefined,
    performer: r.performer ? [{ actor: { display: r.performer } }] : undefined,
  };
}

export function medicationStatementToFhir(
  r: MedicationStatementRow,
): FhirRecordResource {
  return {
    resourceType: "MedicationStatement",
    id: r.id,
    status: r.status ?? "active",
    medicationCodeableConcept: coding(r.code, r.system, r.display),
    effectivePeriod: { start: r.since },
    reasonCode: r.reason ? [{ text: r.reason }] : undefined,
    dosage: r.dosage
      ? [
          {
            text: r.dosage,
            doseAndRate:
              r.dose !== null
                ? [
                    {
                      doseQuantity: {
                        value: r.dose,
                        unit: r.doseUnit ?? undefined,
                      },
                    },
                  ]
                : undefined,
          },
        ]
      : undefined,
    identifier: r.planId
      ? [{ system: "urn:klarbefund:medication-plan", value: r.planId }]
      : undefined,
    note: r.source
      ? [
          {
            text: r.planPrinted
              ? `${r.source}, printed ${r.planPrinted}`
              : r.source,
          },
        ]
      : undefined,
  };
}

/** Every non-Observation resource of one record, oldest first per kind. */
export async function loadRecordExtras(
  patientId: string,
): Promise<FhirRecordResource[]> {
  const [reports, immunizations, statements] = await Promise.all([
    runQuery<ReportRow>(
      `MATCH (p:Patient)-[:HAS_DIAGNOSTIC_REPORT]->(d:DiagnosticReport)
       WHERE coalesce(p.id, p.resourceId, elementId(p)) = $patientId
       OPTIONAL MATCH (d)-[:HAS_RESULT]->(o:Observation)
       WITH d, collect(coalesce(o.resourceId, elementId(o))) AS results
       RETURN coalesce(d.resourceId, elementId(d)) AS id,
              coalesce(d.code, '') AS code,
              coalesce(d.display, d.name, d.code, 'Report') AS display,
              coalesce(d.category, 'OTH') AS category,
              d.categoryDisplay AS categoryDisplay,
              d.status AS status,
              coalesce(toString(d.effectiveDate), d.issued, '') AS effective,
              d.issued AS issued,
              d.performer AS performer,
              d.conclusion AS conclusion,
              results
       ORDER BY effective
       LIMIT 200`,
      { patientId },
    ),
    runQuery<ImmunizationRow>(
      `MATCH (p:Patient)-[:HAS_IMMUNIZATION]->(i:Immunization)
       WHERE coalesce(p.id, p.resourceId, elementId(p)) = $patientId
       RETURN coalesce(i.resourceId, elementId(i)) AS id,
              coalesce(i.vaccineCode, '') AS code,
              i.codeSystem AS system,
              coalesce(i.display, i.name, 'Vaccination') AS display,
              i.status AS status,
              coalesce(toString(i.occurrenceDate), '') AS occurrence,
              i.lotNumber AS lot,
              i.performer AS performer
       ORDER BY occurrence
       LIMIT 200`,
      { patientId },
    ),
    runQuery<MedicationStatementRow>(
      `MATCH (p:Patient)-[:HAS_MEDICATION_STATEMENT]->(m:MedicationStatement)
       WHERE coalesce(p.id, p.resourceId, elementId(p)) = $patientId
       RETURN coalesce(m.resourceId, elementId(m)) AS id,
              coalesce(m.medicationCode, '') AS code,
              m.codeSystem AS system,
              coalesce(m.display, m.name, 'Medication') AS display,
              m.status AS status,
              m.dosageText AS dosage,
              m.dose AS dose,
              m.doseUnit AS doseUnit,
              m.reason AS reason,
              coalesce(toString(m.effectiveStart), '') AS since,
              m.planId AS planId,
              toString(m.planPrinted) AS planPrinted,
              m.source AS source
       ORDER BY since
       LIMIT 200`,
      { patientId },
    ),
  ]);
  return [
    ...reports.filter((r) => r.code).map(reportToFhir),
    ...immunizations.filter((r) => r.code).map(immunizationToFhir),
    ...statements.filter((r) => r.code).map(medicationStatementToFhir),
  ];
}

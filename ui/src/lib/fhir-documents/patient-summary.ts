import {
  HUB_ORGANIZATION_NAME,
  LOINC,
  RXNORM,
  SNOMED,
  codeable,
  datePart,
  documentUuid,
  entry,
  graphIdentifier,
  narrative,
  organizationResource,
  patientResource,
  ref,
  type DocumentBundle,
  type DocumentPatient,
  type FhirResource,
  type IdentityView,
} from "./shared";

/**
 * A Patient Summary as an HL7 Europe Patient Summary 1.0.0-ballot document
 * (#1171), from layer 3 of the graph: problems, allergies, medications,
 * immunisations and procedures.
 *
 * The graph holds no allergies and no medical devices: Synthea writes none
 * into what the loader keeps, and no seed adds any. Those sections are there,
 * as the profile requires, empty with the reason `unavailable` ("no
 * information is available"), which is the truth; `nilknown` would claim a
 * clinician looked and found none.
 */

export const EPS_PROFILES = {
  bundle: "http://hl7.eu/fhir/eps/StructureDefinition/bundle-eu-eps",
  composition: "http://hl7.eu/fhir/eps/StructureDefinition/composition-eu-eps",
  patient: "http://hl7.eu/fhir/eps/StructureDefinition/patient-eu-eps",
  condition: "http://hl7.eu/fhir/eps/StructureDefinition/condition-obl-eu-eps",
  medicationStatement:
    "http://hl7.eu/fhir/eps/StructureDefinition/MedicationStatement-eu-eps",
  medicationRequest:
    "http://hl7.eu/fhir/eps/StructureDefinition/medicationrequest-obl-eu-eps",
  immunization:
    "http://hl7.eu/fhir/eps/StructureDefinition/immunization-obl-eu-eps",
  allergy:
    "http://hl7.eu/fhir/eps/StructureDefinition/allergyintolerance-obl-eu-eps",
  procedure: "http://hl7.eu/fhir/eps/StructureDefinition/procedure-eu-eps",
  organization:
    "http://hl7.eu/fhir/eps/StructureDefinition/organization-obl-eu-eps",
} as const;

export const PATIENT_SUMMARY_TYPE = {
  system: LOINC,
  code: "60591-5",
  display: "Patient summary Document",
};

/** The identifier system of a Patient Summary in the hub. */
const PATIENT_SUMMARY_SYSTEM = "https://ehds.mabu.red/fhir/sid/patient-summary";

export interface ConditionRow {
  id: string;
  code: string | null;
  system: string | null;
  display: string;
  clinicalStatus: string | null;
  onset: string | null;
}

export interface MedicationRow {
  id: string;
  /** A prescription (MedicationRequest) or the medication plan (MedicationStatement) */
  kind: "request" | "statement";
  code: string | null;
  system: string | null;
  display: string;
  status: string | null;
  /** When it was prescribed, or since when it is taken */
  date: string | null;
  dosage: string | null;
  reason: string | null;
}

export interface ImmunizationRow {
  id: string;
  code: string;
  system: string | null;
  display: string;
  status: string | null;
  occurrence: string;
  lot: string | null;
  performer: string | null;
}

export interface ProcedureRow {
  id: string;
  code: string | null;
  system: string | null;
  display: string;
  status: string | null;
  performed: string | null;
}

export interface AllergyRow {
  id: string;
  code: string | null;
  system: string | null;
  display: string;
  clinicalStatus: string | null;
  verificationStatus: string | null;
  /** `allergy` or `intolerance` */
  type: string | null;
  /** `food`, `medication`, `environment`, `biologic` */
  category: string | null;
  criticality: string | null;
  onset: string | null;
}

export interface PatientSummaryInput {
  conditions: ConditionRow[];
  /** Absent or empty: the record holds no allergy information. */
  allergies?: AllergyRow[];
  medications: MedicationRow[];
  immunizations: ImmunizationRow[];
  procedures: ProcedureRow[];
}

export interface SummaryDocumentOptions {
  timestamp: string;
  identity: IdentityView;
}

const CONDITION_CLINICAL = new Set([
  "active",
  "recurrence",
  "relapse",
  "inactive",
  "remission",
  "resolved",
]);
const MED_STATEMENT_STATUS = new Set([
  "active",
  "completed",
  "entered-in-error",
  "intended",
  "stopped",
  "on-hold",
  "unknown",
  "not-taken",
]);
const MED_REQUEST_STATUS = new Set([
  "active",
  "on-hold",
  "cancelled",
  "completed",
  "entered-in-error",
  "stopped",
  "draft",
  "unknown",
]);
const EVENT_STATUS = new Set([
  "preparation",
  "in-progress",
  "not-done",
  "on-hold",
  "stopped",
  "completed",
  "entered-in-error",
  "unknown",
]);

const ALLERGY_CLINICAL = new Set(["active", "inactive", "resolved"]);
const ALLERGY_VERIFICATION = new Set([
  "unconfirmed",
  "confirmed",
  "refuted",
  "entered-in-error",
]);
const ALLERGY_CATEGORY = new Set([
  "food",
  "medication",
  "environment",
  "biologic",
]);
const ALLERGY_CRITICALITY = new Set(["low", "high", "unable-to-assess"]);

const pick = (value: string | null, allowed: Set<string>, fallback: string) =>
  value && allowed.has(value) ? value : fallback;

/**
 * Seeds that wrote a code without its system: Synthea's conditions and
 * procedures are SNOMED CT and its medications RxNorm, which is what
 * scripts/load_fhir_neo4j.py read them from.
 */
const systemOr = (
  system: string | null,
  code: string | null,
  fallback: string,
) => system ?? (code ? fallback : null);

const EMPTY_REASON = {
  coding: [
    {
      system: "http://terminology.hl7.org/CodeSystem/list-empty-reason",
      code: "unavailable",
      display: "Unavailable",
    },
  ],
};

interface Section {
  title: string;
  code: string;
  display: string;
  resources: FhirResource[];
  lines: string[];
  /** What the narrative says when the section is empty */
  empty: string;
}

function section(s: Section) {
  return {
    title: s.title,
    code: { coding: [{ system: LOINC, code: s.code, display: s.display }] },
    text: narrative(s.lines, s.empty),
    ...(s.resources.length
      ? { entry: s.resources.map((r) => ref(r)) }
      : { emptyReason: EMPTY_REASON }),
  };
}

export function buildPatientSummaryDocument(
  patient: DocumentPatient,
  input: PatientSummaryInput,
  options: SummaryDocumentOptions,
): DocumentBundle {
  const key = `patient-summary|${patient.id}`;
  const uuid = (part: string) => documentUuid(`${key}|${part}`);
  const patientEntry = patientResource(
    uuid("patient"),
    patient,
    options.identity,
    EPS_PROFILES.patient,
  );
  const subject = ref(patientEntry);
  const hub = organizationResource(
    uuid("author"),
    HUB_ORGANIZATION_NAME,
    EPS_PROFILES.organization,
  );

  const conditions: FhirResource[] = input.conditions.map((c) => ({
    resourceType: "Condition",
    id: uuid(`condition|${c.id}`),
    meta: { profile: [EPS_PROFILES.condition] },
    identifier: [graphIdentifier(c.id)],
    clinicalStatus: {
      coding: [
        {
          system: "http://terminology.hl7.org/CodeSystem/condition-clinical",
          code: pick(c.clinicalStatus, CONDITION_CLINICAL, "active"),
        },
      ],
    },
    category: [
      {
        coding: [
          {
            system: "http://terminology.hl7.org/CodeSystem/condition-category",
            code: "problem-list-item",
            display: "Problem List Item",
          },
        ],
      },
    ],
    code: codeable(c.code, systemOr(c.system, c.code, SNOMED), c.display),
    subject,
    ...(c.onset ? { onsetDateTime: c.onset } : {}),
  }));

  const medications: FhirResource[] = input.medications.map((m) =>
    m.kind === "statement"
      ? {
          resourceType: "MedicationStatement",
          id: uuid(`medication|${m.id}`),
          meta: { profile: [EPS_PROFILES.medicationStatement] },
          identifier: [graphIdentifier(m.id)],
          status: pick(m.status, MED_STATEMENT_STATUS, "unknown"),
          medicationCodeableConcept: codeable(m.code, m.system, m.display),
          subject,
          ...(m.date
            ? { effectivePeriod: { start: m.date } }
            : {
                _effectiveDateTime: {
                  extension: [
                    {
                      url: "http://hl7.org/fhir/StructureDefinition/data-absent-reason",
                      valueCode: "unknown",
                    },
                  ],
                },
              }),
          ...(m.reason ? { reasonCode: [{ text: m.reason }] } : {}),
          ...(m.dosage ? { dosage: [{ text: m.dosage }] } : {}),
        }
      : {
          resourceType: "MedicationRequest",
          id: uuid(`medication|${m.id}`),
          meta: { profile: [EPS_PROFILES.medicationRequest] },
          identifier: [graphIdentifier(m.id)],
          status: pick(m.status, MED_REQUEST_STATUS, "unknown"),
          intent: "order",
          medicationCodeableConcept: codeable(
            m.code,
            systemOr(m.system, m.code, RXNORM),
            m.display,
          ),
          subject,
          // The EU prescription (MPD) wants the date and the prescriber. The
          // graph keeps no prescriber and not always a date, so the document
          // says it does not know, as the FHIR facade does.
          ...(m.date
            ? { authoredOn: m.date }
            : {
                _authoredOn: {
                  extension: [
                    {
                      url: "http://hl7.org/fhir/StructureDefinition/data-absent-reason",
                      valueCode: "unknown",
                    },
                  ],
                },
              }),
          requester: {
            extension: [
              {
                url: "http://hl7.org/fhir/StructureDefinition/data-absent-reason",
                valueCode: "unknown",
              },
            ],
          },
          ...(m.dosage ? { dosageInstruction: [{ text: m.dosage }] } : {}),
        },
  );

  const immunizations: FhirResource[] = input.immunizations.map((i) => ({
    resourceType: "Immunization",
    id: uuid(`immunization|${i.id}`),
    meta: { profile: [EPS_PROFILES.immunization] },
    identifier: [graphIdentifier(i.id)],
    status: i.status === "not-done" ? "not-done" : "completed",
    vaccineCode: codeable(i.code, i.system, i.display),
    patient: subject,
    occurrenceDateTime: i.occurrence,
    ...(i.lot ? { lotNumber: i.lot } : {}),
    ...(i.performer
      ? { performer: [{ actor: { display: i.performer } }] }
      : {}),
  }));

  const allergyRows = input.allergies ?? [];
  const allergies: FhirResource[] = allergyRows.map((a) => ({
    resourceType: "AllergyIntolerance",
    id: uuid(`allergy|${a.id}`),
    meta: { profile: [EPS_PROFILES.allergy] },
    identifier: [graphIdentifier(a.id)],
    clinicalStatus: {
      coding: [
        {
          system:
            "http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical",
          code: pick(a.clinicalStatus, ALLERGY_CLINICAL, "active"),
        },
      ],
    },
    ...(a.verificationStatus && ALLERGY_VERIFICATION.has(a.verificationStatus)
      ? {
          verificationStatus: {
            coding: [
              {
                system:
                  "http://terminology.hl7.org/CodeSystem/allergyintolerance-verification",
                code: a.verificationStatus,
              },
            ],
          },
        }
      : {}),
    ...(a.type === "allergy" || a.type === "intolerance"
      ? { type: a.type }
      : {}),
    ...(a.category && ALLERGY_CATEGORY.has(a.category)
      ? { category: [a.category] }
      : {}),
    ...(a.criticality && ALLERGY_CRITICALITY.has(a.criticality)
      ? { criticality: a.criticality }
      : {}),
    code: codeable(a.code, systemOr(a.system, a.code, SNOMED), a.display),
    patient: subject,
    ...(a.onset ? { onsetDateTime: a.onset } : {}),
  }));

  const procedures: FhirResource[] = input.procedures.map((p) => ({
    resourceType: "Procedure",
    id: uuid(`procedure|${p.id}`),
    meta: { profile: [EPS_PROFILES.procedure] },
    identifier: [graphIdentifier(p.id)],
    status: pick(p.status, EVENT_STATUS, "completed"),
    code: codeable(p.code, systemOr(p.system, p.code, SNOMED), p.display),
    subject,
    ...(p.performed
      ? { performedDateTime: p.performed }
      : {
          _performedDateTime: {
            extension: [
              {
                url: "http://hl7.org/fhir/StructureDefinition/data-absent-reason",
                valueCode: "unknown",
              },
            ],
          },
        }),
  }));

  const since = (d: string | null) =>
    datePart(d) ? `, since ${datePart(d)}` : "";
  const sections = [
    section({
      title: "Problem list",
      code: "11450-4",
      display: "Problem list - Reported",
      resources: conditions,
      lines: input.conditions.map((c) => `${c.display}${since(c.onset)}`),
      empty: "No problems are recorded in this record.",
    }),
    section({
      title: "Allergies and intolerances",
      code: "48765-2",
      display: "Allergies and adverse reactions Document",
      resources: allergies,
      lines: allergyRows.map((a) => `${a.display}${since(a.onset)}`),
      empty:
        "This record holds no information on allergies or intolerances; that is not a statement that there are none.",
    }),
    section({
      title: "Medication summary",
      code: "10160-0",
      display: "History of Medication use Narrative",
      resources: medications,
      lines: input.medications.map(
        (m) => `${m.display}${m.dosage ? ` ${m.dosage}` : ""}${since(m.date)}`,
      ),
      empty: "No medication is recorded in this record.",
    }),
    section({
      title: "Immunizations",
      code: "11369-6",
      display: "History of Immunization Narrative",
      resources: immunizations,
      lines: input.immunizations.map(
        (i) => `${i.display}, ${datePart(i.occurrence) ?? i.occurrence}`,
      ),
      empty: "No immunization is recorded in this record.",
    }),
    section({
      title: "History of procedures",
      code: "47519-4",
      display: "History of Procedures Document",
      resources: procedures,
      lines: input.procedures.map(
        (p) =>
          `${p.display}${
            datePart(p.performed) ? `, ${datePart(p.performed)}` : ""
          }`,
      ),
      empty: "No procedure is recorded in this record.",
    }),
    section({
      title: "Medical devices",
      code: "46264-8",
      display: "History of medical device use",
      resources: [],
      lines: [],
      empty:
        "This record holds no information on medical devices; that is not a statement that there are none.",
    }),
  ];

  const composition: FhirResource = {
    resourceType: "Composition",
    id: uuid("composition"),
    meta: { profile: [EPS_PROFILES.composition] },
    identifier: { system: PATIENT_SUMMARY_SYSTEM, value: patient.id },
    status: "final",
    type: { coding: [PATIENT_SUMMARY_TYPE] },
    subject,
    date: options.timestamp,
    author: [ref(hub, HUB_ORGANIZATION_NAME)],
    title: "Patient Summary",
    custodian: ref(hub, HUB_ORGANIZATION_NAME),
    section: sections,
  };

  const resources = [
    composition,
    patientEntry,
    hub,
    ...conditions,
    ...medications,
    ...immunizations,
    ...procedures,
    ...allergies,
  ];
  return {
    resourceType: "Bundle",
    meta: { profile: [EPS_PROFILES.bundle] },
    identifier: {
      system: "urn:ietf:rfc:3986",
      value: `urn:uuid:${documentUuid(`${key}|${options.timestamp}`)}`,
    },
    type: "document",
    timestamp: options.timestamp,
    entry: resources.map(entry),
  };
}

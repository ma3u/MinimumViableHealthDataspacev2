import {
  EXT_SOURCE_KIND,
  EXT_SOURCE_LINE,
  EXT_SOURCE_REGION,
  HUB_ORGANIZATION_NAME,
  LOINC,
  UCUM,
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
 * A laboratory report as an HL7 Europe Laboratory Report 2.1.0 document
 * (#1171): Composition, Patient, DiagnosticReport, its Observations, the
 * performing laboratory and a Provenance.
 *
 * The resource shapes follow the shared FHIR writer
 * (services/epa-ingest/src/to-fhir.ts and its Swift twin): LOINC codes, UCUM
 * quantities, the range as printed, `preliminary` for a value read off paper,
 * and the same provenance extensions with the page and line the value came
 * from. What a document adds is the Composition, the identifiers and the
 * references between the entries.
 */

export const LAB_PROFILES = {
  bundle: "http://hl7.eu/fhir/laboratory/StructureDefinition/Bundle-eu-lab",
  composition:
    "http://hl7.eu/fhir/laboratory/StructureDefinition/Composition-eu-lab",
  diagnosticReport:
    "http://hl7.eu/fhir/laboratory/StructureDefinition/DiagnosticReport-eu-lab",
  observation:
    "http://hl7.eu/fhir/laboratory/StructureDefinition/Observation-resultslab-eu-lab",
  patient: "http://hl7.eu/fhir/base/StructureDefinition/patient-eu-core",
} as const;

/** The R5 `DiagnosticReport.composition` the lab profile requires. */
const EXT_DR_COMPOSITION =
  "http://hl7.org/fhir/5.0/StructureDefinition/extension-DiagnosticReport.composition";
/** The identifier system of a report in the hub. */
export const LAB_REPORT_SYSTEM = "https://ehds.mabu.red/fhir/sid/lab-report";
/** The Klarbefund report (its UUID) a value was read from. */
export const KLARBEFUND_REPORT_SYSTEM =
  "https://ehds.mabu.red/fhir/sid/klarbefund-report";
const REPORT_TYPE = {
  system: LOINC,
  code: "11502-2",
  display: "Laboratory report",
};
const SECTION_CODE = {
  system: LOINC,
  code: "26436-6",
  display: "Laboratory studies (set)",
};

export interface LabResultRow {
  /** The Observation node's `resourceId` */
  id: string;
  code: string;
  display: string;
  value: number;
  unit: string;
  low: number | null;
  high: number | null;
  rangeText: string | null;
  /** Date or timestamp */
  effective: string;
  status: string | null;
  performer: string | null;
  /** `ocr-transcribed`, `lab-issued-digital`, ... for a Klarbefund value */
  sourceKind: string | null;
  /** The line on the paper the value was read from */
  sourceLine: string | null;
  /** `page@x,y,w,h` on the paper */
  sourceRegion: string | null;
}

export interface LabReportInput {
  /** Stable id of the report in the hub (see `groupLabReports`). */
  reportId: string;
  title: string;
  /** Date or timestamp the specimens were taken */
  effective: string;
  issued: string | null;
  performer: string | null;
  conclusion: string | null;
  /** The Klarbefund report the values came from, if they did. */
  sourceReport: string | null;
  results: LabResultRow[];
}

export interface LabDocumentOptions {
  timestamp: string;
  identity: IdentityView;
}

function quantity(value: number, unit: string) {
  return { value, unit, system: UCUM, code: unit };
}

function observationExtensions(r: LabResultRow) {
  const ext: { url: string; valueCode?: string; valueString?: string }[] = [];
  if (r.sourceKind) {
    ext.push({ url: EXT_SOURCE_KIND, valueCode: r.sourceKind });
  }
  if (r.sourceLine) {
    ext.push({ url: EXT_SOURCE_LINE, valueString: r.sourceLine });
  }
  if (r.sourceRegion) {
    ext.push({ url: EXT_SOURCE_REGION, valueString: r.sourceRegion });
  }
  return ext.length ? { extension: ext } : {};
}

function resultLine(r: LabResultRow): string {
  const range =
    r.rangeText ??
    (r.low !== null || r.high !== null
      ? `${r.low ?? ""} - ${r.high ?? ""} ${r.unit}`.trim()
      : null);
  return `${r.display}: ${r.value} ${r.unit}${
    range ? ` (range ${range})` : ""
  }`;
}

/**
 * The document for one report. Throws on a report with no results: a lab
 * report document without an Observation says nothing.
 */
export function buildLabReportDocument(
  patient: DocumentPatient,
  report: LabReportInput,
  options: LabDocumentOptions,
): DocumentBundle {
  if (report.results.length === 0) {
    throw new Error(`report ${report.reportId} has no results`);
  }
  const key = `lab-report|${patient.id}|${report.reportId}`;
  const uuid = (part: string) => documentUuid(`${key}|${part}`);
  const effective = report.effective;
  const preliminary = report.results.some((r) => r.status === "preliminary");
  const status = preliminary ? "preliminary" : "final";
  const reportIdentifier = {
    system: LAB_REPORT_SYSTEM,
    value: report.reportId,
  };

  const patientEntry = patientResource(
    uuid("patient"),
    patient,
    options.identity,
    LAB_PROFILES.patient,
  );
  const laboratory = organizationResource(
    uuid("performer"),
    report.performer ?? "Laboratory not named on the report",
  );
  const hub = organizationResource(uuid("custodian"), HUB_ORGANIZATION_NAME);
  const subject = ref(patientEntry);

  const observations: FhirResource[] = report.results.map((r) => ({
    resourceType: "Observation",
    id: uuid(`observation|${r.id}`),
    meta: { profile: [LAB_PROFILES.observation] },
    ...observationExtensions(r),
    identifier: [graphIdentifier(r.id)],
    status: r.status === "preliminary" ? "preliminary" : "final",
    category: [
      {
        coding: [
          {
            system:
              "http://terminology.hl7.org/CodeSystem/observation-category",
            code: "laboratory",
            display: "Laboratory",
          },
        ],
      },
    ],
    code: {
      coding: [{ system: LOINC, code: r.code, display: r.display }],
      text: r.display,
    },
    subject,
    effectiveDateTime: r.effective,
    // When the value was documented: the report's issue time, as on the
    // DiagnosticReport. The German lab profiles require it (#1172), and so
    // does the shared writer.
    issued: report.issued ?? options.timestamp,
    performer: [ref(laboratory, laboratory.name as string)],
    valueQuantity: quantity(r.value, r.unit),
    ...(r.low !== null || r.high !== null || r.rangeText
      ? {
          referenceRange: [
            {
              ...(r.low !== null ? { low: quantity(r.low, r.unit) } : {}),
              ...(r.high !== null ? { high: quantity(r.high, r.unit) } : {}),
              ...(r.rangeText ? { text: r.rangeText } : {}),
            },
          ],
        }
      : {}),
  }));

  const compositionId = uuid("composition");
  const diagnosticReport: FhirResource = {
    resourceType: "DiagnosticReport",
    id: uuid("diagnostic-report"),
    meta: { profile: [LAB_PROFILES.diagnosticReport] },
    extension: [
      {
        url: EXT_DR_COMPOSITION,
        valueReference: { reference: `urn:uuid:${compositionId}` },
      },
    ],
    identifier: [reportIdentifier],
    status,
    category: [
      {
        coding: [
          {
            system: "http://terminology.hl7.org/CodeSystem/v2-0074",
            code: "LAB",
            display: "Laboratory",
          },
        ],
      },
    ],
    code: { coding: [REPORT_TYPE], text: report.title },
    subject,
    effectiveDateTime: effective,
    issued: report.issued ?? options.timestamp,
    performer: [ref(laboratory, laboratory.name as string)],
    result: observations.map((o) => ref(o)),
    ...(report.conclusion ? { conclusion: report.conclusion } : {}),
  };

  const composition: FhirResource = {
    resourceType: "Composition",
    id: compositionId,
    meta: { profile: [LAB_PROFILES.composition] },
    identifier: reportIdentifier,
    status,
    type: { coding: [REPORT_TYPE], text: "Laboratory report" },
    subject,
    date: options.timestamp,
    author: [ref(laboratory, laboratory.name as string)],
    title: report.title,
    custodian: ref(hub, HUB_ORGANIZATION_NAME),
    section: [
      {
        title: "Laboratory examinations",
        code: { coding: [SECTION_CODE] },
        text: narrative(
          report.results.map(resultLine),
          "No laboratory results in this report",
        ),
        entry: [ref(diagnosticReport), ...observations.map((o) => ref(o))],
      },
    ],
  };

  const klarbefund = report.results.some((r) => r.sourceKind);
  const provenance: FhirResource = {
    resourceType: "Provenance",
    id: uuid("provenance"),
    target: [ref(diagnosticReport), ...observations.map((o) => ref(o))],
    recorded: report.issued ?? options.timestamp,
    activity: {
      coding: [
        {
          system: "http://terminology.hl7.org/CodeSystem/v3-DataOperation",
          code: "CREATE",
          display: "create",
        },
      ],
      text: klarbefund
        ? "Values read from the paper report by the Klarbefund app; page and line of each value are on its Observation"
        : "Values reported by the performing laboratory",
    },
    agent: [
      {
        type: {
          coding: [
            {
              system:
                "http://terminology.hl7.org/CodeSystem/provenance-participant-type",
              code: "author",
            },
          ],
        },
        who: ref(laboratory, laboratory.name as string),
      },
      {
        type: {
          coding: [
            {
              system:
                "http://terminology.hl7.org/CodeSystem/provenance-participant-type",
              code: "assembler",
            },
          ],
        },
        who: ref(hub, HUB_ORGANIZATION_NAME),
      },
    ],
    ...(report.sourceReport
      ? {
          entity: [
            {
              role: "source",
              what: {
                identifier: {
                  system: KLARBEFUND_REPORT_SYSTEM,
                  value: report.sourceReport,
                },
                display: "The paper report scanned in the Klarbefund app",
              },
            },
          ],
        }
      : {}),
  };

  const resources = [
    composition,
    patientEntry,
    diagnosticReport,
    ...observations,
    laboratory,
    hub,
    provenance,
  ];
  return {
    resourceType: "Bundle",
    meta: { profile: [LAB_PROFILES.bundle] },
    identifier: {
      system: "urn:ietf:rfc:3986",
      value: `urn:uuid:${documentUuid(`${key}|${options.timestamp}`)}`,
    },
    type: "document",
    timestamp: options.timestamp,
    entry: resources.map(entry),
  };
}

/** A graph row of a laboratory Observation, with what it belongs to. */
export interface LabObservationRow extends LabResultRow {
  /** The DiagnosticReport node the value is a result of, if any */
  reportNodeId: string | null;
  reportTitle: string | null;
  reportIssued: string | null;
  reportConclusion: string | null;
  /** The Klarbefund report the value came from, if any */
  sourceReport: string | null;
}

function slug(text: string): string {
  return (
    text
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "unknown"
  );
}

/**
 * The record's laboratory values as reports. A value belongs to the
 * DiagnosticReport node it is a result of; failing that, to the Klarbefund
 * report it came from; failing that, to the values the same laboratory
 * reported on the same day, which is what the seeded records hold (one
 * report a visit). Such a report's id names the record, so a report node an
 * import makes of it (#1173) is unique in the graph. Newest first.
 */
export function groupLabReports(
  rows: LabObservationRow[],
  patientId: string,
): LabReportInput[] {
  const reports = new Map<string, LabReportInput>();
  for (const row of rows) {
    const day = datePart(row.effective) ?? "undated";
    const reportId = row.reportNodeId
      ? row.reportNodeId
      : row.sourceReport
        ? `klarbefund-${row.sourceReport}`
        : `lab-${slug(patientId)}-${day}-${slug(row.performer ?? "unknown")}`;
    let report = reports.get(reportId);
    if (!report) {
      report = {
        reportId,
        title:
          row.reportTitle ??
          `Laboratory report ${day}${
            row.performer ? `, ${row.performer}` : ""
          }`,
        effective: row.effective,
        issued: row.reportIssued,
        performer: row.performer,
        conclusion: row.reportConclusion,
        sourceReport: row.sourceReport,
        results: [],
      };
      reports.set(reportId, report);
    }
    const {
      reportNodeId: _n,
      reportTitle: _t,
      reportIssued: _i,
      reportConclusion: _c,
      sourceReport: _s,
      ...result
    } = row;
    report.results.push(result);
  }
  return [...reports.values()]
    .map((r) => ({
      ...r,
      results: [...r.results].sort(
        (a, b) => a.code.localeCompare(b.code) || a.id.localeCompare(b.id),
      ),
    }))
    .sort(
      (a, b) =>
        b.effective.localeCompare(a.effective) ||
        a.reportId.localeCompare(b.reportId),
    );
}

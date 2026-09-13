/**
 * FHIR R4 writer.
 *
 * Emits a `collection` bundle: a DiagnosticReport, one Observation per coded
 * value, a DocumentReference standing for the paper, and a Provenance tying
 * them to it.
 *
 * It is **not** a KBV MIO Laborbefund document yet. That needs a `document`
 * bundle with a Composition and the KBV profiles, and claiming conformance we
 * have not validated would be worse than not claiming it. The resource shapes
 * here are chosen so that step is additive; see README.
 */
import type {
  CodedLabValue,
  ReportMeta,
  SourceKind,
  SourceRegion,
  TextSource,
} from "./types.js";

const EXT_BASE = "https://ehds.mabu.red/fhir/StructureDefinition";
export const EXT_SOURCE_KIND = `${EXT_BASE}/epa-ingest-source-kind`;
export const EXT_OCR_CONFIDENCE = `${EXT_BASE}/epa-ingest-ocr-confidence`;
export const EXT_SOURCE_LINE = `${EXT_BASE}/epa-ingest-source-line`;
/**
 * Page and bounding box of the row this value was read from.
 *
 * Satisfies the citation rule: every analyte points back at the place on the
 * document it came from, so a clinician can verify against the paper rather
 * than trust the extractor. Serialised as a compact `page@x,y,w,h` string
 * rather than a nested extension, because the consumer that matters is a human
 * reading a rendered bundle, and five nested `valueDecimal` extensions per
 * observation is not readable by anyone.
 */
export const EXT_SOURCE_REGION = `${EXT_BASE}/epa-ingest-source-region`;

const UCUM = "http://unitsofmeasure.org";
const LOINC = "http://loinc.org";

/**
 * Observation status by provenance.
 *
 * Only a value read from the lab's own characters is `final`. A value we
 * recognised from pixels is `preliminary`: the lab finalised the result, but
 * the transcription in this bundle is ours and unverified, and a receiving
 * system must be able to see that without reading an extension.
 */
export function statusForSource(kind: SourceKind): "final" | "preliminary" {
  return kind === "lab-issued-digital" ? "final" : "preliminary";
}

interface Coding {
  system: string;
  code: string;
  display?: string;
}
interface Extension {
  url: string;
  valueCode?: string;
  valueDecimal?: number;
  valueString?: string;
}
interface Reference {
  reference: string;
  display?: string;
}
interface Quantity {
  value: number;
  comparator?: string;
  unit: string;
  system: string;
  code: string;
}
interface FhirResource {
  resourceType: string;
  id: string;
  [key: string]: unknown;
}
export interface FhirBundle {
  resourceType: "Bundle";
  type: "collection";
  timestamp: string;
  entry: { fullUrl: string; resource: FhirResource }[];
}

function quantity(value: number, ucum: string, comparator?: string): Quantity {
  return {
    value,
    ...(comparator ? { comparator } : {}),
    unit: ucum,
    system: UCUM,
    code: ucum,
  };
}

/** `page@x,y,w,h`, coordinates to six decimals and trailing zeroes trimmed. */
export function formatRegion(region: SourceRegion): string {
  const n = (v: number) => String(Number(v.toFixed(6)));
  return `${region.page}@${n(region.x)},${n(region.y)},${n(region.width)},${n(
    region.height,
  )}`;
}

function provenanceExtensions(
  source: TextSource,
  line: string,
  region?: SourceRegion,
): Extension[] {
  const ext: Extension[] = [
    { url: EXT_SOURCE_KIND, valueCode: source.kind },
    { url: EXT_SOURCE_LINE, valueString: line },
  ];
  if (source.ocrConfidence !== undefined) {
    ext.push({ url: EXT_OCR_CONFIDENCE, valueDecimal: source.ocrConfidence });
  }
  if (region !== undefined) {
    ext.push({ url: EXT_SOURCE_REGION, valueString: formatRegion(region) });
  }
  return ext;
}

export interface BuildOptions {
  meta: ReportMeta;
  source: TextSource;
  /** Fixed timestamp, so the same input produces the same bundle in tests. */
  now?: string;
}

export function buildBundle(
  values: CodedLabValue[],
  options: BuildOptions,
): FhirBundle {
  const { meta, source } = options;
  const now = options.now ?? new Date().toISOString();
  const status = statusForSource(source.kind);
  const subject: Reference = { reference: `Patient/${meta.patientId}` };

  const patient: FhirResource = {
    resourceType: "Patient",
    id: meta.patientId,
    // No name, no insurance number, no birth date: this bundle is an extraction
    // artefact, and the ePA already knows who its owner is.
  };

  const docRef: FhirResource = {
    resourceType: "DocumentReference",
    id: "source-document",
    status: "current",
    subject,
    date: now,
    description: source.sourceDocument,
    content: [
      {
        attachment: {
          title: source.sourceDocument,
          creation: meta.effectiveDateTime,
        },
      },
    ],
  };

  const observations: FhirResource[] = values.map((v, i) => ({
    resourceType: "Observation",
    id: `obs-${i + 1}`,
    status,
    extension: provenanceExtensions(source, v.line, v.region),
    category: [
      {
        coding: [
          {
            system:
              "http://terminology.hl7.org/CodeSystem/observation-category",
            code: "laboratory",
            display: "Laboratory",
          } satisfies Coding,
        ],
      },
    ],
    code: {
      coding: [
        {
          system: LOINC,
          code: v.coding.loincNumber,
          display: v.coding.display,
        } satisfies Coding,
      ],
      // The label exactly as the lab printed it, so a reviewer can match the
      // coded resource back to the sheet without trusting our dictionary.
      text: v.label,
    },
    subject,
    effectiveDateTime: meta.effectiveDateTime,
    valueQuantity: quantity(v.value, v.coding.ucum, v.comparator),
    ...(v.referenceLow !== undefined || v.referenceHigh !== undefined
      ? {
          referenceRange: [
            {
              ...(v.referenceLow !== undefined
                ? { low: quantity(v.referenceLow, v.coding.ucum) }
                : {}),
              ...(v.referenceHigh !== undefined
                ? { high: quantity(v.referenceHigh, v.coding.ucum) }
                : {}),
            },
          ],
        }
      : {}),
  }));

  const report: FhirResource = {
    resourceType: "DiagnosticReport",
    id: "report-1",
    status,
    category: [
      {
        coding: [
          {
            system: "http://terminology.hl7.org/CodeSystem/v2-0074",
            code: "LAB",
            display: "Laboratory",
          } satisfies Coding,
        ],
      },
    ],
    code: {
      coding: [
        {
          system: LOINC,
          code: "11502-2",
          display: "Laboratory report",
        } satisfies Coding,
      ],
      ...(meta.title ? { text: meta.title } : {}),
    },
    subject,
    effectiveDateTime: meta.effectiveDateTime,
    issued: now,
    ...(meta.performer ? { performer: [{ display: meta.performer }] } : {}),
    result: observations.map(
      (o) => ({ reference: `Observation/${o.id}` }) satisfies Reference,
    ),
    presentedForm: [{ title: source.sourceDocument }],
  };

  const provenance: FhirResource = {
    resourceType: "Provenance",
    id: "provenance-1",
    target: [
      { reference: `DiagnosticReport/${report.id}` },
      ...observations.map((o) => ({ reference: `Observation/${o.id}` })),
    ],
    recorded: now,
    activity: {
      coding: [
        {
          system: "http://terminology.hl7.org/CodeSystem/v3-DataOperation",
          code: "DERIVE",
          display: "derive",
        } satisfies Coding,
      ],
      text:
        source.extractor === "tesseract"
          ? "Values transcribed from a scanned document by OCR"
          : "Values read from the document's own text layer",
    },
    agent: [
      {
        type: {
          coding: [
            {
              system:
                "http://terminology.hl7.org/CodeSystem/provenance-participant-type",
              code: "assembler",
            } satisfies Coding,
          ],
        },
        who: { display: `epa-ingest (${source.extractor})` },
      },
    ],
    entity: [
      { role: "source", what: { reference: `DocumentReference/${docRef.id}` } },
    ],
  };

  const resources = [patient, docRef, report, ...observations, provenance];
  return {
    resourceType: "Bundle",
    type: "collection",
    timestamp: now,
    entry: resources.map((resource) => ({
      fullUrl: `urn:uuid:${resource.resourceType}-${resource.id}`,
      resource,
    })),
  };
}

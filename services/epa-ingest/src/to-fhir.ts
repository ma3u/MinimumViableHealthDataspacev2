/**
 * FHIR R4 writer.
 *
 * Emits a `collection` bundle: a DiagnosticReport, one Observation per coded
 * value, a DocumentReference standing for the paper, a Provenance tying them
 * to it, and the Organization that printed the report when it names one.
 *
 * It is **not** a KBV MIO Laborbefund document yet. That needs a `document`
 * bundle with a Composition and the KBV profiles, and claiming conformance we
 * have not validated would be worse than not claiming it. The resource shapes
 * here are chosen so that step is additive; see README.
 */
import { createHash } from "node:crypto";
import type {
  CodedLabValue,
  ReportMeta,
  SourceKind,
  SourceRegion,
  TextSource,
} from "./types.js";
import {
  ELECTROCARDIOGRAM_CODES,
  LOINC_VERSION,
  OBSERVATION_CATEGORIES,
  REPORT_KINDS,
  type ReportKind,
} from "./analytes.js";

const EXT_BASE = "https://ehds.mabu.red/fhir/StructureDefinition";

/**
 * Namespace of the bundle entries' `fullUrl`s: uuid5(NAMESPACE_URL,
 * "https://ehds.mabu.red/fhir/epa-ingest/bundle-entry"). The Swift writer
 * carries the same constant.
 */
export const FULL_URL_NAMESPACE = "5179b1c4-0bef-5af9-9fcb-83b0e631f212";

/**
 * A name-based UUID, version 5 (RFC 9562, section 5.5): SHA-1 over the
 * namespace and the name, with the version and variant bits set. The same name
 * always gives the same UUID, so a fixed input still yields a fixed bundle.
 */
export function uuidV5(name: string, namespace = FULL_URL_NAMESPACE): string {
  const ns = Buffer.from(namespace.replace(/-/g, ""), "hex");
  const hash = createHash("sha1")
    .update(Buffer.concat([ns, Buffer.from(name, "utf8")]))
    .digest();
  const b = hash.subarray(0, 16);
  b[6] = (b[6] & 0x0f) | 0x50;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = b.toString("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(
    16,
    20,
  )}-${h.slice(20)}`;
}
export const EXT_SOURCE_KIND = `${EXT_BASE}/epa-ingest-source-kind`;
export const EXT_OCR_CONFIDENCE = `${EXT_BASE}/epa-ingest-ocr-confidence`;
export const EXT_SOURCE_LINE = `${EXT_BASE}/epa-ingest-source-line`;
/** When the person checked the value against the paper. */
export const EXT_VERIFIED = `${EXT_BASE}/epa-ingest-verified-by-patient`;
/** The recogniser's reading, when the person corrected it: `label value unit`. */
export const EXT_ORIGINAL_READING = `${EXT_BASE}/epa-ingest-original-reading`;
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
 * A LOINC coding with the release its code was checked against
 * (LOINC_VERSION). The German lab profiles require the version (#1172), and a
 * code without one leaves the reader to guess which release it meant.
 */
function loinc(code: string, display: string): Coding {
  return { system: LOINC, version: LOINC_VERSION, code, display };
}
/**
 * NCBI Taxonomy as a FHIR code system: the numeric taxon id is the code and
 * the scientific name the display, the convention HL7's Clinical Genomics
 * work uses for the same database.
 */
export const NCBI_TAXONOMY = "http://www.ncbi.nlm.nih.gov/taxonomy";
/** LOINC's term for the organism an observation is about. */
const ORGANISM_IDENTIFIED: Coding = loinc(
  "41852-5",
  "Microorganism or agent identified in Specimen",
);
/**
 * LOINC's class for laboratory results. The MII Kerndatensatz Laborbefund
 * wants it next to FHIR's `laboratory` on every lab Observation, and next to
 * v2-0074 `LAB` on a laboratory report.
 */
const LAB_STUDIES = (): Coding => loinc("26436-6", "Laboratory studies (set)");
/**
 * Where the identifiers this writer assigns live. They name this
 * transcription of a result or report, not the lab's own numbers, which are
 * not on what we read.
 */
export const IDENTIFIER_BASE = "https://ehds.mabu.red/fhir/sid";
const V2_0203 = "http://terminology.hl7.org/CodeSystem/v2-0203";
const DATA_ABSENT_REASON =
  "http://hl7.org/fhir/StructureDefinition/data-absent-reason";

/**
 * Observation status by provenance.
 *
 * Only a value read from the lab's own characters is `final`. A value we
 * recognised from pixels is `preliminary`: the lab finalised the result, but
 * the transcription in this bundle is ours and unverified, and a receiving
 * system must be able to see that without reading an extension.
 */
const CATEGORY_DISPLAY = {
  laboratory: "Laboratory",
  "vital-signs": "Vital Signs",
  procedure: "Procedure",
  imaging: "Imaging",
} as const;

/**
 * FHIR's observation category for a code: `laboratory` unless the dictionary
 * says it is a vital sign or an ECG measurement (OBSERVATION_CATEGORIES).
 */
export function observationCategory(
  loincNumber: string | null,
  analyteKey?: string,
): keyof typeof CATEGORY_DISPLAY {
  return (
    (loincNumber && OBSERVATION_CATEGORIES[loincNumber]) ||
    (analyteKey && OBSERVATION_CATEGORIES[analyteKey]) ||
    "laboratory"
  );
}

/** The category of one coded value. */
const categoryOf = (v: CodedLabValue) =>
  observationCategory(v.coding.loincNumber, v.analyteKey);

const ECG = new Set(ELECTROCARDIOGRAM_CODES);
const isEcgValue = (v: CodedLabValue) =>
  ECG.has(v.coding.loincNumber ?? "") || ECG.has(v.analyteKey);

/**
 * A report whose every value is an ECG measurement is an ECG, not a
 * laboratory report: v2-0074 `EC` (electrocardiac) and LOINC 11524-6. Vital
 * signs may sit beside them; an exercise test's procedure values may not.
 */
export function isElectrocardiogram(values: CodedLabValue[]): boolean {
  return (
    values.some(isEcgValue) &&
    values.every((v) => categoryOf(v) !== "laboratory") &&
    values.every((v) => categoryOf(v) !== "procedure" || isEcgValue(v))
  );
}

/** A Holter study: an ECG report that counts every beat of a recording. */
export function isHolter(values: CodedLabValue[]): boolean {
  return (
    isElectrocardiogram(values) &&
    values.some((v) => v.coding.loincNumber === "76637-8")
  );
}

/**
 * The kind of report the values make (REPORT_KINDS), or undefined for a
 * laboratory report. An ECG or Holter report is decided before this.
 */
export function reportKind(values: CodedLabValue[]): ReportKind | undefined {
  const keys = (v: CodedLabValue) =>
    [v.coding.loincNumber ?? "", v.analyteKey].filter((k) => k !== "");
  return REPORT_KINDS.find(
    (kind) =>
      values.some((v) => keys(v).some((k) => kind.triggers.includes(k))) &&
      values.every(
        (v) =>
          categoryOf(v) === "vital-signs" ||
          keys(v).some((k) => kind.members.includes(k)),
      ),
  );
}

export function statusForSource(kind: SourceKind): "final" | "preliminary" {
  return kind === "lab-issued-digital" ? "final" : "preliminary";
}

interface Coding {
  system: string;
  version?: string;
  code: string;
  display?: string;
}
interface Extension {
  url: string;
  valueCode?: string;
  valueDecimal?: number;
  valueString?: string;
  valueDateTime?: string;
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
  identifier: { system: string; value: string };
  /** A document for a laboratory report (the EU lab report), else a collection. */
  type: "collection" | "document";
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
  verification?: CodedLabValue["verification"],
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
  if (verification !== undefined) {
    ext.push({ url: EXT_VERIFIED, valueDateTime: verification.verifiedAt });
    if (verification.original !== undefined) {
      const o = verification.original;
      ext.push({
        url: EXT_ORIGINAL_READING,
        valueString: `${o.label} ${String(o.value)} ${o.unitRaw}`,
      });
    }
  }
  return ext;
}

/** Every `reference` that names an entry by `Type/id`, as that entry's fullUrl. */
function withFullUrls(value: unknown, urls: Map<string, string>): unknown {
  if (Array.isArray(value)) return value.map((v) => withFullUrls(v, urls));
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] =
        k === "reference" && typeof v === "string" && urls.has(v)
          ? urls.get(v)
          : withFullUrls(v, urls);
    }
    return out;
  }
  return value;
}

const escapeXml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** A section's narrative: the printed labels of its results, as a list. */
export function narrative(labels: string[]): string {
  return (
    '<div xmlns="http://www.w3.org/1999/xhtml"><ul>' +
    labels.map((l) => `<li>${escapeXml(l)}</li>`).join("") +
    "</ul></div>"
  );
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
  const name = (part: string) => `${now}|${source.sourceDocument}|${part}`;
  // Who assigned the identifiers below: this writer, named as the Provenance
  // names it. The MII lab profiles require an assigner on each.
  const assigner = { display: `epa-ingest (${source.extractor})` };
  const identifier = (type: string, display: string, part: string) => [
    {
      type: { coding: [{ system: V2_0203, code: type, display }] },
      system: `${IDENTIFIER_BASE}/epa-ingest-${part.split("/")[0]}`,
      value: uuidV5(name(part)),
      assigner,
    },
  ];
  const status = statusForSource(source.kind);
  const subject: Reference = { reference: `Patient/${meta.patientId}` };

  // The laboratory or practice that printed the report, as printed. The
  // German lab profiles want the performer as a reference (#1172), so the
  // printed name becomes an Organization in the bundle, and the reference
  // keeps the name as its display for a reader that does not resolve it.
  // A report with no performer line has no Organization: none is invented.
  const organization: FhirResource | undefined = meta.performer
    ? { resourceType: "Organization", id: "performer-1", name: meta.performer }
    : undefined;
  const performer: Reference[] | undefined = organization
    ? [
        {
          reference: `Organization/${organization.id}`,
          display: meta.performer,
        },
      ]
    : undefined;

  // Withheld, and saying so (data-absent-reason `masked`): FHIR's way to
  // state that a value exists and is kept back for privacy. The EU core
  // Patient requires a name and a birth date; none is invented.
  const masked = {
    extension: [{ url: DATA_ABSENT_REASON, valueCode: "masked" }],
  };
  const patient: FhirResource = {
    resourceType: "Patient",
    id: meta.patientId,
    // No name, no insurance number, no birth date: this bundle is an extraction
    // artefact, and the ePA already knows who its owner is.
    name: [masked],
    _birthDate: masked,
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
    // One per transcribed value (v2-0203 OBI), required by the MII lab profile.
    identifier: identifier(
      "OBI",
      "Observation Instance Identifier",
      `observation/${i + 1}`,
    ),
    status,
    extension: provenanceExtensions(source, v.line, v.region, v.verification),
    category: [
      {
        coding: [
          {
            system:
              "http://terminology.hl7.org/CodeSystem/observation-category",
            code: categoryOf(v),
            display: CATEGORY_DISPLAY[categoryOf(v)],
          } satisfies Coding,
          ...(categoryOf(v) === "laboratory" ? [LAB_STUDIES()] : []),
        ],
      },
    ],
    code: {
      // A quantity LOINC does not code gets a CodeableConcept with text only,
      // which is valid FHIR and says plainly that no code applies. Inventing
      // a near-enough code would be worse than saying nothing. The dictionary
      // records why LOINC has no code, and that reason travels as a
      // `data-absent-reason` extension so a consumer is told, not left to
      // guess whether a lookup failed.
      ...(v.coding.loincNumber !== null
        ? {
            coding: [loinc(v.coding.loincNumber, v.coding.display)],
          }
        : v.coding.uncodedReason
          ? {
              extension: [
                {
                  url: "http://hl7.org/fhir/StructureDefinition/data-absent-reason",
                  valueCode: "not-applicable",
                  _valueCode: {
                    extension: [
                      {
                        url: "http://hl7.org/fhir/StructureDefinition/rendered-value",
                        valueString: v.coding.uncodedReason,
                      },
                    ],
                  },
                },
              ],
            }
          : {}),
      // The label exactly as the lab printed it, so a reviewer can match the
      // coded resource back to the sheet without trusting our dictionary.
      text: v.label,
    },
    subject,
    effectiveDateTime: meta.effectiveDateTime,
    // When this transcription was documented, the same moment as the
    // report's `issued`. The German lab profiles require it (#1172); the
    // lab's own release time is not on what we read.
    issued: now,
    // Who reported the value. The HL7 Europe Laboratory Report profile
    // requires a performer on every result (#1144).
    ...(performer ? { performer } : {}),
    valueQuantity: quantity(v.value, v.coding.ucum, v.comparator),
    // The organism, where the quantity is the relative abundance of one. The
    // test has no LOINC code and says so above; the organism is a different
    // thing and has a registry of its own, so it is a component: LOINC's
    // "organism identified" as the code, the NCBI Taxonomy entry as the value.
    ...(v.coding.taxon
      ? {
          component: [
            {
              code: { coding: [ORGANISM_IDENTIFIED] },
              valueCodeableConcept: {
                coding: [
                  {
                    system: NCBI_TAXONOMY,
                    code: v.coding.taxon.ncbiTaxId,
                    display: v.coding.taxon.scientificName,
                  } satisfies Coding,
                ],
                // As printed, which may be a synonym NCBI has since renamed.
                text: v.label,
              },
            },
          ],
        }
      : {}),
    // FHIR's rng-2: a range needs a low, a high or a text. The text is the
    // range as printed, so a range with no number in it still travels, and
    // one with numbers keeps the qualifier the numbers cannot carry.
    ...(v.referenceLow !== undefined ||
    v.referenceHigh !== undefined ||
    v.referenceText !== undefined
      ? {
          referenceRange: [
            {
              ...(v.referenceLow !== undefined
                ? { low: quantity(v.referenceLow, v.coding.ucum) }
                : {}),
              ...(v.referenceHigh !== undefined
                ? { high: quantity(v.referenceHigh, v.coding.ucum) }
                : {}),
              ...(v.referenceText !== undefined
                ? { text: v.referenceText }
                : {}),
            },
          ],
        }
      : {}),
  }));

  const ecg = isElectrocardiogram(values);
  const kind = ecg ? undefined : reportKind(values);
  // A laboratory report proper: no ECG and none of the other report kinds.
  const labReport = !ecg && kind === undefined;
  const report: FhirResource = {
    resourceType: "DiagnosticReport",
    id: "report-1",
    // The report as this writer issued it (v2-0203 FILL, the filler's number):
    // the lab's own report number is not on what we read.
    identifier: identifier("FILL", "Filler Identifier", "report/1"),
    // The order the report answers. A printed report does not carry it, so
    // the reference says it is unknown rather than inventing one; the MII lab
    // profile requires the element.
    basedOn: [
      {
        extension: [
          {
            url: "http://hl7.org/fhir/StructureDefinition/data-absent-reason",
            valueCode: "unknown",
          },
        ],
      },
    ],
    status,
    category: [
      {
        coding: [
          (ecg
            ? {
                system: "http://terminology.hl7.org/CodeSystem/v2-0074",
                code: "EC",
                // Exactly as the code system has it, two spaces included: the
                // validator rejects any other whitespace (#1144).
                display: "Electrocardiac (e.g., EKG,  EEC, Holter)",
              }
            : {
                system: "http://terminology.hl7.org/CodeSystem/v2-0074",
                code: kind?.section ?? "LAB",
                display: kind?.sectionDisplay ?? "Laboratory",
              }) satisfies Coding,
          ...(labReport ? [LAB_STUDIES()] : []),
        ],
      },
    ],
    code: {
      coding: [
        (ecg
          ? isHolter(values)
            ? loinc(
                "18754-2",
                "Ambulatory cardiac rhythm monitor (Holter) study",
              )
            : loinc("11524-6", "EKG study")
          : loinc(
              kind?.loinc ?? "11502-2",
              kind?.display ?? "Laboratory report",
            )) satisfies Coding,
      ],
      ...(meta.title ? { text: meta.title } : {}),
    },
    subject,
    effectiveDateTime: meta.effectiveDateTime,
    issued: now,
    ...(performer ? { performer } : {}),
    // A laboratory report's results are its laboratory values: a weight or a
    // blood pressure printed on the same sheet stays in the bundle, linked by
    // the Provenance, but is not a lab result (the HL7 Europe lab report).
    result: observations
      .filter((_o, i) => !labReport || categoryOf(values[i]) === "laboratory")
      .map((o) => ({ reference: `Observation/${o.id}` }) satisfies Reference),
    presentedForm: [{ title: source.sourceDocument }],
  };

  // A laboratory report travels as the EU laboratory report: a document whose
  // Composition comes first, carries the report's identifier and type, and
  // lists the results; the DiagnosticReport points back to it (the R5
  // extension the HL7 Europe guide uses on R4). Other kinds stay collections.
  const composition: FhirResource | undefined = labReport
    ? {
        resourceType: "Composition",
        id: "composition-1",
        identifier: {
          system: (report.identifier as { system: string }[])[0].system,
          value: (report.identifier as { value: string }[])[0].value,
        },
        status,
        type: { coding: [(report.code as { coding: Coding[] }).coding[0]] },
        subject,
        date: now,
        author: performer ?? [{ display: assigner.display }],
        title: meta.title ?? "Laboratory report",
        section: [
          {
            title: "Laboratory results",
            code: { coding: [LAB_STUDIES()] },
            // The section in words, as a reader without FHIR sees it.
            text: {
              status: "generated",
              div: narrative(
                values
                  .filter((v) => categoryOf(v) === "laboratory")
                  .map((v) => v.label),
              ),
            },
            entry: report.result as Reference[],
          },
        ],
      }
    : undefined;
  if (composition) {
    report.extension = [
      {
        url: "http://hl7.org/fhir/5.0/StructureDefinition/extension-DiagnosticReport.composition",
        valueReference: { reference: `Composition/${composition.id}` },
      },
    ];
  }

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
          // v3-DataOperation has no DERIVE; reading values off a document
          // creates them (#1144).
          system: "http://terminology.hl7.org/CodeSystem/v3-DataOperation",
          code: "CREATE",
          display: "create",
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

  // The Organization last, so every other entry keeps the position, and so
  // the fullUrl, it had before there was one.
  const resources = [
    ...(composition ? [composition] : []),
    patient,
    docRef,
    report,
    ...observations,
    provenance,
    ...(organization ? [organization] : []),
  ];
  const entries = resources.map((resource, index) => ({
    fullUrl: `urn:uuid:${uuidV5(name(`entry/${index}`))}`,
    resource,
  }));
  // In a document every reference resolves to an entry's fullUrl: a relative
  // `Type/id` cannot be matched against a urn:uuid (FHIR R4, Bundle,
  // resolving references). A collection keeps the relative references.
  if (composition) {
    const urls = new Map(
      entries.map((e) => [
        `${e.resource.resourceType}/${e.resource.id}`,
        e.fullUrl,
      ]),
    );
    for (const e of entries)
      e.resource = withFullUrls(e.resource, urls) as FhirResource;
  }
  return {
    resourceType: "Bundle",
    // The bundle's own identity, named like its entries.
    identifier: {
      system: "urn:ietf:rfc:3986",
      value: `urn:uuid:${uuidV5(name("bundle"))}`,
    },
    type: composition ? "document" : "collection",
    timestamp: now,
    // A urn:uuid must be a UUID (#1144). Named by the report it comes from
    // (timestamp, source document) and the entry's position, so the same
    // report gives the same bundle. Neither the patient id nor a resource id
    // goes into the name: the Patient's id is the patient id, and no
    // identifier should go into SHA-1 (CodeQL js/weak-cryptographic-algorithm).
    entry: entries,
  };
}

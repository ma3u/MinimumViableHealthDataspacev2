/**
 * Shared types for the pre-ePA ingest pipeline.
 *
 * The pipeline is deliberately split so that the only step that can invent a
 * number, OCR, is isolated behind `Provenance`, and every value downstream
 * carries how it was obtained. See `docs/persona-journeys/registration-identification-exchange.md` §8.
 */

/**
 * How a value came to exist, in descending order of trust.
 *
 * The ePA marks every document, tamper-proofly, as uploaded by a practice, the
 * insurer, or the insured, and a GP is under no obligation to adopt the last
 * one. An artefact that flattens these three into one "result" is weaker than
 * the record it feeds, so the distinction is carried per observation.
 */
export type SourceKind =
  /** Read from a PDF's own text layer: the lab's own characters, not our guess. */
  | "lab-issued-digital"
  /** Recognised from pixels. The lab issued the value; the transcription is ours. */
  | "ocr-transcribed"
  /** Entered by the citizen, or exported from a consumer device. Never diagnostic. */
  | "self-tracked";

/** Provenance of one extracted text block. */
export interface TextSource {
  kind: SourceKind;
  /** Original file name as the citizen holds it. */
  sourceDocument: string;
  /** 0..1 mean OCR confidence; undefined when no OCR ran. */
  ocrConfidence?: number;
  /** Which extractor produced the text, for the audit trail. */
  extractor: "pdf-text-layer" | "tesseract" | "plain-text";
}

/** Extracted text plus how it was obtained. */
export interface ExtractedText {
  text: string;
  source: TextSource;
}

/** A comparator on a value, as FHIR spells it (`<`, `<=`, `>=`, `>`). */
export type Comparator = "<" | "<=" | ">=" | ">";

/**
 * Where on the page a value was read from.
 *
 * Normalised to 0..1 with the origin at the **bottom left**, which is Vision's
 * convention on the phone, and the reason this is stated rather than assumed:
 * a consumer drawing a highlight in a top-left coordinate system must flip y,
 * and an unflipped box lands on a different analyte.
 */
export interface SourceRegion {
  /** 1-based page number within the source document. */
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** One `analyte value unit (range)` row, before any coding is applied. */
export interface RawLabValue {
  /** Analyte label exactly as printed, kept for the audit trail. */
  label: string;
  value: number;
  /** Unit exactly as printed (e.g. `mg/dl`). */
  unitRaw: string;
  comparator?: Comparator;
  referenceLow?: number;
  referenceHigh?: number;
  /** The source line, so a reviewer can check the parse against the paper. */
  line: string;
  /** 1-based line number within the extracted text. */
  lineNumber: number;
  /**
   * Where on the page the row was found, when the extractor knew.
   *
   * Optional because the two extractors have different evidence. The iPhone
   * scans pixels and can point at a rectangle; this CLI reads a PDF text layer
   * and has no geometry to give. The field and its FHIR extension are defined
   * here regardless, so both sides serialise it the same way when one of them
   * can (ADR-033 names the absence of bounding boxes as a known gap).
   */
  region?: SourceRegion;
}

/** A LOINC coding plus the UCUM unit it is expressed in. */
export interface AnalyteCoding {
  /**
   * The LOINC code, or `null` where LOINC has none for this quantity.
   *
   * Body-composition devices report quantities LOINC has never coded. Visceral
   * fat is the clearest case: LOINC has `73707-2 Visceral fat [Area] Measured`
   * and nothing for the **mass** that a bioimpedance scale prints in kilograms.
   * Putting the area code on a mass would be a wrong code on a real
   * measurement, which is the failure the unit-selects-the-code rule exists to
   * prevent, so the value is carried with its unit and no code at all.
   *
   * A null code must carry `uncodedReason`; the generator refuses to emit
   * without one, so nobody reaches for this to avoid looking a code up.
   */
  loincNumber: string | null;
  display: string;
  /** UCUM unit code, e.g. `mg/dL`. */
  ucum: string;
  /** Why LOINC has no code. Required when `loincNumber` is null. */
  uncodedReason?: string;
}

/** A raw value that has been matched to a coded analyte. */
export interface CodedLabValue extends RawLabValue {
  coding: AnalyteCoding;
  /** Canonical key of the matched analyte definition. */
  analyteKey: string;
}

/** A raw value no analyte definition matched. Reported, never silently dropped. */
export interface UnmappedLabValue extends RawLabValue {
  reason: "unknown-analyte" | "unknown-unit" | "unit-mismatch";
  /** Present for `unit-mismatch`: the units the analyte is defined for. */
  expectedUnits?: string[];
}

/** Result of coding a parsed report. */
export interface CodingResult {
  coded: CodedLabValue[];
  unmapped: UnmappedLabValue[];
}

/** Everything the FHIR writer needs that is not in the values themselves. */
export interface ReportMeta {
  /** Logical patient id used in the bundle. Never a real insurance number. */
  patientId: string;
  /** Collection date of the specimen, ISO 8601 date or date-time. */
  effectiveDateTime: string;
  /** Free-text name of the issuing lab, study centre or hospital. */
  performer?: string;
  /** Title for the DiagnosticReport, e.g. "Laborbefund FS-CPC". */
  title?: string;
}

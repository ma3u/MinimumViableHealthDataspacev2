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
}

/** A LOINC coding plus the UCUM unit it is expressed in. */
export interface AnalyteCoding {
  loincNumber: string;
  display: string;
  /** UCUM unit code, e.g. `mg/dL`. */
  ucum: string;
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

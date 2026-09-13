import Foundation

/// How a value came to exist, in descending order of trust.
///
/// The ePA marks every document, tamper-proofly, as uploaded by a practice, the
/// insurer, or the insured, and a Hausarzt is under no obligation to adopt the
/// last one. An app that flattens a lab-issued value, an OCR guess and a
/// smartwatch reading into one undifferentiated "result" is weaker than the
/// record it feeds, so the distinction is carried per value.
///
/// Mirrors `SourceKind` in `services/epa-ingest/src/types.ts`.
public enum SourceKind: String, Sendable, Codable, CaseIterable {
  /// Read from a PDF's own text layer: the lab's own characters, not our guess.
  case labIssuedDigital = "lab-issued-digital"
  /// Recognised from pixels. The lab issued the value; the transcription is ours.
  case ocrTranscribed = "ocr-transcribed"
  /// Entered by the citizen, or exported from a consumer device. Never diagnostic.
  case selfTracked = "self-tracked"

  /// FHIR `Observation.status`.
  ///
  /// Only the lab's own characters produce `final`. Anything recognised from
  /// pixels or typed by hand is `preliminary`: a receiving system must see
  /// that without reading an extension.
  public var observationStatus: String {
    self == .labIssuedDigital ? "final" : "preliminary"
  }

  /// Short label for the UI. Deliberately plain: no reassuring euphemisms.
  public var shortLabel: String {
    switch self {
    case .labIssuedDigital: return "Lab-issued"
    case .ocrTranscribed: return "Scanned"
    case .selfTracked: return "Self-tracked"
    }
  }
}

/// A comparator on a value, as FHIR spells it.
public enum Comparator: String, Sendable, Codable {
  case lessThan = "<"
  case lessOrEqual = "<="
  case greaterOrEqual = ">="
  case greaterThan = ">"
}

/// One `analyte value unit (range)` row, before any coding is applied.
public struct RawLabValue: Sendable, Equatable, Codable {
  /// Analyte label exactly as printed, kept for the audit trail.
  public let label: String
  public let value: Double
  /// Unit exactly as printed, e.g. `mg/dl`.
  public let unitRaw: String
  public let comparator: Comparator?
  public let referenceLow: Double?
  public let referenceHigh: Double?
  /// The source line, so a reviewer can check the parse against the paper.
  public let line: String
  /// 1-based line number within the recognised text.
  public let lineNumber: Int
  /// Where on the page the row was read from, when the extractor knew.
  ///
  /// Optional because the two extractors have different evidence available:
  /// the phone scans pixels and can point at a rectangle, while
  /// `services/epa-ingest` reads a PDF text layer and has no geometry to give.
  /// A value without a region is not a lesser value, it is one whose source was
  /// not an image. Decoding tolerates its absence, so reports stored before
  /// regions existed still open.
  public let region: SourceRegion?

  public init(
    label: String, value: Double, unitRaw: String, comparator: Comparator? = nil,
    referenceLow: Double? = nil, referenceHigh: Double? = nil, line: String, lineNumber: Int,
    region: SourceRegion? = nil
  ) {
    self.label = label
    self.value = value
    self.unitRaw = unitRaw
    self.comparator = comparator
    self.referenceLow = referenceLow
    self.referenceHigh = referenceHigh
    self.line = line
    self.lineNumber = lineNumber
    self.region = region
  }
}

/// A raw value matched to a coded analyte.
public struct CodedLabValue: Sendable, Equatable, Codable {
  public let raw: RawLabValue
  public let coding: AnalyteCoding
  public let source: SourceKind

  public init(raw: RawLabValue, coding: AnalyteCoding, source: SourceKind) {
    self.raw = raw
    self.coding = coding
    self.source = source
  }
}

/// Why a parsed row could not be coded. Reported, never silently dropped.
public enum UnmappedReason: String, Sendable, Codable {
  case unknownAnalyte = "unknown-analyte"
  case unknownUnit = "unknown-unit"
  case unitMismatch = "unit-mismatch"
  /// The row names a specimen the dictionary has no codings for, for example
  /// urine. Refused rather than coded, because urine albumin and serum albumin
  /// are different tests that share a name.
  case specimenNotSupported = "specimen-not-supported"

  public var explanation: String {
    switch self {
    case .unknownAnalyte: return "not in the analyte dictionary"
    case .unknownUnit: return "unit has no UCUM mapping"
    case .unitMismatch: return "unit does not belong to this analyte"
    case .specimenNotSupported: return "specimen is not blood, plasma or serum"
    }
  }
}

public struct UnmappedLabValue: Sendable, Equatable, Codable {
  public let raw: RawLabValue
  public let reason: UnmappedReason

  public init(raw: RawLabValue, reason: UnmappedReason) {
    self.raw = raw
    self.reason = reason
  }
}

/// Everything one scanned page produced. Nothing is discarded.
public struct ExtractionResult: Sendable, Equatable, Codable {
  public let coded: [CodedLabValue]
  public let unmapped: [UnmappedLabValue]
  /// Lines that looked like measurements but did not parse.
  public let suspiciousLines: [String]
  public let source: SourceKind

  public init(
    coded: [CodedLabValue], unmapped: [UnmappedLabValue], suspiciousLines: [String],
    source: SourceKind
  ) {
    self.coded = coded
    self.unmapped = unmapped
    self.suspiciousLines = suspiciousLines
    self.source = source
  }

  /// Rows that need a human before they can be trusted.
  public var needsReview: Int { unmapped.count + suspiciousLines.count }

  /// Nothing extracted yet, for accumulating across pages.
  public static func empty(source: SourceKind) -> ExtractionResult {
    ExtractionResult(coded: [], unmapped: [], suspiciousLines: [], source: source)
  }

  /// Combines two extractions of the same provenance.
  ///
  /// A scan is many pages and a page can need more than one pass, so results
  /// accumulate. Nothing is deduplicated: the same analyte legitimately appears
  /// twice on a sheet that reprints a panel, and deciding that two identical
  /// rows are one is the reviewer's call, not the extractor's.
  public func merging(_ other: ExtractionResult) -> ExtractionResult {
    precondition(
      other.source == source,
      "refusing to merge \(other.source.rawValue) into \(source.rawValue): provenance decides "
        + "status, so combining trust classes would silently upgrade one of them")
    return ExtractionResult(
      coded: coded + other.coded,
      unmapped: unmapped + other.unmapped,
      suspiciousLines: suspiciousLines + other.suspiciousLines,
      source: source
    )
  }
}

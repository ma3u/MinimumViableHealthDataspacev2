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

  public init(
    label: String, value: Double, unitRaw: String, comparator: Comparator? = nil,
    referenceLow: Double? = nil, referenceHigh: Double? = nil, line: String, lineNumber: Int
  ) {
    self.label = label
    self.value = value
    self.unitRaw = unitRaw
    self.comparator = comparator
    self.referenceLow = referenceLow
    self.referenceHigh = referenceHigh
    self.line = line
    self.lineNumber = lineNumber
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

  public var explanation: String {
    switch self {
    case .unknownAnalyte: return "not in the analyte dictionary"
    case .unknownUnit: return "unit has no UCUM mapping"
    case .unitMismatch: return "unit does not belong to this analyte"
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
}

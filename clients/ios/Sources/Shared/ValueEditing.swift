import Foundation

/// A person correcting and confirming what the recogniser read.
///
/// A corrected value is coded again from what the person typed, through the
/// same label analysis and dictionary a scan goes through, so a name fixed
/// from `Hamnstoff` to `Harnstoff` takes urea's LOINC code, and a name the
/// dictionary does not know lands in the unmatched list rather than keeping
/// a code that no longer describes it. The printed line and its place on the
/// page stay, because they are the evidence, and the recogniser's reading is
/// kept beside the correction.
public enum ValueEditing {

  public enum Outcome: Sendable, Equatable {
    case coded(CodedLabValue)
    case unmapped(UnmappedLabValue)
  }

  /// The value with the person's label, number and unit, verified.
  public static func edit(
    _ original: RawLabValue, label: String, value: Double, unit: String,
    source: SourceKind, at date: Date = Date()
  ) -> Outcome {
    let label = label.trimmingCharacters(in: .whitespaces)
    let unit = unit.trimmingCharacters(in: .whitespaces)
    let changed = label != original.label || value != original.value || unit != original.unitRaw
    let raw = RawLabValue(
      label: label, value: value, unitRaw: unit,
      comparator: changed && value != original.value ? nil : original.comparator,
      referenceLow: original.referenceLow, referenceHigh: original.referenceHigh,
      referenceText: original.referenceText, line: original.line,
      lineNumber: original.lineNumber, region: original.region)
    let result = LabLineParser.code(raw, source: source)
    switch result {
    case .coded(var coded):
      coded.verification = Verification(verifiedAt: date, original: changed ? original : nil)
      return .coded(coded)
    case .unmapped:
      return result
    }
  }

  /// The value as it stands, confirmed.
  public static func verify(_ value: CodedLabValue, at date: Date = Date()) -> CodedLabValue {
    var verified = value
    verified.verification = Verification(
      verifiedAt: date, original: value.verification?.original)
    return verified
  }
}

extension LabLineParser {
  /// Codes one value as a scan's row is coded.
  public static func code(_ raw: RawLabValue, source: SourceKind) -> ValueEditing.Outcome {
    let result = code(ParseResult(values: [raw], suspiciousLines: []), source: source)
    if let coded = result.coded.first { return .coded(coded) }
    return .unmapped(
      result.unmapped.first ?? UnmappedLabValue(raw: raw, reason: .unknownAnalyte))
  }
}

extension ExtractionResult {
  /// The extraction with one coded value replaced by an edit's outcome.
  public func replacingCoded(at index: Int, with outcome: ValueEditing.Outcome) -> ExtractionResult {
    var coded = self.coded
    var unmapped = self.unmapped
    guard coded.indices.contains(index) else { return self }
    switch outcome {
    case .coded(let value): coded[index] = value
    case .unmapped(let value):
      coded.remove(at: index)
      unmapped.append(value)
    }
    return ExtractionResult(
      coded: coded, unmapped: unmapped, suspiciousLines: suspiciousLines, source: source)
  }

  /// The extraction with one unmatched value replaced by an edit's outcome.
  public func replacingUnmapped(at index: Int, with outcome: ValueEditing.Outcome)
    -> ExtractionResult
  {
    var coded = self.coded
    var unmapped = self.unmapped
    guard unmapped.indices.contains(index) else { return self }
    switch outcome {
    case .coded(let value):
      unmapped.remove(at: index)
      coded.append(value)
    case .unmapped(let value): unmapped[index] = value
    }
    return ExtractionResult(
      coded: coded, unmapped: unmapped, suspiciousLines: suspiciousLines, source: source)
  }

  /// A new reading of the same report, with what the person checked kept.
  ///
  /// Reading the stored pages again replaced the extraction, and with it
  /// every check the person had made against the paper (measured: 49 checks
  /// on three reports, gone after one re-read). A check is the person's
  /// decision and outranks the machine:
  /// - a new value of the same coding and number takes over the check;
  /// - a new value of the same coding and another number is replaced by the
  ///   checked one, because the person read it on the paper;
  /// - a checked value the new reading did not find at all is kept.
  /// Each checked value is used once, so a coding read twice stays twice.
  public func keepingChecks(of previous: [CodedLabValue]) -> ExtractionResult {
    keepingChecksReporting(of: previous).extraction
  }

  /// A checked value the new reading reads as another number: the checked
  /// one is kept, and the person is told, because a check made in one tap
  /// for a whole report can cover a misread value (measured: a range's
  /// bound stored and checked as an LDL result).
  public struct CheckConflict: Sendable, Equatable {
    public let label: String
    public let checked: Double
    public let readNow: Double
    public let unit: String
  }

  /// `keepingChecks`, and every checked value the new reading disagrees with.
  public func keepingChecksReporting(of previous: [CodedLabValue])
    -> (extraction: ExtractionResult, conflicts: [CheckConflict])
  {
    var conflicts: [CheckConflict] = []
    var coded = self.coded
    var claimed = Set<Int>()
    var unplaced: [CodedLabValue] = []
    for old in previous where old.verification != nil {
      let key = old.coding.codeKey
      if let same = coded.indices.first(where: {
        !claimed.contains($0) && coded[$0].coding.codeKey == key
          && abs(coded[$0].raw.value - old.raw.value) < 1e-9
      }) {
        coded[same].verification = old.verification
        claimed.insert(same)
      } else if let other = coded.indices.first(where: {
        !claimed.contains($0) && coded[$0].coding.codeKey == key && coded[$0].verification == nil
      }) {
        conflicts.append(
          CheckConflict(
            label: old.raw.label, checked: old.raw.value, readNow: coded[other].raw.value,
            unit: old.coding.ucum))
        coded[other] = old
        claimed.insert(other)
      } else {
        unplaced.append(old)
      }
    }
    return (
      ExtractionResult(
        coded: coded + unplaced, unmapped: unmapped, suspiciousLines: suspiciousLines,
        source: source),
      conflicts
    )
  }

  /// How many coded values the person has checked against the paper.
  public var checkedCount: Int { coded.filter { $0.verification != nil }.count }

  /// Every coded value confirmed at once.
  public func verifyingAll(at date: Date = Date()) -> ExtractionResult {
    ExtractionResult(
      coded: coded.map { $0.verification == nil ? ValueEditing.verify($0, at: date) : $0 },
      unmapped: unmapped, suspiciousLines: suspiciousLines, source: source)
  }
}

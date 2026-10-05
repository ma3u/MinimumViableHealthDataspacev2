import Foundation

/// Codes a stored report again from its own rows, without its pages.
///
/// "Read again with this version" re-runs the recogniser on the stored scan.
/// A report imported before the app kept its pages has none, and for those the
/// button was simply missing, although the record still holds everything the
/// improved parser needs: the line of every coded value, the line of every
/// refused row, and every line it could not read. A real report of that kind
/// had 22 refused rows, and 21 of them code with the dictionary of 2026-10-04
/// (ScanReplay, record-only).
///
/// Three rules:
/// - A coded value keeps its number and takes the current coding for its own
///   label and unit, so a corrected LOINC code reaches an old report.
/// - A refused row or an unread line is parsed again from its stored line.
/// - Nothing coded is ever lost: a coded value the current parser cannot
///   place again stays as it was.
public enum LabRecoder {

  public struct Outcome: Sendable, Equatable {
    public let extraction: ExtractionResult
    /// Rows that were refused or unread and are coded now.
    public let recovered: Int
    /// Coded values whose code changed with the dictionary.
    public let recoded: Int
  }

  public static func recode(_ stored: ExtractionResult) -> Outcome {
    let source = stored.source
    var coded: [CodedLabValue] = []
    var unmapped: [UnmappedLabValue] = []
    var unread: [String] = []
    var recovered = 0
    var recoded = 0

    for value in stored.coded {
      let again = LabLineParser.extract(oneLine(value.raw.line), source: source).coded
        .first { abs($0.raw.value - value.raw.value) < 1e-9 }
      if let again, again.coding != value.coding {
        recoded += 1
        coded.append(CodedLabValue(raw: value.raw, coding: again.coding, source: source))
      } else {
        coded.append(value)
      }
    }

    for item in stored.unmapped {
      let again = LabLineParser.extract(oneLine(item.raw.line), source: source)
      if again.coded.isEmpty {
        unmapped.append(item)
        continue
      }
      recovered += 1
      coded += again.coded.map { keeping(item.raw, $0, source: source) }
      unmapped += again.unmapped
    }

    for line in stored.suspiciousLines {
      let again = LabLineParser.extract(oneLine(line), source: source)
      if again.coded.isEmpty && again.unmapped.isEmpty {
        unread.append(line)
        continue
      }
      if !again.coded.isEmpty { recovered += 1 }
      coded += again.coded
      unmapped += again.unmapped
    }

    return Outcome(
      extraction: ExtractionResult(
        coded: coded, unmapped: unmapped, suspiciousLines: unread, source: source),
      recovered: recovered, recoded: recoded)
  }

  /// A row stored before the reconciler collapsed whitespace can carry a line
  /// break from a wrapped cell. It is one row; the grammar splits on newlines.
  static func oneLine(_ text: String) -> String {
    text.split(whereSeparator: { $0.isWhitespace || $0.isNewline }).joined(separator: " ")
  }

  /// The newly coded value, still pointing at the place on the page the
  /// refused row was read from.
  private static func keeping(
    _ original: RawLabValue, _ coded: CodedLabValue, source: SourceKind
  ) -> CodedLabValue {
    let raw = coded.raw
    return CodedLabValue(
      raw: RawLabValue(
        label: raw.label, value: raw.value, unitRaw: raw.unitRaw, comparator: raw.comparator,
        referenceLow: raw.referenceLow, referenceHigh: raw.referenceHigh,
        referenceText: raw.referenceText, line: raw.line, lineNumber: original.lineNumber,
        region: original.region),
      coding: coded.coding, source: source)
  }
}

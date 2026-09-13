import Foundation

/// Line parser for German lab reports — the Swift side of
/// `services/epa-ingest/src/parse-lab.ts`.
///
/// Works on recognised text, whether it came from a PDF's text layer or from
/// Vision OCR. The parser never learns which, so it cannot be tempted to treat a
/// recognised digit as more certain than it is; provenance is attached by the
/// caller.
///
/// The shape it recognises is the one every German lab sheet prints:
///
///     Analyt            Wert   Einheit   Referenzbereich
///     LDL-Cholesterin    141   mg/dl     < 116
///     Kreatinin         0,92   mg/dl     0,70 - 1,20
///     Ferritin           <10   µg/l      30 - 400
public enum LabLineParser {

  /// Parses a German-formatted number.
  ///
  /// German convention rules, because the input is a German lab sheet: `,` is
  /// the decimal separator and `.` groups thousands — so `1.240` pg/mL
  /// NT-proBNP is **1240**, not 1.24, which is the difference between a normal
  /// result and a cardiology referral. The one concession to English-formatted
  /// reports is that a lone `.` before one or two digits (`0.92`) is a decimal
  /// point, since no German grouping produces that.
  public static func parseNumber(_ raw: String) -> Double? {
    let t = raw.trimmingCharacters(in: .whitespaces)
    guard !t.isEmpty, t.first?.isNumber == true else { return nil }
    guard t.allSatisfy({ $0.isNumber || $0 == "." || $0 == "," }) else { return nil }

    let hasComma = t.contains(",")
    let hasDot = t.contains(".")
    var normalised = t

    if hasComma && hasDot {
      // Rightmost separator is the decimal one; the other groups.
      let lastComma = t.lastIndex(of: ",")!
      let lastDot = t.lastIndex(of: ".")!
      normalised =
        lastComma > lastDot
        ? t.replacingOccurrences(of: ".", with: "").replacingOccurrences(of: ",", with: ".")
        : t.replacingOccurrences(of: ",", with: "")
    } else if hasComma {
      normalised = t.replacingOccurrences(of: ",", with: ".")
    } else if hasDot {
      let afterDot = t[t.index(after: t.lastIndex(of: ".")!)...]
      // `.` + exactly three digits is thousands grouping; anything else is a
      // decimal point.
      normalised = afterDot.count == 3 ? t.replacingOccurrences(of: ".", with: "") : t
    }

    return Double(normalised)
  }

  public struct ReferenceRange: Sendable, Equatable {
    public let low: Double?
    public let high: Double?
    public init(low: Double? = nil, high: Double? = nil) {
      self.low = low
      self.high = high
    }
  }

  /// Reads the reference-range column.
  ///
  /// Handles the four forms German labs actually print: an interval
  /// (`0,70 - 1,20`, hyphen, en dash or `bis`), an upper bound (`< 200`,
  /// `bis 200`), a lower bound (`> 40`), and nothing at all.
  public static func parseReferenceRange(_ raw: String) -> ReferenceRange {
    var t = raw
      .replacingOccurrences(
        of: "referenz(bereich)?\\s*:?", with: "", options: [.regularExpression, .caseInsensitive]
      )
      .replacingOccurrences(of: "≤", with: "<")
      .replacingOccurrences(of: "≥", with: ">")
    t = t.filter { !"()[]".contains($0) }.trimmingCharacters(in: .whitespaces)
    guard !t.isEmpty else { return ReferenceRange() }

    if let m = firstMatch(#"^(\d[\d.,]*)\s*(?:-|–|—|bis)\s*(\d[\d.,]*)"#, in: t, caseInsensitive: true) {
      return ReferenceRange(low: parseNumber(m[1]), high: parseNumber(m[2]))
    }
    if let m = firstMatch(#"^(?:<=?|bis|kleiner)\s*(\d[\d.,]*)"#, in: t, caseInsensitive: true) {
      return ReferenceRange(high: parseNumber(m[1]))
    }
    if let m = firstMatch(#"^(?:>=?|groesser|größer)\s*(\d[\d.,]*)"#, in: t, caseInsensitive: true) {
      return ReferenceRange(low: parseNumber(m[1]))
    }
    return ReferenceRange()
  }

  /// `Analyt  [<]Wert [flag]  Einheit  [Referenz]`.
  ///
  /// The mandatory whitespace between label and value is what keeps `HbA1c` and
  /// `Vitamin B12` from being split at their own digits.
  private static let linePattern =
    #"^\s*(?<label>[A-Za-zÄÖÜäöüß][A-Za-zÄÖÜäöüß0-9()/.,'+\-\s]*?)"#
    + #"\s+(?<cmp>[<>]=?|≤|≥)?\s*(?<value>\d[\d.,]*)"#
    + #"\s*(?<flag>[*+!↑↓HL]{0,2})"#
    + #"\s+(?<unit>[^\s]+)"#
    + #"\s*(?<rest>.*)$"#

  private static let lineRegex = try! NSRegularExpression(pattern: linePattern)

  private static func firstMatch(
    _ pattern: String, in text: String, caseInsensitive: Bool = false
  ) -> [String]? {
    let options: NSRegularExpression.Options = caseInsensitive ? [.caseInsensitive] : []
    guard let re = try? NSRegularExpression(pattern: pattern, options: options),
      let m = re.firstMatch(in: text, range: NSRange(text.startIndex..., in: text))
    else { return nil }
    return (0..<m.numberOfRanges).map { i in
      guard let r = Range(m.range(at: i), in: text) else { return "" }
      return String(text[r])
    }
  }

  public struct ParseResult: Sendable, Equatable {
    public let values: [RawLabValue]
    /// Lines carrying a number and a unit that the parser could not read.
    /// Surfaced so a human can check them — a silently dropped line is
    /// indistinguishable from a line that was never there.
    public let suspiciousLines: [String]
  }

  private static func looksLikeMeasurement(_ line: String) -> Bool {
    guard line.contains(where: { $0.isNumber }) else { return false }
    return line.split(whereSeparator: { $0.isWhitespace })
      .contains { Analytes.normaliseUnit(String($0)) != nil }
  }

  public static func parse(_ text: String) -> ParseResult {
    var values: [RawLabValue] = []
    var suspicious: [String] = []

    for (index, line) in text.components(separatedBy: .newlines).enumerated() {
      let lineNumber = index + 1
      guard !line.trimmingCharacters(in: .whitespaces).isEmpty else { continue }

      let range = NSRange(line.startIndex..., in: line)
      guard let m = lineRegex.firstMatch(in: line, range: range) else {
        if looksLikeMeasurement(line) { suspicious.append(line) }
        continue
      }

      func group(_ name: String) -> String {
        guard let r = Range(m.range(withName: name), in: line) else { return "" }
        return String(line[r])
      }

      let unitRaw = group("unit").trimmingCharacters(in: .whitespaces)
      // The unit column must actually be a unit; otherwise we have matched the
      // reference range or a comment and should not pretend otherwise.
      guard let value = parseNumber(group("value")), Analytes.normaliseUnit(unitRaw) != nil else {
        if looksLikeMeasurement(line) { suspicious.append(line) }
        continue
      }

      let ref = parseReferenceRange(group("rest"))
      let cmpRaw = group("cmp").replacingOccurrences(of: "≤", with: "<=")
        .replacingOccurrences(of: "≥", with: ">=")

      values.append(
        RawLabValue(
          label: group("label").trimmingCharacters(in: .whitespaces),
          value: value,
          unitRaw: unitRaw,
          comparator: Comparator(rawValue: cmpRaw),
          referenceLow: ref.low,
          referenceHigh: ref.high,
          line: line.trimmingCharacters(in: .whitespaces),
          lineNumber: lineNumber
        ))
    }

    return ParseResult(values: values, suspiciousLines: suspicious)
  }

  /// Parses and codes in one pass, stamping provenance on every coded value.
  ///
  /// Nothing is dropped: a row is coded, or reported with the reason it was not.
  public static func extract(_ text: String, source: SourceKind) -> ExtractionResult {
    let parsed = parse(text)
    var coded: [CodedLabValue] = []
    var unmapped: [UnmappedLabValue] = []

    for raw in parsed.values {
      guard Analytes.normaliseUnit(raw.unitRaw) != nil else {
        unmapped.append(UnmappedLabValue(raw: raw, reason: .unknownUnit))
        continue
      }
      if let coding = Analytes.lookup(label: raw.label, unit: raw.unitRaw) {
        coded.append(CodedLabValue(raw: raw, coding: coding, source: source))
      } else if Analytes.knowsLabel(raw.label) {
        // The label is known but not in this unit — a different measurement.
        unmapped.append(UnmappedLabValue(raw: raw, reason: .unitMismatch))
      } else {
        unmapped.append(UnmappedLabValue(raw: raw, reason: .unknownAnalyte))
      }
    }

    return ExtractionResult(
      coded: coded, unmapped: unmapped, suspiciousLines: parsed.suspiciousLines, source: source)
  }
}

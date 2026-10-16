import Foundation

/// What the readers of documents that are not lab sheets share: finding a
/// value by the words printed around it, reading a number the way its field
/// prints it, and turning what was read into coded values.
///
/// A DXA scan, an exercise test and a glucose sensor's report print their
/// results in prose, in tables of their own and on rotated pages. The line
/// grammar reads none of that, and what it does take from them (a year in a
/// sentence, an axis tick) is noise. Each reader knows its document's
/// labels; this is the part of the work that does not depend on which
/// document it is.
enum PrintedFields {

  /// The first match's capture groups, or nil. Case-insensitive, and `^`
  /// and `$` match at every line.
  static func groups(_ pattern: String, in text: String) -> [String]? {
    guard
      let re = try? NSRegularExpression(
        pattern: pattern, options: [.caseInsensitive, .anchorsMatchLines]),
      let m = re.firstMatch(in: text, range: NSRange(text.startIndex..., in: text))
    else { return nil }
    return (1..<max(m.numberOfRanges, 1)).map { index in
      Range(m.range(at: index), in: text).map { String(text[$0]) } ?? ""
    }
  }

  /// Every match's capture groups.
  static func allGroups(_ pattern: String, in text: String) -> [[String]] {
    guard
      let re = try? NSRegularExpression(
        pattern: pattern, options: [.caseInsensitive, .anchorsMatchLines])
    else { return [] }
    return re.matches(in: text, range: NSRange(text.startIndex..., in: text)).map { m in
      (1..<max(m.numberOfRanges, 1)).map { index in
        Range(m.range(at: index), in: text).map { String(text[$0]) } ?? ""
      }
    }
  }

  /// Every match's capture groups, matched one line at a time, so that no
  /// `\s` in a table row's pattern can join it to the next row.
  static func lineGroups(_ pattern: String, in text: String) -> [[String]] {
    text.components(separatedBy: .newlines).flatMap { allGroups(pattern, in: $0) }
  }

  static func firstGroup(_ pattern: String, in text: String) -> String? {
    groups(pattern, in: text)?.first
  }

  /// A number printed with a decimal comma or a decimal point: `3,92`,
  /// `3.12`, `-0,6`. One separator, and it is the decimal one; a field that
  /// prints thousands is read with `count` instead. Unlike
  /// `LabLineParser.parseNumber`, `1,153` and `1.153` are the same number,
  /// because a bone density in g/cm² is never a thousand.
  static func decimal(_ printed: String) -> Double? {
    let t = printed.trimmingCharacters(in: .whitespaces)
    guard t.range(of: #"^-?\d+(?:[.,]\d+)?$"#, options: .regularExpression) != nil else {
      return nil
    }
    return Double(t.replacingOccurrences(of: ",", with: "."))
  }

  /// A whole count with or without a thousands separator: `14.280`,
  /// `14,280` (a recogniser turns the dot into a comma), `14280`. A field
  /// that prints grams or beats has no decimals, so a separator before
  /// three digits always groups.
  static func count(_ printed: String) -> Double? {
    let t = printed.trimmingCharacters(in: .whitespaces)
    guard t.range(of: #"^-?(?:\d{1,3}(?:[.,]\d{3})+|\d+)$"#, options: .regularExpression) != nil
    else { return nil }
    let digits = t.filter(\.isNumber)
    return Double(digits).map { t.hasPrefix("-") ? -$0 : $0 }
  }

  /// `12:44` as minutes, with the seconds as a fraction of one.
  static func minutes(_ printed: String) -> Double? {
    let parts = printed.split(separator: ":").map(String.init)
    guard parts.count == 2, let m = Double(parts[0]), let s = Double(parts[1]), s < 60 else {
      return nil
    }
    return ((m + s / 60) * 100).rounded() / 100
  }

  /// A value as the line that shows it to a person prints it: no `.0` on a
  /// whole number.
  static func text(_ value: Double) -> String {
    value == value.rounded() ? String(Int(value)) : String(value)
  }

  /// True when `a` and `b` agree to within `tolerance`.
  static func agree(_ a: Double, _ b: Double, within tolerance: Double) -> Bool {
    abs(a - b) <= tolerance + 1e-9
  }

  /// The value every reading agrees on, or nil when there is none or two
  /// readings differ. A figure a report prints twice is read twice; a
  /// misreading shows up as a disagreement, and nothing says which of the
  /// two is right.
  static func agreed(_ readings: [Double?]) -> Double? {
    let read = readings.compactMap { $0 }
    guard let first = read.first, read.allSatisfy({ $0 == first }) else { return nil }
    return first
  }

  /// One value as a reader names it. `line` is what was printed, for the
  /// person who checks it against the paper.
  static func value(
    _ label: String, _ value: Double, _ unit: String, line: String, number: Int
  ) -> RawLabValue {
    RawLabValue(label: label, value: value, unitRaw: unit, line: line, lineNumber: number)
  }

  /// The values a reader produced, coded by the dictionary. A label the
  /// dictionary does not know is a reader bug, and the test of each reader
  /// says so; it is still carried, as unmatched, rather than lost.
  static func extraction(_ values: [RawLabValue], source: SourceKind) -> ExtractionResult {
    var coded: [CodedLabValue] = []
    var unmapped: [UnmappedLabValue] = []
    for raw in values {
      if let coding = Analytes.lookup(label: raw.label, unit: raw.unitRaw) {
        coded.append(CodedLabValue(raw: raw, coding: coding, source: source))
      } else {
        unmapped.append(UnmappedLabValue(raw: raw, reason: .unknownAnalyte))
      }
    }
    return ExtractionResult(coded: coded, unmapped: unmapped, suspiciousLines: [], source: source)
  }

  /// The document's reading once a reader has read it: the reader's values
  /// in place of the line grammar's. These documents hold no laboratory
  /// value for the grammar to find, and what it finds in them, measured on
  /// real ones, is a year in a sentence, an axis tick or a column header.
  /// Below `minimum` values the reader is not sure the document is its own,
  /// and the grammar's reading stands.
  static func replacing(
    _ sheet: ExtractionResult, with values: [RawLabValue], minimum: Int
  ) -> ExtractionResult {
    let read = extraction(values, source: sheet.source)
    guard read.coded.count >= minimum else { return sheet }
    return read
  }
}

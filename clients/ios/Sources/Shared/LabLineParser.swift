import Foundation

/// Line parser for German lab reports, the Swift side of
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
  /// the decimal separator and `.` groups thousands, so `1.240` pg/mL
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
    /// Surfaced so a human can check them, a silently dropped line is
    /// indistinguishable from a line that was never there.
    public let suspiciousLines: [String]
  }

  private static func looksLikeMeasurement(_ line: String) -> Bool {
    guard line.contains(where: { $0.isNumber }) else { return false }
    return line.split(whereSeparator: { $0.isWhitespace })
      .contains { Analytes.normaliseUnit(String($0)) != nil }
  }

  public static func parse(_ text: String) -> ParseResult {
    let lines = text.components(separatedBy: .newlines)
      .enumerated()
      .map { (line: $0.element, lineNumber: $0.offset + 1, region: SourceRegion?.none) }
    return parse(lines: lines)
  }

  /// Parses rows a table recogniser already separated, keeping their geometry.
  ///
  /// The row is rendered to the same `label  value  unit  rest` shape the
  /// text-only path produces and run through the same grammar, so the German
  /// number rule, the comparators and the reference-range forms stay in one
  /// tested place rather than being reimplemented per column. What the table
  /// pass adds is trustworthy row boundaries and a rectangle per row.
  public static func parse(rows: [DocumentReconciler.Row]) -> ParseResult {
    // Read by column role when the table reveals one. A real sheet from a Berlin
    // study centre orders its columns Analyt, Einheit, Referenzbereich, Wert,
    // against which the positional grammar below fails every row. See
    // `TableRoles` for why this is decided per table rather than per line.
    if let layout = TableRoles.infer(rows: rows.map { $0.cells.map(\.text) }) {
      return parse(rows: rows, layout: layout)
    }
    return parse(
      lines: rows.enumerated().map {
        (line: $0.element.line, lineNumber: $0.offset + 1, region: $0.element.region)
      })
  }

  private static func parse(
    rows: [DocumentReconciler.Row], layout: TableRoles.Layout
  ) -> ParseResult {
    var values: [RawLabValue] = []
    var suspicious: [String] = []

    for (index, row) in rows.enumerated() {
      let cells = row.cells.map { $0.text.trimmingCharacters(in: .whitespaces) }
      func cell(_ column: Int?) -> String {
        guard let column, column < cells.count else { return "" }
        return cells[column]
      }

      let label = cell(layout.label)
      let unitRaw = cell(layout.unit)
      let valueCell = cell(layout.value)

      // The header row, and any section heading, land here and are simply not
      // measurements. They are not suspicious either: a row with no number in
      // its value column never claimed to be one.
      guard !label.isEmpty, !valueCell.isEmpty else { continue }

      let comparatorText = valueCell
        .replacingOccurrences(of: "≤", with: "<=")
        .replacingOccurrences(of: "≥", with: ">=")
      let comparator = firstMatch(#"^(<=|>=|<|>)"#, in: comparatorText).map { $0[1] }
      let numberText = comparatorText
        .replacingOccurrences(of: #"^(<=|>=|<|>)\s*"#, with: "", options: .regularExpression)
        .replacingOccurrences(of: #"\s*[*+!↑↓HL]{1,2}$"#, with: "", options: .regularExpression)
        .trimmingCharacters(in: .whitespaces)

      guard let value = parseNumber(numberText), Analytes.normaliseUnit(unitRaw) != nil else {
        if looksLikeMeasurement(row.line) { suspicious.append(row.line) }
        continue
      }

      let reference = parseReferenceRange(cell(layout.reference))
      values.append(
        RawLabValue(
          label: label,
          value: value,
          unitRaw: unitRaw,
          comparator: comparator.flatMap(Comparator.init(rawValue:)),
          referenceLow: reference.low,
          referenceHigh: reference.high,
          line: row.line,
          lineNumber: index + 1,
          region: row.region
        ))
    }

    return ParseResult(values: values, suspiciousLines: suspicious)
  }

  /// Splits a printed label into its analyte name and its specimen matrix.
  ///
  /// German reports mark the matrix in brackets: `Cholesterin [P]` is plasma,
  /// `Albumin [U]` is urine. Two things follow, and both were costing rows.
  ///
  /// First, the marker breaks label matching outright. `normaliseLabel` strips
  /// punctuation, so `Cholesterin [P]` folds to `cholesterinp`, which matches
  /// no entry. An analyte the dictionary knows perfectly well was being
  /// reported as unknown purely because of a two-character suffix.
  ///
  /// Second, and more seriously, the matrix is part of the identity of the
  /// measurement. Urine albumin and serum albumin are different tests with
  /// different LOINC codes and reference ranges that share a name. The
  /// dictionary is blood-based throughout, so a non-blood matrix must be
  /// refused rather than stripped and looked up, or `Albumin [U] 3.9 mg/l`
  /// would be coded as a serum albumin and read as catastrophically low.
  public static func splitSpecimen(_ label: String) -> (label: String, specimen: String?) {
    guard
      let match = firstMatch(
        #"^(.*?)\s*\[\s*([A-Za-zÄÖÜäöü]{1,3})\s*\]\s*$"#, in: label)
    else { return (label, nil) }
    return (match[1].trimmingCharacters(in: .whitespaces), match[2].uppercased())
  }

  /// Matrices the analyte dictionary's codings are valid for.
  ///
  /// P plasma, S serum, B whole blood, and the German spellings of the same.
  /// Anything else is a different measurement wearing the same name.
  static let bloodSpecimens: Set<String> = ["P", "S", "B", "SE", "PL", "VB", "EDT"]

  private static func parse(
    lines: [(line: String, lineNumber: Int, region: SourceRegion?)]
  ) -> ParseResult {
    var values: [RawLabValue] = []
    var suspicious: [String] = []

    for entry in lines {
      let line = entry.line
      let lineNumber = entry.lineNumber
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
          lineNumber: lineNumber,
          region: entry.region
        ))
    }

    return ParseResult(values: values, suspiciousLines: suspicious)
  }

  /// Parses and codes in one pass, stamping provenance on every coded value.
  ///
  /// Nothing is dropped: a row is coded, or reported with the reason it was not.
  public static func extract(_ text: String, source: SourceKind) -> ExtractionResult {
    code(parse(text), source: source)
  }

  /// Extracts from reconciled table rows, so every coded value keeps its
  /// rectangle on the page (#186 acceptance criterion 5).
  public static func extract(
    rows: [DocumentReconciler.Row], source: SourceKind
  ) -> ExtractionResult {
    code(parse(rows: rows), source: source)
  }

  private static func code(_ parsed: ParseResult, source: SourceKind) -> ExtractionResult {
    var coded: [CodedLabValue] = []
    var unmapped: [UnmappedLabValue] = []

    for raw in parsed.values {
      guard Analytes.normaliseUnit(raw.unitRaw) != nil else {
        unmapped.append(UnmappedLabValue(raw: raw, reason: .unknownUnit))
        continue
      }

      // `Cholesterin [P]` folds to `cholesterinp` and matches nothing, so the
      // matrix comes off before lookup. A non-blood matrix is refused outright:
      // see `splitSpecimen`.
      let (bareLabel, specimen) = splitSpecimen(raw.label)
      if let specimen, !bloodSpecimens.contains(specimen) {
        unmapped.append(UnmappedLabValue(raw: raw, reason: .specimenNotSupported))
        continue
      }

      if let coding = Analytes.lookup(label: bareLabel, unit: raw.unitRaw) {
        coded.append(CodedLabValue(raw: raw, coding: coding, source: source))
      } else if Analytes.knowsLabel(bareLabel) {
        // The label is known but not in this unit, a different measurement.
        unmapped.append(UnmappedLabValue(raw: raw, reason: .unitMismatch))
      } else {
        unmapped.append(UnmappedLabValue(raw: raw, reason: .unknownAnalyte))
      }
    }

    return ExtractionResult(
      coded: coded, unmapped: unmapped, suspiciousLines: parsed.suspiciousLines, source: source)
  }
}

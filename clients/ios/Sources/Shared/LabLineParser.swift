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
    // A recogniser reads a column separator as punctuation often enough that
    // `: 33-36` is common. The range is what follows it.
    t = t.replacingOccurrences(of: #"^[:;,|]+\s*"#, with: "", options: .regularExpression)
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
  ///
  /// Three concessions to a real Berlin sheet (#186), each of which had cost a
  /// row: a label may hold any letter and a `%` (`Kreatinin (Jaffé)`,
  /// `Neutrophile %`), a `%` or `‰` may sit glued to the value (`53,7%`), and
  /// a lone `-` after the value is a "below range" flag, not a range.
  private static let linePattern =
    #"^\s*(?<label>[\p{L}(][\p{L}0-9()/.,'+%‰\[\]\-\s]*?)"#
    + #"\s+(?<cmp>[<>]=?|≤|≥)?\s*(?<value>\d[\d.,]*)"#
    + #"\s*(?<flag>[*+!↑↓HL;:\-]{0,2})"#
    // A unit glued to its value is either a percent sign or a per-something
    // unit: `53,7%`, `5,0/pl`. Deliberately not "any text", because an
    // unrestricted alternative matches `25-OH` in `25-OH Vitamin D` and the
    // grammar then never backtracks to the longer label that was the answer.
    + #"(?:\s+(?<unit>[^\s]+)|(?<glued>[%‰]|/[^\s]+))"#
    + #"\s*(?<rest>.*)$"#

  /// A value cell's trailing flag: `+`, `*`, `H`, `L`, or the `-` a lab prints
  /// for "below range". Stripped, never interpreted: the printed reference
  /// range is the reviewer's evidence, not the lab's arrow.
  static let trailingFlag = #"\s*[*+!↑↓HL;:\-]{1,2}$"#

  /// Splits a cell whose unit is glued to its number: `53,7%`, `5,0/pl`.
  ///
  /// The unit half must be a unit the dictionary knows, so a decimal comma or
  /// a stray character cannot be mistaken for one.
  static func splitGluedUnit(_ cell: String) -> (value: String, unit: String?) {
    let text = cell.trimmingCharacters(in: .whitespaces)
    guard let split = text.firstIndex(where: { !($0.isNumber || $0 == "." || $0 == ",") }),
      split != text.startIndex
    else { return (text, nil) }
    let unit = String(text[split...])
    guard Analytes.normaliseUnit(unit) != nil else { return (text, nil) }
    return (String(text[..<split]).trimmingCharacters(in: .whitespaces), unit)
  }

  /// True when the whole text is one reference range and nothing else.
  static func isExactlyReferenceRange(_ text: String) -> Bool {
    let range = parseReferenceRange(text)
    guard range.low != nil || range.high != nil else { return false }
    let bound = "(?:<=?|>=?|≤|≥|bis|kleiner|groesser|größer)\\s*\\d[\\d.,]*"
    let interval = "\\d[\\d.,]*\\s*(?:-|–|—|bis)\\s*\\d[\\d.,]*"
    let whole = "^\\s*\\(?\\s*(?:" + bound + "|" + interval + ")\\s*\\)?\\s*$"
    return firstMatch(whole, in: text, caseInsensitive: true) != nil
  }

  /// Finds a unit printed inside the label, `HbA1c mmol/mol Hb`, when the sheet
  /// gave the unit column nothing. The last token that is a unit wins; what
  /// follows it (`Hb`) is dropped, what precedes it is the label.
  static func unitFromLabel(_ label: String) -> (label: String, unit: String)? {
    let tokens = label.split(whereSeparator: { $0.isWhitespace }).map(String.init)
    guard let index = tokens.lastIndex(where: { Analytes.normaliseUnit($0) != nil }), index > 0
    else { return nil }
    return (tokens[..<index].joined(separator: " "), tokens[index])
  }

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
    if line.split(whereSeparator: { $0.isWhitespace })
      .contains(where: { Analytes.normaliseUnit(String($0)) != nil })
    {
      return true
    }
    // A line whose unit the recogniser mangled still has to reach the reviewer
    // when we can see which analyte it is. Measured on a real sheet (#186):
    // `Hämatokrit (l/l)` came back as `Hämatokrit (I/I)  0.435 M`, with no
    // token that parses as a unit, and the row was dropped in silence. A
    // person holding the paper is the only one who can resolve that, and only
    // if they are told.
    //
    // Deliberately narrow: the text before the first digit must name an
    // analyte the dictionary knows. A page header or an order number does not,
    // so the unread list stays a list worth reading.
    return namesAKnownAnalyte(line)
  }

  /// True when the text before the first digit names an analyte we know.
  static func namesAKnownAnalyte(_ line: String) -> Bool {
    guard let firstDigit = line.firstIndex(where: { $0.isNumber }) else { return false }
    let head = String(line[..<firstDigit]).trimmingCharacters(in: .whitespaces)
    guard head.count >= 2 else { return false }
    return analyseLabel(head).candidates.contains { Analytes.knowsLabel($0) }
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

      var label = cell(layout.label)
      var unitRaw = cell(layout.unit)
      let valueCell = cell(layout.value)

      // The header row, and any section heading, land here and are simply not
      // measurements. They are not suspicious either: a row with no number in
      // its value column never claimed to be one.
      guard !label.isEmpty, !valueCell.isEmpty else { continue }

      let comparatorText = valueCell
        .replacingOccurrences(of: "≤", with: "<=")
        .replacingOccurrences(of: "≥", with: ">=")
      let comparator = firstMatch(#"^(<=|>=|<|>)"#, in: comparatorText).map { $0[1] }
      let (bareValue, gluedUnit) = splitGluedUnit(
        comparatorText
          .replacingOccurrences(of: #"^(<=|>=|<|>)\s*"#, with: "", options: .regularExpression)
          .replacingOccurrences(of: trailingFlag, with: "", options: .regularExpression))
      let numberText = bareValue
        .replacingOccurrences(of: trailingFlag, with: "", options: .regularExpression)
        .trimmingCharacters(in: .whitespaces)
      if unitRaw.isEmpty, let glued = gluedUnit { unitRaw = glued }
      if unitRaw.isEmpty, let embedded = unitFromLabel(label) {
        label = embedded.label
        unitRaw = embedded.unit
      }

      guard let value = parseNumber(numberText) else {
        if looksLikeMeasurement(row.line) { suspicious.append(row.line) }
        continue
      }

      // The unit column was chosen by quorum across the whole table, so a
      // non-empty cell in it is a unit even when the map has no UCUM code for
      // it. Such a row goes through as a raw value and `code` reports it as
      // `unknown-unit`, where a reviewer can see it. It used to be dropped
      // here, and because `looksLikeMeasurement` also relies on the map, a
      // row printed in `fl`, `pg` or `/pl` was not even reported as unread:
      // most of a blood count vanished without a trace (#186).
      //
      // An **empty** unit cell is the other half of the same duty. A row with
      // a label and a number, whose unit the recogniser did not read, is a
      // measurement we failed to transcribe, not an absence. Reported as
      // unread, never guessed: the unit selects the LOINC code, so inventing
      // one to make the row code is how HbA1c gets the wrong code. Measured on
      // iOS 26.5, where both Vision passes lost the lone `%` of an HbA1c row
      // and the whole row disappeared from the review screen (#186).
      guard !unitRaw.isEmpty else {
        if looksLikeMeasurement(row.line) || parseNumber(numberText) != nil {
          suspicious.append(row.line)
        }
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
    if let match = firstMatch(
      #"^(.*?)\s*\[\s*([A-Za-zÄÖÜäöü]{1,3})\s*\]\s*$"#, in: label)
    {
      return (match[1].trimmingCharacters(in: .whitespaces), match[2].uppercased())
    }
    // A Berlin laboratory prints the tube instead of the matrix, as a trailing
    // token or in parentheses: `Harnstoff HP`, `HbA1c(EDTA)`. Same meaning,
    // same handling: off the label, and checked against the blood list.
    if let match = firstMatch(
      #"^(.*?)\s*(?:\(\s*(HP|SE|SP|EDTA|CB|ZP|NAF|LH)\s*\)|\s(HP|SE|SP|EDTA|CB|ZP|NAF|LH))\s*$"#,
      in: label)
    {
      let code = match[2].isEmpty ? match[3] : match[2]
      return (match[1].trimmingCharacters(in: .whitespaces), code.uppercased())
    }
    return (label, nil)
  }

  /// Specimens that are definitely **not** blood, for a marker in parentheses.
  ///
  /// Brackets and parentheses are read differently on purpose. `[X]` is a
  /// matrix marker and is checked against a whitelist, because an unknown
  /// matrix might be urine and urine albumin is a different test. `(X)` is
  /// "Methode bzw. Material", as this laboratory's own legend puts it, so most
  /// of what appears there is a method (`(HPLC)`, `(n. Jaffe)`, `(mikr.Diff)`)
  /// and refusing everything unrecognised would refuse the whole sheet. Only a
  /// marker known to name another specimen is refused.
  static let nonBloodSpecimens: Set<String> = [
    "U", "URIN", "URINE", "SU", "LIQ", "LIQUOR", "CSF", "STUHL", "SPUTUM", "PUNKTAT", "ASZITES",
    "IU", "IURIN", "HARN", "IHARN",
  ]

  /// Matrices the analyte dictionary's codings are valid for.
  ///
  /// P plasma, S serum, B whole blood, the German spellings of the same, and
  /// the tube codes a laboratory prints for a blood sample: heparin plasma
  /// (`HP`, `LH`), serum (`SE`, `SP`), EDTA, citrate (`CB`, `ZP`), fluoride
  /// (`NAF`). Anything else is a different measurement wearing the same name.
  static let bloodSpecimens: Set<String> = [
    "P", "S", "B", "SE", "PL", "VB", "EDT", "HP", "SP", "EDTA", "CB", "ZP", "NAF", "LH",
  ]

  private static func parse(
    lines: [(line: String, lineNumber: Int, region: SourceRegion?)]
  ) -> ParseResult {
    var values: [RawLabValue] = []
    var suspicious: [String] = []

    for entry in lines {
      let line = entry.line
      let lineNumber = entry.lineNumber
      guard !line.trimmingCharacters(in: .whitespaces).isEmpty else { continue }

      // The first number on a line is not always the measurement. This
      // laboratory prints `HDL-Cholesterin Gen. 4 (SE) - 0.96 mmol/l`, where
      // the grammar's first match takes `4` as the value and `(SE)` as the
      // unit, fails the unit check, and the whole row is lost. So a match
      // whose unit is not a unit is not a failure: the search moves past that
      // number and tries again, and whatever was skipped belongs to the label.
      var searchFrom = line.startIndex
      var matched: (NSTextCheckingResult, String)?
      for _ in 0..<4 {
        guard searchFrom < line.endIndex else { break }
        let segment = String(line[searchFrom...])
        guard
          let candidate = lineRegex.firstMatch(
            in: segment, range: NSRange(segment.startIndex..., in: segment))
        else { break }

        let unitCandidate = Range(candidate.range(withName: "unit"), in: segment)
          .map { String(segment[$0]) } ?? ""
        let gluedCandidate = Range(candidate.range(withName: "glued"), in: segment)
          .map { String(segment[$0]) } ?? ""
        let printedUnit = unitCandidate.isEmpty ? gluedCandidate : unitCandidate
        if Analytes.normaliseUnit(printedUnit.trimmingCharacters(in: .whitespaces)) != nil
          || unitFromLabel(
            Range(candidate.range(withName: "label"), in: segment).map { String(segment[$0]) } ?? ""
          ) != nil
        {
          matched = (candidate, segment)
          break
        }
        guard let valueRange = Range(candidate.range(withName: "value"), in: segment) else { break }
        searchFrom = line.index(
          searchFrom, offsetBy: segment.distance(from: segment.startIndex, to: valueRange.upperBound))
      }

      guard let (m, segment) = matched else {
        if looksLikeMeasurement(line) { suspicious.append(line) }
        continue
      }
      // Everything before the match belongs to the label, not to nothing.
      let skipped = String(line[line.startIndex..<searchFrom])

      func group(_ name: String) -> String {
        guard let r = Range(m.range(withName: name), in: segment) else { return "" }
        return String(segment[r])
      }

      // The skipped prefix and the matched label are rejoined with the space
      // the grammar's leading `\s*` consumed, so the stored label is still
      // exactly what the laboratory printed.
      let matchedLabel = group("label")
      let head = skipped.trimmingCharacters(in: .whitespaces)
      var label =
        (head.isEmpty ? matchedLabel : head + " " + matchedLabel)
        .trimmingCharacters(in: .whitespaces)
      var unitRaw = group("unit").trimmingCharacters(in: .whitespaces)
      var rest = group("rest")
      if unitRaw.isEmpty { unitRaw = group("glued") }
      // `HbA1c mmol/mol Hb  34,3  < 42.0`: the unit is in the label and the
      // token after the value is the reference range's comparator. Take the
      // unit from the label and give the token back to the range.
      //
      // Only when the label is one printed cell and the remainder is exactly a
      // reference range. A label holding a column separator (two spaces) has
      // swallowed a unit column, which means the sheet prints unit before
      // value, `Natrium [P]  mmol/l  136 - 145  141`, and this grammar cannot
      // tell the result from the range's lower bound. The first version of
      // this rule read 136 there, a wrong number rather than a refused row.
      // Such a line stays unread here; the table path reads it by column role.
      if Analytes.normaliseUnit(unitRaw) == nil, !label.contains("  "),
        let embedded = unitFromLabel(label)
      {
        let candidate = (unitRaw + " " + rest).trimmingCharacters(in: .whitespaces)
        if candidate.isEmpty || isExactlyReferenceRange(candidate) {
          rest = candidate
          label = embedded.label
          unitRaw = embedded.unit
        }
      }
      // The unit column must actually be a unit; otherwise we have matched the
      // reference range or a comment and should not pretend otherwise.
      guard let value = parseNumber(group("value")), Analytes.normaliseUnit(unitRaw) != nil else {
        if looksLikeMeasurement(line) { suspicious.append(line) }
        continue
      }

      let ref = parseReferenceRange(rest)
      let cmpRaw = group("cmp").replacingOccurrences(of: "≤", with: "<=")
        .replacingOccurrences(of: "≥", with: ">=")

      values.append(
        RawLabValue(
          label: label,
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

  /// What a printed label says once its trailing qualifiers are taken off.
  struct LabelAnalysis {
    /// Spellings to try against the dictionary, longest first.
    let candidates: [String]
    /// A marker naming a specimen the codings are not valid for.
    let nonBloodSpecimen: String?
  }

  /// A trailing flag, printed between the label and the value.
  ///
  /// This laboratory prints `MCH (EB) + 2.1 fmol`, so the greedy label ends in
  /// a `+`. The flag is the lab's own arrow, never evidence: the printed
  /// reference range is what the reviewer reads.
  static func stripTrailingFlag(_ label: String) -> String {
    label.replacingOccurrences(
      of: #"[\s]+[*+!↑↓HL\-]{1,2}$"#, with: "", options: .regularExpression)
  }

  /// Takes a printed label apart into the spellings worth looking up.
  ///
  /// German laboratories append the method and the material to the analyte:
  /// `Kreatinin (n. Jaffe) i. S. (SI) (SE)` is creatinine. Each of those
  /// qualifiers is stripped in turn, and every intermediate spelling is kept as
  /// a candidate **with the full label first**, because a label may legitimately
  /// end in parentheses: `Lp(a)` is an analyte, not `Lp` with a qualifier.
  ///
  /// After the markers, a trailing token is dropped only when it looks like an
  /// abbreviation rather than a word: short, ending in a full stop, all capitals
  /// or a bare number. That is what reduces `Glukose SI`, `Neutrophile Granu.`
  /// and `HDL-Cholesterin Gen. 4` to labels the dictionary knows, while leaving
  /// `Cholesterin gesamt` and `Bilirubin, gesamt` alone.
  static func analyseLabel(_ printed: String) -> LabelAnalysis {
    var candidates: [String] = []
    var nonBlood: String?

    func remember(_ text: String) {
      let trimmed = text.trimmingCharacters(in: .whitespaces)
      guard !trimmed.isEmpty, !candidates.contains(trimmed) else { return }
      candidates.append(trimmed)
    }

    var current = printed.trimmingCharacters(in: .whitespaces)
    remember(current)
    current = stripTrailingFlag(current)
    remember(current)

    // Trailing markers, innermost last: `(SE)`, `[P]`, `i. S.`.
    while true {
      if let m = firstMatch(#"^(.*?)\s*\[\s*([A-Za-zÄÖÜäöü]{1,4})\s*\]\s*$"#, in: current) {
        let code = m[2].uppercased()
        // A bracketed matrix is checked against the whitelist, as before.
        if !bloodSpecimens.contains(code) { nonBlood = nonBlood ?? code }
        current = m[1]
      } else if let m = firstMatch(
        // Either delimiter on either side: a recogniser reads `(i.Plasma)` as
        // `(i.Plasma]` often enough that demanding a matching pair loses the row.
        #"^(.*?)\s*[(\[]\s*([^()\[\]]{1,24})\s*[)\]]\s*$"#, in: current)
      {
        let code = m[2].uppercased().filter { $0.isLetter }
        if nonBloodSpecimens.contains(code) { nonBlood = nonBlood ?? code }
        current = m[1]
      } else if let m = firstMatch(
        #"^(.*?)\s+i\.\s?([SsPpUu])\.?\s*$"#, in: current)
      {
        // `i. S.` is serum and `i. U.` is urine. Urine albumin and serum
        // albumin are different tests that share a name, so the second must
        // refuse rather than be stripped and looked up.
        if m[2].uppercased() == "U" { nonBlood = nonBlood ?? "U" }
        current = m[1]
      } else if let m = firstMatch(
        #"^(.*?)\s+(HP|SE|SP|EDTA|CB|ZP|NAF|LH|EB)\s*$"#, in: current)
      {
        // A bare tube code, `Harnstoff HP`.
        current = m[1]
      } else {
        break
      }
      current = stripTrailingFlag(current.trimmingCharacters(in: .whitespaces))
      remember(current)
    }

    // Then the abbreviations around the name: a qualifier at the end (`SI`,
    // `Gen.`, `4`, `Granu.`) and the short code practice software prints in a
    // column of its own at the front (`leuco Leukozyten`, `VITDT 25-OH
    // Vitamin D`).
    //
    // Both ends are considered together rather than one after the other,
    // because doing them in sequence destroys the answer: `b12 Vitamin B12`
    // loses its `B12` to the trailing rule and is left as `b12 Vitamin`, which
    // names nothing. Candidates are produced fewest-drops-first, so the most
    // specific spelling is always tried before a shorter one.
    //
    // Dropping a leading token is far more dangerous than dropping a trailing
    // one, because `HDL Cholesterin` would become total cholesterol, a
    // different analyte with a different reference range. So a code comes off
    // only when it does not itself name an analyte, or when it names the same
    // one as what is left. `hdl Cholesterin-HDL` passes that test;
    // `HDL Cholesterin` does not, and is left to the dictionary, which knows it.
    let tokens = current.split(whereSeparator: { $0.isWhitespace }).map(String.init)
    if tokens.count > 1 {
      let limit = min(3, tokens.count - 1)
      for total in 1...(2 * limit) {
        for lead in 0...min(limit, total) {
          let trail = total - lead
          guard trail <= limit, lead + trail < tokens.count else { continue }
          let dropped = tokens[..<lead]
          let kept = tokens[lead..<(tokens.count - trail)]
          guard dropped.allSatisfy(looksLikeLeadingCode),
            tokens[(tokens.count - trail)...].allSatisfy(looksLikeQualifier)
          else { continue }
          let candidate = kept.joined(separator: " ")
          let candidateKey = Analytes.analyteKey(forLabel: candidate)
          let disagrees = dropped.contains { code in
            let codeKey = Analytes.analyteKey(forLabel: code)
            return codeKey != nil && codeKey != candidateKey
          }
          guard !disagrees else { continue }
          remember(candidate)
        }
      }
    }

    return LabelAnalysis(candidates: candidates, nonBloodSpecimen: nonBlood)
  }

  /// True for a token that could be a practice system's own short code.
  ///
  /// Short, and letters and digits only, so `i.S.` and `Alk.` are left to the
  /// marker rules above and an ordinary word is never taken for a code.
  static func looksLikeLeadingCode(_ token: String) -> Bool {
    !token.isEmpty && token.count <= 8 && token.allSatisfy { $0.isLetter || $0.isNumber }
  }

  /// True for a token that annotates an analyte rather than naming one.
  static func looksLikeQualifier(_ token: String) -> Bool {
    let bare = token.filter { !".,:;".contains($0) }
    guard !bare.isEmpty else { return true }
    if bare.allSatisfy({ $0.isNumber }) { return true }
    if token.hasSuffix(".") { return true }
    if bare.count <= 4, bare.allSatisfy({ $0.isUppercase || $0.isNumber }) { return true }
    return false
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
      // markers come off before lookup, and a marker naming another specimen
      // is refused outright: urine albumin and serum albumin are different
      // tests that share a name.
      let analysis = analyseLabel(raw.label)
      if analysis.nonBloodSpecimen != nil {
        unmapped.append(UnmappedLabValue(raw: raw, reason: .specimenNotSupported))
        continue
      }

      // The dictionary arbitrates. The full spelling is tried first, so a label
      // that legitimately ends in parentheses keeps them.
      var coding: AnalyteCoding?
      var knownInAnotherUnit = false
      for candidate in analysis.candidates {
        if let hit = Analytes.lookup(label: candidate, unit: raw.unitRaw) {
          coding = hit
          break
        }
        if Analytes.knowsLabel(candidate) { knownInAnotherUnit = true }
      }

      if let coding {
        coded.append(CodedLabValue(raw: raw, coding: coding, source: source))
      } else if knownInAnotherUnit {
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

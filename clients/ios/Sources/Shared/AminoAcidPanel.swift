import Foundation

/// Reads a home amino acid test that prints each result on two lines
/// (numbers invented):
///
///     Isoleucin 26 – 105 nmol/ml
///     61.4 nmol/ml
///
/// The name and the normal range on one line, the result below it, above a
/// coloured bar. The line grammar reads the first line as a range with no
/// value and the second as a value with no name, so it read nothing.
///
/// Three things the PDF's text layer does that a reader has to survive,
/// measured on a real one:
///
/// - It breaks names into kerning fragments on lines of their own:
///   `Phenylala` / `nin 31 – 75 nmol/ml`. Letters are joined across lines.
/// - It sometimes hands the fragments over out of order: `G mm a a b -Amino
///   uttersäure`. A name is recognised by its letters in order first and,
///   failing that, by the same letters in any order, which for a name of
///   eight letters or more is never another amino acid.
/// - It splits a row around its result: `Threonin 50`, `89.5 nmol/ml`,
///   `– 141 nmol/ml`. The lower bound is the number with no unit, the upper
///   the one after the dash, the result the other one with a unit.
///
/// Every result is printed a second time on the detail pages, `Ihr
/// gemessener Isoleucin-Wert beträgt 61.4 nmol/ml`. A result its twin
/// contradicts is not read. A row whose range is not a range is not read.
public enum AminoAcidPanel {

  /// The names such a panel prints. Each is a label of the dictionary.
  static let names: [String] = [
    "Isoleucin", "Leucin", "Lysin", "Methionin", "Phenylalanin", "Threonin", "Tryptophan",
    "Valin", "Histidin", "Arginin", "Asparagin", "Glutamin", "Glycin", "Glyzin", "Prolin",
    "Tyrosin", "Alanin", "Asparaginsäure", "Aspartat", "Beta-Alanin", "Citrullin", "Cystein",
    "Gamma-Aminobuttersäure", "Glutaminsäure", "Glutamat", "Homoarginin", "Ornithin",
    "Sarkosin", "Sarcosin", "Serin", "Taurin",
  ]

  /// Longest first, so `Homoarginin` is tried before `Arginin` and
  /// `Beta-Alanin` before `Alanin`.
  private static let byLength: [(name: String, letters: [Character])] =
    names.map { ($0, letters($0)) }.sorted { $0.letters.count > $1.letters.count }

  private static func letters(_ text: String) -> [Character] {
    Array(text.lowercased().filter(\.isLetter))
  }

  private enum Token: Equatable {
    case word(String)
    case number(Double, printed: String)
    case unit(String)
    case dash
    case comparator(Comparator)
  }

  // The unit first, so `nmol/ml` is not read as a word and a slash. A hyphen
  // between letters joins a name (`Beta-Alanin`) and is skipped; one before
  // a number or a space is the range's dash.
  private static let tokenPattern = try! NSRegularExpression(
    pattern:
      #"([nµμu]mol\s*/\s*(?:ml|l))(?![A-Za-z])|(\d+(?:[.,]\d+)?)|(\p{L}+)|([–—-])(?!\s*\p{L})|([<>≤≥])"#,
    options: [.caseInsensitive])

  private static func tokens(_ text: String) -> [Token] {
    let range = NSRange(text.startIndex..., in: text)
    return tokenPattern.matches(in: text, range: range).compactMap { m in
      func group(_ i: Int) -> String? {
        Range(m.range(at: i), in: text).map { String(text[$0]) }
      }
      if let unit = group(1) { return .unit(unit.replacingOccurrences(of: " ", with: "")) }
      if let printed = group(2), let value = PrintedFields.decimal(printed) {
        return .number(value, printed: printed)
      }
      if let word = group(3) { return .word(word) }
      if group(4) != nil { return .dash }
      switch group(5) {
      case "<", "≤": return .comparator(group(5) == "<" ? .lessThan : .lessOrEqual)
      case ">", "≥": return .comparator(group(5) == ">" ? .greaterThan : .greaterOrEqual)
      default: return nil
      }
    }
  }

  /// The amino acid a run of letters ends with, or nil.
  static func name(endingWith run: [Character]) -> String? {
    for candidate in byLength where run.count >= candidate.letters.count {
      if Array(run.suffix(candidate.letters.count)) == candidate.letters { return candidate.name }
    }
    for candidate in byLength where candidate.letters.count >= 8 && run.count >= candidate.letters.count {
      if run.suffix(candidate.letters.count).sorted() == candidate.letters.sorted() {
        return candidate.name
      }
    }
    return nil
  }

  private struct Row {
    let name: String
    var low: Double?
    var high: Double?
    var value: Double?
    var comparator: Comparator?
    var unit: String?
    var sawDash = false
    var printed: [String] = []

    var isComplete: Bool { low != nil && high != nil && value != nil && unit != nil }
  }

  public static func read(pageTexts: [String]) -> [RawLabValue] {
    let text = pageTexts.joined(separator: "\n")
    let stream = tokens(text)
    var run: [Character] = []
    var row: Row?
    var pending: Comparator?
    var read: [Row] = []

    for (index, token) in stream.enumerated() {
      let next = index + 1 < stream.count ? stream[index + 1] : nil
      switch token {
      case .word(let word):
        // Words inside a row mean the row ended without its result.
        row = nil
        pending = nil
        run.append(contentsOf: letters(word))
      case .comparator(let comparator):
        pending = comparator
      case .dash:
        if row?.low != nil { row?.sawDash = true }
      case .unit(let unit):
        if row != nil {
          if let seen = row?.unit, seen.lowercased() != unit.lowercased() { row = nil } else { row?.unit = unit }
        }
      case .number(let value, let printed):
        if row == nil {
          guard let name = name(endingWith: run) else {
            run = []
            pending = nil
            continue
          }
          row = Row(name: name)
        }
        guard var current = row else { continue }
        if case .unit = next {
          if current.sawDash, current.high == nil {
            current.high = value
            current.printed.append("– \(printed)")
          } else if current.value == nil {
            current.value = value
            current.comparator = pending
            current.printed.append("\(pending?.rawValue ?? "")\(printed)")
          } else {
            row = nil
            continue
          }
        } else if current.low == nil, !current.sawDash, pending == nil {
          current.low = value
          current.printed.append(printed)
        } else {
          row = nil
          continue
        }
        pending = nil
        row = current
      }
      if let done = row, done.isComplete {
        read.append(done)
        row = nil
        run = []
      }
    }

    // The detail pages repeat each result in a sentence.
    let compact = text.filter { !$0.isWhitespace }
    var seen: Set<String> = []
    var values: [RawLabValue] = []
    for row in read {
      guard let low = row.low, let high = row.high, let value = row.value, let unit = row.unit,
        low < high, !seen.contains(row.name)
      else { continue }
      seen.insert(row.name)
      if let twin = stated(row.name, in: compact), !PrintedFields.agree(twin, value, within: 0.005) {
        continue
      }
      let range = "\(PrintedFields.text(low)) – \(PrintedFields.text(high))"
      values.append(
        RawLabValue(
          label: row.name, value: value, unitRaw: unit, comparator: row.comparator,
          referenceLow: low, referenceHigh: high, referenceText: range,
          line: "\(row.name) \(range) \(unit) \(row.comparator?.rawValue ?? "")\(PrintedFields.text(value)) \(unit)",
          lineNumber: 9900 + values.count))
    }
    return values
  }

  /// The result the sentence `Ihr gemessener <name>-Wert beträgt <value>`
  /// states, read with every space taken out, because the text layer puts
  /// its own spaces into the middle of words.
  private static func stated(_ name: String, in compact: String) -> Double? {
    let label = NSRegularExpression.escapedPattern(for: name.filter { !$0.isWhitespace })
    let printed = PrintedFields.firstGroup(
      "gemessener" + label + #"-Wertbeträgt[<>≤≥]?(\d+(?:[.,]\d+)?)"#, in: compact)
    return printed.flatMap(PrintedFields.decimal)
  }

  /// The panel's reading in place of the line grammar's, when it reads more.
  /// A laboratory's aminogram that the grammar already reads row by row is
  /// left to the grammar.
  public static func applied(to sheet: ExtractionResult, pageTexts: [String]) -> ExtractionResult {
    let values = read(pageTexts: pageTexts)
    guard values.count >= 5, values.count > sheet.coded.count else { return sheet }
    return PrintedFields.replacing(sheet, with: values, minimum: 5)
  }
}

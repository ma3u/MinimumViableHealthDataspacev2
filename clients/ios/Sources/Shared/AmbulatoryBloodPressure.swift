import Foundation

/// Reads a 24-hour ambulatory blood pressure report (ABPM).
///
/// Such a report summarises a day of cuff readings in a grid: one row each
/// for systolic, diastolic, pulse, mean arterial pressure and pulse pressure,
/// and for each of three periods (whole recording, day, night) five columns:
/// minimum, mean, maximum, standard deviation and the share above the limit.
/// The text recogniser reads that grid column by column, and the line grammar
/// then sees `SYS 98 118 151 12,5 14% 100 124 …`, numbers that have lost their
/// column. The table pass shifts cells too. So this reads the grid by
/// geometry: every number belongs to the row its height matches and the
/// column its horizontal position falls in.
///
/// Only the means are taken, each coded as the period it summarises (the
/// dictionary's `… 24-h-Mittel`, `… Tagesmittel`, `… Nachtmittel`), because
/// those are what ESC/ESH 2023 judges by. A mean is kept only when the
/// minimum and maximum of its period are found in the same row and bracket it;
/// anything else is refused, never guessed. The night-to-day fall (dipping)
/// is read from its own small table.
public enum AmbulatoryBloodPressure {

  /// True for a page that prints the ambulatory summary grid.
  public static func looksLike(_ text: String) -> Bool {
    let t = text.lowercased()
    let grid = t.contains("sys") && t.contains("dia") && t.contains("nacht") && t.contains("mittel")
    return grid && (t.contains("abpm") || t.contains("blutdruck") || t.contains("mmhg"))
  }

  /// The rows of the grid: the label the sheet prints, the dictionary's name
  /// for it, and its unit.
  static let rows: [(printed: String, name: String, unit: String)] = [
    ("SYS", "Systolischer Blutdruck", "mmHg"),
    ("DIA", "Diastolischer Blutdruck", "mmHg"),
    ("Puls", "Puls", "/min"),
    ("MAD", "Mittlerer arterieller Druck", "mmHg"),
    ("PP", "Pulsdruck", "mmHg"),
  ]

  /// The periods, in the order the grid prints them, with the header each
  /// block must sit under.
  static let periods: [(header: String, suffix: String, words: String)] = [
    ("Gesamt", "24-h-Mittel", "24 hours"),
    ("Tag", "Tagesmittel", "day"),
    ("Nacht", "Nachtmittel", "night"),
  ]

  private struct Point {
    let text: String
    let value: Double
    let x: Double
    let y: Double
    let height: Double
    let region: SourceRegion
  }

  /// The means of the grid and the dipping figures, as raw values the
  /// dictionary codes. Empty when the grid cannot be read with certainty.
  public static func read(
    text: String, fragments: [DocumentReconciler.TextFragment],
    cells: [DocumentReconciler.Cell] = []
  ) -> [RawLabValue] {
    guard looksLike(text) else { return [] }
    // The plain text, the table cells and the fragments, because each can
    // lose a row of the dipping table that another kept (measured on a real
    // sheet: only the table pass had `Puls -13,8%` whole).
    let lines = ([text] + cells.map(\.text) + fragments.map(\.text)).joined(separator: "\n")
    return means(in: fragments) + dipping(in: lines)
  }

  /// Every page's ambulatory summary, coded. The import and the replay call
  /// this one function, so the phone and `ScanReplay` cannot read it apart.
  public static func extract(
    pageTexts: [String], pages: [ScanDiagnostics.Page], source: SourceKind
  ) -> ExtractionResult {
    var coded: [CodedLabValue] = []
    var unmapped: [UnmappedLabValue] = []
    for (index, text) in pageTexts.enumerated() {
      let page = index < pages.count ? pages[index] : nil
      let found = read(text: text, fragments: page?.fragments ?? [], cells: page?.cells ?? [])
      for raw in found {
        if let coding = Analytes.lookup(label: raw.label, unit: raw.unitRaw) {
          coded.append(CodedLabValue(raw: raw, coding: coding, source: source))
        } else {
          unmapped.append(UnmappedLabValue(raw: raw, reason: .unknownAnalyte))
        }
      }
    }
    return ExtractionResult(coded: coded, unmapped: unmapped, suspiciousLines: [], source: source)
  }

  /// The grid's own rows, which the line grammar lists as unread although
  /// this reader has taken their values. Dropped only when it has.
  public static func withoutGridLines(_ extraction: ExtractionResult, read: ExtractionResult)
    -> ExtractionResult
  {
    guard !read.coded.isEmpty else { return extraction }
    let grid = #"^\s*(SYS|DIA|Puls|MAD|PP)\s+-?\d"#
    return ExtractionResult(
      coded: extraction.coded, unmapped: extraction.unmapped,
      suspiciousLines: extraction.suspiciousLines.filter {
        $0.range(of: grid, options: .regularExpression) == nil
      },
      source: extraction.source)
  }

  static func means(in fragments: [DocumentReconciler.TextFragment]) -> [RawLabValue] {
    let numbers: [Point] = fragments.compactMap { fragment in
      let raw = fragment.text.trimmingCharacters(in: .whitespaces)
      guard raw.range(of: #"^\d+([.,]\d+)?%?$"#, options: .regularExpression) != nil,
        let value = LabLineParser.parseNumber(raw.replacingOccurrences(of: "%", with: ""))
      else { return nil }
      let r = fragment.region
      return Point(
        text: raw, value: value, x: r.x + r.width / 2, y: r.y + r.height / 2, height: r.height,
        region: r)
    }

    // The row labels, top to bottom, at the left edge of the grid. The same
    // word appears elsewhere (the dipping table), so for each label the one
    // with the most numbers level with it, allowing for skew, is the grid's.
    var labels: [(row: (printed: String, name: String, unit: String), x: Double, y: Double)] = []
    for row in rows {
      let candidates = fragments.filter { $0.text.trimmingCharacters(in: .whitespaces) == row.printed }
      let scored = candidates.map { label -> (DocumentReconciler.TextFragment, Int) in
        let y = label.region.y + label.region.height / 2
        return (label, numbers.filter { abs($0.y - y) < 0.03 && $0.x > label.region.x }.count)
      }
      if let best = scored.max(by: { $0.1 < $1.1 }), best.1 >= 9 {
        let r = best.0.region
        labels.append((row, r.x + r.width, r.y + r.height / 2))
      }
    }
    labels.sort { $0.y > $1.y }
    guard labels.count >= 3 else { return [] }
    let spacing = zip(labels, labels.dropFirst()).map { $0.y - $1.y }.sorted()[(labels.count - 1) / 2]
    let left = labels.map(\.x).max() ?? 0
    let band = numbers.filter {
      $0.x > left && $0.y > labels.last!.y - spacing && $0.y < labels.first!.y + spacing + 0.03
    }

    // The columns, by horizontal position: fifteen, three blocks of five, or
    // the grid is not this grid.
    var columns: [[Point]] = []
    for point in band.sorted(by: { $0.x < $1.x }) {
      if let last = columns.last?.last, point.x - last.x < 0.02 {
        columns[columns.count - 1].append(point)
      } else {
        columns.append([point])
      }
    }
    columns = columns.filter { $0.count >= 2 }
    guard columns.count == 15 else { return [] }
    let centres = columns.map { $0.map(\.x).reduce(0, +) / Double($0.count) }

    // A photograph is rarely square to the page: a row climbs or falls from
    // left to right (measured on a real sheet: 0.001 to 0.013 of the page
    // height, with rows 0.016 apart). The offset is fitted as a straight line
    // through the columns that hold one number per row.
    var fit: [(x: Double, offset: Double)] = []
    for (index, column) in columns.enumerated() where column.count == labels.count {
      let ys = column.map(\.y).sorted(by: >)
      let offset = zip(ys, labels).map { $0 - $1.y }.reduce(0, +) / Double(labels.count)
      fit.append((centres[index], offset))
    }
    guard fit.count >= 3 else { return [] }
    let mx = fit.map(\.x).reduce(0, +) / Double(fit.count)
    let my = fit.map(\.offset).reduce(0, +) / Double(fit.count)
    let sxx = fit.map { ($0.x - mx) * ($0.x - mx) }.reduce(0, +)
    let slope = sxx > 0 ? fit.map { ($0.x - mx) * ($0.offset - my) }.reduce(0, +) / sxx : 0
    func offset(at x: Double) -> Double { my + slope * (x - mx) }

    // Each block must sit under its own header, in the printed order.
    for (block, period) in periods.enumerated() {
      let from = centres[block * 5] - 0.08
      let to = centres[block * 5 + 4]
      let header = fragments.contains {
        $0.text.trimmingCharacters(in: .whitespaces).hasPrefix(period.header)
          && $0.region.x >= from && $0.region.x <= to
      }
      guard header else { return [] }
    }

    /// The one number in this row and column, or nil when there is none or
    /// more than one.
    func cell(row: Int, column: Int) -> Point? {
      let expected = labels[row].y + offset(at: centres[column])
      let matches = columns[column].filter {
        abs($0.y - expected) < spacing * 0.35 && !$0.text.hasSuffix("%")
      }
      return matches.count == 1 ? matches[0] : nil
    }

    var values: [RawLabValue] = []
    for (index, entry) in labels.enumerated() {
      for (block, period) in periods.enumerated() {
        guard let low = cell(row: index, column: block * 5),
          let mean = cell(row: index, column: block * 5 + 1),
          let high = cell(row: index, column: block * 5 + 2),
          low.value <= mean.value, mean.value <= high.value
        else { continue }
        values.append(
          RawLabValue(
            label: "\(entry.row.name) \(period.suffix)", value: mean.value, unitRaw: entry.row.unit,
            line: "\(entry.row.printed) \(period.header) Mittel. \(mean.text) (Min. \(low.text), Max. \(high.text))",
            lineNumber: 9000 + index * 10 + block, region: mean.region))
      }
    }
    return values
  }

  /// The night-to-day fall, from the small "Dipping" table: `SYS -14,5 %`.
  static func dipping(in text: String) -> [RawLabValue] {
    // The recogniser's reading order can put a row of this table before the
    // word "Dipping" itself (measured: the pulse row), so the whole page is
    // searched, but only on a page that has the table.
    guard text.contains("Dipping") else { return [] }
    let names = ["SYS": "systolisch", "DIA": "diastolisch", "Puls": "Puls"]
    var values: [RawLabValue] = []
    var seen = Set<String>()
    for (number, line) in text.split(separator: "\n").enumerated() {
      let trimmed = line.trimmingCharacters(in: .whitespaces)
      guard
        let match = trimmed.range(
          of: #"^(SYS|DIA|Puls)\s+-?\s?\d+([.,]\d+)?\s*%"#, options: .regularExpression)
      else { continue }
      let cell = String(trimmed[match])
      let parts = cell.split(separator: " ", maxSplits: 1).map(String.init)
      guard parts.count == 2, let name = names[parts[0]], seen.insert(name).inserted else { continue }
      let figure = parts[1].replacingOccurrences(of: "%", with: "")
        .replacingOccurrences(of: " ", with: "")
      let negative = figure.hasPrefix("-")
      guard let value = LabLineParser.parseNumber(figure.replacingOccurrences(of: "-", with: ""))
      else { continue }
      values.append(
        RawLabValue(
          label: "Nächtliche Absenkung \(name)", value: negative ? -value : value, unitRaw: "%",
          line: cell, lineNumber: 9100 + number))
    }
    return values
  }
}

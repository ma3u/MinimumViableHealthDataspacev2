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
/// is read from its own small table and checked against those means.
///
/// The codes follow what LOINC has. It names the 24-hour means (`8490-5`,
/// `8472-3`, `41924-2`) and has no daytime or nighttime mean at all, only
/// fixed 8- and 12-hour windows that a 16-hour day or a 7-hour night is not
/// (checked against the NLM clinical tables, 2026-10-11). So a day or night
/// mean carries the plain mean code (`96608-5`, `96609-3`, `103205-1`) and
/// its period in the label; the dipping figures carry no code.
///
/// The patient header prints height, weight and body-mass index as one row
/// of pairs, which the line grammar reads one value of at best; they are read
/// here too, each checked against the other two.
///
/// Where a comment below quotes a sheet, the shape is a real sheet's and the
/// numbers are invented (README, rule 1).
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
    let means = means(in: fragments)
    // The header as printed rows, so a label and a value the recogniser
    // returned as separate fragments (`BMI`, `24,2`) are on one line again.
    let rows = fragments.isEmpty ? "" : VisionDocumentReader.readingOrder(fragments)
    let header = (text + "\n" + rows).components(separatedBy: .newlines)
    return means + corroborated(dipping(in: lines), by: means)
      + bodyMeasures(in: header, fragments: fragments)
  }

  /// The line grammar's reading of a sheet with this reader's values in it
  /// and the rows this reader accounts for taken out. The import and the
  /// replay both call this, so the phone and `ScanReplay` cannot differ.
  public static func applied(
    to sheet: ExtractionResult, pageTexts: [String], pages: [ScanDiagnostics.Page]
  ) -> ExtractionResult {
    let read = extract(pageTexts: pageTexts, pages: pages, source: sheet.source)
    return withoutGridLines(sheet, read: read).merging(read)
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

  /// What the line grammar made of the rows this reader has taken. Dropped
  /// only when it has taken something, so an ordinary sheet is untouched.
  ///
  /// - A value under one of the grid's row labels is a grid or dipping cell
  ///   the grammar took for an analyte. Measured on a real sheet: `DIA 23 %`,
  ///   the dipping row, arrived as a diastolic pressure in percent.
  /// - A code this reader produced is this reader's. The grammar's copy of a
  ///   header field (on the phone, `Gewicht 80 kg` with `BMI 24,2` taken for
  ///   its reference range) would otherwise be listed twice.
  /// - Unread lines that are grid rows, the device's limit lines, or lines
  ///   whose every number this reader took (`182 cm 24,2`, the header broken
  ///   differently) are not unread.
  public static func withoutGridLines(_ extraction: ExtractionResult, read: ExtractionResult)
    -> ExtractionResult
  {
    let taken = read.coded.map(\.raw) + read.unmapped.map(\.raw)
    guard !taken.isEmpty else { return extraction }
    let gridLabels = Set(rows.map(\.printed))
    let codes = Set(read.coded.compactMap(\.coding.loinc))
    func isGridCell(_ raw: RawLabValue) -> Bool {
      gridLabels.contains(raw.label.trimmingCharacters(in: .whitespaces))
    }
    let grid = #"^\s*(SYS|DIA|Puls|MAD|PP)\s+-?\s?\d"#
    let limits = #"^\s*Limi\S*\s*:"#
    let values = taken.map(\.value)
    return ExtractionResult(
      coded: extraction.coded.filter {
        !isGridCell($0.raw) && !($0.coding.loinc.map(codes.contains) ?? false)
      },
      unmapped: extraction.unmapped.filter { !isGridCell($0.raw) },
      suspiciousLines: extraction.suspiciousLines.filter { line in
        line.range(of: grid, options: .regularExpression) == nil
          && line.range(of: limits, options: .regularExpression) == nil
          && !accountedFor(line, by: values)
      },
      source: extraction.source)
  }

  /// True when the line has numbers and every one of them is a value this
  /// reader took, sign aside.
  static func accountedFor(_ line: String, by values: [Double]) -> Bool {
    guard let re = try? NSRegularExpression(pattern: #"\d+(?:[.,]\d+)?"#) else { return false }
    let ns = line as NSString
    let numbers = re.matches(in: line, range: NSRange(location: 0, length: ns.length))
      .compactMap { LabLineParser.parseNumber(ns.substring(with: $0.range)) }
    guard !numbers.isEmpty else { return false }
    return numbers.allSatisfy { n in values.contains { abs(abs($0) - n) < 0.0001 } }
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

  /// The dipping figures, checked against the grid's means.
  ///
  /// The device computes the fall as (night mean − day mean) / day mean, so
  /// the two tables state it twice. A figure that agrees is kept. A figure
  /// whose size agrees and which was read with no sign at all takes the sign
  /// of the means: measured on a real sheet, the recogniser returned the
  /// diastolic `-23 %` as `23%`, which would read as a rise at night where
  /// the sheet says "Extreme Dipper". Anything else is refused. Without both
  /// means there is nothing to check against, and the figure stands as read.
  static func corroborated(_ dips: [RawLabValue], by means: [RawLabValue]) -> [RawLabValue] {
    let rowFor = [
      "systolisch": "Systolischer Blutdruck", "diastolisch": "Diastolischer Blutdruck",
      "Puls": "Puls",
    ]
    func mean(_ label: String) -> Double? { means.first { $0.label == label }?.value }
    return dips.compactMap { dip in
      let key = dip.label.replacingOccurrences(of: "Nächtliche Absenkung ", with: "")
      guard let row = rowFor[key], let day = mean("\(row) Tagesmittel"),
        let night = mean("\(row) Nachtmittel"), day > 0
      else { return dip }
      let expected = (night - day) / day * 100
      // The means are printed as whole numbers. This is how far that rounding
      // alone can move the fall, plus the last printed digit of the figure.
      let tolerance = (0.5 / day + 0.5 * night / (day * day)) * 100 + 0.1
      if abs(dip.value - expected) <= tolerance { return dip }
      let figure = dip.line.drop { !$0.isWhitespace }
      let signed = figure.contains { "-+−".contains($0) }
      guard !signed, abs(-dip.value - expected) <= tolerance else { return nil }
      return RawLabValue(
        label: dip.label, value: -dip.value, unitRaw: dip.unitRaw, line: dip.line,
        lineNumber: dip.lineNumber, region: dip.region)
    }
  }

  /// Height, weight and body-mass index from the patient header:
  /// `Größe 182 cm   Gewicht 80 kg   BMI 24,2`, as one printed row.
  ///
  /// The line grammar takes one value from a line, does not take a unit
  /// glued to its number (`80kg`, as the recogniser read a real sheet) and
  /// refuses the BMI, which prints no unit. On a tilted photograph the
  /// recogniser's reading order also puts a field's name and its value on
  /// different lines (measured on the phone: `Größe  Alter  Pacemaker`, then
  /// `182 cm  52  24,2`), so each name is also paired with the nearest number
  /// to its right. A field is kept only when every place it was read agrees
  /// on it, and when all three are present the BMI must be the weight over
  /// the squared height, or none of them is kept: one of the three is then
  /// misread and nothing says which.
  static func bodyMeasures(in lines: [String], fragments: [DocumentReconciler.TextFragment])
    -> [RawLabValue]
  {
    let fields: [(label: String, head: String, pattern: String, unit: String, range: ClosedRange<Double>)] = [
      (
        "Körpergröße", #"^Gr(?:ö|o|oe)(?:ß|ss)e$"#,
        #"\bGr(?:ö|o|oe)(?:ß|ss)e\s*:?\s*(\d{2,3}(?:[.,]\d)?)\s*cm\b"#, "cm", 100...230
      ),
      (
        "Körpergewicht", #"^Gewicht$"#,
        #"\bGewicht\s*:?\s*(\d{2,3}(?:[.,]\d{1,2})?)\s*kg\b"#, "kg", 25...300
      ),
      (
        "Body-Mass-Index", #"^BMI$"#,
        #"\bBMI\s*[:=]?\s*(\d{2}(?:[.,]\d{1,2})?)(?![\d.,%])"#, "kg/m2", 12...70
      ),
    ]

    // Every place a field can be read: the lines as given, each fragment on
    // its own (`Gewicht 80kg` is often one), and each name paired with its
    // value. A pair is written in the printed form, so one grammar reads all.
    var sources: [(text: String, region: SourceRegion?)] =
      lines.map { ($0, nil) } + fragments.map { ($0.text, $0.region) }
    let number = #"^(\d{2,3}(?:[.,]\d{1,2})?)\s*(cm|kg)?$"#
    for field in fields {
      for head in fragments where head.text.trimmingCharacters(in: .whitespaces)
        .range(of: field.head, options: [.regularExpression, .caseInsensitive]) != nil
      {
        let right = head.region.x + head.region.width
        let candidates = fragments.filter {
          $0.region.x > right && $0.region.x < right + 0.2
            && abs($0.region.midY - head.region.midY) < head.region.height * 1.5
            && $0.text.trimmingCharacters(in: .whitespaces)
              .range(of: number, options: .regularExpression) != nil
        }
        // The nearest in height wins; the next field's value sits a column on.
        guard
          let value = candidates.min(by: {
            abs($0.region.midY - head.region.midY) < abs($1.region.midY - head.region.midY)
          })
        else { continue }
        var text = value.text.trimmingCharacters(in: .whitespaces)
        if field.unit != "kg/m2", text.range(of: #"\d$"#, options: .regularExpression) != nil {
          text += " " + field.unit
        }
        sources.append(("\(head.text.trimmingCharacters(in: .whitespaces)) \(text)", value.region))
      }
    }

    var picked: [String: (value: Double, line: String, region: SourceRegion?)] = [:]
    for field in fields {
      guard let re = try? NSRegularExpression(pattern: field.pattern, options: [.caseInsensitive])
      else { continue }
      var seen: [(value: Double, line: String, region: SourceRegion?)] = []
      for source in sources {
        let ns = source.text as NSString
        for match in re.matches(in: source.text, range: NSRange(location: 0, length: ns.length)) {
          guard let value = LabLineParser.parseNumber(ns.substring(with: match.range(at: 1))),
            field.range.contains(value)
          else { continue }
          let printed = ns.substring(with: match.range)
            .components(separatedBy: .whitespaces).filter { !$0.isEmpty }.joined(separator: " ")
          seen.append((value, printed, source.region))
        }
      }
      guard let first = seen.first, seen.allSatisfy({ $0.value == first.value }) else { continue }
      picked[field.label] = (first.value, first.line, seen.compactMap(\.region).first)
    }
    if let height = picked["Körpergröße"]?.value, let weight = picked["Körpergewicht"]?.value,
      let bmi = picked["Body-Mass-Index"]?.value
    {
      // Whole centimetres and kilograms move a BMI by up to about 0.35.
      guard abs(weight / ((height / 100) * (height / 100)) - bmi) <= 0.4 else { return [] }
    }

    return fields.enumerated().compactMap { index, field in
      guard let found = picked[field.label] else { return nil }
      return RawLabValue(
        label: field.label, value: found.value, unitRaw: field.unit, line: found.line,
        lineNumber: 9200 + index, region: found.region)
    }
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

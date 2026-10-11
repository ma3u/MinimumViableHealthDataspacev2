import Foundation

/// Reads the measurements a resting 12-lead electrocardiograph prints above
/// its tracing: ventricular rate, PR (German "PQ") interval, QRS duration,
/// QT and QTc, and the P, QRS and T axes.
///
/// Such a printout is landscape, so a phone photographs it turned by a
/// quarter, and the recogniser returns its text as columns. The line grammar
/// sees `392/398  148` and `-41 18  98  148 ms`, numbers that have lost their
/// label. So this reads by geometry instead: each label sits on a line of
/// text, its value further along the same line, whichever way the page is
/// turned. The values are printed right-aligned in one column and the three
/// axes straddle it (`-12  41  18`: P before the column, QRS in it, T in the
/// unit column after it), which is how an axis is told from the next.
///
/// Two checks stand between a misread number and a stored value:
/// - A device prints the same block on every page of one recording. A value
///   read differently on different pages is kept only when at least two
///   pages agree on it and outnumber the rest; otherwise it is refused.
/// - QTc by Bazett is QT divided by the square root of the beat-to-beat
///   interval, 60 / rate. When rate, QT and QTc are all read, they must
///   satisfy it, or QT and QTc are refused (measured on a real printout:
///   one page read `392/598` where the others read `392/398`, and Bazett
///   gives 398 at that rate; numbers invented, the misreading real).
///
/// The codes are LOINC's ECG terms (8897-1, 8625-6, 8633-0, 8634-8, 76635-2,
/// 8626-4, 8632-2, 8638-9), verified against NLM on 2026-10-11. The device's
/// written interpretation is not read: it is unconfirmed until a physician
/// signs it, and this app carries numbers, not verdicts.
public enum Electrocardiogram {

  /// True for a page that prints an ECG measurement block.
  public static func looksLike(_ text: String) -> Bool {
    let t = text.lowercased()
    guard t.contains("qrs") else { return false }
    return t.contains("qtc") || t.contains("achse") || t.contains("axis")
      || t.contains("intervall") || t.contains("interval")
  }

  /// The printed labels, OCR-tolerant: `ventrıkulare Frequenz` with a
  /// dotless i, `PO-Intervall` for `PQ-Intervall`, `Q/Qlc-Baz` and
  /// `Q1/QTc-Baz` for `QT/QTc-Baz`, all measured on real photographs.
  enum Line: CaseIterable {
    case rate, pr, qrs, qt, axes

    var pattern: String {
      switch self {
      case .rate: return #"^(ventr\S*\s*frequenz|vent\.?\s*rate|kammerfrequenz)"#
      case .pr: return #"^P[QOR0]-?\s*(intervall|interval|zeit)"#
      case .qrs: return #"^QRS-?\s*(dauer|breite|duration|dur)"#
      case .qt: return #"^Q\S{0,2}/Q\S{0,2}\s*-?\s*(Baz|B\b)"#
      case .axes: return #"^P-?R-?T\s*-?\s*(achse|axes|axis)"#
      }
    }
  }

  /// The dictionary label, unit and plausible range of each value.
  static let measures:
    [(key: String, label: String, unit: String, range: ClosedRange<Double>)] = [
      ("rate", "Ventrikuläre Frequenz", "/min", 20...250),
      ("pr", "PQ-Intervall", "ms", 60...400),
      ("qrs", "QRS-Dauer", "ms", 40...250),
      ("qt", "QT-Intervall", "ms", 200...700),
      ("qtc", "QTc nach Bazett", "ms", 250...700),
      ("p", "P-Achse", "deg", -180...270),
      ("r", "QRS-Achse", "deg", -180...270),
      ("t", "T-Achse", "deg", -180...270),
    ]

  /// One number on the page, with where it starts and ends along its line.
  struct Token {
    let text: String
    let value: Double
    /// Position across the lines of text, and along the reading direction.
    let line: Double
    let start: Double
    let end: Double
    let region: SourceRegion
  }

  /// What one page says, per measure, with the region it was read from.
  typealias Reading = [String: (value: Double, region: SourceRegion)]

  /// The values of every page that has the block, agreed across pages and
  /// checked against Bazett. Empty when nothing can be read with certainty.
  public static func read(pages: [(text: String, fragments: [DocumentReconciler.TextFragment])])
    -> [RawLabValue]
  {
    let readings = pages.compactMap { page -> Reading? in
      guard looksLike(page.text) else { return nil }
      let reading = read(fragments: page.fragments)
      return reading.isEmpty ? nil : reading
    }
    guard !readings.isEmpty else { return [] }

    var agreed: [String: (value: Double, region: SourceRegion, pages: Int)] = [:]
    for measure in measures {
      let seen = readings.compactMap { $0[measure.key] }
      guard !seen.isEmpty else { continue }
      var votes: [Double: Int] = [:]
      for reading in seen { votes[reading.value, default: 0] += 1 }
      let ranked = votes.sorted { $0.value > $1.value }
      let best = ranked[0]
      // One reading stands alone; several must agree, at least two of them,
      // and more than any other value.
      if seen.count > 1 {
        guard best.value >= 2, ranked.count == 1 || ranked[1].value < best.value else { continue }
      }
      guard let region = seen.first(where: { $0.value == best.key })?.region else { continue }
      agreed[measure.key] = (best.key, region, best.value)
    }

    // Bazett: QTc = QT / sqrt(RR), RR = 60 / rate. A rate printed to the
    // whole beat and intervals to the millisecond leave a few milliseconds;
    // a device that averages its RR intervals leaves a few more.
    if let rate = agreed["rate"]?.value, let qt = agreed["qt"]?.value,
      let qtc = agreed["qtc"]?.value
    {
      let expected = qt / (60 / rate).squareRoot()
      if abs(expected - qtc) > 8 {
        agreed["qt"] = nil
        agreed["qtc"] = nil
      }
    }

    return measures.enumerated().compactMap { index, measure in
      guard let found = agreed[measure.key] else { return nil }
      let number =
        found.value == found.value.rounded() ? String(Int(found.value)) : String(found.value)
      return RawLabValue(
        label: measure.label, value: found.value, unitRaw: measure.unit,
        line: "\(measure.label) \(number) \(measure.unit == "deg" ? "°" : measure.unit)",
        lineNumber: 9300 + index, region: found.region)
    }
  }

  /// One page's block, read by geometry.
  static func read(fragments: [DocumentReconciler.TextFragment]) -> Reading {
    func trimmed(_ f: DocumentReconciler.TextFragment) -> String {
      f.text.trimmingCharacters(in: .whitespaces)
    }
    var labels: [(line: Line, fragment: DocumentReconciler.TextFragment)] = []
    for line in Line.allCases {
      if let fragment = fragments.first(where: {
        trimmed($0).range(of: line.pattern, options: [.regularExpression, .caseInsensitive]) != nil
      }) {
        labels.append((line, fragment))
      }
    }
    guard labels.count >= 2 else { return [:] }

    // A label set in a column, taller than wide, means the page was turned
    // by a quarter: the lines of text run up or down the photograph.
    let vertical =
      labels.filter { $0.fragment.region.height > $0.fragment.region.width }.count * 2
      > labels.count
    func across(_ r: SourceRegion) -> Double { vertical ? r.x + r.width / 2 : r.midY }

    let numberPattern =
      #"^[-–]?\d{1,3}(/\d{2,3})?(\s+[-–]?\d{1,3}){0,2}[\s-]*(L?ms|MS|[BВ][PР]M|bpm|/min)?[-.]?$"#
    let numbers = fragments.filter {
      trimmed($0).range(of: numberPattern, options: .regularExpression) != nil
    }

    // Which way the text reads: towards the value, from its label. Decided
    // by the numbers level with a label, so a page turned either way reads.
    let tolerance = 0.012
    var forward = 0
    var backward = 0
    for label in labels {
      for number in numbers
      where abs(across(number.region) - across(label.fragment.region)) < tolerance {
        let l = label.fragment.region
        let n = number.region
        let delta = vertical ? (n.midY - l.midY) : (n.x - l.x)
        if delta > 0 { forward += 1 } else { backward += 1 }
      }
    }
    // Along the line, growing in reading order.
    let sign: Double = vertical ? (forward > backward ? 1 : -1) : (backward > forward ? -1 : 1)
    func span(_ r: SourceRegion) -> (Double, Double) {
      let low = vertical ? r.y : r.x
      let high = vertical ? r.y + r.height : r.x + r.width
      return sign > 0 ? (low, high) : (-high, -low)
    }

    // Each number of a fragment, its share of the fragment's length by its
    // characters: `-41 18` is two axes, `148 ms` is a value and its unit.
    var tokens: [Token] = []
    let token = try! NSRegularExpression(pattern: #"[-–]?\d+(?:/\d+)?"#)
    for fragment in numbers {
      let text = trimmed(fragment)
      let characters = Double(max(text.count, 1))
      let (start, end) = span(fragment.region)
      let width = (end - start) / characters
      let ns = text as NSString
      for match in token.matches(in: text, range: NSRange(location: 0, length: ns.length)) {
        let piece = ns.substring(with: match.range)
        let first = start + Double(match.range.location) * width
        let last = start + Double(match.range.location + match.range.length) * width
        let plain = piece.replacingOccurrences(of: "–", with: "-")
        tokens.append(
          Token(
            text: plain, value: Double(plain.split(separator: "/").first ?? "") ?? .nan,
            line: across(fragment.region), start: first, end: last, region: fragment.region))
      }
    }

    // The lines of text, and how far a value sits from its label's line: the
    // digits and the letters do not share a baseline, so the offset is
    // learned from the numbers that are unambiguously one label's.
    let lines = labels.map { (line: $0.line, at: across($0.fragment.region), start: span($0.fragment.region).0) }
    let spacing: Double = {
      let sorted = lines.map(\.at).sorted()
      let gaps = zip(sorted, sorted.dropFirst()).map { $1 - $0 }.filter { $0 > 0.002 }.sorted()
      return gaps.isEmpty ? 0.015 : gaps[gaps.count / 2]
    }()
    func distances(_ t: Token, offset: Double) -> [(Line, Double)] {
      lines.map { ($0.line, abs(t.line - $0.at - offset)) }.sorted { $0.1 < $1.1 }
    }
    let clear = tokens.compactMap { t -> Double? in
      let d = distances(t, offset: 0)
      guard d.count > 1, d[1].1 > d[0].1 * 2,
        let line = lines.first(where: { $0.line == d[0].0 })
      else { return nil }
      return t.line - line.at
    }.sorted()
    let offset = clear.isEmpty ? 0 : clear[clear.count / 2]

    var byLine: [Line: [Token]] = [:]
    for t in tokens {
      let d = distances(t, offset: offset)
      guard let nearest = d.first, nearest.1 < spacing * 0.45,
        let line = lines.first(where: { $0.line == nearest.0 }),
        t.start > line.start, t.start - line.start < 0.35
      else { continue }
      byLine[nearest.0, default: []].append(t)
    }

    var reading: Reading = [:]
    func single(_ line: Line, _ key: String) {
      guard let found = byLine[line], found.count == 1, !found[0].text.contains("/") else { return }
      reading[key] = (found[0].value, found[0].region)
    }
    single(.rate, "rate")
    single(.pr, "pr")
    single(.qrs, "qrs")
    if let found = byLine[.qt], found.count == 1 {
      let parts = found[0].text.split(separator: "/").compactMap { Double($0) }
      if parts.count == 2 {
        reading["qt"] = (parts[0], found[0].region)
        reading["qtc"] = (parts[1], found[0].region)
      }
    }

    // The axes, by where each ends against the value column's end.
    let column = [Line.rate, .pr, .qrs, .qt].compactMap { byLine[$0] }
      .filter { $0.count == 1 }.map { $0[0].end }.sorted()
    if let axes = byLine[.axes], column.count >= 2 {
      let edge = column[column.count / 2]
      let slack = 0.006
      for t in axes {
        let key: String
        if abs(t.end - edge) <= slack {
          key = "r"
        } else if t.end < edge - slack {
          key = "p"
        } else {
          key = "t"
        }
        // Two numbers in one slot: neither is trusted.
        if reading[key] != nil {
          reading[key] = (.nan, t.region)
        } else {
          reading[key] = (t.value, t.region)
        }
      }
    }

    for measure in measures {
      if let found = reading[measure.key], found.value.isNaN || !measure.range.contains(found.value) {
        reading[measure.key] = nil
      }
    }
    return reading
  }

  /// Every page's ECG block, coded, as `AmbulatoryBloodPressure.extract` does.
  public static func extract(
    pageTexts: [String], pages: [ScanDiagnostics.Page], source: SourceKind
  ) -> ExtractionResult {
    let input = pageTexts.enumerated().map { index, text in
      (text: text, fragments: index < pages.count ? pages[index].fragments : [])
    }
    var coded: [CodedLabValue] = []
    var unmapped: [UnmappedLabValue] = []
    for raw in read(pages: input) {
      if let coding = Analytes.lookup(label: raw.label, unit: raw.unitRaw) {
        coded.append(CodedLabValue(raw: raw, coding: coding, source: source))
      } else {
        unmapped.append(UnmappedLabValue(raw: raw, reason: .unknownAnalyte))
      }
    }
    return ExtractionResult(coded: coded, unmapped: unmapped, suspiciousLines: [], source: source)
  }

  /// The line grammar's reading with this reader's values in it. On a page
  /// this reader has read, what the grammar made of the block (numbers
  /// without their labels, labels without their numbers) is dropped.
  public static func applied(
    to sheet: ExtractionResult, pageTexts: [String], pages: [ScanDiagnostics.Page]
  ) -> ExtractionResult {
    let read = extract(pageTexts: pageTexts, pages: pages, source: sheet.source)
    guard !read.coded.isEmpty else { return sheet }
    let codes = Set(read.coded.compactMap(\.coding.loinc))
    let block = Line.allCases.map(\.pattern).joined(separator: "|")
    // Numbers and the block's own unit words, in any order and any of the
    // spellings the recogniser produced (`LMS`, a Cyrillic `ВPM`).
    let numbersOnly = #"^(?:[\s\d/\-–.,:°]|L?MS|[BВ][PР]M)+$"#
    func ours(_ line: String) -> Bool {
      let t = line.trimmingCharacters(in: .whitespaces)
      return t.range(of: block, options: [.regularExpression, .caseInsensitive]) != nil
        || t.range(of: numbersOnly, options: [.regularExpression, .caseInsensitive]) != nil
    }
    let kept = ExtractionResult(
      coded: sheet.coded.filter { !($0.coding.loinc.map(codes.contains) ?? false) && !ours($0.raw.line) },
      unmapped: sheet.unmapped.filter { !ours($0.raw.line) },
      suspiciousLines: sheet.suspiciousLines.filter { !ours($0) },
      source: sheet.source)
    return kept.merging(read)
  }
}

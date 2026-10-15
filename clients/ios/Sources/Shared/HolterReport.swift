import Foundation

/// Reads the summary of a 24-hour ambulatory ECG (Holter) report.
///
/// A Holter report is pages of prose labels, hourly tables, episode lists
/// and charts. The line grammar reads none of it: a real one gave nothing
/// coded and a handful of junk rows (`HR 50 bpm`, the 20 % prematurity
/// setting of the analysis). What a person wants from it is on its
/// statistical page, so this reads that page by its labels:
///
///     Duration (h):  23:58        Min:      47 bpm at 03:58:12
///     Total QRS's:   94.212       Average:  68 bpm
///     Ventricular Ectopics: 3     Max:     136 bpm at 19:02:44
///
/// (numbers from a fictional report). Minimum, average, maximum and the beat
/// count are printed twice, on the statistical page and as the totals row of
/// the hourly table (`Totals: 47 68 136 94.212 …`). When both are read they
/// must agree, or the value is refused; and the minimum, average and maximum
/// must be in order. The settings of the analysis (`Tachycardias equal to or
/// greater than 120 bpm`) are configuration, not results, and are never
/// read as values.
///
/// LOINC codes the heart rate statistics, the total beats, the recording
/// duration and the ventricular ectopic count; the rest is carried uncoded
/// with the reason (the dictionary says which).
public enum HolterReport {

  /// True for a page of a Holter report's summary.
  public static func looksLike(_ text: String) -> Bool {
    let t = text.lowercased()
    return t.contains("total qrs") && (t.contains("holter") || t.contains("ectopics"))
  }

  struct Field {
    let key: String
    let label: String
    let unit: String
    let pattern: String
    let range: ClosedRange<Double>
  }

  /// The statistical page's fields. Each pattern's first group is the value.
  static let fields: [Field] = [
    Field(
      key: "duration", label: "Aufzeichnungsdauer", unit: "minutes",
      pattern: #"Duration\s*\(h\)\s*:?\s*(\d{1,2}:\d{2})"#, range: 60...(7 * 24 * 60)),
    Field(
      key: "beats", label: "Herzschläge gesamt", unit: "{beats}",
      pattern: #"Total\s+QRS'?s?\s*:?\s*(\d{1,3}(?:[.,]\d{3})+|\d{3,7})"#, range: 1000...2_000_000),
    Field(
      key: "min", label: "Herzfrequenz 24-h-Minimum", unit: "/min",
      pattern: #"\bMin(?:imum)?\s*:\s*(\d{2,3})\s*bpm"#, range: 20...250),
    Field(
      key: "avg", label: "Herzfrequenz 24-h-Mittel", unit: "/min",
      pattern: #"\bAverage\s*:\s*(\d{2,3})\s*bpm"#, range: 20...250),
    Field(
      key: "max", label: "Herzfrequenz 24-h-Maximum", unit: "/min",
      pattern: #"\bMax(?:imum)?\s*:\s*(\d{2,3})\s*bpm"#, range: 20...300),
    Field(
      key: "ve", label: "Ventrikuläre Extrasystolen", unit: "{beats}",
      pattern: #"\bVentricular\s+Ectopics\s*:\s*(\d{1,6})"#, range: 0...200_000),
    Field(
      key: "sve", label: "Supraventrikuläre Extrasystolen", unit: "{beats}",
      pattern: #"Supraventricular\s+Ectopics\s*:\s*(\d{1,6})"#, range: 0...200_000),
    Field(
      key: "artifacts", label: "Artefakte", unit: "%",
      pattern: #"Artifacts\s*\(%\)\s*:?\s*(\d{1,3})"#, range: 0...100),
    Field(
      key: "high", label: "Zeit über der Tachykardiegrenze", unit: "minutes",
      pattern: #"HR\s*>=?\s*\d{2,3}\s*bpm\s+during\s*(\d{1,2}:\d{2}:\d{2})"#, range: 0...(7 * 24 * 60)),
    Field(
      key: "low", label: "Zeit unter der Bradykardiegrenze", unit: "minutes",
      pattern: #"HR\s*<=?\s*\d{2,3}\s*bpm\s+during\s*(\d{1,2}:\d{2}:\d{2})"#, range: 0...(7 * 24 * 60)),
    Field(
      key: "pauses", label: "Pausen", unit: "{beats}",
      pattern: #"(\d{1,5})\s+Pauses\s*\(\s*>="#, range: 0...100_000),
  ]

  /// The summary's values, as raw values the dictionary codes. Empty when no
  /// page of the document is a Holter summary.
  public static func read(pageTexts: [String]) -> [RawLabValue] {
    guard let summary = pageTexts.first(where: looksLike) else { return [] }
    let totals = totalsRow(pageTexts)

    var found: [String: (value: Double, printed: String)] = [:]
    for field in fields {
      guard let match = firstGroup(field.pattern, in: summary),
        let value = number(match, unit: field.unit), field.range.contains(value)
      else { continue }
      found[field.key] = (value, match)
    }

    // The hourly table's totals row says the same four things again.
    if let totals {
      for (key, value) in totals {
        guard let read = found[key] else { continue }
        if read.value != value { found[key] = nil }
      }
    }
    // A minimum above the average, or an average above the maximum, means
    // one of them is misread, and nothing says which.
    if let low = found["min"]?.value, let mean = found["avg"]?.value, let high = found["max"]?.value,
      !(low <= mean && mean <= high)
    {
      found["min"] = nil
      found["avg"] = nil
      found["max"] = nil
    }

    return fields.enumerated().compactMap { index, field in
      guard let value = found[field.key] else { return nil }
      return RawLabValue(
        label: field.label, value: value.value, unitRaw: field.unit,
        line: "\(field.label) \(value.printed)", lineNumber: 9400 + index)
    }
  }

  /// `Totals: 47 68 136 94.212 …` from the hourly table: minimum, average,
  /// maximum and beats, in that order.
  static func totalsRow(_ pageTexts: [String]) -> [String: Double]? {
    for text in pageTexts {
      for line in text.components(separatedBy: .newlines) {
        guard
          let rest = firstGroup(#"^\s*Totals?\s*:?\s*(.*)$"#, in: line)
        else { continue }
        let numbers = rest.split(whereSeparator: { $0.isWhitespace }).map(String.init)
        guard numbers.count >= 4,
          let low = Double(numbers[0]), let mean = Double(numbers[1]),
          let high = Double(numbers[2]), let beats = number(numbers[3], unit: "{beats}")
        else { continue }
        return ["min": low, "avg": mean, "max": high, "beats": beats]
      }
    }
    return nil
  }

  /// A printed figure as the unit wants it: `23:58` as minutes, `00:04:51`
  /// as minutes with seconds, `94.212` as a whole count with a thousands
  /// separator.
  static func number(_ printed: String, unit: String) -> Double? {
    let parts = printed.split(separator: ":").compactMap { Double($0) }
    if printed.contains(":") {
      switch parts.count {
      case 2: return parts[0] * 60 + parts[1]
      case 3: return (((parts[0] * 60 + parts[1]) * 60 + parts[2]) / 60 * 100).rounded() / 100
      default: return nil
      }
    }
    if unit == "{beats}" {
      // A count has no decimals: a dot or comma between groups of three is a
      // thousands separator.
      guard printed.range(of: #"^\d{1,3}([.,]\d{3})*$|^\d+$"#, options: .regularExpression) != nil
      else { return nil }
      return Double(printed.filter(\.isNumber))
    }
    return Double(printed.replacingOccurrences(of: ",", with: "."))
  }

  private static func firstGroup(_ pattern: String, in text: String) -> String? {
    guard
      let re = try? NSRegularExpression(pattern: pattern, options: [.caseInsensitive, .anchorsMatchLines]),
      let m = re.firstMatch(in: text, range: NSRange(text.startIndex..., in: text)),
      let range = Range(m.range(at: 1), in: text)
    else { return nil }
    return String(text[range])
  }

  /// Every page's Holter summary, coded.
  public static func extract(pageTexts: [String], source: SourceKind) -> ExtractionResult {
    var coded: [CodedLabValue] = []
    var unmapped: [UnmappedLabValue] = []
    for raw in read(pageTexts: pageTexts) {
      if let coding = Analytes.lookup(label: raw.label, unit: raw.unitRaw) {
        coded.append(CodedLabValue(raw: raw, coding: coding, source: source))
      } else {
        unmapped.append(UnmappedLabValue(raw: raw, reason: .unknownAnalyte))
      }
    }
    return ExtractionResult(coded: coded, unmapped: unmapped, suspiciousLines: [], source: source)
  }

  /// The document's reading once its summary is read: this reader's values,
  /// and nothing of what the line grammar made of the pages (the analysis
  /// settings read as values, chart axes, rows of the episode lists). A
  /// Holter report holds no laboratory value for the grammar to find, and
  /// every one of those rows, measured on a real report, was noise.
  public static func applied(to sheet: ExtractionResult, pageTexts: [String]) -> ExtractionResult {
    let read = extract(pageTexts: pageTexts, source: sheet.source)
    guard read.coded.count >= 3 else { return sheet }
    return read
  }
}

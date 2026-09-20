import Foundation

/// Reads one card off a body-composition scale's screen.
///
/// A gym's scale shows a dashboard rather than a report: a metric's name, the
/// current value in large type, the day it was measured, and a twelve-month
/// chart underneath. Photographing that is the fastest way to get the reading
/// into the app, and it is a different shape from every lab sheet the parser
/// knows, so it gets its own reader rather than a widened grammar.
///
/// ## What it deliberately does not read
///
/// **The chart.** Those labelled points are real measurements, and their dates
/// are not on the screen: the axis says "Nov." and the year is implied. A value
/// carrying a date we inferred is worse than a value we did not take, and the
/// app's whole discipline is that a number arrives with the date the source
/// printed. So one card yields exactly one reading, the headline one, and the
/// history stays on the scale.
///
/// **A judgement.** These screens carry their own verdicts, a red "Niedrig"
/// badge and a legend of normal bands. Those are the manufacturer's, not a
/// guideline's, and they are not read: the app compares against published
/// ranges it can cite (ADR-039).
public enum DeviceScreen {

  public struct Reading: Sendable, Equatable {
    /// The metric as the screen names it.
    public let label: String
    public let value: Double
    /// The unit as printed, which the dictionary then normalises.
    public let unitRaw: String
    /// The day the screen says the value was updated, when it says.
    public let measuredOn: Date?
    /// The lines this was read from, for the reviewer.
    public let line: String
    public let page: Int

    public init(
      label: String, value: Double, unitRaw: String, measuredOn: Date?, line: String, page: Int
    ) {
      self.label = label
      self.value = value
      self.unitRaw = unitRaw
      self.measuredOn = measuredOn
      self.line = line
      self.page = page
    }
  }

  /// German month names, for `Aktualisiert: Donnerstag, 14. Mai 2026`.
  static let germanMonths: [String: Int] = [
    "januar": 1, "jänner": 1, "februar": 2, "märz": 3, "maerz": 3, "april": 4, "mai": 5,
    "juni": 6, "juli": 7, "august": 8, "september": 9, "oktober": 10, "november": 11,
    "dezember": 12,
  ]

  static let englishMonths: [String: Int] = [
    "january": 1, "february": 2, "march": 3, "april": 4, "may": 5, "june": 6, "july": 7,
    "august": 8, "september": 9, "october": 10, "november": 11, "december": 12,
  ]

  /// Words that introduce the date on such a screen.
  static let updatedWords = ["aktualisiert", "updated", "letzte messung", "last measurement"]

  /// True when a page looks like one of these cards rather than a lab sheet.
  ///
  /// Both halves are required. A date alone appears on every report, and a
  /// lone headline value appears on plenty of pages; a metric name with its
  /// value and an "updated" line, and no table of analytes, is this.
  public static func looksLikeDeviceScreen(_ text: String) -> Bool {
    let lines = Self.lines(of: text)
    guard lines.contains(where: { hasUpdatedWord($0) }) else { return false }
    return headline(in: lines) != nil
  }

  /// The reading on one page, or nil.
  public static func read(_ text: String, page: Int = 1) -> Reading? {
    let lines = Self.lines(of: text)
    guard let headline = headline(in: lines) else { return nil }
    let label = self.label(in: lines, before: headline.index) ?? headline.metric
    guard let label, !label.isEmpty else { return nil }

    // BMI is printed as its own "unit": `23,8 BMI`. The metric is the unit
    // slot, and the unit it is actually measured in is the one the dictionary
    // knows it by.
    var unit = headline.unit
    if Analytes.normaliseUnit(unit) == nil {
      guard Analytes.knowsLabel(unit) || Analytes.knowsLabel(label) else { return nil }
      unit = "kg/m2"
    }

    return Reading(
      label: label, value: headline.value, unitRaw: unit,
      measuredOn: date(in: lines), line: headline.line, page: page)
  }

  /// Turns readings into reports, one per day they were measured on.
  ///
  /// A person photographs several cards in one go, and a scale updates its
  /// metrics at different times, so five photographs can carry two dates.
  /// Filing them all under one would put a value on a day it was not
  /// measured, which is the thing this app spent a week learning not to do.
  ///
  /// Provenance is `self-tracked`: the enum defines that as a value from a
  /// consumer device, which is exactly what a gym's scale is. It is
  /// `preliminary`, like everything that is not a laboratory's own document.
  public static func reports(
    from readings: [Reading], fallbackDate: Date = Date(),
    titlePrefix: String = String(localized: "Body composition")
  ) -> [LabReport] {
    guard !readings.isEmpty else { return [] }
    var byDay: [Date: [Reading]] = [:]
    for reading in readings {
      byDay[reading.measuredOn ?? ReportMetadata.calendarDay(fallbackDate), default: []]
        .append(reading)
    }

    return byDay.keys.sorted(by: >).map { day in
      let group = byDay[day]!
      var coded: [CodedLabValue] = []
      var unmapped: [UnmappedLabValue] = []
      for (index, reading) in group.enumerated() {
        let raw = RawLabValue(
          label: reading.label, value: reading.value, unitRaw: reading.unitRaw,
          line: reading.line, lineNumber: index + 1,
          region: SourceRegion(page: reading.page, x: 0, y: 0, width: 1, height: 1))
        if let coding = Analytes.lookup(label: reading.label, unit: reading.unitRaw) {
          coded.append(CodedLabValue(raw: raw, coding: coding, source: .selfTracked))
        } else if Analytes.knowsLabel(reading.label) {
          unmapped.append(UnmappedLabValue(raw: raw, reason: .unitMismatch))
        } else {
          // `ECW/TBW` is a real reading with no LOINC code of its own. It is
          // reported rather than coded under something it is not.
          unmapped.append(UnmappedLabValue(raw: raw, reason: .unknownAnalyte))
        }
      }
      return LabReport(
        id: UUID(), scannedAt: Date(), collectedOn: day, title: titlePrefix,
        extraction: ExtractionResult(
          coded: coded, unmapped: unmapped, suspiciousLines: [], source: .selfTracked),
        metadata: ReportMetadata(
          labDate: day, labDateRole: .collection,
          dateSource: group.contains { $0.measuredOn != nil } ? .printed : .scan))
    }
  }

  // MARK: - The pieces

  static func lines(of text: String) -> [String] {
    text.components(separatedBy: .newlines)
      .map { $0.trimmingCharacters(in: .whitespaces) }
      .filter { !$0.isEmpty }
  }

  static func hasUpdatedWord(_ line: String) -> Bool {
    let folded = ReportMetadataExtractor.fold(line)
    return updatedWords.contains { folded.contains($0) }
  }

  /// The headline: a number and a unit, standing alone, above the date line.
  ///
  /// Above the date on purpose. Below it lie the chart's axis labels, which
  /// are also a number and a percent sign and are not the measurement.
  static func headline(
    in lines: [String]
  ) -> (value: Double, unit: String, metric: String?, line: String, index: Int)? {
    let limit = lines.firstIndex(where: { hasUpdatedWord($0) }) ?? lines.count
    guard limit > 0 else { return nil }

    for index in stride(from: limit - 1, through: 0, by: -1) {
      let line = lines[index]
      guard
        let match = firstMatch(
          #"^(\d[\d.,]*)\s*([%‰]|[A-Za-zÄÖÜäöü][A-Za-zÄÖÜäöü0-9/²^]*)$"#, in: line)
      else { continue }
      guard let value = LabLineParser.parseNumber(match[1]) else { continue }
      let unit = match[2]
      // A unit, or a word the dictionary knows as an analyte (`23,8 BMI`).
      guard Analytes.normaliseUnit(unit) != nil || Analytes.knowsLabel(unit) else { continue }
      return (value, unit, Analytes.knowsLabel(unit) ? unit : nil, line, index)
    }
    return nil
  }

  /// The manufacturer's own verdict, printed as a badge beside the value.
  ///
  /// `Niedrig`, `Normal`, `Erhöht`. Not read as anything: they are the
  /// device's bands, not a guideline's, and the app compares only against
  /// ranges it can cite (ADR-039). They sit between the metric's name and its
  /// value, so without this list the badge becomes the analyte's name.
  static let verdictWords = [
    "niedrig", "normal", "erhoht", "hoch", "gut", "optimal", "low", "high", "elevated",
    "healthy", "under", "over",
  ]

  /// The metric's name: the nearest line above the headline that names one.
  ///
  /// The dictionary arbitrates, as it does for a printed label's leading code.
  /// A line it knows wins outright; otherwise the nearest line that is neither
  /// a unit nor one of the device's own verdicts is taken, so a metric the app
  /// cannot code is still reported under the name the screen gave it.
  static func label(in lines: [String], before index: Int) -> String? {
    guard index > 0 else { return nil }
    var fallback: String?
    for candidate in stride(from: index - 1, through: 0, by: -1) {
      let line = lines[candidate]
      guard let first = line.first, first.isLetter, line.count <= 40,
        Analytes.normaliseUnit(line) == nil
      else { continue }
      if Analytes.knowsLabel(line) { return line }
      let folded = ReportMetadataExtractor.fold(line)
      let isVerdict = verdictWords.contains {
        folded == $0 || folded.hasSuffix(" " + $0) || folded.hasPrefix($0 + " ")
      }
      if !isVerdict, fallback == nil { fallback = line }
    }
    return fallback
  }

  /// `Aktualisiert: Donnerstag, 14. Mai 2026`, or a numeric date on that line.
  static func date(in lines: [String]) -> Date? {
    guard let line = lines.first(where: { hasUpdatedWord($0) }) else { return nil }
    let folded = ReportMetadataExtractor.fold(line)

    for (names, _) in [(germanMonths, 0), (englishMonths, 1)] {
      for (name, month) in names {
        guard let range = folded.range(of: name) else { continue }
        let before = String(folded[..<range.lowerBound])
        let after = String(folded[range.upperBound...])
        guard let day = lastNumber(in: before), let year = firstNumber(in: after) else { continue }
        if let date = ReportMetadataExtractor.day(year, month, day) { return date }
      }
    }

    // A screen that prints the date numerically is read the ordinary way.
    let detected = ReportMetadataExtractor.detectDates([(line, 1)])
    return detected.first?.date
  }

  static func lastNumber(in text: String) -> Int? {
    let parts = text.split(whereSeparator: { !$0.isNumber }).compactMap { Int($0) }
    return parts.last
  }

  static func firstNumber(in text: String) -> Int? {
    let parts = text.split(whereSeparator: { !$0.isNumber }).compactMap { Int($0) }
    return parts.first { $0 > 1900 } ?? parts.first
  }

  static func firstMatch(_ pattern: String, in text: String) -> [String]? {
    guard let regex = try? NSRegularExpression(pattern: pattern),
      let match = regex.firstMatch(in: text, range: NSRange(text.startIndex..., in: text))
    else { return nil }
    return (0..<match.numberOfRanges).map { index in
      guard let range = Range(match.range(at: index), in: text) else { return "" }
      return String(text[range])
    }
  }
}

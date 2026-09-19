import Foundation

/// Where a value sits relative to the ranges that describe it.
///
/// Four outcomes, and the wording is deliberate. None of them says "normal" or
/// "abnormal": those are clinical conclusions, and this is a comparison
/// against a published number. A value outside a band is a reason to read the
/// source and talk to a doctor, not a finding.
public enum RangePlacement: String, Sendable, Equatable, Codable {
  /// Inside the lowest-risk band the source names.
  case withinOptimal
  /// Inside the guideline range, outside the optimal band.
  case outsideOptimal
  /// Outside the guideline range the source states.
  case outsideGuideline
  /// No published range applies, so nothing is said.
  case noRange
}

extension ReferenceRange {

  /// Places a value, in this range's own unit.
  ///
  /// The caller must have matched the unit already. A value in mmol/L placed
  /// against a mg/dL range would be wrong by a factor of forty, which is why
  /// `Trends` keys a series on analyte **and** unit rather than analyte alone.
  public func placement(of value: Double) -> RangePlacement {
    if let low = guidelineLow, value < low { return .outsideGuideline }
    if let high = guidelineHigh, value > high { return .outsideGuideline }
    let hasOptimal = optimalLow != nil || optimalHigh != nil
    guard hasOptimal else { return .withinOptimal }
    if let low = optimalLow, value < low { return .outsideOptimal }
    if let high = optimalHigh, value > high { return .outsideOptimal }
    return .withinOptimal
  }

  /// The band as a person reads it: `< 116`, `30 – 50`, `≥ 90`.
  public func optimalText(formatter: (Double) -> String) -> String? {
    text(low: optimalLow, high: optimalHigh, formatter: formatter)
  }

  public func guidelineText(formatter: (Double) -> String) -> String? {
    text(low: guidelineLow, high: guidelineHigh, formatter: formatter)
  }

  private func text(low: Double?, high: Double?, formatter: (Double) -> String) -> String? {
    switch (low, high) {
    case let (low?, high?): return low == high ? formatter(low) : "\(formatter(low)) – \(formatter(high))"
    case let (nil, high?): return "< \(formatter(high))"
    case let (low?, nil): return "≥ \(formatter(low))"
    default: return nil
    }
  }
}

/// One measurement on a timeline.
public struct TrendPoint: Sendable, Equatable, Identifiable {
  public let id: UUID
  /// The report's own date, never the day it was scanned.
  public let date: Date
  public let value: Double
  public let comparator: Comparator?
  /// How the value was obtained, so a transcription is never plotted as if it
  /// were the laboratory's own figure.
  public let source: SourceKind
  /// The range this laboratory printed beside this value, kept verbatim.
  public let printedLow: Double?
  public let printedHigh: Double?
  public let reportTitle: String

  public init(
    id: UUID, date: Date, value: Double, comparator: Comparator?, source: SourceKind,
    printedLow: Double?, printedHigh: Double?, reportTitle: String
  ) {
    self.id = id
    self.date = date
    self.value = value
    self.comparator = comparator
    self.source = source
    self.printedLow = printedLow
    self.printedHigh = printedHigh
    self.reportTitle = reportTitle
  }
}

/// One analyte, in one unit, over time.
///
/// Keyed on analyte **and** unit on purpose. The unit selects the LOINC code,
/// so Lp(a) in mg/dL and in nmol/L are different measurements; plotting them
/// on one axis would draw a trend that does not exist.
public struct TrendSeries: Sendable, Equatable, Identifiable {
  public let analyteKey: String
  public let loinc: String
  public let ucum: String
  /// The label as the most recent report printed it.
  public let label: String
  /// Oldest first.
  public let points: [TrendPoint]
  public let range: ReferenceRange?

  public var id: String { "\(analyteKey)|\(ucum)" }
  public var latest: TrendPoint? { points.last }
  public var earliest: TrendPoint? { points.first }

  /// Change from the previous measurement to the latest, or nil with one point.
  public var change: Double? {
    guard points.count >= 2 else { return nil }
    return points[points.count - 1].value - points[points.count - 2].value
  }

  /// Where the most recent value sits. `.noRange` when nothing published applies.
  public var placement: RangePlacement {
    guard let range, let latest else { return .noRange }
    return range.placement(of: latest.value)
  }

  /// True when every point came from a laboratory's own document.
  public var allLabIssued: Bool { points.allSatisfy { $0.source == .labIssuedDigital } }

  public init(
    analyteKey: String, loinc: String, ucum: String, label: String, points: [TrendPoint],
    range: ReferenceRange?
  ) {
    self.analyteKey = analyteKey
    self.loinc = loinc
    self.ucum = ucum
    self.label = label
    self.points = points
    self.range = range
  }
}

/// Builds timelines out of stored reports.
///
/// This is the whole reason the store is a time series keyed by analyte rather
/// than a pile of documents (#186): the same LOINC code across many dates,
/// each point keeping its own provenance and its own printed reference range.
public enum Trends {

  /// Every analyte that appears in the reports, most-measured first.
  ///
  /// A value with a comparator (`<0.1`) is plotted at the bound it names,
  /// which is the only number there is, and the comparator travels with the
  /// point so the chart can mark it rather than pretending it was measured.
  public static func series(from reports: [LabReport], sex: RangeSex = .any) -> [TrendSeries] {
    var byKey: [String: [TrendPoint]] = [:]
    var meta: [String: (analyteKey: String, loinc: String, ucum: String, label: String, date: Date)] =
      [:]

    for report in reports {
      for value in report.extraction.coded {
        let key = "\(value.coding.analyteKey)|\(value.coding.ucum)"
        byKey[key, default: []].append(
          TrendPoint(
            id: UUID(), date: report.effectiveDate, value: value.raw.value,
            comparator: value.raw.comparator, source: value.source,
            printedLow: value.raw.referenceLow, printedHigh: value.raw.referenceHigh,
            reportTitle: report.title))
        // The label shown is the one the most recent report printed.
        if let existing = meta[key], existing.date >= report.effectiveDate { continue }
        meta[key] = (
          value.coding.analyteKey, value.coding.loinc, value.coding.ucum, value.raw.label,
          report.effectiveDate
        )
      }
    }

    return byKey.compactMap { key, points -> TrendSeries? in
      guard let info = meta[key] else { return nil }
      return TrendSeries(
        analyteKey: info.analyteKey, loinc: info.loinc, ucum: info.ucum, label: info.label,
        points: points.sorted { $0.date < $1.date },
        range: ReferenceRanges.range(analyteKey: info.analyteKey, ucum: info.ucum, sex: sex))
    }
    .sorted {
      // Most points first, because a timeline is the point; then alphabetical
      // so the order does not shuffle between launches.
      ($0.points.count, $1.label.lowercased()) > ($1.points.count, $0.label.lowercased())
    }
  }

  /// Series with more than one measurement, which are the ones with a trend.
  public static func withHistory(_ series: [TrendSeries]) -> [TrendSeries] {
    series.filter { $0.points.count >= 2 }
  }

  /// A short count of where the latest values sit, for a summary line.
  public static func tally(_ series: [TrendSeries]) -> [RangePlacement: Int] {
    series.reduce(into: [:]) { counts, item in
      counts[item.placement, default: 0] += 1
    }
  }
}

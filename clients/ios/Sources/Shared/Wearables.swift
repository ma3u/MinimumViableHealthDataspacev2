import Foundation

/// Trends from a watch or a ring, read to sit beside the laboratory's values.
///
/// #186 criterion 3: wearable trends sit alongside lab values without being
/// presented as equivalent evidence. The two differ in kind, not degree. A
/// laboratory measured one sample with a validated assay and printed a range
/// for it; a wearable estimates continuously with a consumer sensor and has no
/// range at all. So everything here is built to stay apart:
///
/// - **Never a `CodedLabValue`.** No LOINC code, no provenance that could be
///   mistaken for a transcription, no path into a report, the FHIR bundle,
///   the OMOP tables or the document for a doctor. A series lives for as long
///   as a screen shows it and is never stored: the phone's own Health store
///   already holds it, and a second copy would be one more thing to protect.
/// - **Never compared with a range.** There is no `placement`, no band, no
///   colour that means anything. A resting pulse of 58 is a number on a line.
/// - **Weekly means, not daily readings.** Day-to-day noise on a consumer
///   sensor is larger than most changes worth seeing, and a line of 700
///   points beside a line of 6 lab values would look like the better evidence
///   simply by being denser.
public enum WearableMetric: String, CaseIterable, Sendable, Codable {
  case restingHeartRate = "resting-heart-rate"
  case heartRateVariability = "heart-rate-variability"
  case steps
  case bodyMass = "body-mass"

  /// How a week of daily values becomes one point.
  public enum Aggregation: Sendable { case mean, sum }

  public var aggregation: Aggregation { self == .steps ? .sum : .mean }

  /// The unit the series is expressed in, as a person reads it.
  public var unit: String {
    switch self {
    case .restingHeartRate: return "bpm"
    case .heartRateVariability: return "ms"
    case .steps: return String(localized: "steps per day")
    case .bodyMass: return "kg"
    }
  }

  public var title: String {
    switch self {
    case .restingHeartRate: return String(localized: "Resting heart rate")
    case .heartRateVariability: return String(localized: "Heart rate variability (SDNN)")
    case .steps: return String(localized: "Steps")
    case .bodyMass: return String(localized: "Body weight")
    }
  }
}

/// One day's reading, as the Health store summarised it.
public struct WearableDay: Sendable, Equatable {
  public let day: Date
  public let value: Double

  public init(day: Date, value: Double) {
    self.day = day
    self.value = value
  }
}

/// One week's point on a wearable chart.
public struct WearablePoint: Sendable, Equatable, Identifiable {
  /// The Monday the week starts on.
  public let weekStart: Date
  public let value: Double
  /// How many days the week had a reading, so a week with one day is not
  /// passed off as a week.
  public let days: Int

  public var id: Date { weekStart }

  public init(weekStart: Date, value: Double, days: Int) {
    self.weekStart = weekStart
    self.value = value
    self.days = days
  }
}

/// One metric over time, from a device, oldest week first.
public struct WearableSeries: Sendable, Equatable, Identifiable {
  public let metric: WearableMetric
  public let points: [WearablePoint]
  /// The devices or apps the readings came from, as the Health store names
  /// them, so the chart can say what measured it.
  public let sources: [String]

  public var id: String { metric.rawValue }

  public init(metric: WearableMetric, points: [WearablePoint], sources: [String]) {
    self.metric = metric
    self.points = points
    self.sources = sources
  }

  /// Daily readings to weekly points.
  ///
  /// Steps are summed per day by the Health store already, so a week's point
  /// is the mean of its daily totals ("steps per day"), as is every other
  /// metric's. Weeks with no reading are left out rather than drawn as zero:
  /// a watch left in a drawer did not record a resting pulse of nothing.
  public static func weekly(
    _ days: [WearableDay], metric: WearableMetric, sources: [String],
    calendar: Calendar = .iso8601Monday
  ) -> WearableSeries {
    var byWeek: [Date: [Double]] = [:]
    for day in days {
      guard let start = calendar.dateInterval(of: .weekOfYear, for: day.day)?.start else {
        continue
      }
      byWeek[start, default: []].append(day.value)
    }
    let points = byWeek.keys.sorted().map { start -> WearablePoint in
      let values = byWeek[start]!
      return WearablePoint(
        weekStart: start, value: values.reduce(0, +) / Double(values.count), days: values.count)
    }
    return WearableSeries(metric: metric, points: points, sources: sources.sorted())
  }

  /// The period worth reading: from a month before the first report to today,
  /// and never more than two years, so the request to the Health store is
  /// bounded however old the oldest scan is.
  public static func period(reportDates: [Date], now: Date = Date()) -> DateInterval {
    let twoYears = now.addingTimeInterval(-2 * 365 * 86_400)
    let first = reportDates.min().map { $0.addingTimeInterval(-30 * 86_400) } ?? twoYears
    return DateInterval(start: max(first, twoYears), end: now)
  }
}

extension Calendar {
  /// Weeks start on Monday, as they do on every German calendar, whatever the
  /// device's region says, so two phones draw the same points.
  public static var iso8601Monday: Calendar {
    var calendar = Calendar(identifier: .iso8601)
    calendar.timeZone = TimeZone(identifier: "Europe/Berlin") ?? .current
    return calendar
  }
}

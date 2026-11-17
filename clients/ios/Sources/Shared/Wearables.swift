import Foundation

/// Trends from a watch or a ring, read to sit beside the laboratory's values.
///
/// #186 criterion 3: wearable trends sit alongside lab values without being
/// presented as equivalent evidence. The two differ in kind, not degree. A
/// laboratory measured one sample with a validated assay and printed a range
/// for it; a wearable estimates continuously with a consumer sensor and has no
/// range at all. So everything here is built to stay apart:
///
/// - **Never a `CodedLabValue`.** No provenance that could be mistaken for a
///   transcription, no path into a report, its FHIR bundle, the OMOP tables or
///   the document for a doctor. A series lives for as long as a screen shows
///   it and is never stored on the phone: the Health store already holds it,
///   and a second copy would be one more thing to protect. Only when the
///   person turns on "Send my device trends to my EHDS record" do the weekly
///   points go to their own record, as Observations of their own
///   (`WearableFHIR`, ADR-057).
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
  /// Apple Health's exercise minutes, a day's total. What a bonus program's
  /// active year rule reads (#934 step 6, ADR-087); never inferred from steps.
  case exercise
  /// Apple Watch's cardio fitness estimate, VO2 max. An estimate from a walk
  /// or a run, not the measured peak of a spiroergometry; it is coded like
  /// one so the two can be drawn side by side, and its source says which.
  case vo2Max = "vo2-max"
  case respiratoryRate = "respiratory-rate"
  case oxygenSaturation = "oxygen-saturation"
  /// Active energy, a day's total.
  case activeEnergy = "active-energy"
  case bodyFat = "body-fat"
  /// Time asleep in a night, all stages together, and the three stages a
  /// watch tells apart. Read from sleep analysis, not a quantity.
  case sleep
  case deepSleep = "deep-sleep"
  case remSleep = "rem-sleep"
  case coreSleep = "core-sleep"

  /// How a week of daily values becomes one point.
  public enum Aggregation: Sendable { case mean, sum }

  public var aggregation: Aggregation {
    switch self {
    case .steps, .exercise, .activeEnergy: return .sum
    default: return .mean
    }
  }

  /// Read from sleep analysis (a category), not from a quantity type.
  public var isSleep: Bool { [.sleep, .deepSleep, .remSleep, .coreSleep].contains(self) }

  /// The unit the series is expressed in, as a person reads it.
  public var unit: String {
    switch self {
    case .restingHeartRate: return "bpm"
    case .heartRateVariability: return "ms"
    case .steps: return String(localized: "steps per day")
    case .bodyMass: return "kg"
    case .exercise: return String(localized: "minutes per day")
    case .vo2Max: return "mL/kg/min"
    case .respiratoryRate: return String(localized: "breaths/min")
    case .oxygenSaturation, .bodyFat: return "%"
    case .activeEnergy: return String(localized: "kcal per day")
    case .sleep: return String(localized: "hours per night")
    case .deepSleep, .remSleep, .coreSleep: return String(localized: "minutes per night")
    }
  }

  public var title: String {
    switch self {
    case .restingHeartRate: return String(localized: "Resting heart rate")
    case .heartRateVariability: return String(localized: "Heart rate variability (SDNN)")
    case .steps: return String(localized: "Steps")
    case .bodyMass: return String(localized: "Body weight")
    case .exercise: return String(localized: "Exercise minutes")
    case .vo2Max: return String(localized: "Cardio fitness (VO2 max)")
    case .respiratoryRate: return String(localized: "Respiratory rate")
    case .oxygenSaturation: return String(localized: "Blood oxygen")
    case .activeEnergy: return String(localized: "Active energy")
    case .bodyFat: return String(localized: "Body fat")
    case .sleep: return String(localized: "Sleep")
    case .deepSleep: return String(localized: "Deep sleep")
    case .remSleep: return String(localized: "REM sleep")
    case .coreSleep: return String(localized: "Core sleep")
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

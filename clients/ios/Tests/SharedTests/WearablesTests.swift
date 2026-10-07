import Foundation
import Testing

@testable import Shared

/// #186 criterion 3: wearable trends sit beside lab values without being
/// presented as equivalent evidence.
@Suite("Wearables: weekly, bounded, and never a lab value")
struct WearablesTests {
  private let calendar = Calendar.iso8601Monday

  private func day(_ y: Int, _ m: Int, _ d: Int) -> Date {
    calendar.date(from: DateComponents(year: y, month: m, day: d))!
  }

  @Test("days become one point per Monday-started week, holding the mean")
  func weekly() {
    // Monday 5 to Sunday 11 October 2026 is one week; Monday 12 starts the next.
    let days = [
      WearableDay(day: day(2026, 10, 5), value: 60),
      WearableDay(day: day(2026, 10, 11), value: 62),
      WearableDay(day: day(2026, 10, 12), value: 58),
    ]
    let series = WearableSeries.weekly(days, metric: .restingHeartRate, sources: ["Watch"])
    #expect(series.points.map(\.value) == [61, 58])
    #expect(series.points.map(\.days) == [2, 1])
    #expect(series.points.first?.weekStart == day(2026, 10, 5))
  }

  @Test("a week with no reading is left out, never drawn as zero")
  func gaps() {
    let days = [
      WearableDay(day: day(2026, 9, 7), value: 8_000),
      WearableDay(day: day(2026, 9, 28), value: 6_000),
    ]
    let series = WearableSeries.weekly(days, metric: .steps, sources: [])
    #expect(series.points.count == 2)
    #expect(!series.points.contains { $0.value == 0 })
  }

  @Test("the period starts a month before the first report and never reaches back past two years")
  func period() {
    let now = day(2026, 10, 3)
    let recent = WearableSeries.period(reportDates: [day(2026, 6, 1), day(2026, 9, 1)], now: now)
    #expect(recent.start == day(2026, 6, 1).addingTimeInterval(-30 * 86_400))
    let ancient = WearableSeries.period(reportDates: [day(2015, 1, 1)], now: now)
    #expect(ancient.start >= now.addingTimeInterval(-2 * 365 * 86_400 - 1))
  }

  @Test("sources are named in a stable order")
  func sources() {
    let series = WearableSeries.weekly([], metric: .bodyMass, sources: ["Ring", "Scale"].reversed())
    #expect(series.sources == ["Ring", "Scale"])
  }

  @Test("each kind of lab evidence has its own chart shape (#186 criterion 2)")
  func shapes() {
    let shapes = SourceKind.allCases.map(\.markShape)
    #expect(Set(shapes).count == SourceKind.allCases.count)
  }
}

/// ADR-057: with the person's switch on, the weekly points go to their own
/// EHDS record, exactly as the hub accepts them.
@Suite("Wearables to the EHDS record: weekly means, coded, nothing finer")
struct WearableFHIRTests {
  private let calendar = Calendar.iso8601Monday

  private func monday(_ y: Int, _ m: Int, _ d: Int) -> Date {
    calendar.date(from: DateComponents(year: y, month: m, day: d))!
  }

  private func observations(_ series: [WearableSeries]) -> [[String: Any]] {
    let bundle = WearableFHIR.bundle(series, calendar: calendar)
    return (bundle["entry"] as! [[String: Any]]).map { $0["resource"] as! [String: Any] }
  }

  @Test("each metric is sent with the LOINC code and UCUM unit the hub accepts")
  func codes() {
    let expected: [WearableMetric: (String, String)] = [
      .restingHeartRate: ("40443-4", "/min"),
      .heartRateVariability: ("80404-7", "ms"),
      .steps: ("41950-7", "/d"),
      .bodyMass: ("29463-7", "kg"),
    ]
    for metric in WearableMetric.allCases {
      let coding = WearableFHIR.coding(metric)
      #expect(coding.loinc == expected[metric]!.0)
      #expect(coding.ucum == expected[metric]!.1)
    }
  }

  @Test("one Observation per week: final, the week as its period, the mean rounded")
  func observationPerWeek() {
    let series = WearableSeries(
      metric: .restingHeartRate,
      points: [
        WearablePoint(weekStart: monday(2026, 9, 28), value: 54.237, days: 7),
        WearablePoint(weekStart: monday(2026, 10, 5), value: 55.0, days: 3),
      ],
      sources: ["Fictional Watch"])
    let sent = observations([series])
    #expect(sent.count == 2)
    let first = sent[0]
    #expect(first["status"] as? String == "final")
    #expect(
      first["effectivePeriod"] as? [String: String]
        == ["start": "2026-09-28", "end": "2026-10-04"])
    let quantity = first["valueQuantity"] as! [String: Any]
    #expect(quantity["value"] as? Double == 54.2)
    #expect(quantity["code"] as? String == "/min")
    #expect(quantity["system"] as? String == "http://unitsofmeasure.org")
    #expect((first["device"] as? [String: String])?["display"] == "Fictional Watch")
  }

  @Test("steps per day are sent as whole steps")
  func steps() {
    let series = WearableSeries(
      metric: .steps,
      points: [WearablePoint(weekStart: monday(2026, 9, 28), value: 9012.6, days: 7)],
      sources: [])
    let quantity = observations([series])[0]["valueQuantity"] as! [String: Any]
    #expect(quantity["value"] as? Double == 9013)
    #expect(observations([series])[0]["device"] == nil)
  }

  @Test("the same series sends the same bytes, and the count is every week of every metric")
  func stable() {
    let series = [
      WearableSeries(
        metric: .bodyMass,
        points: [WearablePoint(weekStart: monday(2026, 9, 28), value: 67.14, days: 2)],
        sources: ["Scale"]),
      WearableSeries(
        metric: .heartRateVariability,
        points: [
          WearablePoint(weekStart: monday(2026, 9, 21), value: 33.9, days: 7),
          WearablePoint(weekStart: monday(2026, 9, 28), value: 34.1, days: 7),
        ],
        sources: ["Watch"]),
    ]
    #expect(WearableFHIR.json(series, calendar: calendar) == WearableFHIR.json(series, calendar: calendar))
    #expect(WearableFHIR.count(series) == 3)
  }
}

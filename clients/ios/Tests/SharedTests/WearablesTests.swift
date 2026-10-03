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

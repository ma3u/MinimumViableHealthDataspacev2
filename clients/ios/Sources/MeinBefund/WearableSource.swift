import Foundation
import HealthKit
import Shared

/// Where wearable trends come from: the phone's Health store, or the demo.
///
/// Read only, and only when the person asks on the Trends screen. Nothing is
/// written to Health and nothing read from it is stored: the series exists
/// while the screen shows it (#186 criterion 3, `Wearables.swift`).
protocol WearableSource: Sendable {
  /// Asks for read access where that applies, then reads every metric.
  func series(in period: DateInterval) async throws -> [WearableSeries]
}

enum WearableSources {
  /// The demo's fictional series under `-MBDemoSeed` and the dev dataset, so a
  /// screenshot or a UI test never touches a real Health store; the phone's
  /// own store otherwise.
  @MainActor static var current: any WearableSource {
    #if DEBUG
      if DemoSeed.isRequested || DevDataset.isRequested { return DemoWearables() }
    #endif
    return HealthKitWearables()
  }
}

/// The phone's Health store, read with the person's permission.
struct HealthKitWearables: WearableSource {

  enum Failure: LocalizedError {
    case unavailable
    var errorDescription: String? {
      String(localized: "Apple Health is not available on this device.")
    }
  }

  private static func quantityType(_ metric: WearableMetric) -> HKQuantityType {
    switch metric {
    case .restingHeartRate: return HKQuantityType(.restingHeartRate)
    case .heartRateVariability: return HKQuantityType(.heartRateVariabilitySDNN)
    case .steps: return HKQuantityType(.stepCount)
    case .bodyMass: return HKQuantityType(.bodyMass)
    }
  }

  private static func unit(_ metric: WearableMetric) -> HKUnit {
    switch metric {
    case .restingHeartRate: return .count().unitDivided(by: .minute())
    case .heartRateVariability: return .secondUnit(with: .milli)
    case .steps: return .count()
    case .bodyMass: return .gramUnit(with: .kilo)
    }
  }

  func series(in period: DateInterval) async throws -> [WearableSeries] {
    guard HKHealthStore.isHealthDataAvailable() else { throw Failure.unavailable }
    let store = HKHealthStore()
    let types = Set(WearableMetric.allCases.map { Self.quantityType($0) as HKObjectType })
    // Read only: `toShare` is empty, so the permission sheet offers nothing
    // to write. HealthKit never says whether read access was refused, it
    // returns no samples, so the screen words an empty result as "no
    // readings, or no access" rather than guessing which.
    try await store.requestAuthorization(toShare: [], read: types)

    var result: [WearableSeries] = []
    for metric in WearableMetric.allCases {
      let type = Self.quantityType(metric)
      let samples = HKQuery.predicateForSamples(
        withStart: period.start, end: period.end, options: .strictStartDate)
      let predicate = HKSamplePredicate.quantitySample(type: type, predicate: samples)
      let descriptor = HKStatisticsCollectionQueryDescriptor(
        predicate: predicate,
        options: metric.aggregation == .sum ? .cumulativeSum : .discreteAverage,
        anchorDate: Calendar.iso8601Monday.startOfDay(for: period.start),
        intervalComponents: DateComponents(day: 1))
      let collection = try await descriptor.result(for: store)
      var days: [WearableDay] = []
      collection.enumerateStatistics(from: period.start, to: period.end) { statistics, _ in
        let quantity =
          metric.aggregation == .sum ? statistics.sumQuantity() : statistics.averageQuantity()
        if let quantity {
          days.append(
            WearableDay(day: statistics.startDate, value: quantity.doubleValue(for: Self.unit(metric))))
        }
      }
      guard !days.isEmpty else { continue }
      let sources = try await HKSourceQueryDescriptor(predicate: predicate).result(for: store)
      result.append(
        WearableSeries.weekly(days, metric: metric, sources: sources.map(\.name)))
    }
    return result
  }
}

#if DEBUG
  /// Fictional weekly series for the demo, reproducible on any machine.
  struct DemoWearables: WearableSource {
    func series(in period: DateInterval) async throws -> [WearableSeries] {
      let calendar = Calendar.iso8601Monday
      var days: [WearableMetric: [WearableDay]] = [:]
      var day = calendar.startOfDay(for: period.start)
      var index = 0.0
      while day <= period.end {
        // Slow drifts with a weekly wobble: plausible, and obviously made up.
        days[.restingHeartRate, default: []].append(
          WearableDay(day: day, value: 61 - index / 120 + sin(index / 3.5)))
        days[.heartRateVariability, default: []].append(
          WearableDay(day: day, value: 42 + index / 90 + 3 * sin(index / 5)))
        days[.steps, default: []].append(
          WearableDay(day: day, value: 7_400 + 1_800 * sin(index / 7) + index * 2))
        day = calendar.date(byAdding: .day, value: 1, to: day)!
        index += 1
      }
      return [WearableMetric.restingHeartRate, .heartRateVariability, .steps].map {
        WearableSeries.weekly(days[$0] ?? [], metric: $0, sources: ["Demo Watch"])
      }
    }
  }
#endif

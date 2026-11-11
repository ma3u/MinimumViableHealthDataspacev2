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

  /// Nil for the sleep metrics, which come from sleep analysis instead.
  private static func quantityType(_ metric: WearableMetric) -> HKQuantityType? {
    switch metric {
    case .restingHeartRate: return HKQuantityType(.restingHeartRate)
    case .heartRateVariability: return HKQuantityType(.heartRateVariabilitySDNN)
    case .steps: return HKQuantityType(.stepCount)
    case .bodyMass: return HKQuantityType(.bodyMass)
    case .exercise: return HKQuantityType(.appleExerciseTime)
    case .vo2Max: return HKQuantityType(.vo2Max)
    case .respiratoryRate: return HKQuantityType(.respiratoryRate)
    case .oxygenSaturation: return HKQuantityType(.oxygenSaturation)
    case .activeEnergy: return HKQuantityType(.activeEnergyBurned)
    case .bodyFat: return HKQuantityType(.bodyFatPercentage)
    case .sleep, .deepSleep, .remSleep, .coreSleep: return nil
    }
  }

  private static func unit(_ metric: WearableMetric) -> HKUnit {
    switch metric {
    case .restingHeartRate, .respiratoryRate: return .count().unitDivided(by: .minute())
    case .heartRateVariability: return .secondUnit(with: .milli)
    case .steps: return .count()
    case .bodyMass: return .gramUnit(with: .kilo)
    case .exercise: return .minute()
    case .vo2Max: return HKUnit(from: "ml/kg*min")
    case .oxygenSaturation, .bodyFat: return .percent()
    case .activeEnergy: return .kilocalorie()
    case .sleep: return .hour()
    case .deepSleep, .remSleep, .coreSleep: return .minute()
    }
  }

  /// HealthKit's percent is a fraction (0.97); a person reads 97 %.
  private static func scale(_ metric: WearableMetric) -> Double {
    metric == .oxygenSaturation || metric == .bodyFat ? 100 : 1
  }

  func series(in period: DateInterval) async throws -> [WearableSeries] {
    guard HKHealthStore.isHealthDataAvailable() else { throw Failure.unavailable }
    let store = HKHealthStore()
    var types = Set(WearableMetric.allCases.compactMap { Self.quantityType($0) as HKObjectType? })
    types.insert(HKCategoryType(.sleepAnalysis))
    // Read only: `toShare` is empty, so the permission sheet offers nothing
    // to write. HealthKit never says whether read access was refused, it
    // returns no samples, so the screen words an empty result as "no
    // readings, or no access" rather than guessing which.
    try await store.requestAuthorization(toShare: [], read: types)

    var result: [WearableSeries] = []
    for metric in WearableMetric.allCases {
      guard let type = Self.quantityType(metric) else { continue }
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
            WearableDay(
              day: statistics.startDate,
              value: quantity.doubleValue(for: Self.unit(metric)) * Self.scale(metric)))
        }
      }
      guard !days.isEmpty else { continue }
      let sources = try await HKSourceQueryDescriptor(predicate: predicate).result(for: store)
      result.append(
        WearableSeries.weekly(days, metric: metric, sources: sources.map(\.name)))
    }
    result.append(contentsOf: try await sleepSeries(store: store, in: period))
    return result
  }

  /// Sleep from sleep analysis: per night, the time asleep in all stages and
  /// in each stage a watch tells apart. A night belongs to the day the person
  /// woke up. When two sources logged the same night (a watch and the
  /// phone's sleep schedule), the one with the most sleep is taken rather
  /// than both added up. In bed and awake are not sleep.
  private func sleepSeries(store: HKHealthStore, in period: DateInterval) async throws
    -> [WearableSeries]
  {
    let calendar = Calendar.iso8601Monday
    let within = HKQuery.predicateForSamples(
      withStart: period.start.addingTimeInterval(-86_400), end: period.end)
    let query = HKSampleQueryDescriptor(
      predicates: [.categorySample(type: HKCategoryType(.sleepAnalysis), predicate: within)],
      sortDescriptors: [SortDescriptor(\.startDate)])
    let samples = try await query.result(for: store)

    var bySource: [String: [Date: [WearableMetric: Double]]] = [:]
    for sample in samples {
      guard let value = HKCategoryValueSleepAnalysis(rawValue: sample.value) else { continue }
      let stage: WearableMetric?
      switch value {
      case .asleepDeep: stage = .deepSleep
      case .asleepREM: stage = .remSleep
      case .asleepCore: stage = .coreSleep
      case .asleepUnspecified: stage = nil
      default: continue  // in bed, awake
      }
      let night = calendar.startOfDay(for: sample.endDate)
      let seconds = sample.endDate.timeIntervalSince(sample.startDate)
      let source = sample.sourceRevision.source.name
      bySource[source, default: [:]][night, default: [:]][.sleep, default: 0] += seconds
      if let stage { bySource[source, default: [:]][night, default: [:]][stage, default: 0] += seconds }
    }

    var nights: [Date: (source: String, seconds: [WearableMetric: Double])] = [:]
    for (source, perNight) in bySource {
      for (night, seconds) in perNight
      where (seconds[.sleep] ?? 0) > (nights[night]?.seconds[.sleep] ?? 0) {
        nights[night] = (source, seconds)
      }
    }

    var days: [WearableMetric: [WearableDay]] = [:]
    var sources: [WearableMetric: Set<String>] = [:]
    for (night, pick) in nights where night >= period.start && night <= period.end {
      for (metric, seconds) in pick.seconds {
        let value = metric == .sleep ? seconds / 3_600 : seconds / 60
        days[metric, default: []].append(WearableDay(day: night, value: value))
        sources[metric, default: []].insert(pick.source)
      }
    }
    return [WearableMetric.sleep, .deepSleep, .remSleep, .coreSleep].compactMap { metric in
      guard let nightly = days[metric], !nightly.isEmpty else { return nil }
      return WearableSeries.weekly(
        nightly.sorted { $0.day < $1.day }, metric: metric, sources: Array(sources[metric] ?? []))
    }
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
        days[.exercise, default: []].append(
          WearableDay(day: day, value: 26 + 8 * sin(index / 4)))
        days[.vo2Max, default: []].append(
          WearableDay(day: day, value: 41 + index / 200 + 0.6 * sin(index / 9)))
        days[.respiratoryRate, default: []].append(
          WearableDay(day: day, value: 14.5 + 0.8 * sin(index / 6)))
        days[.oxygenSaturation, default: []].append(
          WearableDay(day: day, value: 96.5 + 0.7 * sin(index / 8)))
        days[.activeEnergy, default: []].append(
          WearableDay(day: day, value: 520 + 140 * sin(index / 7)))
        days[.sleep, default: []].append(
          WearableDay(day: day, value: 7.1 + 0.6 * sin(index / 5)))
        days[.deepSleep, default: []].append(
          WearableDay(day: day, value: 62 + 10 * sin(index / 5)))
        days[.remSleep, default: []].append(
          WearableDay(day: day, value: 98 + 12 * sin(index / 6)))
        days[.coreSleep, default: []].append(
          WearableDay(day: day, value: 266 + 25 * sin(index / 5)))
        day = calendar.date(byAdding: .day, value: 1, to: day)!
        index += 1
      }
      return [
        WearableMetric.restingHeartRate, .heartRateVariability, .steps, .exercise, .vo2Max,
        .respiratoryRate, .oxygenSaturation, .activeEnergy, .sleep, .deepSleep, .remSleep,
        .coreSleep,
      ].map {
        WearableSeries.weekly(days[$0] ?? [], metric: $0, sources: ["Demo Watch"])
      }
    }
  }
#endif

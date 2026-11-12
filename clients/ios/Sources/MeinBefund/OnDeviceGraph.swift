import Foundation
import HealthGraph
import Shared

/// "Health graph on this iPhone": the same Relate graph the Mac receiver
/// builds (relate-hackathon-team's HealthGraph library), but on the phone.
///
/// It is derived data, rebuilt from the person's reports (and, if they choose,
/// Apple Health weekly means) through the exact FHIR bundles "Export to my
/// Mac" sends. The store lives in Application Support under
/// `FileProtectionType.complete` (unreadable while the phone is locked),
/// excluded from backup, and nothing in it leaves the phone. Switching the
/// graph off deletes it; the reports themselves are untouched.
@MainActor
final class OnDeviceGraph: ObservableObject {
  struct Summary: Sendable, Equatable {
    var reports = 0
    var labValues = 0
    var codedAnalytes = 0
    var unmapped = 0
    var weekly = 0
    var omop = 0
  }

  struct Analyte: Sendable, Identifiable, Hashable {
    var id: String { loinc }
    let loinc: String
    let label: String
    let count: Int
    let last: String
  }

  struct TrendPoint: Sendable, Identifiable, Hashable {
    let id = UUID()
    let date: String
    let value: String
    let unit: String
    let source: String
    let lab: String
  }

  struct Uncoded: Sendable, Identifiable, Hashable {
    let id = UUID()
    let label: String
    let date: String
    let reason: String
  }

  @Published private(set) var enabled: Bool
  @Published private(set) var includesWearables: Bool
  @Published private(set) var summary: Summary?
  @Published private(set) var analytes: [Analyte] = []
  @Published private(set) var busy = false
  @Published var notice: String?

  /// Demo and dev-data runs keep their own graph and switches, so fictional
  /// values never meet a person's real graph (like the self-test's store).
  nonisolated private static var demo: Bool {
    #if DEBUG
      DemoSeed.isRequested
    #else
      false
    #endif
  }
  private static var enabledTag: String { "red.mabu.meinbefund.graph.enabled" + (demo ? ".demo" : "") }
  private static var wearablesTag: String {
    "red.mabu.meinbefund.graph.wearables" + (demo ? ".demo" : "")
  }

  nonisolated static var directory: URL {
    FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
      .appendingPathComponent(demo ? "HealthGraphDemo" : "HealthGraph", isDirectory: true)
  }
  nonisolated static var storeURL: URL { directory.appendingPathComponent("health.rl") }

  init() {
    enabled = UserDefaults.standard.bool(forKey: Self.enabledTag)
    includesWearables = UserDefaults.standard.bool(forKey: Self.wearablesTag)
  }

  // MARK: - Switches

  func setEnabled(_ on: Bool, reports: [LabReport]) async {
    enabled = on
    UserDefaults.standard.set(on, forKey: Self.enabledTag)
    if on {
      await rebuild(reports)
    } else {
      delete()
    }
  }

  func setIncludesWearables(_ on: Bool, reports: [LabReport]) async {
    includesWearables = on
    UserDefaults.standard.set(on, forKey: Self.wearablesTag)
    if enabled { await rebuild(reports) }
  }

  func delete() {
    try? FileManager.default.removeItem(at: Self.directory)
    summary = nil
    analytes = []
  }

  // MARK: - Building

  /// Rebuilds the graph from scratch, so it always mirrors the reports on this
  /// phone (a deleted report leaves the graph too). Runs off the main actor.
  func rebuild(_ reports: [LabReport]) async {
    guard enabled, !busy else { return }
    busy = true
    defer { busy = false }
    let bundles: [(id: String, data: Data)] =
      reports
      .filter { !($0.extraction.coded.isEmpty && $0.extraction.unmapped.isEmpty) }
      .map { report in
        (
          report.id.uuidString.lowercased(),
          LocalGraphExport.bundle(
            fhirJSON: Data(ReportExport.fhirJSON(report).utf8), unmapped: report.extraction.unmapped)
        )
      }
    var wearables: Data?
    if includesWearables {
      let period = WearableSeries.period(reportDates: reports.map(\.effectiveDate))
      if let series = try? await WearableSources.current.series(in: period), !series.isEmpty {
        wearables = WearableFHIR.json(series)
      }
    }
    do {
      let wearableBundle = wearables
      let (summary, analytes) = try await Task.detached(priority: .userInitiated) {
        try Self.build(bundles: bundles, wearables: wearableBundle)
      }.value
      self.summary = summary
      self.analytes = analytes
      notice = nil
    } catch {
      notice = String(localized: "The graph could not be built: \(error.localizedDescription)")
    }
  }

  /// Reads what the graph holds now, without changing it.
  func refresh() async {
    guard enabled, !busy else { return }
    if let (summary, analytes) = try? await Task.detached(operation: { try Self.read() }).value {
      self.summary = summary
      self.analytes = analytes
    }
  }

  nonisolated private static func build(bundles: [(id: String, data: Data)], wearables: Data?) throws
    -> (Summary, [Analyte])
  {
    let fm = FileManager.default
    try? fm.removeItem(at: directory)
    try fm.createDirectory(
      at: directory, withIntermediateDirectories: true,
      attributes: [.protectionKey: FileProtectionType.complete])
    var folder = directory
    var values = URLResourceValues()
    values.isExcludedFromBackup = true
    try folder.setResourceValues(values)
    do {
      let store = try HealthStore(path: storeURL.path)
      try store.initSchema()
      for bundle in bundles {
        _ = try store.receiveReport(JSON.object(bundle.data), reportId: bundle.id)
      }
      if let wearables {
        _ = try store.receiveWearables(JSON.object(wearables))
      }
    }  // the store closes here
    // Files Relate created inherit the folder's class; say it explicitly anyway.
    for file in (try? fm.contentsOfDirectory(at: directory, includingPropertiesForKeys: nil)) ?? [] {
      try? fm.setAttributes([.protectionKey: FileProtectionType.complete], ofItemAtPath: file.path)
    }
    return try read()
  }

  nonisolated private static func read() throws -> (Summary, [Analyte]) {
    guard FileManager.default.fileExists(atPath: storeURL.path) else { return (Summary(), []) }
    let store = try HealthStore(path: storeURL.path, readOnly: true)
    let counts =
      try store.rows(
        cypher: """
          MATCH (o:Observation)
          RETURN sum(CASE WHEN o.sourceReport = 'apple-health-weekly' THEN 0 ELSE 1 END) AS lab,
                 sum(CASE WHEN o.sourceReport = 'apple-health-weekly' THEN 1 ELSE 0 END) AS weekly,
                 sum(CASE WHEN o.code IS NULL THEN 1 ELSE 0 END) AS unmapped
          """
      ).first ?? [:]
    let summary = Summary(
      reports: try store.count("DiagnosticReport"),
      labValues: Int(counts["lab"] ?? "") ?? 0,
      codedAnalytes: try store.count("LoincCode"),
      unmapped: Int(counts["unmapped"] ?? "") ?? 0,
      weekly: Int(counts["weekly"] ?? "") ?? 0,
      omop: try store.count("OMOPMeasurement"))
    let analytes = try store.rows(
      cypher: """
        MATCH (o:Observation)-[:CODED_BY]->(lc:LoincCode)
        RETURN lc.code AS loinc, collect(DISTINCT o.display)[0] AS label, count(o) AS n,
               left(max(o.effectiveDate), 10) AS last
        ORDER BY n DESC, label
        """
    ).map {
      Analyte(
        loinc: $0["loinc"] ?? "", label: $0["label"] ?? "", count: Int($0["n"] ?? "") ?? 0,
        last: $0["last"] ?? "")
    }
    return (summary, analytes)
  }

  // MARK: - Questions (Cypher on this phone)

  /// One analyte over time, with where each value came from (named query "trend").
  func trend(_ loinc: String) async -> [TrendPoint] {
    let rows =
      (try? await Task.detached {
        try HealthStore(path: Self.storeURL.path, readOnly: true).rows(query: "trend", ["loinc": loinc])
      }.value) ?? []
    return rows.map {
      TrendPoint(
        date: $0["date"] ?? "", value: $0["value"] ?? "", unit: $0["unit"] ?? "",
        source: $0["source"] ?? "", lab: $0["lab"] ?? "")
    }
  }

  /// Values the graph keeps without a LOINC code, and why (named query "unmapped").
  func uncoded() async -> [Uncoded] {
    let rows =
      (try? await Task.detached {
        try HealthStore(path: Self.storeURL.path, readOnly: true).rows(query: "unmapped")
      }.value) ?? []
    return rows.map {
      Uncoded(label: $0["label"] ?? "", date: String(($0["date"] ?? "").prefix(10)), reason: $0["reason"] ?? "")
    }
  }
}

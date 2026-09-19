import Foundation
import Shared
import UIKit

/// Builds the archive a tester takes off the phone.
///
/// One folder per report, holding the record, the scan's diagnostics and the
/// scanned pages, plus the session's log and a note about the build. Zipped,
/// handed to the share sheet, and deleted once shared. See `DiagnosticsBundle`
/// for why there is no other way out of the store, and ADR-038 for why this
/// one is acceptable.
enum DiagnosticsExport {

  /// A request to export, awaiting the person's confirmation.
  enum Request: Equatable {
    case everything
    case report(UUID)
  }

  static func build(reports: [LabReport], store: ReportStore) async throws -> URL {
    let day = ISO8601DateFormatter()
    day.formatOptions = [.withYear, .withMonth, .withDay, .withDashSeparatorInDate]
    let stamp = day.string(from: Date())
    let root = FileManager.default.temporaryDirectory
      .appendingPathComponent("klarbefund-diagnostics-\(stamp)", isDirectory: true)
    try? FileManager.default.removeItem(at: root)
    try FileManager.default.createDirectory(
      at: root, withIntermediateDirectories: true,
      attributes: [.protectionKey: FileProtectionType.complete])

    let encoder = DiagnosticsBundle.encoder()
    func write(_ data: Data, _ name: String, in folder: URL) throws {
      try data.write(
        to: folder.appendingPathComponent(name), options: [.atomic, .completeFileProtection])
    }

    var withScan = 0
    var withDiagnostics = 0
    for report in reports {
      let folder = root.appendingPathComponent(
        "\(slug(report.title))-\(report.id.uuidString.prefix(8))", isDirectory: true)
      try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
      try write(try encoder.encode(report), "report.json", in: folder)
      if let diagnostics = try await store.diagnostics(for: report.id) {
        try write(try encoder.encode(diagnostics), "diagnostics.json", in: folder)
        withDiagnostics += 1
      }
      if let pdf = try await store.scan(for: report.id) {
        try write(pdf, "scan.pdf", in: folder)
        withScan += 1
      }
    }

    let about = About(
      createdAt: Date(), environment: await ScanDiagnostics.Environment.current,
      reports: reports.count, withScan: withScan, withDiagnostics: withDiagnostics)
    try write(try encoder.encode(about), "about.json", in: root)
    try write(Data(DiagnosticsBundle.processLog().utf8), "log.txt", in: root)

    let zip = FileManager.default.temporaryDirectory
      .appendingPathComponent("klarbefund-diagnostics-\(stamp).zip")
    try DiagnosticsBundle.zip(directory: root, to: zip)
    try FileManager.default.setAttributes(
      [.protectionKey: FileProtectionType.complete], ofItemAtPath: zip.path)
    try? FileManager.default.removeItem(at: root)

    Log.diagnostics.notice(
      "diagnostics exported: \(reports.count, privacy: .public) report(s), \(withScan, privacy: .public) with scan, \(withDiagnostics, privacy: .public) with diagnostics"
    )
    return zip
  }

  /// Where a debug build leaves the archive for `Scripts/pull-diagnostics.sh`.
  static var pullURL: URL {
    FileManager.default.temporaryDirectory.appendingPathComponent("pull-diagnostics.zip")
  }

  /// Deletes archives left in the temporary directory by an interrupted share
  /// sheet or a pull that never happened. Called at every launch.
  static func removeLeftovers() {
    let tmp = FileManager.default.temporaryDirectory
    let files = (try? FileManager.default.contentsOfDirectory(
      at: tmp, includingPropertiesForKeys: nil)) ?? []
    for file in files
    where file.lastPathComponent.hasPrefix("klarbefund-diagnostics-")
      || file.lastPathComponent == "pull-diagnostics.zip"
    {
      try? FileManager.default.removeItem(at: file)
    }
  }

  struct About: Codable {
    let createdAt: Date
    let environment: ScanDiagnostics.Environment
    let reports: Int
    let withScan: Int
    let withDiagnostics: Int
  }

  /// A folder name from a title: letters and digits, everything else a dash.
  static func slug(_ title: String) -> String {
    let folded = title.folding(options: [.diacriticInsensitive, .caseInsensitive], locale: nil)
    var out = ""
    var dash = false
    for scalar in folded.unicodeScalars {
      if CharacterSet.alphanumerics.contains(scalar) {
        out.unicodeScalars.append(scalar)
        dash = false
      } else if !dash {
        out.append("-")
        dash = true
      }
    }
    let trimmed = out.trimmingCharacters(in: CharacterSet(charactersIn: "-"))
    return String((trimmed.isEmpty ? "report" : trimmed).prefix(40))
  }
}

extension ScanDiagnostics.Environment {
  /// This build on this device, for the record.
  @MainActor static var current: ScanDiagnostics.Environment {
    var system = utsname()
    uname(&system)
    let model = withUnsafePointer(to: &system.machine) {
      $0.withMemoryRebound(to: CChar.self, capacity: Int(_SYS_NAMELEN)) { String(cString: $0) }
    }
    let info = Bundle.main.infoDictionary ?? [:]
    return ScanDiagnostics.Environment(
      appVersion: info["CFBundleShortVersionString"] as? String ?? "?",
      build: info["CFBundleVersion"] as? String ?? "?",
      systemName: UIDevice.current.systemName,
      systemVersion: UIDevice.current.systemVersion,
      deviceModel: model)
  }
}

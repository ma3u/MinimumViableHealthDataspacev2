import Foundation
import Shared
import UIKit

/// Everything the app holds about one person, in one archive they can keep.
///
/// This is not the diagnostics archive beside it, and the difference is who it
/// is for. Diagnostics answer "why did the reader misread this line": the
/// recognised text, the geometry, the process log, the build. This one answers
/// "give me my data", which in Article 15 means all of it, and in Article 20
/// means in a structured, commonly used, machine-readable form that another
/// system can take. So: no log, no build number, nothing about the device.
/// Every value, every page, the profile, and the same data several times over,
/// because a copy in a format the next system cannot open is not portability.
///
/// Klarbefund keeps this data on the phone and transmits none of it, so there
/// is no controller holding a copy to write to and no thirty-day clock. The
/// rights are still what a person expects of an app that holds their blood
/// results, and on a device-only app the only way to honour them is in the
/// app.
///
/// Four representations, each for a different recipient:
///
/// - `data.json` — the app's own records, complete, including the lines that
///   could not be coded and the ones that could not be read at all.
/// - `fhir/` — one FHIR R4 bundle per report, what a practice system speaks.
/// - `omop/` — the OMOP CDM tables, what a research database speaks.
/// - `pdf/` and `scans/` — a page a human reads, and the original photographs.
enum DataExport {

  /// The archive's own description of itself, carried inside it.
  ///
  /// Nothing here identifies a device or a build. `generatedAt` and the counts
  /// are there so that a person can tell two exports apart and see at a glance
  /// whether anything is missing.
  struct Manifest: Codable {
    let generatedAt: Date
    let application: String
    let reports: Int
    let values: Int
    let uncodedLines: Int
    let unreadLines: Int
    let scans: Int
    let contents: [String]
  }

  struct Archive: Codable {
    let manifest: Manifest
    /// What the app knows about the person, as opposed to their results.
    let profile: Profile
    /// The one preference that is worth carrying: which model answers a
    /// question. Not health data, but it is a choice the person made and a
    /// copy of their data that hides their own settings is a partial copy.
    let analysisProvider: String
    let reports: [LabReport]
  }

  /// - Parameter pages: the scanned document of a report, from wherever it
  ///   is kept. A closure rather than the store itself, because a debug build
  ///   seeded with demo reports holds their pages beside the store and an
  ///   archive that quietly omitted them would pass a test it should fail.
  static func build(
    reports: [LabReport], profile: Profile, provider: BringYourOwnProvider.Kind,
    pages: @Sendable (LabReport) async throws -> Data?
  ) async throws -> URL {
    let day = ISO8601DateFormatter()
    day.formatOptions = [.withYear, .withMonth, .withDay, .withDashSeparatorInDate]
    let stamp = day.string(from: Date())
    let name = "klarbefund-meine-daten-\(stamp)"

    let tmp = FileManager.default.temporaryDirectory
    let root = tmp.appendingPathComponent(name, isDirectory: true)
    try? FileManager.default.removeItem(at: root)
    try FileManager.default.createDirectory(
      at: root, withIntermediateDirectories: true,
      attributes: [.protectionKey: FileProtectionType.complete])

    func folder(_ path: String) throws -> URL {
      let url = root.appendingPathComponent(path, isDirectory: true)
      try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
      return url
    }
    func write(_ data: Data, _ file: String, in directory: URL) throws {
      try data.write(
        to: directory.appendingPathComponent(file), options: [.atomic, .completeFileProtection])
    }

    // Newest first, and ties broken by id so that two exports of the same
    // data name their files the same way.
    let ordered = reports.sorted {
      $0.effectiveDate == $1.effectiveDate
        ? $0.id.uuidString < $1.id.uuidString : $0.effectiveDate > $1.effectiveDate
    }
    let fhir = try folder("fhir")
    let pdfs = try folder("pdf")
    let scans = try folder("scans")

    var scanCount = 0
    // A first attempt named the files by date and title alone, and six of
    // twenty-three reports overwrote one another: a month of body
    // composition readings all print the same title. An archive that says
    // nothing was left out has to be right about that.
    var used: Set<String> = []
    for report in ordered {
      var base = fileName(report)
      if !used.insert(base).inserted {
        base = "\(base)-\(report.id.uuidString.lowercased())"
        used.insert(base)
      }
      try write(Data(ReportExport.fhirJSON(report).utf8), "\(base).json", in: fhir)
      let scan = try await pages(report)
      try write(ReportExport.renderPDF(report, hasScan: scan != nil), "\(base).pdf", in: pdfs)
      if let scan {
        try write(scan, "\(base).pdf", in: scans)
        scanCount += 1
      }
    }

    let omop = OmopExport.bundle(from: ordered, profile: profile)
    let omopFolder = try folder("omop")
    for (file, contents) in omop.files {
      try write(Data(contents.utf8), file, in: omopFolder)
    }

    let manifest = Manifest(
      generatedAt: Date(),
      application: "Klarbefund",
      reports: ordered.count,
      values: ordered.reduce(0) { $0 + $1.extraction.coded.count },
      uncodedLines: ordered.reduce(0) { $0 + $1.extraction.unmapped.count },
      unreadLines: ordered.reduce(0) { $0 + $1.extraction.suspiciousLines.count },
      scans: scanCount,
      contents: ["data.json", "fhir/", "omop/", "pdf/", "scans/", "README.txt"])
    let archive = Archive(
      manifest: manifest, profile: profile, analysisProvider: provider.rawValue,
      reports: ordered)
    try write(try DiagnosticsBundle.encoder().encode(archive), "data.json", in: root)
    try write(Data(readme(manifest).utf8), "README.txt", in: root)

    let zip = tmp.appendingPathComponent("\(name).zip")
    try? FileManager.default.removeItem(at: zip)
    try DiagnosticsBundle.zip(directory: root, to: zip)
    try FileManager.default.setAttributes(
      [.protectionKey: FileProtectionType.complete], ofItemAtPath: zip.path)
    try? FileManager.default.removeItem(at: root)

    Log.export.notice(
      "data export: \(manifest.reports, privacy: .public) report(s), \(manifest.values, privacy: .public) value(s), \(scanCount, privacy: .public) scan(s)"
    )
    return zip
  }

  /// Deletes archives a share sheet was closed on. Called at every launch,
  /// beside the diagnostics leftovers.
  static func removeLeftovers() {
    let tmp = FileManager.default.temporaryDirectory
    let files = (try? FileManager.default.contentsOfDirectory(
      at: tmp, includingPropertiesForKeys: nil)) ?? []
    for file in files
    where file.lastPathComponent.hasPrefix("klarbefund-meine-daten-")
      || file.lastPathComponent == "pull-my-data.zip"
    {
      try? FileManager.default.removeItem(at: file)
    }
  }

  /// `2024-03-11-alphaklinik-berlin-4f2c1a90`, so the folders sort by date
  /// and two reports of the same kind on the same day stay two files.
  static func fileName(_ report: LabReport) -> String {
    let day = ISO8601DateFormatter()
    day.formatOptions = [.withYear, .withMonth, .withDay, .withDashSeparatorInDate]
    let id = report.id.uuidString.prefix(8).lowercased()
    return "\(day.string(from: report.effectiveDate))-\(DiagnosticsExport.slug(report.title))-\(id)"
  }

  /// The page a person reads first, in their own language.
  ///
  /// Written for the person, not for a lawyer: what is in the archive, what
  /// each folder is good for, and the two things they should know before
  /// sending it anywhere. The archive itself is not encrypted, because a
  /// copy the recipient cannot open is not a copy, and saying so plainly is
  /// better than a surprise.
  static func readme(_ manifest: Manifest) -> String {
    let when = manifest.generatedAt.formatted(date: .long, time: .shortened)
    return String(
      localized: """
        Your data from Klarbefund
        Created \(when)

        This archive holds everything the app has stored about you: \
        \(manifest.reports) report(s), \(manifest.values) recognised value(s), \
        \(manifest.scans) scanned document(s), and your profile. Nothing has \
        been left out, including the \(manifest.uncodedLines) line(s) that \
        matched no code and the \(manifest.unreadLines) line(s) that could not \
        be read.

        What is in here

        data.json   Everything, as the app stores it. The complete copy.
        fhir/       One FHIR R4 bundle per report. This is what a doctor's
                    practice system or a patient record can usually import.
        omop/       The same values as OMOP CDM tables (CSV), the format a
                    research database expects.
        pdf/        One readable page per report, to print or to send on.
        scans/      Your original photographed documents, unchanged.

        Two things worth knowing

        This archive is not encrypted, so that whoever you give it to can open \
        it. On the phone your reports are encrypted individually and cannot be \
        read while it is locked; this copy has left that protection. Keep it \
        somewhere you would keep a paper report.

        Values read from a photograph can be misread. Each one names the page \
        and line it came from so it can be checked against the original, and \
        the scans are in here for exactly that.

        Klarbefund keeps your reports only on your phone and sends them \
        nowhere. This archive was made on the device, by you.
        """)
  }
}

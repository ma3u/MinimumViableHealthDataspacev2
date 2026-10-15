import Foundation
import Testing

@testable import Shared

/// Whole reports already on the phone, by their measurements. Fictional
/// values throughout.
@Suite("Duplicate reports")
struct DuplicateReportsTests {

  static let day = ReportMetadataExtractor.day(2026, 3, 3)!

  static func report(
    _ values: [(String, Double, String)], day: Date = DuplicateReportsTests.day,
    scanned: Date = Date(timeIntervalSince1970: 1_800_000_000), pages: Bool = true,
    id: UUID = UUID()
  ) -> LabReport {
    let coded = values.compactMap { label, value, unit -> CodedLabValue? in
      guard let coding = Analytes.lookup(label: label, unit: unit) else { return nil }
      return CodedLabValue(
        raw: RawLabValue(label: label, value: value, unitRaw: unit, line: label, lineNumber: 1),
        coding: coding, source: .labIssuedDigital)
    }
    return LabReport(
      id: id, scannedAt: scanned, collectedOn: day, title: "Befund",
      extraction: ExtractionResult(
        coded: coded, unmapped: [], suspiciousLines: [], source: .labIssuedDigital),
      metadata: ReportMetadata(labDate: day),
      scan: pages ? LabReport.ScanAttachment(pageCount: 1, bytes: 10) : nil,
      hasDiagnostics: pages)
  }

  static let panel: [(String, Double, String)] = [
    ("LDL-Cholesterin", 141, "mg/dl"), ("HDL-Cholesterin", 48, "mg/dl"),
    ("Ferritin", 210, "ug/l"),
  ]

  @Test("the same paper imported twice is identical, and the older copy can go")
  func identical() {
    let old = Self.report(Self.panel, scanned: Date(timeIntervalSince1970: 1_790_000_000))
    let new = Self.report(Self.panel)
    let match = DuplicateReports.matches(for: new, among: [old]).first
    #expect(match?.relation == .identical)
    #expect(match?.redundant.id == old.id)
  }

  @Test("of two identical copies, the one without pages is the one to remove")
  func keepsEvidence() {
    let withPages = Self.report(Self.panel, scanned: Date(timeIntervalSince1970: 1_790_000_000))
    let bare = Self.report(Self.panel, pages: false)
    #expect(DuplicateReports.matches(for: bare, among: [withPages]).first?.redundant.id == bare.id)
  }

  @Test("a rescan that reads more supersedes the older scan of the same paper")
  func supersedes() {
    let old = Self.report([("Körpergewicht", 80, "kg")])
    let new = Self.report(Self.panel + [("Körpergewicht", 80, "kg")])
    let match = DuplicateReports.matches(for: new, among: [old]).first
    #expect(match?.relation == .supersedes)
    #expect(match?.redundant.id == old.id)
  }

  @Test("a scan of one page of a report already stored adds nothing")
  func contained() {
    let whole = Self.report(Self.panel)
    let page = Self.report(Array(Self.panel.prefix(2)))
    let match = DuplicateReports.matches(for: page, among: [whole]).first
    #expect(match?.relation == .contained)
    #expect(match?.redundant.id == page.id)
  }

  @Test("another day, another value, or a partial overlap is another report")
  func notDuplicates() {
    let stored = Self.report(Self.panel)
    let otherDay = Self.report(Self.panel, day: ReportMetadataExtractor.day(2026, 3, 4)!)
    var changed = Self.panel
    changed[0] = ("LDL-Cholesterin", 140, "mg/dl")
    let otherValue = Self.report(changed)
    let overlap = Self.report([Self.panel[0], ("HbA1c", 5.4, "%")])
    #expect(DuplicateReports.matches(for: otherDay, among: [stored]).isEmpty)
    #expect(DuplicateReports.matches(for: Self.report(changed), among: [stored]).isEmpty)
    #expect(DuplicateReports.matches(for: otherValue, among: [stored]).isEmpty)
    #expect(DuplicateReports.matches(for: overlap, among: [stored]).isEmpty)
  }

  @Test("finds each redundant stored report once")
  func pairs() {
    let a = Self.report(Self.panel)
    let b = Self.report(Self.panel)
    let c = Self.report(Self.panel)
    let other = Self.report([("HbA1c", 5.4, "%")])
    let found = DuplicateReports.pairs(in: [a, b, c, other])
    #expect(found.count == 2)
    #expect(Set(found.map(\.redundant.id)).count == 2)
    #expect(!found.contains { $0.redundant.id == other.id })
  }
}

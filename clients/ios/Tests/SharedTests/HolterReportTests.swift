import Foundation
import Testing

@testable import Shared

/// A 24-hour Holter report's summary and hourly table, as the recogniser read
/// a real one: its lines, spacing and misreadings; every value, time,
/// identifier, birth date, centre and vendor invented
/// (`Fixtures/holter-report-pages.json`, README rule 1).
@Suite("A 24-hour Holter report")
struct HolterReportTests {

  static let pages: [String] = {
    struct Fixture: Decodable { let pages: [String] }
    let url = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
      .appendingPathComponent("Fixtures/holter-report-pages.json")
    return try! JSONDecoder().decode(Fixture.self, from: Data(contentsOf: url)).pages
  }()

  private func values(_ pages: [String] = HolterReportTests.pages) -> [String: Double] {
    Dictionary(HolterReport.read(pageTexts: pages).map { ($0.label, $0.value) }) { a, _ in a }
  }

  @Test("reads the statistical summary")
  func summary() {
    let v = values()
    #expect(v["Aufzeichnungsdauer"] == 1438)  // 23:58
    #expect(v["Herzschläge gesamt"] == 94212)
    #expect(v["Herzfrequenz 24-h-Minimum"] == 47)
    #expect(v["Herzfrequenz 24-h-Mittel"] == 68)
    #expect(v["Herzfrequenz 24-h-Maximum"] == 136)
    #expect(v["Ventrikuläre Extrasystolen"] == 3)
    #expect(v["Supraventrikuläre Extrasystolen"] == 6)
    #expect(v["Artefakte"] == 2)
    #expect(v["Zeit über der Tachykardiegrenze"] == 4.85)
    #expect(v["Zeit unter der Bradykardiegrenze"] == 72.15)
    #expect(v["Pausen"] == 0)
  }

  @Test("never reads the analysis settings as results")
  func settings() {
    // `Tachycardias equal to or greater than 120 bpm`, `Prematurity of SVs 20 %`.
    #expect(!HolterReport.read(pageTexts: Self.pages).contains { $0.value == 120 || $0.value == 20 })
  }

  @Test("refuses a value the hourly table's totals contradict")
  func totalsDisagree() {
    let pages = [Self.pages[0], Self.pages[1].replacingOccurrences(of: "Totals:  47  68  136", with: "Totals:  41  68  136")]
    let v = values(pages)
    #expect(v["Herzfrequenz 24-h-Minimum"] == nil)
    #expect(v["Herzfrequenz 24-h-Maximum"] == 136)
  }

  @Test("refuses minimum, average and maximum out of order")
  func order() {
    let summary = Self.pages[0].replacingOccurrences(of: "Average:  68 bpm", with: "Average:  168 bpm")
    let v = values([summary])
    #expect(v["Herzfrequenz 24-h-Mittel"] == nil)
    #expect(v["Herzfrequenz 24-h-Minimum"] == nil)
    #expect(v["Herzschläge gesamt"] == 94212)
  }

  @Test("codes with LOINC where it can, files the report as a Holter study, and drops the grammar's noise")
  func codedAndFiled() {
    let noise = ExtractionResult(
      coded: [],
      unmapped: [
        UnmappedLabValue(
          raw: RawLabValue(label: "HR", value: 50, unitRaw: "bpm", line: "HR 50 bpm", lineNumber: 1),
          reason: .unknownAnalyte)
      ],
      suspiciousLines: ["Prematurity of SVs 20 %"], source: .ocrTranscribed)
    let result = HolterReport.applied(to: noise, pageTexts: Self.pages)
    #expect(result.unmapped.isEmpty)
    #expect(result.suspiciousLines.isEmpty)
    let codes = Set(result.coded.compactMap(\.coding.loinc))
    #expect(codes.isSuperset(of: ["8618-1", "76637-8", "8883-1", "41924-2", "8873-2", "76126-2"]))
    #expect(FhirWriter.isHolter(result.coded))
    #expect(result.coded.allSatisfy { FhirWriter.category($0) == "procedure" || $0.coding.loinc == "41924-2" })
  }

  @Test("a lab report is not taken for a Holter report")
  func notHolter() {
    #expect(HolterReport.read(pageTexts: ["Natrium 140 mmol/l\nKalium 4,1 mmol/l"]).isEmpty)
  }
}

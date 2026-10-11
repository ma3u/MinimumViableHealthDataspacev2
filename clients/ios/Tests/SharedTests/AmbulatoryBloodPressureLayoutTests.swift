import Foundation
import Testing

@testable import Shared

/// A 24-hour ABPM summary page as the recogniser returned it from a real
/// photograph: every fragment's position and every quirk of the reading is
/// the real page's (the diastolic dipping figure without its minus, `80kg`
/// glued, the day SD of the DIA row lost, a percentage read as `4970`).
/// Every number, name, date and organisation is invented
/// (`Fixtures/abpm-24h-layout.json`, README rule 1).
///
/// It runs the whole chain a scan runs: the line grammar on the reading
/// order, then the ABPM reader, through the one function both the import and
/// the replay call.
@Suite("A 24-hour ABPM page, real layout, invented values")
struct AmbulatoryBloodPressureLayoutTests {

  private struct Fixture: Decodable {
    struct Fragment: Decodable {
      let text: String
      let x, y, w, h: Double
    }
    let fragments: [Fragment]
  }

  static let page: ScanDiagnostics.Page = {
    let url = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
      .appendingPathComponent("Fixtures/abpm-24h-layout.json")
    let fixture = try! JSONDecoder().decode(Fixture.self, from: Data(contentsOf: url))
    let fragments = fixture.fragments.map {
      DocumentReconciler.TextFragment(
        text: $0.text, region: SourceRegion(page: 1, x: $0.x, y: $0.y, width: $0.w, height: $0.h))
    }
    return ScanDiagnostics.Page(
      page: 1, imageWidth: 1, imageHeight: 1, tableCount: 0, cells: [], fragments: fragments,
      rows: [], orphanedFragments: [], layout: nil,
      plainText: VisionDocumentReader.readingOrder(fragments), recognitionSeconds: 0)
  }()

  static let result: ExtractionResult = AmbulatoryBloodPressure.applied(
    to: ScanReplay.run(page), pageTexts: [page.plainText], pages: [page])

  private func value(_ label: String) -> Double? {
    Self.result.coded.first { $0.raw.label == label }?.raw.value
  }

  @Test("reads all fifteen means")
  func means() {
    let expected: [(String, Double)] = [
      ("Systolischer Blutdruck 24-h-Mittel", 122), ("Systolischer Blutdruck Tagesmittel", 128),
      ("Systolischer Blutdruck Nachtmittel", 110), ("Diastolischer Blutdruck 24-h-Mittel", 72),
      ("Diastolischer Blutdruck Tagesmittel", 78), ("Diastolischer Blutdruck Nachtmittel", 60),
      ("Puls 24-h-Mittel", 64), ("Puls Tagesmittel", 68), ("Puls Nachtmittel", 58),
      ("Mittlerer arterieller Druck 24-h-Mittel", 88), ("Mittlerer arterieller Druck Tagesmittel", 94),
      ("Mittlerer arterieller Druck Nachtmittel", 76), ("Pulsdruck 24-h-Mittel", 50),
      ("Pulsdruck Tagesmittel", 50), ("Pulsdruck Nachtmittel", 50),
    ]
    for (label, number) in expected {
      #expect(value(label) == number, "\(label)")
    }
  }

  @Test("restores the minus the recogniser dropped from the diastolic dip")
  func dipping() {
    #expect(value("Nächtliche Absenkung systolisch") == -14.1)
    #expect(value("Nächtliche Absenkung diastolisch") == -23)
    #expect(value("Nächtliche Absenkung Puls") == -14.7)
  }

  @Test("reads height, weight and BMI once each, with their codes")
  func header() {
    let byCode = Dictionary(grouping: Self.result.coded) { $0.coding.loinc ?? "" }
    #expect(byCode["8302-2"]?.map(\.raw.value) == [182])
    #expect(byCode["29463-7"]?.map(\.raw.value) == [80])
    #expect(byCode["39156-5"]?.map(\.raw.value) == [24.2])
  }

  @Test("leaves no grid cell, dipping row or limit line behind as unread or unmatched")
  func leftovers() {
    #expect(!Self.result.unmapped.contains { ["SYS", "DIA", "Puls", "MAD", "PP"].contains($0.raw.label) })
    #expect(!Self.result.suspiciousLines.contains { $0.hasPrefix("SYS") || $0.hasPrefix("DIA") })
    #expect(!Self.result.suspiciousLines.contains { $0.hasPrefix("Limit") })
    #expect(!Self.result.suspiciousLines.contains { $0.contains("Gewicht") })
  }
}

import Foundation
import Testing

@testable import Shared

/// A laboratory's own PDF, three pages, as `PDFPage.string` returns the text:
/// the real report's lines, its unit wrapped over two lines, its footnote
/// prose, its legend markers and its fatty acids' chain notation. Every result
/// value, name, date, identifier, address and the laboratory are invented
/// (`Fixtures/laboratory-pdf-text.json`, README rule 1).
@Suite("A laboratory's own three-page PDF")
struct LaboratoryPdfTextTests {

  static let pages: [String] = {
    struct Fixture: Decodable { let pages: [String] }
    let url = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
      .appendingPathComponent("Fixtures/laboratory-pdf-text.json")
    return try! JSONDecoder().decode(Fixture.self, from: Data(contentsOf: url)).pages
  }()

  static let result: ExtractionResult = pages.reduce(.empty(source: .labIssuedDigital)) {
    $0.merging(LabLineParser.extract($1, source: .labIssuedDigital))
  }

  private func value(_ loinc: String) -> Double? {
    Self.result.coded.first { $0.coding.loinc == loinc }?.raw.value
  }

  @Test("every printed result is read, nothing unmatched, nothing unread")
  func complete() {
    #expect(Self.result.coded.count == 60)
    #expect(Self.result.unmapped.isEmpty, "\(Self.result.unmapped.map(\.raw.line))")
    #expect(Self.result.suspiciousLines.isEmpty, "\(Self.result.suspiciousLines)")
  }

  @Test("the wrapped eGFR unit, the chain notation and the legend markers")
  func quirks() {
    #expect(value("62238-1") == 93)  // GFR, `ml/` … `m/1.73m²`
    #expect(value("2597-3") != nil)  // red-cell magnesium, `*W`
    #expect(value("22674-6") != nil)  // transferrin in µmol/l
    #expect(value("30522-7") != nil)  // hs-CRP in µg/ml
    let epa = Self.result.coded.first { $0.coding.analyteKey == "epa" }
    #expect(epa?.raw.value == 33.92)
    #expect(epa?.raw.referenceText == ">9.1")
  }

  @Test("the date is the collection's, not the receipt's or the report's")
  func date() {
    let metadata = ReportMetadataExtractor.extract(pages: Self.pages)
    #expect(metadata.labDate == ReportMetadataExtractor.day(2026, 9, 2))
    #expect(metadata.labDateRole == .collection)
  }
}

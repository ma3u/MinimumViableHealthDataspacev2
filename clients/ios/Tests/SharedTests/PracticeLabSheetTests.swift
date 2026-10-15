import Foundation
import Testing

@testable import Shared

/// A practice system's printed lab sheet (an x.isynet "Laborblatt"),
/// photographed, as the phone's recogniser returned it: the real page's
/// cells and fragments, with the table pass's merged value-and-unit column,
/// its misaligned rows and its misread units. Every result value, name,
/// date, ID, practice and laboratory is invented
/// (`Fixtures/practice-lab-sheet-layout.json`, README rule 1).
@Suite("A practice-software lab sheet, photographed")
struct PracticeLabSheetTests {

  private struct Fixture: Decodable {
    struct Page: Decodable {
      let page: Int
      let fragments: [DocumentReconciler.TextFragment]
      let cells: [DocumentReconciler.Cell]
    }
    let pages: [Page]
  }

  static let page: ScanDiagnostics.Page = {
    let url = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
      .appendingPathComponent("Fixtures/practice-lab-sheet-layout.json")
    let fixture = try! JSONDecoder().decode(Fixture.self, from: Data(contentsOf: url))
    let page = fixture.pages[0]
    let reconciled = DocumentReconciler.reconcile(cells: page.cells, fragments: page.fragments)
    return ScanDiagnostics.Page(
      page: 1, imageWidth: 1, imageHeight: 1, tableCount: 2, cells: page.cells,
      fragments: page.fragments, rows: reconciled.rows,
      orphanedFragments: reconciled.orphanedFragments, layout: nil,
      plainText: VisionDocumentReader.readingOrder(page.fragments), recognitionSeconds: 0)
  }()

  static let result = ScanReplay.run(page)

  private func coded(_ loinc: String) -> RawLabValue? {
    Self.result.coded.first { $0.coding.loinc == loinc }?.raw
  }

  @Test("reads the values the table pass merged with their units")
  func values() {
    #expect(coded("6690-2")?.value == 4.38)  // Leukozyten
    #expect(coded("718-7")?.value == 10.1)  // Hämoglobin, its cell held only `g/dl`
    #expect(coded("786-4")?.value == 35.7)  // MCHC
    #expect(coded("2276-4")?.value == 110)  // Ferritin
    #expect(coded("14665-4")?.value == 10.1)  // Kupfer, `i.S.` and a slashless µmol/l
    #expect(Self.result.coded.count >= 22)
  }

  @Test("a result printed as text before its range is the result, with its comparator")
  func resultText() {
    let folate = coded("2284-8")
    #expect(folate?.value == 29.32)
    #expect(folate?.comparator == .greaterThan)
    #expect(folate?.referenceLow == 1.8)
    #expect(folate?.referenceHigh == 9.0)
  }

  @Test("fasting glucose takes the fasting code")
  func fastingGlucose() {
    #expect(coded("1558-6")?.value == 63)
    #expect(coded("2345-7") == nil)
  }

  @Test("the lab date is the final report's, not the print header's or the birth date")
  func date() {
    let metadata = ReportMetadataExtractor.extract(pages: [Self.page.plainText])
    #expect(metadata.labDate == ReportMetadataExtractor.day(2026, 5, 5))
  }

  @Test("no coded value is a reference bound read as the result")
  func noBoundAsValue() {
    for value in Self.result.coded {
      #expect(value.raw.value != value.raw.referenceLow || value.raw.referenceLow == nil, "\(value.raw.line)")
    }
  }
}

/// The rules behind the sheet above, one at a time, with invented values.
@Suite("Practice lab sheet rules")
struct PracticeLabSheetRuleTests {

  @Test("unit, result text, range: the result; a value never opens the range")
  func unitFirst() {
    let swapped = LabLineParser.parseUnitFirst("fs  Folsäure  ng/ml  >27.10  1.8 -9.0")
    #expect(swapped?.value == 27.1)
    #expect(swapped?.comparator == .greaterThan)
    #expect(swapped?.referenceHigh == 9.0)
    // A range then a value, the order of a Berlin sheet, still reads.
    #expect(LabLineParser.parseUnitFirst("Natrium [P]  mmol/l  136 - 145  141")?.value == 141)
    #expect(LabLineParser.parseUnitFirst("NT-proBNP [P]  pg/ml  <125  <35")?.value == 35)
    // Two bounds, the first a result text ending in a full stop: refused.
    #expect(LabLineParser.parseUnitFirst("HoloTC  Holotranscobalamin  pmol/l  > 131.  >50") == nil)
  }

  @Test("a footnote star does not hide a known analyte")
  func footnoteStar() {
    let result = LabLineParser.extract("Selen i.S.* (AAS)  88,0  µg/l  50 - 120", source: .ocrTranscribed)
    #expect(result.coded.first?.coding.loinc == "5724-0")
    #expect(result.coded.first?.raw.value == 88)
  }

  private func cell(_ text: String, row: Int, column: Int, x: Double) -> DocumentReconciler.Cell {
    DocumentReconciler.Cell(
      text: text, region: SourceRegion(page: 1, x: x, y: 0.5 - Double(row) * 0.02, width: 0.15, height: 0.018),
      row: row, column: column)
  }

  private func fragment(_ text: String, row: Int, x: Double) -> DocumentReconciler.TextFragment {
    DocumentReconciler.TextFragment(
      text: text, region: SourceRegion(page: 1, x: x, y: 0.502 - Double(row) * 0.02, width: 0.03, height: 0.012))
  }

  @Test("a value read inside a unit-only cell is put before the unit, once per row")
  func valueBeforeUnit() {
    let cells = [
      cell("HB (Hämoglobin)", row: 0, column: 0, x: 0.1),
      cell("g/dl", row: 0, column: 1, x: 0.5),
      cell("12-16", row: 0, column: 2, x: 0.8),
      // A row that has its value already is not touched.
      cell("MCV", row: 1, column: 0, x: 0.1),
      cell("fl", row: 1, column: 1, x: 0.5),
      cell("88", row: 1, column: 2, x: 0.65),
    ]
    let fragments = [fragment("10,4", row: 0, x: 0.52), fragment("90", row: 1, x: 0.52)]
    let rows = DocumentReconciler.reconcile(cells: cells, fragments: fragments).rows
    #expect(rows[0].cells.map(\.text) == ["HB (Hämoglobin)", "10,4 g/dl", "12-16"])
    #expect(rows[1].cells.map(\.text) == ["MCV", "fl", "88"])
  }

  @Test("a cell in a script a German sheet never prints is read from the text pass")
  func foreignScript() {
    let cells = [cell("GPT (ALAT)", row: 0, column: 0, x: 0.1), cell("UЛ", row: 0, column: 1, x: 0.5)]
    let rows = DocumentReconciler.reconcile(
      cells: cells, fragments: [fragment("U/l", row: 0, x: 0.52)]
    ).rows
    #expect(rows[0].cells[1].text == "U/l")
    #expect(rows[0].cells[1].origin == .recovered)
  }

  @Test("a truncated unit is not repaired into a different one")
  func truncatedUnit() {
    #expect(Analytes.normaliseUnit("IU/") == nil)
    #expect(Analytes.normaliseUnit("U/I") == "U/L")
  }
}

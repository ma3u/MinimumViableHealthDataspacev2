import Testing

@testable import Shared

/// Builds a cell region for row `r`, column `c` on a notional 4-column sheet.
/// Rows run down the page, so a higher row index sits lower in Vision's
/// bottom-left coordinate space.
private func cellRegion(row r: Int, column c: Int, page: Int = 1) -> SourceRegion {
  SourceRegion(
    page: page, x: Double(c) * 0.25, y: 0.9 - Double(r) * 0.05, width: 0.25, height: 0.05)
}

/// A fragment centred inside the given cell.
private func fragment(
  _ text: String, row r: Int, column c: Int, page: Int = 1, offset: Double = 0.0
) -> DocumentReconciler.TextFragment {
  let cell = cellRegion(row: r, column: c, page: page)
  return DocumentReconciler.TextFragment(
    text: text,
    region: SourceRegion(
      page: page, x: cell.x + 0.02 + offset, y: cell.y + 0.015, width: 0.04, height: 0.02)
  )
}

private func cell(
  _ text: String, row r: Int, column c: Int, page: Int = 1
) -> DocumentReconciler.Cell {
  DocumentReconciler.Cell(text: text, region: cellRegion(row: r, column: c, page: page), row: r, column: c)
}

@Suite("Reconciling a table pass against a text pass")
struct DocumentReconcilerTests {

  @Test("an empty cell takes the text the other pass read there")
  func recoversDroppedUnit() {
    // The measured failure: RecognizeDocumentsRequest dropped the `%` on an
    // HbA1c row. The unit selects the LOINC code, so losing it loses the row.
    let cells = [
      cell("HbA1c", row: 0, column: 0),
      cell("5,4", row: 0, column: 1),
      cell("", row: 0, column: 2),
      cell("4,0 - 6,0", row: 0, column: 3),
    ]
    let fragments = [
      fragment("HbA1c", row: 0, column: 0),
      fragment("5,4", row: 0, column: 1),
      fragment("%", row: 0, column: 2),
      fragment("4,0 - 6,0", row: 0, column: 3),
    ]

    let result = DocumentReconciler.reconcile(cells: cells, fragments: fragments)

    #expect(result.rows.count == 1)
    #expect(result.rows[0].cells[2].text == "%")
    #expect(result.rows[0].cells[2].origin == .recovered)
    #expect(result.repairedCellCount == 1)
    #expect(result.rows[0].line == "HbA1c  5,4  %  4,0 - 6,0")
  }

  @Test("a truncated cell is extended only when the two passes agree")
  func extendsOnContainment() {
    let result = DocumentReconciler.reconcile(
      cells: [cell("5", row: 0, column: 0)],
      fragments: [fragment("5,4", row: 0, column: 0)])

    #expect(result.rows[0].cells[0].text == "5,4")
    #expect(result.rows[0].cells[0].origin == .extended)
  }

  @Test("a genuine disagreement keeps the structured pass, it is not papered over")
  func disagreementKeepsCell() {
    // "8,1" does not contain "5,4": the two passes read different things.
    // Silently taking the longer one would invent a value.
    let result = DocumentReconciler.reconcile(
      cells: [cell("5,4", row: 0, column: 0)],
      fragments: [fragment("8,1", row: 0, column: 0)])

    #expect(result.rows[0].cells[0].text == "5,4")
    #expect(result.rows[0].cells[0].origin == .document)
    #expect(result.repairedCellCount == 0)
  }

  @Test("a fragment lands in exactly one cell, never two")
  func noDuplicationAcrossColumns() {
    let cells = [cell("", row: 0, column: 0), cell("", row: 0, column: 1)]
    let result = DocumentReconciler.reconcile(
      cells: cells, fragments: [fragment("LDL-Cholesterin", row: 0, column: 0)])

    #expect(result.rows[0].cells[0].text == "LDL-Cholesterin")
    #expect(result.rows[0].cells[1].text == "")
    #expect(result.orphanedFragments.isEmpty)
  }

  @Test("text in no cell is reported, not discarded")
  func orphansSurvive() {
    // A footnote below the table, or a second panel the table pass missed.
    let orphan = DocumentReconciler.TextFragment(
      text: "Ferritin 210 ug/l",
      region: SourceRegion(page: 1, x: 0.1, y: 0.05, width: 0.3, height: 0.02))

    let result = DocumentReconciler.reconcile(
      cells: [cell("HbA1c", row: 0, column: 0)], fragments: [orphan])

    #expect(result.orphanedFragments.count == 1)
    #expect(result.orphanedFragments[0].text == "Ferritin 210 ug/l")
  }

  @Test("no table means every fragment is an orphan, not an empty result")
  func noTableKeepsEverything() {
    let result = DocumentReconciler.reconcile(
      cells: [], fragments: [fragment("anything", row: 0, column: 0)])

    #expect(result.rows.isEmpty)
    #expect(result.orphanedFragments.count == 1)
  }

  @Test("the row region covers all of its cells")
  func rowRegionIsTheUnion() {
    let result = DocumentReconciler.reconcile(
      cells: [cell("a", row: 0, column: 0), cell("b", row: 0, column: 3)], fragments: [])
    let region = result.rows[0].region

    #expect(region.x == 0.0)
    #expect(abs(region.maxX - 1.0) < 1e-9)
    #expect(region.page == 1)
  }

  @Test("an empty cell contributes no whitespace run to the line")
  func emptyCellsDoNotConfuseTheGrammar() {
    // `label  value    range` would let the line grammar take the reference
    // range as the unit, which is worse than dropping the row.
    let result = DocumentReconciler.reconcile(
      cells: [
        cell("HbA1c", row: 0, column: 0),
        cell("5,4", row: 0, column: 1),
        cell("", row: 0, column: 2),
        cell("4,0 - 6,0", row: 0, column: 3),
      ],
      fragments: [])

    #expect(result.rows[0].line == "HbA1c  5,4  4,0 - 6,0")
  }

  @Test("two tables on one page do not collapse into each other")
  func rowsStayDistinct() {
    let cells = [
      cell("HbA1c", row: 0, column: 0),
      cell("Ferritin", row: 1, column: 0),
    ]
    let result = DocumentReconciler.reconcile(cells: cells, fragments: [])

    #expect(result.rows.count == 2)
    #expect(result.rows[0].cells[0].text == "HbA1c")
    #expect(result.rows[1].cells[0].text == "Ferritin")
  }

  @Test("a fragment on another page never repairs this page's cell")
  func pagesDoNotBleed() {
    let result = DocumentReconciler.reconcile(
      cells: [cell("", row: 0, column: 0, page: 1)],
      fragments: [fragment("%", row: 0, column: 0, page: 2)])

    #expect(result.rows[0].cells[0].text == "")
    #expect(result.orphanedFragments.count == 1)
  }
}

@Suite("Regions carried through to coded values")
struct RegionPassThroughTests {

  @Test("a coded value knows the rectangle it came from")
  func codedValueKeepsItsRegion() {
    let rows = DocumentReconciler.reconcile(
      cells: [
        cell("LDL-Cholesterin", row: 0, column: 0),
        cell("141", row: 0, column: 1),
        cell("mg/dl", row: 0, column: 2),
        cell("< 116", row: 0, column: 3),
      ],
      fragments: []
    ).rows

    let result = LabLineParser.extract(rows: rows, source: .ocrTranscribed)

    #expect(result.coded.count == 1)
    let region = result.coded[0].raw.region
    #expect(region != nil)
    #expect(region?.page == 1)
    #expect(region?.width ?? 0 > 0)
  }

  @Test("the text-only path still works and simply has no region to give")
  func textPathHasNoRegion() {
    let result = LabLineParser.extract(
      "LDL-Cholesterin  141  mg/dl  < 116", source: .ocrTranscribed)

    #expect(result.coded.count == 1)
    #expect(result.coded[0].raw.region == nil)
  }
}

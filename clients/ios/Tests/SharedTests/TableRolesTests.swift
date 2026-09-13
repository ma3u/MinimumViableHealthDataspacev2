import Testing

@testable import Shared

/// Builds reconciler rows from plain strings, one cell per column.
private func rows(_ table: [[String]]) -> [DocumentReconciler.Row] {
  table.enumerated().map { rowIndex, cells in
    let reconciled = cells.enumerated().map { column, text in
      DocumentReconciler.ReconciledCell(
        text: text,
        region: SourceRegion(
          page: 1, x: Double(column) * 0.25, y: 0.9 - Double(rowIndex) * 0.05,
          width: 0.25, height: 0.05),
        column: column,
        origin: .document)
    }
    let region = reconciled.dropFirst().reduce(reconciled[0].region) { $0.union($1.region) }
    return DocumentReconciler.Row(cells: reconciled, region: region)
  }
}

@Suite("Reading a table by column role rather than position")
struct TableRolesTests {

  /// The layout that broke on real paper.
  ///
  /// Taken from the column order of a Berlin study centre's report scanned on
  /// 2026-09-13, which puts unit and reference range *before* the result. The
  /// analyte names and every number here are fictional; only the shape is real,
  /// because `clients/ios/README.md` forbids health data in this directory.
  private static let unitFirst: [[String]] = [
    ["Analyt", "Einheit", "Referenzbereich", "Wert"],
    ["Cholesterin [P]", "mg/dl", "< 200", "212"],
    ["LDL-Cholesterin [P]", "mg/dl", "< 116", "141"],
    ["HDL-Cholesterin [P]", "mg/dl", "> 40", "48"],
    ["Triglyceride [P]", "mg/dl", "< 150", "168"],
    ["Kreatinin [P]", "mg/dl", "0,70 - 1,20", "0,92"],
    ["Ferritin [P]", "ug/l", "30 - 400", "210"],
  ]

  /// The layout the line grammar was written for, which must keep working.
  private static let valueFirst: [[String]] = [
    ["Analyt", "Wert", "Einheit", "Referenzbereich"],
    ["Cholesterin", "212", "mg/dl", "< 200"],
    ["LDL-Cholesterin", "141", "mg/dl", "< 116"],
    ["HDL-Cholesterin", "48", "mg/dl", "> 40"],
    ["Triglyceride", "168", "mg/dl", "< 150"],
    ["Kreatinin", "0,92", "mg/dl", "0,70 - 1,20"],
  ]

  @Test("a unit-first sheet is read correctly, which the positional grammar cannot do")
  func unitFirstLayoutIsRead() {
    let result = LabLineParser.extract(rows: rows(Self.unitFirst), source: .ocrTranscribed)

    #expect(result.coded.count == 6, "got \(result.coded.count) of 6 rows")

    let ldl = result.coded.first { $0.raw.label.contains("LDL") }
    #expect(ldl?.raw.value == 141, "the result column is the last one on this sheet")
    #expect(ldl?.raw.unitRaw == "mg/dl")
    #expect(ldl?.raw.referenceHigh == 116)
    #expect(ldl?.coding.loinc == "2089-1")
  }

  @Test("the original value-first layout still reads exactly as before")
  func valueFirstStillWorks() {
    let result = LabLineParser.extract(rows: rows(Self.valueFirst), source: .ocrTranscribed)

    #expect(result.coded.count == 5)
    let ldl = result.coded.first { $0.raw.label.contains("LDL") }
    #expect(ldl?.raw.value == 141)
    #expect(ldl?.raw.referenceHigh == 116)
  }

  @Test("the reference column is never mistaken for the result")
  func referenceIsNotReadAsValue() {
    // The trap: on the unit-first sheet, `< 116` sits where the old grammar
    // expected the value. Reading 116 as an LDL result would be a plausible
    // number and a wrong one.
    let result = LabLineParser.extract(rows: rows(Self.unitFirst), source: .ocrTranscribed)
    for value in result.coded {
      #expect(
        value.raw.value != value.raw.referenceHigh,
        "\(value.raw.label) took its reference bound as the result")
    }
  }

  @Test("a label carrying a percent sign is still a label")
  func percentInLabel() {
    // A differential blood count prints `Neutrophile %` as the analyte name and
    // `%` as the unit. Against the line grammar the label regex cannot hold the
    // percent sign, so every such row was unreadable.
    let differential = rows([
      ["Analyt", "Wert", "Einheit", "Referenzbereich"],
      ["Neutrophile %", "53,7", "%", "42,0 - 77,0"],
      ["Lymphozyten %", "34,1", "%", "20,0 - 44,0"],
      ["Monozyten %", "8,4", "%", "2,0 - 9,5"],
      ["Eosinophile %", "2,2", "%", "0,5 - 5,5"],
    ])
    let parsed = LabLineParser.parse(rows: differential)

    #expect(parsed.values.count == 4, "got \(parsed.values.count) of 4 differential rows")
    #expect(parsed.values.first?.label == "Neutrophile %")
    #expect(parsed.values.first?.value == 53.7)
    #expect(parsed.values.first?.referenceLow == 42.0)
  }

  @Test("a urine result is refused, never coded as the blood test of the same name")
  func urineIsRefused() {
    // Urine albumin and serum albumin share a name and are different tests.
    // Coding 3.9 mg/l of urine albumin as a serum albumin would read as
    // catastrophically low, and would be entirely the extractor's invention.
    let table = rows([
      ["Analyt", "Einheit", "Referenzbereich", "Wert"],
      ["Albumin [U]", "mg/l", "< 30", "3,9"],
      ["Cholesterin [P]", "mg/dl", "< 200", "212"],
      ["LDL-Cholesterin [P]", "mg/dl", "< 116", "141"],
      ["HDL-Cholesterin [P]", "mg/dl", "> 40", "48"],
      ["Kreatinin [P]", "mg/dl", "0,70 - 1,20", "0,92"],
    ])
    let result = LabLineParser.extract(rows: table, source: .ocrTranscribed)

    #expect(!result.coded.contains { $0.raw.label.contains("[U]") })
    #expect(result.unmapped.contains { $0.reason == .specimenNotSupported })
    // And the blood rows on the same sheet are unaffected.
    #expect(result.coded.contains { $0.coding.loinc == "2089-1" })
  }

  @Test("a plasma marker no longer costs the row its coding")
  func plasmaMarkerIsStripped() {
    // `Cholesterin [P]` folds to `cholesterinp`, which matched nothing. The
    // analyte was known all along.
    #expect(LabLineParser.splitSpecimen("Cholesterin [P]").label == "Cholesterin")
    #expect(LabLineParser.splitSpecimen("Cholesterin [P]").specimen == "P")
    #expect(LabLineParser.splitSpecimen("Lp(a)").specimen == nil)

    let result = LabLineParser.extract(rows: rows(Self.unitFirst), source: .ocrTranscribed)
    #expect(result.coded.contains { $0.coding.loinc == "2093-3" })
  }

  @Test("a table too small or too irregular to read is refused, not guessed")
  func lowConfidenceFallsBack() {
    // Two rows is a coincidence, not a layout. Returning nil sends the caller
    // back to the line grammar rather than applying a wrong layout confidently
    // to every row.
    #expect(TableRoles.infer(rows: [["Analyt", "Wert", "Einheit"], ["x", "1", "mg/dl"]]) == nil)
    #expect(TableRoles.infer(rows: [["a", "b"], ["c", "d"], ["e", "f"]]) == nil)
  }
}

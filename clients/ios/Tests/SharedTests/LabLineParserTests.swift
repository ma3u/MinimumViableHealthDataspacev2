import Testing

@testable import Shared

@Suite("Number parsing: the German convention")
struct NumberTests {
  @Test("a dot before exactly three digits is thousands grouping")
  func thousands() {
    // 1.240 pg/mL NT-proBNP is 1240, a normal result and a cardiology
    // referral, told apart by one rule.
    #expect(LabLineParser.parseNumber("1.240") == 1240)
  }

  @Test("a dot before one or two digits is a decimal point")
  func decimalPoint() {
    #expect(LabLineParser.parseNumber("0.92") == 0.92)
    #expect(LabLineParser.parseNumber("2.4") == 2.4)
  }

  @Test("a comma is the decimal separator")
  func decimalComma() {
    #expect(LabLineParser.parseNumber("87,3") == 87.3)
  }

  @Test("the rightmost separator decides when both appear")
  func mixed() {
    #expect(LabLineParser.parseNumber("1.234,5") == 1234.5)
    #expect(LabLineParser.parseNumber("1,234.5") == 1234.5)
  }

  @Test("anything that is not a number is refused")
  func refusals() {
    #expect(LabLineParser.parseNumber("n.b.") == nil)
    #expect(LabLineParser.parseNumber("") == nil)
    #expect(LabLineParser.parseNumber("negativ") == nil)
  }
}

@Suite("Reference ranges")
struct ReferenceRangeTests {
  @Test("intervals with hyphen, en dash or bis")
  func intervals() {
    #expect(LabLineParser.parseReferenceRange("0,70 - 1,20") == .init(low: 0.7, high: 1.2))
    #expect(LabLineParser.parseReferenceRange("4,8 – 5,9") == .init(low: 4.8, high: 5.9))
    #expect(LabLineParser.parseReferenceRange("197 bis 771") == .init(low: 197, high: 771))
  }

  @Test("an em dash separates an interval too")
  func emDashInterval() {
    // A style sweep twice replaced the em dash inside this parser's own regex
    // alternation, and every suite stayed green because nothing covered it.
    #expect(LabLineParser.parseReferenceRange("0,70 — 1,20") == .init(low: 0.7, high: 1.2))
  }

  @Test("single bounds")
  func bounds() {
    #expect(LabLineParser.parseReferenceRange("< 200") == .init(high: 200))
    #expect(LabLineParser.parseReferenceRange("> 40") == .init(low: 40))
  }

  @Test("free text yields nothing rather than a guess")
  func freeText() {
    #expect(LabLineParser.parseReferenceRange("siehe Vorbefund") == .init())
  }
}

@Suite("Line parsing")
struct LineTests {
  static let report = """
    Laborbefund

    Cholesterin gesamt          212     mg/dl          < 200
    LDL-Cholesterin             141     mg/dl          < 116
    HDL-Cholesterin              48     mg/dl          > 40
    Lp(a)                      87,3     mg/dl          < 30
    hs-CRP                      2,4     mg/l           < 3,0
    HbA1c                       5,7     %              4,8 - 5,9
    Ferritin                    <10     ug/l           30 - 400
    Vitamin B12                 412     pg/ml          197 - 771
    NT-proBNP                 1.240     pg/ml          < 125
    Troponin T hs              n.b.     ng/l           < 14
    Omega-3-Index               4,1     %              > 8
    """

  static let parsed = LabLineParser.parse(report)
  func value(_ label: String) -> RawLabValue? { Self.parsed.values.first { $0.label == label } }

  @Test("reads a plain row with its reference bound")
  func plainRow() {
    #expect(value("LDL-Cholesterin")?.value == 141)
    #expect(value("LDL-Cholesterin")?.referenceHigh == 116)
  }

  @Test("labels containing their own digits stay intact")
  func digitLabels() {
    #expect(value("Vitamin B12")?.value == 412)
    #expect(value("HbA1c")?.value == 5.7)
  }

  @Test("a label with parentheses stays intact")
  func parenLabel() {
    #expect(value("Lp(a)")?.value == 87.3)
  }

  @Test("a comparator on the value is captured")
  func comparator() {
    #expect(value("Ferritin")?.comparator == .lessThan)
    #expect(value("Ferritin")?.value == 10)
  }

  @Test("German thousands survive the line grammar")
  func thousandsInLine() {
    #expect(value("NT-proBNP")?.value == 1240)
  }

  @Test("a row with no numeric result is reported, not invented")
  func notDetermined() {
    #expect(value("Troponin T hs") == nil)
    #expect(Self.parsed.suspiciousLines.contains { $0.contains("Troponin") })
  }

  @Test("headers and address lines produce no values")
  func noJunk() {
    #expect(value("Laborbefund") == nil)
    #expect(Self.parsed.values.allSatisfy { $0.value > 0 })
  }
}

@Suite("Extraction with provenance")
struct ExtractionTests {
  @Test("a scan is preliminary, never final")
  func scanIsPreliminary() {
    let result = LabLineParser.extract(LineTests.report, source: .ocrTranscribed)
    #expect(result.source == .ocrTranscribed)
    #expect(result.source.observationStatus == "preliminary")
    #expect(result.coded.allSatisfy { $0.source == .ocrTranscribed })
  }

  @Test("only a lab's own characters produce final")
  func digitalIsFinal() {
    #expect(SourceKind.labIssuedDigital.observationStatus == "final")
    #expect(SourceKind.selfTracked.observationStatus == "preliminary")
  }

  @Test("codes the cardiovascular panel")
  func codesPanel() {
    let result = LabLineParser.extract(LineTests.report, source: .ocrTranscribed)
    let loincs = Set(result.coded.map(\.coding.loinc))
    #expect(loincs.contains("2089-1"))  // LDL
    #expect(loincs.contains("10835-7"))  // Lp(a) by mass
    #expect(loincs.contains("30522-7"))  // hs-CRP
    #expect(loincs.contains("33762-6"))  // NT-proBNP
  }

  @Test("an unknown analyte is reported, not guessed")
  func unknownAnalyte() {
    let result = LabLineParser.extract(LineTests.report, source: .ocrTranscribed)
    let omega = result.unmapped.first { $0.raw.label.hasPrefix("Omega-3") }
    #expect(omega?.reason == .unknownAnalyte)
  }

  @Test("a known analyte in the wrong unit is a mismatch, not an unknown")
  func unitMismatch() {
    let result = LabLineParser.extract("HbA1c   5,7   mg/dl   4,8 - 5,9", source: .ocrTranscribed)
    #expect(result.unmapped.first?.reason == .unitMismatch)
    #expect(Analytes.expectedUnits(forLabel: "HbA1c").contains("%"))
  }

  @Test("every parsed row is accounted for exactly once")
  func nothingDropped() {
    let parsed = LabLineParser.parse(LineTests.report)
    let result = LabLineParser.extract(LineTests.report, source: .ocrTranscribed)
    #expect(result.coded.count + result.unmapped.count == parsed.values.count)
  }
}

@Suite("The blood count, and rows the table path used to drop")
struct BloodCountTests {

  private static func row(_ texts: [String], y: Double) -> DocumentReconciler.Row {
    let cells = texts.enumerated().map { column, text in
      DocumentReconciler.ReconciledCell(
        text: text,
        region: SourceRegion(page: 1, x: Double(column) * 0.25, y: y, width: 0.24, height: 0.02),
        column: column, origin: .document)
    }
    let region = cells.dropFirst().reduce(cells[0].region) { $0.union($1.region) }
    return DocumentReconciler.Row(cells: cells, region: region)
  }

  @Test("a row whose unit the map does not know is reported as unknown-unit, not dropped")
  func unknownUnitIsReported() {
    let rows = [
      Self.row(["Analyt", "Ergebnis", "Einheit", "Referenzbereich"], y: 0.9),
      Self.row(["Toxoplasmose-IgG", "1", "Titer", "< 1"], y: 0.85),
      Self.row(["LDL-Cholesterin", "141", "mg/dl", "< 116"], y: 0.8),
      Self.row(["Kreatinin", "0,92", "mg/dl", "0,70 - 1,20"], y: 0.75),
      Self.row(["Ferritin", "210", "µg/l", "30 - 400"], y: 0.7),
    ]
    let result = LabLineParser.extract(rows: rows, source: .ocrTranscribed)

    #expect(result.coded.count == 3)
    // Before this, the row was neither coded, unmapped nor unread: it was
    // gone, and the person could not tell it from a row that was never there.
    let toxo = result.unmapped.first { $0.raw.label == "Toxoplasmose-IgG" }
    #expect(toxo?.reason == .unknownUnit)
    #expect(toxo?.raw.unitRaw == "Titer", "the printed unit is kept for the reviewer")
  }

  @Test("Hamoglobin without its umlaut codes to haemoglobin, and keeps its printed label")
  func umlautDroppedByOCR() {
    let result = LabLineParser.extract(
      "Hamoglobin  15,7  g/dl  13,5 - 17,5", source: .ocrTranscribed)

    #expect(result.coded.first?.coding.loinc == "718-7")
    #expect(result.coded.first?.raw.label == "Hamoglobin")
  }

  @Test("the differential codes by unit: an absolute count and a share are different codes")
  func differentialByUnit() {
    let text = """
      Neutrophile absolut  2,75  /nl  1,8 - 7,7
      Neutrophile  55,3  %  40 - 75
      unreife Granulozyten absolut  0,02  /nl  < 0,1
      MCV  87  fl  80 - 96
      Erythrozyten  5,02  /pl  4,5 - 5,9
      Leukozyten  5,1  G/l  3,9 - 10,5
      """
    let result = LabLineParser.extract(text, source: .ocrTranscribed)

    #expect(
      result.coded.map(\.coding.loinc) == ["751-8", "770-8", "53115-2", "787-2", "789-8", "6690-2"])
    #expect(result.unmapped.isEmpty)
    #expect(result.suspiciousLines.isEmpty)
  }

  @Test("RDW-SD is refused: its LOINC codes are deprecated, and a guess would be worse")
  func deprecatedCodeIsRefused() {
    let result = LabLineParser.extract("RDW-SD  42,1  fl  37 - 54", source: .ocrTranscribed)

    #expect(result.coded.isEmpty)
    #expect(result.unmapped.first?.reason == .unknownAnalyte)
  }
}

@Suite("Rows a real Berlin sheet printed, that the grammar refused")
struct BerlinSheetTests {

  private static func row(_ texts: [String], y: Double) -> DocumentReconciler.Row {
    let cells = texts.enumerated().map { column, text in
      DocumentReconciler.ReconciledCell(
        text: text,
        region: SourceRegion(page: 1, x: Double(column) * 0.25, y: y, width: 0.24, height: 0.02),
        column: column, origin: .document)
    }
    let region = cells.dropFirst().reduce(cells[0].region) { $0.union($1.region) }
    return DocumentReconciler.Row(cells: cells, region: region)
  }

  @Test("a percent sign in the label and one glued to the value")
  func percentInLabelAndGluedToValue() {
    let result = LabLineParser.extract("Neutrophile %  53,7%  42.0-77.0", source: .ocrTranscribed)
    let coded = result.coded.first
    #expect(coded?.coding.loinc == "770-8")
    #expect(coded?.raw.value == 53.7)
    #expect(coded?.raw.unitRaw == "%")
    #expect(coded?.raw.referenceLow == 42 && coded?.raw.referenceHigh == 77)
  }

  @Test("any letter may appear in a label, and a tube code comes off the end")
  func accentedLabelWithTubeCode() {
    #expect(LabLineParser.splitSpecimen("Kreatinin (Jaffé) HP").label == "Kreatinin (Jaffé)")
    #expect(LabLineParser.splitSpecimen("Kreatinin (Jaffé) HP").specimen == "HP")
    #expect(LabLineParser.splitSpecimen("HbA1c(EDTA)").label == "HbA1c")
    #expect(LabLineParser.splitSpecimen("HbA1c(EDTA)").specimen == "EDTA")
    #expect(LabLineParser.splitSpecimen("Albumin [U]").specimen == "U")
    // `HP` inside a word is not a tube code.
    #expect(LabLineParser.splitSpecimen("Haptoglobin").specimen == nil)

    let result = LabLineParser.extract("HbA1c(EDTA)  5,3 %  <6.0", source: .ocrTranscribed)
    #expect(result.coded.first?.coding.loinc == "4548-4")
  }

  @Test("a unit printed inside the label, with the unit column empty")
  func unitInsideLabel() {
    // The token after the value is the range's comparator, not a unit, and it
    // must be handed back to the range rather than lost.
    let line = LabLineParser.extract("HbA1c mmol/mol Hb  34,3  < 42.0", source: .ocrTranscribed)
    #expect(line.coded.first?.coding.loinc == "59261-8")
    #expect(line.coded.first?.raw.referenceHigh == 42)

    let rows = [
      Self.row(["Analyt", "Ergebnis", "Einheit", "Referenzbereich"], y: 0.9),
      Self.row(["HbA1c mmol/mol Hb", "34,3", "", "< 42.0"], y: 0.85),
      Self.row(["Kreatinin", "0,92", "mg/dl", "0,70 - 1,20"], y: 0.8),
      Self.row(["LDL-Cholesterin", "141", "mg/dl", "< 116"], y: 0.75),
      Self.row(["Ferritin", "210", "µg/l", "30 - 400"], y: 0.7),
    ]
    let table = LabLineParser.extract(rows: rows, source: .ocrTranscribed)
    #expect(table.coded.map(\.coding.loinc).contains("59261-8"))
  }

  @Test("a lone dash after the value is a below-range flag, not a range")
  func dashFlag() {
    let rows = [
      Self.row(["Analyt", "Einheit", "Referenzbereich", "Wert"], y: 0.9),
      Self.row(["Transferrin [P]", "g/l", "2.2 - 3.7", "1.9 -"], y: 0.85),
      Self.row(["Kalium [P]", "mmol/l", "3.4 - 4.5", "4.3"], y: 0.8),
      Self.row(["Natrium [P]", "mmol/l", "136 - 145", "141"], y: 0.75),
      Self.row(["CRP [P]", "mg/l", "<5.0", "< 0.5"], y: 0.7),
    ]
    let result = LabLineParser.extract(rows: rows, source: .ocrTranscribed)
    let transferrin = result.unmapped.first { $0.raw.label.hasPrefix("Transferrin") }
      .map(\.raw) ?? result.coded.first { $0.raw.label.hasPrefix("Transferrin") }.map(\.raw)
    #expect(transferrin?.value == 1.9)
    #expect(result.suspiciousLines.isEmpty, "\(result.suspiciousLines)")
    #expect(result.coded.map(\.coding.loinc).contains("2823-3"))
  }

  @Test("unit before value, on the line path, is refused rather than misread")
  func unitBeforeValueStaysUnread() {
    // The study centre's layout. The line grammar cannot tell 141 from 136
    // here; the table path can, by column role. A wrong number is the one
    // outcome this pipeline exists to prevent, so the line path must refuse.
    let lines = [
      "Natrium [P]  mmol/l  136 - 145  141",
      "Kalium [P]  mmol/l  3.4 - 4.5  4.3",
      "NT-proBNP [P]  pg/ml  <125  <35",
      "Ferritin [P]  ug/l  22 -322  169",
      "Cholesterin [P]  mmol/l  < 5.18  6.5 +  250mgldL",
    ]
    for line in lines {
      let result = LabLineParser.extract(line, source: .ocrTranscribed)
      #expect(result.coded.isEmpty, "must not code on the line path: \(line)")
      #expect(result.unmapped.isEmpty, "must not yield a value on the line path: \(line)")
      #expect(result.suspiciousLines == [line])
    }
  }

  @Test("a result still in progress is reported as unread, never as a number")
  func inProgressIsUnread() {
    let result = LabLineParser.extract(
      "Erythroblasten absolut  inArbeit /nl  < 0.01", source: .ocrTranscribed)
    #expect(result.coded.isEmpty)
    #expect(result.suspiciousLines.count == 1)
  }
}

@Suite("A unit the recogniser did not read")
struct MissingUnitTests {

  private static func row(_ texts: [String], y: Double) -> DocumentReconciler.Row {
    let cells = texts.enumerated().map { column, text in
      DocumentReconciler.ReconciledCell(
        text: text,
        region: SourceRegion(page: 1, x: Double(column) * 0.25, y: y, width: 0.24, height: 0.02),
        column: column, origin: .document)
    }
    let region = cells.dropFirst().reduce(cells[0].region) { $0.union($1.region) }
    return DocumentReconciler.Row(cells: cells, region: region)
  }

  /// Measured on iOS 26.5 through a diagnostics record: both Vision passes lost
  /// the lone `%` of an HbA1c row, so the unit cell was empty. The row was
  /// dropped in silence, which is indistinguishable from a row that was never
  /// printed. It must be reported instead, and it must never be guessed: `%`
  /// is 4548-4 and `mmol/mol` is 59261-8.
  @Test("a row with a value but no unit is reported as unread, not dropped and not guessed")
  func emptyUnitCellIsReported() {
    let rows = [
      Self.row(["Analyt", "Ergebnis", "Einheit", "Referenzbereich"], y: 0.9),
      Self.row(["Cholesterin gesamt", "212", "mg/dl", "< 200"], y: 0.85),
      Self.row(["HbA1c", "5,4", "", "4,0 - 6,0"], y: 0.8),
      Self.row(["Kreatinin", "0,92", "mg/dl", "0,70 - 1,20"], y: 0.75),
      Self.row(["Ferritin", "210", "µg/l", "30 - 400"], y: 0.7),
    ]
    let result = LabLineParser.extract(rows: rows, source: .ocrTranscribed)

    #expect(result.coded.count == 3)
    #expect(
      !result.coded.contains { $0.coding.loinc == "4548-4" || $0.coding.loinc == "59261-8" },
      "a missing unit must never be guessed into a coding")
    let reported = result.suspiciousLines.contains { $0.contains("HbA1c") }
      || result.unmapped.contains { $0.raw.label.contains("HbA1c") }
    #expect(reported, "the row must reach the reviewer: \(result.suspiciousLines)")
  }

  @Test("a heading with no number is still not a measurement")
  func headingIsNotReported() {
    let rows = [
      Self.row(["Analyt", "Ergebnis", "Einheit", "Referenzbereich"], y: 0.9),
      Self.row(["Klinische Chemie", "", "", ""], y: 0.85),
      Self.row(["Cholesterin gesamt", "212", "mg/dl", "< 200"], y: 0.8),
      Self.row(["Kreatinin", "0,92", "mg/dl", "0,70 - 1,20"], y: 0.75),
      Self.row(["Ferritin", "210", "µg/l", "30 - 400"], y: 0.7),
    ]
    let result = LabLineParser.extract(rows: rows, source: .ocrTranscribed)

    #expect(result.coded.count == 3)
    #expect(result.suspiciousLines.isEmpty, "\(result.suspiciousLines)")
  }
}

/// A German laboratory's SI layout, the kind that reaches the app as a PDF
/// with its own text layer.
///
/// Every value here is invented. The shapes are not: a method and a material
/// in parentheses after the analyte, `i. S.` for "im Serum", a generation
/// marker, a flag printed between the label and the value, and SI units
/// throughout (giga and tera particles per litre, katal, femtomole,
/// micro-units per millilitre, litre per litre).
@Suite("A German SI-unit report, qualifiers and all")
struct SiLayoutTests {

  static let sheet = """
    Analyse Resultat Einheit Referenz-/Zielbereich Wertelage
    Leukozyten (EB) 5.1 Gpt/l 4.0 - 10.7
    Erythrozyten (EB) 4.78 Tpt/l 4.39 - 5.69
    Hämoglobin (EB) 9.9 mmol/l 8.4 - 10.6
    Hämatokrit (EB) 0.45 l/l 0.39 - 0.50
    MCH (EB) + 2.1 fmol 1.7 - 2.1
    MCHC (EB) 22.2 mmol/l 20.3 - 22.6
    Lymphozyten (mikr.Diff) (EB) 24 % 20 - 44
    Monozyten (mikr.Diff.abs.) (EB) 305 /µl 100 - 900
    Glukose SI (GLEX) (GLEX) 5.49 mmol/l 3.3 - 5.5
    HbA1c (IFCC/neue Std.) (EB) 32 mmol/mol <39
    Kreatinin (n. Jaffe) i. S. (SI) (SE) 96 µmol/l 62 - 106
    Gamma-GT (SE) 0.25 µkat/l <1.0
    HDL-Cholesterin Gen. 4 (SE) - 0.96 mmol/l
    LDL-Cholesterin Gen. 3 (SE) 4.06 mmol/l
    Gesamteiweiß i. S. (SE) - 59.6 g/l 66 - 87
    TSH (basal) (SE) 2.21 µU/ml 0.40 - 4.00
    """

  static var result: ExtractionResult {
    LabLineParser.extract(sheet, source: .labIssuedDigital)
  }

  @Test("every row codes, through its method and material qualifiers")
  func everyRowCodes() {
    let codes = Self.result.coded.map(\.coding.loinc)
    let expected = [
      "6690-2", "789-8", "59260-0", "4544-3", "59468-9", "59467-1", "736-9", "742-7",
      "14749-6", "59261-8", "14682-9", "2324-2", "14646-4", "22748-8", "2885-2", "3016-3",
    ]
    #expect(codes == expected, "got \(codes)")
    #expect(Self.result.unmapped.isEmpty)
    #expect(Self.result.suspiciousLines.isEmpty, "\(Self.result.suspiciousLines)")
  }

  @Test("a number inside the label is not mistaken for the result")
  func generationMarkerIsNotTheValue() {
    // `HDL-Cholesterin Gen. 4 (SE) - 0.96 mmol/l`: the grammar's first match
    // takes 4 as the value and (SE) as the unit. That row used to be lost.
    let hdl = Self.result.coded.first { $0.coding.loinc == "14646-4" }
    #expect(hdl?.raw.value == 0.96)
    let ldl = Self.result.coded.first { $0.coding.loinc == "22748-8" }
    #expect(ldl?.raw.value == 4.06)
  }

  @Test("the printed label is kept verbatim for the audit trail")
  func labelIsKeptAsPrinted() {
    let creatinine = Self.result.coded.first { $0.coding.loinc == "14682-9" }
    #expect(creatinine?.raw.label == "Kreatinin (n. Jaffe) i. S. (SI) (SE)")
    #expect(creatinine?.raw.value == 96)
  }

  @Test("a flag between the label and the value does not become part of either")
  func flagBetweenLabelAndValue() {
    let mch = Self.result.coded.first { $0.coding.loinc == "59468-9" }
    #expect(mch?.raw.value == 2.1)
    #expect(mch?.raw.unitRaw == "fmol")
  }

  @Test("the laboratory's own characters make the values final")
  func textLayerIsFinal() {
    #expect(Self.result.source == .labIssuedDigital)
    #expect(Self.result.source.observationStatus == "final")
  }

  @Test("two analytes merged onto one line are refused, never assigned")
  func mergedRowIsRefused() {
    // A two-column text layer can put two labels on one line and their values
    // on the next. Giving the first value to the first label would be right
    // here and wrong elsewhere, so the row is reported instead.
    let result = LabLineParser.extract(
      "GOT (ASAT) (SE) GPT (ALAT) (SE) 0.53 µkat/l <0.58", source: .labIssuedDigital)
    #expect(result.coded.isEmpty)
    #expect(result.unmapped.first?.reason == .unknownAnalyte)
  }
}

/// A practice system's printout: its own short code in a column before the
/// analyte's name, and a photograph of two pages in one file.
///
/// Every value here is invented; the shapes come from a real printout that
/// coded nothing at all before this (#186).
@Suite("A practice-software printout")
struct PracticeSoftwareTests {

  static func extract(_ line: String) -> ExtractionResult {
    LabLineParser.extract(line, source: .ocrTranscribed)
  }

  @Test("the short code in front of the name is dropped, the printed label is kept")
  func leadingCodeIsDropped() {
    let result = Self.extract("leuco  Leukozyten  5,55  /nl  3.7-10.1")
    #expect(result.coded.first?.coding.loinc == "6690-2")
    #expect(result.coded.first?.raw.label == "leuco  Leukozyten")
    #expect(result.coded.first?.raw.value == 5.55)
  }

  @Test("a code is dropped from the front and a qualifier from the back at once")
  func bothEndsAtOnce() {
    // Doing the two in sequence loses the answer: the trailing rule takes the
    // `B12` that names the analyte and leaves `b12 Vitamin`.
    #expect(Self.extract("b12  Vitamin B12  243  pg/ml  180 - 914").coded.first?.coding.loinc == "2132-9")
    #expect(Self.extract("VITDT  25-OH Vitamin D  22,2  ng/ml  30-60").coded.first?.coding.loinc == "1989-3")
    #expect(Self.extract("ferri  Ferritin (CLIA)  156  ng/ml  18-360").coded.first?.coding.loinc == "2276-4")
    #expect(Self.extract("Cu  Kupfer i.S.  12,4  µmol/l  11.0 - 22.0").coded.first?.coding.loinc == "14665-4")
  }

  @Test("a leading code that names a different analyte is never dropped")
  func disagreeingCodeIsKept() {
    // The rule that makes the whole thing safe. `HDL Cholesterin` must not
    // become total cholesterol: same number, different test, different range.
    let known = Self.extract("HDL Cholesterin  66,2  mg/dl  40-60")
    #expect(known.coded.first?.coding.loinc == "2085-9")

    // A spelling the dictionary does not know, whose code and remainder
    // disagree, is refused rather than coded as the remainder.
    let invented = Self.extract("hdl  Cholesterinwert  200  mg/dl  < 200")
    #expect(invented.coded.isEmpty)
    #expect(invented.unmapped.first?.reason == .unknownAnalyte)
  }

  @Test("a specimen marker whose brackets the recogniser mangled is still read")
  func mixedDelimiters() {
    let result = Self.extract("bzP  Glukose nüchtern (i.Plasma]  94  mg/dl  60-100")
    #expect(result.coded.first?.coding.loinc == "2345-7")
  }

  @Test("a urine row is refused, never coded as the serum test of the same name")
  func urineIsRefused() {
    for line in ["Glucose i.U.  50  mg/dl", "uprot  Protein i. U.  12  mg/dl"] {
      let result = Self.extract(line)
      #expect(result.coded.isEmpty, "\(line) must not code")
      #expect(result.unmapped.first?.reason == .specimenNotSupported, "\(line)")
    }
    // The serum spelling still works.
    #expect(Self.extract("Kupfer i.S.  12,4  µmol/l").coded.first?.coding.loinc == "14665-4")
  }

  @Test("a stray separator where the flag column was does not lose the row")
  func strayFlagPunctuation() {
    let result = Self.extract("trig  Triglyceride  162  ;  mg/dl  <150")
    #expect(result.coded.first?.coding.loinc == "2571-8")
    #expect(result.coded.first?.raw.referenceHigh == 150)
    // And a range printed after one is still read.
    #expect(LabLineParser.parseReferenceRange(": 33-36") == .init(low: 33, high: 36))
  }
}

/// A study centre's scanned report: no text layer, a unit glued to its value,
/// and glyphs from another alphabet.
///
/// Invented values, real shapes (#186).
@Suite("A scanned study-centre report")
struct ScannedStudyReportTests {

  static func extract(_ line: String) -> ExtractionResult {
    LabLineParser.extract(line, source: .ocrTranscribed)
  }

  @Test("a unit glued to its value is still a unit")
  func gluedUnit() {
    // `5,0/pl` with no space. The row used to disappear: no token parsed as a
    // unit, so it was not even reported as unread.
    let result = Self.extract("Erythrozyten  5,0/pl  4.5-5.9")
    #expect(result.coded.first?.coding.loinc == "789-8")
    #expect(result.coded.first?.raw.value == 5.0)
    #expect(result.coded.first?.raw.unitRaw == "/pl")
  }

  @Test("a value followed by a hyphenated word is not read as a glued unit")
  func hyphenIsNotAUnit() {
    // The counter-example that keeps the rule narrow: an unrestricted glued
    // unit matches `-OH` here and the grammar never reaches the real row.
    #expect(Self.extract("VITDT  25-OH Vitamin D  22,2  ng/ml  30-60").coded.first?.coding.loinc == "1989-3")
  }

  @Test("a Cyrillic letter that looks Latin is folded, not stripped")
  func homoglyphs() {
    // `МСH` with a Cyrillic Em and Es: identical on screen, different code
    // points, and `normaliseLabel` used to strip them and leave `h`.
    #expect(Self.extract("МСH  32,1  pg  28.0-33.0").coded.first?.coding.loinc == "785-6")
    #expect(Analytes.normaliseLabel("МСH") == Analytes.normaliseLabel("MCH"))
  }

  @Test("a unit the recogniser mangled is repaired, within guards")
  func mangledUnits() {
    #expect(Self.extract("gpt  GPT (ALAT)  23  U/I  <50").coded.first?.coding.loinc == "1742-6")
    #expect(Self.extract("got  GOT (ASAT)  30  UII  <50").coded.first?.coding.loinc == "1920-8")
    #expect(Self.extract("tsh  TSH basal  1,55  ulU/ml  0.27-4.20").coded.first?.coding.loinc == "3016-3")
  }

  @Test("a row we can name but not read reaches the reviewer")
  func namedButUnreadable() {
    // `Hämatokrit (l/l)` came back as `Hämatokrit (I/I) 0.435 M`: an analyte
    // the dictionary knows, a number, and nothing that is a unit. Silence
    // here is indistinguishable from a row that was never printed.
    let result = Self.extract("Hämatokrit (I/I)  0.435 M  0.390-0.500")
    #expect(result.coded.isEmpty)
    #expect(result.suspiciousLines.count == 1)

    // And a page header that merely carries numbers still is not a measurement.
    #expect(Self.extract("Seite 1 von 2").suspiciousLines.isEmpty)
    #expect(Self.extract("Auftrag Nr. : 71311103 / Ext.Nr.: 71311103").suspiciousLines.isEmpty)
  }

  @Test("reticulocyte haemoglobin is its own analyte")
  func reticulocyteHaemoglobin() {
    #expect(Self.extract("Ret-Hb  34,2  pg  28.0-36.0").coded.first?.coding.loinc == "71694-4")
  }
}

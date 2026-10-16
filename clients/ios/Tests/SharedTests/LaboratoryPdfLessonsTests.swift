import CoreGraphics
import Foundation
import Testing

@testable import Shared

/// What two laboratory PDFs taught the parser. The layouts are real; every
/// value here is invented.
@Suite("Laboratory PDF lessons")
struct LaboratoryPdfLessonsTests {

  private func coded(_ text: String) -> [String: (Double, String?)] {
    let result = LabLineParser.extract(text, source: .labIssuedDigital)
    return Dictionary(
      result.coded.map { ($0.coding.loinc ?? $0.raw.label, ($0.raw.value, $0.raw.referenceText)) }
    ) { a, _ in a }
  }

  @Test("an eGFR whose unit is wrapped over two lines, its range between them")
  func wrappedUnit() {
    let text = "GFR (CKD-EPI-Formel) (SE) 84 ml/\n>60\nm/1.73m²\nHarnsäure (SE) 297 µmol/l 202 - 416"
    let values = coded(text)
    #expect(values["62238-1"]?.0 == 84)
    #expect(values["62238-1"]?.1 == ">60")
    #expect(values["3084-1"] != nil || values.count == 2)
    #expect(LabLineParser.extract(text, source: .labIssuedDigital).suspiciousLines.isEmpty)
  }

  @Test("the same, when the range already sits after the broken unit")
  func wrappedUnitRangeFirst() {
    let values = coded("GFR (CKD-EPI-Formel) (SE) 84 ml/ >60\nm/1.73m²")
    #expect(values["62238-1"]?.0 == 84)
  }

  @Test("a fatty acid's chain notation is part of its name")
  func colonInLabel() {
    let result = LabLineParser.extract(
      "Eicosapentaensäure (EPA) 20:5 w3 (EB) 41.20 mg/l >9.1 *W", source: .labIssuedDigital)
    let epa = result.coded.first
    #expect(epa?.coding.analyteKey == "epa")
    #expect(epa?.raw.value == 41.2)
    // The legend marker is not part of the range.
    #expect(epa?.raw.referenceText == ">9.1")
    #expect(epa?.raw.referenceLow == 9.1)
  }

  @Test("a reagent generation and a share of total fatty acids are read past")
  func generationAndShare() {
    let values = coded(
      "Folsäure (restandardisiert) Gen.3 (SE) 12.4 ng/ml 3.89 - 26.8\nOmega-3-Index (EPA und DHA) (EB) 7.10 % ges. FS>8.0 *W")
    #expect(values["2284-8"]?.0 == 12.4)
    let omega = LabLineParser.extract(
      "Omega-3-Index (EPA und DHA) (EB) 7.10 % ges. FS>8.0 *W", source: .labIssuedDigital
    ).coded.first
    #expect(omega?.raw.referenceLow == 8)
    #expect(omega?.raw.referenceText == "ges. FS>8.0")
  }

  @Test("a footnote that starts like a value is not an unread result")
  func footnotes() {
    let text = """
      <130 mg/dl bzw. <3.38 mmol/l. Non-HDL-Cholesterin
      1.0-3.0 µg/ml mittleres kardiovaskuläres Risiko
      0.52 µkat/l <0.75
      """
    let unread = LabLineParser.extract(text, source: .labIssuedDigital).suspiciousLines
    #expect(unread == ["0.52 µkat/l <0.75"])
  }

  @Test("new units and analytes: hs-CRP in µg/ml, transferrin in µmol/l, red-cell magnesium")
  func dictionary() {
    let values = coded(
      """
      C-reaktives Protein (ultrasensitiv) (SE) 0.9 µg/ml <1.0
      Transferrin (SE) 31.0 µmol/l 25.2 - 45.4
      Magnesium in Erythrozyten (EB) 2.31 mmol/l 1.65 - 2.65 *W
      """)
    #expect(values["30522-7"]?.0 == 0.9)
    #expect(values["22674-6"]?.0 == 31)
    #expect(values["2597-3"]?.0 == 2.31)
    // Red-cell magnesium never takes the serum code.
    #expect(values["2601-3"] == nil)
  }

  @Test("a PDF's lines are rebuilt by height, side text kept apart")
  func pdfRows() {
    func f(_ text: String, _ x: CGFloat, _ y: CGFloat, _ w: CGFloat) -> (CGRect, String) {
      (CGRect(x: x, y: y, width: w, height: 10), text)
    }
    // Drawn in the order a real PDF drew them: both names, then both values.
    let rows = PDFTextRows.rows([
      f("Analyse", 100, 700, 50),
      f("GOT (ASAT) (SE)", 100, 600, 80), f("GPT (ALAT) (SE)", 100, 588, 80),
      f("0.61 µkat/l <0.58", 300, 600.5, 90), f("0.44 µkat/l <0.75", 300, 588.3, 90),
      f("Fallnummer:", 10, 600, 50),
    ])
    #expect(rows.contains("GOT (ASAT) (SE) 0.61 µkat/l <0.58"))
    #expect(rows.contains("GPT (ALAT) (SE) 0.44 µkat/l <0.75"))
    #expect(rows.contains("Fallnummer:"))
  }
}

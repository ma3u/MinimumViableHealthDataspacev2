import Foundation
import Testing

@testable import Shared

/// Rows shaped like the ones nineteen real scans refused or mis-coded
/// (2026-10-04). The layouts are the laboratories'; every value is invented.
@Suite("What nineteen real scans taught")
struct RealScanLessonsTests {
  private func code(_ line: String) -> String? {
    LabLineParser.extract(line, source: .ocrTranscribed).coded.first?.coding.loinc ?? nil
  }

  private func refusal(_ line: String) -> UnmappedReason? {
    LabLineParser.extract(line, source: .ocrTranscribed).unmapped.first?.reason
  }

  @Test("a urine row takes the urine code, and serum keeps the serum one")
  func urine() {
    #expect(code("Albumin [U]  12 mg/l  < 30") == "1754-1")
    #expect(code("Kreatinin [U]  9,1 mmol/l") == "14683-7")
    #expect(code("Albumin [P]  42 g/l  35 - 52") == "1751-7")
  }

  @Test("a urine row the dictionary has no urine entry for is still refused")
  func urineWithoutEntry() {
    #expect(refusal("Natrium [U]  80 mmol/l") == .specimenNotSupported)
    // A 24-hour collection is coded per day, and the dictionary has no such code.
    #expect(refusal("Albumin [SU]  20 mg/l") == .specimenNotSupported)
  }

  @Test("a microscopic differential takes the manual-count codes")
  func manualDifferential() {
    #expect(code("Lymphozyten (mikr.Diff) (EB)  30 %") == "737-7")
    #expect(code("Neutrophile Granu. (mikr.Diff.abs.) (EB)  3000 /µl") == "753-4")
    #expect(code("Segmentkernige Granulozyten (mikr.) (EB)  60 %") == "769-0")
    #expect(code("Lymphozyten  30 %") == "736-9")
  }

  @Test("an order code in capitals with a hyphen comes off the front")
  func hyphenatedLeadingCode() {
    #expect(code("STU-FSCPC Transferrin [P)  2,6 g/l  2,0 - 3,6") == "3034-6")
    #expect(LabLineParser.looksLikeLeadingCode("Gamma-GT") == false)
  }

  @Test("rn joined into m still names the analyte")
  func rnAsM() {
    let printed = code("hs  Harnsäure  5,1 mg/dl")
    #expect(printed != nil)
    #expect(code("hs  Hamsäure  5,1 mg/dl") == printed)
  }

  @Test("a stray glyph before the unit and a garbled eGFR unit are read")
  func unitNoise() {
    #expect(code("ferri  Ferritin (CLIA)  120  Ing/ml  18-360") == "2276-4")
    #expect(code("CKDEPI  GFR Berechnung n. CKD-EPI  90  mimin/1.73m  >60") == "62238-1")
  }

  @Test("25-OH vitamin D is D2 plus D3 unless the label says D3")
  func vitaminD() {
    #expect(code("VITDT  25-OH Vitamin D  30  ng/ml  30-60") == "62292-8")
    #expect(code("25-OH-Vitamin-D3  30 ng/ml") == "1989-3")
  }

  @Test("a practice code that abbreviates the name comes off, even when it spells another analyte")
  func abbreviatingCode() {
    #expect(code("thr  Thrombozyten  240  /nl  150 - 400") == "777-3")
    // The guard it bypasses still holds where the code is not an abbreviation.
    #expect(code("HDL Cholesterin  55 mg/dl") == "2085-9")
  }
}

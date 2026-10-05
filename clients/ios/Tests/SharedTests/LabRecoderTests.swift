import Foundation
import Testing

@testable import Shared

/// "Read again" for a report without stored pages: its own rows through the
/// current parser and dictionary. Every value here is invented.
@Suite("Coding a report again from its stored rows")
struct LabRecoderTests {
  private func raw(_ line: String, label: String, value: Double, unit: String) -> RawLabValue {
    RawLabValue(label: label, value: value, unitRaw: unit, line: line, lineNumber: 7,
      region: SourceRegion(page: 1, x: 0.1, y: 0.2, width: 0.5, height: 0.02))
  }

  @Test("a row refused by an older dictionary codes now, and keeps its place on the page")
  func refusedRowCodes() {
    let line = "Hamsäure  5,1 mg/dl  3,4 - 7,0"
    let stored = ExtractionResult(
      coded: [],
      unmapped: [UnmappedLabValue(raw: raw(line, label: "Hamsäure", value: 5.1, unit: "mg/dl"), reason: .unknownAnalyte)],
      suspiciousLines: [], source: .ocrTranscribed)
    let outcome = LabRecoder.recode(stored)
    #expect(outcome.recovered == 1)
    #expect(outcome.extraction.unmapped.isEmpty)
    let value = outcome.extraction.coded.first
    #expect(value?.raw.value == 5.1)
    #expect(value?.raw.lineNumber == 7)
    #expect(value?.raw.region?.y == 0.2)
  }

  @Test("an unread line is read again")
  func unreadLineReads() {
    let stored = ExtractionResult(
      coded: [], unmapped: [],
      suspiciousLines: ["ferri  Ferritin (CLIA)  120  Ing/ml  18-360"], source: .ocrTranscribed)
    let outcome = LabRecoder.recode(stored)
    #expect(outcome.extraction.coded.map(\.coding.loinc) == ["2276-4"])
    #expect(outcome.extraction.suspiciousLines.isEmpty)
  }

  @Test("a coded value takes its corrected code and keeps its number")
  func correctedCode() throws {
    let line = "VITDT  25-OH Vitamin D  30  ng/ml  30-60"
    let old = try #require(Analytes.codings.first { $0.loinc == "1989-3" })
    let stored = ExtractionResult(
      coded: [CodedLabValue(raw: raw(line, label: "VITDT  25-OH Vitamin D", value: 30, unit: "ng/ml"), coding: old, source: .ocrTranscribed)],
      unmapped: [], suspiciousLines: [], source: .ocrTranscribed)
    let outcome = LabRecoder.recode(stored)
    #expect(outcome.recoded == 1)
    #expect(outcome.extraction.coded.first?.coding.loinc == "62292-8")
    #expect(outcome.extraction.coded.first?.raw.value == 30)
  }

  @Test("a coded value the parser cannot place again is kept, never dropped")
  func nothingLost() throws {
    let coding = try #require(Analytes.codings.first { $0.loinc == "2093-3" })
    let stored = ExtractionResult(
      coded: [CodedLabValue(raw: raw("a line the grammar does not read", label: "Cholesterin", value: 190, unit: "mg/dl"), coding: coding, source: .labIssuedDigital)],
      unmapped: [], suspiciousLines: ["still nothing to read here 12"], source: .labIssuedDigital)
    let outcome = LabRecoder.recode(stored)
    #expect(outcome.extraction.coded == stored.coded)
    #expect(outcome.extraction.suspiciousLines == stored.suspiciousLines)
    #expect(outcome.recovered == 0 && outcome.recoded == 0)
    #expect(outcome.extraction.source == .labIssuedDigital)
  }

  @Test("rows split from one line each take back their own value, not their neighbours'")
  func splitLine() {
    let line = "Akkermansia muciniphila 0,5 % Prevotella spp. 12,0 % Prevotella copri 9,5 %"
    let rows = [("Akkermansia muciniphila", 0.5), ("Prevotella spp.", 12.0), ("Prevotella copri", 9.5)]
    let stored = ExtractionResult(
      coded: [],
      unmapped: rows.enumerated().map { index, row in
        UnmappedLabValue(
          raw: RawLabValue(label: row.0, value: row.1, unitRaw: "%", line: line, lineNumber: 100 + index),
          reason: .unknownAnalyte)
      },
      suspiciousLines: [], source: .ocrTranscribed)
    let outcome = LabRecoder.recode(stored)
    #expect(outcome.extraction.coded.count == 3)
    #expect(outcome.extraction.coded.map(\.raw.value) == [0.5, 12.0, 9.5])
  }

  @Test("exact copies collapse to one, so a multiplied record is repaired")
  func repairsCopies() throws {
    let line = "Akkermansia muciniphila 0,5 % Prevotella spp. 12,0 %"
    let coded = LabLineParser.extract(line, source: .ocrTranscribed).coded
    try #require(coded.count == 2)
    let multiplied = ExtractionResult(
      coded: coded + coded + coded, unmapped: [], suspiciousLines: [], source: .ocrTranscribed)
    #expect(LabRecoder.recode(multiplied).extraction.coded.count == 2)
  }
}

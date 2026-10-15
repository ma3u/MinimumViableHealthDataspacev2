import Foundation
import Testing

@testable import Shared

/// The accuracy measure itself. Every value here is invented.
@Suite("Extraction accuracy against a hand-checked truth")
struct ExtractionAccuracyTests {

  private func coded(
    _ label: String, _ value: Double, _ unit: String, reference: String? = nil,
    comparator: Shared.Comparator? = nil, line: Int = 1
  ) throws -> CodedLabValue {
    let coding = try #require(
      Analytes.lookup(label: label, unit: unit), "\(label) [\(unit)] must be in the dictionary")
    return CodedLabValue(
      raw: RawLabValue(
        label: label, value: value, unitRaw: unit, comparator: comparator,
        referenceText: reference, line: "\(label) \(value) \(unit)", lineNumber: line),
      coding: coding, source: .ocrTranscribed)
  }

  private func refused(_ label: String, _ value: Double, _ unit: String) -> UnmappedLabValue {
    UnmappedLabValue(
      raw: RawLabValue(
        label: label, value: value, unitRaw: unit, line: "\(label) \(value) \(unit)",
        lineNumber: 1),
      reason: .specimenNotSupported)
  }

  private func extraction(
    _ coded: [CodedLabValue], unmapped: [UnmappedLabValue] = [], unread: [String] = []
  ) -> ExtractionResult {
    ExtractionResult(
      coded: coded, unmapped: unmapped, suspiciousLines: unread, source: .ocrTranscribed)
  }

  @Test("a sheet read exactly scores every row exact and no silent error")
  func exactSheet() throws {
    let ldl = try coded("LDL-Cholesterin", 141, "mg/dl", reference: "< 116")
    let truth = ExtractionAccuracy.TruthFile(
      labDate: "2026-09-12",
      rows: [
        .init(label: "LDL-Cholesterin", value: 141, unit: "mg/dl", loinc: ldl.coding.loinc,
          referenceText: "<116")
      ])
    let report = ExtractionAccuracy.compare(
      truth: truth, extraction: extraction([ldl]),
      labDate: ReportMetadataExtractor.day(2026, 9, 12))

    #expect(report.summary.exact == 1)
    #expect(report.summary.silentErrors == 0)
    #expect(report.summary.referenceCorrect == 1)
    #expect(report.labDate == .correct)
    #expect(report.summary.inexactCodes.isEmpty)
  }

  @Test("a coded wrong value is a silent error, a missing row is not")
  func silentVersusMissing() throws {
    let ldl = try coded("LDL-Cholesterin", 741, "mg/dl")
    let hdl = try coded("HDL-Cholesterin", 48, "mg/dl")
    let truth = ExtractionAccuracy.TruthFile(rows: [
      .init(label: "LDL-Cholesterin", value: 141, unit: "mg/dl", loinc: ldl.coding.loinc),
      .init(label: "HDL-Cholesterin", value: 48, unit: "mg/dl", loinc: hdl.coding.loinc),
      .init(label: "Triglyceride", value: 168, unit: "mg/dl", loinc: "2571-8"),
    ])
    let report = ExtractionAccuracy.compare(truth: truth, extraction: extraction([ldl, hdl]))

    #expect(report.summary.truthRows == 3)
    #expect(report.summary.found == 2)
    #expect(report.summary.exact == 1)
    #expect(report.summary.silentErrors == 1, "741 for 141 is the error that reaches a doctor")
    #expect(report.rows[2].found == false)
    #expect(report.rows[2].silentError == false, "a missed row is re-scanned, not trusted")
  }

  @Test("a refusal the truth expects counts as correct, a coding it did not is wrong")
  func refusals() throws {
    let truth = ExtractionAccuracy.TruthFile(rows: [
      .init(label: "Natrium [U]", value: 80, unit: "mmol/l", loinc: nil, refused: true)
    ])
    let right = ExtractionAccuracy.compare(
      truth: truth, extraction: extraction([], unmapped: [refused("Natrium [U]", 80, "mmol/l")]))
    #expect(right.summary.exact == 1)
    #expect(right.summary.silentErrors == 0)
  }

  @Test("a coded value with no row on the sheet is spurious")
  func spurious() throws {
    let hdl = try coded("HDL-Cholesterin", 48, "mg/dl")
    let ldl = try coded("LDL-Cholesterin", 141, "mg/dl")
    let truth = ExtractionAccuracy.TruthFile(rows: [
      .init(label: "HDL-Cholesterin", value: 48, unit: "mg/dl", loinc: hdl.coding.loinc)
    ])
    let report = ExtractionAccuracy.compare(truth: truth, extraction: extraction([hdl, ldl]))
    #expect(report.summary.spurious == 1)
  }

  @Test("a mangled label still pairs by value and unit")
  func pairsByValue() throws {
    let hdl = try coded("HDL-Cholesterin", 48, "mg/dl")
    let truth = ExtractionAccuracy.TruthFile(rows: [
      .init(label: "Cholesterin HDL (direkt)", value: 48, unit: "mg/dl", loinc: hdl.coding.loinc)
    ])
    let report = ExtractionAccuracy.compare(truth: truth, extraction: extraction([hdl]))
    #expect(report.rows[0].found)
    #expect(report.summary.exact == 1)
  }

  @Test("a comparator is part of the value: <10 is not 10")
  func comparator() throws {
    let ferritin = try coded("Ferritin", 10, "ug/l", comparator: .lessThan)
    let truth = ExtractionAccuracy.TruthFile(rows: [
      .init(label: "Ferritin", value: 10, comparator: "<", unit: "ug/l",
        loinc: ferritin.coding.loinc),
      .init(label: "Ferritin", value: 10, unit: "ug/l", loinc: ferritin.coding.loinc),
    ])
    let report = ExtractionAccuracy.compare(truth: truth, extraction: extraction([ferritin]))
    #expect(report.rows[0].valueCorrect)
    #expect(report.rows[1].found == false, "one extracted row pairs once")
  }

  @Test("a wrong lab date is reported, a missing truth date is not checked")
  func labDate() throws {
    let truth = ExtractionAccuracy.TruthFile(labDate: "2026-09-12", rows: [])
    let wrong = ExtractionAccuracy.compare(
      truth: truth, extraction: extraction([]), labDate: ReportMetadataExtractor.day(2026, 9, 14))
    #expect(wrong.labDate == .wrong)
    #expect(wrong.summary.labDateChecked == 1)
    #expect(wrong.summary.labDateCorrect == 0)

    let unchecked = ExtractionAccuracy.compare(
      truth: .init(rows: []), extraction: extraction([]), labDate: nil)
    #expect(unchecked.labDate == .notChecked)
  }

  @Test("the published summary carries no label and no value")
  func summaryIsPublishable() throws {
    let ldl = try coded("LDL-Cholesterin", 141, "mg/dl")
    let truth = ExtractionAccuracy.TruthFile(rows: [
      .init(label: "LDL-Cholesterin", value: 142, unit: "mg/dl", loinc: ldl.coding.loinc)
    ])
    let summary = ExtractionAccuracy.compare(truth: truth, extraction: extraction([ldl])).summary
    let json = String(decoding: try JSONEncoder().encode(summary), as: UTF8.self)
    #expect(!json.contains("LDL"))
    #expect(!json.contains("141"))
    #expect(!json.contains("142"))
  }

  @Test("a truth file decodes with the optional fields left out")
  func decodesMinimalTruth() throws {
    let json = #"""
      {"schema": 1, "rows": [{"label": "HbA1c", "value": 5.4, "unit": "%", "loinc": "4548-4"}]}
      """#
    let truth = try JSONDecoder().decode(
      ExtractionAccuracy.TruthFile.self, from: Data(json.utf8))
    #expect(truth.rows.first?.refused == false)
    #expect(truth.rows.first?.comparator == nil)
    #expect(truth.labDay == nil)
  }

  @Test("summaries add up across sheets")
  func aggregates() {
    var total = ExtractionAccuracy.Summary()
    var one = ExtractionAccuracy.Summary()
    one.sheets = 1
    one.truthRows = 8
    one.exact = 7
    total.add(one)
    total.add(one)
    #expect(total.sheets == 2)
    #expect(total.truthRows == 16)
    #expect(total.exactRate == 14.0 / 16.0)
  }
}

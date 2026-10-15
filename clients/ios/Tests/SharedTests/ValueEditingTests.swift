import Foundation
import Testing

@testable import Shared

/// Correcting, confirming, suggesting and reporting: the person's side of a
/// scan. Invented values throughout.
@Suite("Checking values against the paper")
struct ValueEditingTests {

  static let misread = RawLabValue(
    label: "Hamnstoff", value: 36, unitRaw: "mg/dl", referenceLow: 17, referenceHigh: 43,
    referenceText: "17 - 43", line: "Hamnstoff  36  mg/dl  17 - 43", lineNumber: 4,
    region: SourceRegion(page: 1, x: 0.1, y: 0.5, width: 0.8, height: 0.02))

  @Test("a corrected name is coded again, and the reading it replaced is kept")
  func relabel() {
    guard
      case .coded(let value) = ValueEditing.edit(
        Self.misread, label: "Harnstoff", value: 36, unit: "mg/dl", source: .ocrTranscribed)
    else {
      Issue.record("not coded")
      return
    }
    #expect(value.coding.analyteKey == "urea")
    #expect(value.raw.line == Self.misread.line)  // the evidence stays
    #expect(value.raw.referenceHigh == 43)
    #expect(value.verification?.original?.label == "Hamnstoff")
    #expect(value.verification?.edited == true)
  }

  @Test("a name the dictionary does not know is kept as unmatched, never under the old code")
  func unknownName() {
    let outcome = ValueEditing.edit(
      Self.misread, label: "Zonulin", value: 36, unit: "ng/ml", source: .ocrTranscribed)
    guard case .unmapped(let item) = outcome else {
      Issue.record("coded")
      return
    }
    #expect(item.raw.label == "Zonulin")
  }

  @Test("confirming without a change records the check and no original")
  func confirm() {
    guard
      case .coded(let value) = LabLineParser.code(
        RawLabValue(label: "Ferritin", value: 120, unitRaw: "ug/l", line: "Ferritin 120 ug/l", lineNumber: 1),
        source: .ocrTranscribed)
    else { return }
    let checked = ValueEditing.verify(value, at: Date(timeIntervalSince1970: 1_800_000_000))
    #expect(checked.verification?.edited == false)
    let all = ExtractionResult(coded: [value], unmapped: [], suspiciousLines: [], source: .ocrTranscribed)
      .verifyingAll()
    #expect(all.coded.allSatisfy { $0.verification != nil })
  }

  @Test("correcting an unmatched value moves it into the coded list")
  func unmatchedToCoded() {
    let extraction = ExtractionResult(
      coded: [], unmapped: [UnmappedLabValue(raw: Self.misread, reason: .unknownAnalyte)],
      suspiciousLines: [], source: .ocrTranscribed)
    let outcome = ValueEditing.edit(
      Self.misread, label: "Harnstoff", value: 36, unit: "mg/dl", source: .ocrTranscribed)
    let next = extraction.replacingUnmapped(at: 0, with: outcome)
    #expect(next.coded.count == 1)
    #expect(next.unmapped.isEmpty)
  }

  @Test("a value stored before checks existed still opens")
  func olderRecords() throws {
    let json = #"{"raw":{"label":"Ferritin","value":120,"unitRaw":"ug/l","line":"x","lineNumber":1},"coding":{"labelKey":"ferritin","ucum":"ug/L","loinc":"2276-4","display":"Ferritin","analyteKey":"ferritin"},"source":"ocr-transcribed"}"#
    let value = try JSONDecoder().decode(CodedLabValue.self, from: Data(json.utf8))
    #expect(value.verification == nil)
  }

  @Test("suggests a name from what the values are, and the laboratory")
  func suggestion() {
    func coded(_ label: String, _ value: Double, _ unit: String) -> CodedLabValue {
      guard case .coded(let c) = LabLineParser.code(
        RawLabValue(label: label, value: value, unitRaw: unit, line: label, lineNumber: 1),
        source: .ocrTranscribed)
      else { fatalError(label) }
      return c
    }
    let holter = [coded("Herzschläge gesamt", 90000, "{beats}"), coded("Herzfrequenz 24-h-Mittel", 64, "/min")]
    #expect(ReportSuggestion.title(coded: holter, laboratory: "Praxis Muster - Kardiologie GmbH, Musterweg 2")
      == "Holter ECG, Praxis Muster - Kardiologie")
    let lipids = [coded("LDL-Cholesterin", 140, "mg/dl"), coded("HDL-Cholesterin", 50, "mg/dl")]
    #expect(ReportSuggestion.title(coded: lipids, laboratory: nil) == "Lipid profile")
    let count = [coded("Hämoglobin", 14, "g/dl"), coded("Leukozyten", 6, "/nl"), coded("Thrombozyten", 250, "/nl")]
    #expect(ReportSuggestion.kind(of: count) == "Blood count")
    #expect(ReportSuggestion.title(coded: [], laboratory: nil, fallback: "Körperzusammensetzung") == "Körperzusammensetzung")
  }

  @Test("the laboratory a practice sheet names on its group row is suggested")
  func practiceLaboratory() {
    let metadata = ReportMetadataExtractor.extract(pages: [
      "x.isynet - Laborblatt  Datum: 14.05.2026 Seite: 1\nID: 1234567, LA(Endbefund) - Labor\nMuster\nleuco Leukozyten 5,2 /nl 3.7-10.1"
    ])
    #expect(metadata.laboratory == "Labor Muster")
  }

  @Test("the feedback issue masks every digit and leaves out title, laboratory and dates")
  func feedback() throws {
    let report = LabReport(
      id: UUID(), scannedAt: Date(), collectedOn: Date(),
      title: "Befund Erika Muster 01.01.1970",
      extraction: ExtractionResult(
        coded: [], unmapped: [UnmappedLabValue(raw: Self.misread, reason: .unknownAnalyte)],
        suspiciousLines: ["Selen i.S.* (AAS)  83,7 pg/  50 - 120"], source: .ocrTranscribed),
      metadata: ReportMetadata(laboratory: "Labor Muster"))
    let draft = FeedbackIssue.draft(report: report, note: "Selen 83,7 fehlt", build: "1.0 (6)")
    let text = draft.title + draft.body
    #expect(!text.contains("Erika"))
    #expect(!text.contains("Labor Muster"))
    #expect(!text.contains("83"))
    #expect(!text.contains("36"))
    #expect(text.contains("Selen ##,# fehlt"))
    #expect(text.contains("`Hamnstoff`"))
    let url = try #require(FeedbackIssue.url(title: draft.title, body: draft.body))
    #expect(url.absoluteString.hasPrefix("https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/new?"))
  }

  @Test("a new reading keeps every check: the same value, a checked number, a value it missed")
  func keepingChecks() {
    func value(_ label: String, _ number: Double, _ unit: String) -> CodedLabValue {
      let raw = RawLabValue(label: label, value: number, unitRaw: unit, line: "\(label) \(number)", lineNumber: 1)
      return CodedLabValue(raw: raw, coding: Analytes.lookup(label: label, unit: unit)!, source: .ocrTranscribed)
    }
    let checked = ExtractionResult(
      coded: [
        value("Harnstoff", 36, "mg/dl"), value("Kreatinin", 0.9, "mg/dl"),
        value("Natrium", 140, "mmol/l"), value("Kalium", 4.1, "mmol/l"),
      ],
      unmapped: [], suspiciousLines: [], source: .ocrTranscribed
    ).verifyingAll()
    let unchecked = Array(checked.coded.dropLast()) + [value("Kalium", 4.1, "mmol/l")]
    let again = ExtractionResult(
      coded: [
        value("Harnstoff", 36, "mg/dl"),  // read alike
        value("Kreatinin", 0.6, "mg/dl"),  // read differently
        value("Glukose", 92, "mg/dl"),  // new
      ],
      unmapped: [], suspiciousLines: [], source: .ocrTranscribed)
    let kept = again.keepingChecks(of: Array(checked.coded.prefix(3)) + [unchecked[3].unverified])
    let byLabel = Dictionary(kept.coded.map { ($0.raw.label, $0) }) { a, _ in a }
    #expect(byLabel["Harnstoff"]?.verification != nil)
    #expect(byLabel["Kreatinin"]?.raw.value == 0.9, "the number the person checked")
    #expect(byLabel["Natrium"]?.verification != nil, "not found again, and kept")
    #expect(byLabel["Glukose"]?.verification == nil)
    #expect(byLabel["Kalium"] == nil, "an unchecked value is the new reading's to keep or lose")
    #expect(kept.checkedCount == 3)
    #expect(kept.coded.count == 4)
    // The one that reads differently is named, not overwritten.
    let conflicts = again.keepingChecksReporting(of: Array(checked.coded.prefix(3))).conflicts
    #expect(conflicts.map(\.label) == ["Kreatinin"])
    #expect(conflicts.first?.checked == 0.9)
    #expect(conflicts.first?.readNow == 0.6)
  }
}

private extension CodedLabValue {
  var unverified: CodedLabValue {
    var copy = self
    copy.verification = nil
    return copy
  }
}

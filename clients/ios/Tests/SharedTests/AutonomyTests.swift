import Testing

@testable import Shared

/// The properties that must hold when nothing outside the phone is reachable.
///
/// The EHDS cluster is not always up, and a person reading their own lab report
/// at home should not depend on anyone's infrastructure to do it. These assert
/// the parts of that which live in `Shared`; the on-device model path itself is
/// in the app target and needs a device with Apple Intelligence.
@Suite("Working with nothing reachable")
struct AutonomyTests {

  @Test("scan to coded value needs no network and no account")
  func extractionIsLocal() {
    // Parsing and coding run entirely against the generated analyte table,
    // which is compiled into the binary. No lookup service, no token.
    let rows = [
      "Analyt  Wert  Einheit  Referenzbereich",
      "LDL-Cholesterin  141  mg/dl  < 116",
      "Ferritin  210  ug/l  30 - 400",
    ].joined(separator: "\n")

    let result = LabLineParser.extract(rows, source: .ocrTranscribed)
    #expect(result.coded.count == 2)
    #expect(result.coded.contains { $0.coding.loinc == "2089-1" })
  }

  @Test("the FHIR bundle is produced locally, so export works offline")
  func exportIsLocal() {
    // Getting values to a doctor is the whole point of the app. It must not
    // require the operator's service to be up.
    let value = CodedLabValue(
      raw: RawLabValue(
        label: "LDL-Cholesterin", value: 141, unitRaw: "mg/dl", referenceHigh: 116,
        line: "LDL-Cholesterin  141  mg/dl  < 116", lineNumber: 3),
      coding: AnalyteCoding(
        labelKey: "ldlcholesterin", ucum: "mg/dL", loinc: "2089-1",
        display: "Cholesterol in LDL", analyteKey: "ldl"),
      source: .ocrTranscribed)

    let bundle = FhirWriter.buildBundle(
      values: [value],
      meta: FhirWriter.ReportMeta(patientId: "local", effectiveDateTime: "2026-09-14"),
      source: FhirWriter.TextSource(
        kind: .ocrTranscribed, sourceDocument: "scan.pdf", extractor: "vision"),
      now: "2026-09-14T00:00:00.000Z")

    #expect(bundle["resourceType"]?.stringValue == "Bundle")
    #expect(bundle.canonical().contains("2089-1"))
  }

  @Test("the prompt that states the intended purpose is compiled in, not fetched")
  func promptIsLocal() {
    // The on-device path sends this without contacting anything. If it were
    // fetched from the service, an outage would silently drop the wording that
    // keeps the product outside IVDR scope.
    #expect(PromptText.system.contains("do not diagnose"))
    #expect(!PromptText.system.isEmpty)
  }

  @Test("a local refusal needs no server round trip to be correct")
  func refusalsAreLocal() {
    // The app applies the same caps the service does, so a person is told
    // before a request is attempted rather than after it fails.
    let value = CloudAnalysis.SharedValue(
      label: "x", value: 1, unit: "mg/dL", loinc: "1", status: "final")
    #expect(CloudAnalysis.refusal(for: []) == .nothingSelected)
    #expect(CloudAnalysis.refusal(for: [value]) == nil)
  }
}

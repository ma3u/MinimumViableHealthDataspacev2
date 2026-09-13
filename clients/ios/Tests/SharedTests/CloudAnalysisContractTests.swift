import Foundation
import Testing

@testable import Shared

/// The app against the wire contract in `contract/analyse-request.json`.
///
/// The matching TypeScript test asserts the service accepts the same file. Two
/// tests that never meet can both pass while the app talks to a server that
/// rejects it, and the only place that failure appears is on a phone with no
/// debugger attached.
@Suite("Cloud analysis request contract")
struct CloudAnalysisContractTests {

  private static func fixture() throws -> (raw: String, json: [String: Any]) {
    let url = URL(fileURLWithPath: #filePath)
      .deletingLastPathComponent()  // SharedTests
      .deletingLastPathComponent()  // Tests
      .deletingLastPathComponent()  // ios
      .deletingLastPathComponent()  // clients
      .deletingLastPathComponent()  // repository root
      .appendingPathComponent("contract/analyse-request.json")
    let raw = try String(contentsOf: url, encoding: .utf8)
    let json = try JSONSerialization.jsonObject(with: Data(raw.utf8)) as! [String: Any]
    return (raw, json)
  }

  private static func requestFromFixture() throws -> CloudAnalysis.Request {
    let (_, json) = try fixture()
    let values = (json["values"] as! [[String: Any]]).map { entry in
      CloudAnalysis.SharedValue(
        label: entry["label"] as! String,
        value: (entry["value"] as! NSNumber).doubleValue,
        unit: entry["unit"] as! String,
        loinc: entry["loinc"] as! String,
        referenceLow: (entry["referenceLow"] as? NSNumber)?.doubleValue,
        referenceHigh: (entry["referenceHigh"] as? NSNumber)?.doubleValue,
        status: entry["status"] as! String)
    }
    let consent = json["consent"] as! [String: Any]
    var request = CloudAnalysis.Request(
      consent: CloudAnalysis.Consent(provider: consent["provider"] as! String),
      values: values,
      question: json["question"] as! String)
    // The timestamp is the one field that is not reproducible, so it is pinned
    // from the fixture rather than being excluded from the comparison.
    request = CloudAnalysis.Request(
      consent: CloudAnalysis.Consent(
        provider: consent["provider"] as! String,
        at: ISO8601DateFormatter().date(from: consent["at"] as! String)!),
      values: request.values,
      question: request.question)
    return request
  }

  @Test("the app encodes exactly the document the service expects")
  func encodesTheContract() throws {
    let (raw, _) = try Self.fixture()
    let encoded = try CloudAnalysis.encode(Self.requestFromFixture())

    let actual = try JSONSerialization.jsonObject(with: encoded) as! NSDictionary
    let expected = try JSONSerialization.jsonObject(with: Data(raw.utf8)) as! NSDictionary
    #expect(actual == expected)
  }

  @Test("a value with no printed range omits the field rather than sending null")
  func absentRangeIsOmitted() throws {
    // The service treats a missing bound as "none printed" and says so to the
    // model. A null would encode the same intent in a shape the contract does
    // not describe.
    let value = CloudAnalysis.SharedValue(
      label: "Ferritin", value: 210, unit: "ug/L", loinc: "2276-4", status: "final")
    let data = try CloudAnalysis.encode(
      CloudAnalysis.Request(
        consent: CloudAnalysis.Consent(provider: "anthropic"), values: [value], question: ""))
    let text = String(decoding: data, as: UTF8.self)

    #expect(!text.contains("referenceLow"))
    #expect(!text.contains("null"))
  }

  @Test("a coded value becomes a shared value without carrying anything extra")
  func builtFromCodedValue() {
    let coded = CodedLabValue(
      raw: RawLabValue(
        label: "LDL-Cholesterin", value: 141, unitRaw: "mg/dl", referenceHigh: 116,
        line: "LDL-Cholesterin  141  mg/dl  < 116", lineNumber: 3,
        region: SourceRegion(page: 1, x: 0.1, y: 0.2, width: 0.3, height: 0.04)),
      coding: AnalyteCoding(
        labelKey: "ldlcholesterin", ucum: "mg/dL", loinc: "2089-1",
        display: "Cholesterol in LDL", analyteKey: "ldl"),
      source: .ocrTranscribed)

    let shared = CloudAnalysis.SharedValue(from: coded)
    #expect(shared.loinc == "2089-1")
    #expect(shared.unit == "mg/dL", "the UCUM unit travels, not the printed one")
    #expect(shared.status == "preliminary", "a scan is never final")

    // The source line and the bounding box stay on the phone. They are an audit
    // trail for the person holding the paper, and of no use to a model.
    let text = String(decoding: try! CloudAnalysis.encode(
      CloudAnalysis.Request(
        consent: CloudAnalysis.Consent(provider: "anthropic"),
        values: [shared], question: "")), as: UTF8.self)
    #expect(!text.contains("region"))
    #expect(!text.contains("lineNumber"))
    #expect(!text.lowercased().contains("mg/dl  <"))
  }

  @Test("the app refuses locally what the service would refuse anyway")
  func localRefusals() {
    let value = CloudAnalysis.SharedValue(
      label: "x", value: 1, unit: "mg/dL", loinc: "1", status: "final")
    #expect(CloudAnalysis.refusal(for: []) == .nothingSelected)
    #expect(
      CloudAnalysis.refusal(for: Array(repeating: value, count: CloudAnalysis.maxValues + 1))
        == .tooMany(CloudAnalysis.maxValues + 1))
    #expect(CloudAnalysis.refusal(for: [value]) == nil)
  }
}

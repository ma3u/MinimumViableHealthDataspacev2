import Foundation
import Testing

@testable import Shared

/// The Swift FHIR writer against the TypeScript one it mirrors.
///
/// The analyte table is generated so there is never a second copy. A writer is
/// logic, not data, so it cannot be generated the same way, and the phone must
/// work offline with no CLI to call. That leaves two implementations of one wire
/// format, which is exactly the divergence this repository exists to prevent.
///
/// The format is pinned instead of the code. `npm run golden:fhir` in
/// `services/epa-ingest` writes both the input and the bundle its writer
/// produces; this reads that same input, builds a bundle with the Swift writer,
/// and compares the documents. Either side drifting fails here.
///
/// The input lives in the fixture rather than being restated in Swift, because a
/// restatement is a third copy that can drift on its own, and a parity test fed
/// two different inputs passes while proving nothing.
@Suite("FHIR writer parity with services/epa-ingest")
struct FhirBundleParityTests {

  private struct Fixture: Decodable {
    struct Meta: Decodable {
      let patientId: String
      let effectiveDateTime: String
      let performer: String?
      let title: String?
    }
    struct Source: Decodable {
      let kind: String
      let sourceDocument: String
      let ocrConfidence: Double?
      let extractor: String
    }
    struct Coding: Decodable {
      let loincNumber: String?
      let display: String
      let ucum: String
      let uncodedReason: String?
      let taxon: Taxon?
    }
    struct Region: Decodable {
      let page: Int
      let x: Double
      let y: Double
      let width: Double
      let height: Double
    }
    struct Value: Decodable {
      let label: String
      let value: Double
      let unitRaw: String
      let comparator: String?
      let referenceLow: Double?
      let referenceHigh: Double?
      let line: String
      let lineNumber: Int
      let coding: Coding
      let region: Region?
      let analyteKey: String
    }
    let now: String
    let meta: Meta
    let source: Source
    let values: [Value]
  }

  private static func loadFixture() throws -> (raw: String, fixture: Fixture) {
    // #filePath rather than Bundle.module: the fixture is shared with the
    // TypeScript generator that writes it, so it lives next to the test source
    // rather than being copied into a test bundle.
    let url = URL(fileURLWithPath: #filePath)
      .deletingLastPathComponent()
      .appendingPathComponent("Fixtures/fhir-golden-bundle.json")
    let raw = try String(contentsOf: url, encoding: .utf8)
    return (raw, try JSONDecoder().decode(Fixture.self, from: Data(raw.utf8)))
  }

  private static func build(from fixture: Fixture) -> JSON {
    let values = fixture.values.map { value in
      CodedLabValue(
        raw: RawLabValue(
          label: value.label,
          value: value.value,
          unitRaw: value.unitRaw,
          comparator: value.comparator.flatMap(Comparator.init(rawValue:)),
          referenceLow: value.referenceLow,
          referenceHigh: value.referenceHigh,
          line: value.line,
          lineNumber: value.lineNumber,
          region: value.region.map {
            SourceRegion(page: $0.page, x: $0.x, y: $0.y, width: $0.width, height: $0.height)
          }
        ),
        coding: AnalyteCoding(
          labelKey: Analytes.normaliseLabel(value.label),
          ucum: value.coding.ucum,
          loinc: value.coding.loincNumber,
          display: value.coding.display,
          analyteKey: value.analyteKey,
          uncodedReason: value.coding.uncodedReason,
          taxon: value.coding.taxon
        ),
        source: SourceKind(rawValue: fixture.source.kind)!
      )
    }

    return FhirWriter.buildBundle(
      values: values,
      meta: FhirWriter.ReportMeta(
        patientId: fixture.meta.patientId,
        effectiveDateTime: fixture.meta.effectiveDateTime,
        performer: fixture.meta.performer,
        title: fixture.meta.title
      ),
      source: FhirWriter.TextSource(
        kind: SourceKind(rawValue: fixture.source.kind)!,
        sourceDocument: fixture.source.sourceDocument,
        ocrConfidence: fixture.source.ocrConfidence,
        extractor: fixture.source.extractor
      ),
      now: fixture.now
    )
  }

  @Test("the Swift writer produces the same bundle as the TypeScript writer")
  func bundlesAgree() throws {
    let (raw, fixture) = try Self.loadFixture()
    let expected = try JSON.parse(raw)["bundle"]
    let actual = Self.build(from: fixture)

    #expect(expected != nil, "fixture has no bundle; run npm run golden:fhir")
    // Canonical form, so key order is not mistaken for a difference in the
    // document while a genuine difference still shows up as a diff.
    #expect(actual.canonical() == expected?.canonical())
  }

  @Test("the region extension carries page and box in the agreed shape")
  func regionExtensionShape() throws {
    let (_, fixture) = try Self.loadFixture()
    let bundle = Self.build(from: fixture)

    guard case let .array(entries) = bundle["entry"]! else {
      Issue.record("bundle has no entries")
      return
    }
    let observations = entries.compactMap { $0["resource"] }
      .filter { $0["resourceType"]?.stringValue == "Observation" }
    #expect(observations.count == fixture.values.count)

    var regions: [String] = []
    for observation in observations {
      guard case let .array(extensions) = observation["extension"]! else { continue }
      let match = extensions.first { $0["url"]?.stringValue == FhirWriter.extSourceRegion }
      if let text = match?["valueString"]?.stringValue { regions.append(text) }
    }
    // Three of the four fixture rows carry a region; the fourth deliberately
    // does not, because not every row on a sheet is located.
    #expect(regions.count == 3)
    #expect(regions.first == "1@0.0706,0.7525,0.8466,0.0292")
  }

  @Test("a value with no region emits no region extension rather than an empty one")
  func absentRegionIsAbsent() throws {
    let (_, fixture) = try Self.loadFixture()
    let bundle = Self.build(from: fixture)

    guard case let .array(entries) = bundle["entry"]! else { return }
    let observations = entries.compactMap { $0["resource"] }
      .filter { $0["resourceType"]?.stringValue == "Observation" }
    guard case let .array(last) = observations.last!["extension"]! else { return }

    #expect(!last.contains { $0["url"]?.stringValue == FhirWriter.extSourceRegion })
  }

  @Test("OCR provenance makes every observation preliminary, never final")
  func ocrIsPreliminary() throws {
    let (_, fixture) = try Self.loadFixture()
    let bundle = Self.build(from: fixture)

    guard case let .array(entries) = bundle["entry"]! else { return }
    for entry in entries {
      guard let resource = entry["resource"],
        resource["resourceType"]?.stringValue == "Observation"
      else { continue }
      #expect(resource["status"]?.stringValue == "preliminary")
    }
  }

  @Test("region formatting matches JavaScript's number rendering")
  func regionFormatting() {
    // JS `String(Number((0.5).toFixed(6)))` is "0.5", and for 1 it is "1", not
    // "1.0". A Swift default would print "1.0" and the two writers would differ
    // on a rectangle that is identical.
    #expect(
      FhirWriter.format(SourceRegion(page: 1, x: 0, y: 1, width: 0.5, height: 0.029_2))
        == "1@0,1,0.5,0.0292")
    #expect(
      FhirWriter.format(SourceRegion(page: 2, x: 0.070_600_4, y: 0, width: 1, height: 1))
        == "2@0.0706,0,1,1")
  }
}

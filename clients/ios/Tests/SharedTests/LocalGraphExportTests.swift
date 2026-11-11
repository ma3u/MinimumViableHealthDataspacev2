import Foundation
import Testing

@testable import Shared

@Suite("Export to my Mac: unmapped values travel too")
struct LocalGraphExportTests {
  let base: [String: Any] = [
    "resourceType": "Bundle", "type": "collection",
    "entry": [
      ["resource": ["resourceType": "Patient", "id": "meinbefund-local"]],
      [
        "resource": [
          "resourceType": "DiagnosticReport", "id": "report-1", "status": "preliminary",
          "effectiveDateTime": "2026-09-04", "result": [["reference": "Observation/obs-1"]],
        ]
      ],
      [
        "resource": [
          "resourceType": "Observation", "id": "obs-1", "status": "preliminary",
          "extension": [
            [
              "url": "https://ehds.mabu.red/fhir/StructureDefinition/epa-ingest-source-kind",
              "valueCode": "ocr-transcribed",
            ]
          ],
        ]
      ],
    ],
  ]

  func decode(_ data: Data) -> [[String: Any]] {
    let bundle = try! JSONSerialization.jsonObject(with: data) as! [String: Any]
    return (bundle["entry"] as! [[String: Any]]).map { $0["resource"] as! [String: Any] }
  }

  @Test func appendsEachUnmappedValueAsAnUncodedObservation() throws {
    let input = try JSONSerialization.data(withJSONObject: base)
    let unmapped = [
      UnmappedLabValue(
        raw: RawLabValue(
          label: "Zonulin", value: 48.2, unitRaw: "ng/ml", comparator: .greaterThan,
          referenceHigh: 55, referenceText: "< 55", line: "Zonulin  >48,2  ng/ml  < 55",
          lineNumber: 12),
        reason: .unknownAnalyte)
    ]
    let resources = decode(LocalGraphExport.bundle(fhirJSON: input, unmapped: unmapped))
    #expect(resources.count == 4)
    let added = resources[3]
    #expect(added["id"] as? String == "unmapped-1")
    #expect(added["status"] as? String == "preliminary")
    #expect(added["effectiveDateTime"] as? String == "2026-09-04")
    let code = added["code"] as! [String: Any]
    #expect(code["text"] as? String == "Zonulin")
    #expect(code["coding"] == nil)  // no code is invented
    let absent = (code["extension"] as! [[String: Any]])[0]
    let rendered = ((absent["_valueCode"] as! [String: Any])["extension"] as! [[String: Any]])[0]
    #expect((rendered["valueString"] as! String).contains("not in the analyte dictionary"))
    let quantity = added["valueQuantity"] as! [String: Any]
    #expect(quantity["value"] as? Double == 48.2)
    #expect(quantity["unit"] as? String == "ng/ml")
    #expect(quantity["comparator"] as? String == ">")
    #expect(quantity["system"] == nil)  // printed unit, not claimed as UCUM
    let kind = (added["extension"] as! [[String: Any]])[0]
    #expect(kind["valueCode"] as? String == "ocr-transcribed")
    let report = resources[1]
    #expect((report["result"] as! [[String: Any]]).count == 2)
  }

  @Test func leavesABundleWithoutUnmappedValuesAlone() throws {
    let input = try JSONSerialization.data(withJSONObject: base)
    #expect(LocalGraphExport.bundle(fhirJSON: input, unmapped: []) == input)
  }
}

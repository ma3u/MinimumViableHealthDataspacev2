import Foundation

/// What goes to the person's own Mac (Export to my Mac, Relate): the report's
/// FHIR bundle, plus every value read from the paper that has no code yet.
///
/// The EHDS hub takes coded values only, and `FhirWriter.buildBundle` writes
/// only those. The local graph is the person's own copy, so it gets the rest
/// too: an unmapped row is still a value the lab printed. Each becomes an
/// Observation with the printed label as `code.text`, no coding, and the
/// reason it could not be coded as a `data-absent-reason` with the reason as
/// its rendered text, the shape a microbiome row without a LOINC term already
/// has. Its source line and the report's source kind travel with it, and it is
/// listed among the DiagnosticReport's results. Nothing is guessed: no code
/// is invented and the unit is sent as printed, without a UCUM system.
public enum LocalGraphExport {
  static let ext = "https://ehds.mabu.red/fhir/StructureDefinition/epa-ingest-"

  public static func bundle(fhirJSON: Data, unmapped: [UnmappedLabValue]) -> Data {
    guard !unmapped.isEmpty,
      var bundle = (try? JSONSerialization.jsonObject(with: fhirJSON)) as? [String: Any],
      var entries = bundle["entry"] as? [[String: Any]]
    else { return fhirJSON }

    let resources = entries.compactMap { $0["resource"] as? [String: Any] }
    guard let reportIndex = entries.firstIndex(where: {
      ($0["resource"] as? [String: Any])?["resourceType"] as? String == "DiagnosticReport"
    }),
      var report = entries[reportIndex]["resource"] as? [String: Any]
    else { return fhirJSON }

    let patientId =
      resources.first { $0["resourceType"] as? String == "Patient" }?["id"] as? String
      ?? "meinbefund-local"
    let firstObservation = resources.first { $0["resourceType"] as? String == "Observation" }
    let sourceKind =
      (firstObservation?["extension"] as? [[String: Any]])?
      .first { ($0["url"] as? String) == ext + "source-kind" }?["valueCode"] as? String
    let status = report["status"] as? String ?? "preliminary"
    var results = report["result"] as? [[String: Any]] ?? []

    for (index, value) in unmapped.enumerated() {
      let raw = value.raw
      let id = "unmapped-\(index + 1)"
      var extensions: [[String: Any]] = [
        ["url": ext + "source-line", "valueString": raw.line]
      ]
      if let sourceKind {
        extensions.insert(["url": ext + "source-kind", "valueCode": sourceKind], at: 0)
      }
      var quantity: [String: Any] = ["value": raw.value, "unit": raw.unitRaw]
      if let comparator = raw.comparator { quantity["comparator"] = comparator.rawValue }
      var observation: [String: Any] = [
        "resourceType": "Observation",
        "id": id,
        "status": status,
        "extension": extensions,
        "category": [
          [
            "coding": [
              [
                "system": "http://terminology.hl7.org/CodeSystem/observation-category",
                "code": "laboratory",
              ]
            ]
          ]
        ],
        "code": [
          "text": raw.label,
          "extension": [
            [
              "url": "http://hl7.org/fhir/StructureDefinition/data-absent-reason",
              "valueCode": "unknown",
              "_valueCode": [
                "extension": [
                  [
                    "url": "http://hl7.org/fhir/StructureDefinition/rendered-value",
                    "valueString": "Not coded: \(value.reason.explanation)",
                  ]
                ]
              ],
            ]
          ],
        ],
        "subject": ["reference": "Patient/\(patientId)"],
        "valueQuantity": quantity,
      ]
      if let effective = report["effectiveDateTime"] { observation["effectiveDateTime"] = effective }
      var range: [String: Any] = [:]
      if let low = raw.referenceLow { range["low"] = ["value": low, "unit": raw.unitRaw] }
      if let high = raw.referenceHigh { range["high"] = ["value": high, "unit": raw.unitRaw] }
      if let text = raw.referenceText { range["text"] = text }
      if !range.isEmpty { observation["referenceRange"] = [range] }

      entries.append(["fullUrl": "urn:uuid:Observation-\(id)", "resource": observation])
      results.append(["reference": "Observation/\(id)"])
    }
    report["result"] = results
    entries[reportIndex]["resource"] = report
    bundle["entry"] = entries
    return (try? JSONSerialization.data(withJSONObject: bundle, options: [.sortedKeys])) ?? fhirJSON
  }

  /// What the export compares to decide whether a report changed: the coded
  /// values as the EHDS sync sees them, plus the unmapped rows.
  public static func fingerprint(coded: String, unmapped: [UnmappedLabValue]) -> String {
    coded + "|" + unmapped.map { "\($0.raw.label)=\($0.raw.value)\($0.raw.unitRaw)" }
      .joined(separator: ";")
  }
}

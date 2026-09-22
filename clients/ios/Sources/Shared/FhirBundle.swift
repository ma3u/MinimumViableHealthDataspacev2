import Foundation

/// FHIR R4 writer, the Swift side of `services/epa-ingest/src/to-fhir.ts`.
///
/// Emits a `collection` bundle: a DiagnosticReport, one Observation per coded
/// value, a DocumentReference standing for the paper, and a Provenance tying
/// them together.
///
/// It is **not** a KBV MIO Laborbefund document. That needs a `document` bundle
/// with a Composition and the KBV profiles, and claiming a conformance nobody
/// has validated would be worse than not claiming it. The resource shapes are
/// chosen so that step stays additive.
///
/// ## Why this is a second implementation, and how it is kept honest
///
/// The analyte table is generated from TypeScript precisely so there is never a
/// second copy of it. A writer is logic rather than data, so it cannot be
/// generated the same way, and the phone has to work offline with no CLI to
/// call. That leaves two implementations of one wire format, which is the exact
/// divergence this repository exists to prevent.
///
/// So it is pinned by a golden file instead: `npm run golden:fhir` in
/// `services/epa-ingest` writes the bundle the TypeScript writer produces for a
/// fixed input, and `FhirBundleParityTests` asserts this writer produces the
/// same bytes for the same input. Either side drifting fails that test.
public enum FhirWriter {

  static let extensionBase = "https://ehds.mabu.red/fhir/StructureDefinition"
  public static let extSourceKind = "\(extensionBase)/epa-ingest-source-kind"
  public static let extOcrConfidence = "\(extensionBase)/epa-ingest-ocr-confidence"
  public static let extSourceLine = "\(extensionBase)/epa-ingest-source-line"
  public static let extSourceRegion = "\(extensionBase)/epa-ingest-source-region"

  static let ucumSystem = "http://unitsofmeasure.org"
  static let loincSystem = "http://loinc.org"
  /// NCBI Taxonomy as a FHIR code system: the numeric taxon id is the code
  /// and the scientific name the display, as HL7's Clinical Genomics work
  /// uses the same database.
  public static let ncbiTaxonomySystem = "http://www.ncbi.nlm.nih.gov/taxonomy"

  /// Everything the writer needs that is not in the values themselves.
  public struct ReportMeta: Sendable, Equatable {
    /// Logical patient id used in the bundle. Never a real insurance number.
    public let patientId: String
    /// Collection date of the specimen, ISO 8601 date or date-time.
    public let effectiveDateTime: String
    /// Free-text name of the issuing lab, study centre or hospital.
    public let performer: String?
    /// Title for the DiagnosticReport.
    public let title: String?

    public init(
      patientId: String, effectiveDateTime: String, performer: String? = nil,
      title: String? = nil
    ) {
      self.patientId = patientId
      self.effectiveDateTime = effectiveDateTime
      self.performer = performer
      self.title = title
    }
  }

  /// Provenance of the extracted text as a whole.
  public struct TextSource: Sendable, Equatable {
    public let kind: SourceKind
    /// Original document name as the citizen holds it.
    public let sourceDocument: String
    /// 0...1 mean OCR confidence; nil when no OCR ran.
    public let ocrConfidence: Double?
    /// Which extractor produced the text, for the audit trail.
    public let extractor: String

    public init(
      kind: SourceKind, sourceDocument: String, ocrConfidence: Double? = nil,
      extractor: String
    ) {
      self.kind = kind
      self.sourceDocument = sourceDocument
      self.ocrConfidence = ocrConfidence
      self.extractor = extractor
    }
  }

  /// `page@x,y,w,h`, coordinates to six decimals with trailing zeroes trimmed.
  ///
  /// A compact string rather than five nested `valueDecimal` extensions,
  /// because the consumer who matters is a person reading a rendered bundle.
  public static func format(_ region: SourceRegion) -> String {
    func n(_ value: Double) -> String {
      let rounded = (value * 1_000_000).rounded() / 1_000_000
      // Integral values print without a decimal point, matching JavaScript's
      // `String(Number(v.toFixed(6)))`. Anything else keeps its digits.
      if rounded == rounded.rounded() && abs(rounded) < 1e15 {
        return String(Int(rounded))
      }
      var text = String(format: "%.6f", rounded)
      while text.hasSuffix("0") { text.removeLast() }
      if text.hasSuffix(".") { text.removeLast() }
      return text
    }
    return "\(region.page)@\(n(region.x)),\(n(region.y)),\(n(region.width)),\(n(region.height))"
  }

  /// Observation status by provenance.
  ///
  /// Only a value read from the lab's own characters is `final`. A value
  /// recognised from pixels is `preliminary`: the lab finalised the result, the
  /// transcription is ours, and a receiving system must see that without
  /// reading an extension.
  public static func status(for kind: SourceKind) -> String { kind.observationStatus }

  // MARK: - Building

  /// Builds the bundle. `now` is injectable so the same input yields the same
  /// bundle in tests, which is what makes the golden-file parity check possible.
  public static func buildBundle(
    values: [CodedLabValue], meta: ReportMeta, source: TextSource, now: String
  ) -> JSON {
    let status = status(for: source.kind)
    let subject: JSON = ["reference": .string("Patient/\(meta.patientId)")]

    // No name, no insurance number, no birth date: this bundle is an extraction
    // artefact, and the ePA already knows who its owner is.
    let patient: JSON = [
      "resourceType": "Patient",
      "id": .string(meta.patientId),
    ]

    let docRef: JSON = [
      "resourceType": "DocumentReference",
      "id": "source-document",
      "status": "current",
      "subject": subject,
      "date": .string(now),
      "description": .string(source.sourceDocument),
      "content": .array([
        [
          "attachment": [
            "title": .string(source.sourceDocument),
            "creation": .string(meta.effectiveDateTime),
          ]
        ]
      ]),
    ]

    var observations: [JSON] = []
    for (index, value) in values.enumerated() {
      var observation: JSON = [
        "resourceType": "Observation",
        "id": .string("obs-\(index + 1)"),
        "status": .string(status),
        "extension": .array(provenanceExtensions(source: source, value: value)),
        "category": .array([
          [
            "coding": .array([
              [
                "system": "http://terminology.hl7.org/CodeSystem/observation-category",
                "code": "laboratory",
                "display": "Laboratory",
              ]
            ])
          ]
        ]),
        // A quantity LOINC does not code gets a CodeableConcept with `text`
        // and no `coding`, which is valid FHIR and says plainly that no code
        // applies. A near-enough code would be worse than saying nothing.
        "code": codeableConcept(for: value),
        "subject": subject,
        "effectiveDateTime": .string(meta.effectiveDateTime),
        "valueQuantity": quantity(
          value.raw.value, ucum: value.coding.ucum, comparator: value.raw.comparator?.rawValue),
      ]

      if value.raw.referenceLow != nil || value.raw.referenceHigh != nil {
        var range: JSON = [:]
        if let low = value.raw.referenceLow {
          range["low"] = quantity(low, ucum: value.coding.ucum, comparator: nil)
        }
        if let high = value.raw.referenceHigh {
          range["high"] = quantity(high, ucum: value.coding.ucum, comparator: nil)
        }
        observation["referenceRange"] = .array([range])
      }

      // The organism, where the quantity is the relative abundance of one.
      // The test has no LOINC code and the code above says so; the organism
      // is a different thing with a registry of its own, so it is a
      // component: LOINC's "organism identified" as the code, the NCBI
      // Taxonomy entry as the value, the printed name as its text.
      if let taxon = value.coding.taxon {
        observation["component"] = .array([
          [
            "code": [
              "coding": .array([
                [
                  "system": .string(loincSystem),
                  "code": "41852-5",
                  "display": "Microorganism or agent identified in Specimen",
                ]
              ])
            ],
            "valueCodeableConcept": [
              "coding": .array([
                [
                  "system": .string(ncbiTaxonomySystem),
                  "code": .string(taxon.ncbiTaxId),
                  "display": .string(taxon.scientificName),
                ]
              ]),
              "text": .string(value.raw.label),
            ],
          ]
        ])
      }

      observations.append(observation)
    }

    var report: JSON = [
      "resourceType": "DiagnosticReport",
      "id": "report-1",
      "status": .string(status),
      "category": .array([
        [
          "coding": .array([
            [
              "system": "http://terminology.hl7.org/CodeSystem/v2-0074",
              "code": "LAB",
              "display": "Laboratory",
            ]
          ])
        ]
      ]),
      "code": {
        var code: JSON = [
          "coding": .array([
            [
              "system": .string(loincSystem),
              "code": "11502-2",
              "display": "Laboratory report",
            ]
          ])
        ]
        if let title = meta.title { code["text"] = .string(title) }
        return code
      }(),
      "subject": subject,
      "effectiveDateTime": .string(meta.effectiveDateTime),
      "issued": .string(now),
    ]
    if let performer = meta.performer {
      report["performer"] = .array([["display": .string(performer)]])
    }
    report["result"] = .array(
      observations.map { ["reference": .string("Observation/\($0["id"]?.stringValue ?? "")")] })
    report["presentedForm"] = .array([["title": .string(source.sourceDocument)]])

    let provenance: JSON = [
      "resourceType": "Provenance",
      "id": "provenance-1",
      "target": .array(
        [["reference": "DiagnosticReport/report-1"]]
          + observations.map {
            ["reference": .string("Observation/\($0["id"]?.stringValue ?? "")")]
          }),
      "recorded": .string(now),
      "activity": [
        "coding": .array([
          [
            "system": "http://terminology.hl7.org/CodeSystem/v3-DataOperation",
            "code": "DERIVE",
            "display": "derive",
          ]
        ]),
        "text": .string(
          source.kind == .labIssuedDigital
            ? "Values read from the document's own text layer"
            : "Values transcribed from a scanned document by OCR"),
      ],
      "agent": .array([
        [
          "type": [
            "coding": .array([
              [
                "system":
                  "http://terminology.hl7.org/CodeSystem/provenance-participant-type",
                "code": "assembler",
              ]
            ])
          ],
          "who": ["display": .string("epa-ingest (\(source.extractor))")],
        ]
      ]),
      "entity": .array([
        ["role": "source", "what": ["reference": "DocumentReference/source-document"]]
      ]),
    ]

    let resources = [patient, docRef, report] + observations + [provenance]
    return [
      "resourceType": "Bundle",
      "type": "collection",
      "timestamp": .string(now),
      "entry": .array(
        resources.map { resource in
          [
            "fullUrl": .string(
              "urn:uuid:\(resource["resourceType"]?.stringValue ?? "")-\(resource["id"]?.stringValue ?? "")"
            ),
            "resource": resource,
          ]
        }),
    ]
  }

  /// `Observation.code`, with a LOINC coding when one exists.
  ///
  /// FHIR allows a CodeableConcept carrying only `text`, and that is what an
  /// uncoded quantity gets. The dictionary records why LOINC has no code for
  /// it, and that reason travels as a `data-absent-reason` extension so a
  /// consumer is told rather than left to guess.
  private static func codeableConcept(for value: CodedLabValue) -> JSON {
    var concept: JSON = [:]
    if let loinc = value.coding.loinc {
      concept["coding"] = .array([
        [
          "system": .string(loincSystem),
          "code": .string(loinc),
          "display": .string(value.coding.display),
        ]
      ])
    } else if let reason = value.coding.uncodedReason {
      concept["extension"] = .array([
        [
          "url": .string("http://hl7.org/fhir/StructureDefinition/data-absent-reason"),
          "valueCode": .string("not-applicable"),
          "_valueCode": ["extension": .array([
            ["url": .string("http://hl7.org/fhir/StructureDefinition/rendered-value"),
             "valueString": .string(reason)],
          ])],
        ]
      ])
    }
    // The label exactly as the lab printed it, so a reviewer can match the
    // resource back to the sheet without trusting our dictionary.
    concept["text"] = .string(value.raw.label)
    return concept
  }

  private static func quantity(_ value: Double, ucum: String, comparator: String?) -> JSON {
    var quantity: JSON = ["value": .number(value)]
    if let comparator { quantity["comparator"] = .string(comparator) }
    quantity["unit"] = .string(ucum)
    quantity["system"] = .string(ucumSystem)
    quantity["code"] = .string(ucum)
    return quantity
  }

  private static func provenanceExtensions(source: TextSource, value: CodedLabValue) -> [JSON] {
    var extensions: [JSON] = [
      ["url": .string(extSourceKind), "valueCode": .string(source.kind.rawValue)],
      ["url": .string(extSourceLine), "valueString": .string(value.raw.line)],
    ]
    if let confidence = source.ocrConfidence {
      extensions.append(
        ["url": .string(extOcrConfidence), "valueDecimal": .number(confidence)])
    }
    if let region = value.raw.region {
      extensions.append(
        ["url": .string(extSourceRegion), "valueString": .string(format(region))])
    }
    return extensions
  }
}

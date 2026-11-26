import CryptoKit
import Foundation

/// FHIR R4 writer, the Swift side of `services/epa-ingest/src/to-fhir.ts`.
///
/// Emits a `collection` bundle: a DiagnosticReport, one Observation per coded
/// value, a DocumentReference standing for the paper, a Provenance tying them
/// together, and the Organization that printed the report when it names one.
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
  public static let extVerified = "\(extensionBase)/epa-ingest-verified-by-patient"
  public static let extOriginalReading = "\(extensionBase)/epa-ingest-original-reading"
  public static let extSourceRegion = "\(extensionBase)/epa-ingest-source-region"

  static let ucumSystem = "http://unitsofmeasure.org"
  static let loincSystem = "http://loinc.org"

  /// A LOINC coding with the release its code was checked against
  /// (`Analytes.loincVersion`). The German lab profiles require the version
  /// (#1172), and a code without one leaves the reader to guess the release.
  static func loinc(_ code: String, _ display: String) -> JSON {
    [
      "system": .string(loincSystem), "version": .string(Analytes.loincVersion),
      "code": .string(code), "display": .string(display),
    ]
  }

  /// NCBI Taxonomy as a FHIR code system: the numeric taxon id is the code
  /// and the scientific name the display, as HL7's Clinical Genomics work
  /// uses the same database.
  public static let ncbiTaxonomySystem = "http://www.ncbi.nlm.nih.gov/taxonomy"

  /// LOINC's class for laboratory results. The MII Kerndatensatz Laborbefund
  /// wants it next to FHIR's `laboratory` on every lab Observation, and next
  /// to v2-0074 `LAB` on a laboratory report. Same as `LAB_STUDIES` in
  /// services/epa-ingest.
  static func labStudies() -> JSON { loinc("26436-6", "Laboratory studies (set)") }

  /// The two categories the HL7 Europe imaging report wants on a radiology
  /// report, each a CodeableConcept of its own: LOINC's "Diagnostic imaging
  /// report" and the EEHRxF priority category Medical-Imaging. They stand next
  /// to v2-0074 `RAD`. Same as `IMAGING_REPORT_CATEGORIES` in
  /// services/epa-ingest.
  static func imagingReportCategories() -> [JSON] {
    [
      ["coding": .array([loinc("85430-7", "Diagnostic imaging report")])],
      [
        "coding": .array([
          [
            "system":
              "http://hl7.eu/fhir/health-data-api/CodeSystem/eehrxf-document-priority-category-cs",
            "code": "Medical-Imaging",
            "display": "medical imaging studies and related imaging reports",
          ]
        ])
      ],
    ]
  }

  /// Where the identifiers this writer assigns live, as `IDENTIFIER_BASE` in
  /// services/epa-ingest. They name this transcription of a result or
  /// report, not the lab's own numbers, which are not on what we read.
  public static let identifierBase = "https://ehds.mabu.red/fhir/sid"
  static let v2_0203 = "http://terminology.hl7.org/CodeSystem/v2-0203"

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
  static let categoryDisplay = [
    "laboratory": "Laboratory", "vital-signs": "Vital Signs", "procedure": "Procedure",
    "imaging": "Imaging",
  ]

  /// FHIR's observation category for a code: `laboratory` unless the
  /// dictionary says it is a vital sign or an ECG measurement
  /// (`Analytes.observationCategories`, generated from the TypeScript table
  /// the server's writer reads).
  public static func observationCategory(_ loinc: String?, analyteKey: String? = nil) -> String {
    loinc.flatMap { Analytes.observationCategories[$0] }
      ?? analyteKey.flatMap { Analytes.observationCategories[$0] } ?? "laboratory"
  }

  static func category(_ value: CodedLabValue) -> String {
    observationCategory(value.coding.loinc, analyteKey: value.coding.analyteKey)
  }

  /// A measurement that makes a report an ECG (`Analytes.electrocardiogramCodes`).
  static func isEcgValue(_ value: CodedLabValue) -> Bool {
    value.coding.loinc.map(Analytes.electrocardiogramCodes.contains) == true
      || Analytes.electrocardiogramCodes.contains(value.coding.analyteKey)
  }

  /// True when the report holds ECG measurements and no laboratory value: it
  /// is then an ECG (v2-0074 `EC`), not a laboratory report. Vital signs may
  /// sit beside them; an exercise test's procedure values may not, or a
  /// cycle ergometry that counted its ectopic beats would be an "EKG study".
  public static func isElectrocardiogram(_ values: [CodedLabValue]) -> Bool {
    values.contains(where: isEcgValue)
      && values.allSatisfy { category($0) != "laboratory" }
      && values.allSatisfy { category($0) != "procedure" || isEcgValue($0) }
  }

  /// An ECG report that counts every beat of a recording: a Holter study
  /// (LOINC 18754-2).
  public static func isHolter(_ values: [CodedLabValue]) -> Bool {
    isElectrocardiogram(values) && values.contains { $0.coding.loinc == "76637-8" }
  }

  /// The kind of report the values make (`Analytes.reportKinds`), or nil
  /// for a laboratory report. An ECG or Holter report is decided before
  /// this. Mirrors `reportKind` in the TypeScript writer.
  public static func reportKind(_ values: [CodedLabValue]) -> ReportKind? {
    func keys(_ value: CodedLabValue) -> [String] {
      [value.coding.loinc ?? "", value.coding.analyteKey].filter { !$0.isEmpty }
    }
    return Analytes.reportKinds.first { kind in
      values.contains { keys($0).contains(where: kind.triggers.contains) }
        && values.allSatisfy {
          category($0) == "vital-signs" || keys($0).contains(where: kind.members.contains)
        }
    }
  }

  public static func buildBundle(
    values: [CodedLabValue], meta: ReportMeta, source: TextSource, now: String
  ) -> JSON {
    let status = status(for: source.kind)
    let subject: JSON = ["reference": .string("Patient/\(meta.patientId)")]

    // Who assigned the identifiers below: this writer, named as the
    // Provenance names it. The MII lab profiles require an assigner on each.
    let assigner: JSON = ["display": .string("epa-ingest (\(source.extractor))")]
    func identifier(_ type: String, _ display: String, _ part: String) -> JSON {
      let kind = part.split(separator: "/").first.map(String.init) ?? part
      return .array([
        [
          "type": [
            "coding": .array([
              ["system": .string(v2_0203), "code": .string(type), "display": .string(display)]
            ])
          ],
          "system": .string("\(identifierBase)/epa-ingest-\(kind)"),
          "value": .string(uuidV5("\(now)|\(source.sourceDocument)|\(part)")),
          "assigner": assigner,
        ]
      ])
    }

    // The laboratory or practice that printed the report, as printed. The
    // German lab profiles want the performer as a reference (#1172), so the
    // printed name becomes an Organization in the bundle, and the reference
    // keeps the name as its display for a reader that does not resolve it.
    // A report with no performer line has no Organization: none is invented.
    let organization: JSON? = meta.performer.map {
      ["resourceType": "Organization", "id": "performer-1", "name": .string($0)]
    }
    let performer: JSON? = meta.performer.map {
      .array([["reference": "Organization/performer-1", "display": .string($0)]])
    }

    // Withheld, and saying so (data-absent-reason `masked`): FHIR's way to
    // state that a value exists and is kept back for privacy. The EU core
    // Patient requires a name and a birth date; none is invented.
    let masked: JSON = [
      "extension": .array([["url": .string(dataAbsentReason), "valueCode": "masked"]])
    ]
    // No name, no insurance number, no birth date: this bundle is an extraction
    // artefact, and the ePA already knows who its owner is.
    let patient: JSON = [
      "resourceType": "Patient",
      "id": .string(meta.patientId),
      "name": .array([masked]),
      "_birthDate": masked,
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
        // One per transcribed value (v2-0203 OBI), required by the MII lab profile.
        "identifier": identifier("OBI", "Observation Instance Identifier", "observation/\(index + 1)"),
        "status": .string(status),
        "extension": .array(provenanceExtensions(source: source, value: value)),
        "category": .array([
          [
            "coding": .array(
              [
                [
                  "system": "http://terminology.hl7.org/CodeSystem/observation-category",
                  "code": .string(category(value)),
                  "display": .string(categoryDisplay[category(value)] ?? ""),
                ]
              ] + (category(value) == "laboratory" ? [labStudies()] : []))
          ]
        ]),
        // A quantity LOINC does not code gets a CodeableConcept with `text`
        // and no `coding`, which is valid FHIR and says plainly that no code
        // applies. A near-enough code would be worse than saying nothing.
        "code": codeableConcept(for: value),
        "subject": subject,
        "effectiveDateTime": .string(meta.effectiveDateTime),
        // When this transcription was documented, the same moment as the
        // report's `issued`. The German lab profiles require it (#1172); the
        // lab's own release time is not on what we read.
        "issued": .string(now),
        "valueQuantity": quantity(
          value.raw.value, ucum: value.coding.ucum, comparator: value.raw.comparator?.rawValue),
      ]
      // Who reported the value. The HL7 Europe Laboratory Report profile
      // requires a performer on every result (#1144).
      if let performer { observation["performer"] = performer }

      // FHIR's rng-2: a range needs a low, a high or a text. The text is the
      // range as printed, so a range with no number in it still travels, and
      // one with numbers keeps the qualifier the numbers cannot carry.
      if value.raw.referenceLow != nil || value.raw.referenceHigh != nil
        || value.raw.referenceText != nil
      {
        var range: JSON = [:]
        if let low = value.raw.referenceLow {
          range["low"] = quantity(low, ucum: value.coding.ucum, comparator: nil)
        }
        if let high = value.raw.referenceHigh {
          range["high"] = quantity(high, ucum: value.coding.ucum, comparator: nil)
        }
        if let text = value.raw.referenceText {
          range["text"] = .string(text)
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
                loinc("41852-5", "Microorganism or agent identified in Specimen")
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

    // A report whose every value is an ECG measurement is an ECG.
    let ecg = isElectrocardiogram(values)
    let kind = ecg ? nil : reportKind(values)
    // A laboratory report proper: no ECG and none of the other report kinds.
    let labReport = !ecg && kind == nil
    let imagingReport = !ecg && kind?.section == "RAD"
    var report: JSON = [
      "resourceType": "DiagnosticReport",
      "id": "report-1",
      // The report as this writer issued it (v2-0203 FILL, the filler's
      // number): the lab's own report number is not on what we read.
      "identifier": identifier("FILL", "Filler Identifier", "report/1"),
      // The order the report answers. A printed report does not carry it, so
      // the reference says it is unknown rather than inventing one; the MII
      // lab profile requires the element.
      "basedOn": .array([
        [
          "extension": .array([
            [
              "url": "http://hl7.org/fhir/StructureDefinition/data-absent-reason",
              "valueCode": "unknown",
            ]
          ])
        ]
      ]),
      "status": .string(status),
      "category": .array([
        [
          "coding": .array([
            ecg
              ? [
                "system": "http://terminology.hl7.org/CodeSystem/v2-0074",
                "code": "EC",
                // Exactly as the code system has it, two spaces included: the
                // validator rejects any other whitespace (#1144).
                "display": "Electrocardiac (e.g., EKG,  EEC, Holter)",
              ]
              : [
                "system": "http://terminology.hl7.org/CodeSystem/v2-0074",
                "code": .string(kind?.section ?? "LAB"),
                "display": .string(kind?.sectionDisplay ?? "Laboratory"),
              ]
          ] + (labReport ? [labStudies()] : []))
        ]
      ] + (imagingReport ? imagingReportCategories() : [])),
      "code": {
        var code: JSON = [
          "coding": .array([
            ecg
              ? (isHolter(values)
                ? loinc("18754-2", "Ambulatory cardiac rhythm monitor (Holter) study")
                : loinc("11524-6", "EKG study"))
              : loinc(kind?.loinc ?? "11502-2", kind?.display ?? "Laboratory report")
          ])
        ]
        if let title = meta.title { code["text"] = .string(title) }
        return code
      }(),
      "subject": subject,
      "effectiveDateTime": .string(meta.effectiveDateTime),
      "issued": .string(now),
    ]
    // A radiology report leaves the unknown order out: the EU imaging report
    // accepts an order only as a reference or an accession number, and the
    // element is optional there. Same as services/epa-ingest.
    if imagingReport { report["basedOn"] = nil }
    if let performer { report["performer"] = performer }
    // A laboratory report's results are its laboratory values: a weight or a
    // blood pressure printed on the same sheet stays in the bundle, linked by
    // the Provenance, but is not a lab result (the HL7 Europe lab report).
    let results: [JSON] = zip(values, observations)
      .filter { value, _ in !labReport || category(value) == "laboratory" }
      .map { _, o in ["reference": .string("Observation/\(o["id"]?.stringValue ?? "")")] }
    report["result"] = .array(results)
    report["presentedForm"] = .array([["title": .string(source.sourceDocument)]])

    // A laboratory report travels as the EU laboratory report: a document
    // whose Composition comes first, carries the report's identifier and
    // type, and lists the results; the DiagnosticReport points back to it
    // (the R5 extension the HL7 Europe guide uses on R4). Other kinds stay
    // collections. Same as services/epa-ingest.
    var composition: JSON? = nil
    if labReport {
      let reportIdentifier = report["identifier"]
      var first: JSON = [:]
      if case let .array(ids)? = reportIdentifier, let id = ids.first {
        first = ["system": id["system"] ?? .null, "value": id["value"] ?? .null]
      }
      var typeCoding: JSON = .null
      if case let .array(codings)? = report["code"]?["coding"], let c = codings.first {
        typeCoding = c
      }
      composition = [
        "resourceType": "Composition",
        "id": "composition-1",
        "identifier": first,
        "status": .string(status),
        "type": ["coding": .array([typeCoding])],
        "subject": subject,
        "date": .string(now),
        "author": performer ?? .array([["display": assigner["display"] ?? .null]]),
        "title": .string(meta.title ?? "Laboratory report"),
        "section": .array([
          [
            "title": "Laboratory results",
            "code": ["coding": .array([labStudies()])],
            // The section in words, as a reader without FHIR sees it.
            "text": [
              "status": "generated",
              "div": .string(
                narrative(values.filter { category($0) == "laboratory" }.map { $0.raw.label })),
            ],
            "entry": .array(results),
          ]
        ]),
      ]
      report["extension"] = .array([
        [
          "url": "http://hl7.org/fhir/5.0/StructureDefinition/extension-DiagnosticReport.composition",
          "valueReference": ["reference": "Composition/composition-1"],
        ]
      ])
    }

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
            // v3-DataOperation has no DERIVE; reading values off a document
            // creates them (#1144).
            "system": "http://terminology.hl7.org/CodeSystem/v3-DataOperation",
            "code": "CREATE",
            "display": "create",
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

    // The Organization last, so every other entry keeps the position, and so
    // the fullUrl, it had before there was one.
    let resources =
      (composition.map { [$0] } ?? []) + [patient, docRef, report] + observations + [provenance]
      + (organization.map { [$0] } ?? [])
    var entries: [(fullUrl: String, resource: JSON)] = resources.enumerated().map { index, resource in
      ("urn:uuid:" + uuidV5("\(now)|\(source.sourceDocument)|entry/\(index)"), resource)
    }
    // In a document every reference resolves to an entry's fullUrl: a relative
    // `Type/id` cannot be matched against a urn:uuid (FHIR R4, Bundle,
    // resolving references). A collection keeps the relative references.
    if composition != nil {
      var urls: [String: String] = [:]
      for e in entries {
        if let type = e.resource["resourceType"]?.stringValue, let id = e.resource["id"]?.stringValue {
          urls["\(type)/\(id)"] = e.fullUrl
        }
      }
      entries = entries.map { ($0.fullUrl, withFullUrls($0.resource, urls)) }
    }
    return [
      "resourceType": "Bundle",
      // The bundle's own identity, named like its entries.
      "identifier": [
        "system": "urn:ietf:rfc:3986",
        "value": .string("urn:uuid:" + uuidV5("\(now)|\(source.sourceDocument)|bundle")),
      ],
      "type": composition != nil ? "document" : "collection",
      "timestamp": .string(now),
      // A urn:uuid must be a UUID (#1144). Named by the report it comes from
      // (timestamp, source document) and the entry's position, so the same
      // report gives the same bundle, and the same UUID as
      // services/epa-ingest. No patient or resource id goes into SHA-1.
      "entry": .array(entries.map { ["fullUrl": .string($0.fullUrl), "resource": $0.resource] }),
    ]
  }

  static let dataAbsentReason = "http://hl7.org/fhir/StructureDefinition/data-absent-reason"

  /// Every `reference` that names an entry by `Type/id`, as that entry's fullUrl.
  static func withFullUrls(_ value: JSON, _ urls: [String: String]) -> JSON {
    switch value {
    case let .array(items): return .array(items.map { withFullUrls($0, urls) })
    case let .object(pairs):
      return .object(
        pairs.map { pair in
          if pair.key == "reference", let ref = pair.value.stringValue, let url = urls[ref] {
            return (key: pair.key, value: .string(url))
          }
          return (key: pair.key, value: withFullUrls(pair.value, urls))
        })
    default: return value
    }
  }

  /// A section's narrative: the printed labels of its results, as a list.
  /// Same as `narrative` in services/epa-ingest.
  static func narrative(_ labels: [String]) -> String {
    let escape = { (text: String) in
      text.replacingOccurrences(of: "&", with: "&amp;")
        .replacingOccurrences(of: "<", with: "&lt;")
        .replacingOccurrences(of: ">", with: "&gt;")
    }
    return "<div xmlns=\"http://www.w3.org/1999/xhtml\"><ul>"
      + labels.map { "<li>\(escape($0))</li>" }.joined() + "</ul></div>"
  }

  /// Namespace of the bundle entries' `fullUrl`s, the same constant as
  /// `FULL_URL_NAMESPACE` in services/epa-ingest: uuid5(NAMESPACE_URL,
  /// "https://ehds.mabu.red/fhir/epa-ingest/bundle-entry").
  static let fullUrlNamespace = "5179b1c4-0bef-5af9-9fcb-83b0e631f212"

  /// A name-based UUID, version 5 (RFC 9562, section 5.5): SHA-1 over the
  /// namespace and the name, with the version and variant bits set.
  static func uuidV5(_ name: String, namespace: String = fullUrlNamespace) -> String {
    let hex = Array(namespace.replacingOccurrences(of: "-", with: "").utf8)
    var ns = [UInt8]()
    var i = 0
    while i + 1 < hex.count {
      ns.append(UInt8(String(decoding: hex[i...i + 1], as: UTF8.self), radix: 16) ?? 0)
      i += 2
    }
    var digest = Array(Insecure.SHA1.hash(data: ns + Array(name.utf8)).prefix(16))
    digest[6] = (digest[6] & 0x0f) | 0x50
    digest[8] = (digest[8] & 0x3f) | 0x80
    let h = digest.map { String(format: "%02x", $0) }.joined()
    let c = Array(h)
    return "\(String(c[0..<8]))-\(String(c[8..<12]))-\(String(c[12..<16]))-\(String(c[16..<20]))-\(String(c[20..<32]))"
  }

  /// `Observation.code`, with a LOINC coding when one exists.
  ///
  /// FHIR allows a CodeableConcept carrying only `text`, and that is what an
  /// uncoded quantity gets. The dictionary records why LOINC has no code for
  /// it, and that reason travels as a `data-absent-reason` extension so a
  /// consumer is told rather than left to guess.
  private static func codeableConcept(for value: CodedLabValue) -> JSON {
    var concept: JSON = [:]
    if let code = value.coding.loinc {
      concept["coding"] = .array([loinc(code, value.coding.display)])
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
    // The person's check of the value against the paper, and the reading
    // they corrected. Mirrors `provenanceExtensions` in to-fhir.ts.
    if let verification = value.verification {
      let formatter = ISO8601DateFormatter()
      extensions.append(
        [
          "url": .string(extVerified),
          "valueDateTime": .string(formatter.string(from: verification.verifiedAt)),
        ])
      if let original = verification.original {
        let number =
          original.value == original.value.rounded() && abs(original.value) < 1e15
          ? String(Int(original.value)) : String(original.value)
        extensions.append(
          [
            "url": .string(extOriginalReading),
            "valueString": .string("\(original.label) \(number) \(original.unitRaw)"),
          ])
      }
    }
    return extensions
  }
}

/// A kind of report and how the export files it: the DiagnosticReport's
/// category (HL7 v2-0074) and code (LOINC). Generated from `REPORT_KINDS`
/// (`Analytes.reportKinds`).
public struct ReportKind: Sendable, Equatable {
  public let kind: String
  public let section: String
  public let sectionDisplay: String
  public let loinc: String
  public let display: String
  public let triggers: Set<String>
  public let members: Set<String>

  public init(
    kind: String, section: String, sectionDisplay: String, loinc: String, display: String,
    triggers: Set<String>, members: Set<String>
  ) {
    self.kind = kind
    self.section = section
    self.sectionDisplay = sectionDisplay
    self.loinc = loinc
    self.display = display
    self.triggers = triggers
    self.members = members
  }
}

import Foundation
import Testing

@testable import Shared

/// The stored reports as OMOP CDM v5.4 tables.
@Suite("OMOP CDM export")
struct OmopExportTests {

  static func report(day: Int, title: String, values: [(String, Double, String, String, String, Double?, Double?, Shared.Comparator?)]) -> LabReport {
    let date = ReportMetadataExtractor.day(2026, 3, day)!
    let coded = values.map { label, value, unit, loinc, key, low, high, comparator in
      CodedLabValue(
        raw: RawLabValue(
          label: label, value: value, unitRaw: unit, comparator: comparator,
          referenceLow: low, referenceHigh: high, line: "\(label) \(value)", lineNumber: 1),
        coding: AnalyteCoding(
          labelKey: label.lowercased(), ucum: unit, loinc: loinc, display: label, analyteKey: key),
        source: .labIssuedDigital)
    }
    return LabReport(
      id: UUID(), scannedAt: Date(), collectedOn: date, title: title,
      extraction: ExtractionResult(
        coded: coded, unmapped: [], suspiciousLines: [], source: .labIssuedDigital),
      metadata: ReportMetadata(labDate: date, dateSource: .printed))
  }

  static var reports: [LabReport] {
    [
      report(day: 20, title: "June", values: [
        ("LDL-Cholesterin", 128, "mg/dL", "2089-1", "cholesterol-ldl", nil, 116, nil)
      ]),
      report(day: 3, title: "March, lab \"A\"", values: [
        ("LDL-Cholesterin", 141, "mg/dL", "2089-1", "cholesterol-ldl", nil, 116, nil),
        ("Lp(a)", 0.1, "g/L", "10835-7", "lipoprotein-a", nil, 0.3, .lessThan),
      ]),
    ]
  }

  static func rows(_ csv: String) -> [[String]] {
    csv.split(separator: "\n").map { $0.components(separatedBy: ",") }
  }

  @Test("the measurement table has the CDM's columns, in its order")
  func columns() throws {
    let bundle = OmopExport.bundle(from: Self.reports)
    let measurement = try #require(bundle.files["measurement.csv"])
    let header = Self.rows(measurement)[0]

    #expect(header == OmopExport.measurementColumns)
    #expect(header.count == 23, "CDM v5.4 MEASUREMENT has 23 columns")
    #expect(bundle.measurementCount == 3)
  }

  @Test("a LOINC code travels as the source value, with concept id zero")
  func conceptIdsAreZero() throws {
    // Deliberate: mapping needs the Athena vocabulary, which is not on a
    // phone, and inventing a concept id would put a wrong identifier on a real
    // measurement. The graph in this repository sets 0 for the same reason.
    let bundle = OmopExport.bundle(from: Self.reports)
    let rows = Self.rows(try #require(bundle.files["measurement.csv"]))
    let header = rows[0]
    // Found by its source value rather than by position: rows are ordered by
    // date and then by LOINC code as a string, so "10835-7" sorts before
    // "2089-1" and the order is not the order they were written in.
    let sourceColumn = header.firstIndex(of: "measurement_source_value")!
    let ldl = try #require(rows.dropFirst().first { $0[sourceColumn] == "2089-1" })
    func field(_ name: String) -> String { ldl[header.firstIndex(of: name)!] }

    #expect(field("measurement_concept_id") == "0")
    #expect(field("unit_concept_id") == "0")
    #expect(field("measurement_source_concept_id") == "0")
    #expect(field("measurement_source_value") == "2089-1")
    #expect(field("unit_source_value") == "mg/dL")
    #expect(field("person_id") == "1")
  }

  @Test("the laboratory's printed range is what range_low and range_high carry")
  func printedRangeTravels() throws {
    let bundle = OmopExport.bundle(from: Self.reports)
    let rows = Self.rows(try #require(bundle.files["measurement.csv"]))
    let header = rows[0]
    let sourceColumn = header.firstIndex(of: "measurement_source_value")!
    let dateColumn = header.firstIndex(of: "measurement_date")!
    let ldl = try #require(
      rows.dropFirst().first { $0[sourceColumn] == "2089-1" && $0[dateColumn] == "2026-03-03" })

    #expect(ldl[header.firstIndex(of: "range_high")!] == "116")
    #expect(ldl[header.firstIndex(of: "range_low")!] == "", "no lower bound was printed")
    #expect(ldl[header.firstIndex(of: "value_as_number")!] == "141")
  }

  @Test("a comparator is kept in value_source_value rather than dropped")
  func comparatorSurvives() throws {
    // There is no operator concept without the vocabulary, so the printed
    // value travels verbatim instead of being silently rounded to its bound.
    let bundle = OmopExport.bundle(from: Self.reports)
    let measurement = try #require(bundle.files["measurement.csv"])
    #expect(measurement.contains("<0.1 g/L"))
  }

  @Test("rows are ordered by date, so two exports of the same data are identical")
  func deterministic() throws {
    let first = OmopExport.bundle(from: Self.reports, generatedAt: Date(timeIntervalSince1970: 0))
    let again = OmopExport.bundle(
      from: Self.reports.reversed(), generatedAt: Date(timeIntervalSince1970: 0))

    #expect(first.files["measurement.csv"] == again.files["measurement.csv"])
    let dates = Self.rows(first.files["measurement.csv"]!).dropFirst().map { $0[3] }
    #expect(dates == dates.sorted())
  }

  @Test("a field with a comma or a quote is escaped rather than breaking the row")
  func escaping() {
    #expect(OmopExport.csv("plain") == "plain")
    #expect(OmopExport.csv("a,b") == "\"a,b\"")
    #expect(OmopExport.csv("say \"hi\"") == "\"say \"\"hi\"\"\"")
  }

  @Test("the person row holds no identity, because the app holds none")
  func personIsAPlaceholder() throws {
    let bundle = OmopExport.bundle(from: Self.reports, sex: .female)
    let rows = Self.rows(try #require(bundle.files["person.csv"]))
    let header = rows[0]
    let person = rows[1]

    #expect(header == OmopExport.personColumns)
    #expect(person[header.firstIndex(of: "year_of_birth")!] == "")
    #expect(person[header.firstIndex(of: "gender_concept_id")!] == "0")
    #expect(person[header.firstIndex(of: "gender_source_value")!] == "female")
    #expect(person[header.firstIndex(of: "person_source_value")!] == "klarbefund-local")
  }

  @Test("the observation period spans the first measurement to the last")
  func observationPeriod() throws {
    let bundle = OmopExport.bundle(from: Self.reports)
    let rows = Self.rows(try #require(bundle.files["observation_period.csv"]))

    #expect(rows[1][2] == "2026-03-03")
    #expect(rows[1][3] == "2026-03-20")
  }

  @Test("the export explains why the concept ids are zero")
  func readmeExplains() throws {
    let bundle = OmopExport.bundle(from: Self.reports)
    let readme = try #require(bundle.files["README.txt"])

    #expect(readme.contains("Athena"))
    #expect(readme.contains("measurement_source_value"))
    #expect(readme.contains("Not a diagnosis"))
  }

  @Test("no reports means no observation period rather than an invented one")
  func emptyExport() {
    let bundle = OmopExport.bundle(from: [])
    #expect(bundle.measurementCount == 0)
    #expect(bundle.files["observation_period.csv"] == nil)
    #expect(bundle.files["measurement.csv"]?.split(separator: "\n").count == 1, "header only")
  }
}

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
    let bundle = OmopExport.bundle(from: Self.reports, profile: Profile(sex: .female, birthDate: ReportMetadataExtractor.day(1976, 3, 8)))
    let rows = Self.rows(try #require(bundle.files["person.csv"]))
    let header = rows[0]
    let person = rows[1]

    #expect(header == OmopExport.personColumns)
    #expect(person[header.firstIndex(of: "year_of_birth")!] == "1976", "the year the CDM asks for")
    #expect(person[header.firstIndex(of: "day_of_birth")!] == "", "the day it does not")
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

/// A quantity LOINC does not code, on every path that carries a value out.
@Suite("Visceral fat in kilograms, which LOINC has no term for")
struct UncodedQuantityTests {

  static func scaleReport() -> LabReport {
    let entries = BodyMeasurements.entries(
      waistCm: nil, weightKg: 70, visceralFat: 1.6, visceralFatUnit: .mass,
      heightCm: nil, profile: .empty)
    return BodyMeasurements.report(
      entries: entries, on: ReportMetadataExtractor.day(2026, 6, 15)!,
      title: "Body measurements")!
  }

  @Test("the unit decides whether there is a code, and the label never does")
  func unitDecides() throws {
    let area = try #require(Analytes.lookup(label: "Viszeralfett", unit: "cm²"))
    #expect(area.loinc == "73707-2")
    #expect(area.uncodedReason == nil)
    #expect(area.isCoded)

    let mass = try #require(Analytes.lookup(label: "Viszeralfett", unit: "kg"))
    #expect(mass.loinc == nil)
    #expect(!mass.isCoded)
    #expect(mass.uncodedReason?.contains("73707-2") == true)
    // Same analyte either way: it is one quantity reported two ways, not two
    // analytes that happen to share a name.
    #expect(mass.analyteKey == area.analyteKey)
  }

  @Test("a kilogram reading is coded and kept, not pushed into unmapped")
  func keptAsCoded() throws {
    let report = Self.scaleReport()
    let fat = try #require(report.extraction.coded.first { $0.coding.analyteKey == "visceral-fat" })
    #expect(fat.raw.value == 1.6)
    #expect(fat.coding.ucum == "kg")
    #expect(report.extraction.unmapped.isEmpty)
  }

  @Test("OMOP carries the printed label where a code would go")
  func omopSourceValue() throws {
    // `measurement_source_value` means the code as it appears in the source
    // data. With no code, the label is that, and a downstream mapper sees
    // something unmappable rather than a plausible wrong code.
    let bundle = OmopExport.bundle(from: [Self.scaleReport()])
    let measurement = try #require(bundle.files["measurement.csv"])
    let header = measurement.split(separator: "\n")[0].components(separatedBy: ",")
    let column = try #require(header.firstIndex(of: "measurement_source_value"))
    let unitColumn = try #require(header.firstIndex(of: "unit_source_value"))

    let row = try #require(
      measurement.split(separator: "\n").dropFirst()
        .map { $0.components(separatedBy: ",") }
        .first { $0[unitColumn].contains("kg") && $0.contains { $0.contains("1.6") } })
    #expect(row[column].contains("Viszerales Fett"))
    // And never the area code, which would be a wrong code on a real value.
    #expect(!row[column].contains("73707-2"))
  }

  @Test("FHIR states that no code applies rather than inventing one")
  func fhirCodeableConcept() throws {
    let report = Self.scaleReport()
    let bundle = FhirWriter.buildBundle(
      values: report.extraction.coded,
      meta: FhirWriter.ReportMeta(
        patientId: "p1", effectiveDateTime: "2026-06-15", performer: nil, title: "Waage"),
      source: FhirWriter.TextSource(
        kind: .selfTracked, sourceDocument: "waage.jpg", ocrConfidence: nil, extractor: "test"),
      now: "2026-06-15T08:00:00Z")
    let text = bundle.canonical()

    #expect(text.contains("data-absent-reason"))
    // Never the area code **as a coding**, which would be a wrong code on a
    // real measurement. It does appear inside the reason, which is the point:
    // the resource says which code exists and why it does not apply.
    #expect(!text.contains("{\"code\":\"73707-2\""))
    #expect(text.contains("has no term for the mass"))
    // The label is still there, so the resource can be matched to the reading.
    #expect(text.contains("\"text\":\"Viszerales Fett\""))
    // The weight beside it is coded as usual: one uncoded quantity does not
    // make the bundle uncoded.
    #expect(text.contains("{\"code\":\"29463-7\""))
  }

  @Test("a codeless coding never prints as an Optional")
  func codeLabelIsReadable() throws {
    // `LOINC Optional("2093-3")` appeared on the report screen a person is
    // asked to check against their own paper, because a now-optional code was
    // interpolated straight into a string.
    let coded = try #require(Analytes.lookup(label: "Cholesterin", unit: "mg/dL"))
    #expect(coded.codeLabel.contains("2093-3"))
    #expect(!coded.codeLabel.contains("Optional"))

    let uncoded = try #require(Analytes.lookup(label: "Viszeralfett", unit: "kg"))
    #expect(!uncoded.codeLabel.contains("Optional"))
    // It names no code at all. Checked by the absence of digits rather than
    // of the word LOINC, which the sentence saying there is none contains.
    #expect(uncoded.codeLabel.rangeOfCharacter(from: .decimalDigits) == nil)
    // And the key that selection lists use stays unique without a code.
    #expect(uncoded.codeKey != coded.codeKey)
    #expect(!uncoded.codeKey.isEmpty)
  }

  @Test("the prompt says no code rather than an empty one")
  func promptOmitsTheCode() throws {
    let report = Self.scaleReport()
    let fat = try #require(report.extraction.coded.first { $0.coding.analyteKey == "visceral-fat" })
    let rendered = PromptText.values([CloudAnalysis.SharedValue(from: fat)])
    #expect(rendered.contains("- Viszerales Fett: 1.6 kg"))
    #expect(!rendered.contains("LOINC"))
  }
}

/// Reading the current body measurements back, so the profile can show them.
@Suite("The profile shows what was measured, from wherever it came")
struct LatestBodyMeasurementsTests {

  static func report(day: Int, entries: [BodyMeasurements.Entry]) -> LabReport {
    BodyMeasurements.report(
      entries: entries, on: ReportMetadataExtractor.day(2026, 6, day)!,
      title: "Body measurements")!
  }

  @Test("the most recent value of each measurement wins")
  func newestWins() {
    let older = Self.report(
      day: 1,
      entries: BodyMeasurements.entries(
        waistCm: 90, weightKg: 72, visceralFat: nil, heightCm: nil, profile: .empty))
    let newer = Self.report(
      day: 15,
      entries: BodyMeasurements.entries(
        waistCm: nil, weightKg: 70, visceralFat: 1.6, visceralFatUnit: .mass,
        heightCm: nil, profile: .empty))

    let latest = BodyMeasurements.latest(from: [older, newer])
    #expect(latest["body-weight"]?.value == 70)
    // The waist was not measured again, so the older reading is still current.
    #expect(latest["waist-circumference"]?.value == 90)
    #expect(latest["visceral-fat"]?.value == 1.6)
    // And the unit travels, so the screen reopens on the one the device used.
    #expect(latest["visceral-fat"]?.ucum == "kg")
  }

  @Test("a value read from a scale's screen is current like any other")
  func provenanceDoesNotMatter() {
    // The point of reading these back: a photograph of a gym scale updates
    // what the profile shows, without a second path that could disagree.
    let scanned = LabReport(
      id: UUID(), scannedAt: Date(),
      collectedOn: ReportMetadataExtractor.day(2026, 6, 20)!, title: "Waage",
      extraction: ExtractionResult(
        coded: [
          CodedLabValue(
            raw: RawLabValue(
              label: "Viszeralfett", value: 1.4, unitRaw: "kg",
              line: "Viszeralfett 1,4 kg", lineNumber: 1),
            coding: Analytes.lookup(label: "Viszeralfett", unit: "kg")!,
            source: .ocrTranscribed)
        ], unmapped: [], suspiciousLines: [], source: .ocrTranscribed),
      metadata: ReportMetadata(labDate: ReportMetadataExtractor.day(2026, 6, 20)!, dateSource: .printed))

    let latest = BodyMeasurements.latest(from: [Self.report(
      day: 15,
      entries: BodyMeasurements.entries(
        waistCm: nil, weightKg: 70, visceralFat: 1.6, visceralFatUnit: .mass,
        heightCm: nil, profile: .empty)), scanned])
    #expect(latest["visceral-fat"]?.value == 1.4)
  }

  @Test("saving under an existing id replaces that measurement")
  func sameIdReplaces() throws {
    // Opening the profile, correcting one figure and saving left two reports
    // for one morning, and the trend drew both.
    let id = UUID()
    let first = BodyMeasurements.report(
      entries: BodyMeasurements.entries(
        waistCm: 86, weightKg: 70, visceralFat: nil, heightCm: nil, profile: .empty),
      on: ReportMetadataExtractor.day(2026, 6, 15)!, id: id, title: "Body measurements")
    let corrected = BodyMeasurements.report(
      entries: BodyMeasurements.entries(
        waistCm: 84, weightKg: 70, visceralFat: nil, heightCm: nil, profile: .empty),
      on: ReportMetadataExtractor.day(2026, 6, 15)!, id: id, title: "Body measurements")
    #expect(try #require(first).id == #require(corrected).id)
  }
}


/// Each body measurement carries its own day.
@Suite("Body measurements are filed on the day each was taken")
struct PerDayMeasurementTests {

  static func day(_ d: Int) -> Date { ReportMetadataExtractor.day(2026, 6, d)! }

  @Test("three measurements on three days become three reports")
  func groupedByDay() {
    // One date for the whole screen put two of the three on a day they were
    // not measured: the tape measure comes out at home, the scale stands in a
    // gym, and a laboratory weighs you on a third day.
    let byDay = BodyMeasurements.entriesByDay(
      waist: .init(value: 86, measuredOn: Self.day(1)),
      weight: .init(value: 71.1, measuredOn: Self.day(10)),
      visceralFat: .init(value: 1.6, measuredOn: Self.day(15)),
      visceralFatUnit: .mass, profile: .empty)

    #expect(byDay.map(\.day) == [Self.day(1), Self.day(10), Self.day(15)])
    #expect(byDay[0].entries.map(\.analyteKey) == ["waist-circumference"])
    #expect(byDay[1].entries.map(\.analyteKey) == ["body-weight"])
    #expect(byDay[2].entries.map(\.analyteKey) == ["visceral-fat"])
    #expect(byDay[2].entries[0].ucum == "kg")
  }

  @Test("BMI is filed with the weight it was computed from")
  func bmiFollowsWeight() throws {
    let profile = Profile(sex: .male, birthDate: nil, heightCm: 170)
    let byDay = BodyMeasurements.entriesByDay(
      waist: .init(value: 86, measuredOn: Self.day(1)),
      weight: .init(value: 71.1, measuredOn: Self.day(10)),
      visceralFat: nil, profile: profile)

    let weightDay = try #require(byDay.first { $0.day == Self.day(10) })
    #expect(weightDay.entries.map(\.analyteKey).sorted() == ["bmi", "body-weight"])
    // And never onto the waist's day, where no weight was measured.
    let waistDay = try #require(byDay.first { $0.day == Self.day(1) })
    #expect(!waistDay.entries.contains { $0.analyteKey == "bmi" })
  }

  @Test("measurements on one day stay one report")
  func sameDayStaysTogether() {
    let byDay = BodyMeasurements.entriesByDay(
      waist: .init(value: 86, measuredOn: Self.day(5)),
      weight: .init(value: 71, measuredOn: Self.day(5)),
      visceralFat: nil, profile: .empty)
    #expect(byDay.count == 1)
    #expect(byDay[0].entries.count == 2)
  }

  @Test("a waist on its own is saved, and is not lost with the others")
  func waistAlone() throws {
    // The waist could be typed and then thrown away, because the obvious
    // Save button saved only the profile.
    let byDay = BodyMeasurements.entriesByDay(
      waist: .init(value: 86, measuredOn: Self.day(5)), weight: nil, visceralFat: nil,
      profile: .empty)
    let report = try #require(
      BodyMeasurements.report(entries: byDay[0].entries, on: byDay[0].day))
    let value = try #require(report.extraction.coded.first)
    #expect(value.coding.analyteKey == "waist-circumference")
    #expect(value.raw.value == 86)
    #expect(value.coding.loinc == "8280-0")
  }

  @Test("a value an older dictionary could not code is found again")
  func unmappedIsRescued() throws {
    // A scale's visceral fat in kilograms was filed as an unknown analyte for
    // exactly as long as no entry existed for it. Re-reading every old report
    // by hand to recover it is not something anyone should have to think of.
    let stale = LabReport(
      id: UUID(), scannedAt: Date(), collectedOn: Self.day(15), title: "Körperzusammensetzung",
      extraction: ExtractionResult(
        coded: [], unmapped: [
          UnmappedLabValue(
            raw: RawLabValue(
              label: "Viszeralfett", value: 1.6, unitRaw: "kg",
              line: "Viszeralfett 1,6 kg", lineNumber: 1),
            reason: .unknownAnalyte)
        ], suspiciousLines: [], source: .selfTracked),
      metadata: ReportMetadata(labDate: Self.day(15), dateSource: .printed))

    let latest = BodyMeasurements.latest(from: [stale])
    let fat = try #require(latest["visceral-fat"])
    #expect(fat.value == 1.6)
    #expect(fat.ucum == "kg")
    #expect(fat.date == Self.day(15))
  }

  @Test("a rescued value never beats a newer coded one")
  func codedStillWinsOnDate() throws {
    let stale = LabReport(
      id: UUID(), scannedAt: Date(), collectedOn: Self.day(1), title: "Alt",
      extraction: ExtractionResult(
        coded: [], unmapped: [
          UnmappedLabValue(
            raw: RawLabValue(
              label: "Viszeralfett", value: 9.9, unitRaw: "kg", line: "x", lineNumber: 1),
            reason: .unknownAnalyte)
        ], suspiciousLines: [], source: .selfTracked),
      metadata: ReportMetadata(labDate: Self.day(1), dateSource: .printed))
    let fresh = BodyMeasurements.report(
      entries: BodyMeasurements.entries(
        waistCm: nil, weightKg: nil, visceralFat: 1.6, visceralFatUnit: .mass,
        heightCm: nil, profile: .empty),
      on: Self.day(20), title: "Neu")!

    let latest = BodyMeasurements.latest(from: [stale, fresh])
    #expect(latest["visceral-fat"]?.value == 1.6)
    #expect(latest["visceral-fat"]?.date == Self.day(20))
  }
}

/// The values a scale plots behind the one it names.
@Suite("A chart's own history, and not counting it twice")
struct ChartHistoryTests {

  static func fragment(_ text: String, x: Double, y: Double, w: Double = 0.04)
    -> DocumentReconciler.TextFragment
  {
    DocumentReconciler.TextFragment(
      text: text,
      region: SourceRegion(page: 1, x: x, y: y, width: w, height: 0.02))
  }

  /// The ECW/TBW card, at the positions a real photograph produced.
  static var card: [DocumentReconciler.TextFragment] {
    [
      fragment("Juni", x: 0.089, y: 0.066), fragment("Juli", x: 0.165, y: 0.073),
      fragment("Aug.", x: 0.236, y: 0.079), fragment("Sept.", x: 0.301, y: 0.082),
      fragment("Okt.", x: 0.379, y: 0.089), fragment("Nov.", x: 0.444, y: 0.095),
      fragment("Dez.", x: 0.512, y: 0.098), fragment("gan.", x: 0.575, y: 0.101),
      fragment("Feb.", x: 0.642, y: 0.108), fragment("Marz", x: 0.702, y: 0.111),
      fragment("Apr.", x: 0.767, y: 0.111), fragment("Mal", x: 0.827, y: 0.117),
      fragment("37%", x: 0.886, y: 0.139), fragment("38%", x: 0.886, y: 0.247),
      fragment("39%", x: 0.886, y: 0.351), fragment("40%", x: 0.883, y: 0.453),
      fragment("38", x: 0.705, y: 0.294), fragment("38,1", x: 0.377, y: 0.297),
      fragment("38,2", x: 0.634, y: 0.313), fragment("38,3", x: 0.442, y: 0.320),
      fragment("38,3", x: 0.756, y: 0.326), fragment("38,4", x: 0.572, y: 0.332),
      fragment("38,4", x: 0.816, y: 0.339),
      fragment("< 01.06.25 - 14.05.26", x: 0.384, y: 0.502, w: 0.25),
      fragment("38,4%", x: 0.073, y: 0.706, w: 0.165),
    ]
  }

  static let updated = ReportMetadataExtractor.day(2026, 5, 14)!

  @Test("the months carry years, walked back from the day the screen was updated")
  func monthsCarryYears() throws {
    // A month label carries no year. The rightmost is the month the screen
    // was updated in, and each one to its left is the month before.
    let axis = DeviceScreen.ChartHistory.axis(in: Self.card, updatedOn: Self.updated)
    #expect(axis.count == 12)
    let calendar = Calendar(identifier: .gregorian)
    let first = try #require(axis.first).month
    let last = try #require(axis.last).month
    #expect(calendar.component(.year, from: first) == 2025)
    #expect(calendar.component(.month, from: first) == 6)
    #expect(calendar.component(.year, from: last) == 2026)
    #expect(calendar.component(.month, from: last) == 5)
  }

  @Test("the recogniser's mangled month names are still months")
  func manglesAreRead() {
    // Measured, not guessed: `Mai` comes back as `Mal`, `Jan.` as `gan.`.
    #expect(DeviceScreen.ChartHistory.month(of: "Mal") == 5)
    #expect(DeviceScreen.ChartHistory.month(of: "gan.") == 1)
    #expect(DeviceScreen.ChartHistory.month(of: "Marz") == 3)
    #expect(DeviceScreen.ChartHistory.month(of: "Sept.") == 9)
    #expect(DeviceScreen.ChartHistory.month(of: "Ferritin") == nil)
  }

  @Test("every plotted value is recovered, over the month it sits on")
  func pointsAreRecovered() throws {
    let points = DeviceScreen.ChartHistory.points(
      in: Self.card, updatedOn: Self.updated, headline: 38.4)
    #expect(points.count == 6)
    #expect(points.map(\.value) == [38.1, 38.3, 38.4, 38.2, 38.0, 38.3])

    let calendar = Calendar(identifier: .gregorian)
    #expect(points.map { calendar.component(.month, from: $0.month) } == [10, 11, 1, 2, 3, 4])
  }

  @Test("the value the screen names is not also taken from the chart")
  func theHeadlineIsNotCountedTwice() {
    // Its own point is on the chart too. One measurement recorded twice, once
    // with a day and once with only a month, is two measurements to a trend.
    let withHeadline = DeviceScreen.ChartHistory.points(
      in: Self.card, updatedOn: Self.updated, headline: 38.4)
    let without = DeviceScreen.ChartHistory.points(in: Self.card, updatedOn: Self.updated)
    #expect(without.count == withHeadline.count + 1)
    let calendar = Calendar(identifier: .gregorian)
    #expect(!withHeadline.contains { calendar.component(.month, from: $0.month) == 5 })
  }

  @Test("the axis is not mistaken for a measurement")
  func theScaleIsNotData() {
    // 37, 38, 39 and 40 label the value axis. They stand in one column at the
    // edge; a data label sits beside its own point and shares its x with
    // nothing.
    let points = DeviceScreen.ChartHistory.points(in: Self.card, updatedOn: Self.updated)
    #expect(!points.contains { $0.value == 37 || $0.value == 40 })
  }

  @Test("nothing is claimed from a chart with no numbers on it")
  func noNumbersMeansNoHistory() {
    // Most of this scale's cards draw circles and print no number beside any
    // of them. There is nothing to read there, so nothing is read.
    let bare = [
      Self.fragment("Juli", x: 0.086, y: 0.087), Self.fragment("Aug.", x: 0.140, y: 0.082),
      Self.fragment("Sept.", x: 0.198, y: 0.079), Self.fragment("Okt.", x: 0.271, y: 0.077),
      Self.fragment("Nov.", x: 0.336, y: 0.074), Self.fragment("Dez.", x: 0.401, y: 0.069),
      Self.fragment("Jan.", x: 0.464, y: 0.066), Self.fragment("Feb.", x: 0.532, y: 0.064),
      Self.fragment("Mai", x: 0.737, y: 0.056), Self.fragment("Juni", x: 0.804, y: 0.056),
      Self.fragment("22", x: 0.877, y: 0.092), Self.fragment("23", x: 0.881, y: 0.205),
      Self.fragment("24", x: 0.883, y: 0.321), Self.fragment("25", x: 0.887, y: 0.433),
      Self.fragment("23,8", x: 0.802, y: 0.223),
    ]
    let points = DeviceScreen.ChartHistory.points(
      in: bare, updatedOn: ReportMetadataExtractor.day(2026, 6, 15)!, headline: 23.8)
    #expect(points.isEmpty, "a badge beside the newest point is not a year of history")
  }
}

/// Not storing the same measurement twice.
@Suite("Duplicates")
struct DuplicateTests {

  static func report(day: Int, values: [(String, Double, String)]) -> LabReport {
    let date = ReportMetadataExtractor.day(2026, 6, day)!
    let entries = values.map {
      BodyMeasurements.Entry(analyteKey: $0.0, label: $0.0, value: $0.1, ucum: $0.2)
    }
    return BodyMeasurements.report(entries: entries, on: date, title: "x")!
  }

  @Test("the same measurement on the same day is recognised whatever it arrived in")
  func sameIsSame() throws {
    let first = Self.report(day: 15, values: [("Körpergewicht", 71.1, "kg")])
    let again = Self.report(day: 15, values: [("Körpergewicht", 71.1, "kg")])
    #expect(Duplicates.strip(again, known: Duplicates.keys(of: first)) == nil)
  }

  @Test("a different day, a different value or a different unit is a different measurement")
  func differencesSurvive() throws {
    let known = Duplicates.keys(of: Self.report(day: 15, values: [("Körpergewicht", 71.1, "kg")]))
    #expect(Duplicates.strip(Self.report(day: 16, values: [("Körpergewicht", 71.1, "kg")]), known: known) != nil)
    #expect(Duplicates.strip(Self.report(day: 15, values: [("Körpergewicht", 71.2, "kg")]), known: known) != nil)
  }

  @Test("a report half of which is known keeps the half that is not")
  func partIsKept() throws {
    let known = Duplicates.keys(of: Self.report(day: 15, values: [("Körpergewicht", 71.1, "kg")]))
    let mixed = Self.report(
      day: 15, values: [("Körpergewicht", 71.1, "kg"), ("Taillenumfang", 86, "cm")])
    let stripped = try #require(Duplicates.strip(mixed, known: known))
    #expect(stripped.extraction.coded.count == 1)
    #expect(stripped.extraction.coded.first?.raw.label == "Taillenumfang")
  }
}

import Foundation
import Testing

@testable import Shared

/// The published ranges, and the timelines built out of stored reports.
@Suite("Reference ranges and trends")
struct TrendsTests {

  // MARK: - The data itself

  @Test("every published range names an analyte the dictionary codes, in that unit")
  func rangesMatchTheDictionary() {
    for range in ReferenceRanges.all {
      let codings = Analytes.codings.filter {
        $0.analyteKey == range.analyteKey && $0.ucum == range.ucum
      }
      #expect(
        !codings.isEmpty,
        "\(range.analyteKey) has a range in \(range.ucum) that the dictionary cannot produce")
    }
  }

  @Test("every range is quoted from a source a reader can open")
  func everyRangeIsSourced() {
    // The whole difference from the sites this was modelled on, which give
    // numbers with no provenance at all.
    for range in ReferenceRanges.all {
      #expect(range.source.url.hasPrefix("https://"), "\(range.analyteKey)")
      #expect(range.source.label.count > 20, "\(range.analyteKey)")
      #expect(range.summary.count > 20, "\(range.analyteKey)")
      #expect(
        range.guidelineLow != nil || range.guidelineHigh != nil,
        "\(range.analyteKey) states no guideline bound")
    }
  }

  @Test("a bound is never inverted")
  func boundsAreOrdered() {
    for range in ReferenceRanges.all {
      if let low = range.guidelineLow, let high = range.guidelineHigh { #expect(low <= high) }
      if let low = range.optimalLow, let high = range.optimalHigh { #expect(low <= high) }
    }
  }

  @Test("a sex-specific range is never used for someone who has not said")
  func sexSpecificRangesAreNotGuessed() {
    // Haemoglobin differs by sex, and a man's threshold beside a woman's value
    // is worse than no threshold at all.
    #expect(ReferenceRanges.range(analyteKey: "haemoglobin", ucum: "g/dL", sex: .any) == nil)
    #expect(ReferenceRanges.range(analyteKey: "haemoglobin", ucum: "g/dL", sex: .male) != nil)
    #expect(
      ReferenceRanges.range(analyteKey: "haemoglobin", ucum: "g/dL", sex: .female)?.guidelineLow
        == 12.0)
    // A sex-neutral range is returned whatever the answer.
    #expect(ReferenceRanges.range(analyteKey: "hba1c", ucum: "%", sex: .male) != nil)
    #expect(ReferenceRanges.range(analyteKey: "hba1c", ucum: "%", sex: .any) != nil)
  }

  @Test("a range applies to one unit, never to the analyte in general")
  func rangesAreUnitSpecific() {
    // Lp(a) as mass and as moles are different LOINC codes with different
    // thresholds, so they carry different ranges and neither answers for the
    // other.
    let mass = ReferenceRanges.range(analyteKey: "lipoprotein-a", ucum: "mg/dL")
    let molar = ReferenceRanges.range(analyteKey: "lipoprotein-a", ucum: "nmol/L")
    #expect(mass?.optimalHigh == 30)
    #expect(molar?.optimalHigh == 75)
    #expect(ReferenceRanges.range(analyteKey: "lipoprotein-a", ucum: "mg/L") == nil)
  }

  // MARK: - Placement

  @Test("a value is placed against the optimal band and the guideline range")
  func placement() throws {
    let ldl = try #require(ReferenceRanges.range(analyteKey: "cholesterol-ldl", ucum: "mg/dL"))
    #expect(ldl.placement(of: 50) == .withinOptimal)
    #expect(ldl.placement(of: 90) == .outsideOptimal)
    #expect(ldl.placement(of: 141) == .outsideGuideline)

    // A low-side bound works the same way.
    let egfr = try #require(
      ReferenceRanges.range(analyteKey: "egfr", ucum: "mL/min/{1.73_m2}"))
    #expect(egfr.placement(of: 95) == .withinOptimal)
    #expect(egfr.placement(of: 75) == .outsideOptimal)
    #expect(egfr.placement(of: 45) == .outsideGuideline)
  }

  @Test("the band reads the way a report prints it")
  func bandText() throws {
    let ldl = try #require(ReferenceRanges.range(analyteKey: "cholesterol-ldl", ucum: "mg/dL"))
    #expect(ldl.optimalText(formatter: { String(Int($0)) }) == "< 55")
    let vitaminD = try #require(ReferenceRanges.range(analyteKey: "vitamin-d", ucum: "ng/mL"))
    #expect(vitaminD.optimalText(formatter: { String(Int($0)) }) == "30 – 50")
    let egfr = try #require(
      ReferenceRanges.range(analyteKey: "egfr", ucum: "mL/min/{1.73_m2}"))
    #expect(egfr.optimalText(formatter: { String(Int($0)) }) == "≥ 90")
  }

  // MARK: - Series

  static func report(
    _ title: String, day: Int, values: [(String, Double, String, String, SourceKind)]
  ) -> LabReport {
    let date = ReportMetadataExtractor.day(2026, 3, day)!
    let coded = values.map { label, value, unit, loinc, source in
      CodedLabValue(
        raw: RawLabValue(
          label: label, value: value, unitRaw: unit, referenceLow: nil, referenceHigh: 116,
          line: "\(label) \(value) \(unit)", lineNumber: 1),
        coding: AnalyteCoding(
          labelKey: Analytes.normaliseLabel(label), ucum: unit, loinc: loinc,
          display: label, analyteKey: label == "Lp(a)" ? "lipoprotein-a" : "cholesterol-ldl"),
        source: source)
    }
    return LabReport(
      id: UUID(), scannedAt: Date(), collectedOn: date, title: title,
      extraction: ExtractionResult(
        coded: coded, unmapped: [], suspiciousLines: [], source: values.first?.4 ?? .ocrTranscribed
      ),
      metadata: ReportMetadata(labDate: date, dateSource: .printed))
  }

  @Test("the same analyte across reports becomes one series, oldest first")
  func seriesAcrossReports() throws {
    let reports = [
      Self.report("June", day: 20, values: [("LDL-Cholesterin", 128, "mg/dL", "2089-1", .labIssuedDigital)]),
      Self.report("March", day: 3, values: [("LDL-Cholesterin", 141, "mg/dL", "2089-1", .ocrTranscribed)]),
    ]
    let series = try #require(Trends.series(from: reports).first)

    #expect(series.points.count == 2)
    #expect(series.points.map(\.value) == [141, 128], "oldest first")
    #expect(series.change == -13)
    #expect(series.latest?.source == .labIssuedDigital)
    #expect(series.allLabIssued == false, "one point was transcribed")
    #expect(series.range?.analyteKey == "cholesterol-ldl")
  }

  @Test("a series is keyed by unit as well as analyte")
  func unitsAreSeparateSeries() {
    // Plotting mg/dL and nmol/L on one axis would draw a trend that does not
    // exist: they are different LOINC codes.
    let reports = [
      Self.report("mass", day: 3, values: [("Lp(a)", 22, "mg/dL", "10835-7", .labIssuedDigital)]),
      Self.report("molar", day: 20, values: [("Lp(a)", 60, "nmol/L", "43583-4", .labIssuedDigital)]),
    ]
    let series = Trends.series(from: reports)

    #expect(series.count == 2)
    #expect(Set(series.map(\.ucum)) == ["mg/dL", "nmol/L"])
    #expect(series.allSatisfy { $0.points.count == 1 })
  }

  @Test("only analytes measured more than once have a history")
  func withHistory() {
    let reports = [
      Self.report("one", day: 3, values: [
        ("LDL-Cholesterin", 141, "mg/dL", "2089-1", .labIssuedDigital),
        ("Lp(a)", 22, "mg/dL", "10835-7", .labIssuedDigital),
      ]),
      Self.report("two", day: 20, values: [("LDL-Cholesterin", 128, "mg/dL", "2089-1", .labIssuedDigital)]),
    ]
    let all = Trends.series(from: reports)
    let repeated = Trends.withHistory(all)

    #expect(all.count == 2)
    #expect(repeated.count == 1)
    #expect(repeated.first?.analyteKey == "cholesterol-ldl")
  }

  @Test("an analyte with no published range says so rather than inventing one")
  func noRange() {
    let reports = [
      Self.report("one", day: 3, values: [("Lp(a)", 22, "mg/L", "10835-7", .labIssuedDigital)])
    ]
    let series = Trends.series(from: reports)
    #expect(series.first?.range == nil)
    #expect(series.first?.placement == .noRange)
  }

  @Test("a report is placed on its own date, not the day it was scanned")
  func datesComeFromTheReport() throws {
    let series = try #require(
      Trends.series(from: [
        Self.report("March", day: 3, values: [("LDL-Cholesterin", 141, "mg/dL", "2089-1", .labIssuedDigital)])
      ]).first)
    #expect(series.points.first?.date == ReportMetadataExtractor.day(2026, 3, 3))
  }
}

/// The profile: the few facts a published range needs, and nothing else.
@Suite("Profile")
struct ProfileTests {

  @Test("age comes from the birth date, and an impossible one yields none")
  func age() {
    let born = ReportMetadataExtractor.day(1976, 3, 8)!
    let profile = Profile(sex: .male, birthDate: born, heightCm: 183)

    #expect(profile.age(on: ReportMetadataExtractor.day(2026, 3, 7)!) == 49)
    #expect(profile.age(on: ReportMetadataExtractor.day(2026, 3, 8)!) == 50)
    #expect(profile.birthYear == 1976)
    // A birth date in the future is not an age.
    #expect(Profile(birthDate: ReportMetadataExtractor.day(2030, 1, 1)!).age() == nil)
  }

  @Test("the derived figures need a height, and say nothing without one")
  func derived() {
    let withHeight = Profile(heightCm: 180)
    #expect(withHeight.waistToHeight(waistCm: 90) == 0.5)
    #expect(abs((withHeight.bodyMassIndex(weightKg: 81) ?? 0) - 25) < 0.01)

    let without = Profile()
    #expect(without.waistToHeight(waistCm: 90) == nil)
    #expect(without.bodyMassIndex(weightKg: 81) == nil)
  }

  @Test("a profile written by an older version still opens")
  func decodesOldProfile() throws {
    let old = #"{"sex":"male"}"#
    let profile = try JSONDecoder().decode(Profile.self, from: Data(old.utf8))

    #expect(profile.sex == .male)
    #expect(profile.birthDate == nil)
    #expect(profile.heightCm == nil)
  }

  @Test("entered measurements become a self-tracked report, coded like any other")
  func measurementsBecomeAReport() throws {
    let profile = Profile(sex: .male, heightCm: 180)
    let entries = BodyMeasurements.entries(
      waistCm: 94, weightKg: 81, visceralFat: 72, heightCm: 180, profile: profile)
    let report = try #require(
      BodyMeasurements.report(entries: entries, on: ReportMetadataExtractor.day(2026, 3, 3)!))

    let codes = report.extraction.coded.map(\.coding.loinc)
    #expect(codes.contains("8302-2"), "height")
    #expect(codes.contains("29463-7"), "weight")
    #expect(codes.contains("39156-5"), "BMI, derived from the two")
    #expect(codes.contains("8280-0"), "waist")
    #expect(codes.contains("73707-2"), "visceral fat as an area")
    #expect(report.extraction.unmapped.isEmpty)

    // A tape measure is not a laboratory, and the provenance already says so.
    #expect(report.extraction.source == .selfTracked)
    #expect(report.extraction.source.observationStatus == "preliminary")
    #expect(report.collectedOn == ReportMetadataExtractor.day(2026, 3, 3))
  }

  @Test("nothing entered means no report rather than an empty one")
  func nothingEntered() {
    let entries = BodyMeasurements.entries(
      waistCm: nil, weightKg: nil, visceralFat: nil, heightCm: nil, profile: .empty)
    #expect(entries.isEmpty)
    #expect(BodyMeasurements.report(entries: entries, on: Date()) == nil)
  }

  @Test("the waist thresholds are the sex-specific ones, and are never guessed")
  func waistRanges() throws {
    #expect(ReferenceRanges.range(analyteKey: "waist-circumference", ucum: "cm") == nil)
    let male = try #require(
      ReferenceRanges.range(analyteKey: "waist-circumference", ucum: "cm", sex: .male))
    let female = try #require(
      ReferenceRanges.range(analyteKey: "waist-circumference", ucum: "cm", sex: .female))

    #expect(male.optimalHigh == 94)
    #expect(male.guidelineHigh == 102)
    #expect(female.optimalHigh == 80)
    #expect(female.guidelineHigh == 88)
    #expect(male.placement(of: 92) == .withinOptimal)
    #expect(male.placement(of: 98) == .outsideOptimal)
    #expect(male.placement(of: 105) == .outsideGuideline)
  }

  @Test("a body measurement joins the timeline like a laboratory value")
  func measurementsJoinTrends() throws {
    let profile = Profile(sex: .male, heightCm: 180)
    let march = BodyMeasurements.report(
      entries: BodyMeasurements.entries(
        waistCm: 96, weightKg: nil, visceralFat: nil, heightCm: nil, profile: profile),
      on: ReportMetadataExtractor.day(2026, 3, 3)!)!
    let june = BodyMeasurements.report(
      entries: BodyMeasurements.entries(
        waistCm: 92, weightKg: nil, visceralFat: nil, heightCm: nil, profile: profile),
      on: ReportMetadataExtractor.day(2026, 6, 3)!)!

    let series = try #require(
      Trends.series(from: [march, june], sex: .male).first { $0.analyteKey == "waist-circumference" }
    )
    #expect(series.points.map(\.value) == [96, 92])
    #expect(series.change == -4)
    #expect(series.placement == .withinOptimal, "92 cm is under the 94 cm threshold")
    #expect(series.allLabIssued == false, "entered by the person, not issued by a laboratory")
  }
}

/// A body-composition scale's screen, photographed.
///
/// Invented values throughout; the shapes are a real gym scale's.
@Suite("A scale's screen")
struct DeviceScreenTests {

  static let weightCard = """
    Gewicht
    71,1 kg
    Aktualisiert: Donnerstag, 14. Mai 2026
    1 Day  7 Days  30 Days  12 Months
    < 01.06.25 - 14.05.26 >
    74
    70,7
    71,6  72,6  70,4  72,7
    68,7  71,1
    Juni  Juli  Aug.  Sept.  Okt.  Nov.  Dez.  Jan.  Feb.  März  Apr.  Mai
    """

  static let fatCard = """
    Körperfett
    A Niedrig
    10,6 kg
    Aktualisiert: Montag, 15. Juni 2026
    1 Tag  7 Tage  30 Tage  12 Monate
    < 01.07.25 - 15.06.26 >
    14
    10,6  8
    < 12.3 Niedrig  • 12.3 - 24 Normal  > 24 Erhöht
    """

  @Test("a card yields its headline value, its unit and the day it was measured")
  func readsOneCard() throws {
    let reading = try #require(DeviceScreen.read(Self.weightCard))

    #expect(reading.label == "Gewicht")
    #expect(reading.value == 71.1)
    #expect(reading.unitRaw == "kg")
    #expect(reading.measuredOn == ReportMetadataExtractor.day(2026, 5, 14))
  }

  @Test("the chart is not read, because its points have no dates on the screen")
  func chartIsIgnored() throws {
    // The labelled points are real measurements whose dates the screen does
    // not give: the axis says "Nov." and the year is implied. A value with a
    // date we inferred is worse than a value we did not take.
    let reports = DeviceScreen.reports(
      from: [DeviceScreen.read(Self.weightCard)].compactMap { $0 })
    let report = try #require(reports.first)

    #expect(report.extraction.coded.count == 1, "one card, one reading")
    #expect(report.extraction.coded.first?.raw.value == 71.1)
  }

  @Test("the device's own verdict badge is not mistaken for the metric's name")
  func verdictIsNotALabel() throws {
    // `A Niedrig` sits between the title and the value. It is the scale's own
    // band, not a guideline's, and the app quotes only ranges it can cite.
    let reading = try #require(DeviceScreen.read(Self.fatCard))

    #expect(reading.label == "Körperfett")
    #expect(reading.value == 10.6)
    #expect(reading.unitRaw == "kg")
  }

  @Test("the unit decides the code, on a scale's screen as everywhere else")
  func unitSelectsTheCode() throws {
    let mass = try #require(
      DeviceScreen.reports(from: [DeviceScreen.read(Self.fatCard)!]).first)
    #expect(mass.extraction.coded.first?.coding.loinc == "73708-0", "body fat as a mass")

    let percent = """
      Körperfett %
      14,8%
      Aktualisiert: Montag, 15. Juni 2026
      """
    let share = try #require(DeviceScreen.reports(from: [DeviceScreen.read(percent)!]).first)
    #expect(share.extraction.coded.first?.coding.loinc == "41982-0", "and as a proportion")
  }

  @Test("a metric printed as its own unit is read, BMI being the one")
  func bmiCard() throws {
    let card = """
      Body-Mass-Index
      23,8 BMI
      Aktualisiert: Montag, 15. Juni 2026
      """
    let report = try #require(DeviceScreen.reports(from: [DeviceScreen.read(card)!]).first)

    #expect(report.extraction.coded.first?.coding.loinc == "39156-5")
    #expect(report.extraction.coded.first?.coding.ucum == "kg/m2")
  }

  @Test("a reading with no LOINC code is kept, never coded as something else")
  func noCodeIsReported() throws {
    // A scale reports the ratio of extracellular to total body water, and
    // LOINC has no term for it. It used to be filed as an unknown analyte,
    // which lost it from the trends and the export. The dictionary now knows
    // the quantity and its unit while stating that no code applies, which is
    // a better answer than either a wrong code or nothing at all.
    let card = """
      ECW/TBW
      38,4%
      Aktualisiert: Donnerstag, 14. Mai 2026
      """
    let report = try #require(DeviceScreen.reports(from: [DeviceScreen.read(card)!]).first)
    let value = try #require(report.extraction.coded.first)

    #expect(report.extraction.unmapped.isEmpty)
    #expect(value.raw.label == "ECW/TBW")
    #expect(value.raw.value == 38.4)
    #expect(value.coding.ucum == "%")
    #expect(value.coding.loinc == nil)
    #expect(value.coding.uncodedReason?.isEmpty == false)
  }

  @Test("the device's own verdict never becomes part of the reading")
  func verdictBadgeIsStripped() throws {
    // Whether the badge gets its own line depends on how much of the screen
    // is in frame. A photo of the scale alone splits them; one that also
    // catches the phone's chrome merges them into `1,6 kg Normal`, and the
    // reading was lost entirely.
    let card = """
      Viszeralfett
      1,6 kg Normal
      Aktualisiert: Montag, 15. Juni 2026
      """
    let reading = try #require(DeviceScreen.read(card))
    #expect(reading.value == 1.6)
    #expect(reading.unitRaw == "kg")
    #expect(reading.label == "Viszeralfett")

    // And the badge is not mistaken for the metric's name when it does stand
    // on its own line.
    #expect(DeviceScreen.strippingVerdict("1,6 kg") == "1,6 kg")
    #expect(DeviceScreen.strippingVerdict("38,4 %") == "38,4 %")
  }

  @Test("cards from different days become different reports")
  func groupedByDay() {
    let readings = [DeviceScreen.read(Self.weightCard), DeviceScreen.read(Self.fatCard)]
      .compactMap { $0 }
    let reports = DeviceScreen.reports(from: readings)

    #expect(reports.count == 2, "14 May and 15 June are not one measurement")
    #expect(reports.first?.effectiveDate == ReportMetadataExtractor.day(2026, 6, 15), "newest first")
    #expect(reports.allSatisfy { $0.extraction.source == .selfTracked })
    #expect(reports.allSatisfy { $0.extraction.source.observationStatus == "preliminary" })
  }

  @Test("a lab sheet is never routed to this reader")
  func labSheetIsNotADeviceScreen() {
    let sheet = """
      Laborbefund
      MVZ Labor Musterstadt GmbH
      Entnahme: 12.09.2026
      LDL-Cholesterin  141  mg/dl  < 116
      """
    #expect(DeviceScreen.looksLikeDeviceScreen(sheet) == false)
    // And a card is recognised as one.
    #expect(DeviceScreen.looksLikeDeviceScreen(Self.weightCard))
  }
}

/// What a chart draws when no guideline band exists, and where a point came from.
@Suite("Trends: the laboratory's own range, and provenance per point")
struct TrendBandTests {

  static func report(
    day: Int, label: String, key: String, loinc: String, value: Double, unit: String,
    low: Double?, high: Double?, source: SourceKind = .labIssuedDigital, title: String
  ) -> LabReport {
    let date = ReportMetadataExtractor.day(2026, 3, day)!
    let coded = CodedLabValue(
      raw: RawLabValue(
        label: label, value: value, unitRaw: unit, referenceLow: low, referenceHigh: high,
        line: "\(label) \(value) \(unit)", lineNumber: 1),
      coding: AnalyteCoding(
        labelKey: Analytes.normaliseLabel(label), ucum: unit, loinc: loinc, display: label,
        analyteKey: key),
      source: source)
    return LabReport(
      id: UUID(), scannedAt: Date(), collectedOn: date, title: title,
      extraction: ExtractionResult(
        coded: [coded], unmapped: [], suspiciousLines: [], source: source),
      metadata: ReportMetadata(labDate: date, dateSource: .printed))
  }

  @Test("an analyte with no guideline band still has the laboratory's own range")
  func printedRangeIsAvailable() throws {
    // Sodium and MCH have no guideline target, only an assay's reference
    // interval, and that interval is on the report. A chart that drew nothing
    // for them would be blank for most of a blood count.
    let sodium = Self.report(
      day: 3, label: "Natrium", key: "sodium", loinc: "2951-2", value: 140, unit: "mmol/L",
      low: 136, high: 145, title: "March")
    let series = try #require(Trends.series(from: [sodium]).first)

    #expect(series.range == nil, "no guideline band is published for sodium")
    #expect(series.printedRange?.low == 136)
    #expect(series.printedRange?.high == 145)
    #expect(series.withinPrintedRange == true)
    #expect(series.placement == .noRange, "which is still not a judgement")
  }

  @Test("outside the laboratory's own range is stated as that, and nothing more")
  func outsidePrintedRange() throws {
    let mch = Self.report(
      day: 3, label: "MCH", key: "mch", loinc: "785-6", value: 34.2, unit: "pg",
      low: 27, high: 33.5, title: "March")
    let series = try #require(Trends.series(from: [mch]).first)

    #expect(series.withinPrintedRange == false)
    #expect(series.range == nil)
  }

  @Test("a value with no printed range and no published one says so")
  func neitherRange() throws {
    let series = try #require(
      Trends.series(from: [
        Self.report(
          day: 3, label: "MCH", key: "mch", loinc: "785-6", value: 32, unit: "pg", low: nil,
          high: nil, title: "March")
      ]).first)

    #expect(series.printedRange == nil)
    #expect(series.withinPrintedRange == nil)
  }

  @Test("every point knows the report it came from")
  func pointsCarryTheirReport() throws {
    // So a dot on a chart can be followed back to the document it was read
    // from, which is the only way to check a number against the paper.
    let march = Self.report(
      day: 3, label: "Natrium", key: "sodium", loinc: "2951-2", value: 140, unit: "mmol/L",
      low: 136, high: 145, title: "March")
    let june = Self.report(
      day: 20, label: "Natrium", key: "sodium", loinc: "2951-2", value: 142, unit: "mmol/L",
      low: 136, high: 145, source: .ocrTranscribed, title: "June")
    let series = try #require(Trends.series(from: [march, june]).first)

    #expect(series.points.map(\.reportId) == [march.id, june.id])
    #expect(series.points.map(\.reportTitle) == ["March", "June"])
    #expect(series.points.map(\.source) == [.labIssuedDigital, .ocrTranscribed])
    #expect(series.points.map(\.date) == [march.effectiveDate, june.effectiveDate])
  }

  @Test("every coded analyte can say what it measures")
  func descriptionsExist() {
    // A definition of the test, never a reading of the person's value.
    for key in Set(Analytes.codings.map(\.analyteKey)) {
      #expect(Analytes.descriptions[key] != nil, "\(key) has no description")
    }
    #expect(Analytes.descriptions["mch"]?.contains("red cell") == true)
    // And none of them interprets a result.
    for text in Analytes.descriptions.values {
      // Phrases that read the person's own result. "a high protein intake"
      // is about diet and stays; "a high value means" would be a finding.
      for forbidden in [
        "your value", "your result", "you should", "too high", "too low",
        "a high value", "a low value", "means you", "suggests you",
      ] {
        #expect(!text.lowercased().contains(forbidden), "\(forbidden) in: \(text)")
      }
    }
  }

  @Test("every definition exists in German too")
  func descriptionsAreTranslated() {
    // The generator refuses to emit when the two disagree, so this is the
    // same rule asserted on the shipped table: a German phone must not show
    // one English paragraph among the translated ones.
    #expect(Set(Analytes.descriptions.keys) == Set(Analytes.descriptionsDe.keys))
    for (key, german) in Analytes.descriptionsDe {
      #expect(german != Analytes.descriptions[key], "\(key) was not translated")
      #expect(german.count > 20, "\(key) German is too short to be a definition")
    }
    for text in Analytes.descriptionsDe.values {
      for forbidden in ["ihr wert", "sie sollten", "zu hoch", "zu niedrig", "auffällig"] {
        #expect(!text.lowercased().contains(forbidden), "\(forbidden) in: \(text)")
      }
    }
  }

  @Test("the reader's language picks the definition")
  func descriptionFollowsLanguage() {
    #expect(Analytes.description(of: "mch", language: "en-GB") == Analytes.descriptions["mch"])
    #expect(Analytes.description(of: "mch", language: "de-DE") == Analytes.descriptionsDe["mch"])
    // Austrian and Swiss German read the German sentence.
    #expect(Analytes.description(of: "ferritin", language: "de-CH")?.contains("Eisen") == true)
    // An analyte the dictionary does not describe has no sentence in either.
    #expect(Analytes.description(of: "not-an-analyte", language: "de-DE") == nil)
  }
}

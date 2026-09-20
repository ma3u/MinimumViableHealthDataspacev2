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
      waistCm: 94, weightKg: 81, visceralFatCm2: 72, heightCm: 180, profile: profile)
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
      waistCm: nil, weightKg: nil, visceralFatCm2: nil, heightCm: nil, profile: .empty)
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
        waistCm: 96, weightKg: nil, visceralFatCm2: nil, heightCm: nil, profile: profile),
      on: ReportMetadataExtractor.day(2026, 3, 3)!)!
    let june = BodyMeasurements.report(
      entries: BodyMeasurements.entries(
        waistCm: 92, weightKg: nil, visceralFatCm2: nil, heightCm: nil, profile: profile),
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

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

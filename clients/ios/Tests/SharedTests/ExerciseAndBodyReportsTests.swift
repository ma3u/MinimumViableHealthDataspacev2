import Foundation
import Testing

@testable import Shared

/// A performance diagnostics day: a DXA body composition scan, a bicycle
/// ergometry with ECG, a cardiopulmonary exercise test with spirometry, a
/// lactate test and a glucose sensor's daily pattern. The wording, layout
/// and recogniser quirks are real reports'; every value is invented and
/// satisfies the identities the readers check
/// (`Fixtures/exercise-and-body-reports.json`, README rule 1).
@Suite("Exercise tests, a DXA scan and a glucose sensor")
struct ExerciseAndBodyReportsTests {

  struct Fixture: Decodable {
    struct Lactate: Decodable {
      let blurredLetter: String
      let results: String
    }
    let dxa: [String]
    let ergometry: [String]
    let cpet: [String]
    let lactate: Lactate
    let agpSummary: String
  }

  static let fixture: Fixture = {
    let url = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
      .appendingPathComponent("Fixtures/exercise-and-body-reports.json")
    return try! JSONDecoder().decode(Fixture.self, from: Data(contentsOf: url))
  }()

  /// Label → value, and label + unit → LOINC code (or `uncoded`).
  private func read(_ values: [RawLabValue]) -> [String: Double] {
    Dictionary(values.map { ("\($0.label)|\($0.unitRaw)", $0.value) }) { a, _ in a }
  }

  private func codes(_ values: [RawLabValue]) -> [String: String] {
    let coded = PrintedFields.extraction(values, source: .ocrTranscribed)
    #expect(coded.unmapped.isEmpty, "\(coded.unmapped.map(\.raw.label))")
    return Dictionary(
      coded.coded.map { ("\($0.raw.label)|\($0.raw.unitRaw)", $0.coding.loinc ?? "uncoded") }
    ) { a, _ in a }
  }

  // MARK: - DXA

  @Test("a DXA scan's totals, regions, bone density and visceral fat, each checked")
  func dxa() {
    let values = BodyComposition.read(pageTexts: Self.fixture.dxa)
    let v = read(values)
    #expect(v["Körperfettanteil|%"] == 23.4)
    #expect(v["Körperfettmasse|kg"] == 14.28)
    #expect(v["Mager-Weichteilmasse|kg"] == 46.74)
    #expect(v["Knochenmineralgehalt|kg"] == 2.15)
    #expect(v["Android-Fettanteil|%"] == 28.1)
    #expect(v["Gynoid-Fettanteil|%"] == 20.8)
    #expect(v["Android/Gynoid-Verhältnis|{ratio}"] == 1.35)
    #expect(v["Viszerales Fett|kg"] == 0.508)
    #expect(v["Viszerales Fett|cm2"] == 57)
    #expect(v["Knochendichte Ganzkörper|g/cm2"] == 1.153)
    #expect(v["Knochendichte Ganzkörper, T-Wert|{SD}"] == -0.6)
    #expect(v["Knochendichte Ganzkörper, Z-Wert|{SD}"] == -0.2)
    #expect(v["Relativer Skelettmuskelindex|kg/m2"] == 7.85)
    #expect(v["Körpergröße|cm"] == 165)
    #expect(v["Körpergewicht|kg"] == 63.1)
    #expect(v["Body-Mass-Index|kg/m2"] == 23.2)
    // A misread row (`1,524` for a mass, `7,751`) is never taken for a total.
    #expect(values.count == 16)

    let c = codes(values)
    #expect(c["Körperfettanteil|%"] == "41982-0")
    #expect(c["Körperfettmasse|kg"] == "73708-0")
    #expect(c["Viszerales Fett|cm2"] == "73707-2")
    #expect(c["Mager-Weichteilmasse|kg"] == "uncoded")
  }

  @Test("a totals row whose masses do not add up is not read")
  func dxaInconsistent() {
    var pages = Self.fixture.dxa
    pages[0] = pages[0].replacingOccurrences(of: "14.280  46.740", with: "14.820  46.740")
    let v = read(BodyComposition.read(pageTexts: pages))
    #expect(v["Körperfettanteil|%"] == nil)
    #expect(v["Körperfettmasse|kg"] == nil)
    // The regions are their own rows and still read.
    #expect(v["Android-Fettanteil|%"] == 28.1)
  }

  @Test("a totals row whose bone column the recogniser lost still gives its fat and lean")
  func dxaWithoutBone() {
    let pages = Self.fixture.dxa.map {
      $0.replacingOccurrences(of: "46.740  2.150  63,2", with: "46.740  63,2")
        .replacingOccurrences(of: "7.620  241  9,9", with: "7.620  9,9")
    }
    let v = read(BodyComposition.read(pageTexts: pages))
    #expect(v["Körperfettanteil|%"] == 23.4)
    #expect(v["Mager-Weichteilmasse|kg"] == 46.74)
    #expect(v["Knochenmineralgehalt|kg"] == nil)
    #expect(v["Gynoid-Fettanteil|%"] == 20.8)
    #expect(v["Android/Gynoid-Verhältnis|{ratio}"] == 1.35)
  }

  @Test("a bone density row whose centile is not its Z-score's is not read")
  func dxaBoneCentile() {
    var pages = Self.fixture.dxa
    pages[2] = pages[2].replacingOccurrences(of: "-0,2  42", with: "-0,2  62")
    #expect(read(BodyComposition.read(pageTexts: pages))["Knochendichte Ganzkörper|g/cm2"] == nil)
  }

  @Test("the DXA reading replaces the prose the line grammar read as values")
  func dxaApplied() {
    let pages = Self.fixture.dxa
    let grammar = pages.map { LabLineParser.extract($0, source: .ocrTranscribed) }
      .reduce(ExtractionResult.empty(source: .ocrTranscribed)) { $0.merging($1) }
    let result = DocumentReaders.applied(to: grammar, pageTexts: pages, pages: [])
    #expect(result.coded.count == 16)
    #expect(result.unmapped.isEmpty)
    #expect(!result.coded.contains { $0.raw.line.contains("Rechteck") })
  }

  // MARK: - Ergometry

  @Test("an ergometry's peak load, rates, pressures and working capacity, cross-checked")
  func ergometry() {
    let values = ExerciseECG.read(pageTexts: Self.fixture.ergometry)
    let v = read(values)
    #expect(v["Maximale Belastung|watts"] == 225)
    #expect(v["Maximale Herzfrequenz unter Belastung|/min"] == 158)
    #expect(v["Systolischer Blutdruck unter Belastung, maximal|mmHg"] == 196)
    #expect(v["Diastolischer Blutdruck unter Belastung|mmHg"] == 88)
    #expect(v["Ruheherzfrequenz|/min"] == 71)
    #expect(v["Systolischer Blutdruck|mmHg"] == 124)
    #expect(v["Diastolischer Blutdruck|mmHg"] == 80)
    #expect(v["MET, maximal|{MET}"] == 11.4)
    #expect(v["Belastungsdauer|minutes"] == 11.87)
    #expect(v["PWC 170|watts"] == 200)
    #expect(v["PWC 150|watts"] == 170)
    #expect(v["PWC 130|watts"] == 132)
    #expect(v["Ventrikuläre Extrasystolen|{beats}"] == 2)
    #expect(v["Körpergewicht|kg"] == 68)
    #expect(v["Körpergröße|cm"] == 172)
    #expect(v["Body-Mass-Index|kg/m2"] == 22.99)

    let c = codes(values)
    #expect(c["Maximale Belastung|watts"] == "93342-4")
    #expect(c["Maximale Herzfrequenz unter Belastung|/min"] == "55422-0")
    #expect(c["Ruheherzfrequenz|/min"] == "40443-4")
    #expect(c["Systolischer Blutdruck unter Belastung, maximal|mmHg"] == "87739-9")
    #expect(c["Diastolischer Blutdruck unter Belastung|mmHg"] == "87740-7")
    #expect(c["Belastungsdauer|minutes"] == "55411-3")
    #expect(c["Systolischer Blutdruck|mmHg"] == "8480-6")
  }

  @Test("a peak rate the rate-pressure product contradicts is not read, nor its pressure")
  func ergometryProduct() {
    var pages = Self.fixture.ergometry
    pages[0] = pages[0].replacingOccurrences(of: "HFxBD, max.  30968", with: "HFxBD, max.  36968")
    let v = read(ExerciseECG.read(pageTexts: pages))
    #expect(v["Maximale Herzfrequenz unter Belastung|/min"] == nil)
    #expect(v["Systolischer Blutdruck unter Belastung, maximal|mmHg"] == nil)
    #expect(v["Maximale Belastung|watts"] == 225)
  }

  @Test("a peak load printed twice differently is not read")
  func ergometryLoad() {
    var pages = Self.fixture.ergometry
    pages[0] = pages[0].replacingOccurrences(of: "max. Last  225  W", with: "max. Last  275  W")
    #expect(read(ExerciseECG.read(pageTexts: pages))["Maximale Belastung|watts"] == nil)
  }

  // MARK: - Spiroergometry

  @Test("a CPET's sentences, checked against its tables")
  func cpet() {
    let values = CardiopulmonaryExercise.read(pageTexts: Self.fixture.cpet)
    let v = read(values)
    #expect(v["Forcierte Vitalkapazität|litres"] == 3.92)
    #expect(v["Einsekundenkapazität|litres"] == 3.21)
    #expect(v["FEV1/FVC|%"] == 81.9)
    #expect(v["FEF25-75|litres/s"] == 3.15)
    #expect(v["Peak Expiratory Flow|litres/s"] == 7.46)
    #expect(v["Maximale Sauerstoffaufnahme|ml/min"] == 2650)
    #expect(v["Maximale Sauerstoffaufnahme pro kg|ml/min/kg"] == 41.1)
    #expect(v["MET, maximal|{MET}"] == 11.7)
    #expect(v["Ruheherzfrequenz|/min"] == 72)
    #expect(v["Maximale Herzfrequenz unter Belastung|/min"] == 168)
    #expect(v["Herzfrequenzreserve|/min"] == 7)
    #expect(v["Sauerstoffpuls, maximal|ml/beat"] == 15.8)
    #expect(v["Erste ventilatorische Schwelle|ml/min"] == 1890)
    #expect(v["Erste ventilatorische Schwelle pro kg|ml/min/kg"] == 29.3)
    #expect(v["VE/VCO2-Steigung|{ratio}"] == 25.1)
    #expect(v["Atemreserve|%"] == 38.2)
    #expect(v["Atemminutenvolumen, maximal|l/min"] == 79.4)
    #expect(v["Respiratorischer Quotient, maximal|{ratio}"] == 1.08)
    #expect(v["Herzfrequenzerholung nach 1 Minute|/min"] == 31)
    #expect(v["VO2/Leistung-Steigung|ml/min/watts"] == 9.52)
    #expect(v["Systolischer Blutdruck|mmHg"] == 124)
    #expect(v["Diastolischer Blutdruck|mmHg"] == 80)
    #expect(v["Systolischer Blutdruck unter Belastung, maximal|mmHg"] == 196)
    #expect(v["Diastolischer Blutdruck unter Belastung|mmHg"] == 88)
    #expect(v["Maximale Belastung|watts"] == 225)
    #expect(v["Körpergewicht|kg"] == 64.5)
    #expect(v["Körpergröße|cm"] == 171)
    #expect(values.count == 27)

    let c = codes(values)
    #expect(c["Forcierte Vitalkapazität|litres"] == "19868-9")
    #expect(c["Einsekundenkapazität|litres"] == "20150-9")
    #expect(c["FEV1/FVC|%"] == "19926-5")
    #expect(c["Maximale Sauerstoffaufnahme|ml/min"] == "103749-8")
    #expect(c["Maximale Sauerstoffaufnahme pro kg|ml/min/kg"] == "94122-9")
    #expect(c["Sauerstoffpuls, maximal|ml/beat"] == "94120-3")
    #expect(c["Erste ventilatorische Schwelle pro kg|ml/min/kg"] == "94124-5")
  }

  @Test("a second reading of the tables: a lost label, columns run together")
  func cpetSecondReading() {
    let pages = Self.fixture.cpet.map {
      $0.replacingOccurrences(of: "Protokoll  Last  Watt", with: "Protokoll  Watt")
        .replacingOccurrences(of: "41,1  104  >21,5\n", with: "")
        .replacingOccurrences(of: "Stoffwechsel  11,7  104", with: "Stoffwechsel  11,9  11,7  9,6  104")
    }
    let v = read(CardiopulmonaryExercise.read(pageTexts: pages))
    #expect(v["Maximale Belastung|watts"] == 225)
    #expect(v["MET, maximal|{MET}"] == 11.7)
    // Not printed in this reading, so not read.
    #expect(v["Maximale Sauerstoffaufnahme pro kg|ml/min/kg"] == nil)
  }

  @Test("an FEV1/FVC that its two volumes contradict is not read")
  func cpetRatio() {
    let pages = Self.fixture.cpet.map { $0.replacingOccurrences(of: "81,9", with: "86,9") }
    let v = read(CardiopulmonaryExercise.read(pageTexts: pages))
    #expect(v["FEV1/FVC|%"] == nil)
    #expect(v["Forcierte Vitalkapazität|litres"] == 3.92)
  }

  @Test("an oxygen pulse that is not the uptake over the peak heart rate is not read")
  func cpetPulse() {
    var pages = Self.fixture.cpet
    pages[0] = pages[0].replacingOccurrences(of: "Sauerstoffpuls bei 15,8", with: "Sauerstoffpuls bei 18,5")
    #expect(read(CardiopulmonaryExercise.read(pageTexts: pages))["Sauerstoffpuls, maximal|ml/beat"] == nil)
  }

  // MARK: - Lactate test

  @Test("a lactate test's thresholds, each with its twin")
  func lactate() {
    let values = LactateTest.read(pageTexts: [Self.fixture.lactate.results])
    let v = read(values)
    #expect(v["Leistung an der individuellen anaeroben Schwelle|watts"] == 162)
    #expect(v["Leistung an der individuellen anaeroben Schwelle pro kg|watts/kg"] == 2.38)
    #expect(v["Laktat an der individuellen anaeroben Schwelle|mmol/l"] == 2.24)
    #expect(v["Herzfrequenz an der individuellen anaeroben Schwelle|/min"] == 152)
    #expect(v["Leistung an der Laktatschwelle|watts"] == 103.7)
    #expect(v["Laktat an der Laktatschwelle|mmol/l"] == 0.72)
    #expect(v["Herzfrequenz an der Laktatschwelle|/min"] == 124)
    #expect(v["Leistung bei 2 mmol/l Laktat|watts"] == 158.3)
    #expect(v["Herzfrequenz bei 2 mmol/l Laktat|/min"] == 149)
    #expect(v["Leistung bei 4 mmol/l Laktat|watts"] == 194.2)
    #expect(v["Herzfrequenz bei 4 mmol/l Laktat|/min"] == 165)
    #expect(v["Maximale glykolytische Leistung (VLaMax)|mmol/l/s"] == 0.31)
    #expect(v["Critical Power|watts"] == 188.5)
    #expect(v["Maximale Sauerstoffaufnahme (berechnet)|l/min"] == 3.12)
    #expect(v["Maximale Sauerstoffaufnahme pro kg (berechnet)|ml/min/kg"] == 45.9)
    #expect(v["Körpergewicht|kg"] == 68)
    #expect(values.count == 16)
    #expect(codes(values).values.filter { $0 != "uncoded" } == ["29463-7"])
  }

  @Test("a threshold power its power per kilogram contradicts is not read")
  func lactatePerKilogram() {
    let page = Self.fixture.lactate.results.replacingOccurrences(of: "IAS/kg  2.38", with: "IAS/kg  2.83")
    let v = read(LactateTest.read(pageTexts: [page]))
    #expect(v["Leistung an der individuellen anaeroben Schwelle|watts"] == nil)
    // The lactate threshold is checked against the anaerobic one, so it goes too.
    #expect(v["Leistung an der Laktatschwelle|watts"] == nil)
    #expect(v["Leistung bei 4 mmol/l Laktat|watts"] == 194.2)
  }

  // MARK: - Glucose sensor

  struct Layout: Decodable { let fragments: [DocumentReconciler.TextFragment] }

  static let glucose: [DocumentReconciler.TextFragment] = {
    let url = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
      .appendingPathComponent("Fixtures/glucose-daily-pattern-layout.json")
    return try! JSONDecoder().decode(Layout.self, from: Data(contentsOf: url)).fragments
  }()

  @Test("a glucose sensor's average, read by position on a page photographed across")
  func glucose() {
    let text = VisionDocumentReader.readingOrder(Self.glucose)
    let values = GlucoseProfile.read(pages: [(text, Self.glucose)])
    #expect(values.map(\.value) == [118])
    #expect(codes(values)["Durchschnittliche Glukose (Sensor)|mg/dL"] == "97507-8")
  }

  @Test("a number whose row of hourly values does not average near it is not the average")
  func glucoseRow() {
    let fragments = Self.glucose.map {
      $0.text == "118" ? DocumentReconciler.TextFragment(text: "180", region: $0.region) : $0
    }
    let text = VisionDocumentReader.readingOrder(fragments)
    #expect(GlucoseProfile.read(pages: [(text, fragments)]).isEmpty)
  }

  @Test("the sensor's measuring period dates the report, not the day it was printed")
  func glucoseDate() {
    let metadata = ReportMetadataExtractor.extract(
      pages: [VisionDocumentReader.readingOrder(Self.glucose)])
    #expect(metadata.labDate == ReportMetadataExtractor.day(2026, 3, 3))
    #expect(metadata.labDateRole == .collection)
    #expect(metadata.dates.contains { $0.date == ReportMetadataExtractor.day(2026, 3, 11) })
  }

  @Test("an AGP summary: the time in ranges, GMI, variability and wear time, coded")
  func agpSummary() {
    let values = GlucoseProfile.summary(pageTexts: [Self.fixture.agpSummary])
    let v = read(values)
    #expect(v["Zeit im Zielbereich|%"] == 86)
    #expect(v["Zeit über dem Zielbereich|%"] == 9)
    #expect(v["Zeit deutlich über dem Zielbereich|%"] == 1)
    #expect(v["Zeit unter dem Zielbereich|%"] == 3)
    #expect(v["Zeit deutlich unter dem Zielbereich|%"] == 1)
    #expect(v["Durchschnittliche Glukose (Sensor)|mg/dL"] == 128)
    #expect(v["Glukosemanagement-Indikator (GMI)|%"] == 6.4)
    #expect(v["Glukosevariabilität (VK)|%"] == 31.2)
    #expect(v["Standardabweichung der Glukose (Sensor)|mg/dL"] == 40)
    #expect(v["Sensor aktiv|%"] == 97.8)
    let c = codes(values)
    #expect(c["Zeit im Zielbereich|%"] == "97510-2")
    #expect(c["Zeit über dem Zielbereich|%"] == "104640-8")
    #expect(c["Zeit deutlich über dem Zielbereich|%"] == "104639-0")
    #expect(c["Zeit unter dem Zielbereich|%"] == "104641-6")
    #expect(c["Zeit deutlich unter dem Zielbereich|%"] == "104642-4")
    #expect(c["Glukosemanagement-Indikator (GMI)|%"] == "97506-0")
    #expect(c["Glukosevariabilität (VK)|%"] == "104638-2")
    #expect(c["Sensor aktiv|%"] == "104637-4")
    #expect(values.count == 10)
  }

  @Test("ranges that do not add up to 100 %, or a GMI that is not the mean's, are not read")
  func agpChecks() {
    let page = Self.fixture.agpSummary
      .replacingOccurrences(of: "70-180 mg/dL  86%", with: "70-180 mg/dL  68%")
      .replacingOccurrences(of: "(GMI)  6,4%", with: "(GMI)  7,4%")
    let v = read(GlucoseProfile.summary(pageTexts: [page]))
    #expect(v["Zeit im Zielbereich|%"] == nil)
    #expect(v["Zeit unter dem Zielbereich|%"] == nil)
    #expect(v["Glukosemanagement-Indikator (GMI)|%"] == nil)
    #expect(v["Durchschnittliche Glukose (Sensor)|mg/dL"] == 128)
  }

  @Test("with the summary page scanned too, its average is the report's, read once")
  func agpWithDailyPattern() {
    let daily = VisionDocumentReader.readingOrder(Self.glucose)
    let pages = [
      page(Self.fixture.agpSummary, confidence: 0.95),
      ScanDiagnostics.Page(
        page: 2, imageWidth: 1, imageHeight: 1, tableCount: 0, cells: [], fragments: Self.glucose,
        rows: [], orphanedFragments: Self.glucose, layout: nil, plainText: daily, recognitionSeconds: 0),
    ]
    let result = DocumentReaders.applied(
      to: .empty(source: .ocrTranscribed), pageTexts: pages.map(\.plainText), pages: pages)
    let means = result.coded.filter { $0.coding.loinc == "97507-8" }
    #expect(means.map(\.raw.value) == [128])
    #expect(result.coded.count == 10)
    #expect(ReportSuggestion.kind(of: result.coded) == "Glucose sensor")
  }

  // MARK: - A blurred page

  private func page(_ text: String, confidence: Double?, number: Int = 1) -> ScanDiagnostics.Page {
    let fragments = text.components(separatedBy: .newlines).enumerated().map { index, line in
      DocumentReconciler.TextFragment(
        text: line,
        region: SourceRegion(page: number, x: 0.1, y: 0.9 - Double(index) * 0.03, width: 0.5, height: 0.02),
        confidence: confidence)
    }
    return ScanDiagnostics.Page(
      page: number, imageWidth: 1, imageHeight: 1, tableCount: 0, cells: [], fragments: fragments,
      rows: [], orphanedFragments: fragments, layout: nil, plainText: text, recognitionSeconds: 0)
  }

  @Test("a page photographed out of focus is left out, and its wrong date with it")
  func blurredPage() {
    let letter = Self.fixture.lactate.blurredLetter
    // Repeated so the page has as many fragments as a real one.
    let blurred = page((0..<3).map { _ in letter }.joined(separator: "\n"), confidence: 0.3)
    let sharp = page(Self.fixture.lactate.results, confidence: 0.92, number: 2)
    #expect(PageQuality.isUnreadable(blurred))
    #expect(!PageQuality.isUnreadable(sharp))
    #expect(PageQuality.unreadablePages([blurred, sharp]) == [1])

    // Without confidences, as a record stored before they were kept: the
    // Cyrillic lines give it away.
    #expect(PageQuality.isUnreadable(page(letter, confidence: nil)))
    #expect(!PageQuality.isUnreadable(page(Self.fixture.lactate.results, confidence: nil)))

    let texts = PageQuality.readableTexts([blurred.plainText, sharp.plainText], pages: [blurred, sharp])
    let metadata = ReportMetadataExtractor.extract(pages: texts)
    #expect(!metadata.dates.contains { Calendar(identifier: .gregorian).component(.year, from: $0.date) == 2008 })
    #expect(metadata.labDate == ReportMetadataExtractor.day(2026, 5, 12))
    // `*01.01.1970` is a birth date.
    #expect(metadata.dates.contains { $0.role == .birth })
  }

  // MARK: - The issuer

  @Test("the issuer: a logo set over four lines, a column heading beside it, a licensee")
  func laboratory() {
    #expect(
      ReportMetadataExtractor.extract(pages: Self.fixture.dxa).laboratory
        == "MUSTER STIFTUNG Kardiologie Prevention Center Nord")
    #expect(
      ReportMetadataExtractor.extract(pages: Self.fixture.cpet).laboratory
        == "Praxis Muster - Sportmedizin Nord")
    #expect(
      ReportMetadataExtractor.extract(pages: Self.fixture.ergometry).laboratory
        == "Praxis Muster - Sportmedizin")
  }

  // MARK: - Export

  @Test("an ergometry that counted ectopic beats is not exported as an ECG")
  func notAnECG() {
    let values = PrintedFields.extraction(
      ExerciseECG.read(pageTexts: Self.fixture.ergometry), source: .ocrTranscribed
    ).coded
    #expect(!FhirWriter.isElectrocardiogram(values))
    #expect(FhirWriter.isElectrocardiogram(values.filter { $0.coding.loinc == "76126-2" }))
    let dxa = PrintedFields.extraction(
      BodyComposition.read(pageTexts: Self.fixture.dxa), source: .ocrTranscribed
    ).coded
    #expect(dxa.contains { FhirWriter.category($0) == "imaging" })
  }
}

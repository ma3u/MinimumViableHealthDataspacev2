import Foundation
import Testing

@testable import Shared

/// A resting 12-lead ECG printout, three pages, photographed turned by a
/// quarter. The geometry and the recogniser's quirks are one real
/// printout's; every measurement, date, identifier and device name is
/// invented (`Fixtures/ecg-12-lead-layout.json`, README rule 1): rate 62,
/// PQ 148, QRS 98, QT/QTc 392/398, axes -12 / 41 / 18.
@Suite("A 12-lead ECG printout")
struct ElectrocardiogramTests {

  private struct Fixture: Decodable {
    struct Page: Decodable {
      let page: Int
      let fragments: [DocumentReconciler.TextFragment]
    }
    let pages: [Page]
  }

  static let pages: [ScanDiagnostics.Page] = {
    let url = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
      .appendingPathComponent("Fixtures/ecg-12-lead-layout.json")
    let fixture = try! JSONDecoder().decode(Fixture.self, from: Data(contentsOf: url))
    return fixture.pages.map {
      ScanDiagnostics.Page(
        page: $0.page, imageWidth: 1, imageHeight: 1, tableCount: 0, cells: [],
        fragments: $0.fragments, rows: [], orphanedFragments: $0.fragments, layout: nil,
        plainText: VisionDocumentReader.readingOrder($0.fragments), recognitionSeconds: 0)
    }
  }()

  private func read(_ pages: [ScanDiagnostics.Page]) -> [String: Double] {
    let values = Electrocardiogram.read(pages: pages.map { ($0.plainText, $0.fragments) })
    return Dictionary(values.map { ($0.label, $0.value) }) { a, _ in a }
  }

  @Test("reads every measurement the pages agree on, through a quarter-turned photograph")
  func threePages() {
    let values = read(Self.pages)
    #expect(values["Ventrikuläre Frequenz"] == 62)
    #expect(values["PQ-Intervall"] == 148)
    #expect(values["QRS-Dauer"] == 98)
    #expect(values["QT-Intervall"] == 392)
    // Page 2 read 598; pages 1 and 3 read 398, and Bazett agrees with them.
    #expect(values["QTc nach Bazett"] == 398)
    // Page 2 read `-41`, the minus of the lost P axis; pages 1 and 3 read 41.
    #expect(values["QRS-Achse"] == 41)
    #expect(values["T-Achse"] == 18)
    // No page read the P axis, and it is not invented.
    #expect(values["P-Achse"] == nil)
  }

  @Test("codes each value with its LOINC ECG term, and leaves nothing of the block unread")
  func coded() {
    let sheet = Self.pages.reduce(ExtractionResult.empty(source: .ocrTranscribed)) {
      $0.merging(ScanReplay.run($1))
    }
    let result = Electrocardiogram.applied(
      to: sheet, pageTexts: Self.pages.map(\.plainText), pages: Self.pages)
    let codes = Dictionary(result.coded.map { ($0.raw.label, $0.coding.loinc ?? "") }) { a, _ in a }
    #expect(codes["Ventrikuläre Frequenz"] == "8897-1")
    #expect(codes["PQ-Intervall"] == "8625-6")
    #expect(codes["QRS-Dauer"] == "8633-0")
    #expect(codes["QT-Intervall"] == "8634-8")
    #expect(codes["QTc nach Bazett"] == "76635-2")
    #expect(codes["QRS-Achse"] == "8632-2")
    #expect(codes["T-Achse"] == "8638-9")
    #expect(result.coded.count == 7)
    #expect(result.unmapped.isEmpty)
    #expect(result.suspiciousLines.isEmpty, "\(result.suspiciousLines)")
  }

  @Test("one page alone is read as it stands")
  func onePage() {
    let values = read([Self.pages[0]])
    #expect(values["Ventrikuläre Frequenz"] == 62)
    #expect(values["QT-Intervall"] == 392)
    #expect(values["QTc nach Bazett"] == 398)
    #expect(values["QRS-Achse"] == 41)
  }

  @Test("refuses QT and QTc that Bazett's formula contradicts, and keeps the rest")
  func bazett() {
    // Page 2 alone: its QTc of 598 is not 392 / sqrt(60/62).
    let values = read([Self.pages[1]])
    #expect(values["QT-Intervall"] == nil)
    #expect(values["QTc nach Bazett"] == nil)
    #expect(values["Ventrikuläre Frequenz"] == 62)
    #expect(values["QRS-Dauer"] == 98)
  }

  @Test("refuses a value two pages read differently with no majority")
  func noMajority() {
    func replacing(_ page: ScanDiagnostics.Page, _ old: String, _ new: String) -> ScanDiagnostics.Page {
      let fragments = page.fragments.map {
        $0.text == old ? DocumentReconciler.TextFragment(text: new, region: $0.region) : $0
      }
      return ScanDiagnostics.Page(
        page: page.page, imageWidth: 1, imageHeight: 1, tableCount: 0, cells: [],
        fragments: fragments, rows: [], orphanedFragments: fragments, layout: nil,
        plainText: VisionDocumentReader.readingOrder(fragments), recognitionSeconds: 0)
    }
    let first = Self.pages[0]
    let second = replacing(Self.pages[2], "98", "96")
    let values = read([first, second])
    #expect(values["QRS-Dauer"] == nil)
    #expect(values["PQ-Intervall"] == 148)
  }

  @Test("reads an upright printout too, axes told apart by the value column")
  func upright() {
    func f(_ text: String, _ x: Double, _ y: Double, _ w: Double) -> DocumentReconciler.TextFragment {
      DocumentReconciler.TextFragment(
        text: text, region: SourceRegion(page: 1, x: x, y: y, width: w, height: 0.012))
    }
    // Labels at the left, values right-aligned at x = 0.40, units after.
    let fragments = [
      f("Vent. rate", 0.10, 0.90, 0.10), f("62", 0.38, 0.90, 0.02), f("BPM", 0.42, 0.90, 0.03),
      f("PR-Intervall", 0.10, 0.88, 0.12), f("148", 0.37, 0.88, 0.03), f("ms", 0.42, 0.88, 0.02),
      f("QRS-Dauer", 0.10, 0.86, 0.10), f("98", 0.38, 0.86, 0.02), f("ms", 0.42, 0.86, 0.02),
      f("QT/QTc-Baz", 0.10, 0.84, 0.11), f("392/398", 0.33, 0.84, 0.07), f("ms", 0.42, 0.84, 0.02),
      f("P-R-T Achsen", 0.10, 0.82, 0.12), f("-12", 0.33, 0.82, 0.03), f("41", 0.38, 0.82, 0.02),
      f("18", 0.42, 0.82, 0.02),
    ]
    let text = VisionDocumentReader.readingOrder(fragments)
    let values = Dictionary(
      Electrocardiogram.read(pages: [(text, fragments)]).map { ($0.label, $0.value) }
    ) { a, _ in a }
    #expect(values["Ventrikuläre Frequenz"] == 62)
    #expect(values["QTc nach Bazett"] == 398)
    #expect(values["P-Achse"] == -12)
    #expect(values["QRS-Achse"] == 41)
    #expect(values["T-Achse"] == 18)
  }

  @Test("a lab report is not taken for an ECG")
  func notAnECG() {
    #expect(!Electrocardiogram.looksLike("Natrium 140 mmol/l\nKalium 4,1 mmol/l\nQuick 98 %"))
  }
}

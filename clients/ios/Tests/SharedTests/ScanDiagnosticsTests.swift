import Foundation
import Testing

@testable import Shared

/// A scan's diagnostics record must be enough to run the pipeline again.
///
/// This is the whole point of keeping it: the first real sheet (#186) left 26
/// lines "unread" and no way to find out why, because nothing but the
/// outcome had been kept.
@Suite("Scan diagnostics: recorded, replayed, round-tripped")
struct ScanDiagnosticsTests {

  static func cell(_ text: String, row: Int, column: Int) -> DocumentReconciler.Cell {
    DocumentReconciler.Cell(
      text: text,
      region: SourceRegion(
        page: 1, x: Double(column) * 0.25, y: 0.9 - Double(row) * 0.05, width: 0.24, height: 0.04),
      row: row, column: column)
  }

  static let table: [[String]] = [
    ["Analyt", "Ergebnis", "Einheit", "Referenzbereich"],
    ["LDL-Cholesterin", "141", "mg/dl", "< 116"],
    ["HbA1c", "5,4", "", "4,0 - 6,0"],
    ["Kreatinin", "0,92", "mg/dl", "0,70 - 1,20"],
    ["Hamoglobin", "15,7", "g/dl", "13,5 - 17,5"],
  ]

  /// A page the way the phone would record it: the table pass dropped the
  /// `%`, the text pass read it, and a footer sits in no cell at all.
  static var page: ScanDiagnostics.Page {
    var cells: [DocumentReconciler.Cell] = []
    for (row, texts) in table.enumerated() {
      for (column, text) in texts.enumerated() {
        cells.append(cell(text, row: row, column: column))
      }
    }
    let fragments = [
      DocumentReconciler.TextFragment(
        text: "%", region: SourceRegion(page: 1, x: 0.55, y: 0.81, width: 0.03, height: 0.02),
        confidence: 0.9),
      DocumentReconciler.TextFragment(
        text: "Seite 1 von 1",
        region: SourceRegion(page: 1, x: 0.4, y: 0.05, width: 0.2, height: 0.02),
        confidence: 0.99),
    ]
    let reconciled = DocumentReconciler.reconcile(cells: cells, fragments: fragments)
    return ScanDiagnostics.Page(
      page: 1, imageWidth: 1240, imageHeight: 1754, tableCount: 1, cells: cells,
      fragments: fragments, rows: reconciled.rows,
      orphanedFragments: reconciled.orphanedFragments,
      layout: TableRoles.infer(rows: reconciled.rows.map { $0.cells.map(\.text) }),
      plainText: table.map { $0.joined(separator: "  ") }.joined(separator: "\n"),
      recognitionSeconds: 0.4)
  }

  static var diagnostics: ScanDiagnostics {
    let page = page
    return ScanDiagnostics(
      reportId: UUID(uuidString: "00000000-0000-0000-0000-00000000D1A6")!,
      createdAt: Date(timeIntervalSince1970: 1_789_000_000),
      environment: ScanDiagnostics.Environment(
        appVersion: "1.0", build: "7", systemName: "iOS", systemVersion: "26.6.2",
        deviceModel: "iPhone18,1"),
      pages: [page],
      extraction: ScanReplay.run(page),
      metadata: ReportMetadataExtractor.extract(pages: [page.plainText]))
  }

  @Test("the replay reproduces the extraction from the raw passes alone")
  func replayFromRawPasses() {
    let result = ScanReplay.run(Self.page)
    let codes = Set(result.coded.map(\.coding.loinc))

    #expect(codes.contains("2089-1"), "LDL from a plain row")
    #expect(codes.contains("4548-4"), "HbA1c only codes if the recovered % reached the parser")
    #expect(codes.contains("2160-0"))
    #expect(codes.contains("718-7"), "Hamoglobin without its umlaut, through the loose key")
    #expect(result.unmapped.isEmpty)
    #expect(result.suspiciousLines.isEmpty, "a page footer is not a measurement")
  }

  @Test("the record states the layout the parser used")
  func layoutIsRecorded() throws {
    let layout = try #require(Self.page.layout)
    #expect(layout.label == 0)
    #expect(layout.value == 1)
    #expect(layout.unit == 2)
    #expect(layout.reference == 3)
  }

  @Test("the record survives the JSON the export writes and the replay tool reads")
  func roundTrip() throws {
    let original = Self.diagnostics
    let data = try DiagnosticsBundle.encoder().encode(original)
    let decoded = try DiagnosticsBundle.decoder().decode(ScanDiagnostics.self, from: data)

    #expect(decoded == original)
    #expect(ScanReplay.run(decoded) == original.extraction)
  }

  @Test("a stored report from before metadata existed still decodes")
  func oldRecordDecodes() throws {
    // The shape `StoredReport` had at the first device build: no metadata, no
    // page text, no scan. A person's records must not become unreadable
    // because the app was updated.
    let old = """
      {"id":"00000000-0000-0000-0000-0000000000A1","scannedAt":780000000,
       "title":"Old","extraction":{"coded":[],"unmapped":[],"suspiciousLines":[],
       "source":"ocr-transcribed"}}
      """
    let report = try JSONDecoder().decode(LabReport.self, from: Data(old.utf8))

    #expect(report.title == "Old")
    #expect(report.metadata == .empty)
    #expect(report.pageTexts.isEmpty)
    #expect(report.scan == nil)
    #expect(report.dateIsScanFallback)
    #expect(report.effectiveDate == report.scannedAt)
  }
}

/// Reading a stored report again, after the parser has improved.
@Suite("Re-reading a stored report")
struct ReextractionTests {

  @Test("a record written before the resolution was recorded still decodes")
  func attachmentWithoutResolution() throws {
    let old = """
      {"id":"00000000-0000-0000-0000-0000000000B1","scannedAt":780000000,"title":"Old",
       "extraction":{"coded":[],"unmapped":[],"suspiciousLines":[],"source":"ocr-transcribed"},
       "scan":{"pageCount":2,"bytes":1234,"contentType":"application/pdf"}}
      """
    let report = try JSONDecoder().decode(LabReport.self, from: Data(old.utf8))

    #expect(report.scan?.pageCount == 2)
    #expect(report.scan?.sourcePixelWidth == nil, "absent, so a re-read falls back")
  }

  @Test("the resolution a scan was read at is what a re-read should use")
  func resolutionRoundTrips() throws {
    let attachment = LabReport.ScanAttachment(
      pageCount: 1, bytes: 400_000, sourcePixelWidth: 1206)
    let data = try JSONEncoder().encode(attachment)
    let decoded = try JSONDecoder().decode(LabReport.ScanAttachment.self, from: data)

    #expect(decoded.sourcePixelWidth == 1206)

    // Measured on a real practice printout: rasterising its stored PDF at a
    // fixed 300 dpi upsamples a 1206 pixel photograph to 2479 and reads
    // worse, 11 coded values against 19. The page is 595 points wide, so the
    // resolution that reproduces the original is what the record now carries.
    let dpi = Double(decoded.sourcePixelWidth!) / (ScanDocument.pageWidth / 72.0)
    #expect(abs(dpi - 146.0) < 1.0, "got \(dpi)")
  }
}

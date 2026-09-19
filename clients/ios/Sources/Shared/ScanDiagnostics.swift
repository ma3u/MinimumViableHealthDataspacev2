import Foundation

/// Everything one scan produced, at every stage, so it can be replayed.
///
/// The first real report (#186) coded 2 rows of 41 and left 26 lines marked
/// "unread" with no way to learn why: the OCR output had been consumed and
/// thrown away, and the paper was the only copy. This record keeps what both
/// Vision passes saw, what the reconciler made of it, which column layout was
/// inferred, and what came out, so the parser and the dictionary can be
/// improved on a Mac against the real sheet without scanning it again.
///
/// It is health data in full and is sealed in the store like a report. It
/// leaves the phone only inside a diagnostics export the person triggers.
public struct ScanDiagnostics: Sendable, Equatable, Codable {

  public struct Environment: Sendable, Equatable, Codable {
    public let appVersion: String
    public let build: String
    public let systemName: String
    public let systemVersion: String
    public let deviceModel: String
    /// Size of the analyte table the scan was coded against, so a replay
    /// with a newer table can say what changed.
    public let dictionaryCodings: Int
    public let dictionaryUnits: Int

    public init(
      appVersion: String, build: String, systemName: String, systemVersion: String,
      deviceModel: String, dictionaryCodings: Int = Analytes.codings.count,
      dictionaryUnits: Int = Analytes.unitMap.count
    ) {
      self.appVersion = appVersion
      self.build = build
      self.systemName = systemName
      self.systemVersion = systemVersion
      self.deviceModel = deviceModel
      self.dictionaryCodings = dictionaryCodings
      self.dictionaryUnits = dictionaryUnits
    }
  }

  public struct Page: Sendable, Equatable, Codable {
    public let page: Int
    public let imageWidth: Int
    public let imageHeight: Int
    public let tableCount: Int
    /// The table pass, raw.
    public let cells: [DocumentReconciler.Cell]
    /// The text pass, raw.
    public let fragments: [DocumentReconciler.TextFragment]
    /// What the reconciler produced from the two.
    public let rows: [DocumentReconciler.Row]
    public let orphanedFragments: [DocumentReconciler.TextFragment]
    /// The column layout the parser inferred, or nil when it fell back to the
    /// line grammar. The single most useful field when a whole page failed.
    public let layout: TableRoles.Layout?
    public let plainText: String
    public let recognitionSeconds: Double

    public init(
      page: Int, imageWidth: Int, imageHeight: Int, tableCount: Int,
      cells: [DocumentReconciler.Cell], fragments: [DocumentReconciler.TextFragment],
      rows: [DocumentReconciler.Row], orphanedFragments: [DocumentReconciler.TextFragment],
      layout: TableRoles.Layout?, plainText: String, recognitionSeconds: Double
    ) {
      self.page = page
      self.imageWidth = imageWidth
      self.imageHeight = imageHeight
      self.tableCount = tableCount
      self.cells = cells
      self.fragments = fragments
      self.rows = rows
      self.orphanedFragments = orphanedFragments
      self.layout = layout
      self.plainText = plainText
      self.recognitionSeconds = recognitionSeconds
    }
  }

  public let reportId: UUID
  public let createdAt: Date
  public let environment: Environment
  public let pages: [Page]
  /// What the phone extracted at scan time, for comparison with a replay.
  public let extraction: ExtractionResult
  public let metadata: ReportMetadata

  public init(
    reportId: UUID, createdAt: Date, environment: Environment, pages: [Page],
    extraction: ExtractionResult, metadata: ReportMetadata
  ) {
    self.reportId = reportId
    self.createdAt = createdAt
    self.environment = environment
    self.pages = pages
    self.extraction = extraction
    self.metadata = metadata
  }

  /// Builds a page record from a reading and infers the layout the parser
  /// would use, so the record states it rather than leaving it to be guessed.
  public static func page(
    _ reading: VisionDocumentReader.PageReading, page: Int, seconds: Double
  ) -> Page {
    Page(
      page: page, imageWidth: reading.imageWidth, imageHeight: reading.imageHeight,
      tableCount: reading.tableCount, cells: reading.cells, fragments: reading.fragments,
      rows: reading.rows, orphanedFragments: reading.orphanedFragments,
      layout: TableRoles.infer(rows: reading.rows.map { $0.cells.map(\.text) }),
      plainText: reading.plainText, recognitionSeconds: seconds)
  }
}

/// Re-runs the Vision-free half of the pipeline from a diagnostics record.
///
/// Reconciliation, layout inference, parsing and coding all take the raw cells
/// and fragments as input, so a Mac with a newer dictionary or parser can
/// reproduce, and improve on, what the phone did with the same sheet.
public enum ScanReplay {

  public static func run(_ page: ScanDiagnostics.Page, source: SourceKind = .ocrTranscribed)
    -> ExtractionResult
  {
    // A page imported from a PDF's own text layer has no Vision passes to
    // reconcile, only the laboratory's own characters. Replaying it is
    // re-parsing that text, which is exactly what the import did.
    if page.cells.isEmpty && page.fragments.isEmpty {
      return LabLineParser.extract(page.plainText, source: source)
    }
    let reconciled = DocumentReconciler.reconcile(cells: page.cells, fragments: page.fragments)
    if reconciled.rows.isEmpty {
      return LabLineParser.extract(
        VisionDocumentReader.readingOrder(page.fragments), source: source)
    }
    var result = LabLineParser.extract(rows: reconciled.rows, source: source)
    let leftovers = VisionDocumentReader.readingOrder(reconciled.orphanedFragments)
    if !leftovers.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
      result = result.merging(LabLineParser.extract(leftovers, source: source))
    }
    return result
  }

  public static func run(_ diagnostics: ScanDiagnostics) -> ExtractionResult {
    // The provenance is the record's own, never assumed: replaying a
    // lab-issued document as if it had been photographed would downgrade every
    // value from final to preliminary.
    let source = diagnostics.extraction.source
    return diagnostics.pages.reduce(ExtractionResult.empty(source: source)) {
      $0.merging(run($1, source: source))
    }
  }
}

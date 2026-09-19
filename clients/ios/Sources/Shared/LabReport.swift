import Foundation

/// One scanned report as it is stored: what was read, what the sheet says
/// about itself, and what else is kept next to it.
///
/// Lives in `Shared` rather than in the app so a diagnostics export can be
/// decoded on a Mac by the replay tool, and so the tests can build one.
///
/// Records written before a field existed still decode: every field added
/// after the first release is optional or defaulted in `init(from:)`. A
/// person's stored reports must never become unreadable because the app was
/// updated.
public struct LabReport: Codable, Sendable, Identifiable, Equatable {

  /// The original pages, kept as one PDF next to the values.
  public struct ScanAttachment: Codable, Sendable, Equatable {
    public let pageCount: Int
    public let bytes: Int
    public let contentType: String

    public init(pageCount: Int, bytes: Int, contentType: String = "application/pdf") {
      self.pageCount = pageCount
      self.bytes = bytes
      self.contentType = contentType
    }
  }

  public let id: UUID
  public let scannedAt: Date
  /// The report's own date, confirmed by the person. Nil only for records
  /// saved before dates were read from the sheet.
  public var collectedOn: Date?
  public var title: String
  public let extraction: ExtractionResult
  public var metadata: ReportMetadata
  /// Everything both recognisers read, one string per page in reading order.
  /// The values above are a view of this; the text itself is what is kept.
  public var pageTexts: [String]
  public var scan: ScanAttachment?
  public var hasDiagnostics: Bool

  public init(
    id: UUID, scannedAt: Date, collectedOn: Date?, title: String,
    extraction: ExtractionResult, metadata: ReportMetadata = .empty,
    pageTexts: [String] = [], scan: ScanAttachment? = nil, hasDiagnostics: Bool = false
  ) {
    self.id = id
    self.scannedAt = scannedAt
    self.collectedOn = collectedOn
    self.title = title
    self.extraction = extraction
    self.metadata = metadata
    self.pageTexts = pageTexts
    self.scan = scan
    self.hasDiagnostics = hasDiagnostics
  }

  /// The date the report is filed and plotted under.
  public var effectiveDate: Date { collectedOn ?? scannedAt }

  /// True when the scan date is standing in for a lab date nobody confirmed.
  public var dateIsScanFallback: Bool { collectedOn == nil }

  private enum CodingKeys: String, CodingKey {
    case id, scannedAt, collectedOn, title, extraction, metadata, pageTexts, scan, hasDiagnostics
  }

  public init(from decoder: Decoder) throws {
    let c = try decoder.container(keyedBy: CodingKeys.self)
    id = try c.decode(UUID.self, forKey: .id)
    scannedAt = try c.decode(Date.self, forKey: .scannedAt)
    collectedOn = try c.decodeIfPresent(Date.self, forKey: .collectedOn)
    title = try c.decode(String.self, forKey: .title)
    extraction = try c.decode(ExtractionResult.self, forKey: .extraction)
    metadata = try c.decodeIfPresent(ReportMetadata.self, forKey: .metadata) ?? .empty
    pageTexts = try c.decodeIfPresent([String].self, forKey: .pageTexts) ?? []
    scan = try c.decodeIfPresent(ScanAttachment.self, forKey: .scan)
    hasDiagnostics = try c.decodeIfPresent(Bool.self, forKey: .hasDiagnostics) ?? false
  }
}

import CoreGraphics
import Foundation
import ImageIO

#if canImport(PDFKit)
  import PDFKit
#endif

/// Turns a file the person already holds into the same result a scan produces.
///
/// Scanning is the main path because most people hold paper (#186), but not
/// everyone does: a laboratory may send a PDF by mail, a portal may offer a
/// download, and a photograph may already be in the library. Those are the
/// **better** inputs, and refusing them would be perverse.
///
/// One rule decides everything here. **A PDF with its own text layer carries
/// the laboratory's characters, not our guess**, so it is `lab-issued-digital`
/// and its values are `final`. A PDF of photographs, or an image, has to go
/// through the recogniser, so it is `ocr-transcribed` and `preliminary`
/// (ADR-033 rule 4). The two are told apart by looking, never by the file
/// extension: a scanner's PDF and a laboratory's PDF have the same one.
public enum LabImport {

  /// Everything one import produced, whatever the input was.
  public struct Result: Sendable {
    public let extraction: ExtractionResult
    public let metadata: ReportMetadata
    /// The text of each page, in reading order.
    public let pageTexts: [String]
    /// The document as it will be stored: the original PDF when there was one,
    /// otherwise the images assembled into one.
    public let pdf: Data
    public let pages: [ScanDiagnostics.Page]
    /// Further reports the same import produced, for other measurement dates.
    ///
    /// A scale's screens are photographed several at a time and a scale
    /// updates its metrics at different times, so one import can carry two
    /// days. They are separate reports because they are separate days.
    public let extraReports: [LabReport]
    /// What to call this report, when the document says. The laboratory that
    /// issued it, or the kind of screen it came from.
    public let suggestedTitle: String?
    public var source: SourceKind { extraction.source }

    /// The widest page's pixel width, when the pages were recognised as
    /// images. Nil for a text-layer import, which has no resolution.
    public var sourcePixelWidth: Int? {
      let widths = pages.map(\.imageWidth).filter { $0 > 0 }
      return widths.max()
    }

    public init(
      extraction: ExtractionResult, metadata: ReportMetadata, pageTexts: [String], pdf: Data,
      pages: [ScanDiagnostics.Page], extraReports: [LabReport] = [],
      suggestedTitle: String? = nil
    ) {
      self.extraction = extraction
      self.metadata = metadata
      self.pageTexts = pageTexts
      self.pdf = pdf
      self.pages = pages
      self.extraReports = extraReports
      self.suggestedTitle = suggestedTitle
    }
  }

  public enum ImportError: Error, LocalizedError {
    case unreadable(String)
    case unsupported(String)
    case nothingRecognised
    case notALabReport

    public var errorDescription: String? {
      switch self {
      case .unreadable(let name):
        return String(localized: "\(name) could not be opened.")
      case .unsupported(let ext):
        return String(localized: "\(ext) files are not supported. Use a PDF or a photo.")
      case .nothingRecognised:
        return String(localized: "No text could be read from this document.")
      case .notALabReport:
        return String(
          localized:
            "This reads as an article rather than a lab report: pages of sentences and no table of values. Nothing was stored, because the few numbers in it are parts of sentences, not measurements."
        )
      }
    }
  }

  /// File types the picker offers, lowercased.
  public static let readableExtensions = ["pdf", "png", "jpg", "jpeg", "heic", "heif", "tiff", "tif"]

  // MARK: - Entry points

  /// Imports a file the person picked.
  public static func file(at url: URL, dpi: CGFloat = 300) async throws -> Result {
    guard let data = try? Data(contentsOf: url) else {
      throw ImportError.unreadable(url.lastPathComponent)
    }
    return try await self.data(data, fileExtension: url.pathExtension, name: url.lastPathComponent)
  }

  /// Imports bytes the app has already read.
  ///
  /// Separate from `file(at:)` because a file picked on iOS lives behind a
  /// security-scoped URL: the app opens the scope, reads, and closes it, and
  /// what survives is the data.
  public static func data(
    _ data: Data, fileExtension: String, name: String = "document", dpi: CGFloat = 300
  ) async throws -> Result {
    let ext = fileExtension.lowercased()
    guard readableExtensions.contains(ext) else { throw ImportError.unsupported(ext) }
    if ext == "pdf" { return try await pdf(data, dpi: dpi) }
    guard let image = decodeImage(data) else { throw ImportError.unreadable(name) }
    return try await images([image])
  }

  /// Imports a PDF: its own text layer when it has one, the recogniser when it
  /// does not.
  public static func pdf(_ data: Data, dpi: CGFloat = 300) async throws -> Result {
    if let texts = textLayer(of: data) {
      Log.scan.notice(
        "pdf has a text layer: \(texts.count, privacy: .public) page(s), lab-issued")
      return try fromText(texts, pdf: data)
    }
    Log.scan.notice("pdf has no usable text layer, recognising the pages")
    let pageCount = ScanDocument.pageCount(of: data)
    guard pageCount > 0 else { throw ImportError.unreadable("PDF") }
    let rendered = (1...pageCount).compactMap { ScanDocument.rasterise(data, page: $0, dpi: dpi) }
    guard !rendered.isEmpty else { throw ImportError.unreadable("PDF") }
    // The original file is kept as the document, rather than the rasterised
    // copy: it is what the laboratory sent and what a doctor should receive.
    return try await images(rendered, keeping: data)
  }

  /// Recognises photographed or rasterised pages.
  public static func images(_ images: [CGImage], keeping original: Data? = nil) async throws
    -> Result
  {
    var merged = ExtractionResult.empty(source: .ocrTranscribed)
    var pageTexts: [String] = []
    var pages: [ScanDiagnostics.Page] = []

    for (index, image) in images.enumerated() {
      let started = Date()
      let reading = try await VisionDocumentReader.read(image, page: index + 1)
      let seconds = Date().timeIntervalSince(started)
      pageTexts.append(reading.plainText)
      pages.append(ScanDiagnostics.page(reading, page: index + 1, seconds: seconds))
      Log.scan.info(
        "page \(index + 1, privacy: .public): \(reading.tableCount, privacy: .public) table(s), \(reading.rows.count, privacy: .public) rows, \(reading.fragments.count, privacy: .public) fragments, \(reading.orphanedFragments.count, privacy: .public) orphans, \(seconds, format: .fixed(precision: 2), privacy: .public) s"
      )

      if reading.rows.isEmpty {
        merged = merged.merging(LabLineParser.extract(reading.plainText, source: .ocrTranscribed))
        continue
      }
      merged = merged.merging(LabLineParser.extract(rows: reading.rows, source: .ocrTranscribed))
      let leftovers = VisionDocumentReader.readingOrder(reading.orphanedFragments)
      if !leftovers.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
        merged = merged.merging(LabLineParser.extract(leftovers, source: .ocrTranscribed))
      }
    }

    let document = try original ?? ScanDocument.pdf(pages: images)
    return try finish(
      extraction: merged, pageTexts: pageTexts, pdf: document, pages: pages, images: images)
  }

  // MARK: - The text-layer path

  /// The text of each page, or nil when the file has no usable text layer.
  ///
  /// A scanner's PDF often carries a few stray characters, so a non-empty text
  /// layer is not by itself evidence. What distinguishes a laboratory's own
  /// document is text on most pages, and digits: a lab report without digits is
  /// not a lab report. Getting this wrong in the permissive direction is the
  /// serious one, because it would mark an OCR transcription `final`.
  public static func textLayer(of data: Data) -> [String]? {
    #if canImport(PDFKit)
      guard let document = PDFDocument(data: data), document.pageCount > 0 else { return nil }
      var texts: [String] = []
      var digits = 0
      var characters = 0
      for index in 0..<document.pageCount {
        let text = document.page(at: index)?.string ?? ""
        texts.append(text)
        characters += text.count
        digits += text.filter(\.isNumber).count
      }
      let pagesWithText = texts.filter { $0.count >= 40 }.count
      guard characters >= 100 * document.pageCount, digits >= 10,
        pagesWithText * 2 >= document.pageCount
      else { return nil }
      return texts
    #else
      return nil
    #endif
  }

  static func fromText(_ texts: [String], pdf: Data) throws -> Result {
    var merged = ExtractionResult.empty(source: .labIssuedDigital)
    var pages: [ScanDiagnostics.Page] = []
    for (index, text) in texts.enumerated() {
      merged = merged.merging(LabLineParser.extract(text, source: .labIssuedDigital))
      // No Vision pass ran, so the record carries the text and nothing else.
      // `ScanReplay` falls back to it, which keeps a text-layer import as
      // replayable as a scan.
      pages.append(
        ScanDiagnostics.Page(
          page: index + 1, imageWidth: 0, imageHeight: 0, tableCount: 0, cells: [], fragments: [],
          rows: [], orphanedFragments: [], layout: nil, plainText: text, recognitionSeconds: 0))
    }
    return try finish(extraction: merged, pageTexts: texts, pdf: pdf, pages: pages)
  }

  /// Whether a document is prose rather than a report.
  ///
  /// A five-page article about diet and the microbiome yielded two
  /// measurements: `Quark mit 20 %` from a meal plan, and `5 %` from the tail
  /// of a sentence about a study. Neither is a measurement of anything, and a
  /// health record that accepts them is worse than one that accepts nothing.
  ///
  /// A lab sheet is short lines in columns. An article is long sentences. The
  /// two are told apart by how much of the page reads as prose and by how
  /// little of it yields values: a real report that this refused would have to
  /// be both almost entirely sentences and almost entirely without results.
  static func looksLikeProse(_ pageTexts: [String], values: Int) -> Bool {
    guard values <= 3 else { return false }
    let lines =
      pageTexts
      .flatMap { $0.components(separatedBy: .newlines) }
      .map { $0.trimmingCharacters(in: .whitespaces) }
      .filter { $0.count > 2 }
    guard lines.count >= 20 else { return false }

    // A sentence is long and made of words. Measured on three real documents
    // and one article: the aminogram scores 0.00, a laboratory's own PDF
    // 0.06, and a five-page piece of dietary advice 0.44. A quarter sits far
    // from both, so a real report would have to become seven times more
    // wordy before this refused it.
    let sentences = lines.filter { line in
      line.count > 60 && line.split(separator: " ").count >= 9
    }
    return Double(sentences.count) / Double(lines.count) > 0.25
  }

  // MARK: - Shared tail

  private static func finish(
    extraction: ExtractionResult, pageTexts: [String], pdf: Data, pages: [ScanDiagnostics.Page],
    images: [CGImage] = []
  ) throws -> Result {
    // A body-composition scale's screen is not a lab sheet and has its own
    // reader. It is tried only when the ordinary parse found no values, so a
    // report that happens to carry the word "aktualisiert" is unaffected.
    if extraction.coded.isEmpty {
      // Both the value the screen names and the year of them it draws. The
      // plotted ones carry a month, not a day, and say so.
      var readings: [DeviceScreen.Reading] = []
      for (index, text) in pageTexts.enumerated() where DeviceScreen.looksLikeDeviceScreen(text) {
        let fragments = index < pages.count ? pages[index].fragments : []
        let image = index < images.count ? images[index] : nil
        guard
          let read = DeviceScreen.read(
            text, fragments: fragments, image: image, page: index + 1)
        else { continue }
        readings.append(read.current)
        readings.append(contentsOf: read.history)
      }
      let reports = DeviceScreen.reports(from: readings)
      if let first = reports.first {
        Log.scan.notice(
          "device screen: \(readings.count, privacy: .public) reading(s) on \(reports.count, privacy: .public) day(s)"
        )
        return Result(
          extraction: first.extraction, metadata: first.metadata, pageTexts: pageTexts, pdf: pdf,
          pages: pages, extraReports: Array(reports.dropFirst()), suggestedTitle: first.title)
      }
    }

    // An article is refused rather than mined for the numbers inside its
    // sentences. Checked after the scale's screens, which are short lines and
    // never look like prose, and only when almost nothing was extracted.
    let found = extraction.coded.count + extraction.unmapped.count
    if looksLikeProse(pageTexts, values: found) {
      Log.scan.notice(
        "import refused: reads as prose, \(found, privacy: .public) stray value(s) ignored")
      throw ImportError.notALabReport
    }

    let metadata = ReportMetadataExtractor.extract(pages: pageTexts)
    let dateRole = metadata.labDate == nil ? "not found" : (metadata.labDateRole?.rawValue ?? "found")
    Log.scan.notice(
      "import complete: \(extraction.source.rawValue, privacy: .public), \(extraction.coded.count, privacy: .public) coded, \(extraction.unmapped.count, privacy: .public) unmapped, \(extraction.suspiciousLines.count, privacy: .public) unread, lab date \(dateRole, privacy: .public), pdf \(pdf.count, privacy: .public) bytes"
    )
    return Result(
      extraction: extraction, metadata: metadata, pageTexts: pageTexts, pdf: pdf, pages: pages,
      suggestedTitle: metadata.laboratory)
  }

  public static func decodeImage(_ data: Data) -> CGImage? {
    guard let source = CGImageSourceCreateWithData(data as CFData, nil) else { return nil }
    return CGImageSourceCreateImageAtIndex(source, 0, nil)
  }
}

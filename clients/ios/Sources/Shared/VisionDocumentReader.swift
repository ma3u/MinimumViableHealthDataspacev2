import CoreGraphics
import Foundation
import Vision

/// Runs both Vision passes over a page and hands the result to the reconciler.
///
/// The two requests are independent, so they run concurrently: on a multi-page
/// scan the table pass is the slower of the two and waiting for it twice over
/// would be the whole cost of the hybrid.
///
/// Both passes are configured identically and deliberately:
///
/// - **Language correction off.** A model that "corrects" `Lp(a)`, or a German
///   decimal comma, is actively harmful on a lab sheet. This is the same
///   decision the text-only path already made, repeated here so the two passes
///   cannot disagree because of it.
/// - **German and English.** German sheets carry English analyte names.
///
/// Nothing here reaches the network. Both requests are on-device.
public enum VisionDocumentReader {

  public struct PageReading: Sendable {
    public let rows: [DocumentReconciler.Row]
    public let orphanedFragments: [DocumentReconciler.TextFragment]
    /// Every fragment the text pass found, in reading order. Used as the
    /// fallback when a page holds no table at all.
    public let plainText: String
    public let tableCount: Int
    /// What the table pass saw, before reconciliation. Kept so a scan can be
    /// replayed on a Mac from its diagnostics record without the image.
    public let cells: [DocumentReconciler.Cell]
    /// What the text pass saw, before reconciliation. Same reason.
    public let fragments: [DocumentReconciler.TextFragment]
    public let imageWidth: Int
    public let imageHeight: Int

    public var repairedCellCount: Int {
      rows.reduce(0) { $0 + $1.cells.filter { $0.origin != .document }.count }
    }
  }

  private static let languages = [
    Locale.Language(identifier: "de-DE"),
    Locale.Language(identifier: "en-US"),
  ]

  /// Reads one page. `page` is 1-based and is stamped onto every region.
  public static func read(_ image: CGImage, page: Int) async throws -> PageReading {
    async let tables = recogniseTables(image, page: page)
    async let fragments = recogniseFragments(image, page: page)
    let (cells, tableCount) = try await tables
    let text = try await fragments

    let result = DocumentReconciler.reconcile(cells: cells, fragments: text)
    return PageReading(
      rows: result.rows,
      orphanedFragments: result.orphanedFragments,
      plainText: readingOrder(text),
      tableCount: tableCount,
      cells: cells,
      fragments: text,
      imageWidth: image.width,
      imageHeight: image.height
    )
  }

  // MARK: - The table pass

  private static func recogniseTables(
    _ image: CGImage, page: Int
  ) async throws -> ([DocumentReconciler.Cell], Int) {
    var request = RecognizeDocumentsRequest()
    request.textRecognitionOptions.recognitionLanguages = languages
    request.textRecognitionOptions.useLanguageCorrection = false

    let observations = try await request.perform(on: image)

    var cells: [DocumentReconciler.Cell] = []
    var tableCount = 0
    // Row indices are made unique across tables on the page, so two tables
    // never collapse into each other when the rows are regrouped.
    var rowOffset = 0

    for observation in observations {
      for table in observation.document.tables {
        tableCount += 1
        var maxRow = 0
        for (rowIndex, row) in table.rows.enumerated() {
          for cell in row {
            let column = cell.columnRange.lowerBound
            cells.append(
              DocumentReconciler.Cell(
                text: cell.content.text.transcript,
                region: region(cell.content.boundingRegion, page: page),
                row: rowOffset + rowIndex,
                column: column
              ))
          }
          maxRow = Swift.max(maxRow, rowIndex)
        }
        rowOffset += maxRow + 1
      }
    }
    return (cells, tableCount)
  }

  // MARK: - The text pass

  /// Deliberately the **legacy** `VNRecognizeTextRequest`, not the Swift
  /// `RecognizeTextRequest` that replaced it.
  ///
  /// This is not nostalgia, it is the measurement the hybrid rests on. On the
  /// synthetic German lab sheet in `VisionDocumentReaderTests`, asked for the
  /// same row:
  ///
  ///     legacy VNRecognizeTextRequest   'HbA1c' '5,4' '%' '4,0 - 6,0'
  ///     Swift RecognizeTextRequest      'HbA1c' '5,4'     '4,0 - 6,0'
  ///
  /// The new stack drops the lone `%`, with or without language pinning, and
  /// `RecognizeDocumentsRequest` sits on that same stack so it drops it too.
  /// The old engine reads it. Since the unit selects the LOINC code, `%` is
  /// 4548-4 and `mmol/mol` is 59261-8, that single character decides whether
  /// an HbA1c row can be coded at all.
  ///
  /// So the two passes are not two views of one engine, they are two engines,
  /// and that is the whole reason reconciling them recovers anything.
  ///
  /// The risk this accepts: `VNRecognizeTextRequest` is superseded and could be
  /// removed in a future SDK. `hbA1cSurvivesWithItsUnit` asserts the outcome
  /// rather than the mechanism, so it will fail loudly if that happens, and it
  /// will pass without changes if the new stack is fixed and this is swapped
  /// back.
  private static func recogniseFragments(
    _ image: CGImage, page: Int
  ) async throws -> [DocumentReconciler.TextFragment] {
    let bands = bandCount(for: image)
    guard bands > 1 else { return try recogniseBand(image, page: page) }

    // Overlapping bands, so a line sitting on a boundary is read whole in at
    // least one of them.
    var collected: [DocumentReconciler.TextFragment] = []
    let height = Double(image.height)
    let bandHeight = height / Double(bands)
    let overlap = bandHeight * 0.12
    for index in 0..<bands {
      let top = max(0, Double(index) * bandHeight - overlap)
      let bottom = min(height, Double(index + 1) * bandHeight + overlap)
      let rect = CGRect(x: 0, y: top, width: Double(image.width), height: bottom - top)
      guard let cropped = image.cropping(to: rect) else { continue }
      let fragments = try recogniseBand(cropped, page: page)
      // Vision's origin is the bottom left of whatever it was given, so a
      // band's coordinates have to be lifted back onto the whole page. Getting
      // this wrong puts a citation on a different analyte, which on a lab sheet
      // is a different test.
      let scale = rect.height / height
      let offset = (height - rect.maxY) / height
      collected.append(
        contentsOf: fragments.map { fragment in
          DocumentReconciler.TextFragment(
            text: fragment.text,
            region: SourceRegion(
              page: page,
              x: fragment.region.x,
              y: offset + fragment.region.y * scale,
              width: fragment.region.width,
              height: fragment.region.height * scale),
            confidence: fragment.confidence)
        })
    }
    return deduplicated(collected)
  }

  /// How many horizontal bands a page should be read in.
  ///
  /// Vision works on a downsampled copy, so on a tall image small print falls
  /// below what it can resolve. Measured on a photograph holding **two A4
  /// pages in one file** (#186, 1206x2098): the whole image yielded 152
  /// fragments and 7 decimal values, its top half alone 165 fragments and 12.
  /// The result column of the upper page was not read at all, and not one
  /// value on the sheet could be coded.
  ///
  /// A4 is 1.41 tall, and a hand-held photograph of one page stays near that,
  /// so anything meaningfully taller is more page than Vision is being given
  /// credit for. An ordinary single page is unaffected, which keeps the skew
  /// and degradation measurements in `ScanningTests` comparable.
  static func bandCount(for image: CGImage) -> Int {
    guard image.width > 0 else { return 1 }
    let aspect = Double(image.height) / Double(image.width)
    guard aspect > 1.5 else { return 1 }
    return min(6, Int((aspect / 1.2).rounded(.up)))
  }

  /// Drops the duplicates the overlap produces, keeping the more confident.
  static func deduplicated(_ fragments: [DocumentReconciler.TextFragment])
    -> [DocumentReconciler.TextFragment]
  {
    var kept: [DocumentReconciler.TextFragment] = []
    for fragment in fragments.sorted(by: { ($0.confidence ?? 0) > ($1.confidence ?? 0) }) {
      let duplicate = kept.contains { other in
        other.text == fragment.text
          && abs(other.region.midY - fragment.region.midY)
            < max(other.region.height, fragment.region.height)
          && abs(other.region.midX - fragment.region.midX)
            < max(other.region.width, fragment.region.width)
      }
      if !duplicate { kept.append(fragment) }
    }
    return kept
  }

  /// Reads one small part of a page again, enlarged.
  ///
  /// A body-composition scale prints its value axis as single digits a few
  /// pixels tall. The ordinary pass walks straight past them, and without the
  /// axis a chart has no scale, so its points cannot be turned into values at
  /// all. Cropping that strip and enlarging it four times over gives the
  /// recogniser something it can read, and the coordinates are mapped back so
  /// the rest of the pipeline never knows the difference.
  public static func reread(
    _ image: CGImage, x: Double, y: Double, width: Double, height: Double,
    page: Int, magnification: Int = 6
  ) -> [DocumentReconciler.TextFragment] {
    let pixelWidth = Int(Double(image.width) * width)
    let pixelHeight = Int(Double(image.height) * height)
    guard pixelWidth > 8, pixelHeight > 8 else { return [] }
    // Vision's y counts from the bottom; a CGImage crop counts from the top.
    let crop = CGRect(
      x: Double(image.width) * x, y: Double(image.height) * (1 - y - height),
      width: Double(pixelWidth), height: Double(pixelHeight))
    guard let cut = image.cropping(to: crop) else { return [] }

    let bigWidth = pixelWidth * magnification
    let bigHeight = pixelHeight * magnification
    guard
      let context = CGContext(
        data: nil, width: bigWidth, height: bigHeight, bitsPerComponent: 8, bytesPerRow: 0,
        space: CGColorSpaceCreateDeviceGray(), bitmapInfo: CGImageAlphaInfo.none.rawValue)
    else { return [] }
    context.interpolationQuality = .high
    context.draw(cut, in: CGRect(x: 0, y: 0, width: bigWidth, height: bigHeight))
    guard var enlarged = context.makeImage() else { return [] }
    // A value axis is printed light grey on white. Enlarging it does not make
    // it darker, and the recogniser walks past faint digits whatever size
    // they are, so the crop's own range is stretched to black and white.
    if let stretched = contrastStretched(enlarged, width: bigWidth, height: bigHeight) {
      enlarged = stretched
    }

    let found = (try? recogniseBand(enlarged, page: page)) ?? []
    return found.map { fragment in
      DocumentReconciler.TextFragment(
        text: fragment.text,
        region: SourceRegion(
          page: page,
          x: x + fragment.region.x * width,
          y: y + fragment.region.y * height,
          width: fragment.region.width * width,
          height: fragment.region.height * height),
        confidence: fragment.confidence)
    }
  }

  /// Pulls the darkest tenth of a crop to black and the lightest to white.
  private static func contrastStretched(_ image: CGImage, width: Int, height: Int) -> CGImage? {
    var pixels = [UInt8](repeating: 0, count: width * height)
    guard
      let reader = CGContext(
        data: &pixels, width: width, height: height, bitsPerComponent: 8, bytesPerRow: width,
        space: CGColorSpaceCreateDeviceGray(), bitmapInfo: CGImageAlphaInfo.none.rawValue)
    else { return nil }
    reader.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))

    var sorted = pixels
    sorted.sort()
    guard sorted.count > 100 else { return nil }
    let dark = Double(sorted[sorted.count / 10])
    let light = Double(sorted[sorted.count * 9 / 10])
    guard light - dark > 4 else { return nil }
    for index in pixels.indices {
      let scaled = (Double(pixels[index]) - dark) / (light - dark) * 255
      pixels[index] = UInt8(max(0, min(255, scaled)))
    }
    guard
      let writer = CGContext(
        data: &pixels, width: width, height: height, bitsPerComponent: 8, bytesPerRow: width,
        space: CGColorSpaceCreateDeviceGray(), bitmapInfo: CGImageAlphaInfo.none.rawValue)
    else { return nil }
    return writer.makeImage()
  }

  private static func recogniseBand(
    _ image: CGImage, page: Int
  ) throws -> [DocumentReconciler.TextFragment] {
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.usesLanguageCorrection = false
    request.recognitionLanguages = languages.map(\.maximalIdentifier)

    try VNImageRequestHandler(cgImage: image, options: [:]).perform([request])

    return (request.results ?? []).compactMap { observation in
      guard let candidate = observation.topCandidates(1).first else { return nil }
      let box = observation.boundingBox
      return DocumentReconciler.TextFragment(
        text: candidate.string,
        region: SourceRegion(
          page: page, x: box.origin.x, y: box.origin.y, width: box.width, height: box.height),
        confidence: Double(candidate.confidence)
      )
    }
  }

  // MARK: - Helpers

  private static func region(_ normalised: NormalizedRegion, page: Int) -> SourceRegion {
    let box = normalised.boundingBox
    return SourceRegion(
      page: page,
      x: box.origin.x,
      y: box.origin.y,
      width: box.width,
      height: box.height
    )
  }

  /// How close two fragments must be vertically to belong to the same row.
  ///
  /// A fixed fraction of the image height cannot be right for every input, and
  /// getting it wrong loses whole columns. Measured on a photograph of a
  /// practice-software printout holding **two pages in one image** (#186): at
  /// the old fixed 0.01, one page's line spacing was smaller than the
  /// tolerance, neighbouring rows merged, and the result column ended up on
  /// the wrong line for most of the sheet. Not one value was coded.
  ///
  /// The scale-free answer is the text itself: a line is about as tall as the
  /// characters on it, so the median fragment height is the unit to measure in,
  /// whatever the page count or the resolution. The bounds keep a page of
  /// enormous headings or of noise from producing something absurd.
  static func rowTolerance(_ fragments: [DocumentReconciler.TextFragment]) -> Double {
    let heights = fragments.map(\.region.height).filter { $0 > 0 }.sorted()
    guard !heights.isEmpty else { return 0.01 }
    let median = heights[heights.count / 2]
    return min(0.012, max(0.002, median * 0.6))
  }

  /// Groups fragments into lines the way the text-only path does.
  ///
  /// Only used when a page has no table. Vision returns text in reading order
  /// but without column structure, so without this an analyte, its value and
  /// its unit arrive as three separate lines and the grammar sees no
  /// measurement at all.
  public static func readingOrder(
    _ fragments: [DocumentReconciler.TextFragment], tolerance: Double? = nil
  ) -> String {
    let tolerance = tolerance ?? rowTolerance(fragments)
    var rows: [(y: Double, parts: [(x: Double, text: String)])] = []
    for fragment in fragments.sorted(by: { $0.region.midY > $1.region.midY }) {
      let y = fragment.region.midY
      if let index = rows.firstIndex(where: { abs($0.y - y) < tolerance }) {
        rows[index].parts.append((fragment.region.x, fragment.text))
      } else {
        rows.append((y, [(fragment.region.x, fragment.text)]))
      }
    }
    return rows
      .map { $0.parts.sorted { $0.x < $1.x }.map(\.text).joined(separator: "  ") }
      .joined(separator: "\n")
  }
}

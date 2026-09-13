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
      tableCount: tableCount
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

  /// Groups fragments into lines the way the text-only path does.
  ///
  /// Only used when a page has no table. Vision returns text in reading order
  /// but without column structure, so without this an analyte, its value and
  /// its unit arrive as three separate lines and the grammar sees no
  /// measurement at all.
  public static func readingOrder(
    _ fragments: [DocumentReconciler.TextFragment], tolerance: Double = 0.01
  ) -> String {
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

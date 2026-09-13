import SwiftUI
import Shared
import Vision
import VisionKit

/// VisionKit document scanner, bridged into SwiftUI.
///
/// Edge detection and perspective correction come free, and matter: a
/// hand-held photograph of a lab sheet parses far worse than a corrected scan.
struct DocumentScanner: UIViewControllerRepresentable {
  let onScan: ([UIImage]) -> Void
  let onCancel: () -> Void

  func makeUIViewController(context: Context) -> VNDocumentCameraViewController {
    let controller = VNDocumentCameraViewController()
    controller.delegate = context.coordinator
    return controller
  }

  func updateUIViewController(_ controller: VNDocumentCameraViewController, context: Context) {}

  func makeCoordinator() -> Coordinator { Coordinator(self) }

  final class Coordinator: NSObject, VNDocumentCameraViewControllerDelegate {
    private let parent: DocumentScanner
    init(_ parent: DocumentScanner) { self.parent = parent }

    func documentCameraViewController(
      _ controller: VNDocumentCameraViewController,
      didFinishWith scan: VNDocumentCameraScan
    ) {
      let pages = (0..<scan.pageCount).map { scan.imageOfPage(at: $0) }
      parent.onScan(pages)
    }

    func documentCameraViewControllerDidCancel(_ controller: VNDocumentCameraViewController) {
      parent.onCancel()
    }

    func documentCameraViewController(
      _ controller: VNDocumentCameraViewController, didFailWithError error: Error
    ) {
      parent.onCancel()
    }
  }
}

/// On-device OCR. Nothing leaves the phone.
enum TextRecognizer {

  /// Recognises every page and extracts, stamping OCR provenance.
  ///
  /// The hybrid of `VisionDocumentReader`: the table pass supplies row
  /// boundaries and a rectangle per row, the text pass supplies characters the
  /// table pass dropped, and `DocumentReconciler` decides between them. See
  /// that type for the measured reason neither pass is sufficient alone.
  ///
  /// Three things can happen to a page, and all three are handled rather than
  /// assumed away:
  ///
  /// 1. It has a table. Rows are parsed with their geometry.
  /// 2. It has a table, and text outside it. The leftovers are parsed too: a
  ///    fragment in no cell is where a second panel or a failed layout hides,
  ///    and it cannot duplicate a row because it belonged to no cell.
  /// 3. It has no table at all, for example a free-text doctor's letter. The
  ///    page falls back to the text-only path, which is what shipped before
  ///    this and is still the right answer for prose.
  ///
  /// A photographed report is `ocrTranscribed`, never `labIssuedDigital`, so
  /// every value it produces is `preliminary`.
  static func extract(from images: [UIImage]) async throws -> ExtractionResult {
    var merged = ExtractionResult.empty(source: .ocrTranscribed)

    for (index, image) in images.enumerated() {
      guard let cgImage = image.cgImage else { continue }
      let reading = try await VisionDocumentReader.read(cgImage, page: index + 1)

      if reading.rows.isEmpty {
        merged = merged.merging(
          LabLineParser.extract(reading.plainText, source: .ocrTranscribed))
        continue
      }

      merged = merged.merging(
        LabLineParser.extract(rows: reading.rows, source: .ocrTranscribed))

      let leftovers = VisionDocumentReader.readingOrder(reading.orphanedFragments)
      if !leftovers.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
        merged = merged.merging(
          LabLineParser.extract(leftovers, source: .ocrTranscribed))
      }
    }

    return merged
  }
}

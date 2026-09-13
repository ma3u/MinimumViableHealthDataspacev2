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

  /// Recognises German and English text and returns it as lines.
  ///
  /// `.accurate` with language correction off: a lab sheet is a table of
  /// analyte names and numbers, and a language model that "corrects" `Lp(a)`
  /// or a decimal comma is actively harmful here.
  static func recognise(_ image: UIImage) async throws -> String {
    guard let cgImage = image.cgImage else { return "" }

    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.usesLanguageCorrection = false
    request.recognitionLanguages = ["de-DE", "en-US"]

    let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
    try handler.perform([request])

    guard let observations = request.results else { return "" }

    // Vision returns observations in reading order but without column structure.
    // Group by vertical position so a table row stays one line, otherwise the
    // analyte, its value and its unit arrive as three separate lines and the
    // line grammar cannot see a measurement at all.
    let lines = observations.compactMap { obs -> (y: CGFloat, x: CGFloat, text: String)? in
      guard let candidate = obs.topCandidates(1).first else { return nil }
      return (obs.boundingBox.midY, obs.boundingBox.minX, candidate.string)
    }

    let tolerance: CGFloat = 0.01
    var rows: [(y: CGFloat, parts: [(x: CGFloat, text: String)])] = []
    for line in lines.sorted(by: { $0.y > $1.y }) {
      if let index = rows.firstIndex(where: { abs($0.y - line.y) < tolerance }) {
        rows[index].parts.append((line.x, line.text))
      } else {
        rows.append((line.y, [(line.x, line.text)]))
      }
    }

    return rows
      .map { row in
        row.parts.sorted { $0.x < $1.x }.map(\.text).joined(separator: "  ")
      }
      .joined(separator: "\n")
  }

  /// Recognises every page and extracts, stamping OCR provenance.
  ///
  /// A photographed report is `ocrTranscribed`, never `labIssuedDigital`:
  /// so every value it produces is `preliminary`.
  static func extract(from images: [UIImage]) async throws -> ExtractionResult {
    var text = ""
    for image in images {
      text += try await recognise(image) + "\n"
    }
    return LabLineParser.extract(text, source: .ocrTranscribed)
  }
}

import PDFKit
import SwiftUI

/// The original pages, as scanned.
///
/// Every value the app shows is a reading of these pages, and the pages are
/// what a doubtful reading is checked against. Read-only: there is nothing to
/// annotate, and a scan that could be edited would no longer be the original.
struct ScanViewer: View {
  let pdf: Data
  let onClose: () -> Void

  var body: some View {
    NavigationStack {
      PDFDocumentView(data: pdf)
        .ignoresSafeArea(edges: .bottom)
        .navigationTitle("Original scan")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
          ToolbarItem(placement: .confirmationAction) { Button("Done", action: onClose) }
        }
    }
  }
}

private struct PDFDocumentView: UIViewRepresentable {
  let data: Data

  func makeUIView(context: Context) -> PDFView {
    let view = PDFView()
    view.autoScales = true
    view.displayMode = .singlePageContinuous
    view.displayDirection = .vertical
    view.document = PDFDocument(data: data)
    return view
  }

  func updateUIViewController(_ view: PDFView, context: Context) {}
  func updateUIView(_ view: PDFView, context: Context) {}
}

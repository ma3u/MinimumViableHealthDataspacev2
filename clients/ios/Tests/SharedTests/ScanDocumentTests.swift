#if canImport(CoreImage)
  import CoreGraphics
  import Foundation
  import Testing

  @testable import Shared

  /// The scan is kept as a PDF and must come back out readable.
  @Suite("The scan kept as a PDF", .serialized)
  struct ScanDocumentTests {

    @Test("pages round-trip through the PDF with their shape intact")
    func roundTrip() throws {
      let page = SyntheticSheet.render(.clean)
      let pdf = try ScanDocument.pdf(pages: [page, page])

      #expect(ScanDocument.pageCount(of: pdf) == 2)
      #expect(
        pdf.count < 2_000_000,
        "two A4 pages should stay well under the ePA's 25 MB, got \(pdf.count) bytes")

      let back = try #require(ScanDocument.rasterise(pdf, page: 1, dpi: 100))
      let aspect = Double(back.height) / Double(back.width)
      #expect(abs(aspect - 1754.0 / 1240.0) < 0.01, "the page kept its proportions")
    }

    @Test("a scan with no pages is refused rather than written empty")
    func emptyIsRefused() {
      #expect(throws: ScanDocument.DocumentError.self) {
        try ScanDocument.pdf(pages: [])
      }
    }

    @Test("an oversized page is brought down to 300 dpi of A4, a smaller one is left alone")
    func downscaling() throws {
      let huge = SyntheticSheet.render(SyntheticSheet.Condition(name: "huge", scale: 3))
      #expect(huge.height > 3508)
      let scaled = try ScanDocument.downscaled(huge, maxLongSide: 3508)
      #expect(scaled.height == 3508)

      let normal = SyntheticSheet.render(.clean)
      let untouched = try ScanDocument.downscaled(normal, maxLongSide: 3508)
      #expect(untouched.width == normal.width && untouched.height == normal.height)
    }

    #if canImport(Vision)
      /// The reason the PDF is worth keeping: the recogniser can be run on it
      /// again, on a Mac, after the parser or the OS changed.
      @Test("the recogniser reads the stored PDF as well as the original")
      func rereadFromPDF() async throws {
        let pdf = try ScanDocument.pdf(pages: [SyntheticSheet.render(.clean)])
        let page = try #require(ScanDocument.rasterise(pdf, page: 1, dpi: 300))
        let reading = try await VisionDocumentReader.read(page, page: 1)
        let result = LabLineParser.extract(rows: reading.rows, source: .ocrTranscribed)

        #expect(
          result.coded.count >= 7,
          "expected most of the 8-row panel from the PDF, got \(result.coded.count)")
      }
    #endif
  }
#endif

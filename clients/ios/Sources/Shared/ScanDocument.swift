import CoreGraphics
import Foundation
import ImageIO

/// Turns scanned pages into one PDF, and a PDF back into pages.
///
/// The scan is the source of truth for every value the app holds, and the
/// first real scan (#186) threw it away once OCR had run. A value the reviewer
/// doubts can then only be checked against the paper, and a parser that failed
/// on the sheet cannot be run on it again. So the pages are kept, as a PDF,
/// because that is the format the ePA takes and the format a person can open
/// anywhere, and they are stored sealed like everything else.
///
/// CoreGraphics and ImageIO only, so the same code runs on the phone and in
/// the Mac replay tool, and the tests can round-trip a synthetic page.
public enum ScanDocument {

  public enum DocumentError: Error, LocalizedError {
    case noPages
    case contextUnavailable
    case encodingFailed

    public var errorDescription: String? {
      switch self {
      case .noPages: return "The scan has no pages"
      case .contextUnavailable: return "Could not create a PDF context"
      case .encodingFailed: return "Could not encode a scanned page"
      }
    }
  }

  /// Points across the width of a page; the height follows the image.
  static let pageWidth: CGFloat = 595  // A4 at 72 dpi

  /// Assembles the pages into a PDF.
  ///
  /// Each page keeps its own aspect ratio: VisionKit crops every page to its
  /// detected edges, so two pages of one scan are rarely the same shape. The
  /// image is re-encoded as JPEG so a multi-page scan stays a few megabytes,
  /// and the longest side is capped at 300 dpi of A4, which is more than the
  /// recogniser needs and enough to read the paper on a screen.
  public static func pdf(
    pages: [CGImage], maxLongSide: Int = 3508, jpegQuality: CGFloat = 0.8
  ) throws -> Data {
    guard !pages.isEmpty else { throw DocumentError.noPages }
    let data = NSMutableData()
    guard let consumer = CGDataConsumer(data: data),
      let context = CGContext(consumer: consumer, mediaBox: nil, nil)
    else { throw DocumentError.contextUnavailable }

    for image in pages {
      let scaled = try downscaled(image, maxLongSide: maxLongSide)
      let compressed = try jpegEncoded(scaled, quality: jpegQuality)
      let height = pageWidth * CGFloat(compressed.height) / CGFloat(compressed.width)
      var box = CGRect(x: 0, y: 0, width: pageWidth, height: height)
      let boxData = Data(bytes: &box, count: MemoryLayout<CGRect>.size)
      context.beginPDFPage([kCGPDFContextMediaBox: boxData] as CFDictionary)
      context.draw(compressed, in: box)
      context.endPDFPage()
    }
    context.closePDF()
    return data as Data
  }

  public static func pageCount(of pdf: Data) -> Int {
    guard let provider = CGDataProvider(data: pdf as CFData),
      let document = CGPDFDocument(provider)
    else { return 0 }
    return document.numberOfPages
  }

  /// Renders one page back to pixels, for running the recogniser on a Mac.
  public static func rasterise(_ pdf: Data, page: Int, dpi: CGFloat = 200) -> CGImage? {
    guard let provider = CGDataProvider(data: pdf as CFData),
      let document = CGPDFDocument(provider),
      let pdfPage = document.page(at: page)
    else { return nil }
    let box = pdfPage.getBoxRect(.mediaBox)
    let scale = dpi / 72
    let width = Int(box.width * scale)
    let height = Int(box.height * scale)
    guard
      let context = CGContext(
        data: nil, width: width, height: height, bitsPerComponent: 8, bytesPerRow: 0,
        space: CGColorSpace(name: CGColorSpace.sRGB)!,
        bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)
    else { return nil }
    context.setFillColor(gray: 1, alpha: 1)
    context.fill(CGRect(x: 0, y: 0, width: width, height: height))
    context.scaleBy(x: scale, y: scale)
    context.drawPDFPage(pdfPage)
    return context.makeImage()
  }

  static func downscaled(_ image: CGImage, maxLongSide: Int) throws -> CGImage {
    let longest = max(image.width, image.height)
    guard longest > maxLongSide else { return image }
    let factor = CGFloat(maxLongSide) / CGFloat(longest)
    let width = Int(CGFloat(image.width) * factor)
    let height = Int(CGFloat(image.height) * factor)
    guard
      let context = CGContext(
        data: nil, width: width, height: height, bitsPerComponent: 8, bytesPerRow: 0,
        space: CGColorSpace(name: CGColorSpace.sRGB)!,
        bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)
    else { throw DocumentError.contextUnavailable }
    context.interpolationQuality = .high
    context.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))
    guard let result = context.makeImage() else { throw DocumentError.encodingFailed }
    return result
  }

  /// Re-encodes as JPEG and reads it back, so the PDF context embeds the
  /// compressed stream rather than the raw bitmap.
  static func jpegEncoded(_ image: CGImage, quality: CGFloat) throws -> CGImage {
    let jpeg = NSMutableData()
    guard
      let destination = CGImageDestinationCreateWithData(jpeg, "public.jpeg" as CFString, 1, nil)
    else { throw DocumentError.encodingFailed }
    CGImageDestinationAddImage(
      destination, image, [kCGImageDestinationLossyCompressionQuality: quality] as CFDictionary)
    guard CGImageDestinationFinalize(destination),
      let source = CGImageSourceCreateWithData(jpeg, nil),
      let decoded = CGImageSourceCreateImageAtIndex(source, 0, nil)
    else { throw DocumentError.encodingFailed }
    return decoded
  }
}

#if canImport(Vision)
  import CoreGraphics
  import CoreText
  import Foundation
  import Testing

  @testable import Shared

  /// Renders a synthetic German lab sheet at A4 150 dpi.
  ///
  /// Synthetic on purpose. `clients/ios/README.md` forbids health data in this
  /// directory outright, so the fixture is drawn at test time from fictional
  /// values rather than committed as an image, and nothing on it belongs to a
  /// real person.
  private func renderLabSheet() -> CGImage {
    let rows: [(String, String, String, String)] = [
      ("Analyt", "Ergebnis", "Einheit", "Referenzbereich"),
      ("Cholesterin gesamt", "212", "mg/dl", "< 200"),
      ("LDL-Cholesterin", "141", "mg/dl", "< 116"),
      ("HDL-Cholesterin", "48", "mg/dl", "> 40"),
      ("Triglyceride", "168", "mg/dl", "< 150"),
      ("Lp(a)", "38", "mg/dl", "< 30"),
      ("HbA1c", "5,4", "%", "4,0 - 6,0"),
      ("Kreatinin", "0,92", "mg/dl", "0,70 - 1,20"),
      ("NT-proBNP", "1.240", "pg/ml", "< 125"),
      ("Ferritin", "210", "ug/l", "30 - 400"),
    ]

    let width = 1240, height = 1754
    let context = CGContext(
      data: nil, width: width, height: height, bitsPerComponent: 8, bytesPerRow: 0,
      space: CGColorSpace(name: CGColorSpace.sRGB)!,
      bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
    context.setFillColor(gray: 1, alpha: 1)
    context.fill(CGRect(x: 0, y: 0, width: width, height: height))

    func draw(_ string: String, x: CGFloat, y: CGFloat, size: CGFloat = 26) {
      let font = CTFontCreateWithName("Helvetica" as CFString, size, nil)
      // CoreText attribute keys directly: AppKit and UIKit are both absent here,
      // so `NSAttributedString.Key.font` does not exist on this build.
      let attributes: [CFString: Any] = [
        kCTFontAttributeName: font,
        kCTForegroundColorAttributeName: CGColor(gray: 0, alpha: 1),
      ]
      let attributed = CFAttributedStringCreate(
        nil, string as CFString, attributes as CFDictionary)!
      let line = CTLineCreateWithAttributedString(attributed)
      context.textPosition = CGPoint(x: x, y: y)
      CTLineDraw(line, context)
    }

    draw("Laborbefund", x: 90, y: CGFloat(height) - 120, size: 34)
    draw("Praxis Dr. Muster, Musterstadt", x: 90, y: CGFloat(height) - 165, size: 22)

    let columns: [CGFloat] = [90, 560, 760, 950]
    var y = CGFloat(height) - 290
    for row in rows {
      draw(row.0, x: columns[0], y: y)
      draw(row.1, x: columns[1], y: y)
      draw(row.2, x: columns[2], y: y)
      draw(row.3, x: columns[3], y: y)
      y -= 52
    }
    return context.makeImage()!
  }

  @Suite("The hybrid, end to end through Vision")
  struct VisionDocumentReaderTests {

    /// The regression this whole reconciler exists for.
    ///
    /// Measured on 2026-09-13, `RecognizeDocumentsRequest` returned
    /// `["HbA1c", "5,4", "", "4,0 - 6,0"]` for this exact sheet: the `%` cell
    /// came back empty. The unit selects the LOINC code, `%` is 4548-4 and
    /// `mmol/mol` is 59261-8, so an empty unit means the row is refused.
    ///
    /// The assertion is on the outcome rather than on Vision dropping the
    /// character, so it keeps its meaning if a future OS stops dropping it.
    @Test("HbA1c keeps the unit that selects its LOINC code")
    func hbA1cSurvivesWithItsUnit() async throws {
      let reading = try await VisionDocumentReader.read(renderLabSheet(), page: 1)
      let result = LabLineParser.extract(rows: reading.rows, source: .ocrTranscribed)

      let hba1c = result.coded.first { $0.raw.label.lowercased().contains("hba1c") }
      #expect(hba1c != nil, "HbA1c did not survive extraction at all")
      #expect(hba1c?.coding.loinc == "4548-4")
      #expect(hba1c?.coding.ucum == "%")
      #expect(hba1c?.raw.value == 5.4)
    }

    @Test("the table pass finds the sheet as one table")
    func findsTheTable() async throws {
      let reading = try await VisionDocumentReader.read(renderLabSheet(), page: 1)
      #expect(reading.tableCount >= 1)
      #expect(reading.rows.count >= 9, "expected the header plus nine analyte rows")
    }

    @Test("every coded value carries a usable rectangle on the page")
    func everyValueHasARegion() async throws {
      // #186 acceptance criterion 5. The text-only path cannot do this at all.
      let reading = try await VisionDocumentReader.read(renderLabSheet(), page: 1)
      let result = LabLineParser.extract(rows: reading.rows, source: .ocrTranscribed)

      #expect(!result.coded.isEmpty)
      for value in result.coded {
        let region = try #require(value.raw.region, "\(value.raw.label) has no region")
        #expect(region.page == 1)
        #expect(region.x >= 0 && region.maxX <= 1.0001)
        #expect(region.y >= 0 && region.maxY <= 1.0001)
        #expect(region.width > 0 && region.height > 0)
      }
    }

    @Test("rows are ordered down the page, so regions descend")
    func regionsDescend() async throws {
      let reading = try await VisionDocumentReader.read(renderLabSheet(), page: 1)
      let ys = reading.rows.map(\.region.midY)
      #expect(ys == ys.sorted(by: >), "row order does not follow the page")
    }

    @Test("the German thousands rule survives the table pass")
    func thousandsSurvive() async throws {
      // 1.240 pg/mL NT-proBNP is 1240, not 1.24: a normal result and a
      // cardiology referral, told apart by one rule.
      let reading = try await VisionDocumentReader.read(renderLabSheet(), page: 1)
      let result = LabLineParser.extract(rows: reading.rows, source: .ocrTranscribed)

      let bnp = result.coded.first { $0.raw.label.lowercased().contains("probnp") }
      #expect(bnp?.raw.value == 1240)
    }

    @Test("the hybrid codes at least as much as the text-only path did")
    func noRegressionAgainstTheOldPath() async throws {
      let image = renderLabSheet()
      let reading = try await VisionDocumentReader.read(image, page: 1)

      let hybrid = LabLineParser.extract(rows: reading.rows, source: .ocrTranscribed)
      let textOnly = LabLineParser.extract(reading.plainText, source: .ocrTranscribed)

      #expect(
        hybrid.coded.count >= textOnly.coded.count,
        "hybrid coded \(hybrid.coded.count), text-only coded \(textOnly.coded.count)")
    }
  }
#endif

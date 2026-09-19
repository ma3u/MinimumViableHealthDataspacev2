#if DEBUG && canImport(CoreImage)
  import CoreGraphics
  import CoreImage
  import CoreText
  import Foundation

  /// Renders synthetic German lab sheets, optionally degraded the way a
  /// hand-held scan of a piece of A4 actually is.
  ///
  /// Synthetic and generated at test time rather than committed, because
  /// `clients/ios/README.md` forbids health data in this directory outright.
  /// Every value here is fictional.
  ///
  /// The degradations are not decoration. Scanning happens in a kitchen, at
  /// night, with a flash the app cannot control (VisionKit exposes no flash
  /// API), so skew, glare, underexposure, noise and motion blur are the normal
  /// case and not the edge case.
  public enum SyntheticSheet {

    /// One printed row, and the truth it stands for.
    public struct Expectation: Sendable {
      public let label: String
      public let value: Double
      public let unit: String
      public let referenceText: String
      /// The LOINC code a correct extraction must produce, or nil when the
      /// analyte is deliberately outside the dictionary.
      public let loinc: String?

      public init(
        label: String, value: Double, unit: String, referenceText: String, loinc: String?
      ) {
        self.label = label
        self.value = value
        self.unit = unit
        self.referenceText = referenceText
        self.loinc = loinc
      }
    }

    /// The panel every test renders. Chosen to exercise what breaks:
    /// a German thousands separator, a decimal comma, a unit that selects the
    /// code, a bare `%`, and an analyte the dictionary does not know.
    public static let panel: [Expectation] = [
      Expectation(
        label: "Cholesterin gesamt", value: 212, unit: "mg/dl", referenceText: "< 200",
        loinc: "2093-3"),
      Expectation(
        label: "LDL-Cholesterin", value: 141, unit: "mg/dl", referenceText: "< 116",
        loinc: "2089-1"),
      Expectation(
        label: "HDL-Cholesterin", value: 48, unit: "mg/dl", referenceText: "> 40",
        loinc: "2085-9"),
      Expectation(
        label: "Triglyceride", value: 168, unit: "mg/dl", referenceText: "< 150",
        loinc: "2571-8"),
      Expectation(
        label: "HbA1c", value: 5.4, unit: "%", referenceText: "4,0 - 6,0", loinc: "4548-4"),
      Expectation(
        label: "Kreatinin", value: 0.92, unit: "mg/dl", referenceText: "0,70 - 1,20",
        loinc: "2160-0"),
      Expectation(
        label: "NT-proBNP", value: 1240, unit: "pg/ml", referenceText: "< 125",
        loinc: "33762-6"),
      Expectation(
        label: "Ferritin", value: 210, unit: "ug/l", referenceText: "30 - 400",
        loinc: "2276-4"),
    ]

    /// How badly the scan went.
    public struct Condition: Sendable {
      public var name: String
      /// Degrees of skew. A sheet on a table, photographed by hand.
      public var rotation: Double = 0
      /// 1.0 leaves contrast alone; below 1 is a dim room, above 1 is glare.
      public var contrast: Double = 1.0
      /// 1.0 leaves brightness alone; negative is underexposed, positive is
      /// the flash firing straight back off glossy paper.
      public var brightness: Double = 0
      /// Gaussian blur radius in pixels. Motion, or a missed focus.
      public var blur: Double = 0
      /// Multiplier on the rendered resolution. Below 1 is a distant or
      /// low-megapixel capture.
      public var scale: Double = 1.0

      public static let clean = Condition(name: "clean 150 dpi scan")

      public init(
        name: String, rotation: Double = 0, contrast: Double = 1.0, brightness: Double = 0,
        blur: Double = 0, scale: Double = 1.0
      ) {
        self.name = name
        self.rotation = rotation
        self.contrast = contrast
        self.brightness = brightness
        self.blur = blur
        self.scale = scale
      }
    }

    public static func formatted(_ value: Double) -> String {
      if value == value.rounded() {
        // German thousands separator, the rule that turns 1.240 into 1240.
        return value >= 1000
          ? String(Int(value) / 1000) + "." + String(format: "%03d", Int(value) % 1000)
          : String(Int(value))
      }
      return String(format: "%.2f", value)
        .replacingOccurrences(of: ".", with: ",")
        .replacingOccurrences(of: "0$", with: "", options: .regularExpression)
    }

    /// Renders the panel, page `page` of `pageCount`, under `condition`.
    /// The header block a real sheet carries above its table: who issued it,
    /// for whom, and on which dates. All fictional.
    ///
    /// Opt-in, and deliberately not the default. The skew measurements in
    /// `ScanningTests` were taken on a bare table, and a header changes them:
    /// on a sheet skewed by one degree it costs two of eight rows. That is
    /// worth knowing, and it is not worth silently rewriting what those
    /// numbers mean.
    public struct Header: Sendable {
      public let collected: String
      public let received: String
      public let reported: String

      public init(
        collected: String = "12.09.2026", received: String = "12.09.2026",
        reported: String = "14.09.2026"
      ) {
        self.collected = collected
        self.received = received
        self.reported = reported
      }

      public static let standard = Header()
    }

    public static func render(
      _ condition: Condition = .clean, rows: [Expectation]? = nil,
      page: Int = 1, freeTextOnly: Bool = false, header: Header? = nil
    ) -> CGImage {
      let entries = rows ?? panel
      let width = Int(1240 * condition.scale)
      let height = Int(1754 * condition.scale)
      let context = CGContext(
        data: nil, width: width, height: height, bitsPerComponent: 8, bytesPerRow: 0,
        space: CGColorSpace(name: CGColorSpace.sRGB)!,
        bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
      context.setFillColor(gray: 1, alpha: 1)
      context.fill(CGRect(x: 0, y: 0, width: width, height: height))
      context.scaleBy(x: condition.scale, y: condition.scale)

      func draw(_ text: String, x: CGFloat, y: CGFloat, size: CGFloat = 26) {
        let font = CTFontCreateWithName("Helvetica" as CFString, size, nil)
        let attributes: [CFString: Any] = [
          kCTFontAttributeName: font,
          kCTForegroundColorAttributeName: CGColor(gray: 0, alpha: 1),
        ]
        let attributed = CFAttributedStringCreate(
          nil, text as CFString, attributes as CFDictionary)!
        context.textPosition = CGPoint(x: x, y: y)
        CTLineDraw(CTLineCreateWithAttributedString(attributed), context)
      }

      draw("Laborbefund", x: 90, y: 1754 - 120, size: 34)
      draw("MVZ Labor Musterstadt GmbH", x: 90, y: 1754 - 165, size: 22)
      draw("Seite \(page)", x: 1000, y: 1754 - 165, size: 22)
      // The header the metadata reader works on: a collection date, a receipt
      // date it must not prefer, an issue date it must not prefer either, and
      // a birth date it must never take.
      if let header {
        draw("Patient: Muster, Max   geb. 03.04.1975", x: 90, y: 1754 - 205, size: 20)
        draw("Auftragsnr.: 2609123456   Einsender: Dr. med. Erika Beispiel", x: 90,
             y: 1754 - 235, size: 20)
        draw("Entnahme: \(header.collected)   Eingang: \(header.received)", x: 90,
             y: 1754 - 265, size: 20)
        draw("Befunddatum: \(header.reported)", x: 90, y: 1754 - 295, size: 20)
      }

      if freeTextOnly {
        // A doctor's letter: prose, no table. Must not crash the table path.
        let lines = [
          "Sehr geehrte Frau Kollegin,",
          "wir berichten ueber die ambulante Vorstellung des Patienten.",
          "Die Befunde waren unauffaellig, eine Kontrolle empfehlen wir",
          "in sechs Monaten. Mit freundlichen kollegialen Gruessen.",
        ]
        var y: CGFloat = 1754 - (header == nil ? 300 : 370)
        for line in lines {
          draw(line, x: 90, y: y, size: 24)
          y -= 48
        }
      } else {
        let columns: [CGFloat] = [90, 560, 760, 950]
        var y: CGFloat = 1754 - (header == nil ? 290 : 360)
        draw("Analyt", x: columns[0], y: y)
        draw("Ergebnis", x: columns[1], y: y)
        draw("Einheit", x: columns[2], y: y)
        draw("Referenzbereich", x: columns[3], y: y)
        y -= 52
        for entry in entries {
          draw(entry.label, x: columns[0], y: y)
          draw(formatted(entry.value), x: columns[1], y: y)
          draw(entry.unit, x: columns[2], y: y)
          draw(entry.referenceText, x: columns[3], y: y)
          y -= 52
        }
      }

      let base = context.makeImage()!
      return degrade(base, condition)
    }

    /// One context for the whole suite. Building a `CIContext` per render
    /// allocates a fresh GPU command queue and texture cache each time, which
    /// is what tipped the test process into being killed for memory.
    private static let sharedContext = CIContext(options: [.useSoftwareRenderer: false])

    private static func degrade(_ image: CGImage, _ condition: Condition) -> CGImage {
      guard condition.rotation != 0 || condition.contrast != 1.0
        || condition.brightness != 0 || condition.blur != 0
      else { return image }

      var ciImage = CIImage(cgImage: image)
      let extent = ciImage.extent

      if condition.contrast != 1.0 || condition.brightness != 0 {
        ciImage = ciImage.applyingFilter(
          "CIColorControls",
          parameters: [
            kCIInputContrastKey: condition.contrast,
            kCIInputBrightnessKey: condition.brightness,
          ])
      }
      if condition.blur > 0 {
        ciImage = ciImage
          .clampedToExtent()
          .applyingFilter("CIGaussianBlur", parameters: [kCIInputRadiusKey: condition.blur])
          .cropped(to: extent)
      }
      if condition.rotation != 0 {
        let radians = condition.rotation * .pi / 180
        // Rotate about the centre, then composite over white so the corners
        // the rotation exposes are paper, not black.
        let rotated = ciImage
          .transformed(by: CGAffineTransform(translationX: -extent.midX, y: -extent.midY))
          .transformed(by: CGAffineTransform(rotationAngle: radians))
          .transformed(by: CGAffineTransform(translationX: extent.midX, y: extent.midY))
        let white = CIImage(color: .white).cropped(to: extent)
        ciImage = rotated.composited(over: white)
      }

      return sharedContext.createCGImage(ciImage, from: extent)!
    }
  }
#endif

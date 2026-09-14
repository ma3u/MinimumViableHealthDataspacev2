#if DEBUG
  import Foundation
  import Shared

  /// Fictional reports, for App Store screenshots.
  ///
  /// `#if DEBUG` rather than a launch-argument check alone, so this cannot
  /// exist in an App Store build at all. A flag can be discovered; code that is
  /// not compiled cannot.
  ///
  /// Every value here is invented. App Store screenshots are published to the
  /// world, and `clients/ios/README.md` forbids health data in this directory
  /// outright, so screenshots of a real panel would break both at once. The
  /// numbers are chosen to show the app doing its actual job: a value above its
  /// printed range, a German thousands separator, an analyte the dictionary
  /// does not know, and a line that could not be read.
  enum DemoSeed {

    static var isRequested: Bool {
      ProcessInfo.processInfo.arguments.contains("-MBDemoSeed")
    }

    /// Which screen to open on launch.
    ///
    /// Screenshots are taken by launching straight into a screen rather than by
    /// driving taps. A tap script breaks when a button moves; a launch argument
    /// does not, and the screenshots stay reproducible as the layout changes.
    enum Screen: String {
      case list, detail, consent, settings, privacy
    }

    static var screen: Screen? {
      let args = ProcessInfo.processInfo.arguments
      guard let index = args.firstIndex(of: "-MBShot"), index + 1 < args.count else {
        return nil
      }
      return Screen(rawValue: args[index + 1])
    }

    private static func coded(
      _ label: String, _ value: Double, _ unitRaw: String, _ ucum: String, _ loinc: String,
      _ display: String, low: Double? = nil, high: Double? = nil, line: Int
    ) -> CodedLabValue {
      CodedLabValue(
        raw: RawLabValue(
          label: label, value: value, unitRaw: unitRaw,
          referenceLow: low, referenceHigh: high,
          line: "\(label)  \(value)  \(unitRaw)", lineNumber: line,
          region: SourceRegion(
            page: 1, x: 0.07, y: 0.82 - Double(line) * 0.04, width: 0.85, height: 0.03)),
        coding: AnalyteCoding(
          labelKey: label.lowercased(), ucum: ucum, loinc: loinc, display: display,
          analyteKey: label.lowercased()),
        source: .ocrTranscribed)
    }

    static var reports: [ReportStore.StoredReport] {
      let panel = ExtractionResult(
        coded: [
          coded("Cholesterin gesamt", 212, "mg/dl", "mg/dL", "2093-3",
                "Cholesterol [Mass/volume] in Serum or Plasma", high: 200, line: 2),
          coded("LDL-Cholesterin", 141, "mg/dl", "mg/dL", "2089-1",
                "Cholesterol in LDL [Mass/volume]", high: 116, line: 3),
          coded("HDL-Cholesterin", 48, "mg/dl", "mg/dL", "2085-9",
                "Cholesterol in HDL [Mass/volume]", low: 40, line: 4),
          coded("Triglyceride", 168, "mg/dl", "mg/dL", "2571-8",
                "Triglyceride [Mass/volume]", high: 150, line: 5),
          coded("HbA1c", 5.4, "%", "%", "4548-4",
                "Hemoglobin A1c/Hemoglobin.total in Blood", low: 4, high: 6, line: 6),
          coded("Kreatinin", 0.92, "mg/dl", "mg/dL", "2160-0",
                "Creatinine [Mass/volume]", low: 0.7, high: 1.2, line: 7),
          // The German thousands rule, visible: 1.240 pg/mL is 1240.
          coded("NT-proBNP", 1240, "pg/ml", "pg/mL", "33762-6",
                "Natriuretic peptide.B prohormone N-Terminal", high: 125, line: 8),
          coded("Ferritin", 210, "ug/l", "ug/L", "2276-4",
                "Ferritin [Mass/volume]", low: 30, high: 400, line: 9),
        ],
        unmapped: [
          UnmappedLabValue(
            raw: RawLabValue(
              label: "Omega-3-Index", value: 6.8, unitRaw: "%",
              line: "Omega-3-Index  6,8 %", lineNumber: 10),
            reason: .unknownAnalyte)
        ],
        suspiciousLines: ["Lipoprotein-Elektrophorese   siehe Anlage"],
        source: .ocrTranscribed)

      let second = ExtractionResult(
        coded: [
          coded("LDL-Cholesterin", 128, "mg/dl", "mg/dL", "2089-1",
                "Cholesterol in LDL [Mass/volume]", high: 116, line: 3),
          coded("HbA1c", 5.2, "%", "%", "4548-4",
                "Hemoglobin A1c/Hemoglobin.total in Blood", low: 4, high: 6, line: 4),
          coded("Ferritin", 188, "ug/l", "ug/L", "2276-4",
                "Ferritin [Mass/volume]", low: 30, high: 400, line: 5),
        ],
        unmapped: [], suspiciousLines: [], source: .ocrTranscribed)

      let calendar = Calendar(identifier: .gregorian)
      let march = calendar.date(from: DateComponents(year: 2026, month: 3, day: 11))!
      let september = calendar.date(from: DateComponents(year: 2026, month: 9, day: 4))!

      return [
        ReportStore.StoredReport(
          id: UUID(uuidString: "00000000-0000-0000-0000-0000000000A1")!,
          scannedAt: september, collectedOn: september,
          title: "Lipid panel, Praxis Dr. Muster", extraction: panel),
        ReportStore.StoredReport(
          id: UUID(uuidString: "00000000-0000-0000-0000-0000000000A2")!,
          scannedAt: march, collectedOn: march,
          title: "Check-up, Praxis Dr. Muster", extraction: second),
      ]
    }
  }
#endif

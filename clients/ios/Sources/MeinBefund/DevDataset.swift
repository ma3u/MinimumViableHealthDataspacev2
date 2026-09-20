import Foundation
import Shared

#if DEBUG

  /// A test database: several years of fictional reports, with pages.
  ///
  /// `-MBDemoSeed` carries two reports, which is enough for a screenshot and
  /// not enough to work on. A trend needs points, a chart needs gaps between
  /// dates, the profile needs a body measurement to read back, and the
  /// unmatched list needs something in it. Building each of those by hand for
  /// every question is how an afternoon disappears.
  ///
  /// Two rules it keeps.
  ///
  /// **Nothing real.** Every laboratory is invented, every value is made up,
  /// and no page of a person's own report is anywhere near this file. A real
  /// report lives outside the repository, always (README, rule 1).
  ///
  /// **Nothing hand-coded.** A row states the label, the value, the unit and
  /// the range the laboratory printed, and `Analytes.lookup` codes it, exactly
  /// as it codes a scan. So no LOINC code here can be wrong, a row the
  /// dictionary cannot code lands in the unmatched list of its own accord, and
  /// the dataset follows the dictionary when the dictionary changes.
  enum DevDataset {

    static var isRequested: Bool {
      ProcessInfo.processInfo.arguments.contains("-MBDevData")
    }

    /// One printed line: what the sheet says, before anything reads it.
    struct Row {
      let label: String
      let value: Double
      let unit: String
      var low: Double?
      var high: Double?

      init(_ label: String, _ value: Double, _ unit: String, _ low: Double? = nil, _ high: Double? = nil) {
        self.label = label
        self.value = value
        self.unit = unit
        self.low = low
        self.high = high
      }

      var printedRange: String {
        switch (low, high) {
        case let (l?, h?): return "\(Measurement.text(l)) - \(Measurement.text(h))"
        case let (nil, h?): return "< \(Measurement.text(h))"
        case let (l?, nil): return "> \(Measurement.text(l))"
        default: return ""
        }
      }
    }

    /// One report, before it is coded.
    struct Sheet {
      let id: String
      let year: Int
      let month: Int
      let day: Int
      let title: String
      let laboratory: String
      let source: SourceKind
      let rows: [Row]
      /// Lines the recogniser saw and could not turn into a value. Real scans
      /// always have some, and a dataset without any hides the screen that
      /// exists to show them.
      var unread: [String] = []
      /// Recovered from a chart's month axis, so the day is not known and the
      /// record says so.
      var monthOnly: Bool = false
    }

    static func date(_ s: Sheet) -> Date {
      ReportMetadataExtractor.day(s.year, s.month, s.day) ?? Date()
    }

    /// Codes one sheet the way a scan is coded, and keeps what will not code.
    static func report(_ sheet: Sheet) -> LabReport {
      var coded: [CodedLabValue] = []
      var unmapped: [UnmappedLabValue] = []

      for (index, row) in sheet.rows.enumerated() {
        let raw = RawLabValue(
          label: row.label, value: row.value, unitRaw: row.unit,
          referenceLow: row.low, referenceHigh: row.high,
          line: "\(row.label)  \(Measurement.text(row.value))  \(row.unit)  \(row.printedRange)",
          lineNumber: index + 2,
          region: SourceRegion(
            page: 1, x: 0.07, y: 0.84 - Double(index) * 0.035, width: 0.86, height: 0.028))
        if let coding = Analytes.lookup(label: row.label, unit: row.unit) {
          coded.append(CodedLabValue(raw: raw, coding: coding, source: sheet.source))
        } else {
          unmapped.append(UnmappedLabValue(raw: raw, reason: .unknownAnalyte))
        }
      }

      let day = date(sheet)
      var report = LabReport(
        id: UUID(uuidString: sheet.id) ?? UUID(),
        scannedAt: day, collectedOn: day, title: sheet.title,
        extraction: ExtractionResult(
          coded: coded, unmapped: unmapped,
          suspiciousLines: sheet.unread,
          source: sheet.source),
        metadata: ReportMetadata(
          laboratory: sheet.laboratory, collectedOn: day, reportedOn: day,
          reportNumber: "D\(sheet.year)\(String(format: "%02d", sheet.month))\(String(format: "%02d", sheet.day))",
          labDate: day, labDateRole: .collection,
          dateSource: sheet.monthOnly ? .chartMonth : .printed))
      // Pages, so "Original scan" is there. A report that cannot show what it
      // was read from is the one thing this app is meant not to be.
      if let pages = scan(for: sheet) {
        report.scan = LabReport.ScanAttachment(
          pageCount: 1, bytes: pages.count, sourcePixelWidth: 1240)
      }
      return report
    }

    /// The pages of one report, rendered rather than shipped.
    ///
    /// An image in the bundle would be another binary nobody can review in a
    /// diff, and the sheet the tests already read is drawn by the same code.
    static func scan(for sheet: Sheet) -> Data? {
      let rows = sheet.rows.map {
        SyntheticSheet.Expectation(
          label: $0.label, value: $0.value, unit: $0.unit,
          referenceText: $0.printedRange,
          loinc: Analytes.lookup(label: $0.label, unit: $0.unit)?.loinc)
      }
      let printed = "\(String(format: "%02d", sheet.day)).\(String(format: "%02d", sheet.month)).\(sheet.year)"
      let page = SyntheticSheet.render(
        rows: rows,
        header: SyntheticSheet.Header(
          collected: printed, received: printed, reported: printed))
      return try? ScanDocument.pdf(pages: [page])
    }

    // ---- The corpus -------------------------------------------------------
    //
    // Three years, seven reports, four sources. Chosen so that every screen
    // has something to show: lipids and HbA1c across five dates for a trend
    // with shape, a body-composition reading whose visceral fat LOINC has no
    // code for, two lines nobody could read, and one analyte the dictionary
    // does not know.
    //
    // Every laboratory is invented. Every value is made up.
    static let sheets: [Sheet] = [
      Sheet(
        id: "00000000-0000-0000-0000-00000000D001", year: 2024, month: 3, day: 22,
        title: "Check-up, Praxis Dr. Muster", laboratory: "Praxis Dr. Muster",
        source: .ocrTranscribed,
        rows: [
          Row("Cholesterin gesamt", 231, "mg/dl", nil, 200),
          Row("LDL-Cholesterin", 158, "mg/dl", nil, 116),
          Row("HDL-Cholesterin", 44, "mg/dl", 40, nil),
          Row("Triglyceride", 194, "mg/dl", nil, 150),
          Row("HbA1c", 5.7, "%", 4, 6),
          Row("Glukose", 102, "mg/dl", 74, 106),
          Row("Kreatinin", 0.95, "mg/dl", 0.7, 1.2),
          Row("Hämoglobin", 15.1, "g/dl", 13.5, 17.2),
          Row("Leukozyten", 5.55, "/nl", 3.9, 10.2),
          Row("Ferritin", 165, "ug/l", 30, 400),
        ],
        unread: ["Befund freigegeben durch Dr. med. Muster", "Seite 1 von 2"]),

      Sheet(
        id: "00000000-0000-0000-0000-00000000D002", year: 2025, month: 3, day: 3,
        title: "Großes Blutbild, Labor Musterstadt", laboratory: "Labor Musterstadt",
        source: .labIssuedDigital,
        rows: [
          Row("Cholesterin gesamt", 224, "mg/dl", nil, 200),
          Row("LDL-Cholesterin", 149, "mg/dl", nil, 116),
          Row("HDL-Cholesterin", 46, "mg/dl", 40, nil),
          Row("Triglyceride", 181, "mg/dl", nil, 150),
          Row("HbA1c", 5.6, "%", 4, 6),
          Row("Kreatinin", 0.93, "mg/dl", 0.7, 1.2),
          Row("Harnstoff", 34, "mg/dl", 17, 43),
          Row("Hämoglobin", 15.4, "g/dl", 13.5, 17.2),
          Row("Leukozyten", 5.1, "/nl", 3.9, 10.2),
          Row("Thrombozyten", 244, "/nl", 150, 370),
          Row("Ferritin", 178, "ug/l", 30, 400),
          Row("TSH", 1.8, "mU/l", 0.27, 4.2),
          Row("GPT", 28, "U/l", nil, 50),
          Row("GOT", 24, "U/l", nil, 50),
          Row("Gamma-GT", 31, "U/l", nil, 60),
          Row("CRP", 1.2, "mg/l", nil, 5),
          Row("Vitamin D", 24, "ng/ml", 30, 100),
        ]),

      Sheet(
        id: "00000000-0000-0000-0000-00000000D003", year: 2025, month: 9, day: 14,
        title: "Studienlabor, Studienzentrum Musterklinik",
        laboratory: "Studienzentrum Musterklinik", source: .ocrTranscribed,
        rows: [
          Row("LDL-Cholesterin", 144, "mg/dl", nil, 116),
          Row("HbA1c", 5.5, "%", 4, 6),
          Row("Ferritin", 188, "ug/l", 30, 400),
          Row("Vitamin B12", 412, "pg/ml", 191, 663),
          Row("Homocystein", 11.4, "umol/l", nil, 12),
          // Known to the dictionary in this unit and to LOINC in no unit at
          // all: it lands in the unmatched list, which is where the screen
          // that shows unmatched values gets something to show.
          Row("Omega-3-Index", 6.8, "%", 8, nil),
        ],
        unread: ["Probeneingang 14.09.2025 08:12"]),

      Sheet(
        id: "00000000-0000-0000-0000-00000000D004", year: 2026, month: 3, day: 11,
        title: "Check-up, Praxis Dr. Muster", laboratory: "Praxis Dr. Muster",
        source: .ocrTranscribed,
        rows: [
          Row("Cholesterin gesamt", 218, "mg/dl", nil, 200),
          Row("LDL-Cholesterin", 138, "mg/dl", nil, 116),
          Row("HDL-Cholesterin", 49, "mg/dl", 40, nil),
          Row("Triglyceride", 162, "mg/dl", nil, 150),
          Row("HbA1c", 5.4, "%", 4, 6),
          Row("Glukose", 96, "mg/dl", 74, 106),
          Row("Hämoglobin", 15.2, "g/dl", 13.5, 17.2),
          Row("Ferritin", 195, "ug/l", 30, 400),
          Row("Vitamin D", 31, "ng/ml", 30, 100),
        ]),

      // A gym scale, photographed. `self-tracked` because the enum defines
      // that as a value from a consumer device, which is what this is.
      Sheet(
        id: "00000000-0000-0000-0000-00000000D005", year: 2026, month: 5, day: 14,
        title: "Körperzusammensetzung", laboratory: "Körperanalysewaage",
        source: .selfTracked,
        rows: [
          Row("Körpergewicht", 72.4, "kg"),
          Row("Körperfett", 11.8, "kg"),
          Row("Muskelmasse", 57.1, "kg"),
          // LOINC codes visceral fat as an area and has no term for the mass
          // a scale prints, so this one is carried with no code at all.
          Row("Viszeralfett", 1.9, "kg"),
          Row("ECW/TBW", 38.4, "%"),
        ]),

      Sheet(
        id: "00000000-0000-0000-0000-00000000D006", year: 2026, month: 6, day: 15,
        title: "Körperzusammensetzung", laboratory: "Körperanalysewaage",
        source: .selfTracked,
        rows: [
          Row("Körpergewicht", 71.1, "kg"),
          Row("Körperfett", 10.6, "kg"),
          Row("Muskelmasse", 57.4, "kg"),
          Row("Viszeralfett", 1.6, "kg"),
          Row("ECW/TBW", 38.2, "%"),
          Row("Taillenumfang", 86, "cm"),
        ]),

      // What one card's chart gives up when the scale prints a number beside
      // each point: a year of readings, each precise to the month it sits
      // over and to nothing finer. Six months of the extracellular water
      // share, recovered from a single photograph.
      Sheet(
        id: "00000000-0000-0000-0000-00000000D101", year: 2025, month: 10, day: 1,
        title: "Körperzusammensetzung, aus dem Verlauf",
        laboratory: "Körperanalysewaage", source: .selfTracked,
        rows: [Row("ECW/TBW", 38.1, "%")], monthOnly: true),
      Sheet(
        id: "00000000-0000-0000-0000-00000000D102", year: 2025, month: 11, day: 1,
        title: "Körperzusammensetzung, aus dem Verlauf",
        laboratory: "Körperanalysewaage", source: .selfTracked,
        rows: [Row("ECW/TBW", 38.3, "%")], monthOnly: true),
      Sheet(
        id: "00000000-0000-0000-0000-00000000D103", year: 2026, month: 1, day: 1,
        title: "Körperzusammensetzung, aus dem Verlauf",
        laboratory: "Körperanalysewaage", source: .selfTracked,
        rows: [Row("ECW/TBW", 38.4, "%")], monthOnly: true),
      Sheet(
        id: "00000000-0000-0000-0000-00000000D104", year: 2026, month: 2, day: 1,
        title: "Körperzusammensetzung, aus dem Verlauf",
        laboratory: "Körperanalysewaage", source: .selfTracked,
        rows: [Row("ECW/TBW", 38.2, "%")], monthOnly: true),
      Sheet(
        id: "00000000-0000-0000-0000-00000000D105", year: 2026, month: 3, day: 1,
        title: "Körperzusammensetzung, aus dem Verlauf",
        laboratory: "Körperanalysewaage", source: .selfTracked,
        rows: [Row("ECW/TBW", 38.0, "%")], monthOnly: true),
      Sheet(
        id: "00000000-0000-0000-0000-00000000D106", year: 2026, month: 4, day: 1,
        title: "Körperzusammensetzung, aus dem Verlauf",
        laboratory: "Körperanalysewaage", source: .selfTracked,
        rows: [Row("ECW/TBW", 38.3, "%")], monthOnly: true),

      // The five cards a gym scale shows on one morning, as photographed on
      // 15 June 2026: body fat as a share and as a mass, muscle mass, visceral
      // fat and the body-mass index. One card each, one value each named in
      // words, and a year of them drawn behind.
      Sheet(
        id: "00000000-0000-0000-0000-00000000D008", year: 2026, month: 6, day: 15,
        title: "Körperzusammensetzung", laboratory: "Körperanalysewaage",
        source: .selfTracked,
        rows: [
          Row("Körperfett %", 14.8, "%"),
          Row("Muskelmasse", 29, "kg"),
          Row("Body-Mass-Index", 23.8, "kg/m2"),
        ]),

      Sheet(
        id: "00000000-0000-0000-0000-00000000D007", year: 2026, month: 9, day: 4,
        title: "Lipidprofil, Labor Musterstadt", laboratory: "Labor Musterstadt",
        source: .labIssuedDigital,
        rows: [
          Row("Cholesterin gesamt", 212, "mg/dl", nil, 200),
          Row("LDL-Cholesterin", 141, "mg/dl", nil, 116),
          Row("HDL-Cholesterin", 48, "mg/dl", 40, nil),
          Row("Triglyceride", 168, "mg/dl", nil, 150),
          Row("HbA1c", 5.4, "%", 4, 6),
          Row("Kreatinin", 0.92, "mg/dl", 0.7, 1.2),
          Row("Ferritin", 210, "ug/l", 30, 400),
          Row("Lipoprotein (a)", 0.3, "g/l", nil, 0.5),
        ]),
    ]

    /// The corpus, newest first, as the app lists reports.
    @MainActor static let reports: [LabReport] =
      sheets.map(report).sorted { $0.effectiveDate > $1.effectiveDate }

    /// Pages per report id, built once.
    @MainActor static let scans: [UUID: Data] = {
      var pages: [UUID: Data] = [:]
      for sheet in sheets {
        guard let id = UUID(uuidString: sheet.id), let data = scan(for: sheet) else { continue }
        pages[id] = data
      }
      return pages
    }()
  }

#endif

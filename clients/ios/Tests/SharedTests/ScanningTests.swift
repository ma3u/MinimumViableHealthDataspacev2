#if canImport(Vision)
  import CoreGraphics
  import Foundation
  import Testing

  @testable import Shared

  /// End-to-end scanning, under the conditions a sheet of A4 actually arrives in.
  ///
  /// VisionKit exposes no flash API, so the app cannot control exposure: the
  /// user's phone decides, in whatever light they are standing in. Skew, glare,
  /// underexposure, blur and low resolution are therefore the normal case.
  ///
  /// ## What these tests assert, and what they deliberately do not
  ///
  /// They do **not** assert that OCR reads a blurred sheet. It does not, and a
  /// test demanding it would be a test of Apple's recogniser rather than of this
  /// code, and would break on every OS update.
  ///
  /// They assert the property that matters clinically: **a degraded scan yields
  /// fewer values, never wrong ones.** Losing LDL is a row the user re-scans.
  /// Reading 741 mg/dL where the paper says 141 is a number that reaches a
  /// doctor. The first is an inconvenience and the second is the failure this
  /// whole pipeline is shaped to prevent, so it is the one under test.
  @Suite("Scanning a lab sheet", .serialized)
  // Serialized on purpose. Each test renders a full A4 page and runs two
  // recognisers over it; in parallel that is enough concurrent image memory to
  // get the test process killed, which reads as a flaky suite rather than as
  // the resource problem it is.
  struct ScanningTests {

    /// Every value a correct extraction may produce, by LOINC code.
    static let truth: [String: Double] = {
      var table: [String: Double] = [:]
      for row in SyntheticSheet.panel {
        if let loinc = row.loinc { table[loinc] = row.value }
      }
      return table
    }()

    private static func extract(
      _ condition: SyntheticSheet.Condition, page: Int = 1, freeTextOnly: Bool = false
    ) async throws -> ExtractionResult {
      let image = SyntheticSheet.render(condition, page: page, freeTextOnly: freeTextOnly)
      let reading = try await VisionDocumentReader.read(image, page: page)
      if reading.rows.isEmpty {
        return LabLineParser.extract(reading.plainText, source: .ocrTranscribed)
      }
      var result = LabLineParser.extract(rows: reading.rows, source: .ocrTranscribed)
      let leftovers = VisionDocumentReader.readingOrder(reading.orphanedFragments)
      if !leftovers.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
        result = result.merging(LabLineParser.extract(leftovers, source: .ocrTranscribed))
      }
      return result
    }

    /// The safety invariant, checked under every condition.
    static func assertNoWrongValues(
      _ result: ExtractionResult, condition: String
    ) {
      for value in result.coded {
        guard let expected = truth[value.coding.loinc] else {
          Issue.record(
            Comment(rawValue:
              "\(condition): coded \(value.coding.loinc) (\(value.raw.label) = "
              + "\(value.raw.value) \(value.raw.unitRaw)) which is not on the sheet"))
          continue
        }
        #expect(
          abs(value.raw.value - expected) < 0.001,
          """
          \(condition): \(value.raw.label) read as \(value.raw.value), \
          the sheet says \(expected). A wrong number is worse than no number.
          """)
      }
    }

    // MARK: - The clean baseline

    @Test("a clean scan reads the whole panel")
    func cleanScanReadsEverything() async throws {
      let result = try await Self.extract(.clean)

      Self.assertNoWrongValues(result, condition: "clean")
      #expect(
        result.coded.count >= 7,
        "expected most of an 8-row panel, got \(result.coded.count)")

      // The two rows that encode the rules this project learned the hard way.
      let bnp = result.coded.first { $0.coding.loinc == "33762-6" }
      #expect(bnp?.raw.value == 1240, "1.240 pg/mL must be 1240, not 1.24")

      let hba1c = result.coded.first { $0.coding.loinc == "4548-4" }
      #expect(hba1c != nil, "HbA1c in % must code to 4548-4, the unit selects the code")
    }

    @Test("a clean scan preserves the printed reference ranges")
    func referenceRangesSurvive() async throws {
      let result = try await Self.extract(.clean)

      // Never normalised: a reference range is lab- and assay-specific (ADR-033).
      let ldl = result.coded.first { $0.coding.loinc == "2089-1" }
      #expect(ldl?.raw.referenceHigh == 116)
      #expect(ldl?.raw.referenceLow == nil, "an upper bound must not gain a lower one")

      let creatinine = result.coded.first { $0.coding.loinc == "2160-0" }
      #expect(creatinine?.raw.referenceLow == 0.70)
      #expect(creatinine?.raw.referenceHigh == 1.20)
    }

    // MARK: - Degraded captures

    @Test(
      "a degraded scan loses rows but never invents values",
      arguments: [
        SyntheticSheet.Condition(name: "skewed 2 degrees", rotation: 2),
        SyntheticSheet.Condition(name: "skewed 5 degrees", rotation: 5),
        SyntheticSheet.Condition(name: "dim room", contrast: 0.55, brightness: -0.12),
        SyntheticSheet.Condition(name: "flash glare", contrast: 1.9, brightness: 0.28),
        SyntheticSheet.Condition(name: "slight motion blur", blur: 1.4),
        SyntheticSheet.Condition(name: "heavy blur", blur: 4.0),
        SyntheticSheet.Condition(name: "low resolution", scale: 0.45),
      ]
    )
    func degradedScansNeverInvent(condition: SyntheticSheet.Condition) async throws {
      let result = try await Self.extract(condition)
      Self.assertNoWrongValues(result, condition: condition.name)
    }

    /// Skew is where the reconciler earns or loses its keep, so the numbers are
    /// pinned rather than left to drift.
    ///
    /// These feed a rotated image straight to Vision. The real app does not:
    /// `VNDocumentCameraViewController` detects the page edges and applies a
    /// perspective correction before any of this runs, so a hand-held photograph
    /// arrives much squarer than these fixtures. The tests are deliberately
    /// harsher than production, because what they are protecting is the
    /// behaviour when that correction is imperfect.
    ///
    /// Measured on 2026-09-13, whole 8-row panel:
    ///
    ///     0 degrees   8 coded, 0 unmapped
    ///     1 degree    8 coded, 0 unmapped
    ///     2 degrees   4 coded, 3 unmapped
    ///     5 degrees   2 coded, 4 unmapped
    ///
    /// The shape that matters is the second column. Rows lost to skew surface as
    /// `unmapped`, which the citizen sees and can re-scan. None of them turn
    /// into a wrong number.
    @Test("a one degree skew still reads the whole panel")
    func mildSkewStillWorks() async throws {
      let result = try await Self.extract(
        SyntheticSheet.Condition(name: "skewed 1 degree", rotation: 1))

      Self.assertNoWrongValues(result, condition: "skew 1")
      #expect(
        result.coded.count >= 7,
        "a 1 degree skew is an ordinary photograph, got \(result.coded.count) values")
    }

    @Test("rows lost to heavier skew are reported, not silently missing")
    func skewLosesRowsVisibly() async throws {
      let result = try await Self.extract(
        SyntheticSheet.Condition(name: "skewed 2 degrees", rotation: 2))

      Self.assertNoWrongValues(result, condition: "skew 2")
      // A row that fell out of the table must still reach the reviewer somehow.
      // Silence is the one outcome that is not allowed: a dropped line is
      // indistinguishable from a line that was never on the sheet.
      #expect(result.coded.count + result.needsReview >= 6)
    }

    @Test("an unreadable scan reports nothing rather than guessing")
    func unreadableScanIsEmptyNotWrong() async throws {
      let result = try await Self.extract(
        SyntheticSheet.Condition(name: "unreadable", blur: 12))

      Self.assertNoWrongValues(result, condition: "unreadable")
      // Whatever survives must be right; the point is that nothing is invented.
      #expect(result.coded.count < SyntheticSheet.panel.count)
    }

    // MARK: - Page shapes that are not a lab table

    @Test("a free-text doctor's letter yields no measurements and does not crash")
    func freeTextLetterIsHandled() async throws {
      let result = try await Self.extract(.clean, freeTextOnly: true)

      #expect(result.coded.isEmpty, "prose must not produce coded lab values")
      Self.assertNoWrongValues(result, condition: "free text")
    }

    @Test("a blank page produces nothing and raises nothing")
    func blankPageIsSafe() async throws {
      let blank = SyntheticSheet.render(.clean, rows: [], page: 1)
      let reading = try await VisionDocumentReader.read(blank, page: 1)
      let result = reading.rows.isEmpty
        ? LabLineParser.extract(reading.plainText, source: .ocrTranscribed)
        : LabLineParser.extract(rows: reading.rows, source: .ocrTranscribed)

      #expect(result.coded.isEmpty)
    }

    // MARK: - Multi-page

    @Test("page numbers follow the scan, so a citation points at the right sheet")
    func pageNumbersAreStamped() async throws {
      let second = try await Self.extract(.clean, page: 2)

      #expect(!second.coded.isEmpty)
      for value in second.coded {
        #expect(
          value.raw.region?.page == 2,
          "\(value.raw.label) cites page \(value.raw.region?.page ?? -1), scanned as page 2")
      }
    }

    @Test("two pages merge without losing or duplicating provenance")
    func multiPageMerge() async throws {
      let first = try await Self.extract(.clean, page: 1)
      let second = try await Self.extract(.clean, page: 2)
      let merged = first.merging(second)

      #expect(merged.coded.count == first.coded.count + second.coded.count)
      #expect(merged.source == .ocrTranscribed)

      let pages = Set(merged.coded.compactMap(\.raw.region?.page))
      #expect(pages == [1, 2])
    }

    // MARK: - Provenance

    @Test("everything a camera produces is preliminary, never final")
    func scansAreNeverFinal() async throws {
      let result = try await Self.extract(.clean)

      #expect(result.source == .ocrTranscribed)
      #expect(result.source.observationStatus == "preliminary")
      // The whole point: a scan is the lab's result and our transcription, and
      // a receiving system must be able to see the difference.
      #expect(SourceKind.labIssuedDigital.observationStatus == "final")
    }

    @Test("an unknown analyte is reported as unmapped, not silently dropped")
    func unknownAnalyteIsReported() async throws {
      let sheet = SyntheticSheet.render(
        .clean,
        rows: [
          SyntheticSheet.Expectation(
            label: "LDL-Cholesterin", value: 141, unit: "mg/dl", referenceText: "< 116",
            loinc: "2089-1"),
          SyntheticSheet.Expectation(
            label: "Phantasiewert", value: 42, unit: "mg/dl", referenceText: "< 50",
            loinc: nil),
        ])
      let reading = try await VisionDocumentReader.read(sheet, page: 1)
      let result = LabLineParser.extract(rows: reading.rows, source: .ocrTranscribed)

      #expect(result.coded.contains { $0.coding.loinc == "2089-1" })
      // An analyte outside the dictionary must surface: the citizen holding
      // the paper is the only one who can resolve it, and they can only do
      // that if they are told.
      #expect(result.unmapped.contains { $0.reason == .unknownAnalyte })
    }

    @Test("every scanned value can be cited back to a box on the page")
    func everyValueIsCitable() async throws {
      let result = try await Self.extract(.clean)

      for value in result.coded {
        let region = try #require(value.raw.region, "\(value.raw.label) cannot be cited")
        #expect(region.width > 0 && region.height > 0)
        #expect(region.x >= 0 && region.maxX <= 1.0001)
      }
    }
  }
#endif

#if canImport(Vision)
  /// The report's own dates and details, read through real OCR rather than
  /// from a string.
  ///
  /// `ReportMetadataTests` pins the rules on text the test wrote itself. This
  /// asserts the rules survive the recogniser: the header is rendered,
  /// photographed and read back, which is where a keyword lost to a dropped
  /// umlaut or a date split across fragments would show up.
  @Suite("Reading a printed header through Vision", .serialized)
  struct HeaderReadingTests {

    private static func metadata(
      _ condition: SyntheticSheet.Condition = .clean
    ) async throws -> ReportMetadata {
      let image = SyntheticSheet.render(condition, header: .standard)
      let reading = try await VisionDocumentReader.read(image, page: 1)
      // "Now" is fixed so the future-date rule cannot drift with the calendar.
      return ReportMetadataExtractor.extract(
        pages: [reading.plainText], now: ReportMetadataExtractor.day(2026, 9, 30)!)
    }

    @Test("the collection date is read from the sheet, not the receipt or the issue date")
    func readsTheCollectionDate() async throws {
      let metadata = try await Self.metadata()

      #expect(metadata.labDate == ReportMetadataExtractor.day(2026, 9, 12))
      #expect(metadata.labDateRole == .collection)
      #expect(metadata.dateSource == .printed)
      #expect(metadata.reportedOn == ReportMetadataExtractor.day(2026, 9, 14))
    }

    @Test("the birth date is kept as evidence and never becomes the lab date")
    func birthDateIsNeverTheLabDate() async throws {
      let metadata = try await Self.metadata()

      #expect(metadata.dates.contains { $0.role == .birth })
      #expect(metadata.labDate != ReportMetadataExtractor.day(1975, 4, 3))
    }

    @Test("the laboratory and the order number come off the header")
    func readsTheLaboratory() async throws {
      let metadata = try await Self.metadata()

      // The issuer, not the document's own title. "Laborbefund" is the first
      // line on the page and contains "Labor", so it won until it was excluded.
      #expect(metadata.laboratory?.contains("MVZ") == true, "got \(metadata.laboratory ?? "nil")")
      #expect(metadata.reportNumber == "2609123456")
    }

    /// A header is text above the table, and a skewed page is where the two
    /// can collide. The values must stay right even if the header is lost.
    @Test("a header does not put a wrong value in the table")
    func headerDoesNotCorruptTheTable() async throws {
      let image = SyntheticSheet.render(
        SyntheticSheet.Condition(name: "skewed 1 degree", rotation: 1), header: .standard)
      let reading = try await VisionDocumentReader.read(image, page: 1)
      let result = LabLineParser.extract(rows: reading.rows, source: .ocrTranscribed)

      ScanningTests.assertNoWrongValues(result, condition: "header, skew 1")
    }
  }
#endif

#if canImport(Vision)
  import CoreGraphics
  import Foundation
  import Testing

  @testable import Shared

  /// The scanning conditions of `ScanningTests`, measured rather than only
  /// asserted: per condition, how many of the panel's rows come out exact, how
  /// many are lost, and how many come out wrong while coded.
  ///
  /// The assertion is the clinical one, zero silent errors under every
  /// condition. The counts are the evidence: with `KLARBEFUND_BENCHMARK_OUT`
  /// set, the summary is written there as JSON, which CI keeps as a build
  /// artifact. It carries counts and LOINC codes only, and every sheet is
  /// synthetic (`SyntheticSheet`), so it can be published as it stands.
  @Suite("Accuracy benchmark on synthetic sheets", .serialized)
  struct AccuracyBenchmarkTests {

    static let truth = ExtractionAccuracy.TruthFile(
      rows: SyntheticSheet.panel.map {
        ExtractionAccuracy.TruthRow(
          label: $0.label, value: $0.value, unit: $0.unit, loinc: $0.loinc,
          refused: $0.loinc == nil, referenceText: $0.referenceText)
      })

    static let conditions: [SyntheticSheet.Condition] = [
      .clean,
      SyntheticSheet.Condition(name: "skewed 1 degree", rotation: 1),
      SyntheticSheet.Condition(name: "skewed 2 degrees", rotation: 2),
      SyntheticSheet.Condition(name: "skewed 5 degrees", rotation: 5),
      SyntheticSheet.Condition(name: "dim room", contrast: 0.55, brightness: -0.12),
      SyntheticSheet.Condition(name: "flash glare", contrast: 1.9, brightness: 0.28),
      SyntheticSheet.Condition(name: "slight motion blur", blur: 1.4),
      SyntheticSheet.Condition(name: "heavy blur", blur: 4.0),
      SyntheticSheet.Condition(name: "low resolution", scale: 0.45),
    ]

    /// The same pipeline as the app and `ScanningTests`: Vision, the table
    /// reconciler, then the line grammar over whatever fell outside a table.
    static func extract(_ condition: SyntheticSheet.Condition) async throws -> ExtractionResult {
      let image = SyntheticSheet.render(condition)
      let reading = try await VisionDocumentReader.read(image, page: 1)
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

    struct Measured: Codable {
      let condition: String
      let summary: ExtractionAccuracy.Summary
    }

    struct Benchmark: Codable {
      let generatedAt: Date
      let panelRows: Int
      let conditions: [Measured]
      let total: ExtractionAccuracy.Summary
    }

    @Test("no condition produces a coded wrong value, and the counts are recorded")
    func benchmark() async throws {
      var measured: [Measured] = []
      var total = ExtractionAccuracy.Summary()

      for condition in Self.conditions {
        let result = try await Self.extract(condition)
        let report = ExtractionAccuracy.compare(truth: Self.truth, extraction: result)
        let s = report.summary
        measured.append(Measured(condition: condition.name, summary: s))
        total.add(s)

        print(
          "benchmark \(condition.name): \(s.exact)/\(s.truthRows) exact, \(s.found) found, "
            + "\(s.silentErrors) silent, \(s.spurious) spurious, \(s.unreadLines) unread")
        #expect(
          s.silentErrors == 0,
          "\(condition.name): \(s.silentErrors) coded row(s) wrong in value, unit or code")
      }

      // The clean sheet is the baseline every other number is read against.
      #expect((measured.first?.summary.exact ?? 0) >= 7, "a clean scan reads the panel")

      if let path = ProcessInfo.processInfo.environment["KLARBEFUND_BENCHMARK_OUT"],
        !path.isEmpty
      {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        encoder.dateEncodingStrategy = .iso8601
        let benchmark = Benchmark(
          generatedAt: Date(), panelRows: SyntheticSheet.panel.count, conditions: measured,
          total: total)
        try encoder.encode(benchmark).write(to: URL(fileURLWithPath: path))
      }
    }
  }
#endif

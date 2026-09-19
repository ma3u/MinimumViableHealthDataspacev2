#if DEBUG
  import Foundation
  import Shared
  import UIKit

  /// Drives one synthetic report through the whole pipeline, on a simulator or
  /// a device, and asserts the result.
  ///
  /// Everything after the camera runs here: recognition, reconciliation,
  /// parsing, coding, reading the sheet's own header, building the PDF of the
  /// pages, sealing all three files, reading them back, and replaying the scan
  /// from its diagnostics record. None of that chain runs in `swift test`,
  /// because the store, the export and the environment record live in the app
  /// target and need a bundle, a keychain and a container.
  ///
  /// Until now the only way to exercise it was to scan a real lab report on a
  /// real phone, which means testing with a person's health data and finding
  /// out what broke afterwards (#186). This does the same work on a sheet of
  /// invented values.
  ///
  /// It asserts rather than prints: a self-test whose output nobody reads is
  /// not a check (ADR-031). Every failure is logged at `error` level and the
  /// final line carries the count, so `pull-diagnostics.sh` brings back a log
  /// that says plainly whether the build works.
  ///
  ///     xcrun simctl launch <device> red.mabu.meinbefund -MBSelfTest
  ///     Scripts/pull-diagnostics.sh                    # on a paired phone
  extension AppModel {

    private static let selfTestArgument = "-MBSelfTest"

    /// The dates the synthetic header prints, and what must come of them.
    private static let expectedLabDate = ReportMetadataExtractor.day(2026, 9, 12)
    private static let expectedIssueDate = ReportMetadataExtractor.day(2026, 9, 14)

    /// A lab sheet drawn as text, so the PDF carries a real text layer.
    ///
    /// `ScanDocument.pdf` draws images and therefore has none, which is the
    /// whole point of the distinction being tested.
    private static func textLayerPDF() -> Data {
      let renderer = UIGraphicsPDFRenderer(bounds: CGRect(x: 0, y: 0, width: 595, height: 842))
      return renderer.pdfData { context in
        context.beginPage()
        var y: CGFloat = 48
        func line(_ text: String, size: CGFloat = 10) {
          (text as NSString).draw(
            at: CGPoint(x: 48, y: y),
            withAttributes: [.font: UIFont.systemFont(ofSize: size), .foregroundColor: UIColor.black])
          y += size + 6
        }
        line("Laborbefund", size: 16)
        line("MVZ Labor Musterstadt GmbH")
        line("Patient: Muster, Max   geb. 03.04.1975")
        line("Auftragsnr.: 2609123456   Einsender: Dr. med. Erika Beispiel")
        line("Entnahme: 12.09.2026   Eingang: 12.09.2026")
        line("Befunddatum: 14.09.2026")
        y += 10
        line("Analyt                        Ergebnis   Einheit   Referenzbereich")
        for row in SyntheticSheet.panel {
          let label = row.label.padding(toLength: 30, withPad: " ", startingAt: 0)
          let value = SyntheticSheet.formatted(row.value).padding(
            toLength: 11, withPad: " ", startingAt: 0)
          let unit = row.unit.padding(toLength: 10, withPad: " ", startingAt: 0)
          line(label + value + unit + row.referenceText)
        }
      }
    }

    /// `-MBImportFiles`: imports every readable file sitting in the app's own
    /// temporary directory, saving each as a report.
    ///
    /// The companion to `Scripts/pull-diagnostics.sh`, in the other direction.
    /// A file can be put into the app's container over USB but nothing in the
    /// app would read it, and driving the document picker from a script is not
    /// possible. This runs the ordinary import path, `LabImport`, on each file
    /// and stores the result exactly as the picker would.
    ///
    /// Debug builds only, and the file is deleted from the container once it
    /// has been imported: a lab report in a temporary directory is health data
    /// outside the sealed store.
    func debugImportIfRequested() async {
      guard ProcessInfo.processInfo.arguments.contains("-MBImportFiles") else { return }
      let temporary = FileManager.default.temporaryDirectory
      let files =
        ((try? FileManager.default.contentsOfDirectory(
          at: temporary, includingPropertiesForKeys: nil)) ?? [])
        .filter { LabImport.readableExtensions.contains($0.pathExtension.lowercased()) }
        .sorted { $0.lastPathComponent < $1.lastPathComponent }

      guard !files.isEmpty else {
        Log.diagnostics.notice("import: nothing to import")
        return
      }

      for url in files {
        do {
          let product = try await LabImport.file(at: url)
          let id = UUID()
          // The laboratory names the report when the sheet said who it was.
          let title =
            product.metadata.laboratory
            ?? url.deletingPathExtension().lastPathComponent
          let report = LabReport(
            id: id, scannedAt: Date(), collectedOn: product.metadata.labDate, title: title,
            extraction: product.extraction, metadata: product.metadata,
            pageTexts: product.pageTexts,
            scan: LabReport.ScanAttachment(
              pageCount: product.pages.count, bytes: product.pdf.count),
            hasDiagnostics: true)
          try await store.save(report)
          try await store.saveScan(product.pdf, for: id)
          try await store.saveDiagnostics(
            ScanDiagnostics(
              reportId: id, createdAt: Date(),
              environment: ScanDiagnostics.Environment.current, pages: product.pages,
              extraction: product.extraction, metadata: product.metadata),
            for: id)
          try? FileManager.default.removeItem(at: url)
          Log.diagnostics.notice(
            "imported one file: \(product.extraction.source.rawValue, privacy: .public), \(product.extraction.coded.count, privacy: .public) coded, \(product.extraction.unmapped.count, privacy: .public) unmapped, \(product.extraction.suspiciousLines.count, privacy: .public) unread"
          )
        } catch {
          Log.diagnostics.error(
            "import failed: \(error.localizedDescription, privacy: .public)")
          self.error = error.localizedDescription
        }
      }
      await refresh()
    }

    func runSelfTestIfRequested() async {
      guard ProcessInfo.processInfo.arguments.contains(Self.selfTestArgument) else { return }
      var failures: [String] = []
      func check(_ condition: Bool, _ what: String) {
        if condition {
          Log.diagnostics.notice("self-test ok: \(what, privacy: .public)")
        } else {
          failures.append(what)
          Log.diagnostics.error("self-test FAILED: \(what, privacy: .public)")
        }
      }

      do {
        // A fresh store every run, so a second run asserts the same thing as
        // the first rather than accumulating.
        for existing in try await store.load() { try await store.delete(existing.id) }

        // Two pages of invented values under a printed header, the way a real
        // report arrives: a laboratory, an order number, a collection date, a
        // receipt date and an issue date that must not be preferred to it, and
        // a birth date that must never be taken at all.
        let pages = [1, 2].map {
            UIImage(cgImage: SyntheticSheet.render(.clean, page: $0, header: .standard))
          }
        let product = try await TextRecognizer.extract(from: pages)

        check(product.extraction.coded.count >= 14, "both pages coded (\(product.extraction.coded.count) values)")

        // The invariant that matters most, and the one whose absence let a row
        // disappear: every measurement printed on the sheet is accounted for,
        // as a coded value, an unmatched row or an unread line. A row in none
        // of the three is indistinguishable from a row that was never printed,
        // and the person holding the paper is the only one who could tell.
        let printed = SyntheticSheet.panel.count * 2
        let accounted =
          product.extraction.coded.count + product.extraction.unmapped.count
          + product.extraction.suspiciousLines.count
        check(
          accounted >= printed,
          "every printed row is accounted for (\(accounted) of \(printed))")

        // Measured on iOS 26.5: both Vision passes lose the lone `%` of the
        // HbA1c row, so it cannot be coded here. It must still be reported,
        // and its unit must never be guessed, because `%` is 4548-4 and
        // `mmol/mol` is 59261-8.
        let hba1c =
          product.extraction.coded.contains { $0.coding.loinc == "4548-4" }
          || product.extraction.unmapped.contains { $0.raw.label.contains("HbA1c") }
          || product.extraction.suspiciousLines.contains { $0.contains("HbA1c") }
        check(hba1c, "the HbA1c row reaches the reviewer, coded or reported")
        check(
          product.extraction.coded.allSatisfy { $0.raw.region != nil },
          "every coded value cites a region on the page")
        check(
          Set(product.extraction.coded.compactMap(\.raw.region?.page)) == [1, 2],
          "citations name both pages")
        check(product.pageTexts.count == 2, "the recognised text of both pages is kept")
        check(
          product.metadata.labDate == Self.expectedLabDate,
          "the lab date is the printed collection date")
        check(product.metadata.labDateRole == .collection, "and it is labelled as one")
        check(
          product.metadata.reportedOn == Self.expectedIssueDate,
          "the issue date is read but not preferred")
        check(product.metadata.laboratory != nil, "the laboratory is read off the header")
        check(ScanDocument.pageCount(of: product.pdf) == 2, "the pages became a two-page PDF")

        // The real save path, including the date the person would confirm.
        pending = product
        await confirm(
          title: "Self-test (synthetic)",
          labDate: product.metadata.labDate ?? Date(),
          laboratory: product.metadata.laboratory ?? "")
        await refresh()

        guard let saved = reports.first, reports.count == 1 else {
          check(false, "exactly one report saved")
          Log.diagnostics.error("self-test FAILED: nothing to verify")
          return
        }
        check(saved.collectedOn == Self.expectedLabDate, "the stored report carries the lab date")
        check(!saved.dateIsScanFallback, "and is not filed under the scan date")
        check(saved.metadata.dateSource == .printed, "the date's provenance is the sheet")
        check(saved.scan?.pageCount == 2, "the record knows it has a two-page scan")

        // Read back through the seal, which is the half a unit test cannot do.
        let scan = try await store.scan(for: saved.id)
        check(scan != nil, "the sealed scan decrypts")
        check(
          scan.map { ScanDocument.pageCount(of: $0) } == 2, "and is still a two-page PDF")
        check(
          scan.flatMap { ScanDocument.rasterise($0, page: 1, dpi: 150) } != nil,
          "and page 1 renders back to pixels")

        let diagnostics = try await store.diagnostics(for: saved.id)
        check(diagnostics != nil, "the sealed diagnostics record decrypts")
        if let diagnostics {
          check(diagnostics.pages.count == 2, "it holds both pages")
          check(
            diagnostics.pages.allSatisfy { !$0.cells.isEmpty && !$0.fragments.isEmpty },
            "each page holds both Vision passes")
          check(
            diagnostics.pages.allSatisfy { $0.layout != nil },
            "each page records the column layout the parser inferred")
          // The property the whole record exists for: everything after the
          // camera can be run again from it alone.
          check(
            ScanReplay.run(diagnostics) == saved.extraction,
            "replaying the record reproduces the extraction exactly")
        }

        let archive = try await DiagnosticsExport.build(reports: reports, store: store)
        let size =
          ((try? FileManager.default.attributesOfItem(atPath: archive.path))?[.size] as? Int) ?? 0
        check(size > 0, "the diagnostics archive builds (\(size) bytes)")
        try? FileManager.default.removeItem(at: archive)

        // The other input: a document the laboratory itself produced. Drawn
        // here as text, so the PDF has a real text layer, which is what
        // decides `lab-issued-digital` and therefore `final`. Getting that
        // branch wrong in the permissive direction would mark an OCR
        // transcription final, so it is asserted rather than assumed.
        let labPDF = Self.textLayerPDF()
        let imported = try await LabImport.pdf(labPDF)
        check(
          imported.extraction.source == .labIssuedDigital,
          "a PDF with the laboratory's own text layer is lab-issued")
        check(
          imported.extraction.source.observationStatus == "final",
          "and its values are final, not preliminary")
        check(
          imported.extraction.coded.count >= 8,
          "the whole panel codes from the text layer (\(imported.extraction.coded.count))")
        check(
          imported.extraction.coded.contains { $0.coding.loinc == "4548-4" },
          "including the HbA1c row whose percent sign the recogniser loses")
        check(
          imported.metadata.labDate == Self.expectedLabDate,
          "the header's collection date is read from the text layer too")
        check(imported.pdf == labPDF, "the laboratory's own file is what gets stored")
        check(
          ScanReplay.run(
            ScanDiagnostics(
              reportId: UUID(), createdAt: Date(),
              environment: ScanDiagnostics.Environment.current, pages: imported.pages,
              extraction: imported.extraction, metadata: imported.metadata))
            == imported.extraction,
          "and a text-layer import replays like a scan does")

        // A photograph must never be mistaken for a laboratory's own document.
        check(
          LabImport.textLayer(of: product.pdf) == nil,
          "a PDF of photographed pages has no text layer to trust")

        let artefacts = try ReportExport.write(saved, scan: scan)
        check(artefacts.withinEpaLimit, "the doctor export fits the ePA's 25 MB")
        check(
          ScanDocument.pageCount(of: try Data(contentsOf: artefacts.pdf)) >= 3,
          "and carries the original pages after the summary")
        check(
          ReportExport.fhirJSON(saved).contains("\"preliminary\""),
          "the FHIR bundle marks a scanned value preliminary")
        try? FileManager.default.removeItem(at: artefacts.pdf.deletingLastPathComponent())
      } catch {
        check(false, "the pipeline ran without throwing: \(error.localizedDescription)")
      }

      if failures.isEmpty {
        Log.diagnostics.notice("self-test passed")
      } else {
        Log.diagnostics.error("self-test FAILED: \(failures.count, privacy: .public) check(s)")
      }
    }
  }
#endif

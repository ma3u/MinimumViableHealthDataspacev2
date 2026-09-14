import Foundation
import Shared
import UIKit

/// Turns a stored report into something a doctor can actually receive.
///
/// This is the end of the journey in issue #186: there is no API into the ePA
/// for a non-DiGA, so the app ends in a file the citizen uploads. Everything
/// here is local. No cluster, no account, no network, which matters because the
/// one moment a person needs this is the moment they are sitting in front of
/// their GP.
///
/// Two files, deliberately:
///
/// - **A PDF** a human reads. The ePA accepts PDF and caps uploads at 25 MB.
/// - **A FHIR R4 bundle** for whatever can parse it.
///
/// One artefact would be tidier, and a PDF with a JSON attachment is what #186
/// describes, but a practice system that strips attachments would silently drop
/// the half that carries the codes. Two files cannot be silently halved.
enum ReportExport {

  /// The ePA's per-file limit. Asserted rather than assumed: a scan-heavy
  /// report that quietly exceeded it would fail at upload, in front of a
  /// doctor, with no explanation.
  static let epaFileSizeLimit = 25 * 1024 * 1024

  struct Artefacts {
    let pdf: URL
    let fhir: URL
    let pdfBytes: Int
    var withinEpaLimit: Bool { pdfBytes <= epaFileSizeLimit }
  }

  enum ExportError: LocalizedError {
    case nothingToExport
    case tooLarge(Int)

    var errorDescription: String? {
      switch self {
      case .nothingToExport:
        return String(localized: "This report has no coded values to export.")
      case let .tooLarge(bytes):
        return String(
          localized:
            "The document is \(bytes / 1024 / 1024) MB, over the 25 MB the ePA accepts.")
      }
    }
  }

  static func write(_ report: ReportStore.StoredReport) throws -> Artefacts {
    guard !report.extraction.coded.isEmpty else { throw ExportError.nothingToExport }

    let stamp = ISO8601DateFormatter()
    stamp.formatOptions = [.withYear, .withMonth, .withDay, .withDashSeparatorInDate]
    let day = stamp.string(from: report.collectedOn ?? report.scannedAt)
    let base = "Laborbefund-\(day)"
    let dir = FileManager.default.temporaryDirectory
      .appendingPathComponent("export-\(report.id.uuidString)", isDirectory: true)
    try? FileManager.default.removeItem(at: dir)
    try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)

    let pdfURL = dir.appendingPathComponent("\(base).pdf")
    let pdfData = renderPDF(report)
    guard pdfData.count <= epaFileSizeLimit else {
      throw ExportError.tooLarge(pdfData.count)
    }
    try pdfData.write(to: pdfURL, options: [.atomic, .completeFileProtection])

    let fhirURL = dir.appendingPathComponent("\(base).fhir.json")
    try Data(fhirJSON(report).utf8)
      .write(to: fhirURL, options: [.atomic, .completeFileProtection])

    return Artefacts(pdf: pdfURL, fhir: fhirURL, pdfBytes: pdfData.count)
  }

  // MARK: - FHIR

  static func fhirJSON(_ report: ReportStore.StoredReport) -> String {
    let date = ISO8601DateFormatter()
    date.formatOptions = [.withYear, .withMonth, .withDay, .withDashSeparatorInDate]
    let bundle = FhirWriter.buildBundle(
      values: report.extraction.coded,
      meta: FhirWriter.ReportMeta(
        // A local identifier, never an insurance number. The ePA already knows
        // whose record it is; repeating it here would add an identifier to a
        // file that travels.
        patientId: "meinbefund-local",
        effectiveDateTime: date.string(from: report.collectedOn ?? report.scannedAt),
        title: report.title),
      source: FhirWriter.TextSource(
        kind: report.extraction.source,
        sourceDocument: report.title,
        extractor: "ios-vision"),
      now: ISO8601DateFormatter().string(from: Date()))
    return bundle.canonical()
  }

  // MARK: - PDF

  /// A page a GP can read in fifteen seconds.
  ///
  /// Provenance is on the page, not in a footnote: every value here was read
  /// from a photograph and a doctor is entitled to know that before acting on
  /// it. The printed reference range is reproduced as the lab wrote it, never
  /// a standard range substituted for it (ADR-033 rule 1).
  static func renderPDF(_ report: ReportStore.StoredReport) -> Data {
    let pageWidth: CGFloat = 595, pageHeight: CGFloat = 842  // A4 at 72 dpi
    let margin: CGFloat = 48
    let renderer = UIGraphicsPDFRenderer(
      bounds: CGRect(x: 0, y: 0, width: pageWidth, height: pageHeight))

    let title = UIFont.boldSystemFont(ofSize: 18)
    let head = UIFont.boldSystemFont(ofSize: 10)
    let body = UIFont.systemFont(ofSize: 10)
    let small = UIFont.systemFont(ofSize: 8)

    let dates = DateFormatter()
    dates.dateStyle = .medium
    dates.timeStyle = .none

    return renderer.pdfData { context in
      var y: CGFloat = margin
      context.beginPage()

      func draw(_ text: String, _ font: UIFont, x: CGFloat, width: CGFloat? = nil,
                colour: UIColor = .black) {
        let attrs: [NSAttributedString.Key: Any] = [.font: font, .foregroundColor: colour]
        let w = width ?? (pageWidth - margin - x)
        let rect = CGRect(x: x, y: y, width: w, height: .greatestFiniteMagnitude)
        let size = (text as NSString).boundingRect(
          with: CGSize(width: w, height: .greatestFiniteMagnitude),
          options: [.usesLineFragmentOrigin], attributes: attrs, context: nil)
        (text as NSString).draw(with: rect, options: [.usesLineFragmentOrigin],
                                attributes: attrs, context: nil)
        y += size.height
      }

      func newPageIfNeeded(_ needed: CGFloat = 40) {
        if y > pageHeight - margin - needed {
          context.beginPage()
          y = margin
        }
      }

      draw(report.title, title, x: margin)
      y += 6
      draw(
        String(
          localized: "Collected \(dates.string(from: report.collectedOn ?? report.scannedAt))"),
        body, x: margin)
      y += 14

      // The provenance banner. First thing on the page, because it changes how
      // everything below should be read.
      let provenance =
        report.extraction.source == .labIssuedDigital
        ? String(localized: "Read from the laboratory's own digital document.")
        : String(
          localized:
            "Transcribed from a photograph by on-device text recognition. Values are preliminary and have not been verified against the paper.")
      draw(provenance, small, x: margin, colour: .darkGray)
      y += 16

      let columns: [CGFloat] = [margin, 250, 330, 410]
      draw(String(localized: "Analyte"), head, x: columns[0], width: 195)
      y -= 12
      draw(String(localized: "Result"), head, x: columns[1], width: 75)
      y -= 12
      draw(String(localized: "Unit"), head, x: columns[2], width: 75)
      y -= 12
      draw(String(localized: "Reference (as printed)"), head, x: columns[3])
      y += 6

      for value in report.extraction.coded {
        newPageIfNeeded()
        let startY = y
        draw(value.raw.label, body, x: columns[0], width: 195)
        let rowHeight = y - startY
        y = startY
        let comparator = value.raw.comparator?.rawValue ?? ""
        draw("\(comparator)\(number(value.raw.value))", body, x: columns[1], width: 75)
        y = startY
        draw(value.coding.ucum, body, x: columns[2], width: 75)
        y = startY
        draw(referenceText(value) ?? String(localized: "none printed"), body, x: columns[3])
        y = startY + max(rowHeight, 13)
        draw("LOINC \(value.coding.loinc)", small, x: columns[0], colour: .darkGray)
        y += 4
      }

      y += 12
      newPageIfNeeded(90)

      if report.extraction.needsReview > 0 {
        // Not hidden. A line the extractor could not read is exactly the line a
        // clinician should check on the original, and omitting it would make an
        // incomplete transcription look complete.
        draw(
          String(localized: "\(report.extraction.needsReview) line(s) could not be coded"),
          head, x: margin)
        y += 2
        for unmapped in report.extraction.unmapped.prefix(20) {
          newPageIfNeeded()
          draw("· \(unmapped.raw.line)  (\(unmapped.reason.explanation))", small,
               x: margin, colour: .darkGray)
        }
        for line in report.extraction.suspiciousLines.prefix(20) {
          newPageIfNeeded()
          draw("· \(line)", small, x: margin, colour: .darkGray)
        }
        y += 12
      }

      newPageIfNeeded(60)
      draw(
        String(
          localized:
            "Produced by MeinBefund on this device. Not a diagnosis and not a medical device. A machine-readable FHIR R4 bundle accompanies this document."),
        small, x: margin, colour: .darkGray)
    }
  }

  private static func number(_ value: Double) -> String {
    value == value.rounded() ? String(Int(value)) : String(format: "%.2f", value)
  }

  private static func referenceText(_ value: CodedLabValue) -> String? {
    switch (value.raw.referenceLow, value.raw.referenceHigh) {
    case let (low?, high?): return "\(number(low)) – \(number(high))"
    case let (nil, high?): return "< \(number(high))"
    case let (low?, nil): return "> \(number(low))"
    default: return nil
    }
  }
}

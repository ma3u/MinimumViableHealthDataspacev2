import Shared
import SwiftUI

/// Review before saving. Nothing is stored until the user has seen what was read.
///
/// The report's own date is confirmed here, every time. The first real scan
/// (#186) was filed under the day it was photographed; a stack of paper going
/// back years is not a stack of results from this month. The date read from
/// the sheet is offered, its evidence shown, and the person decides.
struct ReviewSheet: View {
  let product: ScanProduct
  let onConfirm: (_ title: String, _ labDate: Date, _ laboratory: String) -> Void
  let onDiscard: () -> Void

  @State private var title = ""
  @State private var laboratory: String
  @State private var labDate: Date

  init(
    product: ScanProduct,
    onConfirm: @escaping (_ title: String, _ labDate: Date, _ laboratory: String) -> Void,
    onDiscard: @escaping () -> Void
  ) {
    self.product = product
    self.onConfirm = onConfirm
    self.onDiscard = onDiscard
    _laboratory = State(initialValue: product.metadata.laboratory ?? "")
    _labDate = State(initialValue: product.metadata.labDate ?? Date())
  }

  private var defaultTitle: String {
    let lab = laboratory.trimmingCharacters(in: .whitespaces)
    if !lab.isEmpty { return lab }
    // What the document calls itself, when it says: a laboratory's name, or
    // the kind of screen a reading came from.
    return product.suggestedTitle ?? String(localized: "Lab report")
  }

  var body: some View {
    NavigationStack {
      Form {
        Section {
          TextField("Title", text: $title, prompt: Text(defaultTitle))
          TextField("Laboratory", text: $laboratory, prompt: Text("Laboratory or practice"))
          DatePicker("Lab date", selection: $labDate, in: ...Date(), displayedComponents: .date)
        } header: {
          Text("Report")
        } footer: {
          VStack(alignment: .leading, spacing: 6) {
            if let evidence = product.metadata.labDateEvidence {
              Text("Read from the sheet: \(evidence.line)")
            } else {
              Text(
                "No date was found on the sheet. Set the date printed on the report; the day of the scan is not the day of the result."
              )
            }
            // What the values are worth depends on where they came from, and
            // saying "read from a photo" over a laboratory's own PDF would be
            // false in the direction that matters.
            if product.extraction.source == .labIssuedDigital {
              Text(
                "These values come from the laboratory's own document, so they are final rather than a transcription."
              )
            } else {
                Text("These values were read from a photo and are preliminary, not confirmed.")
            }
            if !product.extraReports.isEmpty {
              // Saying so before the tap, because a person who saves one
              // report and finds three should have been told.
              Text(
                "\(product.extraReports.count) further report(s) carry a different measurement date and will be saved alongside this one."
              )
            }
          }
        }

        ResultSections(extraction: product.extraction)
      }
      .navigationTitle("Reviewed?")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button("Discard", role: .destructive, action: onDiscard)
        }
        ToolbarItem(placement: .confirmationAction) {
          Button("Save") {
            onConfirm(title.isEmpty ? defaultTitle : title, labDate, laboratory)
          }
        }
      }
    }
  }
}

struct ResultList: View {
  let report: LabReport
  /// Which sex-specific published ranges apply, from the profile.
  var sex: RangeSex = .any
  /// Opens the stored pages; nil when the record has none.
  let onOpenScan: (() -> Void)?

  var body: some View {
    Form {
      ReportDetails(report: report, onOpenScan: onOpenScan)
      ResultSections(extraction: report.extraction, sex: sex)
      // Guideline 1.4.1 asks that a medical app remind people to check with a
      // doctor before acting. The moment that matters is while they are looking
      // at their own numbers, so it lives here rather than in a settings screen
      // nobody opens.
      Section { DoctorReminder() }
    }
    .navigationTitle(report.title)
    .navigationBarTitleDisplayMode(.inline)
  }
}

/// What the sheet said about itself, and the way back to the sheet.
private struct ReportDetails: View {
  let report: LabReport
  let onOpenScan: (() -> Void)?

  private func day(_ date: Date) -> String {
    date.formatted(date: .abbreviated, time: .omitted)
  }

  var body: some View {
    Section {
      if let laboratory = report.metadata.laboratory {
        LabeledContent("Laboratory", value: laboratory)
      }
      LabeledContent("Lab date", value: day(report.effectiveDate))
      if let received = report.metadata.receivedOn {
        LabeledContent("Received", value: day(received))
      }
      if let reported = report.metadata.reportedOn {
        LabeledContent("Issued", value: day(reported))
      }
      if let number = report.metadata.reportNumber {
        LabeledContent("Report number", value: number)
      }
      if let physician = report.metadata.orderingPhysician {
        LabeledContent("Ordered by", value: physician)
      }
      LabeledContent("Scanned", value: day(report.scannedAt))
      // A value recovered from a chart is worth less than one the screen
      // named, and the report says which it is holding rather than leaving a
      // reader to work it out from the dates.
      switch report.metadata.dateSource {
      case .chartMonth:
        Text("Read from the chart on a device's screen. Each value is known to the month it sits over, not to the day.")
          .font(.caption)
          .foregroundStyle(.secondary)
      case .chartEstimate:
        Text("Measured off the chart on a device's screen, which printed no number beside these points. The values are estimates and are known to the month, not to the day.")
          .font(.caption)
          .foregroundStyle(.secondary)
      default:
        EmptyView()
      }
      if let scan = report.scan, let onOpenScan {
        Button(action: onOpenScan) {
          Label("Original scan, \(scan.pageCount) page(s)", systemImage: "doc.richtext")
        }
      }
    } header: {
      Text("Report")
    } footer: {
      if report.dateIsScanFallback {
        Text("The scan date stands in for a lab date that was never confirmed.")
      }
    }
  }
}

/// The three outcomes, always all three.
///
/// Coded, unmapped and unparsed are shown together because a value silently
/// dropped is indistinguishable from a value that was never on the sheet, and
/// the person holding the paper is the only one who can tell the difference.
struct ResultSections: View {
  let extraction: ExtractionResult
  var sex: RangeSex = .any

  /// `UnmappedReason.explanation` is the wire wording, shared with
  /// `services/epa-ingest` and written into a PDF export, so it stays English
  /// and stays put. What a reader sees is translated here instead. Handing the
  /// wire string to `Text` compiles, renders, and quietly shows English on a
  /// German phone, because a `String` variable is not a localisation key.
  private func localised(_ reason: UnmappedReason) -> String {
    switch reason {
    case .unknownAnalyte: String(localized: "not in the analyte dictionary")
    case .unknownUnit: String(localized: "unit has no UCUM mapping")
    case .unitMismatch: String(localized: "unit does not belong to this analyte")
    case .specimenNotSupported: String(localized: "specimen is not blood, plasma or serum")
    }
  }

  var body: some View {
    Section {
      ForEach(Array(extraction.coded.enumerated()), id: \.offset) { _, value in
        CodedRow(value: value, sex: sex)
      }
    } header: {
      Label("\(extraction.coded.count) recognised", systemImage: "checkmark.circle")
    }

    if !extraction.unmapped.isEmpty {
      Section {
        ForEach(Array(extraction.unmapped.enumerated()), id: \.offset) { _, item in
          VStack(alignment: .leading, spacing: 2) {
            Text("\(item.raw.label)  \(formatted(item.raw.value)) \(item.raw.unitRaw)")
            Text(localised(item.reason))
              .font(.caption)
              .foregroundStyle(.secondary)
          }
        }
      } header: {
        Label("\(extraction.unmapped.count) unmatched", systemImage: "questionmark.circle")
      } footer: {
        Text("These lines were read but matched no LOINC code. They are not discarded.")
      }
    }

    if !extraction.suspiciousLines.isEmpty {
      Section {
        ForEach(Array(extraction.suspiciousLines.enumerated()), id: \.offset) { _, line in
          Text(line).font(.caption.monospaced())
        }
      } header: {
        Label("\(extraction.suspiciousLines.count) unread", systemImage: "exclamationmark.triangle")
      } footer: {
        Text("These lines looked like measurements but could not be read.")
      }
    }
  }

  private func formatted(_ value: Double) -> String {
    value == value.rounded() ? String(Int(value)) : String(format: "%.2f", value)
  }
}

private struct CodedRow: View {
  let value: CodedLabValue
  var sex: RangeSex = .any

  var body: some View {
    VStack(alignment: .leading, spacing: 4) {
      HStack {
        Text(value.raw.label).font(.body)
        Spacer()
        Text(
          "\(value.raw.comparator?.rawValue ?? "")\(formatted(value.raw.value)) \(UnitText.display(value.coding.ucum))"
        )
          .font(.body.monospacedDigit().weight(.medium))
      }
      HStack(spacing: 6) {
        Text(value.coding.codeLabel)
        if let range = referenceText {
          Text("·")
          // Printed verbatim, never normalised: a reference range is lab- and
          // assay-specific (ADR-033).
          Text("Ref. \(range)")
        }
        if let region = value.raw.region {
          Text("·")
          // Where on the paper this came from, so the number can be checked
          // against the source rather than trusted (#186 criterion 5).
          Text("p. \(region.page), line \(rowOrdinal(region))")
        }
      }
      .font(.caption)
      .foregroundStyle(.secondary)

      // The published band, *alongside* the printed range and never in place
      // of it (ADR-033 rule 1). Named, sourced, and never called normal or
      // abnormal: it is a comparison to a number somebody published.
      if let range = published, let optimal = range.optimalText(formatter: Measurement.text) {
        HStack(spacing: 6) {
          // A symbol as well as a colour, so the distinction survives for a
          // reader who cannot tell the hues apart, and the words carry the
          // same information either way.
          Image(systemName: RangePalette.symbol(for: placement))
          Text("Optimal \(optimal) · \(placement.label)")
        }
        .font(.caption2)
        .foregroundStyle(RangePalette.colour(for: placement))
      }
    }
    .padding(.vertical, 2)
  }

  private var published: ReferenceRange? {
    ReferenceRanges.range(
      analyteKey: value.coding.analyteKey, ucum: value.coding.ucum, sex: sex)
  }

  private var placement: RangePlacement {
    published?.placement(of: value.raw.value) ?? .noRange
  }

  /// Turns a normalised y into a human row number counted from the top.
  ///
  /// Vision's origin is bottom left, so the top of the page is y = 1. Showing
  /// the raw coordinate would be honest and useless; showing a row counted the
  /// way a person reads is the point of the citation.
  private func rowOrdinal(_ region: SourceRegion) -> Int {
    max(1, Int(((1.0 - region.midY) / 0.03).rounded()) + 1)
  }

  private var referenceText: String? {
    switch (value.raw.referenceLow, value.raw.referenceHigh) {
    case let (low?, high?): return "\(formatted(low)) – \(formatted(high))"
    case let (nil, high?): return "< \(formatted(high))"
    case let (low?, nil): return "> \(formatted(low))"
    default: return nil
    }
  }

  private func formatted(_ value: Double) -> String {
    value == value.rounded() ? String(Int(value)) : String(format: "%g", value)
  }
}

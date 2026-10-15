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
  /// The reports already stored, to tell the person when this scan is one of
  /// them (`DuplicateReports`).
  var existing: [LabReport] = []
  let onConfirm:
    (_ title: String, _ labDate: Date, _ laboratory: String, _ removing: UUID?) -> Void
  let onDiscard: () -> Void

  @State private var title = ""
  @State private var laboratory: String
  @State private var labDate: Date
  @State private var duplicate: DuplicateReports.Match?

  init(
    product: ScanProduct,
    existing: [LabReport] = [],
    onConfirm: @escaping (
      _ title: String, _ labDate: Date, _ laboratory: String, _ removing: UUID?
    ) -> Void,
    onDiscard: @escaping () -> Void
  ) {
    self.product = product
    self.existing = existing
    self.onConfirm = onConfirm
    self.onDiscard = onDiscard
    _laboratory = State(initialValue: product.metadata.laboratory ?? "")
    _labDate = State(initialValue: product.metadata.labDate ?? Date())
    // A suggested name, filled in so it can be kept or changed: the kind of
    // report the values make and the laboratory, or what a device's screen
    // calls itself.
    _title = State(
      initialValue: product.extraction.source == .selfTracked
        ? (product.suggestedTitle ?? "")
        : ReportSuggestion.title(
          coded: product.extraction.coded, laboratory: product.metadata.laboratory,
          fallback: product.suggestedTitle))
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
            Text("Name and laboratory are suggested from the scan. Change them as you like.")
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
            if !product.unreadablePages.isEmpty {
              // A blurred page reads as nonsense, and its values and dates
              // with it; it was left out, and only a new photograph helps.
              Text(
                "Page \(product.unreadablePages.map(String.init).joined(separator: ", ")) was too blurred to read and was left out. Discard this scan and photograph it again, holding the phone still."
              )
              .foregroundStyle(.orange)
              .accessibilityIdentifier("unreadable-pages")
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
            // The scan as it would be stored, compared with what is.
            let candidate = LabReport(
              id: UUID(), scannedAt: Date(), collectedOn: ReportMetadata.calendarDay(labDate),
              title: finalTitle, extraction: product.extraction, metadata: product.metadata)
            if let match = DuplicateReports.matches(for: candidate, among: existing).first {
              duplicate = match
            } else {
              onConfirm(finalTitle, labDate, laboratory, nil)
            }
          }
        }
      }
      // An alert rather than a confirmation dialog: three choices, and the
      // way out has to be a button.
      .alert(
        duplicateTitle,
        isPresented: Binding(get: { duplicate != nil }, set: { if !$0 { duplicate = nil } }),
        presenting: duplicate
      ) { match in
        switch match.relation {
        case .supersedes:
          Button("Save and delete the older scan", role: .destructive) {
            onConfirm(finalTitle, labDate, laboratory, match.existing.id)
          }
          Button("Save and keep both") { onConfirm(finalTitle, labDate, laboratory, nil) }
        case .identical, .contained:
          Button("Don't save", role: .destructive) { onDiscard() }
          if match.relation == .identical, match.redundant.id == match.existing.id {
            Button("Save and delete the older copy") {
              onConfirm(finalTitle, labDate, laboratory, match.existing.id)
            }
          }
          Button("Save anyway") { onConfirm(finalTitle, labDate, laboratory, nil) }
        }
        Button("Cancel", role: .cancel) {}
      } message: { match in
        Text(Self.describe(match))
      }
    }
  }

  private var finalTitle: String { title.isEmpty ? defaultTitle : title }

  private var duplicateTitle: String {
    duplicate?.relation == .supersedes
      ? String(localized: "This scan reads more of a report you have")
      : String(localized: "Already on this phone")
  }

  static func describe(_ match: DuplicateReports.Match) -> String {
    let date = match.existing.effectiveDate.formatted(date: .abbreviated, time: .omitted)
    let count = Duplicates.keys(of: match.existing).count
    switch match.relation {
    case .identical:
      return String(
        localized:
          "“\(match.existing.title)” of \(date) has the same \(count) values. Saving this scan would show each of them twice.")
    case .contained:
      return String(
        localized:
          "Every value of this scan is already in “\(match.existing.title)” of \(date). Saving it would show them twice.")
    case .supersedes:
      return String(
        localized:
          "All \(count) values of “\(match.existing.title)” of \(date) are in this scan as well, and this scan reads more. The older scan is no longer needed.")
    }
  }
}

struct ResultList: View {
  let report: LabReport
  /// Which sex-specific published ranges apply, from the profile.
  var sex: RangeSex = .any
  /// Opens the stored pages; nil when the record has none.
  let onOpenScan: (() -> Void)?
  /// Stores a corrected extraction; nil where the list is read-only.
  var onChange: ((ExtractionResult) -> Void)? = nil

  @State private var editing: EditTarget?

  private func raw(_ target: EditTarget) -> RawLabValue? {
    switch target {
    case .coded(let i): report.extraction.coded.indices.contains(i) ? report.extraction.coded[i].raw : nil
    case .unmapped(let i):
      report.extraction.unmapped.indices.contains(i) ? report.extraction.unmapped[i].raw : nil
    }
  }

  var body: some View {
    Form {
      ReportDetails(report: report, onOpenScan: onOpenScan)
      if onChange != nil, !report.extraction.coded.isEmpty {
        let checked = report.extraction.coded.filter { $0.verification != nil }.count
        Section {
          Text("Tap a value to correct its name, number or unit against the paper.")
            .font(.caption).foregroundStyle(.secondary)
          if checked < report.extraction.coded.count {
            Button {
              onChange?(report.extraction.verifyingAll())
            } label: {
              Label("Mark all values as checked", systemImage: "checkmark.seal")
            }
            .accessibilityIdentifier("verify-all")
          } else {
            Label("All values checked against the paper", systemImage: "checkmark.seal.fill")
              .foregroundStyle(.green)
          }
        }
      }
      ResultSections(
        extraction: report.extraction, sex: sex,
        onEdit: onChange == nil ? nil : { editing = $0 })
      // Guideline 1.4.1 asks that a medical app remind people to check with a
      // doctor before acting. The moment that matters is while they are looking
      // at their own numbers, so it lives here rather than in a settings screen
      // nobody opens.
      Section { DoctorReminder() }
    }
    .navigationTitle(report.title)
    .navigationBarTitleDisplayMode(.inline)
    .sheet(item: $editing) { target in
      if let raw = raw(target) {
        EditValueSheet(
          raw: raw, source: report.extraction.source,
          alreadyVerified: {
            if case .coded(let i) = target { return report.extraction.coded[i].verification != nil }
            return false
          }(),
          onSave: { outcome in
            switch target {
            case .coded(let i): onChange?(report.extraction.replacingCoded(at: i, with: outcome))
            case .unmapped(let i): onChange?(report.extraction.replacingUnmapped(at: i, with: outcome))
            }
            editing = nil
          },
          onCancel: { editing = nil })
      }
    }
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
  /// Opens a value for correction; nil where the values cannot be changed.
  var onEdit: ((EditTarget) -> Void)? = nil

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
      ForEach(Array(extraction.coded.enumerated()), id: \.offset) { index, value in
        if let onEdit {
          Button { onEdit(.coded(index)) } label: { CodedRow(value: value, sex: sex) }
            .buttonStyle(.plain)
            .accessibilityIdentifier("coded-row-\(index)")
        } else {
          CodedRow(value: value, sex: sex)
        }
      }
    } header: {
      Label("\(extraction.coded.count) recognised", systemImage: "checkmark.circle")
    }

    if !extraction.unmapped.isEmpty {
      Section {
        ForEach(Array(extraction.unmapped.enumerated()), id: \.offset) { index, item in
          let row = VStack(alignment: .leading, spacing: 2) {
            Text("\(item.raw.label)  \(formatted(item.raw.value)) \(item.raw.unitRaw)")
            Text(localised(item.reason))
              .font(.caption)
              .foregroundStyle(.secondary)
          }
          if let onEdit {
            Button { onEdit(.unmapped(index)) } label: { row }
              .buttonStyle(.plain)
              .accessibilityIdentifier("unmapped-row-\(index)")
          } else {
            row
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
        if let check = value.verification {
          // Checked by the person, and corrected if the pencil shows.
          Image(systemName: check.edited ? "pencil.and.outline" : "checkmark.seal.fill")
            .foregroundStyle(.green)
            .accessibilityLabel(check.edited ? Text("Corrected by you") : Text("Checked by you"))
        }
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
    PrintedReference.text(of: value.raw, number: formatted)
  }

  private func formatted(_ value: Double) -> String {
    value == value.rounded() ? String(Int(value)) : String(format: "%g", value)
  }
}

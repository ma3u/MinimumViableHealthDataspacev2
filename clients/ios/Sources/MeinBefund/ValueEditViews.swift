import Shared
import SwiftUI

/// Which value a person is correcting: one the dictionary coded, or one it
/// could not.
enum EditTarget: Identifiable, Equatable {
  case coded(Int)
  case unmapped(Int)

  var id: String {
    switch self {
    case .coded(let index): "c\(index)"
    case .unmapped(let index): "u\(index)"
    }
  }
}

/// Correct a value's name, number or unit, and confirm it against the paper.
///
/// The printed line stays on screen, because it is what the person checks
/// against, and the code the corrected name takes is shown before saving, so
/// a name that no longer matches anything is visible as such.
struct EditValueSheet: View {
  let raw: RawLabValue
  let source: SourceKind
  /// Whether the value was already confirmed: the button then says so.
  let alreadyVerified: Bool
  let onSave: (ValueEditing.Outcome) -> Void
  let onCancel: () -> Void

  @State private var label: String
  @State private var number: String
  @State private var unit: String

  init(
    raw: RawLabValue, source: SourceKind, alreadyVerified: Bool,
    onSave: @escaping (ValueEditing.Outcome) -> Void, onCancel: @escaping () -> Void
  ) {
    self.raw = raw
    self.source = source
    self.alreadyVerified = alreadyVerified
    self.onSave = onSave
    self.onCancel = onCancel
    _label = State(initialValue: raw.label)
    _number = State(initialValue: Measurement.text(raw.value))
    _unit = State(initialValue: raw.unitRaw)
  }

  private var parsedNumber: Double? { LabLineParser.parseNumber(number) }

  private var preview: ValueEditing.Outcome? {
    guard let value = parsedNumber else { return nil }
    return ValueEditing.edit(raw, label: label, value: value, unit: unit, source: source)
  }

  var body: some View {
    NavigationStack {
      Form {
        Section {
          TextField("Name", text: $label)
            .accessibilityIdentifier("edit-label")
          TextField("Value", text: $number)
            .keyboardType(.decimalPad)
            .accessibilityIdentifier("edit-value")
          TextField("Unit", text: $unit)
            .textInputAutocapitalization(.never)
            .autocorrectionDisabled()
            .accessibilityIdentifier("edit-unit")
        } header: {
          Text("As on the paper")
        } footer: {
          VStack(alignment: .leading, spacing: 6) {
            Text("Read from: \(raw.line)")
            if parsedNumber == nil {
              Text("Enter the value as a number.").foregroundStyle(.red)
            }
          }
        }

        Section {
          switch preview {
          case .coded(let value)?:
            LabeledContent("Code", value: value.coding.codeLabel)
          case .unmapped(let value)?:
            Text("No code for this name and unit. The value is kept as unmatched.")
              .foregroundStyle(.secondary)
            Text(value.raw.label).font(.caption).foregroundStyle(.secondary)
          case nil:
            EmptyView()
          }
        } footer: {
          Text(
            "Saving marks the value as checked by you. Your correction is kept beside what the scan read; the scan itself is not changed."
          )
        }
      }
      .navigationTitle("Check value")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button("Cancel", action: onCancel)
        }
        ToolbarItem(placement: .confirmationAction) {
          Button(alreadyVerified ? "Save" : "Save as checked") {
            if let preview { onSave(preview) }
          }
          .disabled(preview == nil || label.trimmingCharacters(in: .whitespaces).isEmpty)
          .accessibilityIdentifier("edit-save")
        }
      }
    }
  }
}

/// The report's own name and laboratory, which the person can change.
struct EditReportSheet: View {
  let report: LabReport
  let onSave: (_ title: String, _ laboratory: String) -> Void
  let onCancel: () -> Void

  @State private var title: String
  @State private var laboratory: String

  init(
    report: LabReport, onSave: @escaping (_ title: String, _ laboratory: String) -> Void,
    onCancel: @escaping () -> Void
  ) {
    self.report = report
    self.onSave = onSave
    self.onCancel = onCancel
    _title = State(initialValue: report.title)
    _laboratory = State(initialValue: report.metadata.laboratory ?? "")
  }

  private var suggestion: String {
    ReportSuggestion.title(
      coded: report.extraction.coded,
      laboratory: laboratory.isEmpty ? report.metadata.laboratory : laboratory)
  }

  var body: some View {
    NavigationStack {
      Form {
        Section {
          TextField("Title", text: $title)
            .accessibilityIdentifier("report-title")
          TextField("Laboratory", text: $laboratory, prompt: Text("Laboratory or practice"))
            .accessibilityIdentifier("report-laboratory")
        } footer: {
          if suggestion != title {
            Button("Use the suggestion: \(suggestion)") { title = suggestion }
              .font(.caption)
          }
        }
      }
      .navigationTitle("Name and laboratory")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) { Button("Cancel", action: onCancel) }
        ToolbarItem(placement: .confirmationAction) {
          Button("Save") { onSave(title, laboratory) }
            .disabled(title.trimmingCharacters(in: .whitespaces).isEmpty)
        }
      }
    }
  }
}

/// A GitHub issue about values the app did not read, drafted with every digit
/// masked and no name, date or laboratory in it (`FeedbackIssue`). The person
/// reads and edits the whole text; GitHub opens in the browser, and the
/// person sends it from there.
struct FeedbackSheet: View {
  let report: LabReport
  let onClose: () -> Void

  @Environment(\.openURL) private var openURL
  @State private var note = ""
  @State private var body_ = ""
  @State private var title = ""

  private static var build: String {
    let info = Bundle.main.infoDictionary
    let version = info?["CFBundleShortVersionString"] as? String ?? "?"
    let build = info?["CFBundleVersion"] as? String ?? "?"
    return "\(version) (\(build))"
  }

  private func redraft() {
    let draft = FeedbackIssue.draft(report: report, note: note, build: Self.build)
    title = draft.title
    body_ = draft.body
  }

  var body: some View {
    NavigationStack {
      Form {
        Section {
          TextField(
            "Which values are missing or wrong? Name them, not their numbers.", text: $note,
            axis: .vertical
          )
          .lineLimit(3...6)
          .onChange(of: note) { _, _ in redraft() }
          .accessibilityIdentifier("feedback-note")
        } header: {
          Text("What is missing")
        }
        Section {
          TextField("Title", text: $title, axis: .vertical)
          TextEditor(text: $body_)
            .font(.caption.monospaced())
            .frame(minHeight: 220)
            .accessibilityIdentifier("feedback-body")
        } header: {
          Text("The issue, as it will be sent")
        } footer: {
          Text(
            "GitHub issues are public. Every digit is replaced by #, and the report's title, laboratory, dates and your name are left out. Read it through and remove anything you do not want to share. GitHub opens in your browser, and you send the issue from there with your GitHub account."
          )
        }
      }
      .navigationTitle("Report missing values")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) { Button("Cancel", action: onClose) }
        ToolbarItem(placement: .confirmationAction) {
          Button("Open in GitHub") {
            if let url = FeedbackIssue.url(title: title, body: body_) { openURL(url) }
            onClose()
          }
          .accessibilityIdentifier("feedback-open")
        }
      }
      .onAppear(perform: redraft)
    }
  }
}

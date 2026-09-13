import Shared
import SwiftUI

/// Review before saving. Nothing is stored until the user has seen what was read.
struct ReviewSheet: View {
  let extraction: ExtractionResult
  let onConfirm: (String) -> Void
  let onDiscard: () -> Void

  @State private var title = ""

  var body: some View {
    NavigationStack {
      Form {
        Section {
          TextField("Title", text: $title, prompt: Text("Lab report"))
        } footer: {
          Text("These values were read from a photo and are preliminary, not confirmed.")
        }

        ResultSections(extraction: extraction)
      }
      .navigationTitle("Reviewed?")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button("Discard", role: .destructive, action: onDiscard)
        }
        ToolbarItem(placement: .confirmationAction) {
          Button("Save") { onConfirm(title) }
        }
      }
    }
  }
}

struct ResultList: View {
  let extraction: ExtractionResult
  let title: String

  var body: some View {
    Form { ResultSections(extraction: extraction) }
      .navigationTitle(title)
      .navigationBarTitleDisplayMode(.inline)
  }
}

/// The three outcomes, always all three.
///
/// Coded, unmapped and unparsed are shown together because a value silently
/// dropped is indistinguishable from a value that was never on the sheet, and
/// the person holding the paper is the only one who can tell the difference.
struct ResultSections: View {
  let extraction: ExtractionResult

  var body: some View {
    Section {
      ForEach(Array(extraction.coded.enumerated()), id: \.offset) { _, value in
        CodedRow(value: value)
      }
    } header: {
      Label("\(extraction.coded.count) recognised", systemImage: "checkmark.circle")
    }

    if !extraction.unmapped.isEmpty {
      Section {
        ForEach(Array(extraction.unmapped.enumerated()), id: \.offset) { _, item in
          VStack(alignment: .leading, spacing: 2) {
            Text("\(item.raw.label)  \(formatted(item.raw.value)) \(item.raw.unitRaw)")
            Text(item.reason.explanation)
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

  var body: some View {
    VStack(alignment: .leading, spacing: 4) {
      HStack {
        Text(value.raw.label).font(.body)
        Spacer()
        Text("\(value.raw.comparator?.rawValue ?? "")\(formatted(value.raw.value)) \(value.coding.ucum)")
          .font(.body.monospacedDigit().weight(.medium))
      }
      HStack(spacing: 6) {
        Text("LOINC \(value.coding.loinc)")
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
    }
    .padding(.vertical, 2)
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

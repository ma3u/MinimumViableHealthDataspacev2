import Shared
import SwiftUI

/// What a guideline says, and what the evidence calls optimal.
///
/// Every range on this screen is quoted from a named source with a link, and
/// an analyte with no citable source is not on it. That is the whole
/// difference between this and the longevity sites it was modelled on: their
/// numbers cannot be checked, and these can.
///
/// It is a reading screen, not a verdict screen. It shows no value of yours
/// and makes no judgement; the comparison to your own values happens on the
/// report, next to the range your laboratory printed, which stays the primary
/// one (ADR-033 rule 1).
struct ReferenceValuesView: View {
  let onClose: () -> Void

  @State private var sex: RangeSex = RangePreferences.sex

  var body: some View {
    NavigationStack {
      List {
        Section {
          Picker("Ranges for", selection: $sex) {
            ForEach(RangeSex.allCases, id: \.self) { Text($0.label).tag($0) }
          }
          .onChange(of: sex) { _, value in RangePreferences.sex = value }
        } footer: {
          Text(
            "Some published ranges differ by sex. Without an answer only the ranges that apply to everyone are shown. This stays on your device."
          )
        }

        ForEach(ReferenceRanges.groups(), id: \.group) { group, ranges in
          Section(group.title) {
            ForEach(applicable(ranges)) { range in
              RangeRow(range: range)
            }
          }
        }

        Section {
          DoctorReminder()
        } footer: {
          Text(
            "These are published thresholds for adults, not targets set for you. The range printed on your own report comes from your laboratory's own method and population, and it is the one your doctor reads."
          )
        }
      }
      .navigationTitle("Reference values")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .confirmationAction) { Button("Done", action: onClose) }
      }
    }
  }

  /// Sex-specific entries only when they match the answer given.
  private func applicable(_ ranges: [ReferenceRange]) -> [ReferenceRange] {
    ranges.filter { $0.sex == .any || $0.sex == sex }
  }
}

private struct RangeRow: View {
  let range: ReferenceRange

  var body: some View {
    VStack(alignment: .leading, spacing: 6) {
      HStack(alignment: .firstTextBaseline) {
        Text(AnalyteNames.title(range.analyteKey))
          .font(.body.weight(.medium))
        Spacer()
        Text(range.ucum).font(.caption).foregroundStyle(.secondary)
      }

      HStack(spacing: 18) {
        if let guideline = range.guidelineText(formatter: Measurement.text) {
          Labelled(title: String(localized: "Guideline"), value: guideline)
        }
        if let optimal = range.optimalText(formatter: Measurement.text),
          optimal != range.guidelineText(formatter: Measurement.text)
        {
          Labelled(title: String(localized: "Optimal"), value: optimal, tint: .green)
        }
      }

      Text(range.summary).font(.caption).foregroundStyle(.secondary)

      Link(destination: URL(string: range.source.url)!) {
        HStack(spacing: 4) {
          Image(systemName: "text.book.closed")
          Text("\(range.basis.label): \(range.source.label)")
        }
        .font(.caption2)
      }
    }
    .padding(.vertical, 4)
  }
}

private struct Labelled: View {
  let title: String
  let value: String
  var tint: Color = .primary

  var body: some View {
    VStack(alignment: .leading, spacing: 1) {
      Text(title).font(.caption2).foregroundStyle(.secondary)
      Text(value).font(.callout.monospacedDigit().weight(.medium)).foregroundStyle(tint)
    }
  }
}

/// A readable name per analyte key, for screens that have no printed label.
///
/// The dictionary's keys are machine words (`cholesterol-ldl`) and its display
/// strings are LOINC's (`Cholesterol in LDL [Mass/volume] in Serum or Plasma`),
/// which is right for a FHIR bundle and wrong for a person.
enum AnalyteNames {
  static func title(_ analyteKey: String) -> String {
    switch analyteKey {
    case "cholesterol-total": return String(localized: "Total cholesterol")
    case "cholesterol-ldl": return String(localized: "LDL cholesterol")
    case "cholesterol-hdl": return String(localized: "HDL cholesterol")
    case "cholesterol-non-hdl": return String(localized: "Non-HDL cholesterol")
    case "triglycerides": return String(localized: "Triglycerides")
    case "lipoprotein-a": return String(localized: "Lipoprotein(a)")
    case "apolipoprotein-b": return String(localized: "Apolipoprotein B")
    case "apolipoprotein-a1": return String(localized: "Apolipoprotein A1")
    case "crp-hs": return String(localized: "hs-CRP")
    case "crp": return String(localized: "CRP")
    case "homocysteine": return String(localized: "Homocysteine")
    case "hba1c": return String(localized: "HbA1c")
    case "glucose": return String(localized: "Glucose")
    case "egfr": return String(localized: "eGFR")
    case "creatinine": return String(localized: "Creatinine")
    case "alt": return String(localized: "ALT (GPT)")
    case "ast": return String(localized: "AST (GOT)")
    case "ggt": return String(localized: "Gamma-GT")
    case "haemoglobin": return String(localized: "Haemoglobin")
    case "ferritin": return String(localized: "Ferritin")
    case "vitamin-d": return String(localized: "Vitamin D (25-OH)")
    case "vitamin-b12": return String(localized: "Vitamin B12")
    default: return analyteKey
    }
  }
}

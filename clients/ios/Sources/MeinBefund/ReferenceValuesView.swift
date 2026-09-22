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
  /// Which sex-specific ranges apply, from the profile. Changed there rather
  /// than here: it is a fact about the person, not a setting of one screen.
  let sex: RangeSex
  let onClose: () -> Void

  /// Which category to show, or all of them.
  ///
  /// Ten groups and 175 entries: a person who came to look up one figure from
  /// their blood count should not have to scroll past the lipids and the
  /// amino acids to reach it. A menu rather than a row of chips, which is
  /// what the trends screen uses for its four placements; ten of those would
  /// be taller than the list they filter.
  @State private var group: RangeGroup?

  /// Only the groups that have a range applying to this person, so the menu
  /// never offers a category that would come up empty.
  private var available: [(group: RangeGroup, ranges: [ReferenceRange])] {
    ReferenceRanges.groups().compactMap { group, ranges in
      let shown = applicable(ranges)
      return shown.isEmpty ? nil : (group, shown)
    }
  }

  private var shown: [(group: RangeGroup, ranges: [ReferenceRange])] {
    guard let group else { return available }
    return available.filter { $0.group == group }
  }

  var body: some View {
    NavigationStack {
      List {
        Section {
          LabeledContent("Ranges for", value: sex.label)
          Picker("Category", selection: $group) {
            Text("All categories").tag(RangeGroup?.none)
            ForEach(available, id: \.group) { group, ranges in
              Text("\(group.title) (\(ranges.count))").tag(RangeGroup?.some(group))
            }
          }
          .pickerStyle(.menu)
          .accessibilityIdentifier("reference-category")
        } footer: {
          Text(
            "Some published ranges differ by sex. Without an answer only the ranges that apply to everyone are shown. Set it in your profile; it stays on your device."
          )
        }

        ForEach(shown, id: \.group) { group, ranges in
          Section(group.title) {
            ForEach(ReferenceRanges.byAnalyte(ranges), id: \.first?.id) { card in
              AnalyteCard(ranges: card)
            }
          }
        }

        Section {
          RangeLegend()
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

/// One measurement, with a line per unit it is published in.
///
/// It used to be one card per table row, so vitamin D appeared twice, once in
/// ng/mL and once in nmol/L, and B12 three times. The same measurement listed
/// again under a different unit reads as a mistake rather than as a choice,
/// and on a screen of 175 rows it is the difference between a reference and a
/// dump. The table itself still states a range per unit, because that is what
/// matches a value to a threshold.
private struct AnalyteCard: View {
  let ranges: [ReferenceRange]

  private var lines: [RangeUnitLine] { ReferenceRanges.unitLines(ranges) }
  private var primary: ReferenceRange { ranges[0] }

  /// Whether any line names an optimal band distinct from the guideline. When
  /// none does, the column is left out rather than repeating the same figure.
  private var showsOptimal: Bool {
    lines.contains { optimal(of: $0.range) != nil }
  }

  private func optimal(of range: ReferenceRange) -> String? {
    guard let optimal = range.optimalText(formatter: Measurement.text),
      optimal != range.guidelineText(formatter: Measurement.text)
    else { return nil }
    return optimal
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      Text(AnalyteNames.title(primary.analyteKey))
        .font(.body.weight(.medium))

      Grid(alignment: .leading, horizontalSpacing: 14, verticalSpacing: 4) {
        if lines.count > 1 || showsOptimal {
          GridRow {
            Text(verbatim: "")
            Text("Guideline").font(.caption2).foregroundStyle(.secondary)
            if showsOptimal { Text("Optimal").font(.caption2).foregroundStyle(.secondary) }
          }
        }
        ForEach(lines) { line in
          GridRow {
            Text(line.unitText)
              .font(.caption)
              .foregroundStyle(.secondary)
            Text(line.range.guidelineText(formatter: Measurement.text) ?? "")
              .font(.callout.monospacedDigit().weight(.medium))
              .foregroundStyle(RangePalette.guideline)
            if showsOptimal {
              Text(optimal(of: line.range) ?? "")
                .font(.callout.monospacedDigit().weight(.medium))
                .foregroundStyle(RangePalette.optimal)
            }
          }
        }
      }

      // One summary and one source for the card: every unit of a measurement
      // quotes the same statement, which a test holds to.
      Text(primary.summary).font(.caption).foregroundStyle(.secondary)

      Link(destination: URL(string: primary.source.url)!) {
        HStack(spacing: 4) {
          Image(systemName: "text.book.closed")
          Text("\(primary.basis.label): \(primary.source.label)")
        }
        .font(.caption2)
      }
    }
    .padding(.vertical, 4)
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
    case "cholesterol-remnant": return String(localized: "Remnant cholesterol")
    case "ratio-tg-hdl": return String(localized: "Triglycerides / HDL")
    case "nt-probnp": return String(localized: "NT-proBNP")
    case "tsh": return String(localized: "TSH")
    case "urea": return String(localized: "Urea")
    case "urate": return String(localized: "Uric acid")
    case "alkaline-phosphatase": return String(localized: "Alkaline phosphatase")
    case "ldh": return String(localized: "LDH")
    case "amylase": return String(localized: "Amylase")
    case "bilirubin-total": return String(localized: "Total bilirubin")
    case "sodium": return String(localized: "Sodium")
    case "potassium": return String(localized: "Potassium")
    case "calcium": return String(localized: "Calcium")
    case "calcium-albumin-corrected": return String(localized: "Calcium, albumin-corrected")
    case "magnesium": return String(localized: "Magnesium")
    case "erythrocytes": return String(localized: "Red cells")
    case "haematocrit": return String(localized: "Haematocrit")
    case "mcv": return String(localized: "MCV")
    case "mch": return String(localized: "MCH")
    case "mchc": return String(localized: "MCHC")
    case "platelets": return String(localized: "Platelets")
    case "leukocytes": return String(localized: "White cells")
    case "neutrophils": return String(localized: "Neutrophils")
    case "lymphocytes": return String(localized: "Lymphocytes")
    case "monocytes": return String(localized: "Monocytes")
    case "eosinophils": return String(localized: "Eosinophils")
    case "basophils": return String(localized: "Basophils")
    case "immature-granulocytes": return String(localized: "Immature granulocytes")
    case "rdw": return String(localized: "RDW")
    case "mpv": return String(localized: "MPV")
    case "reticulocyte-haemoglobin": return String(localized: "Reticulocyte haemoglobin")
    case "transferrin-saturation": return String(localized: "Transferrin saturation")
    case "iron": return String(localized: "Iron")
    case "albumin": return String(localized: "Albumin")
    case "protein-total": return String(localized: "Total protein")
    case "immunoglobulin-g": return String(localized: "IgG")
    case "folate": return String(localized: "Folate")
    case "isoleucine": return String(localized: "Isoleucine")
    case "leucine": return String(localized: "Leucine")
    case "valine": return String(localized: "Valine")
    case "lysine": return String(localized: "Lysine")
    case "methionine": return String(localized: "Methionine")
    case "phenylalanine": return String(localized: "Phenylalanine")
    case "threonine": return String(localized: "Threonine")
    case "tryptophan": return String(localized: "Tryptophan")
    case "histidine": return String(localized: "Histidine")
    case "alanine": return String(localized: "Alanine")
    case "arginine": return String(localized: "Arginine")
    case "asparagine": return String(localized: "Asparagine")
    case "aspartate": return String(localized: "Aspartate")
    case "citrulline": return String(localized: "Citrulline")
    case "glutamate": return String(localized: "Glutamate")
    case "glutamine": return String(localized: "Glutamine")
    case "glycine": return String(localized: "Glycine")
    case "ornithine": return String(localized: "Ornithine")
    case "proline": return String(localized: "Proline")
    case "serine": return String(localized: "Serine")
    case "taurine": return String(localized: "Taurine")
    case "tyrosine": return String(localized: "Tyrosine")
    case "bmi": return String(localized: "BMI")
    case "body-fat": return String(localized: "Body fat")
    case "visceral-fat": return String(localized: "Visceral fat")
    case "waist-circumference": return String(localized: "Waist circumference")
    default: return analyteKey
    }
  }
}

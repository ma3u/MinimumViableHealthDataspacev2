// GENERATED FILE, DO NOT EDIT.
//
// Source: services/epa-ingest/src/reference-ranges.ts
// Regenerate: cd services/epa-ingest && npm run generate:swift
//
// Every range here is quoted from a named source and sits **alongside** the
// range the laboratory printed on the report, never in place of it (ADR-033
// rule 1). An analyte with no citable source has no entry.

import Foundation

public struct RangeSource: Sendable, Equatable, Codable {
  public let label: String
  public let url: String

  public init(label: String, url: String) {
    self.label = label
    self.url = url
  }
}

/// What kind of evidence a range rests on.
public enum RangeBasis: String, Sendable, Equatable, Codable {
  /// Stated by a guideline body for the general adult population.
  case guideline
  /// A consensus or expert-opinion statement.
  case consensus
  /// Derived in a named cohort.
  case cohort
}

public enum RangeSex: String, Sendable, Equatable, Codable, CaseIterable {
  case any, male, female
}

/// The panels a reader thinks in.
public enum RangeGroup: String, Sendable, Equatable, Codable, CaseIterable {
    case cardiovascular
    case metabolic
    case kidney
    case liver
    case haematology
    case vitamins
}

public struct ReferenceRange: Sendable, Equatable, Codable, Identifiable {
  public let analyteKey: String
  public let ucum: String
  public let group: RangeGroup
  public let sex: RangeSex
  /// The general-population threshold the source states.
  public let guidelineLow: Double?
  public let guidelineHigh: Double?
  /// The lowest-risk band the source names, when it names one.
  public let optimalLow: Double?
  public let optimalHigh: Double?
  public let basis: RangeBasis
  public let summary: String
  public let source: RangeSource

  public var id: String { "\(analyteKey)|\(ucum)|\(sex.rawValue)" }

  public init(
    analyteKey: String, ucum: String, group: RangeGroup, sex: RangeSex,
    guidelineLow: Double?, guidelineHigh: Double?, optimalLow: Double?, optimalHigh: Double?,
    basis: RangeBasis, summary: String, source: RangeSource
  ) {
    self.analyteKey = analyteKey
    self.ucum = ucum
    self.group = group
    self.sex = sex
    self.guidelineLow = guidelineLow
    self.guidelineHigh = guidelineHigh
    self.optimalLow = optimalLow
    self.optimalHigh = optimalHigh
    self.basis = basis
    self.summary = summary
    self.source = source
  }
}

public enum ReferenceRanges {
  public static let all: [ReferenceRange] = [
    ReferenceRange(
      analyteKey: "cholesterol-ldl", ucum: "mg/dL",
      group: .cardiovascular, sex: .any,
      guidelineLow: nil, guidelineHigh: 116,
      optimalLow: nil, optimalHigh: 55,
      basis: .guideline,
      summary: "Targets: below 116 at low risk, 100 at moderate, 70 at high and 55 at very high risk. ESC/EAS states targets by cardiovascular risk, not one number for everyone. Which tier applies to you is a clinical decision.",
      source: RangeSource(
        label: "ESC/EAS 2019 dyslipidaemia guidelines (Mach et al., Eur Heart J 2020;41:111-188)",
        url: "https://pubmed.ncbi.nlm.nih.gov/31504418/")),
    ReferenceRange(
      analyteKey: "cholesterol-ldl", ucum: "mmol/L",
      group: .cardiovascular, sex: .any,
      guidelineLow: nil, guidelineHigh: 3,
      optimalLow: nil, optimalHigh: 1.4,
      basis: .guideline,
      summary: "Targets: below 3.0 at low risk, 2.6 at moderate, 1.8 at high and 1.4 at very high risk. ESC/EAS states targets by cardiovascular risk, not one number for everyone. Which tier applies to you is a clinical decision.",
      source: RangeSource(
        label: "ESC/EAS 2019 dyslipidaemia guidelines (Mach et al., Eur Heart J 2020;41:111-188)",
        url: "https://pubmed.ncbi.nlm.nih.gov/31504418/")),
    ReferenceRange(
      analyteKey: "cholesterol-non-hdl", ucum: "mg/dL",
      group: .cardiovascular, sex: .any,
      guidelineLow: nil, guidelineHigh: 146,
      optimalLow: nil, optimalHigh: 85,
      basis: .guideline,
      summary: "Secondary target, 30 mg/dL above the LDL target of the same risk tier. ESC/EAS states targets by cardiovascular risk, not one number for everyone. Which tier applies to you is a clinical decision.",
      source: RangeSource(
        label: "ESC/EAS 2019 dyslipidaemia guidelines (Mach et al., Eur Heart J 2020;41:111-188)",
        url: "https://pubmed.ncbi.nlm.nih.gov/31504418/")),
    ReferenceRange(
      analyteKey: "cholesterol-non-hdl", ucum: "mmol/L",
      group: .cardiovascular, sex: .any,
      guidelineLow: nil, guidelineHigh: 3.8,
      optimalLow: nil, optimalHigh: 2.2,
      basis: .guideline,
      summary: "Secondary target, 0.8 mmol/L above the LDL target of the same risk tier. ESC/EAS states targets by cardiovascular risk, not one number for everyone. Which tier applies to you is a clinical decision.",
      source: RangeSource(
        label: "ESC/EAS 2019 dyslipidaemia guidelines (Mach et al., Eur Heart J 2020;41:111-188)",
        url: "https://pubmed.ncbi.nlm.nih.gov/31504418/")),
    ReferenceRange(
      analyteKey: "apolipoprotein-b", ucum: "mg/dL",
      group: .cardiovascular, sex: .any,
      guidelineLow: nil, guidelineHigh: 100,
      optimalLow: nil, optimalHigh: 65,
      basis: .guideline,
      summary: "Targets: below 100 at low or moderate risk, 80 at high and 65 at very high risk. ESC/EAS states targets by cardiovascular risk, not one number for everyone. Which tier applies to you is a clinical decision.",
      source: RangeSource(
        label: "ESC/EAS 2019 dyslipidaemia guidelines (Mach et al., Eur Heart J 2020;41:111-188)",
        url: "https://pubmed.ncbi.nlm.nih.gov/31504418/")),
    ReferenceRange(
      analyteKey: "cholesterol-hdl", ucum: "mg/dL",
      group: .cardiovascular, sex: .male,
      guidelineLow: 40, guidelineHigh: nil,
      optimalLow: 40, optimalHigh: nil,
      basis: .guideline,
      summary: "Below 40 mg/dL (1.0 mmol/L) in men marks increased risk. HDL is a risk marker, not a treatment target.",
      source: RangeSource(
        label: "ESC/EAS 2019 dyslipidaemia guidelines (Mach et al., Eur Heart J 2020;41:111-188)",
        url: "https://pubmed.ncbi.nlm.nih.gov/31504418/")),
    ReferenceRange(
      analyteKey: "cholesterol-hdl", ucum: "mg/dL",
      group: .cardiovascular, sex: .female,
      guidelineLow: 48, guidelineHigh: nil,
      optimalLow: 48, optimalHigh: nil,
      basis: .guideline,
      summary: "Below 48 mg/dL (1.2 mmol/L) in women marks increased risk. HDL is a risk marker, not a treatment target.",
      source: RangeSource(
        label: "ESC/EAS 2019 dyslipidaemia guidelines (Mach et al., Eur Heart J 2020;41:111-188)",
        url: "https://pubmed.ncbi.nlm.nih.gov/31504418/")),
    ReferenceRange(
      analyteKey: "cholesterol-hdl", ucum: "mmol/L",
      group: .cardiovascular, sex: .male,
      guidelineLow: 1, guidelineHigh: nil,
      optimalLow: 1, optimalHigh: nil,
      basis: .guideline,
      summary: "Below 1.0 mmol/L in men marks increased risk. HDL is a risk marker, not a treatment target.",
      source: RangeSource(
        label: "ESC/EAS 2019 dyslipidaemia guidelines (Mach et al., Eur Heart J 2020;41:111-188)",
        url: "https://pubmed.ncbi.nlm.nih.gov/31504418/")),
    ReferenceRange(
      analyteKey: "cholesterol-hdl", ucum: "mmol/L",
      group: .cardiovascular, sex: .female,
      guidelineLow: 1.2, guidelineHigh: nil,
      optimalLow: 1.2, optimalHigh: nil,
      basis: .guideline,
      summary: "Below 1.2 mmol/L in women marks increased risk. HDL is a risk marker, not a treatment target.",
      source: RangeSource(
        label: "ESC/EAS 2019 dyslipidaemia guidelines (Mach et al., Eur Heart J 2020;41:111-188)",
        url: "https://pubmed.ncbi.nlm.nih.gov/31504418/")),
    ReferenceRange(
      analyteKey: "triglycerides", ucum: "mg/dL",
      group: .cardiovascular, sex: .any,
      guidelineLow: nil, guidelineHigh: 150,
      optimalLow: nil, optimalHigh: 150,
      basis: .guideline,
      summary: "Fasting triglycerides below 150 mg/dL (1.7 mmol/L) indicate lower cardiovascular risk.",
      source: RangeSource(
        label: "ESC/EAS 2019 dyslipidaemia guidelines (Mach et al., Eur Heart J 2020;41:111-188)",
        url: "https://pubmed.ncbi.nlm.nih.gov/31504418/")),
    ReferenceRange(
      analyteKey: "triglycerides", ucum: "mmol/L",
      group: .cardiovascular, sex: .any,
      guidelineLow: nil, guidelineHigh: 1.7,
      optimalLow: nil, optimalHigh: 1.7,
      basis: .guideline,
      summary: "Fasting triglycerides below 1.7 mmol/L indicate lower cardiovascular risk.",
      source: RangeSource(
        label: "ESC/EAS 2019 dyslipidaemia guidelines (Mach et al., Eur Heart J 2020;41:111-188)",
        url: "https://pubmed.ncbi.nlm.nih.gov/31504418/")),
    ReferenceRange(
      analyteKey: "cholesterol-total", ucum: "mg/dL",
      group: .cardiovascular, sex: .any,
      guidelineLow: nil, guidelineHigh: 190,
      optimalLow: nil, optimalHigh: 190,
      basis: .guideline,
      summary: "Below 190 mg/dL (5.0 mmol/L). Total cholesterol is a screening figure; LDL and apoB carry the risk information.",
      source: RangeSource(
        label: "ESC/EAS 2019 dyslipidaemia guidelines (Mach et al., Eur Heart J 2020;41:111-188)",
        url: "https://pubmed.ncbi.nlm.nih.gov/31504418/")),
    ReferenceRange(
      analyteKey: "cholesterol-total", ucum: "mmol/L",
      group: .cardiovascular, sex: .any,
      guidelineLow: nil, guidelineHigh: 5,
      optimalLow: nil, optimalHigh: 5,
      basis: .guideline,
      summary: "Below 5.0 mmol/L. Total cholesterol is a screening figure; LDL and apoB carry the risk information.",
      source: RangeSource(
        label: "ESC/EAS 2019 dyslipidaemia guidelines (Mach et al., Eur Heart J 2020;41:111-188)",
        url: "https://pubmed.ncbi.nlm.nih.gov/31504418/")),
    ReferenceRange(
      analyteKey: "lipoprotein-a", ucum: "mg/dL",
      group: .cardiovascular, sex: .any,
      guidelineLow: nil, guidelineHigh: 50,
      optimalLow: nil, optimalHigh: 30,
      basis: .consensus,
      summary: "Below 30 mg/dL carries little excess risk, 30 to 50 is intermediate, above 50 is raised. Largely genetic and measured once in a lifetime for most people.",
      source: RangeSource(
        label: "EAS consensus on lipoprotein(a) (Kronenberg et al., Eur Heart J 2022;43:3925-3946)",
        url: "https://pubmed.ncbi.nlm.nih.gov/36036785/")),
    ReferenceRange(
      analyteKey: "lipoprotein-a", ucum: "nmol/L",
      group: .cardiovascular, sex: .any,
      guidelineLow: nil, guidelineHigh: 125,
      optimalLow: nil, optimalHigh: 75,
      basis: .consensus,
      summary: "Below 75 nmol/L carries little excess risk, 75 to 125 is intermediate, above 125 is raised. Molar and mass units are different measurements and are not interconvertible.",
      source: RangeSource(
        label: "EAS consensus on lipoprotein(a) (Kronenberg et al., Eur Heart J 2022;43:3925-3946)",
        url: "https://pubmed.ncbi.nlm.nih.gov/36036785/")),
    ReferenceRange(
      analyteKey: "lipoprotein-a", ucum: "g/L",
      group: .cardiovascular, sex: .any,
      guidelineLow: nil, guidelineHigh: 0.5,
      optimalLow: nil, optimalHigh: 0.3,
      basis: .consensus,
      summary: "The same thresholds German laboratories print in grams per litre: below 0.30 little excess risk, above 0.50 raised.",
      source: RangeSource(
        label: "EAS consensus on lipoprotein(a) (Kronenberg et al., Eur Heart J 2022;43:3925-3946)",
        url: "https://pubmed.ncbi.nlm.nih.gov/36036785/")),
    ReferenceRange(
      analyteKey: "crp-hs", ucum: "mg/L",
      group: .cardiovascular, sex: .any,
      guidelineLow: nil, guidelineHigh: 3,
      optimalLow: nil, optimalHigh: 1,
      basis: .guideline,
      summary: "Cardiovascular risk groups: below 1 low, 1 to 3 average, above 3 high. A value above 10 suggests infection or inflammation and should be repeated rather than interpreted.",
      source: RangeSource(
        label: "AHA/CDC statement on inflammation markers (Pearson et al., Circulation 2003;107:499-511)",
        url: "https://pubmed.ncbi.nlm.nih.gov/12551878/")),
    ReferenceRange(
      analyteKey: "homocysteine", ucum: "umol/L",
      group: .cardiovascular, sex: .any,
      guidelineLow: nil, guidelineHigh: 15,
      optimalLow: nil, optimalHigh: 10,
      basis: .consensus,
      summary: "Above 15 µmol/L is generally called hyperhomocysteinaemia; below 10 is the range the expert opinion describes as unremarkable in folate-replete populations.",
      source: RangeSource(
        label: "Total homocysteine, expert opinion (Refsum et al., Clin Chem 2004;50:3-32)",
        url: "https://pubmed.ncbi.nlm.nih.gov/14709635/")),
    ReferenceRange(
      analyteKey: "hba1c", ucum: "%",
      group: .metabolic, sex: .any,
      guidelineLow: nil, guidelineHigh: 5.7,
      optimalLow: nil, optimalHigh: 5.7,
      basis: .guideline,
      summary: "Below 5.7% is normal, 5.7 to 6.4% is prediabetes and 6.5% or above meets the diabetes criterion. Risk already rises within the normal range (Selvin 2010).",
      source: RangeSource(
        label: "ADA Standards of Care 2025, diagnosis and classification (Diabetes Care 2025;48:S27-S49)",
        url: "https://pubmed.ncbi.nlm.nih.gov/39651986/")),
    ReferenceRange(
      analyteKey: "hba1c", ucum: "mmol/mol",
      group: .metabolic, sex: .any,
      guidelineLow: nil, guidelineHigh: 39,
      optimalLow: nil, optimalHigh: 39,
      basis: .guideline,
      summary: "Below 39 mmol/mol is normal, 39 to 46 is prediabetes and 48 or above meets the diabetes criterion, on the IFCC scale.",
      source: RangeSource(
        label: "ADA Standards of Care 2025, diagnosis and classification (Diabetes Care 2025;48:S27-S49)",
        url: "https://pubmed.ncbi.nlm.nih.gov/39651986/")),
    ReferenceRange(
      analyteKey: "glucose", ucum: "mg/dL",
      group: .metabolic, sex: .any,
      guidelineLow: 70, guidelineHigh: 99,
      optimalLow: 70, optimalHigh: 99,
      basis: .guideline,
      summary: "Fasting: 70 to 99 mg/dL normal, 100 to 125 impaired fasting glucose, 126 or above meets the diabetes criterion. Only meaningful fasting.",
      source: RangeSource(
        label: "ADA Standards of Care 2025, diagnosis and classification (Diabetes Care 2025;48:S27-S49)",
        url: "https://pubmed.ncbi.nlm.nih.gov/39651986/")),
    ReferenceRange(
      analyteKey: "glucose", ucum: "mmol/L",
      group: .metabolic, sex: .any,
      guidelineLow: 3.9, guidelineHigh: 5.5,
      optimalLow: 3.9, optimalHigh: 5.5,
      basis: .guideline,
      summary: "Fasting: 3.9 to 5.5 mmol/L normal, 5.6 to 6.9 impaired fasting glucose, 7.0 or above meets the diabetes criterion. Only meaningful fasting.",
      source: RangeSource(
        label: "ADA Standards of Care 2025, diagnosis and classification (Diabetes Care 2025;48:S27-S49)",
        url: "https://pubmed.ncbi.nlm.nih.gov/39651986/")),
    ReferenceRange(
      analyteKey: "egfr", ucum: "mL/min/{1.73_m2}",
      group: .kidney, sex: .any,
      guidelineLow: 60, guidelineHigh: nil,
      optimalLow: 90, optimalHigh: nil,
      basis: .guideline,
      summary: "G1 is 90 or above, G2 is 60 to 89 and counts as chronic kidney disease only with other evidence of kidney damage. Below 60 for three months defines CKD.",
      source: RangeSource(
        label: "KDIGO 2024 CKD guideline, executive summary (Levin et al., Kidney Int 2024;105:684-701)",
        url: "https://pubmed.ncbi.nlm.nih.gov/38519239/")),
    ReferenceRange(
      analyteKey: "alt", ucum: "U/L",
      group: .liver, sex: .male,
      guidelineLow: nil, guidelineHigh: 30,
      optimalLow: nil, optimalHigh: 30,
      basis: .cohort,
      summary: "Derived in blood donors with no risk factor for liver disease: 30 U/L in men, against laboratory upper limits that are often far higher.",
      source: RangeSource(
        label: "Updated definitions of healthy ranges for serum ALT (Prati et al., Ann Intern Med 2002;137:1-10)",
        url: "https://pubmed.ncbi.nlm.nih.gov/12093239/")),
    ReferenceRange(
      analyteKey: "alt", ucum: "U/L",
      group: .liver, sex: .female,
      guidelineLow: nil, guidelineHigh: 19,
      optimalLow: nil, optimalHigh: 19,
      basis: .cohort,
      summary: "Derived in blood donors with no risk factor for liver disease: 19 U/L in women, against laboratory upper limits that are often far higher.",
      source: RangeSource(
        label: "Updated definitions of healthy ranges for serum ALT (Prati et al., Ann Intern Med 2002;137:1-10)",
        url: "https://pubmed.ncbi.nlm.nih.gov/12093239/")),
    ReferenceRange(
      analyteKey: "haemoglobin", ucum: "g/dL",
      group: .haematology, sex: .male,
      guidelineLow: 13, guidelineHigh: nil,
      optimalLow: 13, optimalHigh: nil,
      basis: .guideline,
      summary: "Anaemia in men is below 13.0 g/dL (130 g/L) at sea level.",
      source: RangeSource(
        label: "WHO guideline on haemoglobin cutoffs to define anaemia (2024)",
        url: "https://www.who.int/publications/i/item/9789240088542")),
    ReferenceRange(
      analyteKey: "haemoglobin", ucum: "g/dL",
      group: .haematology, sex: .female,
      guidelineLow: 12, guidelineHigh: nil,
      optimalLow: 12, optimalHigh: nil,
      basis: .guideline,
      summary: "Anaemia in non-pregnant women is below 12.0 g/dL (120 g/L) at sea level.",
      source: RangeSource(
        label: "WHO guideline on haemoglobin cutoffs to define anaemia (2024)",
        url: "https://www.who.int/publications/i/item/9789240088542")),
    ReferenceRange(
      analyteKey: "ferritin", ucum: "ug/L",
      group: .haematology, sex: .any,
      guidelineLow: 15, guidelineHigh: nil,
      optimalLow: 30, optimalHigh: nil,
      basis: .guideline,
      summary: "Below 15 µg/L indicates depleted iron stores in adults. Ferritin rises with inflammation, so a threshold of 70 µg/L applies when infection is present.",
      source: RangeSource(
        label: "WHO guideline on ferritin concentrations to assess iron status (2020)",
        url: "https://www.who.int/publications/i/item/9789240000124")),
    ReferenceRange(
      analyteKey: "ferritin", ucum: "ng/mL",
      group: .haematology, sex: .any,
      guidelineLow: 15, guidelineHigh: nil,
      optimalLow: 30, optimalHigh: nil,
      basis: .guideline,
      summary: "Numerically the same as µg/L. Below 15 indicates depleted iron stores; ferritin rises with inflammation.",
      source: RangeSource(
        label: "WHO guideline on ferritin concentrations to assess iron status (2020)",
        url: "https://www.who.int/publications/i/item/9789240000124")),
    ReferenceRange(
      analyteKey: "vitamin-d", ucum: "ng/mL",
      group: .vitamins, sex: .any,
      guidelineLow: 30, guidelineHigh: nil,
      optimalLow: 30, optimalHigh: 50,
      basis: .guideline,
      summary: "Deficiency below 20 ng/mL, insufficiency 21 to 29, sufficiency 30 or above. The guideline does not recommend exceeding 50.",
      source: RangeSource(
        label: "Endocrine Society vitamin D guideline (Holick et al., J Clin Endocrinol Metab 2011;96:1911-1930)",
        url: "https://pubmed.ncbi.nlm.nih.gov/21646368/")),
    ReferenceRange(
      analyteKey: "vitamin-d", ucum: "nmol/L",
      group: .vitamins, sex: .any,
      guidelineLow: 75, guidelineHigh: nil,
      optimalLow: 75, optimalHigh: 125,
      basis: .guideline,
      summary: "Deficiency below 50 nmol/L, insufficiency 52 to 72, sufficiency 75 or above. The guideline does not recommend exceeding 125.",
      source: RangeSource(
        label: "Endocrine Society vitamin D guideline (Holick et al., J Clin Endocrinol Metab 2011;96:1911-1930)",
        url: "https://pubmed.ncbi.nlm.nih.gov/21646368/")),
  ]

  /// Every range defined for an analyte, in any unit.
  public static func forAnalyte(_ analyteKey: String) -> [ReferenceRange] {
    all.filter { $0.analyteKey == analyteKey }
  }

  /// The range for one analyte in one unit.
  ///
  /// A sex-specific range is used only when the person has said which applies.
  /// Without that, the sex-neutral entry is returned, or none: guessing would
  /// put a man's haemoglobin threshold on a woman's value.
  public static func range(
    analyteKey: String, ucum: String, sex: RangeSex = .any
  ) -> ReferenceRange? {
    let candidates = all.filter { $0.analyteKey == analyteKey && $0.ucum == ucum }
    return candidates.first { $0.sex == sex } ?? candidates.first { $0.sex == .any }
  }

  /// The analytes that have any range at all, in group order.
  public static func groups() -> [(group: RangeGroup, ranges: [ReferenceRange])] {
    RangeGroup.allCases.compactMap { group in
      let ranges = all.filter { $0.group == group }
      return ranges.isEmpty ? nil : (group, ranges)
    }
  }
}

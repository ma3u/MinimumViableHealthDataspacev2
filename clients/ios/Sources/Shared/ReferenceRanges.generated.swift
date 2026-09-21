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
    case electrolytes
    case haematology
    case proteins
    case vitamins
    case aminoAcids
    case body
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
      analyteKey: "waist-circumference", ucum: "cm",
      group: .body, sex: .male,
      guidelineLow: nil, guidelineHigh: 102,
      optimalLow: nil, optimalHigh: 94,
      basis: .guideline,
      summary: "In men, 94 cm marks increased risk and 102 cm substantially increased risk. The thresholds are population-specific; these are the ones for people of European descent.",
      source: RangeSource(
        label: "Waist circumference and waist-hip ratio: report of a WHO expert consultation (2011)",
        url: "https://www.who.int/publications/i/item/9789241501491")),
    ReferenceRange(
      analyteKey: "waist-circumference", ucum: "cm",
      group: .body, sex: .female,
      guidelineLow: nil, guidelineHigh: 88,
      optimalLow: nil, optimalHigh: 80,
      basis: .guideline,
      summary: "In women, 80 cm marks increased risk and 88 cm substantially increased risk. The thresholds are population-specific; these are the ones for people of European descent.",
      source: RangeSource(
        label: "Waist circumference and waist-hip ratio: report of a WHO expert consultation (2011)",
        url: "https://www.who.int/publications/i/item/9789241501491")),
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
    ReferenceRange(
      analyteKey: "apolipoprotein-a1", ucum: "g/L",
      group: .cardiovascular, sex: .any,
      guidelineLow: 1.25, guidelineHigh: nil,
      optimalLow: nil, optimalHigh: nil,
      basis: .consensus,
      summary: "Flagged as abnormal at or below 1.25 g/L (125 mg/dL). ApoA1 is the protein of HDL, so higher is the protective direction and the statement names no upper bound.",
      source: RangeSource(
        label: "EAS/EFLM joint consensus on non-fasting lipid profiles and flagging cut-points (Nordestgaard et al., Eur Heart J 2016;37:1944-1958)",
        url: "https://pubmed.ncbi.nlm.nih.gov/27122601/")),
    ReferenceRange(
      analyteKey: "apolipoprotein-a1", ucum: "mg/dL",
      group: .cardiovascular, sex: .any,
      guidelineLow: 125, guidelineHigh: nil,
      optimalLow: nil, optimalHigh: nil,
      basis: .consensus,
      summary: "Flagged as abnormal at or below 125 mg/dL (1.25 g/L). ApoA1 is the protein of HDL, so higher is the protective direction and the statement names no upper bound.",
      source: RangeSource(
        label: "EAS/EFLM joint consensus on non-fasting lipid profiles and flagging cut-points (Nordestgaard et al., Eur Heart J 2016;37:1944-1958)",
        url: "https://pubmed.ncbi.nlm.nih.gov/27122601/")),
    ReferenceRange(
      analyteKey: "cholesterol-remnant", ucum: "mmol/L",
      group: .cardiovascular, sex: .any,
      guidelineLow: nil, guidelineHigh: 0.9,
      optimalLow: nil, optimalHigh: nil,
      basis: .consensus,
      summary: "Calculated remnant cholesterol, total minus HDL minus LDL, is flagged at or above 0.9 mmol/L (35 mg/dL) in a non-fasting sample. It is the cholesterol carried in triglyceride-rich particles.",
      source: RangeSource(
        label: "EAS/EFLM joint consensus on non-fasting lipid profiles and flagging cut-points (Nordestgaard et al., Eur Heart J 2016;37:1944-1958)",
        url: "https://pubmed.ncbi.nlm.nih.gov/27122601/")),
    ReferenceRange(
      analyteKey: "cholesterol-remnant", ucum: "mg/dL",
      group: .cardiovascular, sex: .any,
      guidelineLow: nil, guidelineHigh: 35,
      optimalLow: nil, optimalHigh: nil,
      basis: .consensus,
      summary: "Calculated remnant cholesterol, total minus HDL minus LDL, is flagged at or above 35 mg/dL (0.9 mmol/L) in a non-fasting sample. It is the cholesterol carried in triglyceride-rich particles.",
      source: RangeSource(
        label: "EAS/EFLM joint consensus on non-fasting lipid profiles and flagging cut-points (Nordestgaard et al., Eur Heart J 2016;37:1944-1958)",
        url: "https://pubmed.ncbi.nlm.nih.gov/27122601/")),
    ReferenceRange(
      analyteKey: "ratio-tg-hdl", ucum: "{ratio}",
      group: .cardiovascular, sex: .any,
      guidelineLow: nil, guidelineHigh: 3,
      optimalLow: nil, optimalHigh: nil,
      basis: .cohort,
      summary: "In 258 overweight adults without diabetes, a triglyceride to HDL ratio above 3.0, both in mg/dL, picked out insulin resistance with 64% sensitivity and 68% specificity. The ratio here is always computed on a mg/dL basis, so a panel printed in mmol/L is converted before dividing.",
      source: RangeSource(
        label: "Triglyceride to HDL ratio as a marker of insulin resistance in 258 overweight adults (McLaughlin et al., Ann Intern Med 2003;139:802-809)",
        url: "https://pubmed.ncbi.nlm.nih.gov/14623617/")),
    ReferenceRange(
      analyteKey: "nt-probnp", ucum: "pg/mL",
      group: .cardiovascular, sex: .any,
      guidelineLow: nil, guidelineHigh: 125,
      optimalLow: nil, optimalHigh: nil,
      basis: .guideline,
      summary: "Below 125 pg/mL in a person who is not acutely unwell makes heart failure unlikely; above it the guideline asks for an echocardiogram. The value rises with age and with reduced kidney function.",
      source: RangeSource(
        label: "ESC 2021 guidelines for acute and chronic heart failure (McDonagh et al., Eur Heart J 2021;42:3599-3726)",
        url: "https://pubmed.ncbi.nlm.nih.gov/34447992/")),
    ReferenceRange(
      analyteKey: "nt-probnp", ucum: "ng/L",
      group: .cardiovascular, sex: .any,
      guidelineLow: nil, guidelineHigh: 125,
      optimalLow: nil, optimalHigh: nil,
      basis: .guideline,
      summary: "Below 125 ng/L in a person who is not acutely unwell makes heart failure unlikely; above it the guideline asks for an echocardiogram. The value rises with age and with reduced kidney function.",
      source: RangeSource(
        label: "ESC 2021 guidelines for acute and chronic heart failure (McDonagh et al., Eur Heart J 2021;42:3599-3726)",
        url: "https://pubmed.ncbi.nlm.nih.gov/34447992/")),
    ReferenceRange(
      analyteKey: "tsh", ucum: "m[IU]/L",
      group: .metabolic, sex: .any,
      guidelineLow: 0.45, guidelineHigh: 4.12,
      optimalLow: nil, optimalHigh: nil,
      basis: .guideline,
      summary: "The guideline puts the laboratory's own third-generation assay range first and, where none is available in an iodine-sufficient area, 0.45 to 4.12 mIU/L from the NHANES III survey. The upper limit rises with age.",
      source: RangeSource(
        label: "AACE/ATA clinical practice guidelines for hypothyroidism in adults (Garber et al., Thyroid 2012;22:1200-1235)",
        url: "https://pubmed.ncbi.nlm.nih.gov/22954017/")),
    ReferenceRange(
      analyteKey: "tsh", ucum: "u[IU]/mL",
      group: .metabolic, sex: .any,
      guidelineLow: 0.45, guidelineHigh: 4.12,
      optimalLow: nil, optimalHigh: nil,
      basis: .guideline,
      summary: "The guideline puts the laboratory's own third-generation assay range first and, where none is available in an iodine-sufficient area, 0.45 to 4.12 µIU/mL from the NHANES III survey. The upper limit rises with age.",
      source: RangeSource(
        label: "AACE/ATA clinical practice guidelines for hypothyroidism in adults (Garber et al., Thyroid 2012;22:1200-1235)",
        url: "https://pubmed.ncbi.nlm.nih.gov/22954017/")),
    ReferenceRange(
      analyteKey: "creatinine", ucum: "umol/L",
      group: .kidney, sex: .female,
      guidelineLow: 50, guidelineHigh: 90,
      optimalLow: nil, optimalHigh: nil,
      basis: .cohort,
      summary: "50 to 90 µmol/L (0.57 to 1.02 mg/dL) in women, traceable to the isotope-dilution reference method. Creatinine follows muscle mass; the kidney figure is eGFR.",
      source: RangeSource(
        label: "Nordic Reference Interval Project 2000, 25 biochemical properties in about 3000 healthy adults (Rustad et al., Scand J Clin Lab Invest 2004;64:271-284)",
        url: "https://pubmed.ncbi.nlm.nih.gov/15223694/")),
    ReferenceRange(
      analyteKey: "creatinine", ucum: "umol/L",
      group: .kidney, sex: .male,
      guidelineLow: 60, guidelineHigh: 100,
      optimalLow: nil, optimalHigh: nil,
      basis: .cohort,
      summary: "60 to 100 µmol/L (0.68 to 1.13 mg/dL) in men, traceable to the isotope-dilution reference method. Creatinine follows muscle mass; the kidney figure is eGFR.",
      source: RangeSource(
        label: "Nordic Reference Interval Project 2000, 25 biochemical properties in about 3000 healthy adults (Rustad et al., Scand J Clin Lab Invest 2004;64:271-284)",
        url: "https://pubmed.ncbi.nlm.nih.gov/15223694/")),
    ReferenceRange(
      analyteKey: "creatinine", ucum: "mg/dL",
      group: .kidney, sex: .female,
      guidelineLow: 0.57, guidelineHigh: 1.02,
      optimalLow: nil, optimalHigh: nil,
      basis: .cohort,
      summary: "50 to 90 µmol/L (0.57 to 1.02 mg/dL) in women, traceable to the isotope-dilution reference method. Creatinine follows muscle mass; the kidney figure is eGFR.",
      source: RangeSource(
        label: "Nordic Reference Interval Project 2000, 25 biochemical properties in about 3000 healthy adults (Rustad et al., Scand J Clin Lab Invest 2004;64:271-284)",
        url: "https://pubmed.ncbi.nlm.nih.gov/15223694/")),
    ReferenceRange(
      analyteKey: "creatinine", ucum: "mg/dL",
      group: .kidney, sex: .male,
      guidelineLow: 0.68, guidelineHigh: 1.13,
      optimalLow: nil, optimalHigh: nil,
      basis: .cohort,
      summary: "60 to 100 µmol/L (0.68 to 1.13 mg/dL) in men, traceable to the isotope-dilution reference method. Creatinine follows muscle mass; the kidney figure is eGFR.",
      source: RangeSource(
        label: "Nordic Reference Interval Project 2000, 25 biochemical properties in about 3000 healthy adults (Rustad et al., Scand J Clin Lab Invest 2004;64:271-284)",
        url: "https://pubmed.ncbi.nlm.nih.gov/15223694/")),
    ReferenceRange(
      analyteKey: "urea", ucum: "mmol/L",
      group: .kidney, sex: .female,
      guidelineLow: 2.6, guidelineHigh: 7.9,
      optimalLow: nil, optimalHigh: nil,
      basis: .cohort,
      summary: "Women: 2.6 to 6.4 mmol/L to age 49 and 3.1 to 7.9 from 50 (16 to 47 mg/dL urea). The band shown spans both age tiers.",
      source: RangeSource(
        label: "Nordic Reference Interval Project 2000, 25 biochemical properties in about 3000 healthy adults (Rustad et al., Scand J Clin Lab Invest 2004;64:271-284)",
        url: "https://pubmed.ncbi.nlm.nih.gov/15223694/")),
    ReferenceRange(
      analyteKey: "urea", ucum: "mmol/L",
      group: .kidney, sex: .male,
      guidelineLow: 3.2, guidelineHigh: 8.1,
      optimalLow: nil, optimalHigh: nil,
      basis: .cohort,
      summary: "Men: 3.2 to 8.1 mmol/L to age 49 and 3.5 to 8.1 from 50 (19 to 49 mg/dL urea). The band shown spans both age tiers.",
      source: RangeSource(
        label: "Nordic Reference Interval Project 2000, 25 biochemical properties in about 3000 healthy adults (Rustad et al., Scand J Clin Lab Invest 2004;64:271-284)",
        url: "https://pubmed.ncbi.nlm.nih.gov/15223694/")),
    ReferenceRange(
      analyteKey: "urea", ucum: "mg/dL",
      group: .kidney, sex: .female,
      guidelineLow: 16, guidelineHigh: 47,
      optimalLow: nil, optimalHigh: nil,
      basis: .cohort,
      summary: "Women: 2.6 to 6.4 mmol/L to age 49 and 3.1 to 7.9 from 50 (16 to 47 mg/dL urea). The band shown spans both age tiers.",
      source: RangeSource(
        label: "Nordic Reference Interval Project 2000, 25 biochemical properties in about 3000 healthy adults (Rustad et al., Scand J Clin Lab Invest 2004;64:271-284)",
        url: "https://pubmed.ncbi.nlm.nih.gov/15223694/")),
    ReferenceRange(
      analyteKey: "urea", ucum: "mg/dL",
      group: .kidney, sex: .male,
      guidelineLow: 19, guidelineHigh: 49,
      optimalLow: nil, optimalHigh: nil,
      basis: .cohort,
      summary: "Men: 3.2 to 8.1 mmol/L to age 49 and 3.5 to 8.1 from 50 (19 to 49 mg/dL urea). The band shown spans both age tiers.",
      source: RangeSource(
        label: "Nordic Reference Interval Project 2000, 25 biochemical properties in about 3000 healthy adults (Rustad et al., Scand J Clin Lab Invest 2004;64:271-284)",
        url: "https://pubmed.ncbi.nlm.nih.gov/15223694/")),
    ReferenceRange(
      analyteKey: "urate", ucum: "mg/dL",
      group: .kidney, sex: .any,
      guidelineLow: nil, guidelineHigh: 6.8,
      optimalLow: nil, optimalHigh: nil,
      basis: .guideline,
      summary: "A serum urate of 6.8 mg/dL (405 µmol/L) or more is hyperuricaemia, the concentration at which urate can crystallise. The target of under 6 mg/dL is stated for people with gout on treatment, not for everyone.",
      source: RangeSource(
        label: "ACR 2020 guideline for the management of gout (FitzGerald et al., Arthritis Rheumatol 2020;72:879-895)",
        url: "https://pubmed.ncbi.nlm.nih.gov/32390306/")),
    ReferenceRange(
      analyteKey: "urate", ucum: "umol/L",
      group: .kidney, sex: .any,
      guidelineLow: nil, guidelineHigh: 405,
      optimalLow: nil, optimalHigh: nil,
      basis: .guideline,
      summary: "A serum urate of 405 µmol/L (6.8 mg/dL) or more is hyperuricaemia, the concentration at which urate can crystallise. The target of under 357 µmol/L is stated for people with gout on treatment, not for everyone.",
      source: RangeSource(
        label: "ACR 2020 guideline for the management of gout (FitzGerald et al., Arthritis Rheumatol 2020;72:879-895)",
        url: "https://pubmed.ncbi.nlm.nih.gov/32390306/")),
    ReferenceRange(
      analyteKey: "ast", ucum: "U/L",
      group: .liver, sex: .female,
      guidelineLow: 15, guidelineHigh: 35,
      optimalLow: nil, optimalHigh: nil,
      basis: .cohort,
      summary: "15 to 35 U/L (0.25 to 0.58 µkat/L) in women, measured by the IFCC reference method at 37 °C. Rises with liver damage and also with muscle injury or hard exercise.",
      source: RangeSource(
        label: "Nordic Reference Interval Project 2000, 25 biochemical properties in about 3000 healthy adults (Rustad et al., Scand J Clin Lab Invest 2004;64:271-284)",
        url: "https://pubmed.ncbi.nlm.nih.gov/15223694/")),
    ReferenceRange(
      analyteKey: "ast", ucum: "ukat/L",
      group: .liver, sex: .female,
      guidelineLow: 0.25, guidelineHigh: 0.58,
      optimalLow: nil, optimalHigh: nil,
      basis: .cohort,
      summary: "15 to 35 U/L (0.25 to 0.58 µkat/L) in women, measured by the IFCC reference method at 37 °C. Rises with liver damage and also with muscle injury or hard exercise.",
      source: RangeSource(
        label: "Nordic Reference Interval Project 2000, 25 biochemical properties in about 3000 healthy adults (Rustad et al., Scand J Clin Lab Invest 2004;64:271-284)",
        url: "https://pubmed.ncbi.nlm.nih.gov/15223694/")),
    ReferenceRange(
      analyteKey: "ast", ucum: "U/L",
      group: .liver, sex: .male,
      guidelineLow: 15, guidelineHigh: 45,
      optimalLow: nil, optimalHigh: nil,
      basis: .cohort,
      summary: "15 to 45 U/L (0.25 to 0.75 µkat/L) in men, measured by the IFCC reference method at 37 °C. Rises with liver damage and also with muscle injury or hard exercise.",
      source: RangeSource(
        label: "Nordic Reference Interval Project 2000, 25 biochemical properties in about 3000 healthy adults (Rustad et al., Scand J Clin Lab Invest 2004;64:271-284)",
        url: "https://pubmed.ncbi.nlm.nih.gov/15223694/")),
    ReferenceRange(
      analyteKey: "ast", ucum: "ukat/L",
      group: .liver, sex: .male,
      guidelineLow: 0.25, guidelineHigh: 0.75,
      optimalLow: nil, optimalHigh: nil,
      basis: .cohort,
      summary: "15 to 45 U/L (0.25 to 0.75 µkat/L) in men, measured by the IFCC reference method at 37 °C. Rises with liver damage and also with muscle injury or hard exercise.",
      source: RangeSource(
        label: "Nordic Reference Interval Project 2000, 25 biochemical properties in about 3000 healthy adults (Rustad et al., Scand J Clin Lab Invest 2004;64:271-284)",
        url: "https://pubmed.ncbi.nlm.nih.gov/15223694/")),
    ReferenceRange(
      analyteKey: "ggt", ucum: "U/L",
      group: .liver, sex: .female,
      guidelineLow: 10, guidelineHigh: 75,
      optimalLow: nil, optimalHigh: nil,
      basis: .cohort,
      summary: "Women: 10 to 45 U/L to age 39 and 10 to 75 from 40 (0.17 to 1.25 µkat/L). The band shown spans both age tiers.",
      source: RangeSource(
        label: "Nordic Reference Interval Project 2000, 25 biochemical properties in about 3000 healthy adults (Rustad et al., Scand J Clin Lab Invest 2004;64:271-284)",
        url: "https://pubmed.ncbi.nlm.nih.gov/15223694/")),
    ReferenceRange(
      analyteKey: "ggt", ucum: "ukat/L",
      group: .liver, sex: .female,
      guidelineLow: 0.17, guidelineHigh: 1.25,
      optimalLow: nil, optimalHigh: nil,
      basis: .cohort,
      summary: "Women: 10 to 45 U/L to age 39 and 10 to 75 from 40 (0.17 to 1.25 µkat/L). The band shown spans both age tiers.",
      source: RangeSource(
        label: "Nordic Reference Interval Project 2000, 25 biochemical properties in about 3000 healthy adults (Rustad et al., Scand J Clin Lab Invest 2004;64:271-284)",
        url: "https://pubmed.ncbi.nlm.nih.gov/15223694/")),
    ReferenceRange(
      analyteKey: "ggt", ucum: "U/L",
      group: .liver, sex: .male,
      guidelineLow: 10, guidelineHigh: 115,
      optimalLow: nil, optimalHigh: nil,
      basis: .cohort,
      summary: "Men: 10 to 80 U/L to age 39 and 15 to 115 from 40 (0.17 to 1.92 µkat/L). The band shown spans both age tiers.",
      source: RangeSource(
        label: "Nordic Reference Interval Project 2000, 25 biochemical properties in about 3000 healthy adults (Rustad et al., Scand J Clin Lab Invest 2004;64:271-284)",
        url: "https://pubmed.ncbi.nlm.nih.gov/15223694/")),
    ReferenceRange(
      analyteKey: "ggt", ucum: "ukat/L",
      group: .liver, sex: .male,
      guidelineLow: 0.17, guidelineHigh: 1.92,
      optimalLow: nil, optimalHigh: nil,
      basis: .cohort,
      summary: "Men: 10 to 80 U/L to age 39 and 15 to 115 from 40 (0.17 to 1.92 µkat/L). The band shown spans both age tiers.",
      source: RangeSource(
        label: "Nordic Reference Interval Project 2000, 25 biochemical properties in about 3000 healthy adults (Rustad et al., Scand J Clin Lab Invest 2004;64:271-284)",
        url: "https://pubmed.ncbi.nlm.nih.gov/15223694/")),
    ReferenceRange(
      analyteKey: "alkaline-phosphatase", ucum: "U/L",
      group: .liver, sex: .any,
      guidelineLow: 35, guidelineHigh: 105,
      optimalLow: nil, optimalHigh: nil,
      basis: .cohort,
      summary: "35 to 105 U/L (0.58 to 1.75 µkat/L) in adults, by the IFCC reference method. A raised value asks whether it comes from bile ducts or from bone.",
      source: RangeSource(
        label: "Nordic Reference Interval Project 2000, 25 biochemical properties in about 3000 healthy adults (Rustad et al., Scand J Clin Lab Invest 2004;64:271-284)",
        url: "https://pubmed.ncbi.nlm.nih.gov/15223694/")),
    ReferenceRange(
      analyteKey: "alkaline-phosphatase", ucum: "ukat/L",
      group: .liver, sex: .any,
      guidelineLow: 0.58, guidelineHigh: 1.75,
      optimalLow: nil, optimalHigh: nil,
      basis: .cohort,
      summary: "35 to 105 U/L (0.58 to 1.75 µkat/L) in adults, by the IFCC reference method. A raised value asks whether it comes from bile ducts or from bone.",
      source: RangeSource(
        label: "Nordic Reference Interval Project 2000, 25 biochemical properties in about 3000 healthy adults (Rustad et al., Scand J Clin Lab Invest 2004;64:271-284)",
        url: "https://pubmed.ncbi.nlm.nih.gov/15223694/")),
    ReferenceRange(
      analyteKey: "ldh", ucum: "U/L",
      group: .liver, sex: .any,
      guidelineLow: 105, guidelineHigh: 255,
      optimalLow: nil, optimalHigh: nil,
      basis: .cohort,
      summary: "105 to 205 U/L to age 69 and 115 to 255 from 70 (1.75 to 4.25 µkat/L); the band shown spans both. A sample that sat too long or haemolysed reads high.",
      source: RangeSource(
        label: "Nordic Reference Interval Project 2000, 25 biochemical properties in about 3000 healthy adults (Rustad et al., Scand J Clin Lab Invest 2004;64:271-284)",
        url: "https://pubmed.ncbi.nlm.nih.gov/15223694/")),
    ReferenceRange(
      analyteKey: "ldh", ucum: "ukat/L",
      group: .liver, sex: .any,
      guidelineLow: 1.75, guidelineHigh: 4.25,
      optimalLow: nil, optimalHigh: nil,
      basis: .cohort,
      summary: "105 to 205 U/L to age 69 and 115 to 255 from 70 (1.75 to 4.25 µkat/L); the band shown spans both. A sample that sat too long or haemolysed reads high.",
      source: RangeSource(
        label: "Nordic Reference Interval Project 2000, 25 biochemical properties in about 3000 healthy adults (Rustad et al., Scand J Clin Lab Invest 2004;64:271-284)",
        url: "https://pubmed.ncbi.nlm.nih.gov/15223694/")),
    ReferenceRange(
      analyteKey: "amylase", ucum: "U/L",
      group: .liver, sex: .any,
      guidelineLow: 25, guidelineHigh: 120,
      optimalLow: nil, optimalHigh: nil,
      basis: .cohort,
      summary: "Total amylase 25 to 120 U/L (0.42 to 2.0 µkat/L); the pancreatic fraction alone is 10 to 65 U/L. Salivary glands contribute the rest.",
      source: RangeSource(
        label: "Nordic Reference Interval Project 2000, 25 biochemical properties in about 3000 healthy adults (Rustad et al., Scand J Clin Lab Invest 2004;64:271-284)",
        url: "https://pubmed.ncbi.nlm.nih.gov/15223694/")),
    ReferenceRange(
      analyteKey: "amylase", ucum: "ukat/L",
      group: .liver, sex: .any,
      guidelineLow: 0.42, guidelineHigh: 2,
      optimalLow: nil, optimalHigh: nil,
      basis: .cohort,
      summary: "Total amylase 25 to 120 U/L (0.42 to 2.0 µkat/L); the pancreatic fraction alone is 10 to 65 U/L. Salivary glands contribute the rest.",
      source: RangeSource(
        label: "Nordic Reference Interval Project 2000, 25 biochemical properties in about 3000 healthy adults (Rustad et al., Scand J Clin Lab Invest 2004;64:271-284)",
        url: "https://pubmed.ncbi.nlm.nih.gov/15223694/")),
    ReferenceRange(
      analyteKey: "bilirubin-total", ucum: "umol/L",
      group: .liver, sex: .any,
      guidelineLow: 5, guidelineHigh: 25,
      optimalLow: nil, optimalHigh: nil,
      basis: .cohort,
      summary: "5 to 25 µmol/L (0.3 to 1.5 mg/dL) in adults. A mildly raised value with everything else normal is often Gilbert's syndrome, which is harmless.",
      source: RangeSource(
        label: "Nordic Reference Interval Project 2000, 25 biochemical properties in about 3000 healthy adults (Rustad et al., Scand J Clin Lab Invest 2004;64:271-284)",
        url: "https://pubmed.ncbi.nlm.nih.gov/15223694/")),
    ReferenceRange(
      analyteKey: "bilirubin-total", ucum: "mg/dL",
      group: .liver, sex: .any,
      guidelineLow: 0.3, guidelineHigh: 1.5,
      optimalLow: nil, optimalHigh: nil,
      basis: .cohort,
      summary: "5 to 25 µmol/L (0.3 to 1.5 mg/dL) in adults. A mildly raised value with everything else normal is often Gilbert's syndrome, which is harmless.",
      source: RangeSource(
        label: "Nordic Reference Interval Project 2000, 25 biochemical properties in about 3000 healthy adults (Rustad et al., Scand J Clin Lab Invest 2004;64:271-284)",
        url: "https://pubmed.ncbi.nlm.nih.gov/15223694/")),
    ReferenceRange(
      analyteKey: "sodium", ucum: "mmol/L",
      group: .electrolytes, sex: .any,
      guidelineLow: 137, guidelineHigh: 145,
      optimalLow: nil, optimalHigh: nil,
      basis: .cohort,
      summary: "137 to 145 mmol/L in serum. Sodium tracks water balance more than salt intake; a low value usually means too much water rather than too little sodium.",
      source: RangeSource(
        label: "Nordic Reference Interval Project 2000, 25 biochemical properties in about 3000 healthy adults (Rustad et al., Scand J Clin Lab Invest 2004;64:271-284)",
        url: "https://pubmed.ncbi.nlm.nih.gov/15223694/")),
    ReferenceRange(
      analyteKey: "potassium", ucum: "mmol/L",
      group: .electrolytes, sex: .any,
      guidelineLow: 3.6, guidelineHigh: 4.6,
      optimalLow: nil, optimalHigh: nil,
      basis: .cohort,
      summary: "3.6 to 4.6 mmol/L in serum; plasma runs about 0.2 lower. A sample that was squeezed, shaken or left standing reads high, so an unexpected result is repeated before it is believed.",
      source: RangeSource(
        label: "Nordic Reference Interval Project 2000, 25 biochemical properties in about 3000 healthy adults (Rustad et al., Scand J Clin Lab Invest 2004;64:271-284)",
        url: "https://pubmed.ncbi.nlm.nih.gov/15223694/")),
    ReferenceRange(
      analyteKey: "calcium", ucum: "mmol/L",
      group: .electrolytes, sex: .any,
      guidelineLow: 2.15, guidelineHigh: 2.51,
      optimalLow: nil, optimalHigh: nil,
      basis: .cohort,
      summary: "2.15 to 2.51 mmol/L (8.6 to 10.1 mg/dL) total calcium in serum. About half is bound to albumin, so a low albumin lowers the total without changing the free calcium.",
      source: RangeSource(
        label: "Nordic Reference Interval Project 2000, 25 biochemical properties in about 3000 healthy adults (Rustad et al., Scand J Clin Lab Invest 2004;64:271-284)",
        url: "https://pubmed.ncbi.nlm.nih.gov/15223694/")),
    ReferenceRange(
      analyteKey: "calcium", ucum: "mg/dL",
      group: .electrolytes, sex: .any,
      guidelineLow: 8.6, guidelineHigh: 10.1,
      optimalLow: nil, optimalHigh: nil,
      basis: .cohort,
      summary: "2.15 to 2.51 mmol/L (8.6 to 10.1 mg/dL) total calcium in serum. About half is bound to albumin, so a low albumin lowers the total without changing the free calcium.",
      source: RangeSource(
        label: "Nordic Reference Interval Project 2000, 25 biochemical properties in about 3000 healthy adults (Rustad et al., Scand J Clin Lab Invest 2004;64:271-284)",
        url: "https://pubmed.ncbi.nlm.nih.gov/15223694/")),
    ReferenceRange(
      analyteKey: "calcium-albumin-corrected", ucum: "mmol/L",
      group: .electrolytes, sex: .any,
      guidelineLow: 2.17, guidelineHigh: 2.53,
      optimalLow: nil, optimalHigh: nil,
      basis: .cohort,
      summary: "2.17 to 2.47 mmol/L to age 49 and 2.17 to 2.53 from 50 (8.7 to 10.1 mg/dL), corrected as calcium + 0.020 × (41.3 − albumin in g/L). The band shown spans both tiers.",
      source: RangeSource(
        label: "Nordic Reference Interval Project 2000, 25 biochemical properties in about 3000 healthy adults (Rustad et al., Scand J Clin Lab Invest 2004;64:271-284)",
        url: "https://pubmed.ncbi.nlm.nih.gov/15223694/")),
    ReferenceRange(
      analyteKey: "calcium-albumin-corrected", ucum: "mg/dL",
      group: .electrolytes, sex: .any,
      guidelineLow: 8.7, guidelineHigh: 10.1,
      optimalLow: nil, optimalHigh: nil,
      basis: .cohort,
      summary: "2.17 to 2.47 mmol/L to age 49 and 2.17 to 2.53 from 50 (8.7 to 10.1 mg/dL), corrected as calcium + 0.020 × (41.3 − albumin in g/L). The band shown spans both tiers.",
      source: RangeSource(
        label: "Nordic Reference Interval Project 2000, 25 biochemical properties in about 3000 healthy adults (Rustad et al., Scand J Clin Lab Invest 2004;64:271-284)",
        url: "https://pubmed.ncbi.nlm.nih.gov/15223694/")),
    ReferenceRange(
      analyteKey: "magnesium", ucum: "mmol/L",
      group: .electrolytes, sex: .any,
      guidelineLow: 0.71, guidelineHigh: 0.94,
      optimalLow: nil, optimalHigh: nil,
      basis: .cohort,
      summary: "0.71 to 0.94 mmol/L (1.73 to 2.29 mg/dL) in serum. Most magnesium is inside cells and bone, so serum can be normal while stores are low.",
      source: RangeSource(
        label: "Nordic Reference Interval Project 2000, 25 biochemical properties in about 3000 healthy adults (Rustad et al., Scand J Clin Lab Invest 2004;64:271-284)",
        url: "https://pubmed.ncbi.nlm.nih.gov/15223694/")),
    ReferenceRange(
      analyteKey: "magnesium", ucum: "mg/dL",
      group: .electrolytes, sex: .any,
      guidelineLow: 1.73, guidelineHigh: 2.29,
      optimalLow: nil, optimalHigh: nil,
      basis: .cohort,
      summary: "0.71 to 0.94 mmol/L (1.73 to 2.29 mg/dL) in serum. Most magnesium is inside cells and bone, so serum can be normal while stores are low.",
      source: RangeSource(
        label: "Nordic Reference Interval Project 2000, 25 biochemical properties in about 3000 healthy adults (Rustad et al., Scand J Clin Lab Invest 2004;64:271-284)",
        url: "https://pubmed.ncbi.nlm.nih.gov/15223694/")),
    ReferenceRange(
      analyteKey: "haemoglobin", ucum: "g/L",
      group: .haematology, sex: .male,
      guidelineLow: 130, guidelineHigh: nil,
      optimalLow: 130, optimalHigh: nil,
      basis: .guideline,
      summary: "Anaemia in men is below 130 g/L (13.0 g/dL, 8.07 mmol/L) at sea level.",
      source: RangeSource(
        label: "WHO guideline on haemoglobin cutoffs to define anaemia (2024)",
        url: "https://www.who.int/publications/i/item/9789240088542")),
    ReferenceRange(
      analyteKey: "haemoglobin", ucum: "g/L",
      group: .haematology, sex: .female,
      guidelineLow: 120, guidelineHigh: nil,
      optimalLow: 120, optimalHigh: nil,
      basis: .guideline,
      summary: "Anaemia in non-pregnant women is below 120 g/L (12.0 g/dL, 7.45 mmol/L) at sea level.",
      source: RangeSource(
        label: "WHO guideline on haemoglobin cutoffs to define anaemia (2024)",
        url: "https://www.who.int/publications/i/item/9789240088542")),
    ReferenceRange(
      analyteKey: "haemoglobin", ucum: "mmol/L",
      group: .haematology, sex: .male,
      guidelineLow: 8.07, guidelineHigh: nil,
      optimalLow: 8.07, optimalHigh: nil,
      basis: .guideline,
      summary: "Anaemia in men is below 130 g/L at sea level, which is 8.07 mmol/L when haemoglobin is counted per haem group as German laboratories do.",
      source: RangeSource(
        label: "WHO guideline on haemoglobin cutoffs to define anaemia (2024)",
        url: "https://www.who.int/publications/i/item/9789240088542")),
    ReferenceRange(
      analyteKey: "haemoglobin", ucum: "mmol/L",
      group: .haematology, sex: .female,
      guidelineLow: 7.45, guidelineHigh: nil,
      optimalLow: 7.45, optimalHigh: nil,
      basis: .guideline,
      summary: "Anaemia in non-pregnant women is below 120 g/L at sea level, which is 7.45 mmol/L when haemoglobin is counted per haem group as German laboratories do.",
      source: RangeSource(
        label: "WHO guideline on haemoglobin cutoffs to define anaemia (2024)",
        url: "https://www.who.int/publications/i/item/9789240088542")),
    ReferenceRange(
      analyteKey: "erythrocytes", ucum: "10*12/L",
      group: .haematology, sex: .female,
      guidelineLow: 3.94, guidelineHigh: 5.16,
      optimalLow: nil, optimalHigh: nil,
      basis: .cohort,
      summary: "3.94 to 5.16 × 10¹²/L in women, from 1826 healthy Nordic adults on twelve instrument types.",
      source: RangeSource(
        label: "Nordic reference intervals for the blood count in 1826 healthy adults (Nordin et al., Scand J Clin Lab Invest 2004;64:385-398)",
        url: "https://pubmed.ncbi.nlm.nih.gov/15223702/")),
    ReferenceRange(
      analyteKey: "erythrocytes", ucum: "10*12/L",
      group: .haematology, sex: .male,
      guidelineLow: 4.25, guidelineHigh: 5.71,
      optimalLow: nil, optimalHigh: nil,
      basis: .cohort,
      summary: "4.25 to 5.71 × 10¹²/L in men, from 1826 healthy Nordic adults on twelve instrument types.",
      source: RangeSource(
        label: "Nordic reference intervals for the blood count in 1826 healthy adults (Nordin et al., Scand J Clin Lab Invest 2004;64:385-398)",
        url: "https://pubmed.ncbi.nlm.nih.gov/15223702/")),
    ReferenceRange(
      analyteKey: "erythrocytes", ucum: "10*6/uL",
      group: .haematology, sex: .female,
      guidelineLow: 3.94, guidelineHigh: 5.16,
      optimalLow: nil, optimalHigh: nil,
      basis: .cohort,
      summary: "3.94 to 5.16 × 10¹²/L in women, from 1826 healthy Nordic adults on twelve instrument types.",
      source: RangeSource(
        label: "Nordic reference intervals for the blood count in 1826 healthy adults (Nordin et al., Scand J Clin Lab Invest 2004;64:385-398)",
        url: "https://pubmed.ncbi.nlm.nih.gov/15223702/")),
    ReferenceRange(
      analyteKey: "erythrocytes", ucum: "10*6/uL",
      group: .haematology, sex: .male,
      guidelineLow: 4.25, guidelineHigh: 5.71,
      optimalLow: nil, optimalHigh: nil,
      basis: .cohort,
      summary: "4.25 to 5.71 × 10¹²/L in men, from 1826 healthy Nordic adults on twelve instrument types.",
      source: RangeSource(
        label: "Nordic reference intervals for the blood count in 1826 healthy adults (Nordin et al., Scand J Clin Lab Invest 2004;64:385-398)",
        url: "https://pubmed.ncbi.nlm.nih.gov/15223702/")),
    ReferenceRange(
      analyteKey: "haematocrit", ucum: "L/L",
      group: .haematology, sex: .female,
      guidelineLow: 0.348, guidelineHigh: 0.459,
      optimalLow: nil, optimalHigh: nil,
      basis: .cohort,
      summary: "0.348 to 0.459 (34.8 to 45.9 %) in women: the share of blood volume that is red cells.",
      source: RangeSource(
        label: "Nordic reference intervals for the blood count in 1826 healthy adults (Nordin et al., Scand J Clin Lab Invest 2004;64:385-398)",
        url: "https://pubmed.ncbi.nlm.nih.gov/15223702/")),
    ReferenceRange(
      analyteKey: "haematocrit", ucum: "L/L",
      group: .haematology, sex: .male,
      guidelineLow: 0.395, guidelineHigh: 0.5,
      optimalLow: nil, optimalHigh: nil,
      basis: .cohort,
      summary: "0.395 to 0.500 (39.5 to 50.0 %) in men: the share of blood volume that is red cells.",
      source: RangeSource(
        label: "Nordic reference intervals for the blood count in 1826 healthy adults (Nordin et al., Scand J Clin Lab Invest 2004;64:385-398)",
        url: "https://pubmed.ncbi.nlm.nih.gov/15223702/")),
    ReferenceRange(
      analyteKey: "haematocrit", ucum: "%",
      group: .haematology, sex: .female,
      guidelineLow: 34.8, guidelineHigh: 45.9,
      optimalLow: nil, optimalHigh: nil,
      basis: .cohort,
      summary: "0.348 to 0.459 (34.8 to 45.9 %) in women: the share of blood volume that is red cells.",
      source: RangeSource(
        label: "Nordic reference intervals for the blood count in 1826 healthy adults (Nordin et al., Scand J Clin Lab Invest 2004;64:385-398)",
        url: "https://pubmed.ncbi.nlm.nih.gov/15223702/")),
    ReferenceRange(
      analyteKey: "haematocrit", ucum: "%",
      group: .haematology, sex: .male,
      guidelineLow: 39.5, guidelineHigh: 50,
      optimalLow: nil, optimalHigh: nil,
      basis: .cohort,
      summary: "0.395 to 0.500 (39.5 to 50.0 %) in men: the share of blood volume that is red cells.",
      source: RangeSource(
        label: "Nordic reference intervals for the blood count in 1826 healthy adults (Nordin et al., Scand J Clin Lab Invest 2004;64:385-398)",
        url: "https://pubmed.ncbi.nlm.nih.gov/15223702/")),
    ReferenceRange(
      analyteKey: "mcv", ucum: "fL",
      group: .haematology, sex: .any,
      guidelineLow: 82, guidelineHigh: 98,
      optimalLow: nil, optimalHigh: nil,
      basis: .cohort,
      summary: "82 to 98 fL. Small cells point towards iron deficiency or thalassaemia, large ones towards B12 or folate deficiency, alcohol or liver disease.",
      source: RangeSource(
        label: "Nordic reference intervals for the blood count in 1826 healthy adults (Nordin et al., Scand J Clin Lab Invest 2004;64:385-398)",
        url: "https://pubmed.ncbi.nlm.nih.gov/15223702/")),
    ReferenceRange(
      analyteKey: "mch", ucum: "pg",
      group: .haematology, sex: .any,
      guidelineLow: 27.1, guidelineHigh: 33.3,
      optimalLow: nil, optimalHigh: nil,
      basis: .cohort,
      summary: "27.1 to 33.3 pg (1.68 to 2.07 fmol) of haemoglobin per red cell. Read together with MCV.",
      source: RangeSource(
        label: "Nordic reference intervals for the blood count in 1826 healthy adults (Nordin et al., Scand J Clin Lab Invest 2004;64:385-398)",
        url: "https://pubmed.ncbi.nlm.nih.gov/15223702/")),
    ReferenceRange(
      analyteKey: "mch", ucum: "fmol",
      group: .haematology, sex: .any,
      guidelineLow: 1.68, guidelineHigh: 2.07,
      optimalLow: nil, optimalHigh: nil,
      basis: .cohort,
      summary: "27.1 to 33.3 pg (1.68 to 2.07 fmol) of haemoglobin per red cell. Read together with MCV.",
      source: RangeSource(
        label: "Nordic reference intervals for the blood count in 1826 healthy adults (Nordin et al., Scand J Clin Lab Invest 2004;64:385-398)",
        url: "https://pubmed.ncbi.nlm.nih.gov/15223702/")),
    ReferenceRange(
      analyteKey: "mchc", ucum: "g/L",
      group: .haematology, sex: .any,
      guidelineLow: 317, guidelineHigh: 357,
      optimalLow: nil, optimalHigh: nil,
      basis: .cohort,
      summary: "317 to 357 g/L (31.7 to 35.7 g/dL, 19.7 to 22.2 mmol/L): the haemoglobin concentration inside the red cells themselves.",
      source: RangeSource(
        label: "Nordic reference intervals for the blood count in 1826 healthy adults (Nordin et al., Scand J Clin Lab Invest 2004;64:385-398)",
        url: "https://pubmed.ncbi.nlm.nih.gov/15223702/")),
    ReferenceRange(
      analyteKey: "mchc", ucum: "g/dL",
      group: .haematology, sex: .any,
      guidelineLow: 31.7, guidelineHigh: 35.7,
      optimalLow: nil, optimalHigh: nil,
      basis: .cohort,
      summary: "317 to 357 g/L (31.7 to 35.7 g/dL, 19.7 to 22.2 mmol/L): the haemoglobin concentration inside the red cells themselves.",
      source: RangeSource(
        label: "Nordic reference intervals for the blood count in 1826 healthy adults (Nordin et al., Scand J Clin Lab Invest 2004;64:385-398)",
        url: "https://pubmed.ncbi.nlm.nih.gov/15223702/")),
    ReferenceRange(
      analyteKey: "mchc", ucum: "mmol/L",
      group: .haematology, sex: .any,
      guidelineLow: 19.7, guidelineHigh: 22.2,
      optimalLow: nil, optimalHigh: nil,
      basis: .cohort,
      summary: "317 to 357 g/L (31.7 to 35.7 g/dL, 19.7 to 22.2 mmol/L): the haemoglobin concentration inside the red cells themselves.",
      source: RangeSource(
        label: "Nordic reference intervals for the blood count in 1826 healthy adults (Nordin et al., Scand J Clin Lab Invest 2004;64:385-398)",
        url: "https://pubmed.ncbi.nlm.nih.gov/15223702/")),
    ReferenceRange(
      analyteKey: "platelets", ucum: "10*9/L",
      group: .haematology, sex: .female,
      guidelineLow: 165, guidelineHigh: 387,
      optimalLow: nil, optimalHigh: nil,
      basis: .cohort,
      summary: "165 to 387 × 10⁹/L in women, from 1826 healthy Nordic adults.",
      source: RangeSource(
        label: "Nordic reference intervals for the blood count in 1826 healthy adults (Nordin et al., Scand J Clin Lab Invest 2004;64:385-398)",
        url: "https://pubmed.ncbi.nlm.nih.gov/15223702/")),
    ReferenceRange(
      analyteKey: "platelets", ucum: "10*9/L",
      group: .haematology, sex: .male,
      guidelineLow: 145, guidelineHigh: 348,
      optimalLow: nil, optimalHigh: nil,
      basis: .cohort,
      summary: "145 to 348 × 10⁹/L in men, from 1826 healthy Nordic adults.",
      source: RangeSource(
        label: "Nordic reference intervals for the blood count in 1826 healthy adults (Nordin et al., Scand J Clin Lab Invest 2004;64:385-398)",
        url: "https://pubmed.ncbi.nlm.nih.gov/15223702/")),
    ReferenceRange(
      analyteKey: "platelets", ucum: "10*3/uL",
      group: .haematology, sex: .female,
      guidelineLow: 165, guidelineHigh: 387,
      optimalLow: nil, optimalHigh: nil,
      basis: .cohort,
      summary: "165 to 387 × 10⁹/L in women, from 1826 healthy Nordic adults.",
      source: RangeSource(
        label: "Nordic reference intervals for the blood count in 1826 healthy adults (Nordin et al., Scand J Clin Lab Invest 2004;64:385-398)",
        url: "https://pubmed.ncbi.nlm.nih.gov/15223702/")),
    ReferenceRange(
      analyteKey: "platelets", ucum: "10*3/uL",
      group: .haematology, sex: .male,
      guidelineLow: 145, guidelineHigh: 348,
      optimalLow: nil, optimalHigh: nil,
      basis: .cohort,
      summary: "145 to 348 × 10⁹/L in men, from 1826 healthy Nordic adults.",
      source: RangeSource(
        label: "Nordic reference intervals for the blood count in 1826 healthy adults (Nordin et al., Scand J Clin Lab Invest 2004;64:385-398)",
        url: "https://pubmed.ncbi.nlm.nih.gov/15223702/")),
    ReferenceRange(
      analyteKey: "leukocytes", ucum: "10*9/L",
      group: .haematology, sex: .any,
      guidelineLow: 3.5, guidelineHigh: 8.8,
      optimalLow: nil, optimalHigh: nil,
      basis: .cohort,
      summary: "3.5 to 8.8 × 10⁹/L, from 1826 healthy Nordic adults. Smoking raised the mean by 1.1 × 10⁹/L in that cohort.",
      source: RangeSource(
        label: "Nordic reference intervals for the blood count in 1826 healthy adults (Nordin et al., Scand J Clin Lab Invest 2004;64:385-398)",
        url: "https://pubmed.ncbi.nlm.nih.gov/15223702/")),
    ReferenceRange(
      analyteKey: "leukocytes", ucum: "10*3/uL",
      group: .haematology, sex: .any,
      guidelineLow: 3.5, guidelineHigh: 8.8,
      optimalLow: nil, optimalHigh: nil,
      basis: .cohort,
      summary: "3.5 to 8.8 × 10⁹/L, from 1826 healthy Nordic adults. Smoking raised the mean by 1.1 × 10⁹/L in that cohort.",
      source: RangeSource(
        label: "Nordic reference intervals for the blood count in 1826 healthy adults (Nordin et al., Scand J Clin Lab Invest 2004;64:385-398)",
        url: "https://pubmed.ncbi.nlm.nih.gov/15223702/")),
    ReferenceRange(
      analyteKey: "neutrophils", ucum: "10*9/L",
      group: .haematology, sex: .any,
      guidelineLow: 1.78, guidelineHigh: 6.04,
      optimalLow: nil, optimalHigh: nil,
      basis: .cohort,
      summary: "1.78 to 6.04 × 10⁹/L in 280 healthy Korean adults. People of African descent commonly run lower without any illness.",
      source: RangeSource(
        label: "Reference ranges in 280 healthy Korean adults on the Sysmex XN-2000 (Park et al., Ann Lab Med 2016;36:244-249)",
        url: "https://pubmed.ncbi.nlm.nih.gov/26915613/")),
    ReferenceRange(
      analyteKey: "neutrophils", ucum: "10*3/uL",
      group: .haematology, sex: .any,
      guidelineLow: 1.78, guidelineHigh: 6.04,
      optimalLow: nil, optimalHigh: nil,
      basis: .cohort,
      summary: "1.78 to 6.04 × 10⁹/L in 280 healthy Korean adults. People of African descent commonly run lower without any illness.",
      source: RangeSource(
        label: "Reference ranges in 280 healthy Korean adults on the Sysmex XN-2000 (Park et al., Ann Lab Med 2016;36:244-249)",
        url: "https://pubmed.ncbi.nlm.nih.gov/26915613/")),
    ReferenceRange(
      analyteKey: "neutrophils", ucum: "/uL",
      group: .haematology, sex: .any,
      guidelineLow: 1780, guidelineHigh: 6040,
      optimalLow: nil, optimalHigh: nil,
      basis: .cohort,
      summary: "1.78 to 6.04 × 10⁹/L in 280 healthy Korean adults. People of African descent commonly run lower without any illness.",
      source: RangeSource(
        label: "Reference ranges in 280 healthy Korean adults on the Sysmex XN-2000 (Park et al., Ann Lab Med 2016;36:244-249)",
        url: "https://pubmed.ncbi.nlm.nih.gov/26915613/")),
    ReferenceRange(
      analyteKey: "neutrophils", ucum: "%",
      group: .haematology, sex: .any,
      guidelineLow: 40.8, guidelineHigh: 70.4,
      optimalLow: nil, optimalHigh: nil,
      basis: .cohort,
      summary: "40.8 to 70.4 % of white cells in 280 healthy Korean adults. The absolute count says more than the share.",
      source: RangeSource(
        label: "Reference ranges in 280 healthy Korean adults on the Sysmex XN-2000 (Park et al., Ann Lab Med 2016;36:244-249)",
        url: "https://pubmed.ncbi.nlm.nih.gov/26915613/")),
    ReferenceRange(
      analyteKey: "lymphocytes", ucum: "10*9/L",
      group: .haematology, sex: .any,
      guidelineLow: 1.01, guidelineHigh: 3.15,
      optimalLow: nil, optimalHigh: nil,
      basis: .cohort,
      summary: "1.39 to 3.15 × 10⁹/L at 20 to 40, 1.24 to 3.05 at 41 to 60 and 1.01 to 2.75 over 60, in 280 healthy Korean adults. The band shown spans the age tiers.",
      source: RangeSource(
        label: "Reference ranges in 280 healthy Korean adults on the Sysmex XN-2000 (Park et al., Ann Lab Med 2016;36:244-249)",
        url: "https://pubmed.ncbi.nlm.nih.gov/26915613/")),
    ReferenceRange(
      analyteKey: "lymphocytes", ucum: "10*3/uL",
      group: .haematology, sex: .any,
      guidelineLow: 1.01, guidelineHigh: 3.15,
      optimalLow: nil, optimalHigh: nil,
      basis: .cohort,
      summary: "1.39 to 3.15 × 10⁹/L at 20 to 40, 1.24 to 3.05 at 41 to 60 and 1.01 to 2.75 over 60, in 280 healthy Korean adults. The band shown spans the age tiers.",
      source: RangeSource(
        label: "Reference ranges in 280 healthy Korean adults on the Sysmex XN-2000 (Park et al., Ann Lab Med 2016;36:244-249)",
        url: "https://pubmed.ncbi.nlm.nih.gov/26915613/")),
    ReferenceRange(
      analyteKey: "lymphocytes", ucum: "/uL",
      group: .haematology, sex: .any,
      guidelineLow: 1010, guidelineHigh: 3150,
      optimalLow: nil, optimalHigh: nil,
      basis: .cohort,
      summary: "1.39 to 3.15 × 10⁹/L at 20 to 40, 1.24 to 3.05 at 41 to 60 and 1.01 to 2.75 over 60, in 280 healthy Korean adults. The band shown spans the age tiers.",
      source: RangeSource(
        label: "Reference ranges in 280 healthy Korean adults on the Sysmex XN-2000 (Park et al., Ann Lab Med 2016;36:244-249)",
        url: "https://pubmed.ncbi.nlm.nih.gov/26915613/")),
    ReferenceRange(
      analyteKey: "lymphocytes", ucum: "%",
      group: .haematology, sex: .any,
      guidelineLow: 20.1, guidelineHigh: 46.8,
      optimalLow: nil, optimalHigh: nil,
      basis: .cohort,
      summary: "20.1 to 46.8 % of white cells in 280 healthy Korean adults. The absolute count says more than the share.",
      source: RangeSource(
        label: "Reference ranges in 280 healthy Korean adults on the Sysmex XN-2000 (Park et al., Ann Lab Med 2016;36:244-249)",
        url: "https://pubmed.ncbi.nlm.nih.gov/26915613/")),
    ReferenceRange(
      analyteKey: "monocytes", ucum: "10*9/L",
      group: .haematology, sex: .male,
      guidelineLow: 0.29, guidelineHigh: 0.72,
      optimalLow: nil, optimalHigh: nil,
      basis: .cohort,
      summary: "0.29 to 0.72 × 10⁹/L in men, from 280 healthy Korean adults.",
      source: RangeSource(
        label: "Reference ranges in 280 healthy Korean adults on the Sysmex XN-2000 (Park et al., Ann Lab Med 2016;36:244-249)",
        url: "https://pubmed.ncbi.nlm.nih.gov/26915613/")),
    ReferenceRange(
      analyteKey: "monocytes", ucum: "10*3/uL",
      group: .haematology, sex: .male,
      guidelineLow: 0.29, guidelineHigh: 0.72,
      optimalLow: nil, optimalHigh: nil,
      basis: .cohort,
      summary: "0.29 to 0.72 × 10⁹/L in men, from 280 healthy Korean adults.",
      source: RangeSource(
        label: "Reference ranges in 280 healthy Korean adults on the Sysmex XN-2000 (Park et al., Ann Lab Med 2016;36:244-249)",
        url: "https://pubmed.ncbi.nlm.nih.gov/26915613/")),
    ReferenceRange(
      analyteKey: "monocytes", ucum: "/uL",
      group: .haematology, sex: .male,
      guidelineLow: 290, guidelineHigh: 720,
      optimalLow: nil, optimalHigh: nil,
      basis: .cohort,
      summary: "0.29 to 0.72 × 10⁹/L in men, from 280 healthy Korean adults.",
      source: RangeSource(
        label: "Reference ranges in 280 healthy Korean adults on the Sysmex XN-2000 (Park et al., Ann Lab Med 2016;36:244-249)",
        url: "https://pubmed.ncbi.nlm.nih.gov/26915613/")),
    ReferenceRange(
      analyteKey: "monocytes", ucum: "10*9/L",
      group: .haematology, sex: .female,
      guidelineLow: 0.24, guidelineHigh: 0.72,
      optimalLow: nil, optimalHigh: nil,
      basis: .cohort,
      summary: "0.24 to 0.72 × 10⁹/L in women, from 280 healthy Korean adults.",
      source: RangeSource(
        label: "Reference ranges in 280 healthy Korean adults on the Sysmex XN-2000 (Park et al., Ann Lab Med 2016;36:244-249)",
        url: "https://pubmed.ncbi.nlm.nih.gov/26915613/")),
    ReferenceRange(
      analyteKey: "monocytes", ucum: "10*3/uL",
      group: .haematology, sex: .female,
      guidelineLow: 0.24, guidelineHigh: 0.72,
      optimalLow: nil, optimalHigh: nil,
      basis: .cohort,
      summary: "0.24 to 0.72 × 10⁹/L in women, from 280 healthy Korean adults.",
      source: RangeSource(
        label: "Reference ranges in 280 healthy Korean adults on the Sysmex XN-2000 (Park et al., Ann Lab Med 2016;36:244-249)",
        url: "https://pubmed.ncbi.nlm.nih.gov/26915613/")),
    ReferenceRange(
      analyteKey: "monocytes", ucum: "/uL",
      group: .haematology, sex: .female,
      guidelineLow: 240, guidelineHigh: 720,
      optimalLow: nil, optimalHigh: nil,
      basis: .cohort,
      summary: "0.24 to 0.72 × 10⁹/L in women, from 280 healthy Korean adults.",
      source: RangeSource(
        label: "Reference ranges in 280 healthy Korean adults on the Sysmex XN-2000 (Park et al., Ann Lab Med 2016;36:244-249)",
        url: "https://pubmed.ncbi.nlm.nih.gov/26915613/")),
    ReferenceRange(
      analyteKey: "monocytes", ucum: "%",
      group: .haematology, sex: .any,
      guidelineLow: 4, guidelineHigh: 11.4,
      optimalLow: nil, optimalHigh: nil,
      basis: .cohort,
      summary: "4.0 to 11.4 % of white cells across the sex and age tiers of 280 healthy Korean adults. The absolute count says more than the share.",
      source: RangeSource(
        label: "Reference ranges in 280 healthy Korean adults on the Sysmex XN-2000 (Park et al., Ann Lab Med 2016;36:244-249)",
        url: "https://pubmed.ncbi.nlm.nih.gov/26915613/")),
    ReferenceRange(
      analyteKey: "eosinophils", ucum: "10*9/L",
      group: .haematology, sex: .male,
      guidelineLow: 0.04, guidelineHigh: 0.58,
      optimalLow: nil, optimalHigh: nil,
      basis: .cohort,
      summary: "0.04 to 0.58 × 10⁹/L in men, from 280 healthy Korean adults. Allergy and parasites raise it.",
      source: RangeSource(
        label: "Reference ranges in 280 healthy Korean adults on the Sysmex XN-2000 (Park et al., Ann Lab Med 2016;36:244-249)",
        url: "https://pubmed.ncbi.nlm.nih.gov/26915613/")),
    ReferenceRange(
      analyteKey: "eosinophils", ucum: "10*3/uL",
      group: .haematology, sex: .male,
      guidelineLow: 0.04, guidelineHigh: 0.58,
      optimalLow: nil, optimalHigh: nil,
      basis: .cohort,
      summary: "0.04 to 0.58 × 10⁹/L in men, from 280 healthy Korean adults. Allergy and parasites raise it.",
      source: RangeSource(
        label: "Reference ranges in 280 healthy Korean adults on the Sysmex XN-2000 (Park et al., Ann Lab Med 2016;36:244-249)",
        url: "https://pubmed.ncbi.nlm.nih.gov/26915613/")),
    ReferenceRange(
      analyteKey: "eosinophils", ucum: "/uL",
      group: .haematology, sex: .male,
      guidelineLow: 40, guidelineHigh: 580,
      optimalLow: nil, optimalHigh: nil,
      basis: .cohort,
      summary: "0.04 to 0.58 × 10⁹/L in men, from 280 healthy Korean adults. Allergy and parasites raise it.",
      source: RangeSource(
        label: "Reference ranges in 280 healthy Korean adults on the Sysmex XN-2000 (Park et al., Ann Lab Med 2016;36:244-249)",
        url: "https://pubmed.ncbi.nlm.nih.gov/26915613/")),
    ReferenceRange(
      analyteKey: "eosinophils", ucum: "10*9/L",
      group: .haematology, sex: .female,
      guidelineLow: 0.01, guidelineHigh: 0.59,
      optimalLow: nil, optimalHigh: nil,
      basis: .cohort,
      summary: "0.01 to 0.59 × 10⁹/L in women, from 280 healthy Korean adults. Allergy and parasites raise it.",
      source: RangeSource(
        label: "Reference ranges in 280 healthy Korean adults on the Sysmex XN-2000 (Park et al., Ann Lab Med 2016;36:244-249)",
        url: "https://pubmed.ncbi.nlm.nih.gov/26915613/")),
    ReferenceRange(
      analyteKey: "eosinophils", ucum: "10*3/uL",
      group: .haematology, sex: .female,
      guidelineLow: 0.01, guidelineHigh: 0.59,
      optimalLow: nil, optimalHigh: nil,
      basis: .cohort,
      summary: "0.01 to 0.59 × 10⁹/L in women, from 280 healthy Korean adults. Allergy and parasites raise it.",
      source: RangeSource(
        label: "Reference ranges in 280 healthy Korean adults on the Sysmex XN-2000 (Park et al., Ann Lab Med 2016;36:244-249)",
        url: "https://pubmed.ncbi.nlm.nih.gov/26915613/")),
    ReferenceRange(
      analyteKey: "eosinophils", ucum: "/uL",
      group: .haematology, sex: .female,
      guidelineLow: 10, guidelineHigh: 590,
      optimalLow: nil, optimalHigh: nil,
      basis: .cohort,
      summary: "0.01 to 0.59 × 10⁹/L in women, from 280 healthy Korean adults. Allergy and parasites raise it.",
      source: RangeSource(
        label: "Reference ranges in 280 healthy Korean adults on the Sysmex XN-2000 (Park et al., Ann Lab Med 2016;36:244-249)",
        url: "https://pubmed.ncbi.nlm.nih.gov/26915613/")),
    ReferenceRange(
      analyteKey: "eosinophils", ucum: "%",
      group: .haematology, sex: .male,
      guidelineLow: 0.7, guidelineHigh: 8.9,
      optimalLow: nil, optimalHigh: nil,
      basis: .cohort,
      summary: "0.7 to 8.9 % of white cells in men, from 280 healthy Korean adults.",
      source: RangeSource(
        label: "Reference ranges in 280 healthy Korean adults on the Sysmex XN-2000 (Park et al., Ann Lab Med 2016;36:244-249)",
        url: "https://pubmed.ncbi.nlm.nih.gov/26915613/")),
    ReferenceRange(
      analyteKey: "eosinophils", ucum: "%",
      group: .haematology, sex: .female,
      guidelineLow: 0.2, guidelineHigh: 10.2,
      optimalLow: nil, optimalHigh: nil,
      basis: .cohort,
      summary: "0.2 to 10.2 % of white cells in women, from 280 healthy Korean adults.",
      source: RangeSource(
        label: "Reference ranges in 280 healthy Korean adults on the Sysmex XN-2000 (Park et al., Ann Lab Med 2016;36:244-249)",
        url: "https://pubmed.ncbi.nlm.nih.gov/26915613/")),
    ReferenceRange(
      analyteKey: "basophils", ucum: "10*9/L",
      group: .haematology, sex: .any,
      guidelineLow: 0.01, guidelineHigh: 0.09,
      optimalLow: nil, optimalHigh: nil,
      basis: .cohort,
      summary: "0.01 to 0.09 × 10⁹/L in 280 healthy Korean adults, the rarest white cell.",
      source: RangeSource(
        label: "Reference ranges in 280 healthy Korean adults on the Sysmex XN-2000 (Park et al., Ann Lab Med 2016;36:244-249)",
        url: "https://pubmed.ncbi.nlm.nih.gov/26915613/")),
    ReferenceRange(
      analyteKey: "basophils", ucum: "10*3/uL",
      group: .haematology, sex: .any,
      guidelineLow: 0.01, guidelineHigh: 0.09,
      optimalLow: nil, optimalHigh: nil,
      basis: .cohort,
      summary: "0.01 to 0.09 × 10⁹/L in 280 healthy Korean adults, the rarest white cell.",
      source: RangeSource(
        label: "Reference ranges in 280 healthy Korean adults on the Sysmex XN-2000 (Park et al., Ann Lab Med 2016;36:244-249)",
        url: "https://pubmed.ncbi.nlm.nih.gov/26915613/")),
    ReferenceRange(
      analyteKey: "basophils", ucum: "/uL",
      group: .haematology, sex: .any,
      guidelineLow: 10, guidelineHigh: 90,
      optimalLow: nil, optimalHigh: nil,
      basis: .cohort,
      summary: "0.01 to 0.09 × 10⁹/L in 280 healthy Korean adults, the rarest white cell.",
      source: RangeSource(
        label: "Reference ranges in 280 healthy Korean adults on the Sysmex XN-2000 (Park et al., Ann Lab Med 2016;36:244-249)",
        url: "https://pubmed.ncbi.nlm.nih.gov/26915613/")),
    ReferenceRange(
      analyteKey: "basophils", ucum: "%",
      group: .haematology, sex: .any,
      guidelineLow: 0.2, guidelineHigh: 1.5,
      optimalLow: nil, optimalHigh: nil,
      basis: .cohort,
      summary: "0.2 to 1.5 % of white cells in 280 healthy Korean adults.",
      source: RangeSource(
        label: "Reference ranges in 280 healthy Korean adults on the Sysmex XN-2000 (Park et al., Ann Lab Med 2016;36:244-249)",
        url: "https://pubmed.ncbi.nlm.nih.gov/26915613/")),
    ReferenceRange(
      analyteKey: "immature-granulocytes", ucum: "10*9/L",
      group: .haematology, sex: .any,
      guidelineLow: 0, guidelineHigh: 0.04,
      optimalLow: nil, optimalHigh: nil,
      basis: .cohort,
      summary: "0 to 0.04 × 10⁹/L in 280 healthy Korean adults. The marrow releases young granulocytes early when it is under pressure, as in infection.",
      source: RangeSource(
        label: "Reference ranges in 280 healthy Korean adults on the Sysmex XN-2000 (Park et al., Ann Lab Med 2016;36:244-249)",
        url: "https://pubmed.ncbi.nlm.nih.gov/26915613/")),
    ReferenceRange(
      analyteKey: "immature-granulocytes", ucum: "10*3/uL",
      group: .haematology, sex: .any,
      guidelineLow: 0, guidelineHigh: 0.04,
      optimalLow: nil, optimalHigh: nil,
      basis: .cohort,
      summary: "0 to 0.04 × 10⁹/L in 280 healthy Korean adults. The marrow releases young granulocytes early when it is under pressure, as in infection.",
      source: RangeSource(
        label: "Reference ranges in 280 healthy Korean adults on the Sysmex XN-2000 (Park et al., Ann Lab Med 2016;36:244-249)",
        url: "https://pubmed.ncbi.nlm.nih.gov/26915613/")),
    ReferenceRange(
      analyteKey: "immature-granulocytes", ucum: "/uL",
      group: .haematology, sex: .any,
      guidelineLow: 0, guidelineHigh: 40,
      optimalLow: nil, optimalHigh: nil,
      basis: .cohort,
      summary: "0 to 0.04 × 10⁹/L in 280 healthy Korean adults. The marrow releases young granulocytes early when it is under pressure, as in infection.",
      source: RangeSource(
        label: "Reference ranges in 280 healthy Korean adults on the Sysmex XN-2000 (Park et al., Ann Lab Med 2016;36:244-249)",
        url: "https://pubmed.ncbi.nlm.nih.gov/26915613/")),
    ReferenceRange(
      analyteKey: "immature-granulocytes", ucum: "%",
      group: .haematology, sex: .any,
      guidelineLow: 0, guidelineHigh: 0.5,
      optimalLow: nil, optimalHigh: nil,
      basis: .cohort,
      summary: "0 to 0.5 % of white cells in 280 healthy Korean adults.",
      source: RangeSource(
        label: "Reference ranges in 280 healthy Korean adults on the Sysmex XN-2000 (Park et al., Ann Lab Med 2016;36:244-249)",
        url: "https://pubmed.ncbi.nlm.nih.gov/26915613/")),
    ReferenceRange(
      analyteKey: "rdw", ucum: "%",
      group: .haematology, sex: .any,
      guidelineLow: 11.2, guidelineHigh: 15.6,
      optimalLow: nil, optimalHigh: nil,
      basis: .cohort,
      summary: "11.2 to 15.6 % across the age tiers of 280 healthy Korean adults. A rise means red cells of uneven size, which often precedes a change in MCV.",
      source: RangeSource(
        label: "Reference ranges in 280 healthy Korean adults on the Sysmex XN-2000 (Park et al., Ann Lab Med 2016;36:244-249)",
        url: "https://pubmed.ncbi.nlm.nih.gov/26915613/")),
    ReferenceRange(
      analyteKey: "mpv", ucum: "fL",
      group: .haematology, sex: .any,
      guidelineLow: 9.1, guidelineHigh: 12.6,
      optimalLow: nil, optimalHigh: nil,
      basis: .cohort,
      summary: "9.1 to 12.6 fL in 280 healthy Korean adults on one instrument. MPV depends on the analyser and on how long the tube stood, so instruments differ.",
      source: RangeSource(
        label: "Reference ranges in 280 healthy Korean adults on the Sysmex XN-2000 (Park et al., Ann Lab Med 2016;36:244-249)",
        url: "https://pubmed.ncbi.nlm.nih.gov/26915613/")),
    ReferenceRange(
      analyteKey: "reticulocyte-haemoglobin", ucum: "pg",
      group: .haematology, sex: .any,
      guidelineLow: 29, guidelineHigh: nil,
      optimalLow: nil, optimalHigh: nil,
      basis: .guideline,
      summary: "Below 29 pg (1.8 fmol) the newest red cells are being built short of iron. Stated for people with chronic kidney disease, as the test to use when hypochromic red cells cannot be measured.",
      source: RangeSource(
        label: "NICE guideline NG8, chronic kidney disease: managing anaemia (2015, updated 2021)",
        url: "https://www.nice.org.uk/guidance/ng8")),
    ReferenceRange(
      analyteKey: "reticulocyte-haemoglobin", ucum: "fmol",
      group: .haematology, sex: .any,
      guidelineLow: 1.8, guidelineHigh: nil,
      optimalLow: nil, optimalHigh: nil,
      basis: .guideline,
      summary: "Below 29 pg (1.8 fmol) the newest red cells are being built short of iron. Stated for people with chronic kidney disease, as the test to use when hypochromic red cells cannot be measured.",
      source: RangeSource(
        label: "NICE guideline NG8, chronic kidney disease: managing anaemia (2015, updated 2021)",
        url: "https://www.nice.org.uk/guidance/ng8")),
    ReferenceRange(
      analyteKey: "transferrin-saturation", ucum: "%",
      group: .haematology, sex: .any,
      guidelineLow: 20, guidelineHigh: nil,
      optimalLow: nil, optimalHigh: nil,
      basis: .guideline,
      summary: "Below 20 % points to iron deficiency. The guideline uses it where ferritin cannot be trusted, with ferritin of 100 to 300 µg/L in the presence of inflammation.",
      source: RangeSource(
        label: "BSG guideline on iron deficiency anaemia in adults (Snook et al., Gut 2021;70:2030-2051)",
        url: "https://pubmed.ncbi.nlm.nih.gov/34497146/")),
    ReferenceRange(
      analyteKey: "iron", ucum: "umol/L",
      group: .haematology, sex: .any,
      guidelineLow: 9, guidelineHigh: 34,
      optimalLow: nil, optimalHigh: nil,
      basis: .cohort,
      summary: "9 to 34 µmol/L (50 to 190 µg/dL). Serum iron swings through the day and with the last meal; ferritin and transferrin saturation say more about stores.",
      source: RangeSource(
        label: "Nordic Reference Interval Project 2000, 25 biochemical properties in about 3000 healthy adults (Rustad et al., Scand J Clin Lab Invest 2004;64:271-284)",
        url: "https://pubmed.ncbi.nlm.nih.gov/15223694/")),
    ReferenceRange(
      analyteKey: "iron", ucum: "ug/dL",
      group: .haematology, sex: .any,
      guidelineLow: 50, guidelineHigh: 190,
      optimalLow: nil, optimalHigh: nil,
      basis: .cohort,
      summary: "9 to 34 µmol/L (50 to 190 µg/dL). Serum iron swings through the day and with the last meal; ferritin and transferrin saturation say more about stores.",
      source: RangeSource(
        label: "Nordic Reference Interval Project 2000, 25 biochemical properties in about 3000 healthy adults (Rustad et al., Scand J Clin Lab Invest 2004;64:271-284)",
        url: "https://pubmed.ncbi.nlm.nih.gov/15223694/")),
    ReferenceRange(
      analyteKey: "albumin", ucum: "g/L",
      group: .proteins, sex: .any,
      guidelineLow: 34, guidelineHigh: 48,
      optimalLow: nil, optimalHigh: nil,
      basis: .cohort,
      summary: "36 to 48 g/L to age 39, 36 to 45 from 40 to 69 and 34 to 45 from 70 (3.4 to 4.8 g/dL); the band shown spans the tiers. Falls with inflammation, liver disease and protein loss.",
      source: RangeSource(
        label: "Nordic Reference Interval Project 2000, 25 biochemical properties in about 3000 healthy adults (Rustad et al., Scand J Clin Lab Invest 2004;64:271-284)",
        url: "https://pubmed.ncbi.nlm.nih.gov/15223694/")),
    ReferenceRange(
      analyteKey: "albumin", ucum: "g/dL",
      group: .proteins, sex: .any,
      guidelineLow: 3.4, guidelineHigh: 4.8,
      optimalLow: nil, optimalHigh: nil,
      basis: .cohort,
      summary: "36 to 48 g/L to age 39, 36 to 45 from 40 to 69 and 34 to 45 from 70 (3.4 to 4.8 g/dL); the band shown spans the tiers. Falls with inflammation, liver disease and protein loss.",
      source: RangeSource(
        label: "Nordic Reference Interval Project 2000, 25 biochemical properties in about 3000 healthy adults (Rustad et al., Scand J Clin Lab Invest 2004;64:271-284)",
        url: "https://pubmed.ncbi.nlm.nih.gov/15223694/")),
    ReferenceRange(
      analyteKey: "protein-total", ucum: "g/L",
      group: .proteins, sex: .any,
      guidelineLow: 62, guidelineHigh: 78,
      optimalLow: nil, optimalHigh: nil,
      basis: .cohort,
      summary: "62 to 78 g/L (6.2 to 7.8 g/dL) in serum: albumin plus the immunoglobulins, mostly. Standing up for a while before the draw raises it a little.",
      source: RangeSource(
        label: "Nordic Reference Interval Project 2000, 25 biochemical properties in about 3000 healthy adults (Rustad et al., Scand J Clin Lab Invest 2004;64:271-284)",
        url: "https://pubmed.ncbi.nlm.nih.gov/15223694/")),
    ReferenceRange(
      analyteKey: "protein-total", ucum: "g/dL",
      group: .proteins, sex: .any,
      guidelineLow: 6.2, guidelineHigh: 7.8,
      optimalLow: nil, optimalHigh: nil,
      basis: .cohort,
      summary: "62 to 78 g/L (6.2 to 7.8 g/dL) in serum: albumin plus the immunoglobulins, mostly. Standing up for a while before the draw raises it a little.",
      source: RangeSource(
        label: "Nordic Reference Interval Project 2000, 25 biochemical properties in about 3000 healthy adults (Rustad et al., Scand J Clin Lab Invest 2004;64:271-284)",
        url: "https://pubmed.ncbi.nlm.nih.gov/15223694/")),
    ReferenceRange(
      analyteKey: "immunoglobulin-g", ucum: "g/L",
      group: .proteins, sex: .any,
      guidelineLow: 6.2, guidelineHigh: 15.1,
      optimalLow: nil, optimalHigh: nil,
      basis: .cohort,
      summary: "6.2 to 15.1 g/L (620 to 1510 mg/dL) in 8768 Dutch adults of the Rotterdam Study, median age 62. Nearly the same in men and women.",
      source: RangeSource(
        label: "Serum immunoglobulins in 8768 adults of the Rotterdam Study (Khan et al., J Clin Immunol 2021;41:1902-1914)",
        url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC8604889/")),
    ReferenceRange(
      analyteKey: "immunoglobulin-g", ucum: "mg/dL",
      group: .proteins, sex: .any,
      guidelineLow: 620, guidelineHigh: 1510,
      optimalLow: nil, optimalHigh: nil,
      basis: .cohort,
      summary: "6.2 to 15.1 g/L (620 to 1510 mg/dL) in 8768 Dutch adults of the Rotterdam Study, median age 62. Nearly the same in men and women.",
      source: RangeSource(
        label: "Serum immunoglobulins in 8768 adults of the Rotterdam Study (Khan et al., J Clin Immunol 2021;41:1902-1914)",
        url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC8604889/")),
    ReferenceRange(
      analyteKey: "vitamin-b12", ucum: "ng/L",
      group: .vitamins, sex: .any,
      guidelineLow: 180, guidelineHigh: nil,
      optimalLow: 350, optimalHigh: nil,
      basis: .guideline,
      summary: "Total B12 below 180 ng/L (133 pmol/L) confirms deficiency, 180 to 350 ng/L is indeterminate and calls for methylmalonic acid or homocysteine, above 350 (258 pmol/L) makes deficiency unlikely.",
      source: RangeSource(
        label: "NICE guideline NG239, vitamin B12 deficiency in over 16s (2024)",
        url: "https://www.nice.org.uk/guidance/ng239")),
    ReferenceRange(
      analyteKey: "vitamin-b12", ucum: "pg/mL",
      group: .vitamins, sex: .any,
      guidelineLow: 180, guidelineHigh: nil,
      optimalLow: 350, optimalHigh: nil,
      basis: .guideline,
      summary: "Total B12 below 180 pg/mL (133 pmol/L) confirms deficiency, 180 to 350 pg/mL is indeterminate and calls for methylmalonic acid or homocysteine, above 350 (258 pmol/L) makes deficiency unlikely.",
      source: RangeSource(
        label: "NICE guideline NG239, vitamin B12 deficiency in over 16s (2024)",
        url: "https://www.nice.org.uk/guidance/ng239")),
    ReferenceRange(
      analyteKey: "vitamin-b12", ucum: "pmol/L",
      group: .vitamins, sex: .any,
      guidelineLow: 133, guidelineHigh: nil,
      optimalLow: 258, optimalHigh: nil,
      basis: .guideline,
      summary: "Total B12 below 133 pmol/L (180 ng/L) confirms deficiency, 133 to 258 pmol/L is indeterminate and calls for methylmalonic acid or homocysteine, above 258 (350 ng/L) makes deficiency unlikely.",
      source: RangeSource(
        label: "NICE guideline NG239, vitamin B12 deficiency in over 16s (2024)",
        url: "https://www.nice.org.uk/guidance/ng239")),
    ReferenceRange(
      analyteKey: "folate", ucum: "ng/mL",
      group: .vitamins, sex: .any,
      guidelineLow: 3, guidelineHigh: nil,
      optimalLow: nil, optimalHigh: nil,
      basis: .guideline,
      summary: "A serum folate below 3 µg/L (7 nmol/L) indicates deficiency. Serum folate is the first-line test and as good as red cell folate; the result reflects recent intake as well as stores.",
      source: RangeSource(
        label: "BCSH guideline on cobalamin and folate disorders (Devalia et al., Br J Haematol 2014;166:496-513)",
        url: "https://pubmed.ncbi.nlm.nih.gov/24942828/")),
    ReferenceRange(
      analyteKey: "folate", ucum: "ug/L",
      group: .vitamins, sex: .any,
      guidelineLow: 3, guidelineHigh: nil,
      optimalLow: nil, optimalHigh: nil,
      basis: .guideline,
      summary: "A serum folate below 3 µg/L (7 nmol/L) indicates deficiency. Serum folate is the first-line test and as good as red cell folate; the result reflects recent intake as well as stores.",
      source: RangeSource(
        label: "BCSH guideline on cobalamin and folate disorders (Devalia et al., Br J Haematol 2014;166:496-513)",
        url: "https://pubmed.ncbi.nlm.nih.gov/24942828/")),
    ReferenceRange(
      analyteKey: "isoleucine", ucum: "umol/L",
      group: .aminoAcids, sex: .any,
      guidelineLow: 27.7, guidelineHigh: 112.8,
      optimalLow: nil, optimalHigh: nil,
      basis: .cohort,
      summary: "27.7 to 112.8 µmol/L in fasting plasma, a reference laboratory's interval for people over 15. A branched-chain essential amino acid; rises after a protein meal and falls with fasting. No body publishes an optimal band for a plasma amino acid.",
      source: RangeSource(
        label: "Labcorp plasma amino acid reference intervals, fasting, over 15 years",
        url: "https://www.labcorp.com/resource/plasma-amino-acid-reference-intervals")),
    ReferenceRange(
      analyteKey: "leucine", ucum: "umol/L",
      group: .aminoAcids, sex: .any,
      guidelineLow: 54.9, guidelineHigh: 205,
      optimalLow: nil, optimalHigh: nil,
      basis: .cohort,
      summary: "54.9 to 205 µmol/L in fasting plasma, a reference laboratory's interval for people over 15. A branched-chain essential amino acid; rises after a protein meal and falls with fasting. No body publishes an optimal band for a plasma amino acid.",
      source: RangeSource(
        label: "Labcorp plasma amino acid reference intervals, fasting, over 15 years",
        url: "https://www.labcorp.com/resource/plasma-amino-acid-reference-intervals")),
    ReferenceRange(
      analyteKey: "valine", ucum: "umol/L",
      group: .aminoAcids, sex: .any,
      guidelineLow: 102.6, guidelineHigh: 345.4,
      optimalLow: nil, optimalHigh: nil,
      basis: .cohort,
      summary: "102.6 to 345.4 µmol/L in fasting plasma, a reference laboratory's interval for people over 15. A branched-chain essential amino acid; rises after a protein meal and falls with fasting. No body publishes an optimal band for a plasma amino acid.",
      source: RangeSource(
        label: "Labcorp plasma amino acid reference intervals, fasting, over 15 years",
        url: "https://www.labcorp.com/resource/plasma-amino-acid-reference-intervals")),
    ReferenceRange(
      analyteKey: "lysine", ucum: "umol/L",
      group: .aminoAcids, sex: .any,
      guidelineLow: 94, guidelineHigh: 278,
      optimalLow: nil, optimalHigh: nil,
      basis: .cohort,
      summary: "94 to 278 µmol/L in fasting plasma, a reference laboratory's interval for people over 15. Essential; the body cannot make it. No body publishes an optimal band for a plasma amino acid.",
      source: RangeSource(
        label: "Labcorp plasma amino acid reference intervals, fasting, over 15 years",
        url: "https://www.labcorp.com/resource/plasma-amino-acid-reference-intervals")),
    ReferenceRange(
      analyteKey: "methionine", ucum: "umol/L",
      group: .aminoAcids, sex: .any,
      guidelineLow: 12.7, guidelineHigh: 41.1,
      optimalLow: nil, optimalHigh: nil,
      basis: .cohort,
      summary: "12.7 to 41.1 µmol/L in fasting plasma, a reference laboratory's interval for people over 15. Essential and sulphur-bearing; homocysteine is made from it. No body publishes an optimal band for a plasma amino acid.",
      source: RangeSource(
        label: "Labcorp plasma amino acid reference intervals, fasting, over 15 years",
        url: "https://www.labcorp.com/resource/plasma-amino-acid-reference-intervals")),
    ReferenceRange(
      analyteKey: "phenylalanine", ucum: "umol/L",
      group: .aminoAcids, sex: .any,
      guidelineLow: 33.6, guidelineHigh: 101.9,
      optimalLow: nil, optimalHigh: nil,
      basis: .cohort,
      summary: "33.6 to 101.9 µmol/L in fasting plasma, a reference laboratory's interval for people over 15. Essential; a persistently high value is what newborn screening looks for. No body publishes an optimal band for a plasma amino acid.",
      source: RangeSource(
        label: "Labcorp plasma amino acid reference intervals, fasting, over 15 years",
        url: "https://www.labcorp.com/resource/plasma-amino-acid-reference-intervals")),
    ReferenceRange(
      analyteKey: "threonine", ucum: "umol/L",
      group: .aminoAcids, sex: .any,
      guidelineLow: 67.8, guidelineHigh: 211.6,
      optimalLow: nil, optimalHigh: nil,
      basis: .cohort,
      summary: "67.8 to 211.6 µmol/L in fasting plasma, a reference laboratory's interval for people over 15. Essential. No body publishes an optimal band for a plasma amino acid.",
      source: RangeSource(
        label: "Labcorp plasma amino acid reference intervals, fasting, over 15 years",
        url: "https://www.labcorp.com/resource/plasma-amino-acid-reference-intervals")),
    ReferenceRange(
      analyteKey: "tryptophan", ucum: "umol/L",
      group: .aminoAcids, sex: .any,
      guidelineLow: 23.5, guidelineHigh: 93,
      optimalLow: nil, optimalHigh: nil,
      basis: .cohort,
      summary: "23.5 to 93 µmol/L in fasting plasma, a reference laboratory's interval for people over 15. Essential; the starting point for serotonin and niacin. No body publishes an optimal band for a plasma amino acid.",
      source: RangeSource(
        label: "Labcorp plasma amino acid reference intervals, fasting, over 15 years",
        url: "https://www.labcorp.com/resource/plasma-amino-acid-reference-intervals")),
    ReferenceRange(
      analyteKey: "histidine", ucum: "umol/L",
      group: .aminoAcids, sex: .any,
      guidelineLow: 47.2, guidelineHigh: 98.5,
      optimalLow: nil, optimalHigh: nil,
      basis: .cohort,
      summary: "47.2 to 98.5 µmol/L in fasting plasma, a reference laboratory's interval for people over 15. Essential in children and under stress. No body publishes an optimal band for a plasma amino acid.",
      source: RangeSource(
        label: "Labcorp plasma amino acid reference intervals, fasting, over 15 years",
        url: "https://www.labcorp.com/resource/plasma-amino-acid-reference-intervals")),
    ReferenceRange(
      analyteKey: "alanine", ucum: "umol/L",
      group: .aminoAcids, sex: .any,
      guidelineLow: 124.8, guidelineHigh: 564.2,
      optimalLow: nil, optimalHigh: nil,
      basis: .cohort,
      summary: "124.8 to 564.2 µmol/L in fasting plasma, a reference laboratory's interval for people over 15. Carries nitrogen from muscle to the liver. No body publishes an optimal band for a plasma amino acid.",
      source: RangeSource(
        label: "Labcorp plasma amino acid reference intervals, fasting, over 15 years",
        url: "https://www.labcorp.com/resource/plasma-amino-acid-reference-intervals")),
    ReferenceRange(
      analyteKey: "arginine", ucum: "umol/L",
      group: .aminoAcids, sex: .any,
      guidelineLow: 32, guidelineHigh: 150,
      optimalLow: nil, optimalHigh: nil,
      basis: .cohort,
      summary: "32 to 150 µmol/L in fasting plasma, a reference laboratory's interval for people over 15. A step of the urea cycle and the source of nitric oxide. No body publishes an optimal band for a plasma amino acid.",
      source: RangeSource(
        label: "Labcorp plasma amino acid reference intervals, fasting, over 15 years",
        url: "https://www.labcorp.com/resource/plasma-amino-acid-reference-intervals")),
    ReferenceRange(
      analyteKey: "asparagine", ucum: "umol/L",
      group: .aminoAcids, sex: .any,
      guidelineLow: 29.5, guidelineHigh: 84.5,
      optimalLow: nil, optimalHigh: nil,
      basis: .cohort,
      summary: "29.5 to 84.5 µmol/L in fasting plasma, a reference laboratory's interval for people over 15. Not essential. No body publishes an optimal band for a plasma amino acid.",
      source: RangeSource(
        label: "Labcorp plasma amino acid reference intervals, fasting, over 15 years",
        url: "https://www.labcorp.com/resource/plasma-amino-acid-reference-intervals")),
    ReferenceRange(
      analyteKey: "aspartate", ucum: "umol/L",
      group: .aminoAcids, sex: .any,
      guidelineLow: 0.9, guidelineHigh: 7.4,
      optimalLow: nil, optimalHigh: nil,
      basis: .cohort,
      summary: "0.9 to 7.4 µmol/L in fasting plasma, a reference laboratory's interval for people over 15. Not essential; low in plasma because cells keep it inside. No body publishes an optimal band for a plasma amino acid.",
      source: RangeSource(
        label: "Labcorp plasma amino acid reference intervals, fasting, over 15 years",
        url: "https://www.labcorp.com/resource/plasma-amino-acid-reference-intervals")),
    ReferenceRange(
      analyteKey: "citrulline", ucum: "umol/L",
      group: .aminoAcids, sex: .any,
      guidelineLow: 13.7, guidelineHigh: 63.2,
      optimalLow: nil, optimalHigh: nil,
      basis: .cohort,
      summary: "13.7 to 63.2 µmol/L in fasting plasma, a reference laboratory's interval for people over 15. Made by the gut lining, so a low value is used as a marker of a shortened or damaged small bowel. No body publishes an optimal band for a plasma amino acid.",
      source: RangeSource(
        label: "Labcorp plasma amino acid reference intervals, fasting, over 15 years",
        url: "https://www.labcorp.com/resource/plasma-amino-acid-reference-intervals")),
    ReferenceRange(
      analyteKey: "glutamate", ucum: "umol/L",
      group: .aminoAcids, sex: .any,
      guidelineLow: 18.1, guidelineHigh: 155.9,
      optimalLow: nil, optimalHigh: nil,
      basis: .cohort,
      summary: "18.1 to 155.9 µmol/L in fasting plasma, a reference laboratory's interval for people over 15. Rises when a sample stood before separation, as glutamine breaks down into it. No body publishes an optimal band for a plasma amino acid.",
      source: RangeSource(
        label: "Labcorp plasma amino acid reference intervals, fasting, over 15 years",
        url: "https://www.labcorp.com/resource/plasma-amino-acid-reference-intervals")),
    ReferenceRange(
      analyteKey: "glutamine", ucum: "umol/L",
      group: .aminoAcids, sex: .any,
      guidelineLow: 332, guidelineHigh: 754,
      optimalLow: nil, optimalHigh: nil,
      basis: .cohort,
      summary: "332 to 754 µmol/L in fasting plasma, a reference laboratory's interval for people over 15. The most abundant amino acid in plasma; falls when a sample stood before separation. No body publishes an optimal band for a plasma amino acid.",
      source: RangeSource(
        label: "Labcorp plasma amino acid reference intervals, fasting, over 15 years",
        url: "https://www.labcorp.com/resource/plasma-amino-acid-reference-intervals")),
    ReferenceRange(
      analyteKey: "glycine", ucum: "umol/L",
      group: .aminoAcids, sex: .any,
      guidelineLow: 132, guidelineHigh: 467,
      optimalLow: nil, optimalHigh: nil,
      basis: .cohort,
      summary: "132 to 467 µmol/L in fasting plasma, a reference laboratory's interval for people over 15. A third of collagen. No body publishes an optimal band for a plasma amino acid.",
      source: RangeSource(
        label: "Labcorp plasma amino acid reference intervals, fasting, over 15 years",
        url: "https://www.labcorp.com/resource/plasma-amino-acid-reference-intervals")),
    ReferenceRange(
      analyteKey: "ornithine", ucum: "umol/L",
      group: .aminoAcids, sex: .any,
      guidelineLow: 30.5, guidelineHigh: 131.4,
      optimalLow: nil, optimalHigh: nil,
      basis: .cohort,
      summary: "30.5 to 131.4 µmol/L in fasting plasma, a reference laboratory's interval for people over 15. A step of the urea cycle, not used to build protein. No body publishes an optimal band for a plasma amino acid.",
      source: RangeSource(
        label: "Labcorp plasma amino acid reference intervals, fasting, over 15 years",
        url: "https://www.labcorp.com/resource/plasma-amino-acid-reference-intervals")),
    ReferenceRange(
      analyteKey: "proline", ucum: "umol/L",
      group: .aminoAcids, sex: .any,
      guidelineLow: 84.8, guidelineHigh: 352.5,
      optimalLow: nil, optimalHigh: nil,
      basis: .cohort,
      summary: "84.8 to 352.5 µmol/L in fasting plasma, a reference laboratory's interval for people over 15. A building block of collagen. No body publishes an optimal band for a plasma amino acid.",
      source: RangeSource(
        label: "Labcorp plasma amino acid reference intervals, fasting, over 15 years",
        url: "https://www.labcorp.com/resource/plasma-amino-acid-reference-intervals")),
    ReferenceRange(
      analyteKey: "serine", ucum: "umol/L",
      group: .aminoAcids, sex: .any,
      guidelineLow: 48.7, guidelineHigh: 145.2,
      optimalLow: nil, optimalHigh: nil,
      basis: .cohort,
      summary: "48.7 to 145.2 µmol/L in fasting plasma, a reference laboratory's interval for people over 15. Not essential. No body publishes an optimal band for a plasma amino acid.",
      source: RangeSource(
        label: "Labcorp plasma amino acid reference intervals, fasting, over 15 years",
        url: "https://www.labcorp.com/resource/plasma-amino-acid-reference-intervals")),
    ReferenceRange(
      analyteKey: "taurine", ucum: "umol/L",
      group: .aminoAcids, sex: .any,
      guidelineLow: 29.2, guidelineHigh: 132.3,
      optimalLow: nil, optimalHigh: nil,
      basis: .cohort,
      summary: "29.2 to 132.3 µmol/L in fasting plasma, a reference laboratory's interval for people over 15. Released by platelets when a sample clots, so serum runs higher than plasma. No body publishes an optimal band for a plasma amino acid.",
      source: RangeSource(
        label: "Labcorp plasma amino acid reference intervals, fasting, over 15 years",
        url: "https://www.labcorp.com/resource/plasma-amino-acid-reference-intervals")),
    ReferenceRange(
      analyteKey: "tyrosine", ucum: "umol/L",
      group: .aminoAcids, sex: .any,
      guidelineLow: 31.1, guidelineHigh: 118.1,
      optimalLow: nil, optimalHigh: nil,
      basis: .cohort,
      summary: "31.1 to 118.1 µmol/L in fasting plasma, a reference laboratory's interval for people over 15. Made from phenylalanine; the precursor of thyroid hormone and the catecholamines. No body publishes an optimal band for a plasma amino acid.",
      source: RangeSource(
        label: "Labcorp plasma amino acid reference intervals, fasting, over 15 years",
        url: "https://www.labcorp.com/resource/plasma-amino-acid-reference-intervals")),
    ReferenceRange(
      analyteKey: "bmi", ucum: "kg/m2",
      group: .body, sex: .any,
      guidelineLow: 18.5, guidelineHigh: 25,
      optimalLow: nil, optimalHigh: nil,
      basis: .guideline,
      summary: "WHO counts adults below 18.5 as underweight, 25 and over as overweight and 30 and over as obese. A population measure that cannot tell muscle from fat, and the cut-offs are lower for people of Asian descent.",
      source: RangeSource(
        label: "WHO Global Health Observatory, body mass index indicators for adults",
        url: "https://www.who.int/data/gho/data/themes/topics/topic-details/GHO/body-mass-index")),
    ReferenceRange(
      analyteKey: "body-fat", ucum: "%",
      group: .body, sex: .male,
      guidelineLow: 8, guidelineHigh: 24,
      optimalLow: nil, optimalHigh: nil,
      basis: .cohort,
      summary: "Healthy ranges for men, matched to a BMI of 18.5 to 25: 8 to 19 % at 20 to 39, 11 to 21 % at 40 to 59, 13 to 24 % at 60 to 79. Obesity begins at 25, 28 and 30 %. The band shown spans the age tiers. Measured by DXA; a bioimpedance scale estimates and usually reads differently.",
      source: RangeSource(
        label: "Healthy percentage body fat ranges linked to BMI, 1626 adults measured by DXA and four-compartment model (Gallagher et al., Am J Clin Nutr 2000;72:694-701)",
        url: "https://pubmed.ncbi.nlm.nih.gov/10966886/")),
    ReferenceRange(
      analyteKey: "body-fat", ucum: "%",
      group: .body, sex: .female,
      guidelineLow: 21, guidelineHigh: 35,
      optimalLow: nil, optimalHigh: nil,
      basis: .cohort,
      summary: "Healthy ranges for women, matched to a BMI of 18.5 to 25: 21 to 32 % at 20 to 39, 23 to 33 % at 40 to 59, 24 to 35 % at 60 to 79. Obesity begins at 39, 40 and 42 %. The band shown spans the age tiers. Measured by DXA; a bioimpedance scale estimates and usually reads differently.",
      source: RangeSource(
        label: "Healthy percentage body fat ranges linked to BMI, 1626 adults measured by DXA and four-compartment model (Gallagher et al., Am J Clin Nutr 2000;72:694-701)",
        url: "https://pubmed.ncbi.nlm.nih.gov/10966886/")),
    ReferenceRange(
      analyteKey: "visceral-fat", ucum: "cm2",
      group: .body, sex: .any,
      guidelineLow: nil, guidelineHigh: 100,
      optimalLow: nil, optimalHigh: nil,
      basis: .consensus,
      summary: "A visceral fat area of 100 cm² or more at the navel, measured by CT, marks visceral obesity in the Japanese criteria; at that point people carried more than one metabolic risk factor on average. A scale estimates the area by bioimpedance rather than measuring it.",
      source: RangeSource(
        label: "New criteria for obesity disease in Japan, 1193 adults with CT (Examination Committee, Circ J 2002;66:987-992)",
        url: "https://pubmed.ncbi.nlm.nih.gov/12419927/")),
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

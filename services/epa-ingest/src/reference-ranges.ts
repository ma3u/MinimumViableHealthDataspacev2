/**
 * Reference ranges: what a guideline says, and what the evidence calls optimal.
 *
 * Two things this file is **not**.
 *
 * It is not a replacement for the range your laboratory printed. That range is
 * assay- and population-specific, it travels with the value, and it is what a
 * clinician reads (ADR-033 rule 1). Everything here sits *alongside* it.
 *
 * It is not an opinion. Every range below is quoted from a named, citable
 * source, and an analyte with no source it can be quoted from simply has no
 * entry. A number with no provenance is what the sites this was modelled on
 * offer, and it is the reason they cannot be checked.
 *
 * The distinction between the two columns is deliberate:
 *
 * - `guideline` is the threshold the body itself states, for the general adult
 *   population.
 * - `optimal` is the lowest-risk band the same body or a cited cohort names.
 *   Where a guideline is risk-tiered, `summary` carries the tiers verbatim,
 *   because which tier applies to a person is a clinical decision and not
 *   something an app can make.
 *
 * Units are never converted. A range is stated in the UCUM unit it applies to,
 * and an analyte reported in another unit has its own entry, because the unit
 * selects the LOINC code and a converted threshold is a different measurement.
 */

export type RangeBasis = "guideline" | "consensus" | "cohort";

export type Sex = "any" | "male" | "female";

export interface RangeSource {
  /** Short label shown under the range. */
  label: string;
  /** Where a reader checks it. */
  url: string;
}

export interface ReferenceRange {
  /** Analyte key from `analytes.ts`. */
  analyteKey: string;
  /** UCUM unit this range applies to. */
  ucum: string;
  group: RangeGroup;
  sex: Sex;
  /** The general-population threshold the source states. */
  guidelineLow?: number;
  guidelineHigh?: number;
  /** The lowest-risk band the source names, when it names one. */
  optimalLow?: number;
  optimalHigh?: number;
  basis: RangeBasis;
  /** One or two sentences, in the source's own terms. */
  summary: string;
  source: RangeSource;
}

export type RangeGroup =
  | "cardiovascular"
  | "metabolic"
  | "kidney"
  | "liver"
  | "haematology"
  | "vitamins";

/** The groups, in the order a reader should meet them. */
export const RANGE_GROUPS: readonly RangeGroup[] = [
  "cardiovascular",
  "metabolic",
  "kidney",
  "liver",
  "haematology",
  "vitamins",
];

const ESC_2019: RangeSource = {
  label:
    "ESC/EAS 2019 dyslipidaemia guidelines (Mach et al., Eur Heart J 2020;41:111-188)",
  url: "https://pubmed.ncbi.nlm.nih.gov/31504418/",
};
const EAS_LPA_2022: RangeSource = {
  label:
    "EAS consensus on lipoprotein(a) (Kronenberg et al., Eur Heart J 2022;43:3925-3946)",
  url: "https://pubmed.ncbi.nlm.nih.gov/36036785/",
};
const AHA_CDC_2003: RangeSource = {
  label:
    "AHA/CDC statement on inflammation markers (Pearson et al., Circulation 2003;107:499-511)",
  url: "https://pubmed.ncbi.nlm.nih.gov/12551878/",
};
const REFSUM_2004: RangeSource = {
  label:
    "Total homocysteine, expert opinion (Refsum et al., Clin Chem 2004;50:3-32)",
  url: "https://pubmed.ncbi.nlm.nih.gov/14709635/",
};
const ADA_2025: RangeSource = {
  label:
    "ADA Standards of Care 2025, diagnosis and classification (Diabetes Care 2025;48:S27-S49)",
  url: "https://pubmed.ncbi.nlm.nih.gov/39651986/",
};
const SELVIN_2010: RangeSource = {
  label:
    "Glycated haemoglobin and cardiovascular risk in non-diabetic adults (Selvin et al., N Engl J Med 2010;362:800-811)",
  url: "https://pubmed.ncbi.nlm.nih.gov/20200384/",
};
const KDIGO_2024: RangeSource = {
  label:
    "KDIGO 2024 CKD guideline, executive summary (Levin et al., Kidney Int 2024;105:684-701)",
  url: "https://pubmed.ncbi.nlm.nih.gov/38519239/",
};
const PRATI_2002: RangeSource = {
  label:
    "Updated definitions of healthy ranges for serum ALT (Prati et al., Ann Intern Med 2002;137:1-10)",
  url: "https://pubmed.ncbi.nlm.nih.gov/12093239/",
};
const HOLICK_2011: RangeSource = {
  label:
    "Endocrine Society vitamin D guideline (Holick et al., J Clin Endocrinol Metab 2011;96:1911-1930)",
  url: "https://pubmed.ncbi.nlm.nih.gov/21646368/",
};
const WHO_FERRITIN_2020: RangeSource = {
  label:
    "WHO guideline on ferritin concentrations to assess iron status (2020)",
  url: "https://www.who.int/publications/i/item/9789240000124",
};
const WHO_HAEMOGLOBIN_2024: RangeSource = {
  label: "WHO guideline on haemoglobin cutoffs to define anaemia (2024)",
  url: "https://www.who.int/publications/i/item/9789240088542",
};

const LIPID_TIERS =
  "ESC/EAS states targets by cardiovascular risk, not one number for everyone. " +
  "Which tier applies to you is a clinical decision.";

export const REFERENCE_RANGES: readonly ReferenceRange[] = [
  // ---- Cardiovascular ----
  {
    analyteKey: "cholesterol-ldl",
    ucum: "mg/dL",
    group: "cardiovascular",
    sex: "any",
    guidelineHigh: 116,
    optimalHigh: 55,
    basis: "guideline",
    summary: `Targets: below 116 at low risk, 100 at moderate, 70 at high and 55 at very high risk. ${LIPID_TIERS}`,
    source: ESC_2019,
  },
  {
    analyteKey: "cholesterol-ldl",
    ucum: "mmol/L",
    group: "cardiovascular",
    sex: "any",
    guidelineHigh: 3.0,
    optimalHigh: 1.4,
    basis: "guideline",
    summary: `Targets: below 3.0 at low risk, 2.6 at moderate, 1.8 at high and 1.4 at very high risk. ${LIPID_TIERS}`,
    source: ESC_2019,
  },
  {
    analyteKey: "cholesterol-non-hdl",
    ucum: "mg/dL",
    group: "cardiovascular",
    sex: "any",
    guidelineHigh: 146,
    optimalHigh: 85,
    basis: "guideline",
    summary: `Secondary target, 30 mg/dL above the LDL target of the same risk tier. ${LIPID_TIERS}`,
    source: ESC_2019,
  },
  {
    analyteKey: "cholesterol-non-hdl",
    ucum: "mmol/L",
    group: "cardiovascular",
    sex: "any",
    guidelineHigh: 3.8,
    optimalHigh: 2.2,
    basis: "guideline",
    summary: `Secondary target, 0.8 mmol/L above the LDL target of the same risk tier. ${LIPID_TIERS}`,
    source: ESC_2019,
  },
  {
    analyteKey: "apolipoprotein-b",
    ucum: "mg/dL",
    group: "cardiovascular",
    sex: "any",
    guidelineHigh: 100,
    optimalHigh: 65,
    basis: "guideline",
    summary: `Targets: below 100 at low or moderate risk, 80 at high and 65 at very high risk. ${LIPID_TIERS}`,
    source: ESC_2019,
  },
  {
    analyteKey: "cholesterol-hdl",
    ucum: "mg/dL",
    group: "cardiovascular",
    sex: "male",
    guidelineLow: 40,
    optimalLow: 40,
    basis: "guideline",
    summary:
      "Below 40 mg/dL (1.0 mmol/L) in men marks increased risk. HDL is a risk marker, not a treatment target.",
    source: ESC_2019,
  },
  {
    analyteKey: "cholesterol-hdl",
    ucum: "mg/dL",
    group: "cardiovascular",
    sex: "female",
    guidelineLow: 48,
    optimalLow: 48,
    basis: "guideline",
    summary:
      "Below 48 mg/dL (1.2 mmol/L) in women marks increased risk. HDL is a risk marker, not a treatment target.",
    source: ESC_2019,
  },
  {
    analyteKey: "cholesterol-hdl",
    ucum: "mmol/L",
    group: "cardiovascular",
    sex: "male",
    guidelineLow: 1.0,
    optimalLow: 1.0,
    basis: "guideline",
    summary:
      "Below 1.0 mmol/L in men marks increased risk. HDL is a risk marker, not a treatment target.",
    source: ESC_2019,
  },
  {
    analyteKey: "cholesterol-hdl",
    ucum: "mmol/L",
    group: "cardiovascular",
    sex: "female",
    guidelineLow: 1.2,
    optimalLow: 1.2,
    basis: "guideline",
    summary:
      "Below 1.2 mmol/L in women marks increased risk. HDL is a risk marker, not a treatment target.",
    source: ESC_2019,
  },
  {
    analyteKey: "triglycerides",
    ucum: "mg/dL",
    group: "cardiovascular",
    sex: "any",
    guidelineHigh: 150,
    optimalHigh: 150,
    basis: "guideline",
    summary:
      "Fasting triglycerides below 150 mg/dL (1.7 mmol/L) indicate lower cardiovascular risk.",
    source: ESC_2019,
  },
  {
    analyteKey: "triglycerides",
    ucum: "mmol/L",
    group: "cardiovascular",
    sex: "any",
    guidelineHigh: 1.7,
    optimalHigh: 1.7,
    basis: "guideline",
    summary:
      "Fasting triglycerides below 1.7 mmol/L indicate lower cardiovascular risk.",
    source: ESC_2019,
  },
  {
    analyteKey: "cholesterol-total",
    ucum: "mg/dL",
    group: "cardiovascular",
    sex: "any",
    guidelineHigh: 190,
    optimalHigh: 190,
    basis: "guideline",
    summary:
      "Below 190 mg/dL (5.0 mmol/L). Total cholesterol is a screening figure; LDL and apoB carry the risk information.",
    source: ESC_2019,
  },
  {
    analyteKey: "cholesterol-total",
    ucum: "mmol/L",
    group: "cardiovascular",
    sex: "any",
    guidelineHigh: 5.0,
    optimalHigh: 5.0,
    basis: "guideline",
    summary:
      "Below 5.0 mmol/L. Total cholesterol is a screening figure; LDL and apoB carry the risk information.",
    source: ESC_2019,
  },
  {
    analyteKey: "lipoprotein-a",
    ucum: "mg/dL",
    group: "cardiovascular",
    sex: "any",
    guidelineHigh: 50,
    optimalHigh: 30,
    basis: "consensus",
    summary:
      "Below 30 mg/dL carries little excess risk, 30 to 50 is intermediate, above 50 is raised. Largely genetic and measured once in a lifetime for most people.",
    source: EAS_LPA_2022,
  },
  {
    analyteKey: "lipoprotein-a",
    ucum: "nmol/L",
    group: "cardiovascular",
    sex: "any",
    guidelineHigh: 125,
    optimalHigh: 75,
    basis: "consensus",
    summary:
      "Below 75 nmol/L carries little excess risk, 75 to 125 is intermediate, above 125 is raised. Molar and mass units are different measurements and are not interconvertible.",
    source: EAS_LPA_2022,
  },
  {
    analyteKey: "lipoprotein-a",
    ucum: "g/L",
    group: "cardiovascular",
    sex: "any",
    guidelineHigh: 0.5,
    optimalHigh: 0.3,
    basis: "consensus",
    summary:
      "The same thresholds German laboratories print in grams per litre: below 0.30 little excess risk, above 0.50 raised.",
    source: EAS_LPA_2022,
  },
  {
    analyteKey: "crp-hs",
    ucum: "mg/L",
    group: "cardiovascular",
    sex: "any",
    guidelineHigh: 3.0,
    optimalHigh: 1.0,
    basis: "guideline",
    summary:
      "Cardiovascular risk groups: below 1 low, 1 to 3 average, above 3 high. A value above 10 suggests infection or inflammation and should be repeated rather than interpreted.",
    source: AHA_CDC_2003,
  },
  {
    analyteKey: "homocysteine",
    ucum: "umol/L",
    group: "cardiovascular",
    sex: "any",
    guidelineHigh: 15,
    optimalHigh: 10,
    basis: "consensus",
    summary:
      "Above 15 µmol/L is generally called hyperhomocysteinaemia; below 10 is the range the expert opinion describes as unremarkable in folate-replete populations.",
    source: REFSUM_2004,
  },

  // ---- Metabolic ----
  {
    analyteKey: "hba1c",
    ucum: "%",
    group: "metabolic",
    sex: "any",
    guidelineHigh: 5.7,
    optimalHigh: 5.7,
    basis: "guideline",
    summary:
      "Below 5.7% is normal, 5.7 to 6.4% is prediabetes and 6.5% or above meets the diabetes criterion. Risk already rises within the normal range (Selvin 2010).",
    source: ADA_2025,
  },
  {
    analyteKey: "hba1c",
    ucum: "mmol/mol",
    group: "metabolic",
    sex: "any",
    guidelineHigh: 39,
    optimalHigh: 39,
    basis: "guideline",
    summary:
      "Below 39 mmol/mol is normal, 39 to 46 is prediabetes and 48 or above meets the diabetes criterion, on the IFCC scale.",
    source: ADA_2025,
  },
  {
    analyteKey: "glucose",
    ucum: "mg/dL",
    group: "metabolic",
    sex: "any",
    guidelineLow: 70,
    guidelineHigh: 99,
    optimalLow: 70,
    optimalHigh: 99,
    basis: "guideline",
    summary:
      "Fasting: 70 to 99 mg/dL normal, 100 to 125 impaired fasting glucose, 126 or above meets the diabetes criterion. Only meaningful fasting.",
    source: ADA_2025,
  },
  {
    analyteKey: "glucose",
    ucum: "mmol/L",
    group: "metabolic",
    sex: "any",
    guidelineLow: 3.9,
    guidelineHigh: 5.5,
    optimalLow: 3.9,
    optimalHigh: 5.5,
    basis: "guideline",
    summary:
      "Fasting: 3.9 to 5.5 mmol/L normal, 5.6 to 6.9 impaired fasting glucose, 7.0 or above meets the diabetes criterion. Only meaningful fasting.",
    source: ADA_2025,
  },

  // ---- Kidney ----
  {
    analyteKey: "egfr",
    ucum: "mL/min/{1.73_m2}",
    group: "kidney",
    sex: "any",
    guidelineLow: 60,
    optimalLow: 90,
    basis: "guideline",
    summary:
      "G1 is 90 or above, G2 is 60 to 89 and counts as chronic kidney disease only with other evidence of kidney damage. Below 60 for three months defines CKD.",
    source: KDIGO_2024,
  },

  // ---- Liver ----
  {
    analyteKey: "alt",
    ucum: "U/L",
    group: "liver",
    sex: "male",
    guidelineHigh: 30,
    optimalHigh: 30,
    basis: "cohort",
    summary:
      "Derived in blood donors with no risk factor for liver disease: 30 U/L in men, against laboratory upper limits that are often far higher.",
    source: PRATI_2002,
  },
  {
    analyteKey: "alt",
    ucum: "U/L",
    group: "liver",
    sex: "female",
    guidelineHigh: 19,
    optimalHigh: 19,
    basis: "cohort",
    summary:
      "Derived in blood donors with no risk factor for liver disease: 19 U/L in women, against laboratory upper limits that are often far higher.",
    source: PRATI_2002,
  },

  // ---- Haematology ----
  {
    analyteKey: "haemoglobin",
    ucum: "g/dL",
    group: "haematology",
    sex: "male",
    guidelineLow: 13.0,
    optimalLow: 13.0,
    basis: "guideline",
    summary: "Anaemia in men is below 13.0 g/dL (130 g/L) at sea level.",
    source: WHO_HAEMOGLOBIN_2024,
  },
  {
    analyteKey: "haemoglobin",
    ucum: "g/dL",
    group: "haematology",
    sex: "female",
    guidelineLow: 12.0,
    optimalLow: 12.0,
    basis: "guideline",
    summary:
      "Anaemia in non-pregnant women is below 12.0 g/dL (120 g/L) at sea level.",
    source: WHO_HAEMOGLOBIN_2024,
  },
  {
    analyteKey: "ferritin",
    ucum: "ug/L",
    group: "haematology",
    sex: "any",
    guidelineLow: 15,
    optimalLow: 30,
    basis: "guideline",
    summary:
      "Below 15 µg/L indicates depleted iron stores in adults. Ferritin rises with inflammation, so a threshold of 70 µg/L applies when infection is present.",
    source: WHO_FERRITIN_2020,
  },
  {
    analyteKey: "ferritin",
    ucum: "ng/mL",
    group: "haematology",
    sex: "any",
    guidelineLow: 15,
    optimalLow: 30,
    basis: "guideline",
    summary:
      "Numerically the same as µg/L. Below 15 indicates depleted iron stores; ferritin rises with inflammation.",
    source: WHO_FERRITIN_2020,
  },

  // ---- Vitamins ----
  {
    analyteKey: "vitamin-d",
    ucum: "ng/mL",
    group: "vitamins",
    sex: "any",
    guidelineLow: 30,
    optimalLow: 30,
    optimalHigh: 50,
    basis: "guideline",
    summary:
      "Deficiency below 20 ng/mL, insufficiency 21 to 29, sufficiency 30 or above. The guideline does not recommend exceeding 50.",
    source: HOLICK_2011,
  },
  {
    analyteKey: "vitamin-d",
    ucum: "nmol/L",
    group: "vitamins",
    sex: "any",
    guidelineLow: 75,
    optimalLow: 75,
    optimalHigh: 125,
    basis: "guideline",
    summary:
      "Deficiency below 50 nmol/L, insufficiency 52 to 72, sufficiency 75 or above. The guideline does not recommend exceeding 125.",
    source: HOLICK_2011,
  },
];

/** Every range defined for an analyte, in any unit. */
export function rangesForAnalyte(analyteKey: string): ReferenceRange[] {
  return REFERENCE_RANGES.filter((r) => r.analyteKey === analyteKey);
}

/** The range for one analyte in one unit, for a sex when the source gives one. */
export function rangeFor(
  analyteKey: string,
  ucum: string,
  sex: Sex = "any",
): ReferenceRange | null {
  const candidates = REFERENCE_RANGES.filter(
    (r) => r.analyteKey === analyteKey && r.ucum === ucum,
  );
  return (
    candidates.find((r) => r.sex === sex) ??
    candidates.find((r) => r.sex === "any") ??
    null
  );
}

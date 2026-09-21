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
  | "electrolytes"
  | "haematology"
  | "proteins"
  | "vitamins"
  | "aminoAcids"
  | "body";

/** The groups, in the order a reader should meet them. */
export const RANGE_GROUPS: readonly RangeGroup[] = [
  "cardiovascular",
  "metabolic",
  "kidney",
  "liver",
  "electrolytes",
  "haematology",
  "proteins",
  "vitamins",
  "aminoAcids",
  "body",
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
const WHO_WAIST_2011: RangeSource = {
  label:
    "Waist circumference and waist-hip ratio: report of a WHO expert consultation (2011)",
  url: "https://www.who.int/publications/i/item/9789241501491",
};
const WHO_HAEMOGLOBIN_2024: RangeSource = {
  label: "WHO guideline on haemoglobin cutoffs to define anaemia (2024)",
  url: "https://www.who.int/publications/i/item/9789240088542",
};
const NORIP_2004: RangeSource = {
  label:
    "Nordic Reference Interval Project 2000, 25 biochemical properties in about 3000 healthy adults (Rustad et al., Scand J Clin Lab Invest 2004;64:271-284)",
  url: "https://pubmed.ncbi.nlm.nih.gov/15223694/",
};
const NORDIN_2004: RangeSource = {
  label:
    "Nordic reference intervals for the blood count in 1826 healthy adults (Nordin et al., Scand J Clin Lab Invest 2004;64:385-398)",
  url: "https://pubmed.ncbi.nlm.nih.gov/15223702/",
};
const PARK_2016: RangeSource = {
  label:
    "Reference ranges in 280 healthy Korean adults on the Sysmex XN-2000 (Park et al., Ann Lab Med 2016;36:244-249)",
  url: "https://pubmed.ncbi.nlm.nih.gov/26915613/",
};
const GARBER_2012: RangeSource = {
  label:
    "AACE/ATA clinical practice guidelines for hypothyroidism in adults (Garber et al., Thyroid 2012;22:1200-1235)",
  url: "https://pubmed.ncbi.nlm.nih.gov/22954017/",
};
const ESC_HF_2021: RangeSource = {
  label:
    "ESC 2021 guidelines for acute and chronic heart failure (McDonagh et al., Eur Heart J 2021;42:3599-3726)",
  url: "https://pubmed.ncbi.nlm.nih.gov/34447992/",
};
const EAS_EFLM_2016: RangeSource = {
  label:
    "EAS/EFLM joint consensus on non-fasting lipid profiles and flagging cut-points (Nordestgaard et al., Eur Heart J 2016;37:1944-1958)",
  url: "https://pubmed.ncbi.nlm.nih.gov/27122601/",
};
const MCLAUGHLIN_2003: RangeSource = {
  label:
    "Triglyceride to HDL ratio as a marker of insulin resistance in 258 overweight adults (McLaughlin et al., Ann Intern Med 2003;139:802-809)",
  url: "https://pubmed.ncbi.nlm.nih.gov/14623617/",
};
const ACR_GOUT_2020: RangeSource = {
  label:
    "ACR 2020 guideline for the management of gout (FitzGerald et al., Arthritis Rheumatol 2020;72:879-895)",
  url: "https://pubmed.ncbi.nlm.nih.gov/32390306/",
};
const NICE_NG239: RangeSource = {
  label: "NICE guideline NG239, vitamin B12 deficiency in over 16s (2024)",
  url: "https://www.nice.org.uk/guidance/ng239",
};
const BCSH_2014: RangeSource = {
  label:
    "BCSH guideline on cobalamin and folate disorders (Devalia et al., Br J Haematol 2014;166:496-513)",
  url: "https://pubmed.ncbi.nlm.nih.gov/24942828/",
};
const BSG_2021: RangeSource = {
  label:
    "BSG guideline on iron deficiency anaemia in adults (Snook et al., Gut 2021;70:2030-2051)",
  url: "https://pubmed.ncbi.nlm.nih.gov/34497146/",
};
const NICE_NG8: RangeSource = {
  label:
    "NICE guideline NG8, chronic kidney disease: managing anaemia (2015, updated 2021)",
  url: "https://www.nice.org.uk/guidance/ng8",
};
const ROTTERDAM_IG_2021: RangeSource = {
  label:
    "Serum immunoglobulins in 8768 adults of the Rotterdam Study (Khan et al., J Clin Immunol 2021;41:1902-1914)",
  url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC8604889/",
};
const LABCORP_AMINO: RangeSource = {
  label:
    "Labcorp plasma amino acid reference intervals, fasting, over 15 years",
  url: "https://www.labcorp.com/resource/plasma-amino-acid-reference-intervals",
};
const WHO_BMI: RangeSource = {
  label: "WHO Global Health Observatory, body mass index indicators for adults",
  url: "https://www.who.int/data/gho/data/themes/topics/topic-details/GHO/body-mass-index",
};
const GALLAGHER_2000: RangeSource = {
  label:
    "Healthy percentage body fat ranges linked to BMI, 1626 adults measured by DXA and four-compartment model (Gallagher et al., Am J Clin Nutr 2000;72:694-701)",
  url: "https://pubmed.ncbi.nlm.nih.gov/10966886/",
};
const JASSO_2002: RangeSource = {
  label:
    "New criteria for obesity disease in Japan, 1193 adults with CT (Examination Committee, Circ J 2002;66:987-992)",
  url: "https://pubmed.ncbi.nlm.nih.gov/12419927/",
};

/**
 * The same bounds restated in a second unit by an exact factor.
 *
 * Only for a quantity whose two units are one measurement: U/L and µkat/L are
 * the same enzyme activity by definition, and creatinine in µmol/L and mg/dL
 * differ by a molar mass and nothing else. Never for a pair like lipoprotein(a)
 * by mass and by particle count, which are different measurements with
 * different codes and get their own entries.
 */
function converted(
  range: ReferenceRange,
  ucum: string,
  factor: number,
  decimals = 2,
): ReferenceRange {
  const scale = (value?: number) =>
    value === undefined
      ? undefined
      : Number((value * factor).toFixed(decimals));
  return {
    ...range,
    ucum,
    guidelineLow: scale(range.guidelineLow),
    guidelineHigh: scale(range.guidelineHigh),
    optimalLow: scale(range.optimalLow),
    optimalHigh: scale(range.optimalHigh),
  };
}

/** The same bounds under a unit that is only another spelling of the first. */
function spelled(range: ReferenceRange, ucum: string): ReferenceRange {
  return { ...range, ucum };
}

/** One range, in every unit a cell count is printed in. */
function cellCount(range: ReferenceRange): ReferenceRange[] {
  return [range, spelled(range, "10*3/uL"), converted(range, "/uL", 1000, 0)];
}

/** One activity, in U/L and in µkat/L. */
function enzyme(range: ReferenceRange): ReferenceRange[] {
  return [range, converted(range, "ukat/L", 1 / 60, 2)];
}

/** One amino acid, Labcorp's interval for fasting plasma over 15 years. */
function aminoAcid(
  analyteKey: string,
  low: number,
  high: number,
  note: string,
): ReferenceRange {
  return {
    analyteKey,
    ucum: "umol/L",
    group: "aminoAcids",
    sex: "any",
    guidelineLow: low,
    guidelineHigh: high,
    basis: "cohort",
    summary: `${low} to ${high} µmol/L in fasting plasma, a reference laboratory's interval for people over 15. ${note} No body publishes an optimal band for a plasma amino acid.`,
    source: LABCORP_AMINO,
  };
}

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

  // ---- Body ----
  {
    analyteKey: "waist-circumference",
    ucum: "cm",
    group: "body",
    sex: "male",
    guidelineHigh: 102,
    optimalHigh: 94,
    basis: "guideline",
    summary:
      "In men, 94 cm marks increased risk and 102 cm substantially increased risk. The thresholds are population-specific; these are the ones for people of European descent.",
    source: WHO_WAIST_2011,
  },
  {
    analyteKey: "waist-circumference",
    ucum: "cm",
    group: "body",
    sex: "female",
    guidelineHigh: 88,
    optimalHigh: 80,
    basis: "guideline",
    summary:
      "In women, 80 cm marks increased risk and 88 cm substantially increased risk. The thresholds are population-specific; these are the ones for people of European descent.",
    source: WHO_WAIST_2011,
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

  // ---- Cardiovascular, continued ----
  //
  // The EAS/EFLM cut-points are the concentrations at which a laboratory
  // report should flag a value, stated for a non-fasting sample and the same
  // for a fasting one except triglycerides.
  {
    analyteKey: "apolipoprotein-a1",
    ucum: "g/L",
    group: "cardiovascular",
    sex: "any",
    guidelineLow: 1.25,
    basis: "consensus",
    summary:
      "Flagged as abnormal at or below 1.25 g/L (125 mg/dL). ApoA1 is the protein of HDL, so higher is the protective direction and the statement names no upper bound.",
    source: EAS_EFLM_2016,
  },
  {
    analyteKey: "apolipoprotein-a1",
    ucum: "mg/dL",
    group: "cardiovascular",
    sex: "any",
    guidelineLow: 125,
    basis: "consensus",
    summary:
      "Flagged as abnormal at or below 125 mg/dL (1.25 g/L). ApoA1 is the protein of HDL, so higher is the protective direction and the statement names no upper bound.",
    source: EAS_EFLM_2016,
  },
  {
    analyteKey: "cholesterol-remnant",
    ucum: "mmol/L",
    group: "cardiovascular",
    sex: "any",
    guidelineHigh: 0.9,
    basis: "consensus",
    summary:
      "Calculated remnant cholesterol, total minus HDL minus LDL, is flagged at or above 0.9 mmol/L (35 mg/dL) in a non-fasting sample. It is the cholesterol carried in triglyceride-rich particles.",
    source: EAS_EFLM_2016,
  },
  {
    analyteKey: "cholesterol-remnant",
    ucum: "mg/dL",
    group: "cardiovascular",
    sex: "any",
    guidelineHigh: 35,
    basis: "consensus",
    summary:
      "Calculated remnant cholesterol, total minus HDL minus LDL, is flagged at or above 35 mg/dL (0.9 mmol/L) in a non-fasting sample. It is the cholesterol carried in triglyceride-rich particles.",
    source: EAS_EFLM_2016,
  },
  {
    analyteKey: "ratio-tg-hdl",
    ucum: "{ratio}",
    group: "cardiovascular",
    sex: "any",
    guidelineHigh: 3.0,
    basis: "cohort",
    summary:
      "In 258 overweight adults without diabetes, a triglyceride to HDL ratio above 3.0, both in mg/dL, picked out insulin resistance with 64% sensitivity and 68% specificity. The ratio here is always computed on a mg/dL basis, so a panel printed in mmol/L is converted before dividing.",
    source: MCLAUGHLIN_2003,
  },
  {
    analyteKey: "nt-probnp",
    ucum: "pg/mL",
    group: "cardiovascular",
    sex: "any",
    guidelineHigh: 125,
    basis: "guideline",
    summary:
      "Below 125 pg/mL in a person who is not acutely unwell makes heart failure unlikely; above it the guideline asks for an echocardiogram. The value rises with age and with reduced kidney function.",
    source: ESC_HF_2021,
  },
  {
    analyteKey: "nt-probnp",
    ucum: "ng/L",
    group: "cardiovascular",
    sex: "any",
    guidelineHigh: 125,
    basis: "guideline",
    summary:
      "Below 125 ng/L in a person who is not acutely unwell makes heart failure unlikely; above it the guideline asks for an echocardiogram. The value rises with age and with reduced kidney function.",
    source: ESC_HF_2021,
  },

  // ---- Metabolic, continued ----
  {
    analyteKey: "tsh",
    ucum: "m[IU]/L",
    group: "metabolic",
    sex: "any",
    guidelineLow: 0.45,
    guidelineHigh: 4.12,
    basis: "guideline",
    summary:
      "The guideline puts the laboratory's own third-generation assay range first and, where none is available in an iodine-sufficient area, 0.45 to 4.12 mIU/L from the NHANES III survey. The upper limit rises with age.",
    source: GARBER_2012,
  },
  {
    analyteKey: "tsh",
    ucum: "u[IU]/mL",
    group: "metabolic",
    sex: "any",
    guidelineLow: 0.45,
    guidelineHigh: 4.12,
    basis: "guideline",
    summary:
      "The guideline puts the laboratory's own third-generation assay range first and, where none is available in an iodine-sufficient area, 0.45 to 4.12 µIU/mL from the NHANES III survey. The upper limit rises with age.",
    source: GARBER_2012,
  },

  // ---- Kidney, continued ----
  //
  // NORIP intervals are 2.5th to 97.5th percentiles of healthy Nordic adults,
  // traceable to reference methods. Where the source partitions by age, the
  // band shown spans the tiers and the summary lists them.
  ...(() => {
    const female: ReferenceRange = {
      analyteKey: "creatinine",
      ucum: "umol/L",
      group: "kidney",
      sex: "female",
      guidelineLow: 50,
      guidelineHigh: 90,
      basis: "cohort",
      summary:
        "50 to 90 µmol/L (0.57 to 1.02 mg/dL) in women, traceable to the isotope-dilution reference method. Creatinine follows muscle mass; the kidney figure is eGFR.",
      source: NORIP_2004,
    };
    const male: ReferenceRange = {
      ...female,
      sex: "male",
      guidelineLow: 60,
      guidelineHigh: 100,
      summary:
        "60 to 100 µmol/L (0.68 to 1.13 mg/dL) in men, traceable to the isotope-dilution reference method. Creatinine follows muscle mass; the kidney figure is eGFR.",
    };
    return [
      female,
      male,
      converted(female, "mg/dL", 0.01131),
      converted(male, "mg/dL", 0.01131),
    ];
  })(),
  ...(() => {
    const female: ReferenceRange = {
      analyteKey: "urea",
      ucum: "mmol/L",
      group: "kidney",
      sex: "female",
      guidelineLow: 2.6,
      guidelineHigh: 7.9,
      basis: "cohort",
      summary:
        "Women: 2.6 to 6.4 mmol/L to age 49 and 3.1 to 7.9 from 50 (16 to 47 mg/dL urea). The band shown spans both age tiers.",
      source: NORIP_2004,
    };
    const male: ReferenceRange = {
      ...female,
      sex: "male",
      guidelineLow: 3.2,
      guidelineHigh: 8.1,
      summary:
        "Men: 3.2 to 8.1 mmol/L to age 49 and 3.5 to 8.1 from 50 (19 to 49 mg/dL urea). The band shown spans both age tiers.",
    };
    return [
      female,
      male,
      converted(female, "mg/dL", 6.006, 0),
      converted(male, "mg/dL", 6.006, 0),
    ];
  })(),
  {
    analyteKey: "urate",
    ucum: "mg/dL",
    group: "kidney",
    sex: "any",
    guidelineHigh: 6.8,
    basis: "guideline",
    summary:
      "A serum urate of 6.8 mg/dL (405 µmol/L) or more is hyperuricaemia, the concentration at which urate can crystallise. The target of under 6 mg/dL is stated for people with gout on treatment, not for everyone.",
    source: ACR_GOUT_2020,
  },
  {
    analyteKey: "urate",
    ucum: "umol/L",
    group: "kidney",
    sex: "any",
    guidelineHigh: 405,
    basis: "guideline",
    summary:
      "A serum urate of 405 µmol/L (6.8 mg/dL) or more is hyperuricaemia, the concentration at which urate can crystallise. The target of under 357 µmol/L is stated for people with gout on treatment, not for everyone.",
    source: ACR_GOUT_2020,
  },

  // ---- Liver and pancreas, continued ----
  ...enzyme({
    analyteKey: "ast",
    ucum: "U/L",
    group: "liver",
    sex: "female",
    guidelineLow: 15,
    guidelineHigh: 35,
    basis: "cohort",
    summary:
      "15 to 35 U/L (0.25 to 0.58 µkat/L) in women, measured by the IFCC reference method at 37 °C. Rises with liver damage and also with muscle injury or hard exercise.",
    source: NORIP_2004,
  }),
  ...enzyme({
    analyteKey: "ast",
    ucum: "U/L",
    group: "liver",
    sex: "male",
    guidelineLow: 15,
    guidelineHigh: 45,
    basis: "cohort",
    summary:
      "15 to 45 U/L (0.25 to 0.75 µkat/L) in men, measured by the IFCC reference method at 37 °C. Rises with liver damage and also with muscle injury or hard exercise.",
    source: NORIP_2004,
  }),
  ...enzyme({
    analyteKey: "ggt",
    ucum: "U/L",
    group: "liver",
    sex: "female",
    guidelineLow: 10,
    guidelineHigh: 75,
    basis: "cohort",
    summary:
      "Women: 10 to 45 U/L to age 39 and 10 to 75 from 40 (0.17 to 1.25 µkat/L). The band shown spans both age tiers.",
    source: NORIP_2004,
  }),
  ...enzyme({
    analyteKey: "ggt",
    ucum: "U/L",
    group: "liver",
    sex: "male",
    guidelineLow: 10,
    guidelineHigh: 115,
    basis: "cohort",
    summary:
      "Men: 10 to 80 U/L to age 39 and 15 to 115 from 40 (0.17 to 1.92 µkat/L). The band shown spans both age tiers.",
    source: NORIP_2004,
  }),
  ...enzyme({
    analyteKey: "alkaline-phosphatase",
    ucum: "U/L",
    group: "liver",
    sex: "any",
    guidelineLow: 35,
    guidelineHigh: 105,
    basis: "cohort",
    summary:
      "35 to 105 U/L (0.58 to 1.75 µkat/L) in adults, by the IFCC reference method. A raised value asks whether it comes from bile ducts or from bone.",
    source: NORIP_2004,
  }),
  ...enzyme({
    analyteKey: "ldh",
    ucum: "U/L",
    group: "liver",
    sex: "any",
    guidelineLow: 105,
    guidelineHigh: 255,
    basis: "cohort",
    summary:
      "105 to 205 U/L to age 69 and 115 to 255 from 70 (1.75 to 4.25 µkat/L); the band shown spans both. A sample that sat too long or haemolysed reads high.",
    source: NORIP_2004,
  }),
  ...enzyme({
    analyteKey: "amylase",
    ucum: "U/L",
    group: "liver",
    sex: "any",
    guidelineLow: 25,
    guidelineHigh: 120,
    basis: "cohort",
    summary:
      "Total amylase 25 to 120 U/L (0.42 to 2.0 µkat/L); the pancreatic fraction alone is 10 to 65 U/L. Salivary glands contribute the rest.",
    source: NORIP_2004,
  }),
  ...(() => {
    const base: ReferenceRange = {
      analyteKey: "bilirubin-total",
      ucum: "umol/L",
      group: "liver",
      sex: "any",
      guidelineLow: 5,
      guidelineHigh: 25,
      basis: "cohort",
      summary:
        "5 to 25 µmol/L (0.3 to 1.5 mg/dL) in adults. A mildly raised value with everything else normal is often Gilbert's syndrome, which is harmless.",
      source: NORIP_2004,
    };
    return [base, converted(base, "mg/dL", 0.05848, 1)];
  })(),

  // ---- Electrolytes and minerals ----
  {
    analyteKey: "sodium",
    ucum: "mmol/L",
    group: "electrolytes",
    sex: "any",
    guidelineLow: 137,
    guidelineHigh: 145,
    basis: "cohort",
    summary:
      "137 to 145 mmol/L in serum. Sodium tracks water balance more than salt intake; a low value usually means too much water rather than too little sodium.",
    source: NORIP_2004,
  },
  {
    analyteKey: "potassium",
    ucum: "mmol/L",
    group: "electrolytes",
    sex: "any",
    guidelineLow: 3.6,
    guidelineHigh: 4.6,
    basis: "cohort",
    summary:
      "3.6 to 4.6 mmol/L in serum; plasma runs about 0.2 lower. A sample that was squeezed, shaken or left standing reads high, so an unexpected result is repeated before it is believed.",
    source: NORIP_2004,
  },
  ...(() => {
    const base: ReferenceRange = {
      analyteKey: "calcium",
      ucum: "mmol/L",
      group: "electrolytes",
      sex: "any",
      guidelineLow: 2.15,
      guidelineHigh: 2.51,
      basis: "cohort",
      summary:
        "2.15 to 2.51 mmol/L (8.6 to 10.1 mg/dL) total calcium in serum. About half is bound to albumin, so a low albumin lowers the total without changing the free calcium.",
      source: NORIP_2004,
    };
    return [base, converted(base, "mg/dL", 4.008, 1)];
  })(),
  ...(() => {
    const base: ReferenceRange = {
      analyteKey: "calcium-albumin-corrected",
      ucum: "mmol/L",
      group: "electrolytes",
      sex: "any",
      guidelineLow: 2.17,
      guidelineHigh: 2.53,
      basis: "cohort",
      summary:
        "2.17 to 2.47 mmol/L to age 49 and 2.17 to 2.53 from 50 (8.7 to 10.1 mg/dL), corrected as calcium + 0.020 × (41.3 − albumin in g/L). The band shown spans both tiers.",
      source: NORIP_2004,
    };
    return [base, converted(base, "mg/dL", 4.008, 1)];
  })(),
  ...(() => {
    const base: ReferenceRange = {
      analyteKey: "magnesium",
      ucum: "mmol/L",
      group: "electrolytes",
      sex: "any",
      guidelineLow: 0.71,
      guidelineHigh: 0.94,
      basis: "cohort",
      summary:
        "0.71 to 0.94 mmol/L (1.73 to 2.29 mg/dL) in serum. Most magnesium is inside cells and bone, so serum can be normal while stores are low.",
      source: NORIP_2004,
    };
    return [base, converted(base, "mg/dL", 2.431, 2)];
  })(),

  // ---- Blood count and iron, continued ----
  //
  // WHO's anaemia cut-offs, already here in g/dL, restated in the units a
  // European report prints. Nordic intervals for the rest of the count; the
  // differential, RDW and MPV come from a smaller Korean cohort because the
  // Nordic study did not measure them.
  {
    analyteKey: "haemoglobin",
    ucum: "g/L",
    group: "haematology",
    sex: "male",
    guidelineLow: 130,
    optimalLow: 130,
    basis: "guideline",
    summary:
      "Anaemia in men is below 130 g/L (13.0 g/dL, 8.07 mmol/L) at sea level.",
    source: WHO_HAEMOGLOBIN_2024,
  },
  {
    analyteKey: "haemoglobin",
    ucum: "g/L",
    group: "haematology",
    sex: "female",
    guidelineLow: 120,
    optimalLow: 120,
    basis: "guideline",
    summary:
      "Anaemia in non-pregnant women is below 120 g/L (12.0 g/dL, 7.45 mmol/L) at sea level.",
    source: WHO_HAEMOGLOBIN_2024,
  },
  {
    analyteKey: "haemoglobin",
    ucum: "mmol/L",
    group: "haematology",
    sex: "male",
    guidelineLow: 8.07,
    optimalLow: 8.07,
    basis: "guideline",
    summary:
      "Anaemia in men is below 130 g/L at sea level, which is 8.07 mmol/L when haemoglobin is counted per haem group as German laboratories do.",
    source: WHO_HAEMOGLOBIN_2024,
  },
  {
    analyteKey: "haemoglobin",
    ucum: "mmol/L",
    group: "haematology",
    sex: "female",
    guidelineLow: 7.45,
    optimalLow: 7.45,
    basis: "guideline",
    summary:
      "Anaemia in non-pregnant women is below 120 g/L at sea level, which is 7.45 mmol/L when haemoglobin is counted per haem group as German laboratories do.",
    source: WHO_HAEMOGLOBIN_2024,
  },
  ...(() => {
    const female: ReferenceRange = {
      analyteKey: "erythrocytes",
      ucum: "10*12/L",
      group: "haematology",
      sex: "female",
      guidelineLow: 3.94,
      guidelineHigh: 5.16,
      basis: "cohort",
      summary:
        "3.94 to 5.16 × 10¹²/L in women, from 1826 healthy Nordic adults on twelve instrument types.",
      source: NORDIN_2004,
    };
    const male: ReferenceRange = {
      ...female,
      sex: "male",
      guidelineLow: 4.25,
      guidelineHigh: 5.71,
      summary:
        "4.25 to 5.71 × 10¹²/L in men, from 1826 healthy Nordic adults on twelve instrument types.",
    };
    return [female, male, spelled(female, "10*6/uL"), spelled(male, "10*6/uL")];
  })(),
  ...(() => {
    const female: ReferenceRange = {
      analyteKey: "haematocrit",
      ucum: "L/L",
      group: "haematology",
      sex: "female",
      guidelineLow: 0.348,
      guidelineHigh: 0.459,
      basis: "cohort",
      summary:
        "0.348 to 0.459 (34.8 to 45.9 %) in women: the share of blood volume that is red cells.",
      source: NORDIN_2004,
    };
    const male: ReferenceRange = {
      ...female,
      sex: "male",
      guidelineLow: 0.395,
      guidelineHigh: 0.5,
      summary:
        "0.395 to 0.500 (39.5 to 50.0 %) in men: the share of blood volume that is red cells.",
    };
    return [
      female,
      male,
      converted(female, "%", 100, 1),
      converted(male, "%", 100, 1),
    ];
  })(),
  {
    analyteKey: "mcv",
    ucum: "fL",
    group: "haematology",
    sex: "any",
    guidelineLow: 82,
    guidelineHigh: 98,
    basis: "cohort",
    summary:
      "82 to 98 fL. Small cells point towards iron deficiency or thalassaemia, large ones towards B12 or folate deficiency, alcohol or liver disease.",
    source: NORDIN_2004,
  },
  ...(() => {
    const base: ReferenceRange = {
      analyteKey: "mch",
      ucum: "pg",
      group: "haematology",
      sex: "any",
      guidelineLow: 27.1,
      guidelineHigh: 33.3,
      basis: "cohort",
      summary:
        "27.1 to 33.3 pg (1.68 to 2.07 fmol) of haemoglobin per red cell. Read together with MCV.",
      source: NORDIN_2004,
    };
    return [base, converted(base, "fmol", 0.06206, 2)];
  })(),
  ...(() => {
    const base: ReferenceRange = {
      analyteKey: "mchc",
      ucum: "g/L",
      group: "haematology",
      sex: "any",
      guidelineLow: 317,
      guidelineHigh: 357,
      basis: "cohort",
      summary:
        "317 to 357 g/L (31.7 to 35.7 g/dL, 19.7 to 22.2 mmol/L): the haemoglobin concentration inside the red cells themselves.",
      source: NORDIN_2004,
    };
    return [
      base,
      converted(base, "g/dL", 0.1, 1),
      converted(base, "mmol/L", 0.06206, 1),
    ];
  })(),
  ...(() => {
    const female: ReferenceRange = {
      analyteKey: "platelets",
      ucum: "10*9/L",
      group: "haematology",
      sex: "female",
      guidelineLow: 165,
      guidelineHigh: 387,
      basis: "cohort",
      summary: "165 to 387 × 10⁹/L in women, from 1826 healthy Nordic adults.",
      source: NORDIN_2004,
    };
    const male: ReferenceRange = {
      ...female,
      sex: "male",
      guidelineLow: 145,
      guidelineHigh: 348,
      summary: "145 to 348 × 10⁹/L in men, from 1826 healthy Nordic adults.",
    };
    return [female, male, spelled(female, "10*3/uL"), spelled(male, "10*3/uL")];
  })(),
  ...(() => {
    const base: ReferenceRange = {
      analyteKey: "leukocytes",
      ucum: "10*9/L",
      group: "haematology",
      sex: "any",
      guidelineLow: 3.5,
      guidelineHigh: 8.8,
      basis: "cohort",
      summary:
        "3.5 to 8.8 × 10⁹/L, from 1826 healthy Nordic adults. Smoking raised the mean by 1.1 × 10⁹/L in that cohort.",
      source: NORDIN_2004,
    };
    return [base, spelled(base, "10*3/uL")];
  })(),
  ...cellCount({
    analyteKey: "neutrophils",
    ucum: "10*9/L",
    group: "haematology",
    sex: "any",
    guidelineLow: 1.78,
    guidelineHigh: 6.04,
    basis: "cohort",
    summary:
      "1.78 to 6.04 × 10⁹/L in 280 healthy Korean adults. People of African descent commonly run lower without any illness.",
    source: PARK_2016,
  }),
  {
    analyteKey: "neutrophils",
    ucum: "%",
    group: "haematology",
    sex: "any",
    guidelineLow: 40.8,
    guidelineHigh: 70.4,
    basis: "cohort",
    summary:
      "40.8 to 70.4 % of white cells in 280 healthy Korean adults. The absolute count says more than the share.",
    source: PARK_2016,
  },
  ...cellCount({
    analyteKey: "lymphocytes",
    ucum: "10*9/L",
    group: "haematology",
    sex: "any",
    guidelineLow: 1.01,
    guidelineHigh: 3.15,
    basis: "cohort",
    summary:
      "1.39 to 3.15 × 10⁹/L at 20 to 40, 1.24 to 3.05 at 41 to 60 and 1.01 to 2.75 over 60, in 280 healthy Korean adults. The band shown spans the age tiers.",
    source: PARK_2016,
  }),
  {
    analyteKey: "lymphocytes",
    ucum: "%",
    group: "haematology",
    sex: "any",
    guidelineLow: 20.1,
    guidelineHigh: 46.8,
    basis: "cohort",
    summary:
      "20.1 to 46.8 % of white cells in 280 healthy Korean adults. The absolute count says more than the share.",
    source: PARK_2016,
  },
  ...cellCount({
    analyteKey: "monocytes",
    ucum: "10*9/L",
    group: "haematology",
    sex: "male",
    guidelineLow: 0.29,
    guidelineHigh: 0.72,
    basis: "cohort",
    summary: "0.29 to 0.72 × 10⁹/L in men, from 280 healthy Korean adults.",
    source: PARK_2016,
  }),
  ...cellCount({
    analyteKey: "monocytes",
    ucum: "10*9/L",
    group: "haematology",
    sex: "female",
    guidelineLow: 0.24,
    guidelineHigh: 0.72,
    basis: "cohort",
    summary: "0.24 to 0.72 × 10⁹/L in women, from 280 healthy Korean adults.",
    source: PARK_2016,
  }),
  {
    analyteKey: "monocytes",
    ucum: "%",
    group: "haematology",
    sex: "any",
    guidelineLow: 4.0,
    guidelineHigh: 11.4,
    basis: "cohort",
    summary:
      "4.0 to 11.4 % of white cells across the sex and age tiers of 280 healthy Korean adults. The absolute count says more than the share.",
    source: PARK_2016,
  },
  ...cellCount({
    analyteKey: "eosinophils",
    ucum: "10*9/L",
    group: "haematology",
    sex: "male",
    guidelineLow: 0.04,
    guidelineHigh: 0.58,
    basis: "cohort",
    summary:
      "0.04 to 0.58 × 10⁹/L in men, from 280 healthy Korean adults. Allergy and parasites raise it.",
    source: PARK_2016,
  }),
  ...cellCount({
    analyteKey: "eosinophils",
    ucum: "10*9/L",
    group: "haematology",
    sex: "female",
    guidelineLow: 0.01,
    guidelineHigh: 0.59,
    basis: "cohort",
    summary:
      "0.01 to 0.59 × 10⁹/L in women, from 280 healthy Korean adults. Allergy and parasites raise it.",
    source: PARK_2016,
  }),
  {
    analyteKey: "eosinophils",
    ucum: "%",
    group: "haematology",
    sex: "male",
    guidelineLow: 0.7,
    guidelineHigh: 8.9,
    basis: "cohort",
    summary:
      "0.7 to 8.9 % of white cells in men, from 280 healthy Korean adults.",
    source: PARK_2016,
  },
  {
    analyteKey: "eosinophils",
    ucum: "%",
    group: "haematology",
    sex: "female",
    guidelineLow: 0.2,
    guidelineHigh: 10.2,
    basis: "cohort",
    summary:
      "0.2 to 10.2 % of white cells in women, from 280 healthy Korean adults.",
    source: PARK_2016,
  },
  ...cellCount({
    analyteKey: "basophils",
    ucum: "10*9/L",
    group: "haematology",
    sex: "any",
    guidelineLow: 0.01,
    guidelineHigh: 0.09,
    basis: "cohort",
    summary:
      "0.01 to 0.09 × 10⁹/L in 280 healthy Korean adults, the rarest white cell.",
    source: PARK_2016,
  }),
  {
    analyteKey: "basophils",
    ucum: "%",
    group: "haematology",
    sex: "any",
    guidelineLow: 0.2,
    guidelineHigh: 1.5,
    basis: "cohort",
    summary: "0.2 to 1.5 % of white cells in 280 healthy Korean adults.",
    source: PARK_2016,
  },
  ...cellCount({
    analyteKey: "immature-granulocytes",
    ucum: "10*9/L",
    group: "haematology",
    sex: "any",
    guidelineLow: 0,
    guidelineHigh: 0.04,
    basis: "cohort",
    summary:
      "0 to 0.04 × 10⁹/L in 280 healthy Korean adults. The marrow releases young granulocytes early when it is under pressure, as in infection.",
    source: PARK_2016,
  }),
  {
    analyteKey: "immature-granulocytes",
    ucum: "%",
    group: "haematology",
    sex: "any",
    guidelineLow: 0,
    guidelineHigh: 0.5,
    basis: "cohort",
    summary: "0 to 0.5 % of white cells in 280 healthy Korean adults.",
    source: PARK_2016,
  },
  {
    analyteKey: "rdw",
    ucum: "%",
    group: "haematology",
    sex: "any",
    guidelineLow: 11.2,
    guidelineHigh: 15.6,
    basis: "cohort",
    summary:
      "11.2 to 15.6 % across the age tiers of 280 healthy Korean adults. A rise means red cells of uneven size, which often precedes a change in MCV.",
    source: PARK_2016,
  },
  {
    analyteKey: "mpv",
    ucum: "fL",
    group: "haematology",
    sex: "any",
    guidelineLow: 9.1,
    guidelineHigh: 12.6,
    basis: "cohort",
    summary:
      "9.1 to 12.6 fL in 280 healthy Korean adults on one instrument. MPV depends on the analyser and on how long the tube stood, so instruments differ.",
    source: PARK_2016,
  },
  ...(() => {
    const base: ReferenceRange = {
      analyteKey: "reticulocyte-haemoglobin",
      ucum: "pg",
      group: "haematology",
      sex: "any",
      guidelineLow: 29,
      basis: "guideline",
      summary:
        "Below 29 pg (1.8 fmol) the newest red cells are being built short of iron. Stated for people with chronic kidney disease, as the test to use when hypochromic red cells cannot be measured.",
      source: NICE_NG8,
    };
    return [base, converted(base, "fmol", 0.06206, 2)];
  })(),
  {
    analyteKey: "transferrin-saturation",
    ucum: "%",
    group: "haematology",
    sex: "any",
    guidelineLow: 20,
    basis: "guideline",
    summary:
      "Below 20 % points to iron deficiency. The guideline uses it where ferritin cannot be trusted, with ferritin of 100 to 300 µg/L in the presence of inflammation.",
    source: BSG_2021,
  },
  ...(() => {
    const base: ReferenceRange = {
      analyteKey: "iron",
      ucum: "umol/L",
      group: "haematology",
      sex: "any",
      guidelineLow: 9,
      guidelineHigh: 34,
      basis: "cohort",
      summary:
        "9 to 34 µmol/L (50 to 190 µg/dL). Serum iron swings through the day and with the last meal; ferritin and transferrin saturation say more about stores.",
      source: NORIP_2004,
    };
    return [base, converted(base, "ug/dL", 5.585, 0)];
  })(),

  // ---- Proteins and immunity ----
  ...(() => {
    const base: ReferenceRange = {
      analyteKey: "albumin",
      ucum: "g/L",
      group: "proteins",
      sex: "any",
      guidelineLow: 34,
      guidelineHigh: 48,
      basis: "cohort",
      summary:
        "36 to 48 g/L to age 39, 36 to 45 from 40 to 69 and 34 to 45 from 70 (3.4 to 4.8 g/dL); the band shown spans the tiers. Falls with inflammation, liver disease and protein loss.",
      source: NORIP_2004,
    };
    return [base, converted(base, "g/dL", 0.1, 1)];
  })(),
  ...(() => {
    const base: ReferenceRange = {
      analyteKey: "protein-total",
      ucum: "g/L",
      group: "proteins",
      sex: "any",
      guidelineLow: 62,
      guidelineHigh: 78,
      basis: "cohort",
      summary:
        "62 to 78 g/L (6.2 to 7.8 g/dL) in serum: albumin plus the immunoglobulins, mostly. Standing up for a while before the draw raises it a little.",
      source: NORIP_2004,
    };
    return [base, converted(base, "g/dL", 0.1, 1)];
  })(),
  ...(() => {
    const base: ReferenceRange = {
      analyteKey: "immunoglobulin-g",
      ucum: "g/L",
      group: "proteins",
      sex: "any",
      guidelineLow: 6.2,
      guidelineHigh: 15.1,
      basis: "cohort",
      summary:
        "6.2 to 15.1 g/L (620 to 1510 mg/dL) in 8768 Dutch adults of the Rotterdam Study, median age 62. Nearly the same in men and women.",
      source: ROTTERDAM_IG_2021,
    };
    return [base, converted(base, "mg/dL", 100, 0)];
  })(),

  // ---- Vitamins, continued ----
  {
    analyteKey: "vitamin-b12",
    ucum: "ng/L",
    group: "vitamins",
    sex: "any",
    guidelineLow: 180,
    optimalLow: 350,
    basis: "guideline",
    summary:
      "Total B12 below 180 ng/L (133 pmol/L) confirms deficiency, 180 to 350 ng/L is indeterminate and calls for methylmalonic acid or homocysteine, above 350 (258 pmol/L) makes deficiency unlikely.",
    source: NICE_NG239,
  },
  {
    analyteKey: "vitamin-b12",
    ucum: "pg/mL",
    group: "vitamins",
    sex: "any",
    guidelineLow: 180,
    optimalLow: 350,
    basis: "guideline",
    summary:
      "Total B12 below 180 pg/mL (133 pmol/L) confirms deficiency, 180 to 350 pg/mL is indeterminate and calls for methylmalonic acid or homocysteine, above 350 (258 pmol/L) makes deficiency unlikely.",
    source: NICE_NG239,
  },
  {
    analyteKey: "vitamin-b12",
    ucum: "pmol/L",
    group: "vitamins",
    sex: "any",
    guidelineLow: 133,
    optimalLow: 258,
    basis: "guideline",
    summary:
      "Total B12 below 133 pmol/L (180 ng/L) confirms deficiency, 133 to 258 pmol/L is indeterminate and calls for methylmalonic acid or homocysteine, above 258 (350 ng/L) makes deficiency unlikely.",
    source: NICE_NG239,
  },
  {
    analyteKey: "folate",
    ucum: "ng/mL",
    group: "vitamins",
    sex: "any",
    guidelineLow: 3,
    basis: "guideline",
    summary:
      "A serum folate below 3 µg/L (7 nmol/L) indicates deficiency. Serum folate is the first-line test and as good as red cell folate; the result reflects recent intake as well as stores.",
    source: BCSH_2014,
  },
  {
    analyteKey: "folate",
    ucum: "ug/L",
    group: "vitamins",
    sex: "any",
    guidelineLow: 3,
    basis: "guideline",
    summary:
      "A serum folate below 3 µg/L (7 nmol/L) indicates deficiency. Serum folate is the first-line test and as good as red cell folate; the result reflects recent intake as well as stores.",
    source: BCSH_2014,
  },

  // ---- Amino acids ----
  //
  // No guideline states a plasma amino acid threshold and no body names an
  // optimal band, so these are a reference laboratory's published intervals,
  // and the summary says so on every row. Cysteine is left out: laboratories
  // report cystine, total cysteine or free cysteine, which are three different
  // numbers, and a sheet rarely says which.
  aminoAcid(
    "isoleucine",
    27.7,
    112.8,
    "A branched-chain essential amino acid; rises after a protein meal and falls with fasting.",
  ),
  aminoAcid(
    "leucine",
    54.9,
    205.0,
    "A branched-chain essential amino acid; rises after a protein meal and falls with fasting.",
  ),
  aminoAcid(
    "valine",
    102.6,
    345.4,
    "A branched-chain essential amino acid; rises after a protein meal and falls with fasting.",
  ),
  aminoAcid("lysine", 94.0, 278.0, "Essential; the body cannot make it."),
  aminoAcid(
    "methionine",
    12.7,
    41.1,
    "Essential and sulphur-bearing; homocysteine is made from it.",
  ),
  aminoAcid(
    "phenylalanine",
    33.6,
    101.9,
    "Essential; a persistently high value is what newborn screening looks for.",
  ),
  aminoAcid("threonine", 67.8, 211.6, "Essential."),
  aminoAcid(
    "tryptophan",
    23.5,
    93.0,
    "Essential; the starting point for serotonin and niacin.",
  ),
  aminoAcid("histidine", 47.2, 98.5, "Essential in children and under stress."),
  aminoAcid(
    "alanine",
    124.8,
    564.2,
    "Carries nitrogen from muscle to the liver.",
  ),
  aminoAcid(
    "arginine",
    32.0,
    150.0,
    "A step of the urea cycle and the source of nitric oxide.",
  ),
  aminoAcid("asparagine", 29.5, 84.5, "Not essential."),
  aminoAcid(
    "aspartate",
    0.9,
    7.4,
    "Not essential; low in plasma because cells keep it inside.",
  ),
  aminoAcid(
    "citrulline",
    13.7,
    63.2,
    "Made by the gut lining, so a low value is used as a marker of a shortened or damaged small bowel.",
  ),
  aminoAcid(
    "glutamate",
    18.1,
    155.9,
    "Rises when a sample stood before separation, as glutamine breaks down into it.",
  ),
  aminoAcid(
    "glutamine",
    332.0,
    754.0,
    "The most abundant amino acid in plasma; falls when a sample stood before separation.",
  ),
  aminoAcid("glycine", 132.0, 467.0, "A third of collagen."),
  aminoAcid(
    "ornithine",
    30.5,
    131.4,
    "A step of the urea cycle, not used to build protein.",
  ),
  aminoAcid("proline", 84.8, 352.5, "A building block of collagen."),
  aminoAcid("serine", 48.7, 145.2, "Not essential."),
  aminoAcid(
    "taurine",
    29.2,
    132.3,
    "Released by platelets when a sample clots, so serum runs higher than plasma.",
  ),
  aminoAcid(
    "tyrosine",
    31.1,
    118.1,
    "Made from phenylalanine; the precursor of thyroid hormone and the catecholamines.",
  ),

  // ---- Body, continued ----
  {
    analyteKey: "bmi",
    ucum: "kg/m2",
    group: "body",
    sex: "any",
    guidelineLow: 18.5,
    guidelineHigh: 25,
    basis: "guideline",
    summary:
      "WHO counts adults below 18.5 as underweight, 25 and over as overweight and 30 and over as obese. A population measure that cannot tell muscle from fat, and the cut-offs are lower for people of Asian descent.",
    source: WHO_BMI,
  },
  {
    analyteKey: "body-fat",
    ucum: "%",
    group: "body",
    sex: "male",
    guidelineLow: 8,
    guidelineHigh: 24,
    basis: "cohort",
    summary:
      "Healthy ranges for men, matched to a BMI of 18.5 to 25: 8 to 19 % at 20 to 39, 11 to 21 % at 40 to 59, 13 to 24 % at 60 to 79. Obesity begins at 25, 28 and 30 %. The band shown spans the age tiers. Measured by DXA; a bioimpedance scale estimates and usually reads differently.",
    source: GALLAGHER_2000,
  },
  {
    analyteKey: "body-fat",
    ucum: "%",
    group: "body",
    sex: "female",
    guidelineLow: 21,
    guidelineHigh: 35,
    basis: "cohort",
    summary:
      "Healthy ranges for women, matched to a BMI of 18.5 to 25: 21 to 32 % at 20 to 39, 23 to 33 % at 40 to 59, 24 to 35 % at 60 to 79. Obesity begins at 39, 40 and 42 %. The band shown spans the age tiers. Measured by DXA; a bioimpedance scale estimates and usually reads differently.",
    source: GALLAGHER_2000,
  },
  {
    analyteKey: "visceral-fat",
    ucum: "cm2",
    group: "body",
    sex: "any",
    guidelineHigh: 100,
    basis: "consensus",
    summary:
      "A visceral fat area of 100 cm² or more at the navel, measured by CT, marks visceral obesity in the Japanese criteria; at that point people carried more than one metabolic risk factor on average. A scale estimates the area by bioimpedance rather than measuring it.",
    source: JASSO_2002,
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

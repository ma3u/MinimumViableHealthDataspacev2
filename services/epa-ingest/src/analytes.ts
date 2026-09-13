/**
 * Analyte dictionary, German lab labels → LOINC + UCUM.
 *
 * Scope is deliberately cardiovascular-first (issue #182 W9's real case: a
 * cardiovascular-risk cohort panel), plus the routine chemistry that appears on
 * the same sheet. Anything not in here is reported as `unknown-analyte`, never
 * guessed: a mis-coded lab value is worse than an un-coded one.
 *
 * Some analytes are reported in two different dimensions and take a DIFFERENT
 * LOINC code per dimension, Lp(a) as mass vs. moles, HbA1c as % vs. mmol/mol.
 * Coding by label alone would silently produce the wrong code, so the unit
 * selects the coding and a unit we do not recognise for an analyte is an error,
 * not a fallback.
 *
 * The codes below are the widely used ones for these measurements. Validate the
 * table against an official LOINC release before anyone treats its output as a
 * clinical document, see README, "What this is not".
 */
import type { AnalyteCoding } from "./types.js";

/** Strips case, spacing, punctuation and German diacritics for matching. */
export function normaliseLabel(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Maps a printed unit onto its UCUM code.
 * Returns `null` for units we have no UCUM mapping for, the caller reports
 * `unknown-unit` rather than passing an uncoded unit into FHIR.
 */
export function normaliseUnit(raw: string): string | null {
  const u = raw.trim().replace(/µ|μ/g, "u").replace(/\s+/g, "").toLowerCase();
  const map: Record<string, string> = {
    "mg/dl": "mg/dL",
    "mg/l": "mg/L",
    "g/dl": "g/dL",
    "g/l": "g/L",
    "ug/l": "ug/L",
    "ug/dl": "ug/dL",
    "ng/ml": "ng/mL",
    "ng/l": "ng/L",
    "pg/ml": "pg/mL",
    "mmol/l": "mmol/L",
    "umol/l": "umol/L",
    "nmol/l": "nmol/L",
    "pmol/l": "pmol/L",
    "mmol/mol": "mmol/mol",
    "u/l": "U/L",
    "iu/l": "[IU]/L",
    "mu/l": "m[IU]/L",
    "miu/l": "m[IU]/L",
    "%": "%",
    "ml/min/1.73m2": "mL/min/{1.73_m2}",
    "ml/min/1,73m2": "mL/min/{1.73_m2}",
    "ml/min": "mL/min",
    "/nl": "10*9/L",
    "g/nl": "10*9/L",
    "10^9/l": "10*9/L",
    "10^3/ul": "10*3/uL",
    "/ul": "/uL",
  };
  return map[u] ?? null;
}

interface AnalyteDefinition {
  key: string;
  labels: string[];
  /** UCUM unit → coding. The unit picks the code, never the label alone. */
  byUnit: Record<string, AnalyteCoding>;
}

const c = (
  loincNumber: string,
  display: string,
  ucum: string,
): AnalyteCoding => ({
  loincNumber,
  display,
  ucum,
});

const DEFINITIONS: AnalyteDefinition[] = [
  // ---- Lipids: the cardiovascular-risk core ----
  {
    key: "cholesterol-total",
    labels: [
      "Cholesterin",
      "Gesamtcholesterin",
      "Cholesterin gesamt",
      "Cholesterol total",
    ],
    byUnit: {
      "mg/dL": c(
        "2093-3",
        "Cholesterol [Mass/volume] in Serum or Plasma",
        "mg/dL",
      ),
      "mmol/L": c(
        "14647-2",
        "Cholesterol [Moles/volume] in Serum or Plasma",
        "mmol/L",
      ),
    },
  },
  {
    key: "cholesterol-ldl",
    labels: ["LDL-Cholesterin", "LDL Cholesterin", "LDL", "LDL-C"],
    byUnit: {
      "mg/dL": c(
        "2089-1",
        "Cholesterol in LDL [Mass/volume] in Serum or Plasma",
        "mg/dL",
      ),
      "mmol/L": c(
        "22748-8",
        "Cholesterol in LDL [Moles/volume] in Serum or Plasma",
        "mmol/L",
      ),
    },
  },
  {
    key: "cholesterol-hdl",
    labels: ["HDL-Cholesterin", "HDL Cholesterin", "HDL", "HDL-C"],
    byUnit: {
      "mg/dL": c(
        "2085-9",
        "Cholesterol in HDL [Mass/volume] in Serum or Plasma",
        "mg/dL",
      ),
      "mmol/L": c(
        "14646-4",
        "Cholesterol in HDL [Moles/volume] in Serum or Plasma",
        "mmol/L",
      ),
    },
  },
  {
    key: "triglycerides",
    labels: ["Triglyceride", "Triglyzeride", "TG"],
    byUnit: {
      "mg/dL": c(
        "2571-8",
        "Triglyceride [Mass/volume] in Serum or Plasma",
        "mg/dL",
      ),
      "mmol/L": c(
        "14927-8",
        "Triglyceride [Moles/volume] in Serum or Plasma",
        "mmol/L",
      ),
    },
  },
  {
    key: "lipoprotein-a",
    labels: ["Lipoprotein(a)", "Lp(a)", "Lipoprotein a", "LPA"],
    byUnit: {
      "mg/dL": c(
        "10835-7",
        "Lipoprotein a [Mass/volume] in Serum or Plasma",
        "mg/dL",
      ),
      "mg/L": c(
        "10835-7",
        "Lipoprotein a [Mass/volume] in Serum or Plasma",
        "mg/L",
      ),
      "nmol/L": c(
        "43583-4",
        "Lipoprotein a [Moles/volume] in Serum or Plasma",
        "nmol/L",
      ),
    },
  },
  {
    key: "apolipoprotein-b",
    labels: ["Apolipoprotein B", "ApoB", "Apo B"],
    byUnit: {
      "mg/dL": c(
        "1884-6",
        "Apolipoprotein B [Mass/volume] in Serum or Plasma",
        "mg/dL",
      ),
      "g/L": c(
        "1884-6",
        "Apolipoprotein B [Mass/volume] in Serum or Plasma",
        "g/L",
      ),
    },
  },
  {
    key: "apolipoprotein-a1",
    labels: ["Apolipoprotein A1", "ApoA1", "Apo A-I", "Apolipoprotein A-I"],
    byUnit: {
      "mg/dL": c(
        "1869-7",
        "Apolipoprotein A-I [Mass/volume] in Serum or Plasma",
        "mg/dL",
      ),
      "g/L": c(
        "1869-7",
        "Apolipoprotein A-I [Mass/volume] in Serum or Plasma",
        "g/L",
      ),
    },
  },
  // ---- Inflammation & cardiac ----
  {
    key: "crp-hs",
    labels: [
      "hs-CRP",
      "hsCRP",
      "CRP hochsensitiv",
      "CRP high sensitive",
      "hochsensitives CRP",
    ],
    byUnit: {
      "mg/L": c(
        "30522-7",
        "C reactive protein [Mass/volume] in Serum or Plasma by High sensitivity method",
        "mg/L",
      ),
    },
  },
  {
    key: "crp",
    labels: ["CRP", "C-reaktives Protein"],
    byUnit: {
      "mg/L": c(
        "1988-5",
        "C reactive protein [Mass/volume] in Serum or Plasma",
        "mg/L",
      ),
      "mg/dL": c(
        "1988-5",
        "C reactive protein [Mass/volume] in Serum or Plasma",
        "mg/dL",
      ),
    },
  },
  {
    key: "nt-probnp",
    labels: ["NT-proBNP", "NTproBNP", "NT pro BNP"],
    byUnit: {
      "pg/mL": c(
        "33762-6",
        "Natriuretic peptide.B prohormone N-Terminal [Mass/volume] in Serum or Plasma",
        "pg/mL",
      ),
      "ng/L": c(
        "33762-6",
        "Natriuretic peptide.B prohormone N-Terminal [Mass/volume] in Serum or Plasma",
        "ng/L",
      ),
    },
  },
  {
    key: "homocysteine",
    labels: ["Homocystein", "Homozystein"],
    byUnit: {
      "umol/L": c(
        "13965-9",
        "Homocysteine [Moles/volume] in Serum or Plasma",
        "umol/L",
      ),
    },
  },
  // ---- Glucose metabolism ----
  {
    key: "hba1c",
    labels: ["HbA1c", "HbA1C", "Hämoglobin A1c", "Glykohämoglobin"],
    byUnit: {
      "%": c("4548-4", "Hemoglobin A1c/Hemoglobin.total in Blood", "%"),
      "mmol/mol": c(
        "59261-8",
        "Hemoglobin A1c/Hemoglobin.total in Blood by IFCC protocol",
        "mmol/mol",
      ),
    },
  },
  {
    key: "glucose",
    labels: ["Glucose", "Glukose", "Nüchternglucose", "Blutzucker"],
    byUnit: {
      "mg/dL": c("2345-7", "Glucose [Mass/volume] in Serum or Plasma", "mg/dL"),
      "mmol/L": c(
        "14749-6",
        "Glucose [Moles/volume] in Serum or Plasma",
        "mmol/L",
      ),
    },
  },
  // ---- Renal ----
  {
    key: "creatinine",
    labels: ["Kreatinin", "Creatinin"],
    byUnit: {
      "mg/dL": c(
        "2160-0",
        "Creatinine [Mass/volume] in Serum or Plasma",
        "mg/dL",
      ),
      "umol/L": c(
        "14682-9",
        "Creatinine [Moles/volume] in Serum or Plasma",
        "umol/L",
      ),
    },
  },
  {
    key: "egfr",
    labels: ["eGFR", "GFR", "eGFR (CKD-EPI)"],
    byUnit: {
      "mL/min/{1.73_m2}": c(
        "62238-1",
        "Glomerular filtration rate/1.73 sq M.predicted [Volume Rate/Area] ... by Creatinine-based formula (CKD-EPI)",
        "mL/min/{1.73_m2}",
      ),
    },
  },
  {
    key: "urate",
    labels: ["Harnsäure", "Urat"],
    byUnit: {
      "mg/dL": c("3084-1", "Urate [Mass/volume] in Serum or Plasma", "mg/dL"),
      "umol/L": c(
        "14933-6",
        "Urate [Moles/volume] in Serum or Plasma",
        "umol/L",
      ),
    },
  },
  // ---- Liver ----
  {
    key: "alt",
    labels: ["GPT", "ALT", "ALAT", "GPT (ALT)"],
    byUnit: {
      "U/L": c(
        "1742-6",
        "Alanine aminotransferase [Enzymatic activity/volume] in Serum or Plasma",
        "U/L",
      ),
    },
  },
  {
    key: "ast",
    labels: ["GOT", "AST", "ASAT", "GOT (AST)"],
    byUnit: {
      "U/L": c(
        "1920-8",
        "Aspartate aminotransferase [Enzymatic activity/volume] in Serum or Plasma",
        "U/L",
      ),
    },
  },
  {
    key: "ggt",
    labels: ["Gamma-GT", "GGT", "γ-GT", "gamma GT"],
    byUnit: {
      "U/L": c(
        "2324-2",
        "Gamma glutamyl transferase [Enzymatic activity/volume] in Serum or Plasma",
        "U/L",
      ),
    },
  },
  // ---- Endocrine & micronutrients ----
  {
    key: "tsh",
    labels: ["TSH", "TSH basal", "Thyreotropin"],
    byUnit: {
      "m[IU]/L": c(
        "3016-3",
        "Thyrotropin [Units/volume] in Serum or Plasma",
        "m[IU]/L",
      ),
    },
  },
  {
    key: "ferritin",
    labels: ["Ferritin"],
    byUnit: {
      "ug/L": c("2276-4", "Ferritin [Mass/volume] in Serum or Plasma", "ug/L"),
      "ng/mL": c(
        "2276-4",
        "Ferritin [Mass/volume] in Serum or Plasma",
        "ng/mL",
      ),
    },
  },
  {
    key: "vitamin-b12",
    labels: ["Vitamin B12", "B12", "Cobalamin"],
    byUnit: {
      "pg/mL": c(
        "2132-9",
        "Cobalamin (Vitamin B12) [Mass/volume] in Serum or Plasma",
        "pg/mL",
      ),
      "ng/L": c(
        "2132-9",
        "Cobalamin (Vitamin B12) [Mass/volume] in Serum or Plasma",
        "ng/L",
      ),
      "pmol/L": c(
        "16695-9",
        "Cobalamin (Vitamin B12) [Moles/volume] in Serum or Plasma",
        "pmol/L",
      ),
    },
  },
  {
    key: "vitamin-d",
    labels: ["Vitamin D", "25-OH-Vitamin D", "25-OH-Vitamin-D3", "Calcidiol"],
    byUnit: {
      "ng/mL": c(
        "1989-3",
        "25-hydroxyvitamin D3 [Mass/volume] in Serum or Plasma",
        "ng/mL",
      ),
      "nmol/L": c(
        "14635-7",
        "25-hydroxyvitamin D3 [Moles/volume] in Serum or Plasma",
        "nmol/L",
      ),
    },
  },
  // ---- Electrolytes & haematology ----
  {
    key: "sodium",
    labels: ["Natrium", "Na"],
    byUnit: {
      "mmol/L": c(
        "2951-2",
        "Sodium [Moles/volume] in Serum or Plasma",
        "mmol/L",
      ),
    },
  },
  {
    key: "potassium",
    labels: ["Kalium", "K"],
    byUnit: {
      "mmol/L": c(
        "2823-3",
        "Potassium [Moles/volume] in Serum or Plasma",
        "mmol/L",
      ),
    },
  },
  {
    key: "haemoglobin",
    labels: ["Hämoglobin", "Hb"],
    byUnit: {
      "g/dL": c("718-7", "Hemoglobin [Mass/volume] in Blood", "g/dL"),
      "g/L": c("718-7", "Hemoglobin [Mass/volume] in Blood", "g/L"),
    },
  },
  {
    key: "platelets",
    labels: ["Thrombozyten", "Thrombos", "PLT"],
    byUnit: {
      "10*9/L": c(
        "777-3",
        "Platelets [#/volume] in Blood by Automated count",
        "10*9/L",
      ),
    },
  },
  {
    key: "leukocytes",
    labels: ["Leukozyten", "Leukos", "WBC"],
    byUnit: {
      "10*9/L": c(
        "6690-2",
        "Leukocytes [#/volume] in Blood by Automated count",
        "10*9/L",
      ),
    },
  },
];

const BY_LABEL = new Map<string, AnalyteDefinition>();
for (const def of DEFINITIONS) {
  for (const label of def.labels) {
    BY_LABEL.set(normaliseLabel(label), def);
  }
}

/** Every analyte key the dictionary knows, for tests and the README table. */
export const ANALYTE_KEYS: readonly string[] = DEFINITIONS.map((d) => d.key);

export type LookupResult =
  | { status: "ok"; analyteKey: string; coding: AnalyteCoding; ucum: string }
  | { status: "unknown-analyte" }
  | { status: "unknown-unit" }
  | { status: "unit-mismatch"; analyteKey: string; expectedUnits: string[] };

/**
 * Resolves a printed label + printed unit to a LOINC coding.
 *
 * The unit is part of the key, not decoration: Lp(a) in mg/dL and Lp(a) in
 * nmol/L are different LOINC codes, and returning either one for the other
 * would put a wrong code on a real measurement.
 */
export function lookupAnalyte(label: string, unitRaw: string): LookupResult {
  const def = BY_LABEL.get(normaliseLabel(label));
  if (!def) return { status: "unknown-analyte" };

  const ucum = normaliseUnit(unitRaw);
  if (!ucum) return { status: "unknown-unit" };

  const coding = def.byUnit[ucum];
  if (!coding) {
    return {
      status: "unit-mismatch",
      analyteKey: def.key,
      expectedUnits: Object.keys(def.byUnit),
    };
  }
  return { status: "ok", analyteKey: def.key, coding, ucum };
}

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

/**
 * Latin letters that OCR sometimes returns as their Cyrillic or Greek twins.
 *
 * A recogniser reading a German lab sheet produced `МСH` for `MCH`, with a
 * Cyrillic Ем and Ес. The glyphs are identical on screen, the code points are
 * not, and `normaliseLabel` then strips them as non-alphanumeric, leaving `h`.
 * The row was reported as an unknown analyte and looked, to a reader, exactly
 * like a row we simply had not added yet.
 *
 * Folded to Latin, because in a German laboratory's analyte name a Cyrillic
 * letter is never anything but damage.
 */
const HOMOGLYPHS: Record<string, string> = {
  А: "A",
  В: "B",
  С: "C",
  Е: "E",
  Н: "H",
  І: "I",
  Ј: "J",
  К: "K",
  М: "M",
  О: "O",
  Р: "P",
  Ѕ: "S",
  Т: "T",
  Х: "X",
  У: "Y",
  а: "a",
  в: "b",
  с: "c",
  е: "e",
  о: "o",
  р: "p",
  у: "y",
  х: "x",
  Α: "A",
  Β: "B",
  Ε: "E",
  Ζ: "Z",
  Η: "H",
  Ι: "I",
  Κ: "K",
  Μ: "M",
  Ν: "N",
  Ο: "O",
  Ρ: "P",
  Τ: "T",
  Υ: "Y",
  Χ: "X",
  ο: "o",
  ρ: "p",
  ν: "v",
};

/** Replaces every homoglyph with the Latin letter it imitates. */
export function foldHomoglyphs(raw: string): string {
  let out = "";
  for (const character of raw) out += HOMOGLYPHS[character] ?? character;
  return out;
}

/** Strips case, spacing, punctuation and German diacritics for matching. */
export function normaliseLabel(raw: string): string {
  return foldHomoglyphs(raw)
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]/g, "");
}

/**
 * The same key with the umlaut digraphs collapsed, for a second, looser lookup.
 *
 * OCR reads `Hämoglobin` as `Hamoglobin` often enough that the first real
 * scan of a blood count refused the row (#186). `normaliseLabel` folds ä to
 * `ae`, so the printed spelling and the dropped-diacritic spelling never met.
 * Collapsing `ae`/`oe`/`ue` on **both** sides makes them meet without
 * touching the strict key, which stays the primary lookup and the stored
 * `labelKey`. The dictionary refuses to load if two different analytes ever
 * collapse to the same loose key, so this can never pick the wrong one.
 */
export function looseLabelKey(raw: string): string {
  return normaliseLabel(raw)
    .replace(/ae/g, "a")
    .replace(/oe/g, "o")
    .replace(/ue/g, "u");
}

/**
 * Maps a printed unit onto its UCUM code.
 * Returns `null` for units we have no UCUM mapping for, the caller reports
 * `unknown-unit` rather than passing an uncoded unit into FHIR.
 */
/** Printed unit spelling, lowercased and without spaces, → UCUM. */
const UNIT_MAP: Record<string, string> = {
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
  "10*9/l": "10*9/L",
  "10^3/ul": "10*3/uL",
  "10*3/ul": "10*3/uL",
  "tsd/ul": "10*3/uL",
  "tsd./ul": "10*3/uL",
  "/pl": "10*12/L",
  "10^12/l": "10*12/L",
  "10*12/l": "10*12/L",
  "10^6/ul": "10*6/uL",
  "10*6/ul": "10*6/uL",
  "mio/ul": "10*6/uL",
  "mio./ul": "10*6/uL",
  "/ul": "/uL",
  fl: "fL",
  pg: "pg",
  "l/l": "L/L",
  "‰": "[ppth]",
  "ng/dl": "ng/dL",
  s: "s",
  sec: "s",
  sek: "s",
  // A Berlin laboratory's SI conventions: giga and tera *particles* per litre
  // for cell counts, katal for enzyme activity, femtomole for a molar MCH.
  "gpt/l": "10*9/L",
  "tpt/l": "10*12/L",
  "ukat/l": "ukat/L",
  "nkat/l": "nkat/L",
  fmol: "fmol",
  // Micro international units per millilitre, numerically equal to mIU/L but
  // not the same printed unit, and this table never converts.
  "uu/ml": "u[IU]/mL",
  "uiu/ml": "u[IU]/mL",
  // Body measurements a person enters themselves. Deliberately no bare `m`:
  // a stray `M` on a lab sheet lowercases to it, and a metre is not a unit any
  // German report prints for a body height.
  cm: "cm",
  kg: "kg",
  "kg/m2": "kg/m2",
  "kg/m²": "kg/m2",
  cm2: "cm2",
  "cm²": "cm2",
  // A haematocrit printed as a percentage by volume, and an eGFR whose
  // superscript the recogniser drops.
  "vol%": "%",
  "vol.%": "%",
  "ml/min/1.73m": "mL/min/{1.73_m2}",
  "ml/min/1,73m": "mL/min/{1.73_m2}",
};

/**
 * Every printed spelling `normaliseUnit` accepts, for the Swift generator and
 * the tests. Data, not a scrape of this file: a formatter once unquoted two
 * keys and the scraped table silently lost `fl` and `pg`.
 */
export const UNIT_SPELLINGS: readonly string[] = [
  ...Object.keys(UNIT_MAP),
  "G/l",
  "T/l",
];

/**
 * Characters a recogniser confuses with one another: capital i, lower-case L,
 * lower-case i, the digit one, a pipe and a slash all render nearly alike.
 *
 * Measured on a real sheet (#186): `U/l` came back as `U/I` and as `UII`, and
 * `µIU/ml` as `ulU/ml`. Those rows carried a perfectly good analyte and value
 * and were refused for a unit that differs from a real one by a glyph.
 */
const CONFUSABLE = new Set(["I", "l", "i", "1", "|", "!", "/"]);
const CONFUSABLE_TARGETS = ["l", "i", "/"];

/**
 * Repairs a unit a recogniser mangled, or returns null.
 *
 * Three guards keep this from inventing units. It runs **only** when the
 * printed spelling is not already a unit, so a real unit is never rewritten.
 * The token must contain at least one character that is not itself confusable,
 * so a run of `III` cannot become `l/l`. And the substitutions must lead to
 * exactly one UCUM code, so an ambiguous repair is refused rather than guessed.
 */
export function repairUnit(raw: string): string | null {
  const compact = raw.trim().replace(/µ|μ/g, "u").replace(/\s+/g, "");
  if (compact.length < 2 || compact.length > 12) return null;
  const positions: number[] = [];
  let hasAnchor = false;
  for (let i = 0; i < compact.length; i++) {
    if (CONFUSABLE.has(compact[i])) positions.push(i);
    else hasAnchor = true;
  }
  if (!hasAnchor || positions.length === 0 || positions.length > 3) return null;

  const found = new Set<string>();
  const total = CONFUSABLE_TARGETS.length ** positions.length;
  for (let mask = 0; mask < total; mask++) {
    const characters = [...compact];
    let rest = mask;
    for (const position of positions) {
      characters[position] =
        CONFUSABLE_TARGETS[rest % CONFUSABLE_TARGETS.length];
      rest = Math.floor(rest / CONFUSABLE_TARGETS.length);
    }
    const candidate = UNIT_MAP[characters.join("").toLowerCase()];
    if (candidate) found.add(candidate);
  }
  return found.size === 1 ? [...found][0] : null;
}

export function normaliseUnit(raw: string): string | null {
  const compact = raw.trim().replace(/µ|μ/g, "u").replace(/\s+/g, "");
  // Case decides before anything is lowercased: German haematology prints
  // `G/l` for giga per litre (10*9/L, a cell count) and `T/l` for tera per
  // litre (10*12/L), while `g/l` is a gram per litre (a haemoglobin). Folding
  // case first would turn a leukocyte count into a mass concentration.
  if (/^G\/[lL]$/.test(compact)) return "10*9/L";
  if (/^T\/[lL]$/.test(compact)) return "10*12/L";
  return UNIT_MAP[compact.toLowerCase()] ?? repairUnit(raw);
}

export interface AnalyteDefinition {
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

/**
 * One white-cell line of the differential, as German sheets print it.
 *
 * The label carries `absolut` / `abs.` or `relativ` / `rel.` (or nothing) and
 * the unit carries the dimension. Only the unit is trusted for the code; the
 * suffix is folded into the synonyms so the row is found either way.
 */
function differential(
  key: string,
  spec: {
    de: string;
    long: string[];
    en: string[];
    count: [loinc: string, display: string];
    share: [loinc: string, display: string];
  },
): AnalyteDefinition[] {
  const suffixes = ["", " absolut", " abs.", " relativ", " rel.", " %"];
  const labels = [spec.de, ...spec.long, ...spec.en].flatMap((base) =>
    suffixes.map((suffix) => `${base}${suffix}`),
  );
  return [
    {
      key,
      labels,
      byUnit: {
        "10*9/L": c(spec.count[0], spec.count[1], "10*9/L"),
        "10*3/uL": c(spec.count[0], spec.count[1], "10*3/uL"),
        // Printed as plain cells per microlitre, e.g. `3359 /µl`.
        "/uL": c(spec.count[0], spec.count[1], "/uL"),
        "%": c(spec.share[0], spec.share[1], "%"),
      },
    },
  ];
}

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
    labels: [
      "LDL-Cholesterin",
      "LDL Cholesterin",
      "Cholesterin-LDL",
      "Cholesterin LDL",
      "LDL",
      "LDL-C",
    ],
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
    labels: [
      "HDL-Cholesterin",
      "HDL Cholesterin",
      "Cholesterin-HDL",
      "Cholesterin HDL",
      "HDL",
      "HDL-C",
    ],
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
    labels: [
      "Triglyceride",
      "Triglyzeride",
      "Triglyceride gesamt",
      "Triglyzeride gesamt",
      "TG",
    ],
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
      "g/L": c(
        "10835-7",
        "Lipoprotein a [Mass/volume] in Serum or Plasma",
        "g/L",
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
    labels: [
      "Glucose",
      "Glukose",
      "Nüchternglucose",
      "Nüchternglukose",
      "Glucose nüchtern",
      "Glukose nüchtern",
      "Blutzucker",
      "Glucose im Fluorid",
      "Glukose im Fluorid",
      "Glucose (Fluorid)",
    ],
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
    labels: [
      "Kreatinin",
      "Creatinin",
      "Kreatinin (Jaffé)",
      "Creatinin (Jaffé)",
      "Kreatinin (enzymatisch)",
      "Kreatinin enzymatisch",
    ],
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
    labels: [
      "eGFR",
      "GFR",
      "eGFR (CKD-EPI)",
      "GFR (CKD-EPI)",
      "GFR Berechnung n. CKD-EPI",
      "GFR n. CKD-EPI",
      "geschätzte GFR",
      "geschätzte GFR (CKD-EPI)",
      "eGFR n.CKD-EPI",
    ],
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
      "ukat/L": c(
        "1742-6",
        "Alanine aminotransferase [Enzymatic activity/volume] in Serum or Plasma",
        "ukat/L",
      ),
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
      "ukat/L": c(
        "1920-8",
        "Aspartate aminotransferase [Enzymatic activity/volume] in Serum or Plasma",
        "ukat/L",
      ),
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
      "ukat/L": c(
        "2324-2",
        "Gamma glutamyl transferase [Enzymatic activity/volume] in Serum or Plasma",
        "ukat/L",
      ),
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
      "u[IU]/mL": c(
        "3016-3",
        "Thyrotropin [Units/volume] in Serum or Plasma",
        "u[IU]/mL",
      ),
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
    labels: ["Hämoglobin", "Hb", "Hemoglobin", "Haemoglobin"],
    byUnit: {
      // German laboratories report haemoglobin in mmol/L, which is a
      // different property and therefore a different code.
      "mmol/L": c("59260-0", "Hemoglobin [Moles/volume] in Blood", "mmol/L"),
      "g/dL": c("718-7", "Hemoglobin [Mass/volume] in Blood", "g/dL"),
      "g/L": c("718-7", "Hemoglobin [Mass/volume] in Blood", "g/L"),
    },
  },
  {
    key: "platelets",
    labels: ["Thrombozyten", "Thrombos", "PLT", "Platelets"],
    byUnit: {
      "10*9/L": c(
        "777-3",
        "Platelets [#/volume] in Blood by Automated count",
        "10*9/L",
      ),
      "10*3/uL": c(
        "777-3",
        "Platelets [#/volume] in Blood by Automated count",
        "10*3/uL",
      ),
    },
  },
  {
    key: "leukocytes",
    labels: ["Leukozyten", "Leukos", "WBC", "Leukocytes"],
    byUnit: {
      "10*9/L": c(
        "6690-2",
        "Leukocytes [#/volume] in Blood by Automated count",
        "10*9/L",
      ),
      "10*3/uL": c(
        "6690-2",
        "Leukocytes [#/volume] in Blood by Automated count",
        "10*3/uL",
      ),
    },
  },
  // ---- The rest of the blood count (Blutbild) ----
  //
  // Added after the first real scan of a blood count coded 2 rows of 41 (#186).
  // Codes checked against the NLM LOINC table on 2026-09-19. RDW-SD is left out
  // on purpose: both of its LOINC codes (21000-5, 30384-2) are deprecated.
  {
    key: "erythrocytes",
    labels: ["Erythrozyten", "Erys", "RBC", "Erythrocytes", "Erythrozytenzahl"],
    byUnit: {
      "10*12/L": c(
        "789-8",
        "Erythrocytes [#/volume] in Blood by Automated count",
        "10*12/L",
      ),
      "10*6/uL": c(
        "789-8",
        "Erythrocytes [#/volume] in Blood by Automated count",
        "10*6/uL",
      ),
    },
  },
  {
    key: "haematocrit",
    labels: [
      "Hämatokrit",
      "Hkt",
      "HKT",
      "HK",
      "HCT",
      "Hematocrit",
      "Haematocrit",
    ],
    byUnit: {
      "%": c(
        "4544-3",
        "Hematocrit [Volume Fraction] of Blood by Automated count",
        "%",
      ),
      "L/L": c(
        "4544-3",
        "Hematocrit [Volume Fraction] of Blood by Automated count",
        "L/L",
      ),
    },
  },
  {
    key: "mcv",
    labels: ["MCV", "Mittleres Erythrozytenvolumen"],
    byUnit: {
      fL: c(
        "787-2",
        "MCV [Entitic mean volume] in Red Blood Cells by Automated count",
        "fL",
      ),
    },
  },
  {
    key: "mch",
    labels: ["MCH", "HbE"],
    byUnit: {
      fmol: c("59468-9", "MCH [Entitic substance]", "fmol"),
      pg: c("785-6", "MCH [Entitic mass] by Automated count", "pg"),
    },
  },
  {
    key: "mchc",
    labels: ["MCHC"],
    byUnit: {
      "mmol/L": c(
        "59467-1",
        "MCHC [Entitic Moles/volume] in Red Blood Cells",
        "mmol/L",
      ),
      "g/dL": c(
        "786-4",
        "MCHC [Entitic Mass/volume] in Red Blood Cells by Automated count",
        "g/dL",
      ),
      "g/L": c(
        "786-4",
        "MCHC [Entitic Mass/volume] in Red Blood Cells by Automated count",
        "g/L",
      ),
    },
  },
  {
    key: "rdw",
    labels: ["RDW", "RDW-CV", "Erythrozytenverteilungsbreite", "EVB"],
    byUnit: {
      "%": c(
        "788-0",
        "Erythrocyte [DistWidth] in Blood by Automated count",
        "%",
      ),
    },
  },
  {
    key: "mpv",
    labels: ["MPV", "Mittleres Thrombozytenvolumen"],
    byUnit: {
      fL: c(
        "32623-1",
        "Platelet [Entitic mean volume] in Blood by Automated count",
        "fL",
      ),
    },
  },
  // The differential. Same analyte, two dimensions, two codes: an absolute
  // count and a share of leukocytes. The printed unit picks the code, which is
  // exactly the rule the table was built around.
  ...differential("neutrophils", {
    de: "Neutrophile",
    long: [
      "Neutrophile Granulozyten",
      "Segmentkernige",
      "Segmentkernige Granulozyten",
    ],
    en: ["Neutrophils", "Neutro", "NEUT"],
    count: ["751-8", "Neutrophils [#/volume] in Blood by Automated count"],
    share: ["770-8", "Neutrophils/Leukocytes in Blood by Automated count"],
  }),
  ...differential("lymphocytes", {
    de: "Lymphozyten",
    long: [],
    en: ["Lymphocytes", "Lympho", "LYMPH"],
    count: ["731-0", "Lymphocytes [#/volume] in Blood by Automated count"],
    share: ["736-9", "Lymphocytes/Leukocytes in Blood by Automated count"],
  }),
  ...differential("monocytes", {
    de: "Monozyten",
    long: [],
    en: ["Monocytes", "Mono", "MONO"],
    count: ["742-7", "Monocytes [#/volume] in Blood by Automated count"],
    share: ["5905-5", "Monocytes/Leukocytes in Blood by Automated count"],
  }),
  ...differential("eosinophils", {
    de: "Eosinophile",
    long: ["Eosinophile Granulozyten"],
    en: ["Eosinophils", "Eos", "EOS"],
    count: ["711-2", "Eosinophils [#/volume] in Blood by Automated count"],
    share: ["713-8", "Eosinophils/Leukocytes in Blood by Automated count"],
  }),
  ...differential("basophils", {
    de: "Basophile",
    long: ["Basophile Granulozyten"],
    en: ["Basophils", "Baso", "BASO"],
    count: ["704-7", "Basophils [#/volume] in Blood by Automated count"],
    share: ["706-2", "Basophils/Leukocytes in Blood by Automated count"],
  }),
  ...differential("immature-granulocytes", {
    de: "Unreife Granulozyten",
    long: [],
    en: ["Immature granulocytes", "IG"],
    count: [
      "53115-2",
      "Immature granulocytes [#/volume] in Blood by Automated count",
    ],
    share: [
      "71695-1",
      "Immature granulocytes/Leukocytes in Blood by Automated count",
    ],
  }),
  {
    key: "nucleated-erythrocytes",
    labels: [
      "Erythroblasten",
      "Erythroblasten absolut",
      "Erythroblasten relativ",
      "Normoblasten",
      "NRBC",
      "NRBC absolut",
      "NRBC %",
      "Kernhaltige Erythrozyten",
    ],
    byUnit: {
      "10*9/L": c(
        "771-6",
        "Nucleated erythrocytes [#/volume] in Blood by Automated count",
        "10*9/L",
      ),
      "%": c(
        "58413-6",
        "Nucleated erythrocytes/Leukocytes [Ratio] in Blood by Automated count",
        "%",
      ),
    },
  },
  // ---- Electrolytes and minerals beyond sodium and potassium ----
  {
    key: "calcium",
    labels: ["Calcium", "Kalzium", "Ca"],
    byUnit: {
      "mmol/L": c(
        "2000-8",
        "Calcium [Moles/volume] in Serum or Plasma",
        "mmol/L",
      ),
      "mg/dL": c(
        "17861-6",
        "Calcium [Mass/volume] in Serum or Plasma",
        "mg/dL",
      ),
    },
  },
  {
    key: "calcium-albumin-corrected",
    labels: [
      "Albumin-korrigiertes Calcium",
      "Albumin-korrigiertes Kalzium",
      "korrigiertes Calcium",
      "Calcium albuminkorrigiert",
    ],
    byUnit: {
      "mmol/L": c(
        "29265-6",
        "Calcium [Moles/volume] corrected for albumin in Serum or Plasma",
        "mmol/L",
      ),
      "mg/dL": c(
        "46099-8",
        "Calcium [Mass/volume] corrected for albumin in Serum or Plasma",
        "mg/dL",
      ),
    },
  },
  {
    key: "iron",
    labels: ["Eisen", "Iron", "Fe"],
    byUnit: {
      "umol/L": c(
        "14798-3",
        "Iron [Moles/volume] in Serum or Plasma",
        "umol/L",
      ),
      "ug/dL": c("2498-4", "Iron [Mass/volume] in Serum or Plasma", "ug/dL"),
    },
  },
  // ---- More enzymes and proteins the same sheet prints ----
  {
    key: "alkaline-phosphatase",
    labels: ["Alkalische Phosphatase", "Alk. Phosphatase", "AP", "ALP"],
    byUnit: {
      "U/L": c(
        "6768-6",
        "Alkaline phosphatase [Enzymatic activity/volume] in Serum or Plasma",
        "U/L",
      ),
      "ukat/L": c(
        "6768-6",
        "Alkaline phosphatase [Enzymatic activity/volume] in Serum or Plasma",
        "ukat/L",
      ),
    },
  },
  {
    key: "amylase",
    labels: ["Amylase", "Alpha-Amylase", "a-Amylase"],
    byUnit: {
      "U/L": c(
        "1798-8",
        "Amylase [Enzymatic activity/volume] in Serum or Plasma",
        "U/L",
      ),
      "ukat/L": c(
        "1798-8",
        "Amylase [Enzymatic activity/volume] in Serum or Plasma",
        "ukat/L",
      ),
    },
  },
  {
    key: "lipase",
    labels: ["Lipase"],
    byUnit: {
      "U/L": c(
        "3040-3",
        "Lipase [Enzymatic activity/volume] in Serum or Plasma",
        "U/L",
      ),
      "ukat/L": c(
        "3040-3",
        "Lipase [Enzymatic activity/volume] in Serum or Plasma",
        "ukat/L",
      ),
    },
  },
  {
    key: "immunoglobulin-g",
    labels: ["IgG", "Immunglobulin G", "Immunoglobulin G"],
    byUnit: {
      "g/L": c("2465-3", "IgG [Mass/volume] in Serum or Plasma", "g/L"),
      "mg/dL": c("2465-3", "IgG [Mass/volume] in Serum or Plasma", "mg/dL"),
    },
  },
  {
    key: "cholesterol-non-hdl",
    labels: [
      "Non-HDL-Cholesterin",
      "Nicht-HDL-Cholesterin",
      "Non HDL Cholesterin",
      "Non-HDL",
    ],
    byUnit: {
      "mmol/L": c(
        "70204-3",
        "Cholesterol non HDL [Moles/volume] in Serum or Plasma",
        "mmol/L",
      ),
      "mg/dL": c(
        "43396-1",
        "Cholesterol non HDL [Mass/volume] in Serum or Plasma",
        "mg/dL",
      ),
    },
  },
  {
    key: "glucose-mean-estimated",
    labels: [
      "abgeleitete mittlere Glucose",
      "abgeleitete mittlere Glukose",
      "mittlere Glucose",
      "eAG",
    ],
    byUnit: {
      "mmol/L": c(
        "53553-4",
        "Glucose mean value [Moles/volume] in Blood Estimated from glycated hemoglobin",
        "mmol/L",
      ),
      "mg/dL": c(
        "27353-2",
        "Glucose mean value [Mass/volume] in Blood Estimated from glycated hemoglobin",
        "mg/dL",
      ),
    },
  },
  // ---- Trace elements and vitamins a check-up panel adds ----
  {
    key: "magnesium",
    labels: ["Magnesium", "Mg"],
    byUnit: {
      "mmol/L": c(
        "2601-3",
        "Magnesium [Moles/volume] in Serum or Plasma",
        "mmol/L",
      ),
      "mg/dL": c(
        "19123-9",
        "Magnesium [Mass/volume] in Serum or Plasma",
        "mg/dL",
      ),
    },
  },
  {
    key: "copper",
    labels: ["Kupfer", "Copper"],
    byUnit: {
      "umol/L": c(
        "14665-4",
        "Copper [Moles/volume] in Serum or Plasma",
        "umol/L",
      ),
      "ug/dL": c("5631-7", "Copper [Mass/volume] in Serum or Plasma", "ug/dL"),
    },
  },
  {
    key: "zinc",
    labels: ["Zink", "Zinc"],
    byUnit: {
      "ug/dL": c("5763-8", "Zinc [Mass/volume] in Serum or Plasma", "ug/dL"),
      "ug/L": c("5763-8", "Zinc [Mass/volume] in Serum or Plasma", "ug/L"),
    },
  },
  {
    key: "folate",
    labels: ["Folsäure", "Folat", "Folate"],
    byUnit: {
      "ng/mL": c("2284-8", "Folate [Mass/volume] in Serum or Plasma", "ng/mL"),
      "ug/L": c("2284-8", "Folate [Mass/volume] in Serum or Plasma", "ug/L"),
    },
  },
  {
    key: "reticulocyte-haemoglobin",
    labels: ["Ret-Hb", "RET-He", "Retikulozyten-Hämoglobin", "CHr", "Ret He"],
    byUnit: {
      pg: c(
        "71694-4",
        "Hemoglobin [Entitic mass] in Reticulocytes by Automated count",
        "pg",
      ),
      fmol: c(
        "71694-4",
        "Hemoglobin [Entitic mass] in Reticulocytes by Automated count",
        "fmol",
      ),
    },
  },
  // ---- Body measurements, entered rather than assayed ----
  //
  // Coded like anything else, so they join the timeline and the OMOP export.
  // Their provenance is `self-tracked`, which is already `preliminary`: a tape
  // measure is not a laboratory.
  {
    key: "body-height",
    labels: ["Körpergröße", "Koerpergroesse", "Größe", "Body height", "Height"],
    byUnit: {
      cm: c("8302-2", "Body height", "cm"),
    },
  },
  {
    key: "body-weight",
    labels: ["Körpergewicht", "Gewicht", "Body weight", "Weight"],
    byUnit: {
      kg: c("29463-7", "Body weight", "kg"),
    },
  },
  {
    key: "bmi",
    labels: ["BMI", "Body-Mass-Index", "Body mass index", "Körpermasseindex"],
    byUnit: {
      "kg/m2": c("39156-5", "Body mass index (BMI) [Ratio]", "kg/m2"),
    },
  },
  {
    key: "waist-circumference",
    labels: ["Taillenumfang", "Bauchumfang", "Waist circumference", "Waist"],
    byUnit: {
      cm: c("8280-0", "Waist Circumference at umbilicus by Tape measure", "cm"),
    },
  },
  {
    key: "visceral-fat-area",
    labels: [
      "Viszerales Fett",
      "Viszerale Fettfläche",
      "Visceral fat",
      "Visceral fat area",
      "VFA",
    ],
    byUnit: {
      // An **area**, as a body-composition device or a scan reports it. A
      // consumer scale's 1-to-59 "visceral fat rating" is a different quantity
      // with no LOINC code of its own, and is not this.
      cm2: c("73707-2", "Visceral fat [Area] Measured", "cm2"),
    },
  },
  // ---- Body composition, as a bioimpedance scale reports it ----
  {
    key: "body-fat",
    labels: [
      "Körperfett",
      "Körperfettmasse",
      "Körperfettanteil",
      "Body fat",
      "Fat mass",
      "KFA",
    ],
    byUnit: {
      // The unit selects the code, as everywhere else: the same word on a
      // scale's screen means a mass on one card and a proportion on the next.
      kg: c("73708-0", "Body fat [Mass] Calculated", "kg"),
      "%": c("41982-0", "Percentage of body fat Measured", "%"),
    },
  },
  {
    key: "muscle-mass",
    labels: [
      "Muskelmasse",
      "Skelettmuskelmasse",
      "Muscle mass",
      "Skeletal muscle mass",
    ],
    byUnit: {
      kg: c("73964-9", "Body muscle mass Calculated", "kg"),
    },
  },
  {
    key: "lean-body-mass",
    labels: ["Magermasse", "Fettfreie Masse", "Lean body mass", "FFM"],
    byUnit: {
      kg: c("88334-8", "Lean body weight Calculated", "kg"),
    },
  },
  {
    key: "body-water",
    labels: ["Körperwasser", "Gesamtkörperwasser", "Body water", "TBW"],
    byUnit: {
      kg: c("101683-1", "Body water mass", "kg"),
      "%": c("101684-9", "Percentage of body water", "%"),
    },
  },
  // ---- Coagulation ----
  {
    key: "quick",
    labels: [
      "Quick",
      "Quick (TPZ)",
      "Quick-Wert",
      "TPZ",
      "Thromboplastinzeit",
      "Prothrombinzeit",
    ],
    byUnit: {
      "%": c("5894-1", "Prothrombin time (PT) actual/Normal", "%"),
    },
  },
  {
    key: "fibrinogen",
    labels: ["Fibrinogen"],
    byUnit: {
      "g/L": c(
        "3255-7",
        "Fibrinogen [Mass/volume] in Platelet poor plasma by Coagulation assay",
        "g/L",
      ),
      "mg/dL": c(
        "3255-7",
        "Fibrinogen [Mass/volume] in Platelet poor plasma by Coagulation assay",
        "mg/dL",
      ),
    },
  },
  {
    key: "aptt",
    labels: ["aPTT", "PTT", "APTT"],
    byUnit: {
      s: c("3173-2", "aPTT in Blood by Coagulation assay", "s"),
    },
  },
  // ---- Routine chemistry the same sheets print ----
  {
    key: "urea",
    labels: ["Harnstoff", "Urea"],
    byUnit: {
      "mg/dL": c("3091-6", "Urea [Mass/volume] in Serum or Plasma", "mg/dL"),
      "mmol/L": c(
        "22664-7",
        "Urea [Moles/volume] in Serum or Plasma",
        "mmol/L",
      ),
    },
  },
  {
    key: "transferrin",
    labels: ["Transferrin"],
    byUnit: {
      "g/L": c("3034-6", "Transferrin [Mass/volume] in Serum or Plasma", "g/L"),
      "mg/dL": c(
        "3034-6",
        "Transferrin [Mass/volume] in Serum or Plasma",
        "mg/dL",
      ),
    },
  },
  {
    key: "transferrin-saturation",
    labels: [
      "Transferrin-Sättigung",
      "Transferrinsättigung",
      "Transferrin-Saettigung",
      "Eisensättigung",
      "TSAT",
    ],
    byUnit: {
      "%": c(
        "2502-3",
        "Iron saturation [Mass Fraction] in Serum or Plasma",
        "%",
      ),
    },
  },
  {
    key: "cortisol",
    labels: ["Kortisol", "Cortisol"],
    byUnit: {
      "nmol/L": c(
        "14675-3",
        "Cortisol [Moles/volume] in Serum or Plasma",
        "nmol/L",
      ),
      "ug/dL": c(
        "2143-6",
        "Cortisol [Mass/volume] in Serum or Plasma",
        "ug/dL",
      ),
    },
  },
  {
    key: "albumin",
    labels: ["Albumin"],
    byUnit: {
      "g/dL": c("1751-7", "Albumin [Mass/volume] in Serum or Plasma", "g/dL"),
      "g/L": c("1751-7", "Albumin [Mass/volume] in Serum or Plasma", "g/L"),
    },
  },
  {
    key: "bilirubin-total",
    labels: [
      "Bilirubin",
      "Bilirubin gesamt",
      "Gesamtbilirubin",
      "Bilirubin, gesamt",
    ],
    byUnit: {
      "mg/dL": c(
        "1975-2",
        "Bilirubin.total [Mass/volume] in Serum or Plasma",
        "mg/dL",
      ),
      "umol/L": c(
        "14631-6",
        "Bilirubin.total [Moles/volume] in Serum or Plasma",
        "umol/L",
      ),
    },
  },
  {
    key: "protein-total",
    labels: [
      "Gesamteiweiß",
      "Gesamtprotein",
      "Eiweiß gesamt",
      "Protein gesamt",
    ],
    byUnit: {
      "g/dL": c("2885-2", "Protein [Mass/volume] in Serum or Plasma", "g/dL"),
      "g/L": c("2885-2", "Protein [Mass/volume] in Serum or Plasma", "g/L"),
    },
  },
  {
    key: "ldh",
    labels: ["LDH", "Laktatdehydrogenase", "Lactatdehydrogenase"],
    byUnit: {
      "ukat/L": c(
        "2532-0",
        "Lactate dehydrogenase [Enzymatic activity/volume] in Serum or Plasma",
        "ukat/L",
      ),
      "U/L": c(
        "2532-0",
        "Lactate dehydrogenase [Enzymatic activity/volume] in Serum or Plasma",
        "U/L",
      ),
    },
  },
  {
    key: "reticulocytes",
    labels: [
      "Retikulozyten",
      "Retikulozyten absolut",
      "Retikulozyten relativ",
      "Reticulocytes",
      "Retis",
      "Reti",
      "Reti gemessen",
      "Reti% gemessen",
      "RET",
    ],
    byUnit: {
      "%": c(
        "17849-1",
        "Reticulocytes/Erythrocytes in Blood by Automated count",
        "%",
      ),
      "[ppth]": c(
        "17849-1",
        "Reticulocytes/Erythrocytes in Blood by Automated count",
        "[ppth]",
      ),
      "10*9/L": c(
        "60474-4",
        "Reticulocytes [#/volume] in Blood by Automated count",
        "10*9/L",
      ),
    },
  },
];

/**
 * Builds the strict and the loose label index.
 *
 * Exported for the test that proves the collision check fires: a loose key
 * shared by two different analytes would let the second lookup pick the wrong
 * one, so it is refused at load time rather than discovered on a report.
 */
export function buildIndexes(definitions: readonly AnalyteDefinition[]): {
  strict: Map<string, AnalyteDefinition>;
  loose: Map<string, AnalyteDefinition>;
} {
  const strict = new Map<string, AnalyteDefinition>();
  const loose = new Map<string, AnalyteDefinition>();
  for (const def of definitions) {
    for (const label of def.labels) {
      strict.set(normaliseLabel(label), def);
      const key = looseLabelKey(label);
      const other = loose.get(key);
      if (other && other.key !== def.key) {
        throw new Error(
          `analyte dictionary: "${label}" (${def.key}) and an entry of ` +
            `${other.key} collapse to the same loose key "${key}"`,
        );
      }
      loose.set(key, def);
    }
  }
  return { strict, loose };
}

const { strict: BY_LABEL, loose: BY_LOOSE_LABEL } = buildIndexes(DEFINITIONS);

/** Every analyte key the dictionary knows, for tests and the README table. */
export const ANALYTE_KEYS: readonly string[] = DEFINITIONS.map((d) => d.key);

/** The UCUM units each analyte is defined in, for validating other tables. */
export const ANALYTE_UNITS: Readonly<Record<string, readonly string[]>> =
  Object.fromEntries(DEFINITIONS.map((d) => [d.key, Object.keys(d.byUnit)]));

/** Every printed label the dictionary knows, for the Swift generator. */
export const ANALYTE_LABELS: readonly string[] = [
  ...new Set(DEFINITIONS.flatMap((d) => d.labels)),
];

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
  const def =
    BY_LABEL.get(normaliseLabel(label)) ??
    BY_LOOSE_LABEL.get(looseLabelKey(label));
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

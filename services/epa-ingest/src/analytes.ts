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
  /**
   * What the measurement **is**, in one or two sentences.
   *
   * A definition, never an interpretation. "MCH is the average mass of
   * haemoglobin in one red cell" describes the test; "a high MCH means ..."
   * would be a reading of the person's own result, which is the IVDR line §5
   * of issue #186 draws and which the app does not cross. A personal
   * explanation is a separate, consent-gated feature that asks a model.
   */
  description?: string;
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
 * A quantity the dictionary knows and LOINC does not code.
 *
 * Rare and meant to stay rare: the reason is required and is carried all the
 * way into the export, so a reader of the data sees why a row has no code
 * rather than assuming the app failed to look one up.
 */
const uncoded = (
  display: string,
  ucum: string,
  uncodedReason: string,
): AnalyteCoding => ({
  loincNumber: null,
  display,
  ucum,
  uncodedReason,
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
    description: string;
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
      description: spec.description,
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
    description:
      "All cholesterol carried in the blood, in every particle type. A screening figure; LDL and apoB carry the risk information.",
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
    description:
      "Cholesterol in low-density lipoproteins, the particles that deposit it in artery walls. The primary target in lipid guidelines.",
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
    description:
      "Cholesterol in high-density lipoproteins, which return it to the liver. A risk marker rather than a treatment target.",
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
    description:
      "The main fat carried in blood, from food and made by the liver. Rises after eating, so it is measured fasting.",
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
    description:
      "An LDL-like particle with an extra protein. Largely inherited and barely changed by diet, so it is measured once rather than tracked.",
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
    description:
      "One molecule sits on each atherogenic particle, so this counts the particles rather than the cholesterol inside them.",
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
    description: "The main protein of HDL particles.",
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
    description:
      "C-reactive protein measured by a sensitive method, which resolves the low range where it reflects vascular inflammation rather than infection.",
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
    description:
      "A protein the liver makes during inflammation. Rises within hours of an infection or injury.",
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
    description:
      "A hormone the heart releases when its walls are stretched. Used to ask whether breathlessness is coming from the heart.",
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
    description:
      "An amino acid cleared with the help of folate and vitamins B6 and B12. Rises when they are short or the kidney is impaired.",
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
    description:
      "The share of haemoglobin with glucose bound to it, which reflects the average blood glucose of the last two to three months.",
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
    description:
      "Blood sugar at the moment of the draw. Only interpretable fasting, since it rises after any meal.",
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
    description:
      "A waste product of muscle, cleared by the kidney. Depends on muscle mass, which is why eGFR is calculated from it.",
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
    description:
      "The kidney's filtration rate, estimated from creatinine with age and sex. An estimate, not a measurement.",
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
    description:
      "The end product of purine breakdown. Crystallises in joints above its solubility, which is what gout is.",
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
    description:
      "A liver enzyme released when liver cells are damaged. The more liver-specific of the two transaminases.",
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
    description:
      "An enzyme of liver, heart and muscle. Rises with liver damage and also after exertion or muscle injury.",
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
    description:
      "A bile-duct enzyme, sensitive to alcohol and to drugs the liver processes.",
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
    description:
      "The pituitary's signal to the thyroid. It moves opposite to thyroid hormone, so it is the first test of thyroid function.",
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
    description:
      "The body's iron store protein. Also rises with inflammation, which can mask a shortage.",
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
    description:
      "A vitamin needed for blood formation and for nerves, stored in the liver for years.",
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
    description:
      "The storage form of vitamin D, which reflects supply from sun and diet over weeks.",
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
    description:
      "The main salt of the fluid outside cells. Tracks water balance more than salt intake.",
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
    description:
      "The main salt inside cells. The narrow range matters because the heart's rhythm depends on it.",
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
    description:
      "The oxygen-carrying protein in red cells. The measurement that defines anaemia.",
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
    description: "The cell fragments that form the first plug in a wound.",
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
    description:
      "The number of white cells per volume, the immune system's cells. Rises with infection and inflammation.",
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
    description: "The number of red cells per volume of blood.",
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
    description: "The share of blood volume made up of red cells.",
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
    description:
      "The average volume of one red cell. Small and large cells point to different causes of anaemia, iron and B12 among them.",
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
    description:
      "The average mass of haemoglobin in one red cell. Read with MCV to tell one kind of anaemia from another.",
    labels: ["MCH", "HbE"],
    byUnit: {
      fmol: c("59468-9", "MCH [Entitic substance]", "fmol"),
      pg: c("785-6", "MCH [Entitic mass] by Automated count", "pg"),
    },
  },
  {
    key: "mchc",
    description:
      "The haemoglobin concentration inside the red cells themselves, as opposed to in the blood.",
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
    description:
      "How much the red cells vary in size. A rise often precedes a change in the other red-cell indices.",
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
    description:
      "The average volume of one platelet. Young platelets are larger.",
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
    description:
      "The white cells that answer bacterial infection first and make up most of the count.",
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
    description:
      "The white cells of targeted immunity: T cells, B cells and natural killer cells.",
    de: "Lymphozyten",
    long: [],
    en: ["Lymphocytes", "Lympho", "LYMPH"],
    count: ["731-0", "Lymphocytes [#/volume] in Blood by Automated count"],
    share: ["736-9", "Lymphocytes/Leukocytes in Blood by Automated count"],
  }),
  ...differential("monocytes", {
    description:
      "White cells that become macrophages in tissue and clear debris.",
    de: "Monozyten",
    long: [],
    en: ["Monocytes", "Mono", "MONO"],
    count: ["742-7", "Monocytes [#/volume] in Blood by Automated count"],
    share: ["5905-5", "Monocytes/Leukocytes in Blood by Automated count"],
  }),
  ...differential("eosinophils", {
    description: "White cells involved in allergy and in parasitic infection.",
    de: "Eosinophile",
    long: ["Eosinophile Granulozyten"],
    en: ["Eosinophils", "Eos", "EOS"],
    count: ["711-2", "Eosinophils [#/volume] in Blood by Automated count"],
    share: ["713-8", "Eosinophils/Leukocytes in Blood by Automated count"],
  }),
  ...differential("basophils", {
    description:
      "The rarest white cells, carrying histamine and involved in allergic reactions.",
    de: "Basophile",
    long: ["Basophile Granulozyten"],
    en: ["Basophils", "Baso", "BASO"],
    count: ["704-7", "Basophils [#/volume] in Blood by Automated count"],
    share: ["706-2", "Basophils/Leukocytes in Blood by Automated count"],
  }),
  ...differential("immature-granulocytes", {
    description:
      "Young white cells released early from the marrow, which happens when demand is high.",
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
    description:
      "Red cells released with their nucleus still in place, which mature ones do not have.",
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
    description:
      "The mineral of bone, also needed for nerve and muscle signalling. Partly bound to albumin, which is why a corrected value exists.",
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
    description:
      "Calcium adjusted for the albumin it is bound to, which is the figure to read when albumin itself is outside its own range.",
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
    description:
      "Iron circulating in blood at that moment. Swings through the day and with meals, so it says little alone.",
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
    description:
      "An enzyme of bile ducts and bone. A raised value asks which of the two, which other tests answer.",
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
    description: "A digestive enzyme from pancreas and salivary glands.",
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
    description:
      "A fat-splitting enzyme from the pancreas, more specific to it than amylase.",
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
    description:
      "The most abundant antibody class, the long-term memory of the immune system.",
    labels: ["IgG", "Immunglobulin G", "Immunoglobulin G"],
    byUnit: {
      "g/L": c("2465-3", "IgG [Mass/volume] in Serum or Plasma", "g/L"),
      "mg/dL": c("2465-3", "IgG [Mass/volume] in Serum or Plasma", "mg/dL"),
    },
  },
  {
    key: "cholesterol-non-hdl",
    description:
      "Total cholesterol minus HDL: everything carried in particles that can deposit in artery walls. A secondary target.",
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
    description:
      "An average glucose calculated from HbA1c, for comparison with meter readings. Not measured directly.",
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
    description:
      "A mineral needed by hundreds of enzymes. Most of it is inside cells, so blood levels understate a shortage.",
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
    description:
      "A trace element needed for iron handling and connective tissue.",
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
    description:
      "A trace element needed for immune function and wound healing.",
    labels: ["Zink", "Zinc"],
    byUnit: {
      "ug/dL": c("5763-8", "Zinc [Mass/volume] in Serum or Plasma", "ug/dL"),
      "ug/L": c("5763-8", "Zinc [Mass/volume] in Serum or Plasma", "ug/L"),
    },
  },
  {
    key: "folate",
    description:
      "A B vitamin needed for cell division and blood formation, with small stores.",
    labels: ["Folsäure", "Folat", "Folate"],
    byUnit: {
      "ng/mL": c("2284-8", "Folate [Mass/volume] in Serum or Plasma", "ng/mL"),
      "ug/L": c("2284-8", "Folate [Mass/volume] in Serum or Plasma", "ug/L"),
    },
  },
  {
    key: "reticulocyte-haemoglobin",
    description:
      "The haemoglobin in the newest red cells, which reflects the iron available to the marrow in recent days.",
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
  // ---- Amino acids, as a home aminogram prints them ----
  //
  // Every code is the serum-or-plasma, moles-per-volume term, checked one by
  // one against the NLM clinical tables API. A home test names them in
  // German; a laboratory sometimes uses the three-letter abbreviation, and
  // two of them have a second German name that is the same substance:
  // Glutaminsäure is Glutamat and Asparaginsäure is Aspartat.
  {
    key: "isoleucine",
    description:
      "One of the three branched-chain essential amino acids. Metabolised in muscle rather than in the liver.",
    labels: ["Isoleucin", "Ile"],
    byUnit: {
      "umol/L": c(
        "20648-2",
        "Isoleucine [Moles/volume] in Serum or Plasma",
        "umol/L",
      ),
    },
  },
  {
    key: "leucine",
    description:
      "The branched-chain amino acid with the strongest signal for muscle protein synthesis. Rises briefly after a protein-rich meal.",
    labels: ["Leucin", "Leu"],
    byUnit: {
      "umol/L": c(
        "20649-0",
        "Leucine [Moles/volume] in Serum or Plasma",
        "umol/L",
      ),
    },
  },
  {
    key: "lysine",
    description:
      "Essential for making collagen and carnitine. The body cannot make it.",
    labels: ["Lysin", "Lys"],
    byUnit: {
      "umol/L": c(
        "20650-8",
        "Lysine [Moles/volume] in Serum or Plasma",
        "umol/L",
      ),
    },
  },
  {
    key: "methionine",
    description:
      "The sulphur-bearing essential amino acid that homocysteine is made from and returns to.",
    labels: ["Methionin", "Met"],
    byUnit: {
      "umol/L": c(
        "20651-6",
        "Methionine [Moles/volume] in Serum or Plasma",
        "umol/L",
      ),
    },
  },
  {
    key: "phenylalanine",
    description:
      "The precursor of tyrosine and so of the catecholamines. In phenylketonuria it cannot be broken down.",
    labels: ["Phenylalanin", "Phe"],
    byUnit: {
      "umol/L": c(
        "14875-9",
        "Phenylalanine [Moles/volume] in Serum or Plasma",
        "umol/L",
      ),
    },
  },
  {
    key: "threonine",
    description:
      "Essential, a building block of connective tissue and of immunoglobulins.",
    labels: ["Threonin", "Thr"],
    byUnit: {
      "umol/L": c(
        "20658-1",
        "Threonine [Moles/volume] in Serum or Plasma",
        "umol/L",
      ),
    },
  },
  {
    key: "tryptophan",
    description:
      "The starting point for serotonin and melatonin, and by another route for niacin.",
    labels: ["Tryptophan", "Trp"],
    byUnit: {
      "umol/L": c(
        "20659-9",
        "Tryptophan [Moles/volume] in Serum or Plasma",
        "umol/L",
      ),
    },
  },
  {
    key: "valine",
    description: "The third branched-chain essential amino acid.",
    labels: ["Valin", "Val"],
    byUnit: {
      "umol/L": c(
        "20661-5",
        "Valine [Moles/volume] in Serum or Plasma",
        "umol/L",
      ),
    },
  },
  {
    key: "alanine",
    description:
      "Carries nitrogen from muscle to the liver, where it becomes glucose.",
    labels: ["Alanin", "Ala"],
    byUnit: {
      "umol/L": c(
        "20636-7",
        "Alanine [Moles/volume] in Serum or Plasma",
        "umol/L",
      ),
    },
  },
  {
    key: "arginine",
    description:
      "The amino acid nitric oxide is made from, and a step of the urea cycle.",
    labels: ["Arginin", "Arg"],
    byUnit: {
      "umol/L": c(
        "20637-5",
        "Arginine [Moles/volume] in Serum or Plasma",
        "umol/L",
      ),
    },
  },
  {
    key: "asparagine",
    description: "Not essential, involved in moving nitrogen between tissues.",
    labels: ["Asparagin", "Asn"],
    byUnit: {
      "umol/L": c(
        "20638-3",
        "Asparagine [Moles/volume] in Serum or Plasma",
        "umol/L",
      ),
    },
  },
  {
    key: "aspartate",
    description:
      "Not essential, part of the urea cycle and of making nucleotides.",
    labels: ["Aspartat", "Asparaginsäure", "Asp"],
    byUnit: {
      "umol/L": c(
        "20639-1",
        "Aspartate [Moles/volume] in Serum or Plasma",
        "umol/L",
      ),
    },
  },
  {
    key: "citrulline",
    description: "A step of the urea cycle, also produced by the gut.",
    labels: ["Citrullin", "Cit"],
    byUnit: {
      "umol/L": c(
        "20640-9",
        "Citrulline [Moles/volume] in Serum or Plasma",
        "umol/L",
      ),
    },
  },
  {
    key: "cysteine",
    description:
      "The sulphur-bearing amino acid that supplies the rate-limiting building block of glutathione.",
    labels: ["Cystein", "Cys"],
    byUnit: {
      "umol/L": c(
        "20641-7",
        "Cysteine [Moles/volume] in Serum or Plasma",
        "umol/L",
      ),
    },
  },
  {
    key: "glutamate",
    description:
      "The brain's main excitatory messenger and a junction of amino acid metabolism.",
    labels: ["Glutamat", "Glutaminsäure", "Glu"],
    byUnit: {
      "umol/L": c(
        "20642-5",
        "Glutamate [Moles/volume] in Serum or Plasma",
        "umol/L",
      ),
    },
  },
  {
    key: "glutamine",
    description:
      "The most abundant free amino acid in blood. Fuel for the gut lining and for immune cells.",
    labels: ["Glutamin", "Gln"],
    byUnit: {
      "umol/L": c(
        "20643-3",
        "Glutamine [Moles/volume] in Serum or Plasma",
        "umol/L",
      ),
    },
  },
  {
    key: "glycine",
    description:
      "The smallest amino acid, a third of collagen, and a building block of glutathione.",
    labels: ["Glycin", "Glyzin", "Gly"],
    byUnit: {
      "umol/L": c(
        "20644-1",
        "Glycine [Moles/volume] in Serum or Plasma",
        "umol/L",
      ),
    },
  },
  {
    key: "histidine",
    description:
      "The precursor of histamine and carnosine. Essential in children.",
    labels: ["Histidin", "His"],
    byUnit: {
      "umol/L": c(
        "20645-8",
        "Histidine [Moles/volume] in Serum or Plasma",
        "umol/L",
      ),
    },
  },
  {
    key: "ornithine",
    description: "A step of the urea cycle, not used to build protein.",
    labels: ["Ornithin", "Orn"],
    byUnit: {
      "umol/L": c(
        "20652-4",
        "Ornithine [Moles/volume] in Serum or Plasma",
        "umol/L",
      ),
    },
  },
  {
    key: "proline",
    description: "After glycine, the most common building block of collagen.",
    labels: ["Prolin", "Pro"],
    byUnit: {
      "umol/L": c(
        "20655-7",
        "Proline [Moles/volume] in Serum or Plasma",
        "umol/L",
      ),
    },
  },
  {
    key: "serine",
    description:
      "Not essential, a building block of cell membranes and the precursor of glycine.",
    labels: ["Serin", "Ser"],
    byUnit: {
      "umol/L": c(
        "20656-5",
        "Serine [Moles/volume] in Serum or Plasma",
        "umol/L",
      ),
    },
  },
  {
    key: "taurine",
    description:
      "Not strictly an amino acid but an aminosulphonic acid. Plentiful in the heart and the retina.",
    labels: ["Taurin", "Tau"],
    byUnit: {
      "umol/L": c(
        "20657-3",
        "Taurine [Moles/volume] in Serum or Plasma",
        "umol/L",
      ),
    },
  },
  {
    key: "tyrosine",
    description:
      "Made from phenylalanine, the precursor of dopamine, adrenaline and the thyroid hormones.",
    labels: ["Tyrosin", "Tyr"],
    byUnit: {
      "umol/L": c(
        "20660-7",
        "Tyrosine [Moles/volume] in Serum or Plasma",
        "umol/L",
      ),
    },
  },
  {
    key: "body-height",
    description: "Standing height, entered by you.",
    labels: ["Körpergröße", "Koerpergroesse", "Größe", "Body height", "Height"],
    byUnit: {
      cm: c("8302-2", "Body height", "cm"),
    },
  },
  {
    key: "body-weight",
    description: "Body weight, entered by you or read from a scale.",
    labels: ["Körpergewicht", "Gewicht", "Body weight", "Weight"],
    byUnit: {
      kg: c("29463-7", "Body weight", "kg"),
    },
  },
  {
    key: "bmi",
    description:
      "Weight divided by height squared. A population measure; it says nothing about what the weight is made of.",
    labels: ["BMI", "Body-Mass-Index", "Body mass index", "Körpermasseindex"],
    byUnit: {
      "kg/m2": c("39156-5", "Body mass index (BMI) [Ratio]", "kg/m2"),
    },
  },
  {
    key: "waist-circumference",
    description:
      "Abdominal girth, which tracks the fat around the organs better than weight does.",
    labels: ["Taillenumfang", "Bauchumfang", "Waist circumference", "Waist"],
    byUnit: {
      cm: c("8280-0", "Waist Circumference at umbilicus by Tape measure", "cm"),
    },
  },
  {
    key: "visceral-fat",
    description:
      "Fat stored around the organs, as a body-composition device estimates it. Some devices report an area and others a mass, which are different quantities and are not convertible into one another.",
    labels: [
      "Viszerales Fett",
      "Viszeralfett",
      "Viszeralfettfläche",
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
      // The same label, in kilograms, is a **mass**, which many bioimpedance
      // scales print instead. LOINC codes the area and not the mass, and the
      // two are not convertible into one another, so this one carries no code.
      // The label alone must never decide: it is the `kg` that sends a reading
      // here rather than to the area code above.
      kg: uncoded(
        "Visceral fat mass estimated by bioimpedance",
        "kg",
        "LOINC codes visceral fat as an area (73707-2) and has no term for the mass a bioimpedance scale reports.",
      ),
    },
  },
  // ---- Body composition, as a bioimpedance scale reports it ----
  {
    key: "ecw-tbw",
    description:
      "The share of total body water that lies outside the cells, as a bioimpedance device estimates it.",
    labels: [
      "ECW/TBW",
      "ECW/TBW-Verhältnis",
      "ECW-TBW",
      "Extrazellulärwasser-Anteil",
      "Extracellular water ratio",
    ],
    byUnit: {
      // LOINC codes body water as a mass and a percentage, and has no term
      // for the extracellular share of it that a bioimpedance device reports.
      // It read correctly off a gym scale and was filed as an unknown analyte,
      // which is a worse answer than carrying it with its unit and no code.
      "%": uncoded(
        "Extracellular to total body water ratio by bioimpedance",
        "%",
        "LOINC has no term for the extracellular share of total body water that a bioimpedance device reports.",
      ),
    },
  },
  {
    key: "body-fat",
    description:
      "Fat mass, or its share of body weight, as a bioimpedance device estimates it.",
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
    description: "Muscle mass, as a bioimpedance device estimates it.",
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
    description: "Body weight minus fat: muscle, bone, organs and water.",
    labels: ["Magermasse", "Fettfreie Masse", "Lean body mass", "FFM"],
    byUnit: {
      kg: c("88334-8", "Lean body weight Calculated", "kg"),
    },
  },
  {
    key: "body-water",
    description: "Total body water, or its share of body weight.",
    labels: ["Körperwasser", "Gesamtkörperwasser", "Body water", "TBW"],
    byUnit: {
      kg: c("101683-1", "Body water mass", "kg"),
      "%": c("101684-9", "Percentage of body water", "%"),
    },
  },
  // ---- Coagulation ----
  {
    key: "quick",
    description:
      "How fast blood clots by the tissue-factor pathway, as a percentage of normal. Falls with vitamin K antagonists and liver disease.",
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
    description:
      "The protein that forms the mesh of a clot. Also an acute-phase protein, so it rises with inflammation.",
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
    description:
      "How fast blood clots by the contact pathway. The test heparin is monitored by.",
    labels: ["aPTT", "PTT", "APTT"],
    byUnit: {
      s: c("3173-2", "aPTT in Blood by Coagulation assay", "s"),
    },
  },
  // ---- Routine chemistry the same sheets print ----
  {
    key: "urea",
    description:
      "A waste product of protein breakdown, cleared by the kidney. Also rises with dehydration and a high protein intake.",
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
    description: "The protein that carries iron in the blood.",
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
    description:
      "The share of transferrin actually carrying iron. Read with ferritin to tell store from supply.",
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
    description:
      "The adrenal stress hormone. Follows a daily rhythm, so the time of the draw matters as much as the value.",
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
    description:
      "The most abundant protein in blood, made by the liver. Carries hormones and drugs and holds fluid in the vessels.",
    labels: ["Albumin"],
    byUnit: {
      "g/dL": c("1751-7", "Albumin [Mass/volume] in Serum or Plasma", "g/dL"),
      "g/L": c("1751-7", "Albumin [Mass/volume] in Serum or Plasma", "g/L"),
    },
  },
  {
    key: "bilirubin-total",
    description:
      "The pigment from broken-down haemoglobin, processed by the liver. What makes jaundice visible.",
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
    description:
      "All protein in serum: mostly albumin plus the immunoglobulins.",
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
    description:
      "An enzyme in nearly every cell, released when any of them breaks. Sensitive, and not specific to one organ.",
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
    description:
      "Newly released red cells. They say how fast the marrow is replacing them.",
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

/** What each analyte measures, for the reader and the Swift generator. */
export const ANALYTE_DESCRIPTIONS: Readonly<Record<string, string>> =
  Object.fromEntries(
    DEFINITIONS.filter((d) => d.description).map((d) => [
      d.key,
      d.description!,
    ]),
  );

/**
 * The same definitions in German.
 *
 * Kept as one block rather than beside each definition, so that a German
 * reader can review the whole register at once: these are definitions of the
 * measurement, never readings of a person's value, and that is easier to hold
 * to when they are read together. The generator refuses to emit unless the
 * keys match `ANALYTE_DESCRIPTIONS` exactly, so a new analyte cannot ship
 * with an English-only explanation.
 */
export const ANALYTE_DESCRIPTIONS_DE: Readonly<Record<string, string>> = {
  "cholesterol-total":
    "Das gesamte im Blut transportierte Cholesterin, über alle Partikelarten hinweg. Ein Screening-Wert; die Risikoinformation tragen LDL und ApoB.",
  "cholesterol-ldl":
    "Cholesterin in Lipoproteinen niedriger Dichte, den Partikeln, die es in der Gefäßwand ablagern. Die wichtigste Zielgröße der Lipid-Leitlinien.",
  "cholesterol-hdl":
    "Cholesterin in Lipoproteinen hoher Dichte, die es zur Leber zurückbringen. Ein Risikomarker, keine Behandlungszielgröße.",
  triglycerides:
    "Das wichtigste Blutfett, aus der Nahrung und von der Leber gebildet. Steigt nach dem Essen, deshalb wird nüchtern gemessen.",
  "lipoprotein-a":
    "Ein LDL-ähnliches Partikel mit einem zusätzlichen Protein. Weitgehend vererbt und durch Ernährung kaum veränderbar, deshalb einmal gemessen statt verfolgt.",
  "apolipoprotein-b":
    "Auf jedem atherogenen Partikel sitzt ein Molekül davon, gezählt werden also die Partikel und nicht das Cholesterin darin.",
  "apolipoprotein-a1": "Das Hauptprotein der HDL-Partikel.",
  "crp-hs":
    "C-reaktives Protein, mit einem empfindlichen Verfahren gemessen, das den niedrigen Bereich auflöst, in dem es eher Gefäßentzündung als Infektion abbildet.",
  crp: "Ein Protein, das die Leber bei Entzündung bildet. Steigt innerhalb von Stunden nach einer Infektion oder Verletzung.",
  "nt-probnp":
    "Ein Hormon, das das Herz freisetzt, wenn seine Wände gedehnt werden. Dient der Frage, ob Luftnot vom Herzen kommt.",
  homocysteine:
    "Eine Aminosäure, die mit Hilfe von Folsäure und den Vitaminen B6 und B12 abgebaut wird. Steigt, wenn diese knapp sind oder die Niere eingeschränkt ist.",
  hba1c:
    "Der Anteil des Hämoglobins, an den Glukose gebunden ist; er bildet den durchschnittlichen Blutzucker der letzten zwei bis drei Monate ab.",
  glucose:
    "Der Blutzucker im Moment der Entnahme. Nur nüchtern beurteilbar, da er nach jeder Mahlzeit steigt.",
  creatinine:
    "Ein Abbauprodukt der Muskulatur, das die Niere ausscheidet. Hängt von der Muskelmasse ab, weshalb daraus die eGFR berechnet wird.",
  egfr: "Die Filtrationsleistung der Niere, aus dem Kreatinin mit Alter und Geschlecht geschätzt. Eine Schätzung, keine Messung.",
  urate:
    "Das Endprodukt des Purinabbaus. Kristallisiert oberhalb seiner Löslichkeit in Gelenken, und genau das ist Gicht.",
  alt: "Ein Leberenzym, das bei Schädigung von Leberzellen frei wird. Die leberspezifischere der beiden Transaminasen.",
  ast: "Ein Enzym aus Leber, Herz und Muskulatur. Steigt bei Leberschädigung und auch nach Anstrengung oder Muskelverletzung.",
  ggt: "Ein Enzym der Gallenwege, empfindlich gegenüber Alkohol und gegenüber Arzneimitteln, die die Leber verstoffwechselt.",
  tsh: "Das Signal der Hirnanhangsdrüse an die Schilddrüse. Es bewegt sich gegenläufig zum Schilddrüsenhormon und ist daher der erste Test der Schilddrüsenfunktion.",
  ferritin:
    "Das Eisenspeicherprotein des Körpers. Steigt auch bei Entzündung, was einen Mangel verdecken kann.",
  "vitamin-b12":
    "Ein Vitamin für Blutbildung und Nerven, das die Leber über Jahre speichert.",
  "vitamin-d":
    "Die Speicherform des Vitamin D; sie bildet die Versorgung aus Sonne und Nahrung über Wochen ab.",
  sodium:
    "Das wichtigste Salz der Flüssigkeit außerhalb der Zellen. Bildet eher den Wasserhaushalt ab als die Salzaufnahme.",
  potassium:
    "Das wichtigste Salz im Inneren der Zellen. Der enge Bereich ist wichtig, weil der Herzrhythmus davon abhängt.",
  haemoglobin:
    "Das sauerstofftragende Protein der roten Blutkörperchen. Der Messwert, über den Blutarmut definiert ist.",
  platelets:
    "Die Zellbruchstücke, die in einer Wunde den ersten Pfropf bilden.",
  leukocytes:
    "Die Zahl der weißen Blutkörperchen je Volumen, der Zellen des Immunsystems. Steigt bei Infektion und Entzündung.",
  erythrocytes: "Die Zahl der roten Blutkörperchen je Blutvolumen.",
  haematocrit:
    "Der Anteil des Blutvolumens, den die roten Blutkörperchen ausmachen.",
  mcv: "Das durchschnittliche Volumen eines roten Blutkörperchens. Kleine und große Zellen weisen auf unterschiedliche Ursachen einer Blutarmut hin, darunter Eisen und B12.",
  mch: "Die durchschnittliche Hämoglobinmasse in einem roten Blutkörperchen. Wird mit dem MCV zusammen gelesen, um Formen der Blutarmut zu unterscheiden.",
  mchc: "Die Hämoglobinkonzentration in den roten Blutkörperchen selbst, im Unterschied zu der im Blut.",
  rdw: "Wie stark die roten Blutkörperchen in ihrer Größe streuen. Ein Anstieg geht einer Veränderung der übrigen Erythrozyten-Indizes oft voraus.",
  mpv: "Das durchschnittliche Volumen eines Blutplättchens. Junge Blutplättchen sind größer.",
  neutrophils:
    "Die weißen Blutkörperchen, die als erste auf bakterielle Infektionen antworten und den größten Teil der Zahl ausmachen.",
  lymphocytes:
    "Die weißen Blutkörperchen der gezielten Immunabwehr: T-Zellen, B-Zellen und natürliche Killerzellen.",
  monocytes:
    "Weiße Blutkörperchen, die im Gewebe zu Makrophagen werden und Zelltrümmer beseitigen.",
  eosinophils:
    "Weiße Blutkörperchen, die bei Allergien und bei Parasitenbefall eine Rolle spielen.",
  basophils:
    "Die seltensten weißen Blutkörperchen; sie tragen Histamin und sind an allergischen Reaktionen beteiligt.",
  "immature-granulocytes":
    "Junge weiße Blutkörperchen, die das Knochenmark früh freisetzt, was bei hohem Bedarf geschieht.",
  "nucleated-erythrocytes":
    "Rote Blutkörperchen, die noch ihren Zellkern tragen, den reife nicht mehr haben.",
  calcium:
    "Der Mineralstoff des Knochens, auch für die Signalübertragung in Nerv und Muskel nötig. Teilweise an Albumin gebunden, weshalb es einen korrigierten Wert gibt.",
  "calcium-albumin-corrected":
    "Calcium, um das gebundene Albumin korrigiert; dieser Wert ist zu lesen, wenn das Albumin selbst außerhalb seines eigenen Bereichs liegt.",
  iron: "Das Eisen, das in diesem Moment im Blut zirkuliert. Schwankt über den Tag und mit den Mahlzeiten und sagt allein daher wenig.",
  "alkaline-phosphatase":
    "Ein Enzym aus Gallenwegen und Knochen. Ein erhöhter Wert wirft die Frage auf, welches von beidem; andere Tests beantworten sie.",
  amylase: "Ein Verdauungsenzym aus Bauchspeicheldrüse und Speicheldrüsen.",
  lipase:
    "Ein fettspaltendes Enzym der Bauchspeicheldrüse, für sie spezifischer als die Amylase.",
  "immunoglobulin-g":
    "Die häufigste Antikörperklasse, das Langzeitgedächtnis des Immunsystems.",
  "cholesterol-non-hdl":
    "Gesamtcholesterin minus HDL: alles, was in Partikeln transportiert wird, die sich in der Gefäßwand ablagern können. Eine nachgeordnete Zielgröße.",
  "glucose-mean-estimated":
    "Ein aus dem HbA1c berechneter Durchschnittszucker, zum Vergleich mit Werten eines Messgeräts. Nicht direkt gemessen.",
  magnesium:
    "Ein Mineralstoff, den Hunderte Enzyme brauchen. Das meiste liegt in den Zellen, deshalb unterschätzt der Blutwert einen Mangel.",
  copper: "Ein Spurenelement für den Eisenstoffwechsel und das Bindegewebe.",
  zinc: "Ein Spurenelement für die Immunfunktion und die Wundheilung.",
  folate:
    "Ein B-Vitamin für Zellteilung und Blutbildung, mit kleinen Speichern.",
  "reticulocyte-haemoglobin":
    "Das Hämoglobin in den jüngsten roten Blutkörperchen; es bildet ab, wie viel Eisen dem Knochenmark in den letzten Tagen zur Verfügung stand.",
  isoleucine:
    "Eine der drei verzweigtkettigen essenziellen Aminosäuren. Wird im Muskel selbst verstoffwechselt statt in der Leber.",
  leucine:
    "Die verzweigtkettige Aminosäure mit dem stärksten Signal für den Muskelaufbau. Steigt kurzfristig nach einer eiweißreichen Mahlzeit.",
  lysine:
    "Essenziell für die Bildung von Kollagen und Carnitin. Der Körper kann sie nicht selbst herstellen.",
  methionine:
    "Die schwefelhaltige essenzielle Aminosäure, aus der Homocystein entsteht und wieder zurückgebildet wird.",
  phenylalanine:
    "Vorstufe von Tyrosin und damit der Katecholamine. Bei Phenylketonurie kann sie nicht abgebaut werden.",
  threonine: "Essenziell, Baustein von Bindegewebe und Immunglobulinen.",
  tryptophan:
    "Die Ausgangssubstanz für Serotonin und Melatonin, und über einen zweiten Weg für Niacin.",
  valine: "Die dritte verzweigtkettige essenzielle Aminosäure.",
  alanine: "Trägt Stickstoff aus dem Muskel zur Leber, wo daraus Glukose wird.",
  arginine:
    "Die Aminosäure, aus der der Körper Stickstoffmonoxid bildet, und ein Zwischenschritt des Harnstoffzyklus.",
  asparagine:
    "Nicht essenziell, am Stickstofftransport zwischen Geweben beteiligt.",
  aspartate:
    "Nicht essenziell, Teil des Harnstoffzyklus und der Bildung von Nukleotiden.",
  citrulline:
    "Ein Zwischenschritt des Harnstoffzyklus, der auch aus dem Darm stammt.",
  cysteine:
    "Die schwefelhaltige Aminosäure, die den geschwindigkeitsbestimmenden Baustein des Glutathions liefert.",
  glutamate:
    "Der wichtigste erregende Botenstoff im Gehirn und ein Knotenpunkt des Aminosäurestoffwechsels.",
  glutamine:
    "Die häufigste freie Aminosäure im Blut. Brennstoff für Darmschleimhaut und Immunzellen.",
  glycine:
    "Die kleinste Aminosäure, ein Drittel des Kollagens und Baustein des Glutathions.",
  histidine: "Vorstufe von Histamin und Carnosin. Für Kinder essenziell.",
  ornithine:
    "Ein Zwischenschritt des Harnstoffzyklus, nicht am Eiweißaufbau beteiligt.",
  proline: "Nach Glycin der häufigste Baustein des Kollagens.",
  serine:
    "Nicht essenziell, Baustein von Zellmembranen und Vorstufe des Glycins.",
  taurine:
    "Keine Aminosäure im engeren Sinn, sondern eine Aminosulfonsäure. Reichlich in Herz und Netzhaut.",
  tyrosine:
    "Aus Phenylalanin gebildet, Vorstufe von Dopamin, Adrenalin und der Schilddrüsenhormone.",
  "body-height": "Die Körpergröße im Stehen, von Ihnen eingetragen.",
  "body-weight":
    "Das Körpergewicht, von Ihnen eingetragen oder von einer Waage übernommen.",
  bmi: "Gewicht geteilt durch Größe im Quadrat. Ein Maß für Bevölkerungen; es sagt nichts darüber, woraus das Gewicht besteht.",
  "waist-circumference":
    "Der Bauchumfang, der das Fett um die Organe besser abbildet als das Gewicht.",
  "visceral-fat":
    "Das Fett um die Organe, wie ein Körperanalysegerät es schätzt. Manche Geräte geben eine Fläche an, andere eine Masse; das sind verschiedene Größen und nicht ineinander umrechenbar.",
  "ecw-tbw":
    "Der Anteil des Körperwassers, der außerhalb der Zellen liegt, wie ihn ein Bioimpedanzgerät schätzt.",
  "body-fat":
    "Die Fettmasse oder ihr Anteil am Körpergewicht, wie ein Bioimpedanzgerät sie schätzt.",
  "muscle-mass": "Die Muskelmasse, wie ein Bioimpedanzgerät sie schätzt.",
  "lean-body-mass":
    "Das Körpergewicht ohne Fett: Muskeln, Knochen, Organe und Wasser.",
  "body-water": "Das gesamte Körperwasser oder sein Anteil am Körpergewicht.",
  quick:
    "Wie schnell das Blut über den Gewebefaktor-Weg gerinnt, als Prozent der Norm. Fällt unter Vitamin-K-Antagonisten und bei Lebererkrankungen.",
  fibrinogen:
    "Das Protein, das das Netz eines Gerinnsels bildet. Zugleich ein Akute-Phase-Protein, es steigt also bei Entzündung.",
  aptt: "Wie schnell das Blut über den Kontaktweg gerinnt. Der Test, mit dem Heparin überwacht wird.",
  urea: "Ein Abbauprodukt des Eiweißstoffwechsels, das die Niere ausscheidet. Steigt auch bei Flüssigkeitsmangel und hoher Eiweißzufuhr.",
  transferrin: "Das Protein, das Eisen im Blut transportiert.",
  "transferrin-saturation":
    "Der Anteil des Transferrins, der tatsächlich Eisen trägt. Wird mit dem Ferritin zusammen gelesen, um Speicher von Nachschub zu unterscheiden.",
  cortisol:
    "Das Stresshormon der Nebenniere. Folgt einem Tagesrhythmus, weshalb die Uhrzeit der Entnahme so wichtig ist wie der Wert.",
  albumin:
    "Das häufigste Protein im Blut, von der Leber gebildet. Transportiert Hormone und Arzneistoffe und hält Flüssigkeit in den Gefäßen.",
  "bilirubin-total":
    "Der Farbstoff aus abgebautem Hämoglobin, den die Leber verarbeitet. Er macht eine Gelbsucht sichtbar.",
  "protein-total":
    "Das gesamte Eiweiß im Serum: überwiegend Albumin und die Immunglobuline.",
  ldh: "Ein Enzym nahezu jeder Zelle, das bei deren Zerfall frei wird. Empfindlich, und nicht auf ein Organ beschränkt.",
  reticulocytes:
    "Neu freigesetzte rote Blutkörperchen. Sie zeigen, wie schnell das Knochenmark sie ersetzt.",
};

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

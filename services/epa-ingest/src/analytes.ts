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
import type { AnalyteCoding, Taxon } from "./types.js";

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
 *
 * `rn` folds to `m` for the same reason: at phone resolution the two letters
 * touch and read as one. Real scans returned `Hamsäure` for `Harnsäure` and
 * `Hamstoff` for `Harnstoff` (2026-10-04), each a known analyte refused.
 */
export function looseLabelKey(raw: string): string {
  return normaliseLabel(raw)
    .replace(/ae/g, "a")
    .replace(/oe/g, "o")
    .replace(/ue/g, "u")
    .replace(/rn/g, "m");
}

/**
 * Maps a printed unit onto its UCUM code.
 * Returns `null` for units we have no UCUM mapping for, the caller reports
 * `unknown-unit` rather than passing an uncoded unit into FHIR.
 */
/** Printed unit spelling, lowercased and without spaces, → UCUM. */
const UNIT_MAP: Record<string, string> = {
  "{ratio}": "{ratio}",
  ratio: "{ratio}",
  ph: "[pH]",
  "mg/dl": "mg/dL",
  "mg/l": "mg/L",
  "g/dl": "g/dL",
  "g/l": "g/L",
  "ug/l": "ug/L",
  // Micrograms per millilitre: a sensitive CRP's unit at some laboratories,
  // numerically equal to mg/L. Never converted, only recognised.
  "ug/ml": "ug/mL",
  // `µmol/l` with its slash lost, as a photographed practice sheet reads it.
  umoll: "umol/L",
  umoli: "umol/L",
  // The HbA1c IFCC unit printed with the reference substance.
  "mmol/molhb": "mmol/mol",
  "mmol/mol hb": "mmol/mol",
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
  // Blood pressure and pulse (FHIR vital signs: mm[Hg] and /min).
  mmhg: "mm[Hg]",
  "mm[hg]": "mm[Hg]",
  "/min": "/min",
  "1/min": "/min",
  bpm: "/min",
  // An electrocardiogram's intervals and axes. The axes print no unit; the
  // ECG reader gives them `deg`.
  ms: "ms",
  msec: "ms",
  // A Holter recording's durations and beat counts, in the spellings the
  // Holter reader writes. Deliberately not a bare `min` or `beats`: measured
  // on real sheets, `Stunde (2 x 30 min` and `Einheit: ml / min` then read
  // as values.
  minutes: "min",
  "{beats}": "{beats}",
  deg: "deg",
  "°": "deg",
  // Exercise testing, spirometry and DXA, in the spellings their readers
  // write (ExerciseECG, CardiopulmonaryExercise, LactateTest,
  // BodyComposition). Deliberately no bare `l`, `W` or `g`: a stray letter
  // after a number on a lab sheet would then read as a volume, a power or a
  // mass.
  litres: "L",
  "litres/s": "L/s",
  "l/min": "L/min",
  "ml/min/kg": "mL/min/kg",
  "ml/min/watts": "mL/min/W",
  "ml/beat": "mL/{beat}",
  watts: "W",
  "watts/kg": "W/kg",
  "mmol/l/s": "mmol/L/s",
  "{met}": "{MET}",
  "{sd}": "{SD}",
  "g/cm2": "g/cm2",
};

/**
 * Every printed spelling `normaliseUnit` accepts, for the Swift generator and
 * the tests. Data, not a scrape of this file: a formatter once unquoted two
 * keys and the scraped table silently lost `fl` and `pg`.
 */
export const UNIT_SPELLINGS: readonly string[] = [
  "{ratio}",
  "Ratio",
  "pH",
  "ph",
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
// A slash is a target, never a source: it keeps its place. Measured on a
// real sheet: a truncated `IU/` became `/ul` once the slash could turn into
// an `l`, a count per microlitre for an antibody titre.
const CONFUSABLE = new Set(["I", "l", "i", "1", "|", "!"]);
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

/**
 * An eGFR unit the recogniser garbled: `m/min/1.73m`, `mimin/1.73m`,
 * `ml/min/1,73m²`. The `/1.73 m²` body-surface suffix belongs to no other
 * unit, so anything that ends in it and starts like millilitres per minute is
 * the eGFR unit, however the letters in between came back.
 */
// `ml/m/1.73m²`: a laboratory that wraps the unit after `ml/` prints the
// rest as `m/1.73m²`, the "in" lost at the fold (measured on a real PDF).
const EGFR_UNIT = /^m[il1|]?\/?m(?:in)?\/1[.,]73m(2|²)?$/;

/** Characters a recogniser prints in front of a unit that are not part of it. */
const STRAY_LEADING = new Set(["I", "i", "l", "|", "!", ":"]);

/**
 * Drops one stray glyph in front of a unit: `Ing/ml`, `img/dl`, `:ng/ml`, a
 * table rule or a column edge read as a letter (2026-10-04, a practice sheet).
 *
 * Refused when the glyph could have been a letter of a different unit: `ig/dl`
 * might be `µg/dl` read badly, a thousandfold away from `g/dl`, so if putting
 * `u`, `m`, `n` or `p` in its place also names a unit, nothing is guessed.
 */
export function dropStrayLeading(compact: string): string | null {
  if (compact.length < 3 || !STRAY_LEADING.has(compact[0])) return null;
  const rest = compact.slice(1).toLowerCase();
  const unit = UNIT_MAP[rest];
  if (!unit) return null;
  for (const letter of ["u", "m", "n", "p"]) {
    if (UNIT_MAP[letter + rest]) return null;
  }
  return unit;
}

export function normaliseUnit(raw: string): string | null {
  const compact = raw.trim().replace(/µ|μ/g, "u").replace(/\s+/g, "");
  // Case decides before anything is lowercased: German haematology prints
  // `G/l` for giga per litre (10*9/L, a cell count) and `T/l` for tera per
  // litre (10*12/L), while `g/l` is a gram per litre (a haemoglobin). Folding
  // case first would turn a leukocyte count into a mass concentration.
  if (/^G\/[lL]$/.test(compact)) return "10*9/L";
  if (/^T\/[lL]$/.test(compact)) return "10*12/L";
  const lower = compact.toLowerCase();
  if (UNIT_MAP[lower]) return UNIT_MAP[lower];
  if (EGFR_UNIT.test(lower)) return "mL/min/{1.73_m2}";
  return dropStrayLeading(compact) ?? repairUnit(raw);
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

const ORGANISM_UNCODED =
  "LOINC names tests, not organisms: it has no term for the relative abundance of a taxon in stool. The organism is named by its NCBI Taxonomy id instead.";

/**
 * One organism of the gut microbiome, as a stool report prints it.
 *
 * The share stays uncoded, with the reason attached, because LOINC has no
 * term for it. What names the organism is NCBI Taxonomy, and every id was
 * checked against its API: the sheet's spelling may be a synonym (NCBI has
 * renamed Firmicutes to Bacillota and Prevotella copri to Segatella copri),
 * the id is the same organism either way, and `scientificName` records what
 * NCBI calls it today so a reader is not left to reconcile the two.
 */
const organism = (spec: {
  key: string;
  labels: string[];
  description: string;
  taxon: Taxon;
}): AnalyteDefinition => ({
  key: spec.key,
  description: spec.description,
  labels: spec.labels,
  byUnit: {
    "%": {
      ...uncoded(
        `${spec.labels[0]} [relative abundance] in Stool`,
        "%",
        ORGANISM_UNCODED,
      ),
      taxon: spec.taxon,
    },
  },
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
    /**
     * The same cells counted under the microscope, which LOINC codes apart
     * from the analyser's count. Bases are the names a sheet prints before
     * the method, `Lymphozyten (mikr.Diff)`.
     */
    manual?: {
      bases: string[];
      count: [loinc: string, display: string];
      share: [loinc: string, display: string];
    }[];
  },
): AnalyteDefinition[] {
  const suffixes = ["", " absolut", " abs.", " relativ", " rel.", " %"];
  const labels = [spec.de, ...spec.long, ...spec.en].flatMap((base) =>
    suffixes.map((suffix) => `${base}${suffix}`),
  );
  // A microscopic differential, as German sheets mark it. Punctuation folds
  // away in the key, so `(mikr. Diff.)` and `(mikr.Diff)` are one spelling.
  const methods = [
    " (mikr.)",
    " (mikr.Diff)",
    " (mikr.Diff.abs.)",
    " (mikr.Diff.rel.)",
    " mikroskopisch",
    " (manuell)",
    " manuell",
  ];
  const manual = (spec.manual ?? []).map((m) => ({
    key,
    // No count/share suffixes: the method marker carries that, as in
    // `(mikr.Diff.abs.)`, and the unit picks the code regardless.
    labels: m.bases.flatMap((base) =>
      methods.map((method) => `${base}${method}`),
    ),
    byUnit: {
      "10*9/L": c(m.count[0], m.count[1], "10*9/L"),
      "10*3/uL": c(m.count[0], m.count[1], "10*3/uL"),
      "/uL": c(m.count[0], m.count[1], "/uL"),
      "%": c(m.share[0], m.share[1], "%"),
    },
  }));
  return [
    ...manual,
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

/**
 * A vital sign as a single reading and as the period means an ambulatory
 * report prints (24 hours, day, night). One analyte, so reference ranges and
 * descriptions are shared; the label picks the coding, as the method does
 * for the differential.
 */
function vitalSign(
  key: string,
  spec: {
    description: string;
    labels: string[];
    unit: string;
    single: [loinc: string, display: string];
    day24: [loinc: string, display: string];
    period: [loinc: string, display: string];
    /** The German name the ambulatory reader writes before the period. */
    base: string;
  },
): AnalyteDefinition[] {
  const one = (code: [string, string]) => ({
    [spec.unit]: c(code[0], code[1], spec.unit),
  });
  return [
    {
      key,
      description: spec.description,
      labels: spec.labels,
      byUnit: one(spec.single),
    },
    { key, labels: [`${spec.base} 24-h-Mittel`], byUnit: one(spec.day24) },
    {
      key,
      labels: [`${spec.base} Tagesmittel`, `${spec.base} Nachtmittel`],
      byUnit: one(spec.period),
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
      "C-reaktives Protein (ultrasensitiv)",
      "CRP ultrasensitiv",
    ],
    byUnit: {
      "ug/mL": c(
        "30522-7",
        "C reactive protein [Mass/volume] in Serum or Plasma by High sensitivity method",
        "ug/mL",
      ),
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
  {
    // Fasting is part of the test's definition, and LOINC codes it apart.
    key: "glucose-fasting",
    description:
      "Blood sugar after at least eight hours without food, the reading diabetes thresholds are stated for.",
    labels: [
      "Nüchternglucose",
      "Nüchternglukose",
      "Glucose nüchtern",
      "Glukose nüchtern",
      "Nüchtern-Blutzucker",
    ],
    byUnit: {
      "mg/dL": c(
        "1558-6",
        "Fasting glucose [Mass/volume] in Serum or Plasma",
        "mg/dL",
      ),
      "mmol/L": c(
        "14771-0",
        "Fasting glucose [Moles/volume] in Serum or Plasma",
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
      // 16695-9 until 2026-10-04: that is B12 by mass in whole blood, a
      // different property and specimen. Verified against NLM.
      "pmol/L": c(
        "14685-2",
        "Cobalamin (Vitamin B12) [Moles/volume] in Serum or Plasma",
        "pmol/L",
      ),
    },
  },
  {
    key: "vitamin-d",
    description:
      "The storage form of vitamin D, which reflects supply from sun and diet over weeks.",
    // A sheet that prints "25-OH-Vitamin D" reports the total of D2 and D3,
    // which is what routine immunoassays measure. Until 2026-10-04 it was
    // coded as D3 alone (1989-3); only a label that names D3 is that now.
    labels: ["Vitamin D", "25-OH-Vitamin D"],
    byUnit: {
      "ng/mL": c(
        "62292-8",
        "25-Hydroxyvitamin D3+25-Hydroxyvitamin D2 [Mass/volume] in Serum or Plasma",
        "ng/mL",
      ),
      "nmol/L": c(
        "68438-1",
        "25-Hydroxyvitamin D3+25-Hydroxyvitamin D2 [Moles/volume] in Serum or Plasma",
        "nmol/L",
      ),
    },
  },
  {
    key: "vitamin-d",
    labels: ["25-OH-Vitamin-D3", "Vitamin D3", "25-OH-D3", "Calcidiol"],
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
      "Neutrophile Granu.",
      "Segmentkernige",
      "Segmentkernige Granulozyten",
    ],
    en: ["Neutrophils", "Neutro", "NEUT"],
    count: ["751-8", "Neutrophils [#/volume] in Blood by Automated count"],
    share: ["770-8", "Neutrophils/Leukocytes in Blood by Automated count"],
    manual: [
      {
        bases: [
          "Neutrophile",
          "Neutrophile Granulozyten",
          "Neutrophile Granu.",
          "Neutrophils",
        ],
        count: ["753-4", "Neutrophils [#/volume] in Blood by Manual count"],
        share: ["23761-0", "Neutrophils/Leukocytes in Blood by Manual count"],
      },
      {
        bases: ["Segmentkernige", "Segmentkernige Granulozyten"],
        count: [
          "768-2",
          "Segmented neutrophils [#/volume] in Blood by Manual count",
        ],
        share: [
          "769-0",
          "Segmented neutrophils/Leukocytes in Blood by Manual count",
        ],
      },
    ],
  }),
  ...differential("lymphocytes", {
    description:
      "The white cells of targeted immunity: T cells, B cells and natural killer cells.",
    de: "Lymphozyten",
    long: [],
    en: ["Lymphocytes", "Lympho", "LYMPH"],
    count: ["731-0", "Lymphocytes [#/volume] in Blood by Automated count"],
    share: ["736-9", "Lymphocytes/Leukocytes in Blood by Automated count"],
    manual: [
      {
        bases: ["Lymphozyten", "Lymphocytes"],
        count: ["732-8", "Lymphocytes [#/volume] in Blood by Manual count"],
        share: ["737-7", "Lymphocytes/Leukocytes in Blood by Manual count"],
      },
    ],
  }),
  ...differential("monocytes", {
    description:
      "White cells that become macrophages in tissue and clear debris.",
    de: "Monozyten",
    long: [],
    en: ["Monocytes", "Mono", "MONO"],
    count: ["742-7", "Monocytes [#/volume] in Blood by Automated count"],
    share: ["5905-5", "Monocytes/Leukocytes in Blood by Automated count"],
    manual: [
      {
        bases: ["Monozyten", "Monocytes"],
        count: ["743-5", "Monocytes [#/volume] in Blood by Manual count"],
        share: ["744-3", "Monocytes/Leukocytes in Blood by Manual count"],
      },
    ],
  }),
  ...differential("eosinophils", {
    description: "White cells involved in allergy and in parasitic infection.",
    de: "Eosinophile",
    long: ["Eosinophile Granulozyten"],
    en: ["Eosinophils", "Eos", "EOS"],
    count: ["711-2", "Eosinophils [#/volume] in Blood by Automated count"],
    share: ["713-8", "Eosinophils/Leukocytes in Blood by Automated count"],
    manual: [
      {
        bases: ["Eosinophile", "Eosinophile Granulozyten", "Eosinophils"],
        count: ["712-0", "Eosinophils [#/volume] in Blood by Manual count"],
        share: ["714-6", "Eosinophils/Leukocytes in Blood by Manual count"],
      },
    ],
  }),
  ...differential("basophils", {
    description:
      "The rarest white cells, carrying histamine and involved in allergic reactions.",
    de: "Basophile",
    long: ["Basophile Granulozyten"],
    en: ["Basophils", "Baso", "BASO"],
    count: ["704-7", "Basophils [#/volume] in Blood by Automated count"],
    share: ["706-2", "Basophils/Leukocytes in Blood by Automated count"],
    manual: [
      {
        bases: ["Basophile", "Basophile Granulozyten", "Basophils"],
        count: ["705-4", "Basophils [#/volume] in Blood by Manual count"],
        share: ["707-0", "Basophils/Leukocytes in Blood by Manual count"],
      },
    ],
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
    key: "holotranscobalamin",
    description:
      "The share of vitamin B12 bound to the protein that delivers it to cells, often called active B12.",
    labels: [
      "Holotranscobalamin",
      "Holo-Transcobalamin",
      "HoloTC",
      "Holotranscobalamin (aktives B12)",
      "Holotranscobalamin(akt.B12)",
      "aktives B12",
      "Aktives Vitamin B12",
    ],
    byUnit: {
      "pmol/L": c(
        "72160-5",
        "Holo-transcobalamin II [Moles/volume] in Serum",
        "pmol/L",
      ),
    },
  },
  {
    key: "manganese",
    description: "A trace element needed by several enzymes.",
    labels: ["Mangan", "Mangan im Serum", "Manganese"],
    byUnit: {
      "ug/L": c("5683-8", "Manganese [Mass/volume] in Serum or Plasma", "ug/L"),
    },
  },
  {
    key: "selenium",
    description:
      "A trace element needed by the enzymes that protect cells from oxidation and by the thyroid.",
    labels: ["Selen", "Selenium", "Selen i.S. (AAS)"],
    byUnit: {
      "ug/L": c("5724-0", "Selenium [Mass/volume] in Serum or Plasma", "ug/L"),
    },
  },
  {
    // Measured in whole blood. LOINC codes the amount of pyridoxal phosphate
    // in blood and only serum or plasma by mass, so a mass in blood is
    // carried uncoded and never takes a serum code (NLM, 2026-10-11).
    key: "vitamin-b6-blood",
    description:
      "Vitamin B6 in whole blood, as pyridoxal phosphate, the form the body uses.",
    labels: [
      "Vitamin B6 i. Blut",
      "Vitamin B6 im Blut",
      "Vitamin B6 i. Blut (HPLC)",
      "Vitamin B6 (Vollblut)",
    ],
    byUnit: {
      "nmol/L": c(
        "74442-5",
        "Pyridoxal phosphate [Moles/volume] in Blood",
        "nmol/L",
      ),
      "ng/mL": uncoded(
        "Pyridoxal phosphate [Mass/volume] in Blood",
        "ng/mL",
        "LOINC codes pyridoxal phosphate in blood as an amount of substance (74442-5), and by mass only in serum or plasma.",
      ),
    },
  },
  {
    key: "hbs-antibody",
    description:
      "Antibodies against the hepatitis B surface antigen, the measure of protection after vaccination or a past infection.",
    labels: ["HBs-Ak quant.", "HBs-Ak", "Anti-HBs", "HBs-Antikörper"],
    byUnit: {
      "[IU]/L": c(
        "5193-8",
        "Hepatitis B virus surface Ab [Units/volume] in Serum or Plasma by Immunoassay",
        "[IU]/L",
      ),
    },
  },
  {
    key: "magnesium-rbc",
    description:
      "Magnesium inside the red blood cells, where most of the body's magnesium is held, so it can show a shortage the serum value misses.",
    labels: [
      "Magnesium in Erythrozyten",
      "Mg in Erythrozyten",
      "Erythrozyten-Magnesium",
    ],
    byUnit: {
      "mmol/L": c(
        "2597-3",
        "Magnesium [Moles/volume] in Red Blood Cells",
        "mmol/L",
      ),
    },
  },
  // ---- Fatty acids in red blood cells ----
  // LOINC codes EPA, DHA and the omega-3 index in serum or plasma, or as an
  // amount of substance in red cells, not as the mass per volume of blood a
  // German laboratory prints. Carried uncoded, with the reason. Verified
  // against NLM, 2026-10-11.
  {
    key: "epa",
    description:
      "Eicosapentaenoic acid, an omega-3 fatty acid from oily fish, measured in the red blood cells.",
    labels: ["Eicosapentaensäure (EPA) 20:5 w3", "Eicosapentaensäure", "EPA"],
    byUnit: {
      "mg/L": uncoded(
        "Eicosapentaenoate (C20:5w3) [Mass/volume] in Blood",
        "mg/L",
        "LOINC codes EPA in serum or plasma, or as an amount of substance in red blood cells (75097-6), not as a mass per volume of blood.",
      ),
    },
  },
  {
    key: "dha",
    description:
      "Docosahexaenoic acid, an omega-3 fatty acid from oily fish, measured in the red blood cells.",
    labels: ["Docosahexaensäure (DHA) 22:6 w3", "Docosahexaensäure", "DHA"],
    byUnit: {
      "mg/L": uncoded(
        "Docosahexaenoate (C22:6w3) [Mass/volume] in Blood",
        "mg/L",
        "LOINC codes DHA in serum or plasma, or as an amount of substance in red blood cells (75095-0), not as a mass per volume of blood.",
      ),
    },
  },
  {
    key: "omega-3-index",
    description:
      "EPA and DHA together as a share of all fatty acids in the red blood cell membranes.",
    labels: ["Omega-3-Index", "Omega-3-Index (EPA und DHA)", "Omega-3 index"],
    byUnit: {
      "%": uncoded(
        "Omega-3 (EPA+DHA) index in Red Blood Cells",
        "%",
        "LOINC's omega-3 index is measured in serum or plasma (88998-0), and its blood term includes DPA (90911-9). Neither is the red-cell EPA and DHA share a laboratory prints.",
      ),
    },
  },
  {
    key: "fatty-acids-total-rbc",
    description: "All fatty acids measured in the red blood cells together.",
    labels: ["Fettsäuren, gesamt", "Fettsäuren gesamt", "Gesamtfettsäuren"],
    byUnit: {
      "mg/L": uncoded(
        "Fatty acids [Mass/volume] in Blood",
        "mg/L",
        "LOINC codes total fatty acids in serum or plasma (2275-6), or as an amount of substance in red blood cells (75100-8), not as a mass per volume of blood.",
      ),
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
  // ---- Values computed from other values ----
  //
  // Not printed on any sheet: worked out from what is. A ratio has no unit,
  // and the dictionary is keyed by unit, so `1` is the UCUM code for a pure
  // number.
  //
  // LOINC has terms near these and not these. `55607-6` is a **molar** ratio
  // of triglyceride to HDL and this one is a mass ratio, the form the
  // published cut-point takes; `16616-5` runs HDL over LDL, the other way
  // round; and `9340-1` is a percentile rather than a ratio. A code that is
  // nearly right is wrong, so they are carried uncoded and say so.
  {
    key: "ratio-tg-hdl",
    description:
      "Triglycerides divided by HDL cholesterol, both taken in mg/dL. The published cut-point is stated in that unit, so a panel printed in mmol/L is converted before dividing; the figure would otherwise differ by a factor of about 2.3.",
    labels: ["Triglyzeride/HDL", "TG/HDL", "Triglyceride zu HDL"],
    byUnit: {
      "{ratio}": uncoded(
        "Triglyceride to HDL cholesterol ratio",
        "{ratio}",
        "LOINC's nearest term (55607-6) is a molar ratio, and this is the mass ratio on a mg/dL basis that the published cut-point uses.",
      ),
    },
  },
  {
    key: "ratio-ldl-hdl",
    description: "LDL cholesterol divided by HDL cholesterol.",
    labels: ["LDL/HDL", "LDL zu HDL"],
    byUnit: {
      "{ratio}": uncoded(
        "LDL to HDL cholesterol ratio",
        "{ratio}",
        "LOINC's nearest term (16616-5) is HDL over LDL, the other way round.",
      ),
    },
  },
  {
    key: "ratio-apob-apoa1",
    description:
      "Apolipoprotein B divided by apolipoprotein A1: the particles that deposit cholesterol against the particles that remove it.",
    labels: ["ApoB/ApoA1", "Apo B/Apo A1"],
    byUnit: {
      "{ratio}": uncoded(
        "Apolipoprotein B to apolipoprotein A1 ratio",
        "{ratio}",
        "LOINC's nearest term (9340-1) is a percentile rather than a ratio.",
      ),
    },
  },
  {
    key: "cholesterol-remnant",
    description:
      "Total cholesterol minus HDL minus LDL: what is carried in the triglyceride-rich particles and their remnants.",
    labels: ["Remnant-Cholesterin", "Remnant Cholesterol"],
    byUnit: {
      "mg/dL": uncoded(
        "Remnant cholesterol [Mass/volume] in Serum or Plasma",
        "mg/dL",
        "LOINC has no term for remnant cholesterol computed from a standard lipid panel.",
      ),
      "mmol/L": uncoded(
        "Remnant cholesterol [Moles/volume] in Serum or Plasma",
        "mmol/L",
        "LOINC has no term for remnant cholesterol computed from a standard lipid panel.",
      ),
    },
  },
  // ---- The gut microbiome, as a stool report prints it ----
  //
  // Almost none of this is coded by LOINC, checked against the NLM clinical
  // tables API: there is a term for the pH of stool and none for the
  // abundance of a genus, none for a diversity index, none for the ratio of
  // two phyla. LOINC names tests; naming an organism is what NCBI Taxonomy is
  // for, so every organism below carries its NCBI Taxonomy id, verified
  // against the NCBI E-utilities API on 2026-09-22, while the share itself
  // stays uncoded with the reason attached. A functional share (butyrate
  // production, mucin degradation) is not an organism and carries no id.
  //
  // The alternative to carrying them uncoded was leaving seventy-six real
  // measurements of a person's own gut in a list called "unmatched", where
  // nothing can plot them, export them or ask about them. An honest absence of
  // a code is better than that, and far better than a code that is wrong.
  {
    key: "mb-acetat-und-propionatproduktion",
    description:
      "The share of the bacteria found that produce acetate and propionate.",
    labels: ["Acetat- und Propionatproduktion"],
    byUnit: {
      "%": uncoded(
        "Acetat- und Propionatproduktion [relative abundance] in Stool",
        "%",
        "LOINC has no term for the share of a microbiome's functional capacity that a stool report prints.",
      ),
    },
  },
  organism({
    key: "mb-actinobacteria",
    description:
      "A phylum of the gut microbiome; the figure is its share of all the bacteria found.",
    labels: ["Actinobacteria"],
    taxon: {
      ncbiTaxId: "201174",
      scientificName: "Actinomycetota",
      rank: "phylum",
    },
  }),
  organism({
    key: "mb-akkermansia-muciniphila",
    description: "A species that lives on the gut's mucus layer.",
    labels: ["Akkermansia muciniphila"],
    taxon: {
      ncbiTaxId: "239935",
      scientificName: "Akkermansia muciniphila",
      rank: "species",
    },
  }),
  organism({
    key: "mb-alistipes-spp",
    description:
      "A genus of gut bacteria; the figure is its share of all the bacteria found.",
    labels: ["Alistipes spp.", "Alistipes species"],
    taxon: { ncbiTaxId: "239759", scientificName: "Alistipes", rank: "genus" },
  }),
  organism({
    key: "mb-anaerotruncus-colihominis",
    description:
      "A species of gut bacteria; the figure is its share of all the bacteria found.",
    labels: ["Anaerotruncus colihominis"],
    taxon: {
      ncbiTaxId: "169435",
      scientificName: "Anaerotruncus colihominis",
      rank: "species",
    },
  }),
  organism({
    key: "mb-bacteroides-spp",
    description:
      "A genus of gut bacteria; the figure is its share of all the bacteria found.",
    labels: ["Bacteroides spp.", "Bacteroides species"],
    taxon: { ncbiTaxId: "816", scientificName: "Bacteroides", rank: "genus" },
  }),
  organism({
    key: "mb-bacteroides-vulgatus",
    description:
      "A species of gut bacteria; the figure is its share of all the bacteria found.",
    labels: ["Bacteroides vulgatus"],
    taxon: {
      ncbiTaxId: "821",
      scientificName: "Phocaeicola vulgatus",
      rank: "species",
    },
  }),
  organism({
    key: "mb-bacteroidetes",
    description:
      "A phylum of the gut microbiome; the figure is its share of all the bacteria found.",
    labels: ["Bacteroidetes"],
    taxon: { ncbiTaxId: "976", scientificName: "Bacteroidota", rank: "phylum" },
  }),
  organism({
    key: "mb-bifidobacterium-adolescentis",
    description:
      "A species of gut bacteria; the figure is its share of all the bacteria found.",
    labels: ["Bifidobacterium adolescentis"],
    taxon: {
      ncbiTaxId: "1680",
      scientificName: "Bifidobacterium adolescentis",
      rank: "species",
    },
  }),
  organism({
    key: "mb-bifidobacterium-dentium",
    description:
      "A species of gut bacteria; the figure is its share of all the bacteria found.",
    labels: ["Bifidobacterium dentium"],
    taxon: {
      ncbiTaxId: "1689",
      scientificName: "Bifidobacterium dentium",
      rank: "species",
    },
  }),
  organism({
    key: "mb-bifidobacterium-spp",
    description:
      "A genus of gut bacteria; the figure is its share of all the bacteria found.",
    labels: ["Bifidobacterium spp.", "Bifidobacterium species"],
    taxon: {
      ncbiTaxId: "1678",
      scientificName: "Bifidobacterium",
      rank: "genus",
    },
  }),
  organism({
    key: "mb-bilophila-wadsworthia",
    description: "A bile-tolerant, sulphate-reducing species.",
    labels: ["Bilophila wadsworthia"],
    taxon: {
      ncbiTaxId: "35833",
      scientificName: "Bilophila wadsworthia",
      rank: "species",
    },
  }),
  {
    key: "mb-butyratproduktion",
    description: "The share of the bacteria found that produce butyrate.",
    labels: ["Butyratproduktion"],
    byUnit: {
      "%": uncoded(
        "Butyratproduktion [relative abundance] in Stool",
        "%",
        "LOINC has no term for the share of a microbiome's functional capacity that a stool report prints.",
      ),
    },
  },
  organism({
    key: "mb-butyrivibrio-crossotus",
    description:
      "A species of gut bacteria; the figure is its share of all the bacteria found.",
    labels: ["Butyrivibrio crossotus"],
    taxon: {
      ncbiTaxId: "45851",
      scientificName: "Eshraghiella crossota",
      rank: "species",
    },
  }),
  organism({
    key: "mb-candida-albicans",
    description:
      "A yeast of the gut; the figure is its share of the flora found.",
    labels: ["Candida albicans"],
    taxon: {
      ncbiTaxId: "5476",
      scientificName: "Candida albicans",
      rank: "species",
    },
  }),
  organism({
    key: "mb-candida-spp",
    description:
      "A yeast of the gut; the figure is its share of the flora found.",
    labels: ["Candida spp.", "Candida species"],
    taxon: { ncbiTaxId: "5475", scientificName: "Candida", rank: "genus" },
  }),
  organism({
    key: "mb-citrobacter-spp",
    description:
      "A genus of gut bacteria; the figure is its share of all the bacteria found.",
    labels: ["Citrobacter spp.", "Citrobacter species"],
    taxon: { ncbiTaxId: "544", scientificName: "Citrobacter", rank: "genus" },
  }),
  organism({
    key: "mb-clostridium-difficile",
    description: "A species that can take over after a course of antibiotics.",
    labels: ["Clostridium difficile"],
    taxon: {
      ncbiTaxId: "1496",
      scientificName: "Clostridioides difficile",
      rank: "species",
    },
  }),
  organism({
    key: "mb-clostridium-scindens",
    description:
      "A species of gut bacteria; the figure is its share of all the bacteria found.",
    labels: ["Clostridium scindens"],
    taxon: {
      ncbiTaxId: "29347",
      scientificName: "[Clostridium] scindens",
      rank: "species",
    },
  }),
  organism({
    key: "mb-clostridium-spp",
    description:
      "A genus of gut bacteria; the figure is its share of all the bacteria found.",
    labels: ["Clostridium spp.", "Clostridium species"],
    taxon: { ncbiTaxId: "1485", scientificName: "Clostridium", rank: "genus" },
  }),
  organism({
    key: "mb-cyanobacteria",
    description:
      "A phylum of the gut microbiome; the figure is its share of all the bacteria found.",
    labels: ["Cyanobacteria"],
    taxon: {
      ncbiTaxId: "1117",
      scientificName: "Cyanobacteriota",
      rank: "phylum",
    },
  }),
  organism({
    key: "mb-desulfobacter-spp",
    description:
      "A genus of gut bacteria; the figure is its share of all the bacteria found.",
    labels: ["Desulfobacter spp.", "Desulfobacter species"],
    taxon: {
      ncbiTaxId: "2289",
      scientificName: "Desulfobacter",
      rank: "genus",
    },
  }),
  organism({
    key: "mb-desulfovibrio-spp",
    description:
      "A genus of gut bacteria; the figure is its share of all the bacteria found.",
    labels: ["Desulfovibrio spp.", "Desulfovibrio species"],
    taxon: { ncbiTaxId: "872", scientificName: "Desulfovibrio", rank: "genus" },
  }),
  organism({
    key: "mb-desulfuromonas-spp",
    description:
      "A genus of gut bacteria; the figure is its share of all the bacteria found.",
    labels: ["Desulfuromonas spp.", "Desulfuromonas species"],
    taxon: {
      ncbiTaxId: "890",
      scientificName: "Desulfuromonas",
      rank: "genus",
    },
  }),
  organism({
    key: "mb-dorea-spp",
    description:
      "A genus of gut bacteria; the figure is its share of all the bacteria found.",
    labels: ["Dorea spp.", "Dorea species"],
    taxon: { ncbiTaxId: "189330", scientificName: "Dorea", rank: "genus" },
  }),
  organism({
    key: "mb-enterobacter-spp",
    description:
      "A genus of gut bacteria; the figure is its share of all the bacteria found.",
    labels: ["Enterobacter spp.", "Enterobacter species"],
    taxon: { ncbiTaxId: "547", scientificName: "Enterobacter", rank: "genus" },
  }),
  organism({
    key: "mb-enterococcus-spp",
    description:
      "A genus of gut bacteria; the figure is its share of all the bacteria found.",
    labels: ["Enterococcus spp.", "Enterococcus species"],
    taxon: { ncbiTaxId: "1350", scientificName: "Enterococcus", rank: "genus" },
  }),
  organism({
    key: "mb-escherichia-spp",
    description:
      "A genus of gut bacteria; the figure is its share of all the bacteria found.",
    labels: ["Escherichia spp.", "Escherichia species"],
    taxon: { ncbiTaxId: "561", scientificName: "Escherichia", rank: "genus" },
  }),
  organism({
    key: "mb-eubacterium-spp",
    description:
      "A genus of gut bacteria; the figure is its share of all the bacteria found.",
    labels: ["Eubacterium spp.", "Eubacterium species"],
    taxon: { ncbiTaxId: "1730", scientificName: "Eubacterium", rank: "genus" },
  }),
  organism({
    key: "mb-euryarchaeota",
    description:
      "A phylum of the gut microbiome; the figure is its share of all the bacteria found.",
    labels: ["Euryarchaeota"],
    taxon: {
      ncbiTaxId: "28890",
      scientificName: "Methanobacteriota",
      rank: "phylum",
    },
  }),
  organism({
    key: "mb-faecalibacterium-prausnitzii",
    description:
      "One of the most common butyrate-producing species of the colon.",
    labels: ["Faecalibacterium prausnitzii"],
    taxon: {
      ncbiTaxId: "853",
      scientificName: "Faecalibacterium prausnitzii",
      rank: "species",
    },
  }),
  organism({
    key: "mb-firmicutes",
    description:
      "A phylum of the gut microbiome; the figure is its share of all the bacteria found.",
    labels: ["Firmicutes"],
    taxon: { ncbiTaxId: "1239", scientificName: "Bacillota", rank: "phylum" },
  }),
  organism({
    key: "mb-fusobacteria",
    description:
      "A phylum of the gut microbiome; the figure is its share of all the bacteria found.",
    labels: ["Fusobacteria"],
    taxon: {
      ncbiTaxId: "32066",
      scientificName: "Fusobacteriota",
      rank: "phylum",
    },
  }),
  organism({
    key: "mb-fusobacterium-nucleatum",
    description:
      "A species of gut bacteria; the figure is its share of all the bacteria found.",
    labels: ["Fusobacterium nucleatum"],
    taxon: {
      ncbiTaxId: "851",
      scientificName: "Fusobacterium nucleatum",
      rank: "species",
    },
  }),
  organism({
    key: "mb-geotrichum-candidum",
    description:
      "A yeast of the gut; the figure is its share of the flora found.",
    labels: ["Geotrichum candidum"],
    taxon: {
      ncbiTaxId: "1173061",
      scientificName: "Geotrichum candidum",
      rank: "species",
    },
  }),
  organism({
    key: "mb-hafnia-alveii",
    description:
      "A species of gut bacteria; the figure is its share of all the bacteria found.",
    labels: ["Hafnia alveii"],
    taxon: {
      ncbiTaxId: "569",
      scientificName: "Hafnia alvei",
      rank: "species",
    },
  }),
  organism({
    key: "mb-klebsiella-spp",
    description:
      "A genus of gut bacteria; the figure is its share of all the bacteria found.",
    labels: ["Klebsiella spp.", "Klebsiella species"],
    taxon: { ncbiTaxId: "570", scientificName: "Klebsiella", rank: "genus" },
  }),
  {
    key: "mb-lps-tragende-bakterien",
    description:
      "The share of the bacteria found that carry lipopolysaccharide in their cell wall.",
    labels: ["LPS-tragende Bakterien"],
    byUnit: {
      "%": uncoded(
        "LPS-tragende Bakterien [relative abundance] in Stool",
        "%",
        "LOINC has no term for the share of a microbiome's functional capacity that a stool report prints.",
      ),
    },
  },
  organism({
    key: "mb-lactobacillus-brevis",
    description:
      "A species of gut bacteria; the figure is its share of all the bacteria found.",
    labels: ["Lactobacillus brevis"],
    taxon: {
      ncbiTaxId: "1580",
      scientificName: "Levilactobacillus brevis",
      rank: "species",
    },
  }),
  organism({
    key: "mb-lactobacillus-paracasei",
    description:
      "A species of gut bacteria; the figure is its share of all the bacteria found.",
    labels: ["Lactobacillus paracasei"],
    taxon: {
      ncbiTaxId: "1597",
      scientificName: "Lacticaseibacillus paracasei",
      rank: "species",
    },
  }),
  organism({
    key: "mb-lactobacillus-plantarum",
    description:
      "A species of gut bacteria; the figure is its share of all the bacteria found.",
    labels: ["Lactobacillus plantarum"],
    taxon: {
      ncbiTaxId: "1590",
      scientificName: "Lactiplantibacillus plantarum",
      rank: "species",
    },
  }),
  organism({
    key: "mb-lactobacillus-spp",
    description:
      "A genus of gut bacteria; the figure is its share of all the bacteria found.",
    labels: ["Lactobacillus spp.", "Lactobacillus species"],
    taxon: {
      ncbiTaxId: "1578",
      scientificName: "Lactobacillus",
      rank: "genus",
    },
  }),
  {
    key: "mb-laktatproduktion",
    description: "The share of the bacteria found that produce lactate.",
    labels: ["Laktatproduktion"],
    byUnit: {
      "%": uncoded(
        "Laktatproduktion [relative abundance] in Stool",
        "%",
        "LOINC has no term for the share of a microbiome's functional capacity that a stool report prints.",
      ),
    },
  },
  organism({
    key: "mb-methanobacteria",
    description:
      "A species of gut bacteria; the figure is its share of all the bacteria found.",
    labels: ["Methanobacteria"],
    taxon: {
      ncbiTaxId: "183925",
      scientificName: "Methanobacteria",
      rank: "class",
    },
  }),
  organism({
    key: "mb-methanobrevibacter-spp",
    description:
      "A genus of gut bacteria; the figure is its share of all the bacteria found.",
    labels: ["Methanobrevibacter spp.", "Methanobrevibacter species"],
    taxon: {
      ncbiTaxId: "2172",
      scientificName: "Methanobrevibacter",
      rank: "genus",
    },
  }),
  {
    key: "mb-mucindegradation",
    description:
      "The share of the bacteria found that break down the gut's mucus layer.",
    labels: ["Mucindegradation"],
    byUnit: {
      "%": uncoded(
        "Mucindegradation [relative abundance] in Stool",
        "%",
        "LOINC has no term for the share of a microbiome's functional capacity that a stool report prints.",
      ),
    },
  },
  organism({
    key: "mb-oscillibacter-spp",
    description:
      "A genus of gut bacteria; the figure is its share of all the bacteria found.",
    labels: ["Oscillibacter spp.", "Oscillibacter species"],
    taxon: {
      ncbiTaxId: "459786",
      scientificName: "Oscillibacter",
      rank: "genus",
    },
  }),
  organism({
    key: "mb-oxalobacter-formigenes",
    description:
      "A species of gut bacteria; the figure is its share of all the bacteria found.",
    labels: ["Oxalobacter formigenes"],
    taxon: {
      ncbiTaxId: "847",
      scientificName: "Oxalobacter formigenes",
      rank: "species",
    },
  }),
  organism({
    key: "mb-prevotella-copri",
    description: "A species associated with a fibre-rich diet.",
    labels: ["Prevotella copri"],
    taxon: {
      ncbiTaxId: "165179",
      scientificName: "Segatella copri",
      rank: "species",
    },
  }),
  organism({
    key: "mb-prevotella-spp",
    description:
      "A genus of gut bacteria; the figure is its share of all the bacteria found.",
    labels: ["Prevotella spp.", "Prevotella species"],
    taxon: { ncbiTaxId: "838", scientificName: "Prevotella", rank: "genus" },
  }),
  organism({
    key: "mb-proteobacteria",
    description:
      "A phylum of the gut microbiome; the figure is its share of all the bacteria found.",
    labels: ["Proteobacteria"],
    taxon: {
      ncbiTaxId: "1224",
      scientificName: "Pseudomonadota",
      rank: "phylum",
    },
  }),
  organism({
    key: "mb-providencia-spp",
    description:
      "A genus of gut bacteria; the figure is its share of all the bacteria found.",
    labels: ["Providencia spp.", "Providencia species"],
    taxon: { ncbiTaxId: "586", scientificName: "Providencia", rank: "genus" },
  }),
  organism({
    key: "mb-pseudomonas-spp",
    description:
      "A genus of gut bacteria; the figure is its share of all the bacteria found.",
    labels: ["Pseudomonas spp.", "Pseudomonas species"],
    taxon: { ncbiTaxId: "286", scientificName: "Pseudomonas", rank: "genus" },
  }),
  organism({
    key: "mb-roseburia-spp",
    description:
      "A genus of gut bacteria; the figure is its share of all the bacteria found.",
    labels: ["Roseburia spp.", "Roseburia species"],
    taxon: { ncbiTaxId: "841", scientificName: "Roseburia", rank: "genus" },
  }),
  organism({
    key: "mb-ruminococcus-spp",
    description:
      "A genus of gut bacteria; the figure is its share of all the bacteria found.",
    labels: ["Ruminococcus spp.", "Ruminococcus species"],
    taxon: { ncbiTaxId: "1263", scientificName: "Ruminococcus", rank: "genus" },
  }),
  organism({
    key: "mb-saccharomyces-cerevisiae",
    description:
      "A yeast of the gut; the figure is its share of the flora found.",
    labels: ["Saccharomyces cerevisiae"],
    taxon: {
      ncbiTaxId: "4932",
      scientificName: "Saccharomyces cerevisiae",
      rank: "species",
    },
  }),
  organism({
    key: "mb-serratia-spp",
    description:
      "A genus of gut bacteria; the figure is its share of all the bacteria found.",
    labels: ["Serratia spp.", "Serratia species"],
    taxon: { ncbiTaxId: "613", scientificName: "Serratia", rank: "genus" },
  }),
  organism({
    key: "mb-streptococcus-spp",
    description:
      "A genus of gut bacteria; the figure is its share of all the bacteria found.",
    labels: ["Streptococcus spp.", "Streptococcus species"],
    taxon: {
      ncbiTaxId: "1301",
      scientificName: "Streptococcus",
      rank: "genus",
    },
  }),
  organism({
    key: "mb-sutterella-spp",
    description:
      "A genus of gut bacteria; the figure is its share of all the bacteria found.",
    labels: ["Sutterella spp.", "Sutterella species"],
    taxon: { ncbiTaxId: "40544", scientificName: "Sutterella", rank: "genus" },
  }),
  organism({
    key: "mb-tenericutes",
    description:
      "A phylum of the gut microbiome; the figure is its share of all the bacteria found.",
    labels: ["Tenericutes"],
    taxon: {
      ncbiTaxId: "544448",
      scientificName: "Mycoplasmatota",
      rank: "phylum",
    },
  }),
  organism({
    key: "mb-veillonella-spp",
    description:
      "A genus of gut bacteria; the figure is its share of all the bacteria found.",
    labels: ["Veillonella spp.", "Veillonella species"],
    taxon: { ncbiTaxId: "29465", scientificName: "Veillonella", rank: "genus" },
  }),
  organism({
    key: "mb-verrucomicrobia",
    description:
      "A phylum of the gut microbiome; the figure is its share of all the bacteria found.",
    labels: ["Verrucomicrobia"],
    taxon: {
      ncbiTaxId: "74201",
      scientificName: "Verrucomicrobiota",
      rank: "phylum",
    },
  }),
  {
    key: "stool-ph",
    description:
      "How acid or alkaline the stool is. The acids that gut bacteria produce lower it.",
    labels: ["Stuhl-pH-Wert", "Stuhl-pH", "pH-Wert Stuhl"],
    byUnit: {
      "[pH]": c("2755-7", "pH of Stool", "[pH]"),
    },
  },
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
      "umol/L": c(
        "22674-6",
        "Transferrin [Moles/volume] in Serum or Plasma",
        "umol/L",
      ),
    },
  },
  {
    key: "creatine-kinase",
    description:
      "An enzyme of muscle cells, heart muscle included, that enters the blood when muscle is strained or damaged.",
    labels: [
      "CK",
      "CK gesamt",
      "CK-NAC",
      "Creatinkinase",
      "Kreatinkinase",
      "Creatin-Kinase",
      "Creatine kinase",
    ],
    byUnit: {
      "U/L": c(
        "2157-6",
        "Creatine kinase [Enzymatic activity/volume] in Serum or Plasma",
        "U/L",
      ),
      "ukat/L": c(
        "2157-6",
        "Creatine kinase [Enzymatic activity/volume] in Serum or Plasma",
        "ukat/L",
      ),
    },
  },
  // ---- Blood pressure and pulse (FHIR R4 vital signs) ----
  // A single reading takes the vital-sign codes (8480-6, 8462-4, 8867-4). A
  // 24-hour ambulatory report prints means per period: LOINC codes the 24-hour
  // mean exactly (8490-5, 8472-3, 41924-2) and has only an undated "mean"
  // for day and night (96608-5, 96609-3, 103205-1), so those labels name the
  // period and the reader puts it on the line (abpm.swift). All verified
  // against NLM, 2026-10-05.
  ...vitalSign("systolic-bp", {
    description:
      "The pressure in the arteries while the heart contracts, the upper of the two blood pressure figures.",
    labels: [
      "Systolischer Blutdruck",
      "Blutdruck systolisch",
      "Systolisch",
      "Systolic blood pressure",
      "SYS",
    ],
    unit: "mm[Hg]",
    single: ["8480-6", "Systolic blood pressure"],
    day24: ["8490-5", "Systolic blood pressure 24 hour mean"],
    period: ["96608-5", "Systolic blood pressure mean"],
    base: "Systolischer Blutdruck",
  }),
  ...vitalSign("diastolic-bp", {
    description:
      "The pressure in the arteries while the heart relaxes between beats, the lower blood pressure figure.",
    labels: [
      "Diastolischer Blutdruck",
      "Blutdruck diastolisch",
      "Diastolisch",
      "Diastolic blood pressure",
      "DIA",
    ],
    unit: "mm[Hg]",
    single: ["8462-4", "Diastolic blood pressure"],
    day24: ["8472-3", "Diastolic blood pressure 24 hour mean"],
    period: ["96609-3", "Diastolic blood pressure mean"],
    base: "Diastolischer Blutdruck",
  }),
  ...vitalSign("heart-rate", {
    description: "How often the heart beats in a minute.",
    labels: ["Puls", "Herzfrequenz", "Pulsfrequenz", "Heart rate", "Pulse"],
    unit: "/min",
    single: ["8867-4", "Heart rate"],
    day24: ["41924-2", "Heart rate 24 hour mean"],
    period: ["103205-1", "Mean heart rate"],
    base: "Puls",
  }),
  ...vitalSign("mean-arterial-pressure", {
    description:
      "The average pressure in the arteries over one heartbeat, the pressure that perfuses the organs.",
    labels: [
      "Mittlerer arterieller Druck",
      "Arterieller Mitteldruck",
      "MAD",
      "MAP",
      "Mean arterial pressure",
    ],
    unit: "mm[Hg]",
    single: ["8478-0", "Mean blood pressure"],
    day24: ["8478-0", "Mean blood pressure"],
    period: ["8478-0", "Mean blood pressure"],
    base: "Mittlerer arterieller Druck",
  }),
  ...vitalSign("pulse-pressure", {
    description:
      "The difference between the systolic and the diastolic pressure.",
    labels: ["Pulsdruck", "Blutdruckamplitude", "PP", "Pulse pressure"],
    unit: "mm[Hg]",
    single: ["107146-3", "Pulse pressure"],
    day24: ["107146-3", "Pulse pressure"],
    period: ["107146-3", "Pulse pressure"],
    base: "Pulsdruck",
  }),
  {
    key: "nocturnal-dipping",
    description:
      "How far the blood pressure falls at night compared with the day, as a percentage of the day value. A fall of 10 to 20 percent is called dipping.",
    labels: [
      "Nächtliche Absenkung systolisch",
      "Nächtliche Absenkung diastolisch",
      "Nächtliche Absenkung Puls",
    ],
    byUnit: {
      "%": uncoded(
        "Nocturnal blood pressure dipping",
        "%",
        "LOINC has no term for the night-to-day fall an ambulatory blood pressure report computes.",
      ),
    },
  },
  // ---- Resting 12-lead electrocardiogram ----
  // The measurements an electrocardiograph prints above its tracing. The ECG
  // reader (Electrocardiogram.swift) names them with these labels; the
  // German "PQ" is the PR interval. All verified against NLM, 2026-10-11.
  {
    key: "ecg-ventricular-rate",
    description:
      "How often the ventricles beat in a minute, as the electrocardiograph counts the QRS complexes.",
    labels: ["Ventrikuläre Frequenz", "Kammerfrequenz", "Ventricular rate"],
    byUnit: {
      "/min": c("8897-1", "QRS complex Ventricles by EKG", "/min"),
    },
  },
  {
    key: "ecg-pr-interval",
    description:
      "The time from the start of the atrial beat to the start of the ventricular beat: how long the impulse takes to cross from atria to ventricles.",
    labels: ["PQ-Intervall", "PR-Intervall", "PQ-Zeit", "PR interval"],
    byUnit: { ms: c("8625-6", "P-R Interval", "ms") },
  },
  {
    key: "ecg-qrs-duration",
    description:
      "How long the electrical activation of the ventricles takes. A wide QRS can mean the impulse travels a slower route.",
    labels: ["QRS-Dauer", "QRS-Breite", "QRS duration"],
    byUnit: { ms: c("8633-0", "QRS duration", "ms") },
  },
  {
    key: "ecg-qt-interval",
    description:
      "The time from the start of ventricular activation to the end of its recovery. It shortens as the heart beats faster.",
    labels: ["QT-Intervall", "QT-Zeit", "QT interval"],
    byUnit: { ms: c("8634-8", "Q-T interval", "ms") },
  },
  {
    key: "ecg-qtc-bazett",
    description:
      "The QT interval corrected for heart rate by Bazett's formula, QT divided by the square root of the beat-to-beat interval, so readings at different rates can be compared.",
    labels: ["QTc nach Bazett", "QTc-Baz", "QTc Bazett"],
    byUnit: {
      ms: c("76635-2", "Q-T interval corrected based on Bazett formula", "ms"),
    },
  },
  {
    key: "ecg-p-axis",
    description:
      "The main direction of the atrial activation in the frontal plane, in degrees.",
    labels: ["P-Achse", "P axis"],
    byUnit: { deg: c("8626-4", "P wave axis", "deg") },
  },
  {
    key: "ecg-qrs-axis",
    description:
      "The main direction of the ventricular activation in the frontal plane, in degrees: the electrical heart axis.",
    labels: ["QRS-Achse", "R-Achse", "QRS axis"],
    byUnit: { deg: c("8632-2", "QRS axis", "deg") },
  },
  {
    key: "ecg-t-axis",
    description:
      "The main direction of the ventricular recovery in the frontal plane, in degrees.",
    labels: ["T-Achse", "T axis"],
    byUnit: { deg: c("8638-9", "T wave axis", "deg") },
  },
  // ---- Ambulatory ECG (Holter) ----
  // The summary a 24-hour ECG recorder prints. The Holter reader
  // (HolterReport.swift) names the values with these labels. LOINC codes the
  // 24-hour minimum, mean and maximum heart rate, the total beats and the
  // ventricular ectopic count; it has rates but no counts for supraventricular
  // ectopics and pauses, and no term for time spent above or below a rate
  // limit, so those are carried uncoded. Verified against NLM, 2026-10-11.
  {
    key: "heart-rate",
    labels: ["Herzfrequenz 24-h-Mittel"],
    byUnit: { "/min": c("41924-2", "Heart rate 24 hour mean", "/min") },
  },
  {
    key: "heart-rate-24h-min",
    description:
      "The slowest heart rate of a 24-hour recording, usually reached in sleep.",
    labels: ["Herzfrequenz 24-h-Minimum"],
    byUnit: { "/min": c("8883-1", "Heart rate 24 hour minimum", "/min") },
  },
  {
    key: "heart-rate-24h-max",
    description:
      "The fastest heart rate of a 24-hour recording, usually reached under exertion.",
    labels: ["Herzfrequenz 24-h-Maximum"],
    byUnit: { "/min": c("8873-2", "Heart rate 24 hour maximum", "/min") },
  },
  {
    key: "ecg-total-beats",
    description: "Every heartbeat the recorder counted over the recording.",
    labels: ["Herzschläge gesamt"],
    byUnit: { "{beats}": c("76637-8", "Total beats during EKG", "{beats}") },
  },
  {
    key: "ecg-recording-duration",
    description: "How long the recorder recorded.",
    labels: ["Aufzeichnungsdauer"],
    byUnit: { min: c("8618-1", "Recording duration by EKG", "min") },
  },
  {
    key: "ventricular-ectopics",
    description:
      "Extra beats starting in the ventricles, counted over the recording. A few are common in healthy hearts.",
    labels: ["Ventrikuläre Extrasystolen"],
    byUnit: {
      "{beats}": c(
        "76126-2",
        "Premature ventricular contractions [#]",
        "{beats}",
      ),
    },
  },
  {
    key: "supraventricular-ectopics",
    description:
      "Extra beats starting above the ventricles, counted over the recording. A few are common in healthy hearts.",
    labels: ["Supraventrikuläre Extrasystolen"],
    byUnit: {
      "{beats}": uncoded(
        "Premature atrial contractions [#]",
        "{beats}",
        "LOINC codes premature atrial contractions as a rate (8615-7), not as a count over a recording.",
      ),
    },
  },
  {
    key: "ecg-pauses",
    description:
      "Gaps between beats longer than the recorder's limit, counted over the recording.",
    labels: ["Pausen"],
    byUnit: {
      "{beats}": uncoded(
        "Pauses [#]",
        "{beats}",
        "LOINC codes pauses as a rate (8614-0), not as a count over a recording.",
      ),
    },
  },
  {
    key: "time-heart-rate-high",
    description:
      "How long the heart rate stayed at or above the recorder's tachycardia limit.",
    labels: ["Zeit über der Tachykardiegrenze"],
    byUnit: {
      min: uncoded(
        "Duration of heart rate at or above tachycardia limit",
        "min",
        "LOINC has no term for the time a recording spends above a heart rate limit.",
      ),
    },
  },
  {
    key: "time-heart-rate-low",
    description:
      "How long the heart rate stayed at or below the recorder's bradycardia limit.",
    labels: ["Zeit unter der Bradykardiegrenze"],
    byUnit: {
      min: uncoded(
        "Duration of heart rate at or below bradycardia limit",
        "min",
        "LOINC has no term for the time a recording spends below a heart rate limit.",
      ),
    },
  },
  {
    key: "ecg-artifacts",
    description: "The share of the recording the analysis could not use.",
    labels: ["Artefakte"],
    byUnit: {
      "%": uncoded(
        "Artifacts in ambulatory EKG recording",
        "%",
        "LOINC has no term for the share of a Holter recording lost to artefacts.",
      ),
    },
  },
  // ---- Exercise testing ----
  // A bicycle ergometry with ECG, a cardiopulmonary exercise test (CPET) and
  // a lactate test print their results in prose and in scattered columns;
  // their readers (ExerciseECG.swift, CardiopulmonaryExercise.swift,
  // LactateTest.swift) name the values with these labels. LOINC codes peak
  // power, peak oxygen uptake (absolute, per kilogram, per beat), the
  // ventilatory threshold, the exercise blood pressure and the resting and
  // peak heart rate; it has no terms for lactate thresholds, physical working
  // capacity or the ventilatory efficiency slope, so those are carried
  // uncoded. Verified against NLM, 2026-10-11.
  {
    key: "heart-rate-resting",
    description: "The heart rate at rest, before the exercise starts.",
    labels: ["Ruheherzfrequenz"],
    byUnit: { "/min": c("40443-4", "Heart rate --resting", "/min") },
  },
  {
    key: "heart-rate-exercise-max",
    description: "The highest heart rate reached during the exercise test.",
    labels: ["Maximale Herzfrequenz unter Belastung"],
    byUnit: { "/min": c("55422-0", "Heart rate Encounter maximum", "/min") },
  },
  {
    key: "exercise-peak-power",
    description: "The highest load the test reached, in watts.",
    labels: ["Maximale Belastung"],
    byUnit: { W: c("93342-4", "Power level --peak during exercise", "W") },
  },
  {
    key: "exercise-duration",
    description: "How long the load phase of the test lasted.",
    labels: ["Belastungsdauer"],
    byUnit: { min: c("55411-3", "Exercise duration", "min") },
  },
  {
    key: "systolic-bp-exercise",
    description:
      "The highest systolic blood pressure measured under load. It rises with the load in a healthy circulation.",
    labels: ["Systolischer Blutdruck unter Belastung, maximal"],
    byUnit: {
      "mm[Hg]": c("87739-9", "Systolic blood pressure--W exercise", "mm[Hg]"),
    },
  },
  {
    key: "diastolic-bp-exercise",
    description:
      "The diastolic blood pressure measured with the highest systolic one under load.",
    labels: ["Diastolischer Blutdruck unter Belastung"],
    byUnit: {
      "mm[Hg]": c("87740-7", "Diastolic blood pressure--W exercise", "mm[Hg]"),
    },
  },
  {
    key: "exercise-met-max",
    description:
      "The peak effort as a multiple of the energy used at rest (one MET).",
    labels: ["MET, maximal"],
    byUnit: {
      "{MET}": uncoded(
        "Metabolic equivalent at peak exercise",
        "{MET}",
        "LOINC codes MET only within activity panels, not as the peak of an exercise test.",
      ),
    },
  },
  ...[130, 150, 170].map((rate) => ({
    key: `pwc-${rate}`,
    description: `The load at which the heart rate reaches ${rate} beats per minute (physical working capacity).`,
    labels: [`PWC ${rate}`],
    byUnit: {
      W: uncoded(
        `Physical working capacity at heart rate ${rate}`,
        "W",
        "LOINC has no term for the physical working capacity of an ergometry.",
      ),
    },
  })),
  {
    key: "vo2-peak",
    description:
      "The most oxygen the body took up per minute at the peak of the test, the measure of aerobic capacity.",
    labels: ["Maximale Sauerstoffaufnahme"],
    byUnit: {
      "mL/min": c("103749-8", "Oxygen consumption (VO2) --peak", "mL/min"),
    },
  },
  {
    key: "vo2-peak-per-kg",
    description:
      "The peak oxygen uptake per kilogram of body weight, which makes people of different size comparable.",
    labels: ["Maximale Sauerstoffaufnahme pro kg"],
    byUnit: {
      "mL/min/kg": c(
        "94122-9",
        "Oxygen consumption (VO2)/Body weight [Volume Rate Content] --peak during exercise",
        "mL/min/kg",
      ),
    },
  },
  {
    key: "oxygen-pulse-peak",
    description:
      "The oxygen taken up per heartbeat at the peak of the test, a measure of how much blood the heart moves per beat.",
    labels: ["Sauerstoffpuls, maximal"],
    byUnit: {
      "mL/{beat}": c(
        "94120-3",
        "Oxygen consumption (VO2)/Heart rate --peak during exercise",
        "mL/{beat}",
      ),
    },
  },
  {
    key: "ventilatory-threshold-1",
    description:
      "The oxygen uptake per kilogram at the first ventilatory threshold, the point where breathing starts to rise faster than the load.",
    labels: ["Erste ventilatorische Schwelle pro kg"],
    byUnit: {
      "mL/min/kg": c(
        "94124-5",
        "Ventilatory threshold [Volume Rate Content]",
        "mL/min/kg",
      ),
    },
  },
  {
    key: "ventilatory-threshold-1-absolute",
    description:
      "The oxygen uptake per minute at the first ventilatory threshold.",
    labels: ["Erste ventilatorische Schwelle"],
    byUnit: {
      "mL/min": uncoded(
        "Oxygen consumption at the first ventilatory threshold",
        "mL/min",
        "LOINC codes the ventilatory threshold per kilogram of body weight (94124-5), not as an absolute uptake.",
      ),
    },
  },
  {
    key: "ve-vco2-slope",
    description:
      "How much air is breathed per litre of carbon dioxide produced, as the slope over the test: the ventilatory efficiency.",
    labels: ["VE/VCO2-Steigung"],
    byUnit: {
      "{ratio}": uncoded(
        "Minute ventilation/carbon dioxide production slope",
        "{ratio}",
        "LOINC codes VE/VCO2 as a ratio during exercise, not as the slope of the test.",
      ),
    },
  },
  {
    key: "breathing-reserve",
    description:
      "How much of the maximal voluntary ventilation was left unused at the peak of the test.",
    labels: ["Atemreserve"],
    byUnit: {
      "%": uncoded(
        "Breathing reserve at peak exercise",
        "%",
        "LOINC has no term for the breathing reserve of an exercise test.",
      ),
    },
  },
  {
    key: "minute-ventilation-peak",
    description: "The most air breathed per minute at the peak of the test.",
    labels: ["Atemminutenvolumen, maximal"],
    byUnit: {
      "L/min": uncoded(
        "Minute ventilation at peak exercise",
        "L/min",
        "LOINC has no term for the peak minute ventilation of an exercise test.",
      ),
    },
  },
  {
    key: "rer-peak",
    description:
      "Carbon dioxide given off per oxygen taken up at the peak of the test. Above 1.1 means the test went to exhaustion.",
    labels: ["Respiratorischer Quotient, maximal"],
    byUnit: {
      "{ratio}": uncoded(
        "Respiratory exchange ratio at peak exercise",
        "{ratio}",
        "LOINC's respiratory quotient (76269-0) is the cells' ratio at rest, not the exchange ratio measured at the mouth under load.",
      ),
    },
  },
  {
    key: "heart-rate-reserve",
    description:
      "How far the peak heart rate stayed below the predicted maximum.",
    labels: ["Herzfrequenzreserve"],
    byUnit: {
      "/min": uncoded(
        "Heart rate reserve at peak exercise",
        "/min",
        "LOINC has no term for the heart rate reserve of an exercise test.",
      ),
    },
  },
  {
    key: "heart-rate-recovery-1min",
    description:
      "How far the heart rate fell in the first minute after the load stopped. A large drop is a good sign.",
    labels: ["Herzfrequenzerholung nach 1 Minute"],
    byUnit: {
      "/min": uncoded(
        "Heart rate recovery 1 minute after exercise",
        "/min",
        "LOINC has no term for the heart rate recovery after an exercise test.",
      ),
    },
  },
  {
    key: "vo2-work-rate-slope",
    description:
      "How much more oxygen is taken up per watt of added load: the aerobic work efficiency.",
    labels: ["VO2/Leistung-Steigung"],
    byUnit: {
      "mL/min/W": uncoded(
        "Oxygen consumption/work rate slope",
        "mL/min/W",
        "LOINC has no term for the slope of oxygen uptake against load.",
      ),
    },
  },
  // ---- Lactate test ----
  ...(
    [
      [
        "lactate-threshold-power",
        "Leistung an der Laktatschwelle",
        "W",
        "The load at which lactate first rises above its resting level (lactate threshold, LT).",
      ],
      [
        "lactate-threshold-lactate",
        "Laktat an der Laktatschwelle",
        "mmol/L",
        "The lactate concentration at the lactate threshold.",
      ],
      [
        "lactate-threshold-heart-rate",
        "Herzfrequenz an der Laktatschwelle",
        "/min",
        "The heart rate at the lactate threshold.",
      ],
      [
        "anaerobic-threshold-power",
        "Leistung an der individuellen anaeroben Schwelle",
        "W",
        "The highest load that can be held for a long time without lactate piling up (individual anaerobic threshold, IAS).",
      ],
      [
        "anaerobic-threshold-power-per-kg",
        "Leistung an der individuellen anaeroben Schwelle pro kg",
        "W/kg",
        "The load at the individual anaerobic threshold per kilogram of body weight.",
      ],
      [
        "anaerobic-threshold-lactate",
        "Laktat an der individuellen anaeroben Schwelle",
        "mmol/L",
        "The lactate concentration at the individual anaerobic threshold.",
      ],
      [
        "anaerobic-threshold-heart-rate",
        "Herzfrequenz an der individuellen anaeroben Schwelle",
        "/min",
        "The heart rate at the individual anaerobic threshold, the usual anchor for training zones.",
      ],
      [
        "power-at-lactate-2",
        "Leistung bei 2 mmol/l Laktat",
        "W",
        "The load at which the lactate reaches 2 mmol/l.",
      ],
      [
        "heart-rate-at-lactate-2",
        "Herzfrequenz bei 2 mmol/l Laktat",
        "/min",
        "The heart rate at which the lactate reaches 2 mmol/l.",
      ],
      [
        "power-at-lactate-4",
        "Leistung bei 4 mmol/l Laktat",
        "W",
        "The load at which the lactate reaches 4 mmol/l, the classic threshold.",
      ],
      [
        "heart-rate-at-lactate-4",
        "Herzfrequenz bei 4 mmol/l Laktat",
        "/min",
        "The heart rate at which the lactate reaches 4 mmol/l.",
      ],
      [
        "vlamax",
        "Maximale glykolytische Leistung (VLaMax)",
        "mmol/L/s",
        "How fast the muscles can produce lactate at most: the capacity of the sugar-burning energy supply.",
      ],
      [
        "critical-power",
        "Critical Power",
        "W",
        "The load that could in theory be held for a very long time, from the power profile.",
      ],
      [
        "vo2-max-estimated",
        "Maximale Sauerstoffaufnahme (berechnet)",
        "L/min",
        "The aerobic capacity estimated from the lactate test, not measured from the breath.",
      ],
      [
        "vo2-max-estimated-per-kg",
        "Maximale Sauerstoffaufnahme pro kg (berechnet)",
        "mL/min/kg",
        "The estimated aerobic capacity per kilogram of body weight.",
      ],
    ] as const
  ).map(([key, label, unit, description]) => ({
    key,
    description,
    labels: [label],
    byUnit: {
      [unit]: uncoded(
        description.replace(/\.$/, ""),
        unit,
        "LOINC has no term for the thresholds and estimates a lactate test derives from its curve.",
      ),
    },
  })),
  // ---- Spirometry ----
  {
    key: "fvc",
    description:
      "The most air that can be blown out after breathing in fully (forced vital capacity).",
    labels: ["Forcierte Vitalkapazität", "FVC"],
    byUnit: {
      L: c(
        "19868-9",
        "Forced vital capacity [Volume] Respiratory system by Spirometry",
        "L",
      ),
    },
  },
  {
    key: "fev1",
    description: "The air blown out in the first second of a forced breath.",
    labels: ["Einsekundenkapazität", "FEV1"],
    byUnit: { L: c("20150-9", "FEV1", "L") },
  },
  {
    key: "fev1-fvc",
    description:
      "The share of the vital capacity blown out in the first second. A low share points to narrowed airways.",
    labels: ["FEV1/FVC", "Tiffeneau-Index"],
    byUnit: { "%": c("19926-5", "FEV1/FVC", "%") },
  },
  {
    key: "fef25-75",
    description: "The mean flow in the middle half of a forced breath.",
    labels: ["FEF25-75"],
    byUnit: { "L/s": c("19927-3", "Gas flow FEV 25%-75%", "L/s") },
  },
  {
    key: "pef",
    description: "The fastest flow of a forced breath (peak expiratory flow).",
    labels: ["Peak Expiratory Flow", "PEF"],
    byUnit: {
      "L/s": c(
        "33452-4",
        "Maximum expiratory gas flow Respiratory system airway",
        "L/s",
      ),
    },
  },
  // ---- Body composition by DXA ----
  // A whole-body DXA scan's tables, read by BodyComposition.swift. Fat mass
  // and fat share share the bioimpedance labels and codes above; the rest of
  // a DXA report has no LOINC term (no whole-body bone density, no lean soft
  // tissue, no android fat), and is carried uncoded. Its visceral fat is
  // the bioimpedance entry's: an area LOINC codes, a mass it does not.
  // Verified against NLM, 2026-10-11.
  {
    key: "lean-soft-tissue",
    description:
      "Everything in the body that is neither fat nor bone, as a DXA scan measures it: muscle, organs and water.",
    labels: ["Mager-Weichteilmasse"],
    byUnit: {
      kg: uncoded(
        "Lean soft tissue mass by DXA",
        "kg",
        "LOINC's lean body weight (88334-8) includes the bone; a DXA scan's lean mass does not.",
      ),
    },
  },
  {
    key: "bone-mineral-content",
    description: "The mass of mineral in the whole skeleton.",
    labels: ["Knochenmineralgehalt"],
    byUnit: {
      kg: uncoded(
        "Bone mineral content whole body by DXA",
        "kg",
        "LOINC has no term for the whole-body bone mineral content of a DXA scan.",
      ),
    },
  },
  {
    key: "android-fat",
    description:
      "The fat share around the waist. Fat stored there is linked to a higher risk for the heart and the metabolism.",
    labels: ["Android-Fettanteil"],
    byUnit: {
      "%": uncoded(
        "Android fat percentage by DXA",
        "%",
        "LOINC has no term for regional body fat.",
      ),
    },
  },
  {
    key: "gynoid-fat",
    description: "The fat share around the hips and thighs.",
    labels: ["Gynoid-Fettanteil"],
    byUnit: {
      "%": uncoded(
        "Gynoid fat percentage by DXA",
        "%",
        "LOINC has no term for regional body fat.",
      ),
    },
  },
  {
    key: "android-gynoid-ratio",
    description:
      "Waist fat share divided by hip fat share. Above 1, more of the fat sits at the waist.",
    labels: ["Android/Gynoid-Verhältnis"],
    byUnit: {
      "{ratio}": uncoded(
        "Android/gynoid fat ratio by DXA",
        "{ratio}",
        "LOINC has no term for regional body fat.",
      ),
    },
  },
  {
    key: "bmd-total-body",
    description:
      "The mineral density of the whole skeleton, in grams per square centimetre.",
    labels: ["Knochendichte Ganzkörper"],
    byUnit: {
      "g/cm2": uncoded(
        "Bone mineral density whole body by DXA",
        "g/cm2",
        "LOINC codes bone density by site (femur, hip, spine), not for the whole body.",
      ),
    },
  },
  {
    key: "bmd-total-body-t-score",
    description:
      "The whole-body bone density compared with young adults, in standard deviations.",
    labels: ["Knochendichte Ganzkörper, T-Wert"],
    byUnit: {
      "{SD}": uncoded(
        "Bone mineral density whole body T-score by DXA",
        "{SD}",
        "LOINC codes bone density by site (femur, hip, spine), not for the whole body.",
      ),
    },
  },
  {
    key: "bmd-total-body-z-score",
    description:
      "The whole-body bone density compared with people of the same age, in standard deviations.",
    labels: ["Knochendichte Ganzkörper, Z-Wert"],
    byUnit: {
      "{SD}": uncoded(
        "Bone mineral density whole body Z-score by DXA",
        "{SD}",
        "LOINC codes bone density by site (femur, hip, spine), not for the whole body.",
      ),
    },
  },
  {
    key: "rsmi",
    description:
      "The muscle mass of arms and legs per square metre of height (relative skeletal muscle index). Low values point to muscle loss.",
    labels: ["Relativer Skelettmuskelindex"],
    byUnit: {
      "kg/m2": uncoded(
        "Appendicular lean mass index by DXA",
        "kg/m2",
        "LOINC has no term for the appendicular lean mass index.",
      ),
    },
  },
  // ---- Continuous glucose monitoring ----
  {
    key: "glucose-mean-cgm",
    description:
      "The average of a glucose sensor's readings over the days it was worn.",
    labels: ["Durchschnittliche Glukose (Sensor)"],
    byUnit: {
      "mg/dL": c(
        "97507-8",
        "Average glucose [Mass/volume] in Interstitial fluid during Reporting Period",
        "mg/dL",
      ),
    },
  },
  // ---- Urine ----
  // The parser refuses a urine row unless "<name> im Urin" is a label here,
  // so serum albumin and urine albumin can never share a code. Every label
  // below names the urine.
  {
    key: "albumin-urine",
    description:
      "Albumin passed into the urine. Healthy kidneys hold almost all of it back.",
    labels: [
      "Albumin im Urin",
      "Albumin Urin",
      "Urin-Albumin",
      "Mikroalbumin",
      "Mikroalbumin im Urin",
    ],
    byUnit: {
      "mg/L": c("1754-1", "Albumin [Mass/volume] in Urine", "mg/L"),
      "mg/dL": c("1754-1", "Albumin [Mass/volume] in Urine", "mg/dL"),
    },
  },
  {
    key: "creatinine-urine",
    description:
      "Creatinine in the urine, the reference a urine albumin is read against because it corrects for how concentrated the urine is.",
    labels: [
      "Kreatinin im Urin",
      "Kreatinin Urin",
      "Urin-Kreatinin",
      "Creatinin im Urin",
    ],
    byUnit: {
      "mg/dL": c("2161-8", "Creatinine [Mass/volume] in Urine", "mg/dL"),
      "mmol/L": c("14683-7", "Creatinine [Moles/volume] in Urine", "mmol/L"),
      "umol/L": c("14683-7", "Creatinine [Moles/volume] in Urine", "umol/L"),
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
// Unique: one analyte may have several definitions, an analyser's and a
// microscope's count, or vitamin D in total and D3 alone.
export const ANALYTE_KEYS: readonly string[] = [
  ...new Set(DEFINITIONS.map((d) => d.key)),
];

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
  "mb-acetat-und-propionatproduktion":
    "Der Anteil der gefundenen Bakterien, die Essigsäure und Propionsäure bilden.",
  "ratio-tg-hdl":
    "Triglyzeride geteilt durch HDL-Cholesterin, beide in mg/dl. Der veröffentlichte Grenzwert ist in dieser Einheit angegeben, deshalb wird ein in mmol/l gedrucktes Lipidprofil vor dem Teilen umgerechnet; sonst unterschiede sich die Zahl um etwa den Faktor 2,3.",
  "ratio-ldl-hdl": "LDL-Cholesterin geteilt durch HDL-Cholesterin.",
  "ratio-apob-apoa1":
    "Apolipoprotein B geteilt durch Apolipoprotein A1: die Partikel, die Cholesterin ablagern, gegen die, die es abtransportieren.",
  "cholesterol-remnant":
    "Gesamtcholesterin minus HDL minus LDL: was in den triglyzeridreichen Partikeln und ihren Resten transportiert wird.",
  "mb-actinobacteria":
    "Ein Bakterienstamm des Darmmikrobioms; angegeben ist sein Anteil an allen gefundenen Bakterien.",
  "mb-akkermansia-muciniphila":
    "Eine Art, die von der Schleimschicht des Darms lebt.",
  "mb-alistipes-spp":
    "Eine Bakteriengattung des Darms; angegeben ist ihr Anteil an allen gefundenen Bakterien.",
  "mb-anaerotruncus-colihominis":
    "Eine Bakterienart des Darms; angegeben ist ihr Anteil an allen gefundenen Bakterien.",
  "mb-bacteroides-spp":
    "Eine Bakteriengattung des Darms; angegeben ist ihr Anteil an allen gefundenen Bakterien.",
  "mb-bacteroides-vulgatus":
    "Eine Bakterienart des Darms; angegeben ist ihr Anteil an allen gefundenen Bakterien.",
  "mb-bacteroidetes":
    "Ein Bakterienstamm des Darmmikrobioms; angegeben ist sein Anteil an allen gefundenen Bakterien.",
  "mb-bifidobacterium-adolescentis":
    "Eine Bakterienart des Darms; angegeben ist ihr Anteil an allen gefundenen Bakterien.",
  "mb-bifidobacterium-dentium":
    "Eine Bakterienart des Darms; angegeben ist ihr Anteil an allen gefundenen Bakterien.",
  "mb-bifidobacterium-spp":
    "Eine Bakteriengattung des Darms; angegeben ist ihr Anteil an allen gefundenen Bakterien.",
  "mb-bilophila-wadsworthia":
    "Eine gallensäuretolerante, sulfatreduzierende Art.",
  "mb-butyratproduktion":
    "Der Anteil der gefundenen Bakterien, die Buttersäure bilden.",
  "mb-butyrivibrio-crossotus":
    "Eine Bakterienart des Darms; angegeben ist ihr Anteil an allen gefundenen Bakterien.",
  "mb-candida-albicans":
    "Ein Hefepilz des Darms; angegeben ist sein Anteil an der gefundenen Flora.",
  "mb-candida-spp":
    "Ein Hefepilz des Darms; angegeben ist sein Anteil an der gefundenen Flora.",
  "mb-citrobacter-spp":
    "Eine Bakteriengattung des Darms; angegeben ist ihr Anteil an allen gefundenen Bakterien.",
  "mb-clostridium-difficile":
    "Eine Art, die nach einer Antibiotikatherapie überhandnehmen kann.",
  "mb-clostridium-scindens":
    "Eine Bakterienart des Darms; angegeben ist ihr Anteil an allen gefundenen Bakterien.",
  "mb-clostridium-spp":
    "Eine Bakteriengattung des Darms; angegeben ist ihr Anteil an allen gefundenen Bakterien.",
  "mb-cyanobacteria":
    "Ein Bakterienstamm des Darmmikrobioms; angegeben ist sein Anteil an allen gefundenen Bakterien.",
  "mb-desulfobacter-spp":
    "Eine Bakteriengattung des Darms; angegeben ist ihr Anteil an allen gefundenen Bakterien.",
  "mb-desulfovibrio-spp":
    "Eine Bakteriengattung des Darms; angegeben ist ihr Anteil an allen gefundenen Bakterien.",
  "mb-desulfuromonas-spp":
    "Eine Bakteriengattung des Darms; angegeben ist ihr Anteil an allen gefundenen Bakterien.",
  "mb-dorea-spp":
    "Eine Bakteriengattung des Darms; angegeben ist ihr Anteil an allen gefundenen Bakterien.",
  "mb-enterobacter-spp":
    "Eine Bakteriengattung des Darms; angegeben ist ihr Anteil an allen gefundenen Bakterien.",
  "mb-enterococcus-spp":
    "Eine Bakteriengattung des Darms; angegeben ist ihr Anteil an allen gefundenen Bakterien.",
  "mb-escherichia-spp":
    "Eine Bakteriengattung des Darms; angegeben ist ihr Anteil an allen gefundenen Bakterien.",
  "mb-eubacterium-spp":
    "Eine Bakteriengattung des Darms; angegeben ist ihr Anteil an allen gefundenen Bakterien.",
  "mb-euryarchaeota":
    "Ein Bakterienstamm des Darmmikrobioms; angegeben ist sein Anteil an allen gefundenen Bakterien.",
  "mb-faecalibacterium-prausnitzii":
    "Eine der häufigsten buttersäurebildenden Arten des Dickdarms.",
  "mb-firmicutes":
    "Ein Bakterienstamm des Darmmikrobioms; angegeben ist sein Anteil an allen gefundenen Bakterien.",
  "mb-fusobacteria":
    "Ein Bakterienstamm des Darmmikrobioms; angegeben ist sein Anteil an allen gefundenen Bakterien.",
  "mb-fusobacterium-nucleatum":
    "Eine Bakterienart des Darms; angegeben ist ihr Anteil an allen gefundenen Bakterien.",
  "mb-geotrichum-candidum":
    "Ein Hefepilz des Darms; angegeben ist sein Anteil an der gefundenen Flora.",
  "mb-hafnia-alveii":
    "Eine Bakterienart des Darms; angegeben ist ihr Anteil an allen gefundenen Bakterien.",
  "mb-klebsiella-spp":
    "Eine Bakteriengattung des Darms; angegeben ist ihr Anteil an allen gefundenen Bakterien.",
  "mb-lps-tragende-bakterien":
    "Der Anteil der gefundenen Bakterien, die Lipopolysaccharid in ihrer Zellwand tragen.",
  "mb-lactobacillus-brevis":
    "Eine Bakterienart des Darms; angegeben ist ihr Anteil an allen gefundenen Bakterien.",
  "mb-lactobacillus-paracasei":
    "Eine Bakterienart des Darms; angegeben ist ihr Anteil an allen gefundenen Bakterien.",
  "mb-lactobacillus-plantarum":
    "Eine Bakterienart des Darms; angegeben ist ihr Anteil an allen gefundenen Bakterien.",
  "mb-lactobacillus-spp":
    "Eine Bakteriengattung des Darms; angegeben ist ihr Anteil an allen gefundenen Bakterien.",
  "mb-laktatproduktion":
    "Der Anteil der gefundenen Bakterien, die Milchsäure bilden.",
  "mb-methanobacteria":
    "Eine Bakterienart des Darms; angegeben ist ihr Anteil an allen gefundenen Bakterien.",
  "mb-methanobrevibacter-spp":
    "Eine Bakteriengattung des Darms; angegeben ist ihr Anteil an allen gefundenen Bakterien.",
  "mb-mucindegradation":
    "Der Anteil der gefundenen Bakterien, die die Schleimschicht des Darms abbauen.",
  "mb-oscillibacter-spp":
    "Eine Bakteriengattung des Darms; angegeben ist ihr Anteil an allen gefundenen Bakterien.",
  "mb-oxalobacter-formigenes":
    "Eine Bakterienart des Darms; angegeben ist ihr Anteil an allen gefundenen Bakterien.",
  "mb-prevotella-copri":
    "Eine Art, die mit ballaststoffreicher Ernährung in Verbindung gebracht wird.",
  "mb-prevotella-spp":
    "Eine Bakteriengattung des Darms; angegeben ist ihr Anteil an allen gefundenen Bakterien.",
  "mb-proteobacteria":
    "Ein Bakterienstamm des Darmmikrobioms; angegeben ist sein Anteil an allen gefundenen Bakterien.",
  "mb-providencia-spp":
    "Eine Bakteriengattung des Darms; angegeben ist ihr Anteil an allen gefundenen Bakterien.",
  "mb-pseudomonas-spp":
    "Eine Bakteriengattung des Darms; angegeben ist ihr Anteil an allen gefundenen Bakterien.",
  "mb-roseburia-spp":
    "Eine Bakteriengattung des Darms; angegeben ist ihr Anteil an allen gefundenen Bakterien.",
  "mb-ruminococcus-spp":
    "Eine Bakteriengattung des Darms; angegeben ist ihr Anteil an allen gefundenen Bakterien.",
  "mb-saccharomyces-cerevisiae":
    "Ein Hefepilz des Darms; angegeben ist sein Anteil an der gefundenen Flora.",
  "mb-serratia-spp":
    "Eine Bakteriengattung des Darms; angegeben ist ihr Anteil an allen gefundenen Bakterien.",
  "mb-streptococcus-spp":
    "Eine Bakteriengattung des Darms; angegeben ist ihr Anteil an allen gefundenen Bakterien.",
  "mb-sutterella-spp":
    "Eine Bakteriengattung des Darms; angegeben ist ihr Anteil an allen gefundenen Bakterien.",
  "mb-tenericutes":
    "Ein Bakterienstamm des Darmmikrobioms; angegeben ist sein Anteil an allen gefundenen Bakterien.",
  "mb-veillonella-spp":
    "Eine Bakteriengattung des Darms; angegeben ist ihr Anteil an allen gefundenen Bakterien.",
  "mb-verrucomicrobia":
    "Ein Bakterienstamm des Darmmikrobioms; angegeben ist sein Anteil an allen gefundenen Bakterien.",
  "stool-ph":
    "Wie sauer oder basisch der Stuhl ist. Die Säuren, die Darmbakterien bilden, senken ihn.",
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
  "systolic-bp":
    "Der Druck in den Arterien, während das Herz sich zusammenzieht, der obere der beiden Blutdruckwerte.",
  "diastolic-bp":
    "Der Druck in den Arterien, während das Herz zwischen zwei Schlägen erschlafft, der untere Blutdruckwert.",
  "heart-rate": "Wie oft das Herz in einer Minute schlägt.",
  "mean-arterial-pressure":
    "Der mittlere Druck in den Arterien über einen Herzschlag, der Druck, mit dem die Organe durchblutet werden.",
  "pulse-pressure":
    "Der Unterschied zwischen systolischem und diastolischem Druck.",
  "nocturnal-dipping":
    "Wie weit der Blutdruck nachts gegenüber dem Tag absinkt, in Prozent des Tageswerts. Eine Absenkung um 10 bis 20 Prozent heißt Dipping.",
  "ecg-ventricular-rate":
    "Wie oft die Herzkammern in einer Minute schlagen, gezählt an den QRS-Komplexen des EKG.",
  "ecg-pr-interval":
    "Die Zeit vom Beginn der Vorhoferregung bis zum Beginn der Kammererregung: wie lange die Erregung von den Vorhöfen zu den Kammern braucht.",
  "ecg-qrs-duration":
    "Wie lange die elektrische Erregung der Herzkammern dauert. Ein breiter QRS-Komplex kann heißen, dass die Erregung einen langsameren Weg nimmt.",
  "ecg-qt-interval":
    "Die Zeit vom Beginn der Kammererregung bis zum Ende ihrer Rückbildung. Sie wird kürzer, je schneller das Herz schlägt.",
  "ecg-qtc-bazett":
    "Das QT-Intervall, nach der Formel von Bazett auf die Herzfrequenz korrigiert (QT geteilt durch die Wurzel des Schlagabstands), damit Messungen bei verschiedener Frequenz vergleichbar sind.",
  "ecg-p-axis":
    "Die Hauptrichtung der Vorhoferregung in der Frontalebene, in Grad.",
  "ecg-qrs-axis":
    "Die Hauptrichtung der Kammererregung in der Frontalebene, in Grad: die elektrische Herzachse.",
  "ecg-t-axis":
    "Die Hauptrichtung der Erregungsrückbildung der Kammern in der Frontalebene, in Grad.",
  "glucose-fasting":
    "Der Blutzucker nach mindestens acht Stunden ohne Essen, der Wert, für den die Diabetes-Grenzen angegeben sind.",
  holotranscobalamin:
    "Der Anteil des Vitamin B12, der an das Transportprotein gebunden ist, das es in die Zellen bringt, oft aktives B12 genannt.",
  manganese: "Ein Spurenelement, das mehrere Enzyme brauchen.",
  selenium:
    "Ein Spurenelement für die Enzyme, die Zellen vor Oxidation schützen, und für die Schilddrüse.",
  "vitamin-b6-blood":
    "Vitamin B6 im Vollblut, als Pyridoxalphosphat, die Form, die der Körper nutzt.",
  "hbs-antibody":
    "Antikörper gegen das Oberflächenantigen des Hepatitis-B-Virus, das Maß für den Schutz nach einer Impfung oder einer früheren Infektion.",
  "magnesium-rbc":
    "Magnesium in den roten Blutkörperchen, wo der Körper den Großteil seines Magnesiums hält. Kann einen Mangel zeigen, den der Serumwert übersieht.",
  epa: "Eicosapentaensäure, eine Omega-3-Fettsäure aus fettem Fisch, gemessen in den roten Blutkörperchen.",
  dha: "Docosahexaensäure, eine Omega-3-Fettsäure aus fettem Fisch, gemessen in den roten Blutkörperchen.",
  "omega-3-index":
    "EPA und DHA zusammen als Anteil an allen Fettsäuren der Membranen der roten Blutkörperchen.",
  "fatty-acids-total-rbc": "Alle Fettsäuren der roten Blutkörperchen zusammen.",
  "heart-rate-24h-min":
    "Die langsamste Herzfrequenz einer 24-Stunden-Aufzeichnung, meist im Schlaf erreicht.",
  "heart-rate-24h-max":
    "Die schnellste Herzfrequenz einer 24-Stunden-Aufzeichnung, meist unter Belastung erreicht.",
  "ecg-total-beats":
    "Alle Herzschläge, die der Rekorder während der Aufzeichnung gezählt hat.",
  "ecg-recording-duration": "Wie lange der Rekorder aufgezeichnet hat.",
  "ventricular-ectopics":
    "Zusätzliche Schläge aus den Herzkammern, über die Aufzeichnung gezählt. Einige sind auch bei gesunden Herzen üblich.",
  "supraventricular-ectopics":
    "Zusätzliche Schläge von oberhalb der Herzkammern, über die Aufzeichnung gezählt. Einige sind auch bei gesunden Herzen üblich.",
  "ecg-pauses":
    "Lücken zwischen zwei Schlägen, länger als die Grenze des Rekorders, über die Aufzeichnung gezählt.",
  "time-heart-rate-high":
    "Wie lange die Herzfrequenz an oder über der Tachykardiegrenze des Rekorders lag.",
  "time-heart-rate-low":
    "Wie lange die Herzfrequenz an oder unter der Bradykardiegrenze des Rekorders lag.",
  "ecg-artifacts":
    "Der Anteil der Aufzeichnung, den die Auswertung nicht nutzen konnte.",
  "creatine-kinase":
    "Ein Enzym der Muskelzellen, auch des Herzmuskels, das ins Blut übertritt, wenn Muskeln beansprucht oder geschädigt werden.",
  "albumin-urine":
    "Albumin, das in den Urin gelangt. Gesunde Nieren halten fast alles davon zurück.",
  "creatinine-urine":
    "Kreatinin im Urin, die Bezugsgröße für ein Urin-Albumin, weil es ausgleicht, wie konzentriert der Urin ist.",
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
  "heart-rate-resting":
    "Die Herzfrequenz in Ruhe, bevor die Belastung beginnt.",
  "heart-rate-exercise-max":
    "Die höchste Herzfrequenz, die während des Belastungstests erreicht wurde.",
  "exercise-peak-power":
    "Die höchste Belastung, die der Test erreicht hat, in Watt.",
  "exercise-duration": "Wie lange die Belastungsphase des Tests gedauert hat.",
  "systolic-bp-exercise":
    "Der höchste systolische Blutdruck unter Belastung. Bei gesundem Kreislauf steigt er mit der Belastung.",
  "diastolic-bp-exercise":
    "Der diastolische Blutdruck, gemessen zusammen mit dem höchsten systolischen unter Belastung.",
  "exercise-met-max":
    "Die höchste Leistung als Vielfaches des Energieumsatzes in Ruhe (ein MET).",
  "pwc-130":
    "Die Belastung, bei der die Herzfrequenz 130 Schläge pro Minute erreicht (physical working capacity).",
  "pwc-150":
    "Die Belastung, bei der die Herzfrequenz 150 Schläge pro Minute erreicht (physical working capacity).",
  "pwc-170":
    "Die Belastung, bei der die Herzfrequenz 170 Schläge pro Minute erreicht (physical working capacity).",
  "vo2-peak":
    "Die größte Sauerstoffmenge, die der Körper an der Belastungsspitze pro Minute aufgenommen hat, das Maß der Ausdauerleistungsfähigkeit.",
  "vo2-peak-per-kg":
    "Die maximale Sauerstoffaufnahme pro Kilogramm Körpergewicht, womit Menschen verschiedener Größe vergleichbar werden.",
  "oxygen-pulse-peak":
    "Der Sauerstoff, der an der Belastungsspitze pro Herzschlag aufgenommen wird, ein Maß dafür, wie viel Blut das Herz pro Schlag fördert.",
  "ventilatory-threshold-1":
    "Die Sauerstoffaufnahme pro Kilogramm an der ersten ventilatorischen Schwelle, dem Punkt, ab dem die Atmung schneller steigt als die Belastung.",
  "ventilatory-threshold-1-absolute":
    "Die Sauerstoffaufnahme pro Minute an der ersten ventilatorischen Schwelle.",
  "ve-vco2-slope":
    "Wie viel Luft pro Liter abgegebenem Kohlendioxid geatmet wird, als Steigung über den Test: die Atemeffizienz.",
  "breathing-reserve":
    "Welcher Anteil der maximal möglichen Atmung an der Belastungsspitze ungenutzt blieb.",
  "minute-ventilation-peak":
    "Die größte Luftmenge, die an der Belastungsspitze pro Minute geatmet wurde.",
  "rer-peak":
    "Abgegebenes Kohlendioxid pro aufgenommenem Sauerstoff an der Belastungsspitze. Über 1,1 heißt, der Test ging bis zur Ausbelastung.",
  "heart-rate-reserve":
    "Wie weit die höchste Herzfrequenz unter dem vorhergesagten Maximum blieb.",
  "heart-rate-recovery-1min":
    "Wie weit die Herzfrequenz in der ersten Minute nach dem Ende der Belastung gefallen ist. Ein großer Abfall ist ein gutes Zeichen.",
  "vo2-work-rate-slope":
    "Wie viel mehr Sauerstoff pro Watt zusätzlicher Belastung aufgenommen wird: die aerobe Arbeitseffizienz.",
  "lactate-threshold-power":
    "Die Belastung, ab der das Laktat erstmals über den Ruhewert steigt (Laktatschwelle, LT).",
  "lactate-threshold-lactate": "Die Laktatkonzentration an der Laktatschwelle.",
  "lactate-threshold-heart-rate": "Die Herzfrequenz an der Laktatschwelle.",
  "anaerobic-threshold-power":
    "Die höchste Belastung, die lange gehalten werden kann, ohne dass sich Laktat anhäuft (individuelle anaerobe Schwelle, IAS).",
  "anaerobic-threshold-power-per-kg":
    "Die Belastung an der individuellen anaeroben Schwelle pro Kilogramm Körpergewicht.",
  "anaerobic-threshold-lactate":
    "Die Laktatkonzentration an der individuellen anaeroben Schwelle.",
  "anaerobic-threshold-heart-rate":
    "Die Herzfrequenz an der individuellen anaeroben Schwelle, der übliche Anker für Trainingsbereiche.",
  "power-at-lactate-2": "Die Belastung, bei der das Laktat 2 mmol/l erreicht.",
  "heart-rate-at-lactate-2":
    "Die Herzfrequenz, bei der das Laktat 2 mmol/l erreicht.",
  "power-at-lactate-4":
    "Die Belastung, bei der das Laktat 4 mmol/l erreicht, die klassische Schwelle.",
  "heart-rate-at-lactate-4":
    "Die Herzfrequenz, bei der das Laktat 4 mmol/l erreicht.",
  vlamax:
    "Wie schnell die Muskulatur höchstens Laktat bilden kann: die Kapazität der Energiegewinnung aus Zucker.",
  "critical-power":
    "Die Belastung, die sich theoretisch sehr lange halten ließe, aus dem Leistungsprofil.",
  "vo2-max-estimated":
    "Die Ausdauerleistungsfähigkeit, aus dem Laktattest geschätzt, nicht aus der Atemluft gemessen.",
  "vo2-max-estimated-per-kg":
    "Die geschätzte maximale Sauerstoffaufnahme pro Kilogramm Körpergewicht.",
  fvc: "Die größte Luftmenge, die nach vollem Einatmen ausgeatmet werden kann (forcierte Vitalkapazität).",
  fev1: "Die Luft, die in der ersten Sekunde eines forcierten Atemstoßes ausgeatmet wird.",
  "fev1-fvc":
    "Der Anteil der Vitalkapazität, der in der ersten Sekunde ausgeatmet wird. Ein niedriger Anteil spricht für verengte Atemwege.",
  "fef25-75":
    "Der mittlere Fluss in der mittleren Hälfte eines forcierten Atemstoßes.",
  pef: "Der schnellste Fluss eines forcierten Atemstoßes (Spitzenfluss).",
  "lean-soft-tissue":
    "Alles im Körper, was weder Fett noch Knochen ist, wie ein DXA-Scan es misst: Muskeln, Organe und Wasser.",
  "bone-mineral-content": "Die Masse des Minerals im ganzen Skelett.",
  "android-fat":
    "Der Fettanteil um die Taille. Dort gespeichertes Fett geht mit einem höheren Risiko für Herz und Stoffwechsel einher.",
  "gynoid-fat": "Der Fettanteil um Hüften und Oberschenkel.",
  "android-gynoid-ratio":
    "Fettanteil der Taille geteilt durch den der Hüfte. Über 1 sitzt mehr Fett an der Taille.",
  "bmd-total-body":
    "Die Mineraldichte des ganzen Skeletts, in Gramm pro Quadratzentimeter.",
  "bmd-total-body-t-score":
    "Die Knochendichte des ganzen Körpers im Vergleich mit jungen Erwachsenen, in Standardabweichungen.",
  "bmd-total-body-z-score":
    "Die Knochendichte des ganzen Körpers im Vergleich mit Gleichaltrigen, in Standardabweichungen.",
  rsmi: "Die Muskelmasse von Armen und Beinen pro Quadratmeter Körpergröße (relativer Skelettmuskelindex). Niedrige Werte sprechen für Muskelschwund.",
  "glucose-mean-cgm":
    "Der Durchschnitt der Messwerte eines Glukosesensors über die Tage, an denen er getragen wurde.",
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

/**
 * FHIR's observation category for the codes that are not laboratory tests.
 * Every other coded value is `laboratory`.
 *
 * - `vital-signs`: blood pressure, pulse and body measurements, the codes of
 *   the FHIR vital signs profile and the 24-hour and period means of an
 *   ambulatory recording.
 * - `procedure`: what an electrocardiogram measures, resting or over 24
 *   hours, and what an exercise test or a spirometry measures. FHIR files
 *   electrodiagnostics and function tests under procedure. A report whose
 *   procedure values are all ECG measurements (ELECTROCARDIOGRAM_CODES) and
 *   that holds no laboratory value is an ECG, and the writers say so on the
 *   DiagnosticReport too (v2-0074 `EC`, LOINC 11524-6 "EKG study", or
 *   18754-2 for a Holter study, told by its total beat count).
 * - `imaging`: what a DXA scan measures beyond body fat.
 *
 * Keyed by LOINC code, and by analyte key for a value LOINC does not code.
 *
 * Generated into Swift (`Analytes.observationCategories`), so the phone's
 * writer and this one read the same table.
 */
export const OBSERVATION_CATEGORIES: Readonly<
  Record<string, "vital-signs" | "procedure" | "imaging">
> = {
  "8480-6": "vital-signs",
  "8462-4": "vital-signs",
  "8867-4": "vital-signs",
  "8490-5": "vital-signs",
  "8472-3": "vital-signs",
  "41924-2": "vital-signs",
  "96608-5": "vital-signs",
  "96609-3": "vital-signs",
  "103205-1": "vital-signs",
  "8478-0": "vital-signs",
  "107146-3": "vital-signs",
  "8302-2": "vital-signs",
  "29463-7": "vital-signs",
  "39156-5": "vital-signs",
  "8897-1": "procedure",
  "8625-6": "procedure",
  "8633-0": "procedure",
  "8634-8": "procedure",
  "76635-2": "procedure",
  "8626-4": "procedure",
  "8632-2": "procedure",
  "8638-9": "procedure",
  "8883-1": "procedure",
  "8873-2": "procedure",
  "76637-8": "procedure",
  "8618-1": "procedure",
  "76126-2": "procedure",
  // Uncoded values carry their analyte key instead of a code.
  "supraventricular-ectopics": "procedure",
  "ecg-pauses": "procedure",
  "time-heart-rate-high": "procedure",
  "time-heart-rate-low": "procedure",
  "ecg-artifacts": "procedure",
  // Exercise testing and spirometry: procedures, like the ECG.
  "40443-4": "procedure",
  "55422-0": "procedure",
  "93342-4": "procedure",
  "55411-3": "procedure",
  "87739-9": "procedure",
  "87740-7": "procedure",
  "103749-8": "procedure",
  "94122-9": "procedure",
  "94120-3": "procedure",
  "94124-5": "procedure",
  "19868-9": "procedure",
  "20150-9": "procedure",
  "19926-5": "procedure",
  "19927-3": "procedure",
  "33452-4": "procedure",
  "exercise-met-max": "procedure",
  "pwc-130": "procedure",
  "pwc-150": "procedure",
  "pwc-170": "procedure",
  "ventilatory-threshold-1-absolute": "procedure",
  "ve-vco2-slope": "procedure",
  "breathing-reserve": "procedure",
  "minute-ventilation-peak": "procedure",
  "rer-peak": "procedure",
  "heart-rate-reserve": "procedure",
  "heart-rate-recovery-1min": "procedure",
  "vo2-work-rate-slope": "procedure",
  "lactate-threshold-power": "procedure",
  "lactate-threshold-lactate": "procedure",
  "lactate-threshold-heart-rate": "procedure",
  "anaerobic-threshold-power": "procedure",
  "anaerobic-threshold-power-per-kg": "procedure",
  "anaerobic-threshold-lactate": "procedure",
  "anaerobic-threshold-heart-rate": "procedure",
  "power-at-lactate-2": "procedure",
  "heart-rate-at-lactate-2": "procedure",
  "power-at-lactate-4": "procedure",
  "heart-rate-at-lactate-4": "procedure",
  vlamax: "procedure",
  "critical-power": "procedure",
  "vo2-max-estimated": "procedure",
  "vo2-max-estimated-per-kg": "procedure",
  // A DXA scan is an X-ray, so its own values are imaging. Its fat mass and
  // share (73708-0, 41982-0) are the codes a scale's reading carries too,
  // and the code cannot tell the two devices apart, so they stay as they are.
  "lean-soft-tissue": "imaging",
  "bone-mineral-content": "imaging",
  "android-fat": "imaging",
  "gynoid-fat": "imaging",
  "android-gynoid-ratio": "imaging",
  "bmd-total-body": "imaging",
  "bmd-total-body-t-score": "imaging",
  "bmd-total-body-z-score": "imaging",
  rsmi: "imaging",
};

/**
 * The measurements that make a report an ECG: a resting ECG's intervals and
 * axes and a Holter recording's summary. Keyed like OBSERVATION_CATEGORIES.
 *
 * An exercise test is filed under procedure too, and an ergometry counts
 * ventricular ectopics as a Holter does; without this list a cycle test
 * would be exported as an "EKG study". A report is an ECG only when every
 * procedure value it holds is one of these.
 *
 * Generated into Swift (`Analytes.electrocardiogramCodes`).
 */
export const ELECTROCARDIOGRAM_CODES: readonly string[] = [
  "8897-1",
  "8625-6",
  "8633-0",
  "8634-8",
  "76635-2",
  "8626-4",
  "8632-2",
  "8638-9",
  "8883-1",
  "8873-2",
  "76637-8",
  "8618-1",
  "76126-2",
  "supraventricular-ectopics",
  "ecg-pauses",
  "time-heart-rate-high",
  "time-heart-rate-low",
  "ecg-artifacts",
];

/**
 * Units as printed, as UCUM codes (#1214).
 *
 * A FHIR Quantity with `system` http://unitsofmeasure.org says its `code` is
 * UCUM. The graph holds units two ways: the UCUM code the shared FHIR writer
 * (services/epa-ingest, normaliseUnit) and the seeds write (`mg/dL`,
 * `mm[Hg]`), and the unit as a laboratory printed it (`mg/dl`, `Tsd/µl`,
 * `mmHg`). Writing the printed text as the code tells a receiver something
 * that is not UCUM is, and a validator with a terminology server refuses it.
 *
 * So a quantity carries the printed text in `unit` and, only when the unit
 * maps to UCUM here, `system` and `code`. A unit this table does not know
 * stays text, with no `system` and no `code`: an uncoded unit is honest, a
 * wrong code is not. The table never converts a value, only names its unit.
 *
 * The printed spellings agree with epa-ingest's normaliseUnit, which a test
 * checks (ui/__tests__/unit/lib/ucum.test.ts). The neo4j-proxy is built on
 * its own and holds a byte-identical copy of this file,
 * services/neo4j-proxy/src/ucum.ts; its test fails when the two differ.
 */

export const UCUM = "http://unitsofmeasure.org";

/**
 * UCUM codes the hub's data holds as they are written: every code the shared
 * FHIR writer emits, and the codes of the seeds, the Synthea sample and the
 * Klarbefund app. Case matters in UCUM, so these match exactly.
 */
const CODES: ReadonlySet<string> = new Set([
  // Mass and substance concentrations, ratios of them
  "mg/dL",
  "mg/L",
  "g/dL",
  "g/L",
  "ug/dL",
  "ug/L",
  "ug/mL",
  "ng/dL",
  "ng/mL",
  "ng/L",
  "pg/mL",
  "mmol/L",
  "umol/L",
  "nmol/L",
  "pmol/L",
  "mmol/mol",
  "mg/g",
  "mmol/L/s",
  // Enzyme activity and international units
  "U/L",
  "[IU]",
  "[IU]/L",
  "m[IU]/L",
  "u[IU]/mL",
  "ukat/L",
  "nkat/L",
  // Cell counts and red cell indices
  "/uL",
  "10*3/uL",
  "10*6/uL",
  "10*9/L",
  "10*12/L",
  "fL",
  "pg",
  "fmol",
  "L/L",
  // Dimensionless: per cent, ratios, scores, counts
  "%",
  "1",
  "[ppth]",
  "[pH]",
  "{ratio}",
  "{INR}",
  "{score}",
  "{T-score}",
  "{SD}",
  "{#}",
  "{beats}",
  "{MET}",
  // Body measurements and vital signs
  "kg",
  "cm",
  "cm2",
  "kg/m2",
  "g/cm2",
  "mm[Hg]",
  "/min",
  "Cel",
  "deg",
  // Doses
  "mg",
  "ug",
  // Kidney function, exercise and lung function
  "mL/min/{1.73_m2}",
  "mL/min",
  "mL/min/kg",
  "mL/kg/min",
  "mL/min/W",
  "mL/{beat}",
  "L",
  "L/s",
  "L/min",
  "W",
  "W/kg",
  // Time, and rates over it
  "ms",
  "s",
  "min",
  "h",
  "/d",
  "/a",
  "min/d",
  "g/d",
  "mV",
]);

/**
 * Printed spellings, lowercased, with µ as u and without spaces, and their
 * UCUM code. The spellings of epa-ingest's normaliseUnit that the hub's
 * data uses, and a few it has no entry for (`ml/kg/min`, `g/day`, `°c`).
 */
const PRINTED: Readonly<Record<string, string>> = {
  "mg/dl": "mg/dL",
  "mg/l": "mg/L",
  "g/dl": "g/dL",
  "g/l": "g/L",
  "ug/dl": "ug/dL",
  "ug/l": "ug/L",
  "ug/ml": "ug/mL",
  "ng/dl": "ng/dL",
  "ng/ml": "ng/mL",
  "ng/l": "ng/L",
  "pg/ml": "pg/mL",
  "mmol/l": "mmol/L",
  "umol/l": "umol/L",
  "nmol/l": "nmol/L",
  "pmol/l": "pmol/L",
  "mmol/molhb": "mmol/mol",
  "u/l": "U/L",
  "iu/l": "[IU]/L",
  "mu/l": "m[IU]/L",
  "miu/l": "m[IU]/L",
  "uu/ml": "u[IU]/mL",
  "uiu/ml": "u[IU]/mL",
  "ukat/l": "ukat/L",
  "nkat/l": "nkat/L",
  "tsd/ul": "10*3/uL",
  "tsd./ul": "10*3/uL",
  "10^3/ul": "10*3/uL",
  "10*3/ul": "10*3/uL",
  "mio/ul": "10*6/uL",
  "mio./ul": "10*6/uL",
  "10^6/ul": "10*6/uL",
  "10*6/ul": "10*6/uL",
  "/nl": "10*9/L",
  "gpt/l": "10*9/L",
  "10^9/l": "10*9/L",
  "10*9/l": "10*9/L",
  "/pl": "10*12/L",
  "tpt/l": "10*12/L",
  "10^12/l": "10*12/L",
  "10*12/l": "10*12/L",
  "/ul": "/uL",
  fl: "fL",
  "l/l": "L/L",
  ratio: "{ratio}",
  ph: "[pH]",
  "vol%": "%",
  "vol.%": "%",
  "kg/m²": "kg/m2",
  mmhg: "mm[Hg]",
  "1/min": "/min",
  bpm: "/min",
  "°c": "Cel",
  "°": "deg",
  msec: "ms",
  sec: "s",
  sek: "s",
  "ml/min/1.73m2": "mL/min/{1.73_m2}",
  "ml/min/1,73m2": "mL/min/{1.73_m2}",
  "ml/min/1.73m²": "mL/min/{1.73_m2}",
  "ml/min/1,73m²": "mL/min/{1.73_m2}",
  "ml/min": "mL/min",
  "ml/min/kg": "mL/min/kg",
  "ml/kg/min": "mL/kg/min",
  "g/day": "g/d",
};

/**
 * The UCUM code of a unit, or null when this table does not know it. A UCUM
 * code is returned as it is; a printed spelling is looked up without regard
 * to case, except `G/l` and `T/l`, which German haematology prints for giga
 * and tera per litre (cell counts) while `g/l` is grams per litre.
 */
export function ucumCode(unit: string | null | undefined): string | null {
  const printed = unit?.trim();
  if (!printed) return null;
  if (CODES.has(printed)) return printed;
  const compact = printed.replace(/[µμ]/g, "u").replace(/\s+/g, "");
  if (CODES.has(compact)) return compact;
  if (/^G\/[lL]$/.test(compact)) return "10*9/L";
  if (/^T\/[lL]$/.test(compact)) return "10*12/L";
  return PRINTED[compact.toLowerCase()] ?? null;
}

/** `system` and `code` for a unit that maps to UCUM, nothing otherwise. */
export function ucumCoding(
  unit: string | null | undefined,
): { system: string; code: string } | Record<string, never> {
  const code = ucumCode(unit);
  return code ? { system: UCUM, code } : {};
}

export type UcumQuantity = {
  value: number;
  unit?: string;
  system?: string;
  code?: string;
};

/**
 * A FHIR Quantity: the value, the unit as printed, and its UCUM `system` and
 * `code` when it has one. No unit, no `unit`.
 */
export function ucumQuantity(
  value: number,
  unit: string | null | undefined,
): UcumQuantity {
  const printed = unit?.trim();
  return printed ? { value, unit: printed, ...ucumCoding(printed) } : { value };
}

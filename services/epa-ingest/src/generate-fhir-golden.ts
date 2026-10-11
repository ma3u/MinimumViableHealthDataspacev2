/**
 * Emits the golden FHIR bundle the Swift writer is pinned against.
 *
 * The analyte table is generated so there is never a second copy of it. A
 * writer is logic rather than data, so it cannot be generated the same way, and
 * the iPhone has to work offline with no CLI to call. That leaves two
 * implementations of one wire format, which is precisely the divergence this
 * repository exists to prevent.
 *
 * So the format is pinned instead of the code: this writes what the TypeScript
 * writer produces for a fixed input, and `FhirBundleParityTests` in
 * `clients/ios` asserts the Swift writer produces the same document. Either
 * side drifting fails that test.
 *
 * The fixture values are fictional and chosen to exercise what actually breaks:
 * a German thousands separator, a comparator, both reference-range shapes, a range kept only as printed text, an
 * analyte whose unit selects its LOINC code, and a bounding region.
 *
 *   npm run golden:fhir              # write it
 *   npm run golden:fhir -- --check   # fail if it would change
 */
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { lookupAnalyte } from "./analytes.js";
import { buildBundle } from "./to-fhir.js";
import type { CodedLabValue } from "./types.js";

const HERE = dirname(fileURLToPath(import.meta.url));
export const GOLDEN_TARGET = resolve(
  HERE,
  "../../../clients/ios/Tests/SharedTests/Fixtures/fhir-golden-bundle.json",
);

/** Fixed so the bundle is byte-stable across runs. */
const NOW = "2026-09-13T12:00:00.000Z";

export const GOLDEN_VALUES: CodedLabValue[] = [
  {
    label: "LDL-Cholesterin",
    value: 141,
    unitRaw: "mg/dl",
    referenceHigh: 116,
    referenceText: "< 116",
    line: "LDL-Cholesterin  141  mg/dl  < 116",
    lineNumber: 3,
    analyteKey: "ldl",
    coding: {
      loincNumber: "2089-1",
      display: "Cholesterol in LDL [Mass/volume] in Serum or Plasma",
      ucum: "mg/dL",
    },
    region: { page: 1, x: 0.0706, y: 0.7525, width: 0.8466, height: 0.0292 },
  },
  {
    // The unit selects the code: `%` is 4548-4 and `mmol/mol` is 59261-8.
    label: "HbA1c",
    value: 5.4,
    unitRaw: "%",
    referenceLow: 4,
    referenceHigh: 6,
    referenceText: "4,0 - 6,0",
    line: "HbA1c  5,4  %  4,0 - 6,0",
    lineNumber: 7,
    analyteKey: "hba1c",
    coding: {
      loincNumber: "4548-4",
      display: "Hemoglobin A1c/Hemoglobin.total in Blood",
      ucum: "%",
    },
    region: { page: 1, x: 0.0706, y: 0.6525, width: 0.8466, height: 0.0292 },
    // Confirmed by the person as read.
    verification: { verifiedAt: "2026-09-05T08:01:00Z" },
  },
  {
    // 1.240 pg/mL is 1240, not 1.24: a normal result and a cardiology referral.
    label: "NT-proBNP",
    value: 1240,
    unitRaw: "pg/ml",
    referenceHigh: 125,
    line: "NT-proBNP  1.240  pg/ml  < 125",
    lineNumber: 9,
    analyteKey: "ntprobnp",
    coding: {
      loincNumber: "33762-6",
      display:
        "Natriuretic peptide.B prohormone N-Terminal [Mass/volume] in Serum or Plasma",
      ucum: "pg/mL",
    },
    region: { page: 1, x: 0.0706, y: 0.5525, width: 0.8466, height: 0.0292 },
  },
  {
    // A comparator, and a lower bound only. No region: not every row has one.
    label: "Ferritin",
    value: 10,
    unitRaw: "ug/l",
    comparator: "<",
    referenceLow: 30,
    line: "Ferritin  <10  ug/l  30 - 400",
    lineNumber: 10,
    analyteKey: "ferritin",
    coding: {
      loincNumber: "2276-4",
      display: "Ferritin [Mass/volume] in Serum or Plasma",
      ucum: "ug/L",
    },
  },
  {
    // A printed range no number can be read from: it survives as text alone,
    // which is the only way a range like this reaches the bundle at all.
    label: "CRP",
    value: 0.31,
    unitRaw: "mg/dl",
    referenceText: "Erw. unter 0,5",
    line: "CRP  0,31  mg/dl  Erw. unter 0,5",
    lineNumber: 12,
    analyteKey: "crp",
    coding: {
      loincNumber: "1988-5",
      display: "C reactive protein [Mass/volume] in Serum or Plasma",
      ucum: "mg/dL",
    },
  },
  {
    // An organism from a stool report: no LOINC code, with the reason, and
    // the NCBI Taxonomy id as a component. Pins the uncoded rendering too,
    // which nothing did while every golden value had a code.
    label: "Akkermansia muciniphila",
    value: 3.2,
    unitRaw: "%",
    line: "Akkermansia muciniphila  3,2  %",
    lineNumber: 14,
    analyteKey: "mb-akkermansia-muciniphila",
    coding: {
      loincNumber: null,
      display: "Akkermansia muciniphila [relative abundance] in Stool",
      ucum: "%",
      uncodedReason:
        "LOINC names tests, not organisms: it has no term for the relative abundance of a taxon in stool. The organism is named by its NCBI Taxonomy id instead.",
      taxon: {
        ncbiTaxId: "239935",
        scientificName: "Akkermansia muciniphila",
        rank: "species",
      },
    },
  },
  {
    // A vital sign on a laboratory report: its Observation is `vital-signs`,
    // the report stays a laboratory report.
    label: "Körpergewicht",
    value: 80,
    unitRaw: "kg",
    line: "Körpergewicht  80  kg",
    lineNumber: 16,
    analyteKey: "body-weight",
    coding: { loincNumber: "29463-7", display: "Body weight", ucum: "kg" },
    // Corrected by the person: the recogniser read 30, they typed 80.
    verification: {
      verifiedAt: "2026-09-05T08:00:00Z",
      original: { label: "Körpergewicht", value: 30, unitRaw: "kg" },
    },
  },
];

/**
 * An ECG printout's measurements, fictional: every value is an ECG term, so
 * the DiagnosticReport is an ECG (v2-0074 `EC`, LOINC 11524-6) and every
 * Observation is a `procedure`. Pins the axis unit `deg` too.
 */
export const GOLDEN_ECG_VALUES: CodedLabValue[] = [
  {
    label: "Ventrikuläre Frequenz",
    value: 62,
    unitRaw: "/min",
    line: "Ventrikuläre Frequenz 62 /min",
    lineNumber: 9300,
    analyteKey: "ecg-ventricular-rate",
    coding: {
      loincNumber: "8897-1",
      display: "QRS complex Ventricles by EKG",
      ucum: "/min",
    },
    region: { page: 1, x: 0.9502, y: 0.5701, width: 0.015, height: 0.048 },
  },
  {
    label: "QTc nach Bazett",
    value: 398,
    unitRaw: "ms",
    line: "QTc nach Bazett 398 ms",
    lineNumber: 9304,
    analyteKey: "ecg-qtc-bazett",
    coding: {
      loincNumber: "76635-2",
      display: "Q-T interval corrected based on Bazett formula",
      ucum: "ms",
    },
  },
  {
    label: "QRS-Achse",
    value: -12,
    unitRaw: "deg",
    line: "QRS-Achse -12 °",
    lineNumber: 9306,
    analyteKey: "ecg-qrs-axis",
    coding: { loincNumber: "8632-2", display: "QRS axis", ucum: "deg" },
  },
];

/**
 * A Holter summary, fictional: total beats make it a Holter study (LOINC
 * 18754-2); the 24-hour mean heart rate is a vital sign; an uncoded count
 * takes its category from its analyte key.
 */
export const GOLDEN_HOLTER_VALUES: CodedLabValue[] = [
  {
    label: "Herzschläge gesamt",
    value: 94212,
    unitRaw: "{beats}",
    line: "Herzschläge gesamt 94.212",
    lineNumber: 9401,
    analyteKey: "ecg-total-beats",
    coding: {
      loincNumber: "76637-8",
      display: "Total beats during EKG",
      ucum: "{beats}",
    },
  },
  {
    label: "Herzfrequenz 24-h-Mittel",
    value: 68,
    unitRaw: "/min",
    line: "Herzfrequenz 24-h-Mittel 68",
    lineNumber: 9403,
    analyteKey: "heart-rate",
    coding: {
      loincNumber: "41924-2",
      display: "Heart rate 24 hour mean",
      ucum: "/min",
    },
  },
  {
    label: "Supraventrikuläre Extrasystolen",
    value: 6,
    unitRaw: "{beats}",
    line: "Supraventrikuläre Extrasystolen 6",
    lineNumber: 9406,
    analyteKey: "supraventricular-ectopics",
    coding: {
      loincNumber: null,
      display: "Premature atrial contractions [#]",
      ucum: "{beats}",
      uncodedReason:
        "LOINC codes premature atrial contractions as a rate (8615-7), not as a count over a recording.",
    },
  },
];

/**
 * One value coded by the dictionary itself, so a golden built from it cannot
 * disagree with the dictionary about a code.
 */
function dictionaryValue(
  label: string,
  value: number,
  unitRaw: string,
  line: string,
  lineNumber: number,
): CodedLabValue {
  const hit = lookupAnalyte(label, unitRaw);
  if (hit.status !== "ok")
    throw new Error(`${label} in ${unitRaw}: ${hit.status}`);
  return {
    label,
    value,
    unitRaw,
    line,
    lineNumber,
    analyteKey: hit.analyteKey,
    coding: hit.coding,
  };
}

/**
 * A bicycle ergometry, fictional: a peak load and a working capacity beside
 * a count of ventricular ectopics. The count is an ECG measurement, the
 * rest are not, so the report is an exercise stress test (EC, 18752-6) and
 * not an "EKG study".
 */
export const GOLDEN_EXERCISE_VALUES: CodedLabValue[] = [
  {
    label: "Maximale Belastung",
    value: 225,
    unitRaw: "watts",
    line: "max. Last 225 W",
    lineNumber: 9600,
    analyteKey: "exercise-peak-power",
    coding: {
      loincNumber: "93342-4",
      display: "Power level --peak during exercise",
      ucum: "W",
    },
  },
  {
    label: "Ventrikuläre Extrasystolen",
    value: 2,
    unitRaw: "{beats}",
    line: "VES: 2",
    lineNumber: 9611,
    analyteKey: "ventricular-ectopics",
    coding: {
      loincNumber: "76126-2",
      display: "Premature ventricular contractions [#]",
      ucum: "{beats}",
    },
  },
  dictionaryValue("PWC 170", 200, "watts", "PWC 170  200 W  2.9 W/kg", 9612),
];

export const GOLDEN_EXERCISE_TARGET = resolve(
  HERE,
  "../../../clients/ios/Tests/SharedTests/Fixtures/fhir-golden-bundle-exercise.json",
);

const GOLDEN_EXERCISE_META = {
  patientId: "example-patient",
  effectiveDateTime: "2026-08-26",
  performer: "Praxis Dr. Muster",
  title: "Belastungs-EKG",
} as const;

/**
 * One report of each kind REPORT_KINDS names, fictional, so both writers are
 * pinned on every DiagnosticReport category and code.
 */
export const GOLDEN_KIND_REPORTS: {
  name: string;
  title: string;
  values: CodedLabValue[];
}[] = [
  {
    name: "cpet",
    title: "Spiroergometrie",
    values: [
      dictionaryValue(
        "Maximale Sauerstoffaufnahme",
        2650,
        "ml/min",
        "VO2 peak 2650 mL/min",
        9700,
      ),
      dictionaryValue(
        "Forcierte Vitalkapazität",
        3.92,
        "litres",
        "FVC 3,92 L",
        9701,
      ),
      dictionaryValue("Atemreserve", 38.2, "%", "Atemreserve 38,2 %", 9702),
      dictionaryValue("Körpergewicht", 64.5, "kg", "Gewicht 64,50 kg", 9703),
    ],
  },
  {
    name: "spirometry",
    title: "Spirometrie",
    values: [
      dictionaryValue(
        "Forcierte Vitalkapazität",
        3.92,
        "litres",
        "FVC 3,92 L",
        9701,
      ),
      dictionaryValue(
        "Einsekundenkapazität",
        3.21,
        "litres",
        "FEV1 3,21 L",
        9702,
      ),
    ],
  },
  {
    name: "lactate",
    title: "Leistungsdiagnostik",
    values: [
      dictionaryValue(
        "Leistung an der individuellen anaeroben Schwelle",
        162,
        "watts",
        "IAS 162 Watt",
        9800,
      ),
      dictionaryValue("Körpergewicht", 68, "kg", "Körpergewicht 68.0 kg", 9801),
    ],
  },
  {
    name: "dxa",
    title: "Körperzusammensetzung (DXA)",
    values: [
      dictionaryValue(
        "Körperfettanteil",
        23.4,
        "%",
        "Gesamt Gewebe %Fett 23,4",
        9500,
      ),
      dictionaryValue(
        "Mager-Weichteilmasse",
        46.74,
        "kg",
        "Gesamt Mager 46.740 g",
        9501,
      ),
      dictionaryValue(
        "Viszerales Fett",
        57,
        "cm2",
        "540 cm³  508 g  57 cm²",
        9502,
      ),
    ],
  },
  {
    name: "cgm",
    title: "Glukoseprofil (Sensor)",
    values: [
      dictionaryValue(
        "Durchschnittliche Glukose (Sensor)",
        128,
        "mg/dL",
        "128 mg/dL",
        9910,
      ),
      dictionaryValue("Zeit im Zielbereich", 86, "%", "70-180 mg/dL 86%", 9911),
      dictionaryValue(
        "Glukosemanagement-Indikator (GMI)",
        6.4,
        "%",
        "GMI 6,4 %",
        9912,
      ),
    ],
  },
];

const kindTarget = (name: string) =>
  resolve(
    HERE,
    `../../../clients/ios/Tests/SharedTests/Fixtures/fhir-golden-bundle-${name}.json`,
  );

export const GOLDEN_HOLTER_TARGET = resolve(
  HERE,
  "../../../clients/ios/Tests/SharedTests/Fixtures/fhir-golden-bundle-holter.json",
);

const GOLDEN_HOLTER_META = {
  patientId: "example-patient",
  effectiveDateTime: "2026-08-26",
  performer: "Praxis Dr. Muster",
  title: "Langzeit-EKG",
} as const;

export const GOLDEN_ECG_TARGET = resolve(
  HERE,
  "../../../clients/ios/Tests/SharedTests/Fixtures/fhir-golden-bundle-ecg.json",
);

const GOLDEN_ECG_META = {
  patientId: "example-patient",
  effectiveDateTime: "2026-08-26",
  performer: "Praxis Dr. Muster",
  title: "Ruhe-EKG",
} as const;

const GOLDEN_META = {
  patientId: "example-patient",
  effectiveDateTime: "2026-09-04",
  performer: "Praxis Dr. Muster",
  title: "Laborbefund",
} as const;

const GOLDEN_SOURCE = {
  kind: "ocr-transcribed",
  sourceDocument: "laborbefund-2026-09-04.pdf",
  ocrConfidence: 0.94,
  extractor: "tesseract",
} as const;

/**
 * The fixture carries the **input** as well as the expected bundle.
 *
 * If the Swift test restated these values in Swift, the restatement would be a
 * third copy that could itself drift, and a parity test whose two sides were
 * fed different inputs would pass while proving nothing. So both writers read
 * one input from one file.
 */
function render(
  values: CodedLabValue[],
  meta: {
    patientId: string;
    effectiveDateTime: string;
    performer: string;
    title: string;
  },
): string {
  const bundle = buildBundle(values, {
    meta,
    source: GOLDEN_SOURCE,
    now: NOW,
  });
  return (
    JSON.stringify(
      { now: NOW, meta, source: GOLDEN_SOURCE, values, bundle },
      null,
      2,
    ) + "\n"
  );
}

export function goldenBundle(): string {
  return render(GOLDEN_VALUES, GOLDEN_META);
}

export function goldenEcgBundle(): string {
  return render(GOLDEN_ECG_VALUES, GOLDEN_ECG_META);
}

export function goldenHolterBundle(): string {
  return render(GOLDEN_HOLTER_VALUES, GOLDEN_HOLTER_META);
}

export function goldenExerciseBundle(): string {
  return render(GOLDEN_EXERCISE_VALUES, GOLDEN_EXERCISE_META);
}

export function goldenKindBundle(name: string): string {
  const report = GOLDEN_KIND_REPORTS.find((r) => r.name === name);
  if (!report) throw new Error(`no golden report ${name}`);
  return render(report.values, {
    ...GOLDEN_EXERCISE_META,
    title: report.title,
  });
}

async function main(): Promise<void> {
  const check = process.argv.includes("--check");
  for (const [target, next] of [
    [GOLDEN_TARGET, goldenBundle()],
    [GOLDEN_ECG_TARGET, goldenEcgBundle()],
    [GOLDEN_HOLTER_TARGET, goldenHolterBundle()],
    [GOLDEN_EXERCISE_TARGET, goldenExerciseBundle()],
    ...GOLDEN_KIND_REPORTS.map(
      (r) => [kindTarget(r.name), goldenKindBundle(r.name)] as const,
    ),
  ]) {
    if (check) {
      const current = await readFile(target, "utf8").catch(() => null);
      if (current === null) {
        console.error(`${target} does not exist. Run: npm run golden:fhir`);
        process.exit(1);
      }
      if (current !== next) {
        console.error(
          `${target} is out of date with the FHIR writer.\n` +
            "Run: npm run golden:fhir, then re-run the Swift tests, which will " +
            "tell you whether the Swift writer still agrees.",
        );
        process.exit(1);
      }
      console.log(`${target} is up to date`);
      continue;
    }
    await writeFile(target, next, "utf8");
    console.log(`wrote ${target}`);
  }
}

if (
  process.argv[1] &&
  import.meta.url.endsWith(process.argv[1].split("/").pop()!)
) {
  await main();
}

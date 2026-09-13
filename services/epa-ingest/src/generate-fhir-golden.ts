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
 * a German thousands separator, a comparator, both reference-range shapes, an
 * analyte whose unit selects its LOINC code, and a bounding region.
 *
 *   npm run golden:fhir              # write it
 *   npm run golden:fhir -- --check   # fail if it would change
 */
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
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
    line: "HbA1c  5,4  %  4,0 - 6,0",
    lineNumber: 7,
    analyteKey: "hba1c",
    coding: {
      loincNumber: "4548-4",
      display: "Hemoglobin A1c/Hemoglobin.total in Blood",
      ucum: "%",
    },
    region: { page: 1, x: 0.0706, y: 0.6525, width: 0.8466, height: 0.0292 },
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
];

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
export function goldenBundle(): string {
  const bundle = buildBundle(GOLDEN_VALUES, {
    meta: GOLDEN_META,
    source: GOLDEN_SOURCE,
    now: NOW,
  });
  return (
    JSON.stringify(
      {
        now: NOW,
        meta: GOLDEN_META,
        source: GOLDEN_SOURCE,
        values: GOLDEN_VALUES,
        bundle,
      },
      null,
      2,
    ) + "\n"
  );
}

async function main(): Promise<void> {
  const check = process.argv.includes("--check");
  const next = goldenBundle();

  if (check) {
    const current = await readFile(GOLDEN_TARGET, "utf8").catch(() => null);
    if (current === null) {
      console.error(
        `${GOLDEN_TARGET} does not exist. Run: npm run golden:fhir`,
      );
      process.exit(1);
    }
    if (current !== next) {
      console.error(
        `${GOLDEN_TARGET} is out of date with the FHIR writer.\n` +
          "Run: npm run golden:fhir, then re-run the Swift tests, which will " +
          "tell you whether the Swift writer still agrees.",
      );
      process.exit(1);
    }
    console.log(`${GOLDEN_TARGET} is up to date`);
    return;
  }

  await writeFile(GOLDEN_TARGET, next, "utf8");
  console.log(`wrote ${GOLDEN_TARGET}`);
}

if (
  process.argv[1] &&
  import.meta.url.endsWith(process.argv[1].split("/").pop()!)
) {
  await main();
}

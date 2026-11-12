/**
 * Writes the reference ranges as JSON, each with the LOINC code of its analyte
 * in its unit, for consumers outside this repository that key by LOINC: the
 * local health graph (Relate) in ma3u/relate-hackathon-team stores them as
 * ReferenceRange nodes next to the values they apply to.
 *
 *   npm run export:reference-ranges -- <file>      (stdout without a file)
 *
 * Nothing is added or converted: every field is the one in reference-ranges.ts,
 * plus `loinc` (null when LOINC has no term for the analyte in that unit).
 */
import { writeFileSync } from "node:fs";
import { ANALYTE_CODINGS } from "./analytes.js";
import { REFERENCE_RANGES } from "./reference-ranges.js";

const ranges = REFERENCE_RANGES.map((r) => ({
  ...r,
  loinc: ANALYTE_CODINGS[r.analyteKey]?.[r.ucum] ?? null,
}));

const unknown = ranges.filter((r) => !(r.analyteKey in ANALYTE_CODINGS));
if (unknown.length > 0) {
  throw new Error(
    `reference ranges for unknown analytes: ${unknown
      .map((r) => r.analyteKey)
      .join(", ")}`,
  );
}

const json = JSON.stringify(
  {
    source:
      "services/epa-ingest/src/reference-ranges.ts (MinimumViableHealthDataspacev2)",
    note: "Guideline and optimal ranges, each quoted from its source. They sit alongside the range the laboratory printed, never in place of it (ADR-033).",
    ranges,
  },
  null,
  2,
);
const out = process.argv[2];
if (out) writeFileSync(out, json + "\n");
else process.stdout.write(json + "\n");

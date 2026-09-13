/**
 * Coding step, parsed rows to LOINC-coded values.
 *
 * Nothing is dropped here. A row we cannot code is returned as
 * `UnmappedLabValue` with the reason, because the citizen holding the paper is
 * the only one who can resolve it, and they can only do that if they are told.
 */
import { lookupAnalyte } from "./analytes.js";
import type { CodingResult, RawLabValue } from "./types.js";

export function codeValues(values: RawLabValue[]): CodingResult {
  const result: CodingResult = { coded: [], unmapped: [] };

  for (const raw of values) {
    const hit = lookupAnalyte(raw.label, raw.unitRaw);
    switch (hit.status) {
      case "ok":
        result.coded.push({
          ...raw,
          coding: hit.coding,
          analyteKey: hit.analyteKey,
        });
        break;
      case "unit-mismatch":
        result.unmapped.push({
          ...raw,
          reason: "unit-mismatch",
          expectedUnits: hit.expectedUnits,
        });
        break;
      case "unknown-unit":
        result.unmapped.push({ ...raw, reason: "unknown-unit" });
        break;
      case "unknown-analyte":
        result.unmapped.push({ ...raw, reason: "unknown-analyte" });
        break;
    }
  }

  return result;
}

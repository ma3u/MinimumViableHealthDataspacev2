import { describe, expect, it } from "vitest";
import {
  REFERENCE_RANGES,
  rangeFor,
  rangesForAnalyte,
  type ReferenceRange,
} from "../src/reference-ranges.js";
import { validate } from "../src/generate-swift-reference-ranges.js";
import { ANALYTE_UNITS } from "../src/analytes.js";

describe("the reference-range table", () => {
  it("agrees with the analyte dictionary", () => {
    // The check the generator runs before emitting: a range whose unit the
    // analyte is not defined in could never appear beside a value.
    expect(validate(REFERENCE_RANGES)).toEqual([]);
  });

  it("quotes a source a reader can open for every range", () => {
    for (const range of REFERENCE_RANGES) {
      expect(range.source.url, range.analyteKey).toMatch(/^https:\/\//);
      expect(range.source.label.length, range.analyteKey).toBeGreaterThan(20);
      expect(range.summary.length, range.analyteKey).toBeGreaterThan(20);
    }
  });

  it("states a range per unit, never per analyte", () => {
    // Lp(a) by mass and by moles are different LOINC codes with different
    // thresholds, so a single range for the analyte would be wrong for one.
    const mass = rangeFor("lipoprotein-a", "mg/dL");
    const molar = rangeFor("lipoprotein-a", "nmol/L");
    expect(mass?.optimalHigh).toBe(30);
    expect(molar?.optimalHigh).toBe(75);
    expect(rangeFor("lipoprotein-a", "mg/L")).toBeNull();
  });

  it("does not hand a sex-specific range to someone who has not said", () => {
    expect(rangeFor("haemoglobin", "g/dL")).toBeNull();
    expect(rangeFor("haemoglobin", "g/dL", "male")?.guidelineLow).toBe(13.0);
    expect(rangeFor("haemoglobin", "g/dL", "female")?.guidelineLow).toBe(12.0);
  });

  it("covers every unit an analyte with a range is defined in, or none of it", () => {
    // A range in mg/dL but not mmol/L would show for a German report and not
    // for an American one, which is a surprising kind of absence. Not a hard
    // rule, so this asserts the ones that matter most.
    for (const key of [
      "cholesterol-ldl",
      "triglycerides",
      "hba1c",
      "glucose",
    ]) {
      const units = new Set(rangesForAnalyte(key).map((r) => r.ucum));
      for (const unit of ANALYTE_UNITS[key] ?? []) {
        expect(units.has(unit), `${key} has no range in ${unit}`).toBe(true);
      }
    }
  });
});

describe("validate", () => {
  const good: ReferenceRange = {
    analyteKey: "hba1c",
    ucum: "%",
    group: "metabolic",
    sex: "any",
    guidelineHigh: 5.7,
    basis: "guideline",
    summary: "Below 5.7% is normal, and this sentence is long enough.",
    source: {
      label: "A source with a long enough label to pass",
      url: "https://example.org/x",
    },
  };

  it("refuses an analyte the dictionary does not know", () => {
    expect(validate([{ ...good, analyteKey: "unobtainium" }])[0]).toContain(
      "no such analyte",
    );
  });

  it("refuses a unit the analyte is not defined in", () => {
    expect(validate([{ ...good, ucum: "mg/dL" }])[0]).toContain(
      "does not define it in mg/dL",
    );
  });

  it("refuses a range with no bound at all", () => {
    const { guidelineHigh: _drop, ...bare } = good;
    expect(validate([bare as ReferenceRange])[0]).toContain(
      "no guideline bound",
    );
  });

  it("refuses an inverted bound and an unsourced range", () => {
    expect(
      validate([{ ...good, guidelineLow: 9, guidelineHigh: 1 }]).join(" "),
    ).toContain("low is above its high");
    expect(
      validate([
        { ...good, source: { label: good.source.label, url: "http://x" } },
      ]).join(" "),
    ).toContain("not a URL");
  });
});

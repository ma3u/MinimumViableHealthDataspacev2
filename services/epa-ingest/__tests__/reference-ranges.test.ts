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
      "creatinine",
      "urea",
      "urate",
      "ast",
      "ggt",
      "calcium",
      "haemoglobin",
      "haematocrit",
      "mchc",
      "neutrophils",
      "vitamin-b12",
      "folate",
      "tsh",
      "nt-probnp",
    ]) {
      const units = new Set(rangesForAnalyte(key).map((r) => r.ucum));
      for (const unit of ANALYTE_UNITS[key] ?? []) {
        expect(units.has(unit), `${key} has no range in ${unit}`).toBe(true);
      }
    }
  });
});

describe("the ranges added for the blood count, chemistry and amino acids", () => {
  it("restates a converted unit by an exact factor, never by a second source", () => {
    // 60 to 100 µmol/L of creatinine is 0.68 to 1.13 mg/dL; the two entries
    // are one interval and cite one paper.
    const molar = rangeFor("creatinine", "umol/L", "male");
    const mass = rangeFor("creatinine", "mg/dL", "male");
    expect(molar?.guidelineLow).toBe(60);
    expect(mass?.guidelineLow).toBe(0.68);
    expect(mass?.guidelineHigh).toBe(1.13);
    expect(mass?.source.url).toBe(molar?.source.url);
  });

  it("spells a cell count in every unit a sheet prints it in", () => {
    expect(rangeFor("neutrophils", "10*9/L")?.guidelineHigh).toBe(6.04);
    expect(rangeFor("neutrophils", "10*3/uL")?.guidelineHigh).toBe(6.04);
    expect(rangeFor("neutrophils", "/uL")?.guidelineHigh).toBe(6040);
    expect(rangeFor("neutrophils", "%")?.guidelineHigh).toBe(70.4);
  });

  it("keeps a sex-specific blood count away from someone who has not said", () => {
    expect(rangeFor("platelets", "10*9/L")).toBeNull();
    expect(rangeFor("platelets", "10*9/L", "female")?.guidelineLow).toBe(165);
    expect(rangeFor("erythrocytes", "10*12/L", "male")?.guidelineHigh).toBe(
      5.71,
    );
  });

  it("states the TG/HDL cut-point on a mg/dL basis, which the derivation matches", () => {
    const ratio = rangeFor("ratio-tg-hdl", "{ratio}");
    expect(ratio?.guidelineHigh).toBe(3.0);
    expect(ratio?.summary).toContain("mg/dL basis");
  });

  it("names the population on every amino acid, because no guideline exists for them", () => {
    const amino = REFERENCE_RANGES.filter((r) => r.group === "aminoAcids");
    expect(amino.length).toBe(22);
    for (const range of amino) {
      expect(range.basis).toBe("cohort");
      expect(range.summary).toContain("reference laboratory");
      expect(range.optimalLow ?? range.optimalHigh).toBeUndefined();
    }
  });

  it("carries WHO's anaemia cut-off into the units a German report prints", () => {
    expect(rangeFor("haemoglobin", "g/L", "female")?.guidelineLow).toBe(120);
    expect(rangeFor("haemoglobin", "mmol/L", "male")?.guidelineLow).toBe(8.07);
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

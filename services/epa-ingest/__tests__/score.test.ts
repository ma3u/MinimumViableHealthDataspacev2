import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  baselineArm,
  formatMetrics,
  isOrderOfMagnitudeError,
  sameUnit,
  score,
  type EvalRow,
} from "../eval/score.js";

const FIXTURE = readFileSync(
  join(__dirname, "fixtures/lab-report-de.txt"),
  "utf8",
);

const truth: EvalRow[] = [
  { label: "LDL-Cholesterin", value: 141, unit: "mg/dl" },
  { label: "NT-proBNP", value: 1240, unit: "pg/ml" },
  { label: "hs-CRP", value: 2.4, unit: "mg/l" },
];

describe("isOrderOfMagnitudeError", () => {
  it("catches the decimal-separator failure in both directions", () => {
    // 1.240 read as 1.24 instead of 1240 - the failure this metric exists for.
    expect(isOrderOfMagnitudeError(1.24, 1240)).toBe(true);
    expect(isOrderOfMagnitudeError(1240, 1.24)).toBe(true);
  });

  it("does not flag an ordinary misread", () => {
    expect(isOrderOfMagnitudeError(141, 147)).toBe(false);
    expect(isOrderOfMagnitudeError(2.4, 2.5)).toBe(false);
  });

  it("treats a factor of exactly ten as an order-of-magnitude error", () => {
    expect(isOrderOfMagnitudeError(24, 2.4)).toBe(true);
  });
});

describe("sameUnit", () => {
  it("compares through UCUM rather than by string", () => {
    expect(sameUnit("mg/dl", "mg/dL")).toBe(true);
    expect(sameUnit("µg/l", "ug/L")).toBe(true);
  });

  it("separates units that normalise differently", () => {
    expect(sameUnit("mg/dl", "mmol/l")).toBe(false);
    // Lp(a) mass vs molar is a different LOINC code, so this must never pass.
    expect(sameUnit("mg/dl", "nmol/l")).toBe(false);
  });

  it("falls back to text for units with no UCUM mapping", () => {
    expect(sameUnit("Titer", "titer")).toBe(true);
    expect(sameUnit("Titer", "Score")).toBe(false);
  });
});

describe("score", () => {
  it("counts a clean extraction as fully matched with no critical errors", () => {
    const m = score(truth, { rows: truth }, "perfect", true);
    expect(m).toMatchObject({
      matched: 3,
      missed: 0,
      hallucinated: 0,
      valueExact: 3,
      valueOrderOfMagnitude: 0,
      criticalErrorRate: 0,
    });
  });

  it("counts an invented row as hallucinated when the truth is complete", () => {
    const m = score(
      truth,
      { rows: [...truth, { label: "Troponin T hs", value: 12, unit: "ng/l" }] },
      "inventive",
      true,
    );
    expect(m.hallucinated).toBe(1);
    expect(m.matched).toBe(3);
    expect(m.criticalErrorRate).toBeGreaterThan(0);
  });

  it("refuses to call an extra row hallucinated when the truth is partial", () => {
    // A row the labeller did not list is indistinguishable from one the arm
    // invented. Counting it as invention produced a 425% error rate for a
    // parser that had read every value correctly.
    const m = score(
      truth,
      { rows: [...truth, { label: "Ferritin", value: 10, unit: "ug/l" }] },
      "partial-truth",
      false,
    );
    expect(m.hallucinated).toBe(0);
    expect(m.unlabelled).toBe(1);
    expect(m.hallucinationMeasurable).toBe(false);
    expect(m.criticalErrorRate).toBe(0);
  });

  it("still counts a duplicated row as a defect under a partial truth", () => {
    const m = score(truth, { rows: [truth[0], truth[0]] }, "dup", false);
    expect(m.hallucinated).toBe(1);
    expect(m.unlabelled).toBe(0);
  });

  it("separates an order-of-magnitude error from an ordinary wrong value", () => {
    const m = score(
      truth,
      {
        rows: [
          { label: "LDL-Cholesterin", value: 147, unit: "mg/dl" },
          { label: "NT-proBNP", value: 1.24, unit: "pg/ml" },
          { label: "hs-CRP", value: 2.4, unit: "mg/l" },
        ],
      },
      "mixed",
    );
    expect(m.valueOtherWrong).toBe(1);
    expect(m.valueOrderOfMagnitude).toBe(1);
    expect(m.valueExact).toBe(1);
  });

  it("counts a missed row", () => {
    const m = score(truth, { rows: [truth[0]] }, "partial");
    expect(m.matched).toBe(1);
    expect(m.missed).toBe(2);
  });

  it("counts a wrong unit as critical even when the number is right", () => {
    const m = score(
      truth,
      { rows: [{ label: "LDL-Cholesterin", value: 141, unit: "mmol/l" }] },
      "unit-slip",
    );
    expect(m.unitWrong).toBe(1);
    expect(m.valueExact).toBe(1);
    expect(m.criticalErrorRate).toBeGreaterThan(0);
  });

  it("counts a duplicated row as a defect rather than a second match", () => {
    const m = score(truth, { rows: [truth[0], truth[0]] }, "duplicating", true);
    expect(m.matched).toBe(1);
    expect(m.hallucinated).toBe(1);
  });

  it("matches labels through normalisation, not exact text", () => {
    const m = score(
      truth,
      { rows: [{ label: "ldl cholesterin", value: 141, unit: "mg/dl" }] },
      "x",
    );
    expect(m.matched).toBe(1);
  });
});

describe("baselineArm", () => {
  it("runs the deterministic parser over the same text and finds the truth rows", () => {
    const m = score(truth, baselineArm(FIXTURE), "baseline");
    expect(m.matched).toBe(3);
    expect(m.valueExact).toBe(3);
  });

  it("cannot hallucinate against its own output", () => {
    // The parser only ever emits rows it read from the text; the metric that
    // matters for the model arm is structurally zero here, even under the
    // strict complete-truth reading.
    const arm = baselineArm(FIXTURE);
    const m = score(arm.rows, arm, "self", true);
    expect(m.hallucinated).toBe(0);
    expect(m.missed).toBe(0);
  });
});

describe("formatMetrics", () => {
  it("leads with the critical error rate", () => {
    const out = formatMetrics([score(truth, { rows: truth }, "perfect", true)]);
    expect(out).toContain("CRITICAL ERROR RATE");
    expect(out).toContain("hallucinated rows");
  });

  it("says the rate is a lower bound when the truth is partial", () => {
    const out = formatMetrics([
      score(truth, { rows: truth }, "partial", false),
    ]);
    expect(out).toContain("lower bound");
    expect(out).toContain("not measurable");
    expect(out).toContain('"complete": true');
  });
});

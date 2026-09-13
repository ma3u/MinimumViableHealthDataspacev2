import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  parseLabReport,
  parseNumber,
  parseReferenceRange,
} from "../src/parse-lab.js";

const FIXTURE = readFileSync(
  join(__dirname, "fixtures/lab-report-de.txt"),
  "utf8",
);

describe("parseNumber", () => {
  it("reads a German decimal comma", () => {
    expect(parseNumber("87,3")).toBe(87.3);
    expect(parseNumber("0,92")).toBe(0.92);
  });

  it("treats a dot before exactly three digits as thousands grouping", () => {
    // 1.240 pg/ml NT-proBNP is 1240, not 1.24 - the difference between a normal
    // result and one that would send someone to a cardiologist.
    expect(parseNumber("1.240")).toBe(1240);
  });

  it("treats a dot before one or two digits as a decimal point", () => {
    expect(parseNumber("0.92")).toBe(0.92);
    expect(parseNumber("2.4")).toBe(2.4);
  });

  it("uses the rightmost separator as the decimal when both appear", () => {
    expect(parseNumber("1.234,5")).toBe(1234.5);
    expect(parseNumber("1,234.5")).toBe(1234.5);
  });

  it("refuses anything that is not a number", () => {
    expect(parseNumber("n.b.")).toBeNull();
    expect(parseNumber("")).toBeNull();
    expect(parseNumber("negativ")).toBeNull();
  });
});

describe("parseReferenceRange", () => {
  it("reads an interval with a hyphen, an en dash or 'bis'", () => {
    expect(parseReferenceRange("0,70 - 1,20")).toEqual({ low: 0.7, high: 1.2 });
    expect(parseReferenceRange("4,8 – 5,9")).toEqual({ low: 4.8, high: 5.9 });
    expect(parseReferenceRange("197 bis 771")).toEqual({ low: 197, high: 771 });
  });

  it("reads an upper bound", () => {
    expect(parseReferenceRange("< 200")).toEqual({ high: 200 });
    expect(parseReferenceRange("bis 150")).toEqual({ high: 150 });
  });

  it("reads a lower bound", () => {
    expect(parseReferenceRange("> 40")).toEqual({ low: 40 });
  });

  it("returns nothing for free text", () => {
    expect(parseReferenceRange("siehe Vorbefund")).toEqual({});
    expect(parseReferenceRange("")).toEqual({});
  });
});

describe("parseLabReport", () => {
  const { values, suspiciousLines } = parseLabReport(FIXTURE);
  const byLabel = (label: string) => values.find((v) => v.label === label);

  it("reads a plain row", () => {
    expect(byLabel("LDL-Cholesterin")).toMatchObject({
      value: 141,
      unitRaw: "mg/dl",
      referenceHigh: 116,
    });
  });

  it("keeps labels that contain their own digits intact", () => {
    // "Vitamin B12" and "HbA1c" must not be split at the digit.
    expect(byLabel("Vitamin B12")?.value).toBe(412);
    expect(byLabel("HbA1c")).toMatchObject({ value: 5.7, unitRaw: "%" });
  });

  it("keeps a label with parentheses intact", () => {
    expect(byLabel("Lp(a)")?.value).toBe(87.3);
  });

  it("captures a comparator on the value itself", () => {
    expect(byLabel("Ferritin")).toMatchObject({ comparator: "<", value: 10 });
  });

  it("reads a lower-bound-only reference range", () => {
    expect(byLabel("HDL-Cholesterin")).toMatchObject({ referenceLow: 40 });
    expect(byLabel("HDL-Cholesterin")?.referenceHigh).toBeUndefined();
  });

  it("records the source line and its number for every value", () => {
    const ldl = byLabel("LDL-Cholesterin");
    expect(ldl?.line).toContain("LDL-Cholesterin");
    expect(ldl?.lineNumber).toBeGreaterThan(0);
  });

  it("does not invent values from headers or the address block", () => {
    expect(byLabel("Patient")).toBeUndefined();
    expect(byLabel("Eingang")).toBeUndefined();
    expect(values.every((v) => v.value > 0)).toBe(true);
  });

  it("reports a measurement-looking line it could not parse instead of dropping it", () => {
    // "Troponin T hs  n.b.  ng/l  < 14" carries a unit and a number but no
    // result - "nicht bestimmt". It cannot be coded, and it must not vanish.
    const troponin = suspiciousLines.find((s) => s.line.includes("Troponin"));
    expect(troponin).toBeDefined();
    expect(troponin?.lineNumber).toBeGreaterThan(0);
  });

  it("does not emit a value for a row whose result is 'n.b.'", () => {
    expect(values.some((v) => v.label.startsWith("Troponin"))).toBe(false);
  });
});

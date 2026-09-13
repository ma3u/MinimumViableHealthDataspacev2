import { describe, expect, it } from "vitest";
import {
  lookupAnalyte,
  normaliseLabel,
  normaliseUnit,
} from "../src/analytes.js";

describe("normaliseLabel", () => {
  it("folds case, spacing, punctuation and German diacritics", () => {
    expect(normaliseLabel("LDL-Cholesterin")).toBe(
      normaliseLabel("ldl cholesterin"),
    );
    expect(normaliseLabel("Harnsäure")).toBe("harnsaeure");
    expect(normaliseLabel("Lp(a)")).toBe("lpa");
  });
});

describe("normaliseUnit", () => {
  it("maps printed units onto UCUM", () => {
    expect(normaliseUnit("mg/dl")).toBe("mg/dL");
    expect(normaliseUnit("µg/l")).toBe("ug/L");
    expect(normaliseUnit("mU/l")).toBe("m[IU]/L");
    expect(normaliseUnit("ml/min/1,73m2")).toBe("mL/min/{1.73_m2}");
  });

  it("returns null rather than passing an unmapped unit into FHIR", () => {
    expect(normaliseUnit("Titer")).toBeNull();
    expect(normaliseUnit("")).toBeNull();
  });
});

describe("lookupAnalyte", () => {
  it("codes a known analyte in a known unit", () => {
    const hit = lookupAnalyte("LDL-Cholesterin", "mg/dl");
    expect(hit).toMatchObject({ status: "ok", analyteKey: "cholesterol-ldl" });
    if (hit.status === "ok") {
      expect(hit.coding.loincNumber).toBe("2089-1");
      expect(hit.coding.ucum).toBe("mg/dL");
    }
  });

  it("picks the code by unit, not by label alone", () => {
    // Lp(a) as mass and as moles are different measurements with different
    // LOINC codes; coding on the label would put the wrong one on a real value.
    const mass = lookupAnalyte("Lp(a)", "mg/dl");
    const molar = lookupAnalyte("Lp(a)", "nmol/l");
    expect(mass.status).toBe("ok");
    expect(molar.status).toBe("ok");
    if (mass.status === "ok" && molar.status === "ok") {
      expect(mass.coding.loincNumber).toBe("10835-7");
      expect(molar.coding.loincNumber).toBe("43583-4");
      expect(mass.coding.loincNumber).not.toBe(molar.coding.loincNumber);
    }
  });

  it("does the same for HbA1c percent vs IFCC", () => {
    const pct = lookupAnalyte("HbA1c", "%");
    const ifcc = lookupAnalyte("HbA1c", "mmol/mol");
    expect(pct.status === "ok" && pct.coding.loincNumber).toBe("4548-4");
    expect(ifcc.status === "ok" && ifcc.coding.loincNumber).toBe("59261-8");
  });

  it("distinguishes hs-CRP from ordinary CRP", () => {
    const hs = lookupAnalyte("hs-CRP", "mg/l");
    const plain = lookupAnalyte("CRP", "mg/l");
    expect(hs.status === "ok" && hs.coding.loincNumber).toBe("30522-7");
    expect(plain.status === "ok" && plain.coding.loincNumber).toBe("1988-5");
  });

  it("reports an unknown analyte rather than guessing", () => {
    expect(lookupAnalyte("Omega-3-Index", "%")).toEqual({
      status: "unknown-analyte",
    });
  });

  it("reports a unit the analyte is not defined for", () => {
    const hit = lookupAnalyte("HbA1c", "mg/dl");
    expect(hit).toMatchObject({ status: "unit-mismatch", analyteKey: "hba1c" });
    if (hit.status === "unit-mismatch") {
      expect(hit.expectedUnits).toContain("%");
    }
  });

  it("reports an unmappable unit", () => {
    expect(lookupAnalyte("Ferritin", "Titer")).toEqual({
      status: "unknown-unit",
    });
  });
});

import { describe, expect, it } from "vitest";
import {
  ANALYTE_LABELS,
  UNIT_SPELLINGS,
  buildIndexes,
  repairUnit,
  looseLabelKey,
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
    // Any letter outside a-z is dropped, and the Swift fold must do the same.
    expect(normaliseLabel("Kreatinin (Jaffé)")).toBe("kreatininjaff");
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

describe("the blood count (#186, first real scan)", () => {
  it("codes the differential by the printed unit: count versus share", () => {
    const count = lookupAnalyte("Neutrophile absolut", "/nl");
    const share = lookupAnalyte("Neutrophile", "%");
    expect(count.status === "ok" && count.coding.loincNumber).toBe("751-8");
    expect(count.status === "ok" && count.coding.ucum).toBe("10*9/L");
    expect(share.status === "ok" && share.coding.loincNumber).toBe("770-8");
  });

  it("knows the label suffixes German sheets print", () => {
    for (const label of [
      "Lymphozyten abs.",
      "Lymphozyten absolut",
      "Lymphozyten",
      "LYMPH",
    ]) {
      const hit = lookupAnalyte(label, "/nl");
      expect(hit.status === "ok" && hit.coding.loincNumber, label).toBe(
        "731-0",
      );
    }
    const ig = lookupAnalyte("unreife Granulozyten absolut", "/nl");
    expect(ig.status === "ok" && ig.coding.loincNumber).toBe("53115-2");
  });

  it("codes the red-cell indices in their own units", () => {
    expect(
      lookupAnalyte("MCV", "fl").status === "ok" &&
        (lookupAnalyte("MCV", "fl") as { coding: { loincNumber: string } })
          .coding.loincNumber,
    ).toBe("787-2");
    const mch = lookupAnalyte("MCH", "pg");
    const mchc = lookupAnalyte("MCHC", "g/dl");
    const rdw = lookupAnalyte("RDW-CV", "%");
    const hct = lookupAnalyte("Hämatokrit", "%");
    expect(mch.status === "ok" && mch.coding.loincNumber).toBe("785-6");
    expect(mchc.status === "ok" && mchc.coding.loincNumber).toBe("786-4");
    expect(rdw.status === "ok" && rdw.coding.loincNumber).toBe("788-0");
    expect(hct.status === "ok" && hct.coding.loincNumber).toBe("4544-3");
  });

  it("leaves RDW-SD uncoded because its LOINC codes are deprecated", () => {
    expect(lookupAnalyte("RDW-SD", "fl")).toEqual({
      status: "unknown-analyte",
    });
  });

  it("reads reticulocytes in per mille as well as percent", () => {
    const perMille = lookupAnalyte("Retikulozyten", "‰");
    expect(perMille.status === "ok" && perMille.coding.ucum).toBe("[ppth]");
    expect(perMille.status === "ok" && perMille.coding.loincNumber).toBe(
      "17849-1",
    );
  });
});

describe("units that only case can tell apart", () => {
  it("reads G/l as a giga count and g/l as a gram mass", () => {
    expect(normaliseUnit("G/l")).toBe("10*9/L");
    expect(normaliseUnit("T/l")).toBe("10*12/L");
    expect(normaliseUnit("g/l")).toBe("g/L");
    const leukocytes = lookupAnalyte("Leukozyten", "G/l");
    const haemoglobin = lookupAnalyte("Hämoglobin", "g/l");
    expect(leukocytes.status === "ok" && leukocytes.coding.loincNumber).toBe(
      "6690-2",
    );
    expect(haemoglobin.status === "ok" && haemoglobin.coding.loincNumber).toBe(
      "718-7",
    );
  });

  it("maps the count units a German haematology sheet prints", () => {
    expect(normaliseUnit("/pl")).toBe("10*12/L");
    expect(normaliseUnit("Mio/µl")).toBe("10*6/uL");
    expect(normaliseUnit("Tsd/µl")).toBe("10*3/uL");
    expect(normaliseUnit("fl")).toBe("fL");
    expect(normaliseUnit("pg")).toBe("pg");
  });
});

describe("OCR that drops the umlaut", () => {
  it("collapses ae, oe and ue on both sides", () => {
    expect(looseLabelKey("Hämoglobin")).toBe(looseLabelKey("Hamoglobin"));
    expect(looseLabelKey("Harnsäure")).toBe(looseLabelKey("Harnsaure"));
    // The strict key stays what it was; only the fallback is new.
    expect(normaliseLabel("Hämoglobin")).toBe("haemoglobin");
  });

  it("codes Hamoglobin, the spelling the first real scan produced", () => {
    const hit = lookupAnalyte("Hamoglobin", "g/dl");
    expect(hit).toMatchObject({ status: "ok", analyteKey: "haemoglobin" });
    if (hit.status === "ok") expect(hit.coding.loincNumber).toBe("718-7");
  });

  it("still refuses an analyte it has never heard of", () => {
    expect(lookupAnalyte("Hamatologie", "g/dl")).toEqual({
      status: "unknown-analyte",
    });
  });

  it("refuses to build a dictionary where two analytes share a loose key", () => {
    const coding = { loincNumber: "0-0", display: "x", ucum: "%" };
    expect(() =>
      buildIndexes([
        { key: "a", labels: ["Härte"], byUnit: { "%": coding } },
        { key: "b", labels: ["Harte"], byUnit: { "%": coding } },
      ]),
    ).toThrow(/same loose key/);
  });
});

describe("the rows two real Berlin sheets refused (#186)", () => {
  it("codes the coagulation and chemistry batch", () => {
    const cases: [string, string, string][] = [
      ["Quick (TPZ)", "%", "5894-1"],
      ["Fibrinogen", "g/l", "3255-7"],
      ["Harnstoff", "mg/dl", "3091-6"],
      ["Glucose im Fluorid", "mg/dl", "2345-7"],
      ["Kreatinin (Jaffé)", "mg/dl", "2160-0"],
      ["Reti% gemessen", "%", "17849-1"],
      ["Erythroblasten absolut", "/nl", "771-6"],
      ["Transferrin", "g/l", "3034-6"],
      ["Transferrin-Sättigung", "%", "2502-3"],
      ["Kortisol", "nmol/l", "14675-3"],
      ["Lp(a)", "g/l", "10835-7"],
      ["aPTT", "sec", "3173-2"],
    ];
    for (const [label, unit, loinc] of cases) {
      const hit = lookupAnalyte(label, unit);
      expect(
        hit.status === "ok" && hit.coding.loincNumber,
        `${label} [${unit}]`,
      ).toBe(loinc);
    }
  });
});

describe("a unit the recogniser mangled", () => {
  it("repairs the confusions a real sheet produced", () => {
    expect(repairUnit("U/I")).toBe("U/L");
    expect(repairUnit("UII")).toBe("U/L");
    expect(repairUnit("ulU/ml")).toBe("u[IU]/mL");
    expect(repairUnit("f1")).toBe("fL");
  });

  it("never rewrites a unit that is already a unit", () => {
    // The guard that makes this safe: a real spelling is resolved before any
    // repair is attempted, so mg/dL can never become something else.
    expect(normaliseUnit("mg/dl")).toBe("mg/dL");
    expect(normaliseUnit("/nl")).toBe("10*9/L");
    expect(normaliseUnit("G/l")).toBe("10*9/L");
  });

  it("refuses a token made only of confusable characters", () => {
    // `III` could be repaired into `l/l`, which is a haematocrit. A token with
    // nothing recognisable in it is not evidence of anything.
    expect(repairUnit("III")).toBeNull();
    expect(repairUnit("ll")).toBeNull();
    expect(repairUnit("|||")).toBeNull();
  });

  it("refuses an ambiguous repair rather than picking one", () => {
    expect(repairUnit("Titer")).toBeNull();
    expect(repairUnit("")).toBeNull();
    expect(repairUnit("negativ")).toBeNull();
  });
});

describe("a quantity LOINC does not code", () => {
  // A bioimpedance scale prints visceral fat as a mass in kilograms. LOINC
  // codes it as an area (73707-2) and has no term for the mass, and the two
  // are not convertible. The unit therefore decides whether there is a code
  // at all, which is the same rule as everywhere else in this table.
  it("codes visceral fat in cm² and refuses to code it in kg", () => {
    const area = lookupAnalyte("Viszeralfett", "cm²");
    expect(area.status).toBe("ok");
    if (area.status !== "ok") return;
    expect(area.coding.loincNumber).toBe("73707-2");
    expect(area.coding.uncodedReason).toBeUndefined();

    const mass = lookupAnalyte("Viszeralfett", "kg");
    expect(mass.status).toBe("ok");
    if (mass.status !== "ok") return;
    expect(mass.analyteKey).toBe(area.analyteKey);
    expect(mass.coding.loincNumber).toBeNull();
    expect(mass.coding.uncodedReason).toMatch(/73707-2/);
  });

  it("reads the label a scale prints, which is one word", () => {
    // "Viszeralfett", not "Viszerales Fett", is what the gym scale shows, and
    // the dictionary matched only the two-word form.
    for (const label of ["Viszeralfett", "Viszerales Fett", "Visceral fat"]) {
      expect(lookupAnalyte(label, "kg").status).toBe("ok");
    }
  });

  it("carries only quantities LOINC genuinely has no term for", () => {
    // Uncoded is deliberate, never a shortcut. Two classes qualify, both
    // checked against the NLM clinical tables API before being added:
    // body-composition quantities LOINC codes in another dimension or not at
    // all, and the gut microbiome, where LOINC names tests and an organism
    // needs naming instead.
    const uncoded = new Set<string>();
    for (const label of ANALYTE_LABELS) {
      for (const unit of UNIT_SPELLINGS) {
        const hit = lookupAnalyte(label, unit);
        if (hit.status === "ok" && hit.coding.loincNumber === null) {
          uncoded.add(`${hit.analyteKey}|${hit.coding.ucum}`);
        }
      }
    }
    const outside = [...uncoded].filter(
      (entry) =>
        !entry.startsWith("mb-") &&
        ![
          "ecw-tbw|%",
          "visceral-fat|kg",
          "shannon-index|1",
          "firmicutes-bacteroidetes-ratio|1",
        ].includes(entry),
    );
    expect(outside).toEqual([]);
    // And the microbiome is the bulk of it, which is the honest shape: a
    // whole panel LOINC does not reach.
    expect(
      [...uncoded].filter((e) => e.startsWith("mb-")).length,
    ).toBeGreaterThan(50);
  });

  it("never leaves a null code without a reason", () => {
    for (const label of ANALYTE_LABELS) {
      for (const unit of UNIT_SPELLINGS) {
        const hit = lookupAnalyte(label, unit);
        if (hit.status !== "ok") continue;
        expect(
          hit.coding.loincNumber === null
            ? typeof hit.coding.uncodedReason === "string" &&
                hit.coding.uncodedReason.length > 20
            : hit.coding.uncodedReason === undefined,
        ).toBe(true);
      }
    }
  });
});

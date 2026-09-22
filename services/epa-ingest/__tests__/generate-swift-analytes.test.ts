import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import {
  SWIFT_TARGET,
  buildEntries,
  generate,
  renderSwift,
} from "../src/generate-swift-analytes.js";
import {
  ANALYTE_KEYS,
  ANALYTE_LABELS,
  UNIT_SPELLINGS,
} from "../src/analytes.js";

describe("buildEntries", () => {
  it("emits one entry per (label synonym, unit) pair the dictionary resolves", () => {
    const entries = buildEntries(
      ["LDL-Cholesterin", "LDL"],
      ["mg/dl", "mmol/l"],
    );
    expect(entries).toHaveLength(4);
    expect(entries.every((e) => e.analyteKey === "cholesterol-ldl")).toBe(true);
  });

  it("gives the same analyte different codes under different units", () => {
    const entries = buildEntries(["Lp(a)"], ["mg/dl", "nmol/l"]);
    const byUnit = Object.fromEntries(entries.map((e) => [e.ucum, e.loinc]));
    expect(byUnit["mg/dL"]).toBe("10835-7");
    expect(byUnit["nmol/L"]).toBe("43583-4");
  });

  it("skips pairs the dictionary refuses rather than inventing a coding", () => {
    expect(buildEntries(["Omega-3-Index"], ["%"])).toHaveLength(0);
    expect(buildEntries(["HbA1c"], ["mg/dl"])).toHaveLength(0);
    expect(buildEntries(["Ferritin"], ["Titer"])).toHaveLength(0);
  });

  it("is deterministic, so the generated file does not churn", () => {
    const a = buildEntries(["Lp(a)", "LDL", "HbA1c"], ["mg/dl", "nmol/l", "%"]);
    const b = buildEntries(["HbA1c", "LDL", "Lp(a)"], ["%", "nmol/l", "mg/dl"]);
    expect(a).toEqual(b);
  });

  it("does not duplicate a coding reached by two spellings of one unit", () => {
    // µg/l and ug/L normalise to the same UCUM code.
    const entries = buildEntries(["Ferritin"], ["µg/l", "ug/l"]);
    expect(entries).toHaveLength(1);
  });
});

describe("renderSwift", () => {
  const swift = renderSwift(
    [
      {
        labelKey: "lpa",
        ucum: "mg/dL",
        loinc: "10835-7",
        display: 'Lipoprotein a "mass"',
        analyteKey: "lipoprotein-a",
      },
    ],
    [["mg/dl", "mg/dL"]],
  );

  it("marks the file as generated so nobody hand-edits it", () => {
    expect(swift).toContain("GENERATED FILE, DO NOT EDIT");
    expect(swift).toContain("services/epa-ingest/src/analytes.ts");
  });

  it("escapes quotes in a display name rather than emitting broken Swift", () => {
    expect(swift).toContain('\\"mass\\"');
  });

  it("carries the rule the table exists to enforce", () => {
    expect(swift).toContain("The unit selects the LOINC code, never the label");
  });
});

describe("the generated table covers the whole dictionary", () => {
  it("emits at least one coding for every analyte key", () => {
    const entries = buildEntries([...ANALYTE_LABELS], [...UNIT_SPELLINGS]);
    const covered = new Set(entries.map((e) => e.analyteKey));
    for (const key of ANALYTE_KEYS) expect(covered.has(key), key).toBe(true);
  });

  it("emits the differential, whose labels are built rather than written", () => {
    const entries = buildEntries([...ANALYTE_LABELS], [...UNIT_SPELLINGS]);
    const neutrophils = entries.filter((e) => e.analyteKey === "neutrophils");
    expect(new Set(neutrophils.map((e) => e.loinc))).toEqual(
      new Set(["751-8", "770-8"]),
    );
  });

  it("keeps g/l a mass in the Swift map, G/l being decided in code", async () => {
    const swift = await generate();
    expect(swift).toContain('"g/l": "g/L"');
    expect(swift).not.toContain('"g/l": "10*9/L"');
  });

  it("keeps the units a formatter once unquoted", async () => {
    const swift = await generate();
    for (const unit of ['"fl": "fL"', '"pg": "pg"', '"/pl": "10*12/L"']) {
      expect(swift).toContain(unit);
    }
  });
});

describe("generate", () => {
  it("produces a table with the analytes the CLI codes", async () => {
    const swift = await generate();
    for (const loinc of [
      "2089-1",
      "10835-7",
      "43583-4",
      "4548-4",
      "59261-8",
      "30522-7",
    ]) {
      expect(swift).toContain(loinc);
    }
  });

  it("matches the committed file, otherwise the two dictionaries have drifted", async () => {
    // The same assertion CI makes. It fails here first, on the machine that can
    // fix it, instead of in a pipeline after the divergence is already pushed.
    const current = await readFile(SWIFT_TARGET, "utf8");
    expect(current).toBe(await generate());
  });
});

describe("organisms in the Swift table", () => {
  it("carry their NCBI Taxonomy entry, and coded analytes carry none", () => {
    const swift = renderSwift(
      buildEntries(["Akkermansia muciniphila", "LDL"], ["%", "mg/dl"]),
      [],
    );
    expect(swift).toContain(
      'taxon: Taxon(ncbiTaxId: "239935", scientificName: "Akkermansia muciniphila", rank: "species")',
    );
    const ldl = swift.split("\n").find((l) => l.includes('loinc: "2089-1"'));
    expect(ldl).toBeDefined();
    expect(ldl).not.toContain("taxon:");
  });
});

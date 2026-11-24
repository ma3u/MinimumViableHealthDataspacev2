// @vitest-environment node
/**
 * Printed units as UCUM (#1214): one table, ui/src/lib/ucum.ts, used by the
 * FHIR document builders and the overview's Observation Bundle, with a copy
 * in the neo4j-proxy that its own test keeps byte-identical.
 *
 * The printed spellings must agree with the shared FHIR writer's
 * normaliseUnit (services/epa-ingest), which the Klarbefund app and
 * epa-ingest code every value with: the same printed unit may not get one
 * UCUM code on the phone and another in the hub.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import {
  normaliseUnit,
  UNIT_SPELLINGS,
} from "../../../../services/epa-ingest/src/analytes";
import { UCUM, ucumCode, ucumCoding, ucumQuantity } from "@/lib/ucum";
import { rowsToBundle } from "@/lib/overview/observations";

const SOURCE = readFileSync(
  path.resolve(__dirname, "../../../src/lib/ucum.ts"),
  "utf8",
);

/** The keys of one object literal in ucum.ts, read from the source. */
function tableKeys(name: "CODES" | "PRINTED"): string[] {
  const start = SOURCE.indexOf(`const ${name}`);
  const end = SOURCE.indexOf(name === "CODES" ? "]);" : "};", start);
  const body = SOURCE.slice(start, end);
  const pattern =
    name === "CODES" ? /^\s*"([^"]+)",\s*$/gm : /^\s*"?([^":]+)"?:\s*"/gm;
  return [...body.matchAll(pattern)].map((m) => m[1]);
}

describe("ucumCode", () => {
  it.each([
    ["mg/dL", "mg/dL"],
    ["mg/dl", "mg/dL"],
    ["MG/DL", "mg/dL"],
    ["g/L", "g/L"],
    ["g/l", "g/L"],
    ["%", "%"],
    ["mmol/mol", "mmol/mol"],
    ["mmol/mol Hb", "mmol/mol"],
    ["10*3/uL", "10*3/uL"],
    ["Tsd/µl", "10*3/uL"],
    ["Tsd./µl", "10*3/uL"],
    ["10^3/µl", "10*3/uL"],
    ["µmol/l", "umol/L"],
    ["mmHg", "mm[Hg]"],
    ["mm[Hg]", "mm[Hg]"],
    ["ml/min/1,73m²", "mL/min/{1.73_m2}"],
    ["mL/min/{1.73_m2}", "mL/min/{1.73_m2}"],
    ["{score}", "{score}"],
    ["min/d", "min/d"],
    [" mg/dl ", "mg/dL"],
  ])("%s is UCUM %s", (printed, code) => {
    expect(ucumCode(printed)).toBe(code);
  });

  it("tells giga per litre from grams per litre by case, as German haematology prints them", () => {
    expect(ucumCode("G/l")).toBe("10*9/L");
    expect(ucumCode("T/l")).toBe("10*12/L");
    expect(ucumCode("g/l")).toBe("g/L");
  });

  it.each(["Einheiten", "h/night", "plants/wk", "mg/Tag", "", "   "])(
    "knows no UCUM code for %j",
    (printed) => {
      expect(ucumCode(printed)).toBeNull();
    },
  );

  it("knows none for no unit at all", () => {
    expect(ucumCode(null)).toBeNull();
    expect(ucumCode(undefined)).toBeNull();
  });
});

describe("ucumQuantity", () => {
  it("keeps the printed unit as text and puts the UCUM code beside it", () => {
    expect(ucumQuantity(6.1, "Tsd/µl")).toEqual({
      value: 6.1,
      unit: "Tsd/µl",
      system: UCUM,
      code: "10*3/uL",
    });
  });

  it("writes an unknown unit as text only, with no system and no code", () => {
    expect(ucumQuantity(3, "Einheiten")).toEqual({
      value: 3,
      unit: "Einheiten",
    });
    expect(ucumCoding("Einheiten")).toEqual({});
  });

  it("writes no unit when there is none", () => {
    expect(ucumQuantity(3, undefined)).toEqual({ value: 3 });
    expect(ucumQuantity(3, "")).toEqual({ value: 3 });
  });
});

describe("the table agrees with the shared FHIR writer (services/epa-ingest)", () => {
  const codes = tableKeys("CODES");
  const printed = tableKeys("PRINTED");

  it("reads both tables from the source", () => {
    expect(codes.length).toBeGreaterThan(50);
    expect(printed.length).toBeGreaterThan(50);
  });

  it("knows every UCUM code the writer emits", () => {
    const emitted = new Set(
      UNIT_SPELLINGS.map((s) => normaliseUnit(s)).filter(
        (c): c is string => c !== null,
      ),
    );
    expect(emitted.size).toBeGreaterThan(40);
    for (const code of emitted) {
      expect([code, ucumCode(code)]).toEqual([code, code]);
    }
  });

  it("codes every printed spelling the writer knows as the writer does", () => {
    for (const spelling of UNIT_SPELLINGS) {
      const writer = normaliseUnit(spelling);
      const ours = ucumCode(spelling);
      // A spelling the hub's data never carries may be missing here; one
      // that is here must give the writer's code.
      if (ours !== null) expect([spelling, ours]).toEqual([spelling, writer]);
    }
  });

  it("gives every printed spelling of its own the writer's code, or is one of the few the writer lacks", () => {
    const writerLacks = new Set(["ml/kg/min", "g/day", "°c"]);
    for (const spelling of printed) {
      const writer = normaliseUnit(spelling);
      if (writer === null) {
        expect(writerLacks).toContain(spelling);
      } else {
        expect([spelling, ucumCode(spelling)]).toEqual([spelling, writer]);
      }
    }
  });

  it("holds no UCUM code the writer would read as another unit", () => {
    for (const code of codes) {
      const writer = normaliseUnit(code);
      if (writer !== null) expect([code, writer]).toEqual([code, code]);
    }
  });
});

describe("the overview's Observation Bundle (#1214)", () => {
  const row = (id: string, unit: string) => ({
    id,
    code: "4548-4",
    display: "HbA1c",
    value: 6.1,
    unit,
    effective: "2026-03-01",
  });

  it("codes a mapped unit in UCUM and leaves an unknown one as text", () => {
    const bundle = rowsToBundle(
      [row("a", "mg/dl"), row("b", "Einheiten")],
      { id: "P9" },
      "/api/patient/observations?patientId=P9",
    );
    const [a, b] = bundle.entry.map(
      (e) => (e.resource as { valueQuantity: unknown }).valueQuantity,
    );
    expect(a).toEqual({
      value: 6.1,
      unit: "mg/dl",
      system: UCUM,
      code: "mg/dL",
    });
    expect(b).toEqual({ value: 6.1, unit: "Einheiten" });
  });
});

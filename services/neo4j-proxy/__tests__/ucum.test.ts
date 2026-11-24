/**
 * Printed units as UCUM in the FHIR facade (#1214).
 *
 * The table is ui/src/lib/ucum.ts; the proxy is built on its own and holds a
 * copy, src/ucum.ts. This test fails when the two differ, so a unit added on
 * one side is added on both. The UI's test checks the table against the
 * shared FHIR writer (services/epa-ingest).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { toFhirResource } from "../src/fhir-resource.js";
import { UCUM, ucumCode } from "../src/ucum.js";

const here = path.dirname(new URL(import.meta.url).pathname);

describe("the proxy's UCUM table", () => {
  it("is byte for byte the UI's", () => {
    const ours = readFileSync(path.resolve(here, "../src/ucum.ts"), "utf8");
    const ui = readFileSync(
      path.resolve(here, "../../../ui/src/lib/ucum.ts"),
      "utf8",
    );
    expect(ours).toBe(ui);
  });

  it("codes the printed units the seeds and the app carry", () => {
    expect(ucumCode("mmHg")).toBe("mm[Hg]");
    expect(ucumCode("mg/dl")).toBe("mg/dL");
    expect(ucumCode("Tsd/µl")).toBe("10*3/uL");
    expect(ucumCode("Einheiten")).toBeNull();
  });
});

describe("a facade Observation's quantities (#1214)", () => {
  const observation = (unit: string) =>
    toFhirResource(
      "Observation",
      {
        resourceId: `obs-${unit}`,
        code: "2093-3",
        codeSystem: "http://loinc.org",
        display: "Cholesterol",
        category: "laboratory",
        status: "final",
        valueQuantity: 212,
        unit,
        referenceLow: 0,
        referenceHigh: 200,
        dateTime: "2026-03-01T08:30:00Z",
        performer: "AlphaKlinik Berlin, Zentrallabor (fictional)",
      },
      "P1",
    );

  it.each([
    ["mg/dl", "mg/dL"],
    ["mg/dL", "mg/dL"],
    ["g/L", "g/L"],
    ["%", "%"],
    ["mmol/mol", "mmol/mol"],
    ["10*3/uL", "10*3/uL"],
    ["Tsd/µl", "10*3/uL"],
  ])("%s: the printed unit as text, UCUM %s as the code", (printed, code) => {
    const r = observation(printed);
    const coded = { unit: printed, system: UCUM, code };
    expect(r.valueQuantity).toEqual({ value: 212, ...coded });
    expect(r.referenceRange).toEqual([
      { low: { value: 0, ...coded }, high: { value: 200, ...coded } },
    ]);
  });

  it("leaves a unit UCUM does not know as text, with no system and no code", () => {
    const r = observation("Einheiten");
    expect(r.valueQuantity).toEqual({ value: 212, unit: "Einheiten" });
    expect(r.referenceRange).toEqual([
      {
        low: { value: 0, unit: "Einheiten" },
        high: { value: 200, unit: "Einheiten" },
      },
    ]);
  });
});

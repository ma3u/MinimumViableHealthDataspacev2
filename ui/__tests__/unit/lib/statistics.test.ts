/**
 * Art. 69: only anonymised statistics leave the environment. Issue #206, M5.
 */
import { describe, it, expect } from "vitest";
import { K_ANONYMITY, toStatisticalAnswer } from "@/lib/statistics";

describe("toStatisticalAnswer", () => {
  it("passes an aggregate template through", () => {
    const r = toStatisticalAnswer({
      method: "template",
      templateName: "patient_by_gender",
      results: [
        { gender: "female", count: 112 },
        { gender: "male", count: 102 },
      ],
    });
    expect(r.ok).toBe(true);
    expect(r.rows).toEqual([
      { gender: "female", count: 112 },
      { gender: "male", count: 102 },
    ]);
    expect(r.suppressedCells).toBe(0);
  });

  it("suppresses counts below k", () => {
    const r = toStatisticalAnswer({
      method: "template",
      templateName: "top_conditions",
      results: [
        { condition: "Hypertension", count: 40 },
        { condition: "Rare disease", count: 3 },
      ],
    });
    expect(r.ok).toBe(true);
    expect(r.rows[1].count).toBe(`<${K_ANONYMITY}`);
    expect(r.suppressedCells).toBe(1);
    expect(r.reason).toContain("suppressed");
  });

  it("refuses a record-level template", () => {
    const r = toStatisticalAnswer({
      method: "template",
      templateName: "patient_journey",
      results: [{ patientId: "p-1", event: "Encounter" }],
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("returns records");
    expect(r.rows).toEqual([]);
  });

  it("refuses anything that did not resolve to a template", () => {
    expect(toStatisticalAnswer({ method: "llm", results: [] }).ok).toBe(false);
    expect(toStatisticalAnswer({ method: "none" }).ok).toBe(false);
    expect(toStatisticalAnswer({ error: "boom" }).ok).toBe(false);
  });

  it("refuses identifier columns even on an allowed template", () => {
    const r = toStatisticalAnswer({
      method: "template",
      templateName: "patient_count",
      results: [{ patientId: "p-1", count: 1 }],
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("identifier column");
  });
});

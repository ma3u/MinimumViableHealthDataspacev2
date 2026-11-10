// @vitest-environment node
/**
 * The active year rule (#934 step 6; ADR-080, decision 3; ADR-087): goal met
 * when the ended year averaged at least 150 minutes of exercise a week and
 * held one check-up. Every value is invented.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockRunQuery = vi.fn();
vi.mock("@/lib/neo4j", () => ({
  runQuery: (...args: unknown[]) => mockRunQuery(...args),
}));

import {
  ACTIVE_YEAR_RULE,
  CHECK_UP_SNOMED,
  EXERCISE_DURATION_LOINC,
  YEAR_RECORD_CYPHER,
  applyActiveYearRule,
  evaluateYear,
  ruleYear,
  yearIsOver,
} from "@/lib/patient/programme-rule";

/** A year of weekly means, in minutes per day, summed as the query does. */
const weeks = (perDay: number, n = 52) => ({
  minutes: perDay * 7 * n,
  weeks: n,
});

describe("the active year rule", () => {
  it("is met at 150 minutes a week on average and one check-up", () => {
    const r = applyActiveYearRule(2025, {
      ...weeks(150 / 7),
      checkUps: 1,
    });
    expect(r.goalMet).toBe(true);
    expect(r.activity).toEqual({
      minutesPerWeek: 150,
      required: 150,
      weeksWithData: 52,
      met: true,
    });
    expect(r.checkUp).toEqual({ count: 1, required: 1, met: true });
  });

  it("is not met without a check-up, however active the year", () => {
    const r = applyActiveYearRule(2025, { ...weeks(60), checkUps: 0 });
    expect(r.activity.met).toBe(true);
    expect(r.checkUp.met).toBe(false);
    expect(r.goalMet).toBe(false);
  });

  it("counts a week the tracker shared nothing as no activity", () => {
    // 26 weeks at 30 minutes a day is 105 a week across 52.
    const r = applyActiveYearRule(2025, { ...weeks(30, 26), checkUps: 1 });
    expect(r.activity.minutesPerWeek).toBe(105);
    expect(r.activity.weeksWithData).toBe(26);
    expect(r.goalMet).toBe(false);
  });

  it("names the rule's year from its version", () => {
    expect(ruleYear("2025.1")).toBe(2025);
    expect(ruleYear("v1")).toBeNull();
    expect(ruleYear(null)).toBeNull();
  });

  it("treats a year as over from 1 January of the next", () => {
    expect(yearIsOver(2025, new Date("2025-12-31T23:59:59Z"))).toBe(false);
    expect(yearIsOver(2025, new Date("2026-01-01T00:00:00Z"))).toBe(true);
  });
});

describe("evaluateYear()", () => {
  beforeEach(() => {
    mockRunQuery.mockReset();
  });

  it("says a year that is not over is not over, and reads nothing", async () => {
    const r = await evaluateYear("P1", 2026, new Date("2026-11-10T00:00:00Z"));
    expect(r).toEqual({
      year: 2026,
      status: "year-not-over",
      evaluableFrom: "2027-01-01",
    });
    expect(mockRunQuery).not.toHaveBeenCalled();
  });

  it("reads one year's exercise weeks and check-ups, by code", async () => {
    mockRunQuery.mockResolvedValueOnce([{ ...weeks(25), checkUps: 1 }]);
    const r = await evaluateYear("P1", 2025, new Date("2026-11-10T00:00:00Z"));
    expect(r).toMatchObject({ status: "evaluated", goalMet: true });
    expect(mockRunQuery).toHaveBeenCalledWith(YEAR_RECORD_CYPHER, {
      patientId: "P1",
      year: "2025",
      exerciseCode: EXERCISE_DURATION_LOINC,
      checkUpCodes: CHECK_UP_SNOMED,
      checkUpDisplays: expect.any(Array),
    });
  });

  it("answers null for a record that is not there", async () => {
    mockRunQuery.mockResolvedValueOnce([]);
    expect(
      await evaluateYear("P9", 2025, new Date("2026-11-10T00:00:00Z")),
    ).toBeNull();
  });

  it("returns three sums and no Observation value, date or code", () => {
    const returned = YEAR_RECORD_CYPHER.slice(
      YEAR_RECORD_CYPHER.lastIndexOf("RETURN"),
    );
    expect(returned).toBe("RETURN minutes, weeks, count(e) AS checkUps");
  });

  it("never reads steps for activity", () => {
    expect(EXERCISE_DURATION_LOINC).toBe("55411-3");
    expect(YEAR_RECORD_CYPHER).not.toContain("41950-7");
  });

  it("keeps the rule AlphaKasse publishes (2025.1)", () => {
    expect(ACTIVE_YEAR_RULE).toEqual({
      minutesPerWeek: 150,
      checkUps: 1,
      weeksPerYear: 52,
    });
  });
});

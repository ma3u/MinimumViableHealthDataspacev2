/**
 * The eleven items of Art. 67(2) and the Art. 68(4) clock with its pause
 * and its one extension. Issue #206, M1 and M2.
 */
import { describe, it, expect } from "vitest";
import {
  APPLICATION_ITEMS,
  applicationClock,
  applicationCompleteness,
  hasApplicationItem,
  type ApplicationItems,
} from "@/lib/permits";

const COMPLETE: ApplicationItems = {
  namedPersons: "PharmaCo Research AG; Dr A. Weber",
  requestedPurpose: "SCIENTIFIC_RESEARCH",
  intendedUse: "Compare HbA1c trajectories",
  requestedData: "Adults with T2D: encounters, observations",
  dataTimeRange: "2019-01-01 to 2026-08-31",
  dataFormats: "FHIR R4, OMOP CDM 5.4",
  identifiability: "PSEUDONYMISED",
  pseudonymisationJustification: "Longitudinal linkage",
  datasetsBroughtIn: "None",
  safeguards: "SPE only, counts below five suppressed",
  processingPeriodMonths: 12,
  speTools: "R 4.4, 4 vCPU",
  ethicsCommitteeRef: "EC-PharmaCo-2026-011",
  art71Exception: false,
};

describe("applicationCompleteness (Art. 67(2))", () => {
  it("lists eleven items", () => {
    expect(APPLICATION_ITEMS.map((i) => i.item).join("")).toBe("abcdefghijk");
  });

  it("finds a complete application complete", () => {
    const c = applicationCompleteness(COMPLETE);
    expect(c).toEqual({ complete: true, present: 11, total: 11, missing: [] });
  });

  it("names what a minimal application lacks", () => {
    const c = applicationCompleteness({
      requestedPurpose: "SCIENTIFIC_RESEARCH",
      processingPeriodMonths: 12,
      ethicsCommitteeRef: "EC-1",
    });
    expect(c.complete).toBe(false);
    expect(c.present).toBe(3);
    expect(c.missing.map((m) => m.item)).toEqual([
      "a",
      "c",
      "d",
      "e",
      "f",
      "g",
      "i",
      "k",
    ]);
  });

  it("wants the reasons for pseudonymised data, and for the Art. 71(4) exception", () => {
    expect(
      hasApplicationItem(
        { ...COMPLETE, pseudonymisationJustification: null },
        "e",
      ),
    ).toBe(false);
    expect(
      hasApplicationItem(
        {
          ...COMPLETE,
          identifiability: "ANONYMISED",
          pseudonymisationJustification: null,
        },
        "e",
      ),
    ).toBe(true);
    expect(hasApplicationItem({ ...COMPLETE, art71Exception: true }, "k")).toBe(
      false,
    );
    expect(
      hasApplicationItem(
        { ...COMPLETE, art71Exception: true, art71ExceptionJustification: "x" },
        "k",
      ),
    ).toBe(true);
    expect(hasApplicationItem({ ...COMPLETE, art71Exception: null }, "k")).toBe(
      false,
    );
  });

  it("item (d) needs scope, time range and formats", () => {
    expect(hasApplicationItem({ ...COMPLETE, dataFormats: "" }, "d")).toBe(
      false,
    );
  });
});

describe("applicationClock (Art. 68(4))", () => {
  const now = Date.parse("2026-09-25T12:00:00Z");

  it("runs three months from the submission", () => {
    const c = applicationClock(
      { submittedAt: "2026-09-01T09:00:00Z" },
      true,
      now,
    );
    expect(c.clockState).toBe("running");
    expect(c.decisionDue).toBe("2026-12-01T09:00:00.000Z");
    expect(c.daysToDecision).toBe(67);
    expect(c.extended).toBe(false);
  });

  it("stops on an incompleteness notice and gives four weeks", () => {
    const c = applicationClock(
      {
        submittedAt: "2026-09-10T10:00:00Z",
        incompleteNoticeAt: "2026-09-15T09:00:00Z",
        completeBy: "2026-10-13T09:00:00Z",
      },
      true,
      now,
    );
    expect(c.clockState).toBe("paused");
    expect(c.decisionDue).toBeNull();
    expect(c.completeBy).toBe("2026-10-13T09:00:00.000Z");
    expect(c.daysToComplete).toBe(18);
  });

  it("derives the four weeks when the seed left completeBy out", () => {
    const c = applicationClock(
      {
        submittedAt: "2026-09-10T10:00:00Z",
        incompleteNoticeAt: "2026-09-15T09:00:00Z",
      },
      true,
      now,
    );
    expect(c.completeBy).toBe("2026-10-13T09:00:00.000Z");
  });

  it("runs again from the complete application", () => {
    const c = applicationClock(
      {
        submittedAt: "2026-09-10T10:00:00Z",
        incompleteNoticeAt: "2026-09-15T09:00:00Z",
        completeBy: "2026-10-13T09:00:00Z",
        completedAt: "2026-09-20T08:00:00Z",
      },
      true,
      now,
    );
    expect(c.clockState).toBe("running");
    expect(c.decisionDue).toBe("2026-12-20T08:00:00.000Z");
  });

  it("adds three months once when extended", () => {
    const c = applicationClock(
      {
        submittedAt: "2026-09-01T09:00:00Z",
        extendedAt: "2026-09-20T00:00:00Z",
      },
      true,
      now,
    );
    expect(c.clockState).toBe("extended");
    expect(c.extended).toBe(true);
    expect(c.decisionDue).toBe("2027-03-01T09:00:00.000Z");
  });

  it("reads Neo4j's nine fractional digits", () => {
    const c = applicationClock(
      { submittedAt: "2026-09-01T09:00:00.123456789Z" },
      true,
      now,
    );
    expect(c.decisionDue).toBe("2026-12-01T09:00:00.123Z");
  });

  it("is decided once a decision exists", () => {
    const c = applicationClock(
      { submittedAt: "2026-09-01T09:00:00Z" },
      false,
      now,
    );
    expect(c.clockState).toBe("decided");
    expect(c.daysToDecision).toBeNull();
  });

  it("is none without a submission date", () => {
    expect(applicationClock({}, true, now).clockState).toBe("none");
  });
});

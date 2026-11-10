/**
 * Consent to a bonus program and the transfer it gates (#934, step 4;
 * ADR-080, decisions 4 and 6). The real requireAuth() runs against the mocked
 * session, so the role gate and the own-record rule are pinned.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.unmock("@/lib/auth-guard");
import { getServerSession } from "next-auth/next";

const mockRunQuery = vi.fn();
vi.mock("@/lib/neo4j", () => ({
  runQuery: (...args: unknown[]) => mockRunQuery(...args),
}));

import {
  POST as JOIN,
  DELETE as WITHDRAW,
} from "@/app/api/patient/programmes/consent/route";
import { POST as TRANSFER } from "@/app/api/patient/programmes/transfer/route";
import {
  JOIN_PROGRAMME_CYPHER,
  OPEN_PROGRAMME_CONSENT_CYPHER,
  RECORD_TRANSFER_CYPHER,
  WITHDRAW_PROGRAMME_CYPHER,
  PROGRAMME_RULE_CYPHER,
  openConsent,
} from "@/lib/patient/programme-consent";
import { YEAR_RECORD_CYPHER } from "@/lib/patient/programme-rule";

type Session = Awaited<ReturnType<typeof getServerSession>>;
const asSession = (s: unknown) => s as Session;
const ADMIN = asSession({ user: { name: "Admin" }, roles: ["EDC_ADMIN"] });
const PROGRAMME = "urn:mvhd:programme:alphakasse:active-year-2025";

function req(path: string, init?: RequestInit): NextRequest {
  return new NextRequest(
    `http://localhost/api/patient/programmes${path}`,
    init,
  );
}
const post = (path: string, body: unknown) =>
  req(path, { method: "POST", body: JSON.stringify(body) });

const OPEN = {
  consentId: "c-1",
  programmeId: PROGRAMME,
  joinedAt: "2026-11-09T10:00:00Z",
  withdrawnAt: null,
};

describe("consent to a bonus program", () => {
  beforeEach(() => {
    mockRunQuery.mockReset();
    vi.mocked(getServerSession).mockResolvedValue(ADMIN);
  });

  it("refuses an anonymous caller with 401", async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(null);
    const res = await JOIN(
      post("/consent", { programmeId: PROGRAMME, patientId: "P1" }),
    );
    expect(res.status).toBe(401);
    expect(mockRunQuery).not.toHaveBeenCalled();
  });

  it("refuses a data user: nobody joins in a person's name", async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(
      asSession({ user: { name: "R" }, roles: ["DATA_USER"] }),
    );
    const res = await JOIN(
      post("/consent", { programmeId: PROGRAMME, patientId: "P1" }),
    );
    expect(res.status).toBe(403);
    expect(mockRunQuery).not.toHaveBeenCalled();
  });

  it("refuses a patient who names another person's record", async () => {
    vi.mocked(getServerSession).mockResolvedValue(
      asSession({ user: { name: "Someone" }, roles: ["PATIENT"] }),
    );
    const res = await JOIN(
      post("/consent", { programmeId: PROGRAMME, patientId: "P9" }),
    );
    expect(res.status).toBe(403);
    expect(mockRunQuery).not.toHaveBeenCalled();
  });

  it("asks for the program", async () => {
    const res = await JOIN(post("/consent", { patientId: "P1" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("programmeId");
  });

  it("joins: 201 with the open consent and its legal basis", async () => {
    mockRunQuery.mockResolvedValueOnce([OPEN]);
    const res = await JOIN(
      post("/consent", { programmeId: PROGRAMME, patientId: "P1" }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.consent).toEqual(OPEN);
    expect(body.legalBasis).toContain("9(2)(a)");
    const [cypher, params] = mockRunQuery.mock.calls[0];
    expect(cypher).toBe(JOIN_PROGRAMME_CYPHER);
    expect(params).toMatchObject({
      patientId: "P1",
      programmeId: PROGRAMME,
      source: "patient-portal",
    });
    expect(params.consentId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("takes only a known source, so the clean-up never removes a person's consent", async () => {
    const res = await JOIN(
      post("/consent", {
        programmeId: PROGRAMME,
        patientId: "P1",
        source: "anything",
      }),
    );
    expect(res.status).toBe(400);
    expect(mockRunQuery).not.toHaveBeenCalled();
  });

  it("answers 404 for a program the crawler has not indexed", async () => {
    mockRunQuery.mockResolvedValueOnce([]);
    const res = await JOIN(
      post("/consent", { programmeId: "urn:x", patientId: "P1" }),
    );
    expect(res.status).toBe(404);
    expect((await res.json()).error).toContain("urn:x");
  });

  it("withdraws the open consent", async () => {
    const closed = { ...OPEN, withdrawnAt: "2026-11-09T11:00:00Z" };
    mockRunQuery.mockResolvedValueOnce([closed]);
    const res = await WITHDRAW(
      req(
        `/consent?programmeId=${encodeURIComponent(PROGRAMME)}&patientId=P1`,
        {
          method: "DELETE",
        },
      ),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).consent.withdrawnAt).toBe(closed.withdrawnAt);
    expect(mockRunQuery.mock.calls[0][0]).toBe(WITHDRAW_PROGRAMME_CYPHER);
  });

  it("answers 404 when there is nothing open to withdraw", async () => {
    mockRunQuery.mockResolvedValueOnce([]);
    const res = await WITHDRAW(
      req(
        `/consent?programmeId=${encodeURIComponent(PROGRAMME)}&patientId=P1`,
        {
          method: "DELETE",
        },
      ),
    );
    expect(res.status).toBe(404);
  });

  it("is its own record: neither study consent nor the Art. 71 opt-out", () => {
    for (const cypher of [JOIN_PROGRAMME_CYPHER, WITHDRAW_PROGRAMME_CYPHER]) {
      expect(cypher).toContain("ProgrammeConsent");
      expect(cypher).not.toContain("PatientConsent");
      expect(cypher).not.toContain("OptOut");
    }
  });
});

describe("a transfer the person asks for", () => {
  beforeEach(() => {
    mockRunQuery.mockReset();
    vi.mocked(getServerSession).mockResolvedValue(ADMIN);
  });

  const send = () =>
    TRANSFER(
      post("/transfer", {
        programmeId: PROGRAMME,
        year: 2025,
        patientId: "P1",
      }),
    );

  it("goes out under an open consent for an ended year: 202 with goal met, nothing else", async () => {
    mockRunQuery
      .mockResolvedValueOnce([{ consentId: "c-1" }])
      .mockResolvedValueOnce([{ ruleVersion: "2025.1" }])
      // 52 weeks at 25 minutes a day, and one check-up
      .mockResolvedValueOnce([{ minutes: 52 * 25 * 7, weeks: 52, checkUps: 1 }])
      .mockResolvedValueOnce([
        {
          transferId: "t-1",
          programmeId: PROGRAMME,
          year: 2025,
          goalMet: true,
          status: "evaluated",
          requestedAt: "2026-11-10T10:05:00Z",
        },
      ]);
    const res = await send();
    expect(res.status).toBe(202);
    const { transfer } = await res.json();
    expect(transfer).toMatchObject({
      year: 2025,
      goalMet: true,
      status: "evaluated",
    });
    // ADR-080, decision 2: the program, the year and goal met, nothing else
    expect(Object.keys(transfer).sort()).toEqual([
      "goalMet",
      "programmeId",
      "requestedAt",
      "status",
      "transferId",
      "year",
    ]);
    expect(mockRunQuery.mock.calls[0][0]).toBe(OPEN_PROGRAMME_CONSENT_CYPHER);
    expect(mockRunQuery.mock.calls[1][0]).toBe(PROGRAMME_RULE_CYPHER);
    expect(mockRunQuery.mock.calls[2][0]).toBe(YEAR_RECORD_CYPHER);
    expect(mockRunQuery.mock.calls[3][0]).toBe(RECORD_TRANSFER_CYPHER);
    // The breakdown stays in the hub: only goal met reaches the transfer.
    expect(mockRunQuery.mock.calls[3][1]).toMatchObject({
      consentId: "c-1",
      year: 2025,
      goalMet: true,
    });
    expect(Object.keys(mockRunQuery.mock.calls[3][1]).sort()).toEqual([
      "consentId",
      "goalMet",
      "patientId",
      "programmeId",
      "transferId",
      "year",
    ]);
  });

  it("records goal met: no when the year falls short", async () => {
    mockRunQuery
      .mockResolvedValueOnce([{ consentId: "c-1" }])
      .mockResolvedValueOnce([{ ruleVersion: "2025.1" }])
      .mockResolvedValueOnce([{ minutes: 52 * 15 * 7, weeks: 52, checkUps: 1 }])
      .mockResolvedValueOnce([{ transferId: "t-2", goalMet: false }]);
    const res = await send();
    expect(res.status).toBe(202);
    expect(mockRunQuery.mock.calls[3][1]).toMatchObject({ goalMet: false });
  });

  it("refuses a year the program's rule does not cover (400), and records nothing", async () => {
    mockRunQuery
      .mockResolvedValueOnce([{ consentId: "c-1" }])
      .mockResolvedValueOnce([{ ruleVersion: "2027.1" }]);
    const res = await send();
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("covers 2027, not 2025");
    expect(mockRunQuery).toHaveBeenCalledTimes(2);
  });

  it("refuses a year that is not over (409), and records nothing", async () => {
    const thisYear = new Date().getUTCFullYear();
    mockRunQuery
      .mockResolvedValueOnce([{ consentId: "c-1" }])
      .mockResolvedValueOnce([{ ruleVersion: `${thisYear}.1` }]);
    const res = await TRANSFER(
      post("/transfer", {
        programmeId: PROGRAMME,
        year: thisYear,
        patientId: "P1",
      }),
    );
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toContain("is not over");
    expect(body.evaluation).toEqual({
      year: thisYear,
      status: "year-not-over",
      evaluableFrom: `${thisYear + 1}-01-01`,
    });
    expect(mockRunQuery).toHaveBeenCalledTimes(2);
  });

  it("after a withdrawal is refused with 403, and nothing is recorded", async () => {
    mockRunQuery.mockResolvedValueOnce([]); // no open consent
    const res = await send();
    expect(res.status).toBe(403);
    expect((await res.json()).error).toContain("No open consent");
    expect(mockRunQuery).toHaveBeenCalledTimes(1);
  });

  it("stores the year as an integer: a JavaScript number reaches Neo4j as a float", () => {
    expect(RECORD_TRANSFER_CYPHER).toContain("toInteger($year)");
  });

  it("the gate asks for an open consent and does not read the opt-out", () => {
    expect(OPEN_PROGRAMME_CONSENT_CYPHER).toContain("withdrawnAt IS NULL");
    expect(OPEN_PROGRAMME_CONSENT_CYPHER).not.toContain("OptOut");
  });

  it("asks for a calendar year", async () => {
    const res = await TRANSFER(
      post("/transfer", {
        programmeId: PROGRAMME,
        year: "soon",
        patientId: "P1",
      }),
    );
    expect(res.status).toBe(400);
    expect(mockRunQuery).not.toHaveBeenCalled();
  });

  it("refuses a patient sending from another person's record", async () => {
    vi.mocked(getServerSession).mockResolvedValue(
      asSession({ user: { name: "Someone" }, roles: ["PATIENT"] }),
    );
    const res = await TRANSFER(
      post("/transfer", {
        programmeId: PROGRAMME,
        year: 2025,
        patientId: "P9",
      }),
    );
    expect(res.status).toBe(403);
    expect(mockRunQuery).not.toHaveBeenCalled();
  });
});

describe("openConsent()", () => {
  it("finds the open consent to the program, not a withdrawn one", () => {
    const closed = {
      ...OPEN,
      consentId: "c-0",
      withdrawnAt: "2026-11-01T00:00:00Z",
    };
    expect(openConsent([closed], PROGRAMME)).toBeNull();
    expect(openConsent([closed, OPEN], PROGRAMME)?.consentId).toBe("c-1");
    expect(openConsent([OPEN], "urn:other")).toBeNull();
  });
});

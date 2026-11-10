// @vitest-environment node
/**
 * Bonus programs from the Klarbefund app (#934, step 4; ADR-080, decision 6):
 * the app-token twins of /api/patient/programmes*. Same queries and answers
 * as the portal, the app's token and a connected device as the gate
 * (ADR-049), and only the login's own record. Every value is invented.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

const mockRunQuery = vi.fn();
vi.mock("@/lib/neo4j", () => ({
  runQuery: (...args: unknown[]) => mockRunQuery(...args),
}));

const requireAppToken = vi.fn();
vi.mock("@/lib/app-auth", async (original) => ({
  ...(await original<typeof import("@/lib/app-auth")>()),
  requireAppToken: (...args: unknown[]) => requireAppToken(...args),
}));

import { GET as LIST } from "@/app/api/patient/app/programmes/route";
import {
  POST as JOIN,
  DELETE as WITHDRAW,
} from "@/app/api/patient/app/programmes/consent/route";
import { POST as TRANSFER } from "@/app/api/patient/app/programmes/transfer/route";
import { GET as EVALUATE } from "@/app/api/patient/app/programmes/evaluation/route";
import {
  BONUS_PROGRAMMES_CYPHER,
  JOIN_PROGRAMME_CYPHER,
  OPEN_PROGRAMME_CONSENT_CYPHER,
  PROGRAMME_CONSENTS_CYPHER,
  RECORD_TRANSFER_CYPHER,
  WITHDRAW_PROGRAMME_CYPHER,
} from "@/lib/patient/programme-consent";

const PROGRAMME = "urn:mvhd:programme:alphakasse:active-year-2025";
const BASE = "http://localhost/api/patient/app/programmes";

const OPEN = {
  consentId: "c-1",
  programmeId: PROGRAMME,
  joinedAt: "2026-11-09T10:00:00Z",
  withdrawnAt: null,
};

const post = (path: string, body: unknown) =>
  new Request(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

const asApp = (username: string) =>
  requireAppToken.mockResolvedValue({
    app: { username, roles: ["PATIENT"], deviceId: "d-1" },
  });

describe("bonus programs for the Klarbefund app", () => {
  beforeEach(() => {
    mockRunQuery.mockReset();
    requireAppToken.mockReset();
    asApp("kb-ab3dk7mn");
  });

  it("asks for the app token and a connected device, never a session", async () => {
    requireAppToken.mockImplementation(async () =>
      NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    );
    for (const res of [
      await LIST(new Request(BASE)),
      await JOIN(post("/consent", { programmeId: PROGRAMME })),
      await WITHDRAW(
        new Request(`${BASE}/consent?programmeId=${PROGRAMME}`, {
          method: "DELETE",
        }),
      ),
      await TRANSFER(post("/transfer", { programmeId: PROGRAMME, year: 2025 })),
      await EVALUATE(
        new Request(`${BASE}/evaluation?programmeId=${PROGRAMME}`),
      ),
    ]) {
      expect(res.status).toBe(401);
      expect(await res.json()).toHaveProperty("error");
    }
    expect(mockRunQuery).not.toHaveBeenCalled();
    for (const call of requireAppToken.mock.calls) {
      expect(call[1]).toEqual({ device: true });
    }
  });

  it("lists the offer and the login's own consents, the portal's shape", async () => {
    mockRunQuery
      .mockResolvedValueOnce([
        { programmeId: PROGRAMME, title: "Active year bonus 2025" },
      ])
      .mockResolvedValueOnce([OPEN]);
    const res = await LIST(new Request(`${BASE}?patientId=P2`));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.programmes).toHaveLength(1);
    expect(body.consents).toEqual([OPEN]);
    expect(body.legalBasis).toMatch(/Art\. 9\(2\)\(a\)/);
    expect(mockRunQuery.mock.calls[0][0]).toBe(BONUS_PROGRAMMES_CYPHER);
    expect(mockRunQuery.mock.calls[1]).toEqual([
      PROGRAMME_CONSENTS_CYPHER,
      // The login's own record; a patientId in the query is not read.
      { patientId: "KB-AB3DK7MN" },
    ]);
  });

  it("joins with source klarbefund, whatever the body says", async () => {
    mockRunQuery.mockResolvedValueOnce([OPEN]);
    const res = await JOIN(
      post("/consent", {
        programmeId: PROGRAMME,
        patientId: "P2",
        source: "patient-portal",
      }),
    );
    expect(res.status).toBe(201);
    expect((await res.json()).consent).toEqual(OPEN);
    const [query, params] = mockRunQuery.mock.calls[0];
    expect(query).toBe(JOIN_PROGRAMME_CYPHER);
    expect(params).toMatchObject({
      patientId: "KB-AB3DK7MN",
      programmeId: PROGRAMME,
      source: "klarbefund",
    });
  });

  it("asks for the program", async () => {
    const res = await JOIN(post("/consent", {}));
    expect(res.status).toBe(400);
    expect(mockRunQuery).not.toHaveBeenCalled();
  });

  it("withdraws the open consent of the login's own record", async () => {
    const closed = { ...OPEN, withdrawnAt: "2026-11-09T11:00:00Z" };
    mockRunQuery.mockResolvedValueOnce([closed]);
    const res = await WITHDRAW(
      new Request(`${BASE}/consent?programmeId=${PROGRAMME}`, {
        method: "DELETE",
      }),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).consent).toEqual(closed);
    expect(mockRunQuery.mock.calls[0]).toEqual([
      WITHDRAW_PROGRAMME_CYPHER,
      { patientId: "KB-AB3DK7MN", programmeId: PROGRAMME },
    ]);
  });

  it("sends a year's answer under an open consent: 202, evaluated", async () => {
    mockRunQuery
      .mockResolvedValueOnce([{ consentId: "c-1" }])
      .mockResolvedValueOnce([{ ruleVersion: "2025.1" }])
      .mockResolvedValueOnce([{ minutes: 52 * 25 * 7, weeks: 52, checkUps: 1 }])
      .mockResolvedValueOnce([
        {
          transferId: "t-1",
          programmeId: PROGRAMME,
          year: 2025,
          goalMet: true,
          status: "evaluated",
          requestedAt: "2026-11-10T12:00:00Z",
        },
      ]);
    const res = await TRANSFER(
      post("/transfer", { programmeId: PROGRAMME, year: "2025" }),
    );
    expect(res.status).toBe(202);
    expect((await res.json()).transfer).toMatchObject({
      status: "evaluated",
      goalMet: true,
    });
    expect(mockRunQuery.mock.calls[0][0]).toBe(OPEN_PROGRAMME_CONSENT_CYPHER);
    expect(mockRunQuery.mock.calls[2][1]).toMatchObject({
      patientId: "KB-AB3DK7MN",
      year: "2025",
    });
    expect(mockRunQuery.mock.calls[3][0]).toBe(RECORD_TRANSFER_CYPHER);
    expect(mockRunQuery.mock.calls[3][1]).toMatchObject({
      patientId: "KB-AB3DK7MN",
      year: 2025,
      goalMet: true,
    });
  });

  it("shows the login's own result before anything is sent", async () => {
    mockRunQuery
      .mockResolvedValueOnce([{ ruleVersion: "2025.1" }])
      .mockResolvedValueOnce([
        { minutes: 52 * 10 * 7, weeks: 40, checkUps: 0 },
      ]);
    const res = await EVALUATE(
      new Request(`${BASE}/evaluation?programmeId=${PROGRAMME}&patientId=P2`),
    );
    expect(res.status).toBe(200);
    const { evaluation } = await res.json();
    expect(evaluation).toMatchObject({
      year: 2025,
      status: "evaluated",
      goalMet: false,
      activity: { minutesPerWeek: 70, weeksWithData: 40, met: false },
      checkUp: { count: 0, met: false },
    });
    expect(mockRunQuery.mock.calls[1][1]).toMatchObject({
      patientId: "KB-AB3DK7MN",
    });
  });

  it("after a withdrawal is refused with 403, and nothing is recorded", async () => {
    mockRunQuery.mockResolvedValueOnce([]);
    const res = await TRANSFER(
      post("/transfer", { programmeId: PROGRAMME, year: 2025 }),
    );
    expect(res.status).toBe(403);
    expect((await res.json()).error).toMatch(/No open consent/);
    expect(mockRunQuery).toHaveBeenCalledTimes(1);
  });

  it("asks for a calendar year", async () => {
    const res = await TRANSFER(
      post("/transfer", { programmeId: PROGRAMME, year: "next" }),
    );
    expect(res.status).toBe(400);
    expect(mockRunQuery).not.toHaveBeenCalled();
  });

  it("acts on the demo patient's own record for patient1", async () => {
    asApp("patient1");
    mockRunQuery.mockResolvedValueOnce([OPEN]);
    await JOIN(post("/consent", { programmeId: PROGRAMME }));
    expect(mockRunQuery.mock.calls[0][1]).toMatchObject({ patientId: "P1" });
  });
});

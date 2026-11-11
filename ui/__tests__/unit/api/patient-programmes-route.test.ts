/**
 * Tests for /api/patient/programmes/route.ts (#934, step 3): the bonus
 * programmes the crawler found in other data spaces, for a patient to read.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { NextRequest } from "next/server";
import { join } from "node:path";

// Run the real requireAuth() against the mocked session, so the 401/403
// cases below pin the gate (__tests__/setup.ts mocks the guard open).
vi.unmock("@/lib/auth-guard");
import { getServerSession } from "next-auth/next";

const mockRunQuery = vi.fn();
vi.mock("@/lib/neo4j", () => ({
  runQuery: (...args: unknown[]) => mockRunQuery(...args),
}));

import { GET as GET_ROUTE } from "@/app/api/patient/programmes/route";

const GET = (qs = "") =>
  GET_ROUTE(new NextRequest(`http://localhost/api/patient/programmes${qs}`));

function session(roles: string[]) {
  return {
    user: { name: "Someone" },
    roles,
  } as unknown as Awaited<ReturnType<typeof getServerSession>>;
}

const ROW = {
  programmeId: "urn:mvhd:programme:alphakasse:active-year-2025",
  title: "Active year bonus 2025",
  description: "A bonus for members who stay active through 2025.",
  publisherName: "AlphaKasse DE",
  publisherDid: "did:web:alphakasse.de:insurer",
  dataSpace: "insurance-wellbeing",
  endpointUrl: "https://ehds.mabu.red/api/mock-dsp/alphakasse",
  ruleTitle: "Active year rule, version 2025.1",
  ruleDescription: "Goal met when ...",
  ruleVersion: "2025.1",
  lastSeenAt: "2026-11-09T08:00:00Z",
};

describe("/api/patient/programmes", () => {
  beforeEach(() => {
    mockRunQuery.mockReset();
    vi.mocked(getServerSession).mockResolvedValue(session(["EDC_ADMIN"]));
  });

  it("answers 401 { error } without a session", async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(null);
    const res = await GET();
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBeDefined();
    expect(mockRunQuery).not.toHaveBeenCalled();
  });

  it("answers 403 to a role that is not a patient's", async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(session(["DATA_USER"]));
    const res = await GET();
    expect(res.status).toBe(403);
    expect(mockRunQuery).not.toHaveBeenCalled();
  });

  it("lists the bonus programmes the enricher wrote, and only those", async () => {
    mockRunQuery.mockResolvedValueOnce([ROW]);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.programmes).toEqual([ROW]);
    // an operator who names no record gets no consents, and none is read
    expect(body.consents).toEqual([]);
    expect(mockRunQuery).toHaveBeenCalledTimes(1);
    expect(body.legalBasis).toContain("7(3)");
    const [cypher] = mockRunQuery.mock.calls[0];
    expect(cypher).toContain("MATCH (s:DataService:BonusProgramme)");
  });

  it("lists the named record's consents to programmes (step 4)", async () => {
    const consent = {
      consentId: "c-1",
      programmeId: ROW.programmeId,
      joinedAt: "2026-11-09T10:00:00Z",
      withdrawnAt: null,
    };
    mockRunQuery.mockResolvedValueOnce([ROW]).mockResolvedValueOnce([consent]);
    const res = await GET("?patientId=P1");
    // Each with the reference its answers carry (step 8, ADR-091).
    expect((await res.json()).consents).toEqual([
      { ...consent, memberReference: "6G3S-4K9A-J3FY" },
    ]);
    expect(mockRunQuery.mock.calls[1][1]).toEqual({ patientId: "P1" });
    // And the date the insurer collected, from the transfers under it.
    expect(mockRunQuery.mock.calls[1][0]).toContain(
      "max(t.deliveredAt) AS collectedAt",
    );
  });

  it("the static mock has the live response's shape", () => {
    const mock = JSON.parse(
      readFileSync(
        join(__dirname, "../../../public/mock/patient_programmes.json"),
        "utf-8",
      ),
    );
    expect(Object.keys(mock).sort()).toEqual([
      "consents",
      "legalBasis",
      "programmes",
    ]);
    expect(Object.keys(mock.programmes[0]).sort()).toEqual(
      Object.keys(ROW).sort(),
    );
  });
});

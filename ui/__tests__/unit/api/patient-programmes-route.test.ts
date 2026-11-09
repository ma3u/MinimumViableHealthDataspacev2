/**
 * Tests for /api/patient/programmes/route.ts (#934, step 3): the bonus
 * programmes the crawler found in other data spaces, for a patient to read.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Run the real requireAuth() against the mocked session, so the 401/403
// cases below pin the gate (__tests__/setup.ts mocks the guard open).
vi.unmock("@/lib/auth-guard");
import { getServerSession } from "next-auth/next";

const mockRunQuery = vi.fn();
vi.mock("@/lib/neo4j", () => ({
  runQuery: (...args: unknown[]) => mockRunQuery(...args),
}));

import { GET } from "@/app/api/patient/programmes/route";

function session(roles: string[]) {
  return {
    user: { name: "Someone" },
    roles,
  } as unknown as Awaited<ReturnType<typeof getServerSession>>;
}

const ROW = {
  programmeId: "urn:mvhd:programme:alphakasse:active-year-2027",
  title: "Active year bonus 2027",
  description: "A bonus for members who stay active through 2027.",
  publisherName: "AlphaKasse DE",
  publisherDid: "did:web:alphakasse.de:insurer",
  dataSpace: "insurance-wellbeing",
  endpointUrl: "https://ehds.mabu.red/api/mock-dsp/alphakasse",
  ruleTitle: "Active year rule, version 2027.1",
  ruleDescription: "Goal met when ...",
  ruleVersion: "2027.1",
  lastSeenAt: "2026-11-09T08:00:00Z",
};

describe("/api/patient/programmes", () => {
  beforeEach(() => {
    mockRunQuery.mockReset();
    vi.mocked(getServerSession).mockResolvedValue(session(["PATIENT"]));
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
    expect(body.legalBasis).toContain("7(3)");
    const [cypher] = mockRunQuery.mock.calls[0];
    expect(cypher).toContain("MATCH (s:DataService:BonusProgramme)");
  });

  it("the static mock has the live response's shape", () => {
    const mock = JSON.parse(
      readFileSync(
        join(__dirname, "../../../public/mock/patient_programmes.json"),
        "utf-8",
      ),
    );
    expect(Object.keys(mock).sort()).toEqual(["legalBasis", "programmes"]);
    expect(Object.keys(mock.programmes[0]).sort()).toEqual(
      Object.keys(ROW).sort(),
    );
  });
});

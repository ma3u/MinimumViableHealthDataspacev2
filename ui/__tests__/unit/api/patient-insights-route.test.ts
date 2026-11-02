/**
 * Tests for /api/patient/insights/route.ts
 *
 * EHDS Art. 58(1)(g) and Art. 73: patients receive anonymised aggregate findings from
 * studies using their donated data. Never returns pseudonym IDs or
 * individual-level results. Tests cover:
 *   - Auth (401/403)
 *   - Seeded ResearchInsight nodes are returned as-is
 *   - Empty graph falls back to two demo insights (demo-insight-001/002)
 *   - Consent and condition queries are skipped when no patientId is supplied
 *   - Recommendations follow the patient's conditions (cardiovascular,
 *     diabetes, neither: one general recommendation)
 *   - Response includes the EHDS article references and privacy note
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Run the real requireAuth() against the mocked session, so the 401/403
// cases below pin the gate (__tests__/setup.ts mocks the guard open).
vi.unmock("@/lib/auth-guard");
import { getServerSession } from "next-auth/next";

const mockRunQuery = vi.fn();
vi.mock("@/lib/neo4j", () => ({
  runQuery: (...args: unknown[]) => mockRunQuery(...args),
}));

import { GET } from "@/app/api/patient/insights/route";

function makeReq(qs = ""): Request {
  return new Request(`http://localhost/api/patient/insights${qs}`);
}

describe("GET /api/patient/insights", () => {
  beforeEach(() => {
    mockRunQuery.mockReset();
    vi.mocked(getServerSession).mockResolvedValue({
      user: { name: "Test Admin", email: "admin@test.example" },
      roles: ["EDC_ADMIN"],
    } as unknown as Awaited<ReturnType<typeof getServerSession>>);
  });

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(null);
    const res = await GET(makeReq(""));
    expect(res.status).toBe(401);
  });

  it("returns 403 for DATA_USER role", async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce({
      user: { name: "Researcher", email: "r@test.example" },
      roles: ["DATA_USER"],
    } as unknown as Awaited<ReturnType<typeof getServerSession>>);
    const res = await GET(makeReq(""));
    expect(res.status).toBe(403);
  });

  it("skips the consent query when no patientId is supplied", async () => {
    // Only two queries run when patientId is absent (no consent or
    // condition query).
    mockRunQuery
      .mockResolvedValueOnce([]) // insights (empty → demo fallback)
      .mockResolvedValueOnce([]); // SPE sessions

    const res = await GET(makeReq(""));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.patientId).toBeNull();
    expect(data.activeDonations).toBe(0);
    // runQuery should have been called exactly twice (insights + spe)
    expect(mockRunQuery).toHaveBeenCalledTimes(2);
    // Without a patient there are no conditions: the general recommendation
    expect(data.recommendations).toEqual([
      expect.objectContaining({ category: "general" }),
    ]);
  });

  it("returns seeded insights when graph has ResearchInsight nodes", async () => {
    const seeded = [
      {
        insightId: "ri-001",
        studyId: "study-seeded",
        finding: "Seeded finding",
        relevantConditions: ["E11"],
        recommendation: "Consult physician",
        evidenceLevel: "high",
      },
    ];
    mockRunQuery
      .mockResolvedValueOnce([
        {
          studyId: "study-seeded",
          studyName: "Seeded Study",
          grantedAt: "2025-01-01T00:00:00Z",
          status: "active",
        },
      ]) // consents
      .mockResolvedValueOnce(seeded) // insights
      .mockResolvedValueOnce([
        {
          studyId: "study-seeded",
          outputPolicy: "aggregate-only",
          status: "active",
        },
      ]) // spe
      .mockResolvedValueOnce([]); // conditions

    const res = await GET(makeReq("?patientId=p-1"));
    const data = await res.json();

    expect(data.findings).toEqual(seeded);
    expect(data.activeDonations).toBe(1);
    expect(data.activeStudies).toBe(1);
    expect(data.donatedStudies[0].studyId).toBe("study-seeded");
  });

  it("falls back to the two demo insights when graph is empty", async () => {
    mockRunQuery
      .mockResolvedValueOnce([]) // consents
      .mockResolvedValueOnce([]) // no insights → trigger demo fallback
      .mockResolvedValueOnce([]) // spe
      .mockResolvedValueOnce([]); // conditions

    const res = await GET(makeReq("?patientId=p-1"));
    const data = await res.json();
    expect(data.findings).toHaveLength(2);
    expect(data.findings[0].insightId).toBe("demo-insight-001");
    expect(data.findings[1].insightId).toBe("demo-insight-002");
    // First demo insight concerns diabetes/cardio relationship (evidence: high)
    expect(data.findings[0].evidenceLevel).toBe("high");
    expect(data.findings[1].evidenceLevel).toBe("moderate");
  });

  it("returns the EHDS article refs and the privacy note", async () => {
    mockRunQuery.mockResolvedValue([]);

    const res = await GET(makeReq("?patientId=p-1"));
    const data = await res.json();

    expect(data.ehdsArticles).toEqual({
      primaryAccess: "EHDS Art. 3",
      secondaryConsent:
        "EHDS Art. 71 — secondary use is the default, with an opt-out; joining a study is a separate GDPR consent",
      speProtection: "EHDS Art. 73",
    });
    // k-anonymity note is part of the contract
    expect(data.privacyNote).toContain("aggregate");
    expect(data.privacyNote).toContain("k");
  });

  describe("recommendations follow the patient's conditions", () => {
    /** Answers the condition query with these rows, every other with []. */
    function withConditions(rows: { code: string; display: string }[]) {
      mockRunQuery.mockImplementation((cypher: string) =>
        Promise.resolve(cypher.includes("HAS_CONDITION") ? rows : []),
      );
    }

    function categories(data: { recommendations: { category: string }[] }) {
      return data.recommendations.map((r) => r.category);
    }

    it("reads the conditions of the named patient, parameterised", async () => {
      withConditions([]);
      await GET(makeReq("?patientId=p-7"));
      const call = mockRunQuery.mock.calls.find(([cypher]) =>
        String(cypher).includes("HAS_CONDITION"),
      );
      expect(call).toBeDefined();
      expect(call?.[0]).toContain("$patientId");
      expect(call?.[0]).not.toContain("p-7");
      expect(call?.[1]).toEqual({ patientId: "p-7" });
    });

    it("gives a cardiovascular patient the cardiovascular one only", async () => {
      withConditions([
        { code: "38341003", display: "Hypertension" },
        { code: "I25.10", display: "Coronary arteriosclerosis" },
      ]);
      const data = await (await GET(makeReq("?patientId=p-1"))).json();
      expect(categories(data)).toEqual(["cardiovascular"]);
      expect(data.recommendations[0].action).toContain("ECG");
    });

    it("gives a diabetes patient HbA1c monitoring and the T2D programme", async () => {
      withConditions([
        { code: "44054006", display: "Diabetes mellitus type 2 (disorder)" },
      ]);
      const data = await (await GET(makeReq("?patientId=p-2"))).json();
      expect(categories(data)).toEqual(["diabetes", "longevity"]);
      expect(data.recommendations[0].action).toContain("HbA1c");
    });

    it("matches on the display text when the code is unknown", async () => {
      withConditions([{ code: "", display: "Essential hypertension" }]);
      const data = await (await GET(makeReq("?patientId=p-4"))).json();
      expect(categories(data)).toEqual(["cardiovascular"]);
    });

    it("gives a patient with neither one general recommendation", async () => {
      withConditions([
        { code: "195662009", display: "Acute viral pharyngitis (disorder)" },
        { code: "J45", display: "Asthma" },
      ]);
      const data = await (await GET(makeReq("?patientId=p-3"))).json();
      expect(data.recommendations).toHaveLength(1);
      expect(data.recommendations[0]).toMatchObject({
        category: "general",
        priority: "medium",
      });
      expect(categories(data)).not.toContain("cardiovascular");
      expect(categories(data)).not.toContain("diabetes");
    });
  });
});

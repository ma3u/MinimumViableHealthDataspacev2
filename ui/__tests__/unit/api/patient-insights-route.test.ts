/**
 * Tests for /api/patient/insights/route.ts
 *
 * EHDS Art. 50 §4 — patients receive anonymised aggregate findings from
 * studies using their donated data. Never returns pseudonym IDs or
 * individual-level results. Tests cover:
 *   - Auth (401/403)
 *   - Seeded ResearchInsight nodes are returned as-is
 *   - Empty graph falls back to two demo insights (demo-insight-001/002)
 *   - Consent query is skipped when no patientId is supplied
 *   - Response includes the EHDS article references and privacy note
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
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
    // Only two queries run when patientId is absent (no consent query).
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
      ]); // spe

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
      .mockResolvedValueOnce([]); // spe

    const res = await GET(makeReq("?patientId=p-1"));
    const data = await res.json();
    expect(data.findings).toHaveLength(2);
    expect(data.findings[0].insightId).toBe("demo-insight-001");
    expect(data.findings[1].insightId).toBe("demo-insight-002");
    // First demo insight concerns diabetes/cardio relationship (evidence: high)
    expect(data.findings[0].evidenceLevel).toBe("high");
    expect(data.findings[1].evidenceLevel).toBe("moderate");
  });

  it("always returns the static recommendations and EHDS article refs", async () => {
    mockRunQuery
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const res = await GET(makeReq("?patientId=p-1"));
    const data = await res.json();

    expect(data.recommendations).toHaveLength(3);
    const categories = data.recommendations.map(
      (r: { category: string }) => r.category,
    );
    expect(categories).toEqual(["cardiovascular", "diabetes", "longevity"]);

    expect(data.ehdsArticles).toEqual({
      primaryAccess: "EHDS Art. 3",
      secondaryConsent: "EHDS Art. 10",
      speProtection: "EHDS Art. 50",
    });
    // k-anonymity note is part of the contract
    expect(data.privacyNote).toContain("aggregate");
    expect(data.privacyNote).toContain("k");
  });
});

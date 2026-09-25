/**
 * GET /api/information: the Art. 58(1) items that come from the graph.
 * Issue #206, M6.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/neo4j", () => ({
  runQuery: vi.fn(),
}));

import { runQuery } from "@/lib/neo4j";
import { GET } from "@/app/api/information/route";

const mockRunQuery = vi.mocked(runQuery);

describe("GET /api/information", () => {
  beforeEach(() => {
    mockRunQuery.mockReset();
  });

  it("serves the bodies, who has access, the results, the opt-outs and the fee schedule", async () => {
    mockRunQuery
      .mockResolvedValueOnce([
        {
          name: "MedReg DE",
          did: "did:web:medreg.de:hdab",
          country: "DE",
          contactName: null,
          contactEmail: null,
        },
      ])
      .mockResolvedValueOnce([
        {
          permitId: "hdab-irs-lmc-2026-001",
          applicant: "Limburg Medical Centre",
          datasetTitle: "EU Cardiac Outcomes Registry 2025",
          purpose: "SCIENTIFIC_RESEARCH",
          validUntil: "2027-02-20T23:59:59Z",
          status: "APPROVED",
        },
      ])
      .mockResolvedValueOnce([
        { resultId: "r1", kind: "PUBLICATION", title: "x" },
      ])
      .mockResolvedValueOnce([{ optedOut: 1, patients: 127 }]);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.article).toContain("Art. 58(1)");
    expect(body.bodies[0].name).toBe("MedReg DE");
    expect(body.access[0].resultsDue).toBe("2028-08-20T23:59:59.000Z");
    expect(body.results).toHaveLength(1);
    expect(body.optOut).toEqual({
      article: "Art. 71",
      optedOut: 1,
      patients: 127,
    });
    expect(body.retention.months).toBe(12);
    expect(body.fees.reductions.ACADEMIC).toBe(0.5);
    expect(body.fees.requestEur).toBe(300);
  });

  it("502s when the graph is away", async () => {
    mockRunQuery.mockRejectedValue(new Error("down"));
    expect((await GET()).status).toBe(502);
  });
});

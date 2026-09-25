/**
 * The public register publishes the measures taken on non-compliance
 * (Art. 57(1)(j)(iv)). Issue #206, M4.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/neo4j", () => ({
  runQuery: vi.fn(),
}));

import { runQuery } from "@/lib/neo4j";
import { GET } from "@/app/api/permits/route";

const mockRunQuery = vi.mocked(runQuery);

describe("GET /api/permits measures", () => {
  beforeEach(() => {
    mockRunQuery.mockReset();
  });

  it("lists closed findings with a measure, and the clock state of applications", async () => {
    mockRunQuery
      .mockResolvedValueOnce([
        {
          applicationId: "app-1",
          applicant: "PharmaCo Research AG",
          applicationStatus: "PENDING",
          decision: "",
          submittedAt: "2026-09-01T09:00:00Z",
          extendedAt: "2026-09-20T00:00:00Z",
          complete: true,
          conditions: [],
        },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          findingId: "f1",
          party: "PharmaCo Research AG",
          measure: "REVOCATION",
          note: "Identifiers left the SPE",
          closedAt: "2026-09-20T10:00:00Z",
        },
      ]);
    const body = await (await GET()).json();
    expect(body.measures).toHaveLength(1);
    expect(body.measures[0].measure).toBe("REVOCATION");
    expect(body.articles.measures).toContain("Art. 57(1)(j)(iv)");
    expect(body.entries[0].clockState).toBe("extended");
    expect(body.entries[0].complete).toBe(true);
    const measuresQuery = String(mockRunQuery.mock.calls[2][0]);
    expect(measuresQuery).toContain("f.measure <> 'NONE'");
    expect(measuresQuery).toContain("'CLOSED'");
  });
});

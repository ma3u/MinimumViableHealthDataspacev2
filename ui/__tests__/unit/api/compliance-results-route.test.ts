/**
 * Results communicated by data users (Art. 61(4)). Issue #206, M6.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/neo4j", () => ({
  runQuery: vi.fn(),
}));

import { runQuery } from "@/lib/neo4j";
import { requireAuth } from "@/lib/auth-guard";
import { GET, POST } from "@/app/api/compliance/results/route";

const mockRunQuery = vi.mocked(runQuery);
const mockRequireAuth = vi.mocked(requireAuth);

const RESEARCHER = {
  session: {
    user: {
      id: "researcher",
      name: "Researcher",
      email: "researcher@pharmaco.de",
    },
    roles: ["EDC_USER_PARTICIPANT", "DATA_USER"],
    accessToken: "",
  },
};
const PERMIT = {
  permitId: "permit-app-1",
  status: "APPROVED",
  applicantId: "did:web:pharmaco.de:research",
  validUntil: "2027-09-25T00:00:00Z",
};

function post(body: unknown) {
  return new NextRequest("http://localhost/api/compliance/results", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("POST /api/compliance/results", () => {
  beforeEach(() => {
    mockRunQuery.mockReset();
    mockRequireAuth.mockResolvedValue(RESEARCHER as never);
  });

  it("needs the permit, a known kind and a title", async () => {
    const res = await POST(post({ permitId: "permit-app-1", kind: "SONG" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("Art. 61(4)");
  });

  it("records a publication within the 18 months", async () => {
    mockRunQuery.mockResolvedValueOnce([PERMIT]).mockResolvedValueOnce([]);
    const res = await POST(
      post({
        permitId: "permit-app-1",
        kind: "publication",
        title: "HbA1c trajectories",
        summary: "Aggregate only.",
        url: "https://example.org/paper",
      }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.resultId).toMatch(/^result-app-1-/);
    expect(body.deadline).toBe("2029-03-25T00:00:00.000Z");
    expect(body.onTime).toBe(true);
    const params = mockRunQuery.mock.calls[1][1] as Record<string, unknown>;
    expect(params.kind).toBe("PUBLICATION");
    expect(params.url).toBe("https://example.org/paper");
  });

  it("marks a late communication", async () => {
    mockRunQuery
      .mockResolvedValueOnce([
        { ...PERMIT, validUntil: "2020-01-01T00:00:00Z" },
      ])
      .mockResolvedValueOnce([]);
    const res = await POST(
      post({
        permitId: "permit-app-1",
        kind: "IT_PRODUCT",
        title: "A dashboard",
      }),
    );
    const body = await res.json();
    expect(body.onTime).toBe(false);
    expect(body.article).toContain("after the 18 months");
  });

  it("is the permit holder's own action, on an issued permit", async () => {
    mockRunQuery.mockResolvedValueOnce([
      { ...PERMIT, applicantId: "did:web:lmc.nl:clinic" },
    ]);
    let res = await POST(
      post({ permitId: "permit-app-1", kind: "OTHER", title: "x" }),
    );
    expect(res.status).toBe(403);
    mockRunQuery.mockResolvedValueOnce([{ ...PERMIT, status: "REJECTED" }]);
    res = await POST(
      post({ permitId: "permit-app-1", kind: "OTHER", title: "x" }),
    );
    expect(res.status).toBe(409);
  });

  it("GET is public and lists every result", async () => {
    mockRunQuery.mockResolvedValueOnce([
      { resultId: "r1", kind: "PUBLICATION" },
    ]);
    const body = await (await GET()).json();
    expect(body.results).toHaveLength(1);
    expect(body.article).toContain("Art. 57(1)(j)(v)");
  });
});

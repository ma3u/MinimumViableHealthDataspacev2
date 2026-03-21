/**
 * Unit tests for /api/admin/policies route — focusing on uncovered branches.
 *
 * Covers: GET Neo4j fallback, mock-file fallback, per-participant error handling,
 * POST Neo4j offline persist, policyId generation variants, 502 error paths.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Mocks ────────────────────────────────────────────────────────────
const mockManagement = vi.fn();
vi.mock("@/lib/edc", () => ({
  edcClient: { management: (...args: unknown[]) => mockManagement(...args) },
  EDC_CONTEXT: "https://w3id.org/edc/connector/management/v2",
}));

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

const mockReadFile = vi.fn();
vi.mock("fs", () => ({
  default: {
    promises: {
      readFile: (...args: unknown[]) => mockReadFile(...args),
    },
  },
  promises: {
    readFile: (...args: unknown[]) => mockReadFile(...args),
  },
}));

import { GET, POST } from "@/app/api/admin/policies/route";

// ── Helpers ──────────────────────────────────────────────────────────
function neo4jOk(results: unknown[] = []) {
  return {
    ok: true,
    json: () => Promise.resolve({ results, errors: [] }),
  } as unknown as Response;
}

function neo4jHttpError(status = 500) {
  return { ok: false, status } as unknown as Response;
}

function neo4jCypherError(msg = "syntax error") {
  return {
    ok: true,
    json: () => Promise.resolve({ results: [], errors: [{ message: msg }] }),
  } as unknown as Response;
}

// ── Setup ────────────────────────────────────────────────────────────
beforeEach(() => {
  vi.clearAllMocks();
  mockFetch.mockReset();
  mockReadFile.mockReset();
});

// =====================================================================
// GET /api/admin/policies
// =====================================================================
describe("GET /api/admin/policies", () => {
  // ── EDC success paths (supplement existing tests) ──────────────────

  it("should return source:'edc' when fetching by participantId", async () => {
    mockManagement.mockResolvedValue([{ "@id": "pol-1" }]);

    const req = new NextRequest(
      "http://localhost:3000/api/admin/policies?participantId=ctx-1",
    );
    const res = await GET(req);
    const data = await res.json();

    expect(data.source).toBe("edc");
    expect(data.participantId).toBe("ctx-1");
  });

  it("should handle per-participant failure in aggregate mode", async () => {
    // First call: list participants
    mockManagement.mockResolvedValueOnce([
      { "@id": "ctx-1", identity: "did:web:alpha-klinik.de" },
      { "@id": "ctx-2", identity: "did:web:pharmaco.de" },
    ]);
    // Second call: ctx-1 succeeds
    mockManagement.mockResolvedValueOnce([{ "@id": "pol-1" }]);
    // Third call: ctx-2 fails
    mockManagement.mockRejectedValueOnce(new Error("timeout"));

    const req = new NextRequest("http://localhost:3000/api/admin/policies");
    const res = await GET(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.participants).toHaveLength(2);
    // First participant succeeded
    expect(data.participants[0].policies).toEqual([{ "@id": "pol-1" }]);
    expect(data.participants[0].source).toBe("edc");
    // Second participant failed gracefully
    expect(data.participants[1].policies).toEqual([]);
    expect(data.participants[1].error).toBe("Failed to fetch policies");
  });

  it("should include identity field in aggregate results", async () => {
    mockManagement
      .mockResolvedValueOnce([
        { "@id": "ctx-1", identity: "did:web:alpha-klinik.de" },
      ])
      .mockResolvedValueOnce([]);

    const req = new NextRequest("http://localhost:3000/api/admin/policies");
    const res = await GET(req);
    const data = await res.json();

    expect(data.participants[0].identity).toBe("did:web:alpha-klinik.de");
    expect(data.participants[0].participantId).toBe("ctx-1");
  });

  // ── EDC offline → Neo4j fallback ──────────────────────────────────

  it("should fall back to Neo4j when EDC is offline (no participantId)", async () => {
    mockManagement.mockRejectedValue(new Error("ECONNREFUSED"));
    mockFetch.mockResolvedValue(
      neo4jOk([
        {
          columns: ["policy"],
          data: [
            { row: [{ id: "pol-neo4j", participantName: "AlphaKlinik" }] },
          ],
        },
      ]),
    );

    const req = new NextRequest("http://localhost:3000/api/admin/policies");
    const res = await GET(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.source).toBe("neo4j");
    expect(data.offline).toBe(true);
    expect(data.policies).toHaveLength(1);
    expect(data.policies[0].id).toBe("pol-neo4j");
  });

  it("should fall back to Neo4j with participantId filter", async () => {
    mockManagement.mockRejectedValue(new Error("ECONNREFUSED"));
    mockFetch.mockResolvedValue(
      neo4jOk([
        {
          columns: ["policy"],
          data: [{ row: [{ id: "pol-filtered" }] }],
        },
      ]),
    );

    const req = new NextRequest(
      "http://localhost:3000/api/admin/policies?participantId=ctx-1",
    );
    const res = await GET(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.source).toBe("neo4j");
    // Verify the participantId parameter was passed to Neo4j
    const fetchCall = mockFetch.mock.calls[0];
    const body = JSON.parse(fetchCall[1].body);
    expect(body.statements[0].parameters).toEqual({ participantId: "ctx-1" });
  });

  it("should return empty policies array when Neo4j has no results", async () => {
    mockManagement.mockRejectedValue(new Error("ECONNREFUSED"));
    mockFetch.mockResolvedValue(neo4jOk([{ columns: ["policy"], data: [] }]));

    const req = new NextRequest("http://localhost:3000/api/admin/policies");
    const res = await GET(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.policies).toEqual([]);
    expect(data.source).toBe("neo4j");
  });

  // ── EDC offline + Neo4j offline → mock file fallback ──────────────

  it("should serve bundled mock data when both EDC and Neo4j are offline", async () => {
    mockManagement.mockRejectedValue(new Error("ECONNREFUSED"));
    mockFetch.mockResolvedValue(neo4jHttpError(500));
    mockReadFile.mockResolvedValue(
      JSON.stringify({ policies: [{ id: "mock-pol" }], source: "mock" }),
    );

    const req = new NextRequest("http://localhost:3000/api/admin/policies");
    const res = await GET(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.source).toBe("mock");
  });

  it("should serve mock data when Neo4j returns Cypher errors", async () => {
    mockManagement.mockRejectedValue(new Error("ECONNREFUSED"));
    mockFetch.mockResolvedValue(neo4jCypherError("syntax error"));
    mockReadFile.mockResolvedValue(
      JSON.stringify({ policies: [], source: "mock" }),
    );

    const req = new NextRequest("http://localhost:3000/api/admin/policies");
    const res = await GET(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.source).toBe("mock");
  });

  // ── All fallbacks fail → 502 ──────────────────────────────────────

  it("should return 502 when EDC, Neo4j, and mock file all fail", async () => {
    mockManagement.mockRejectedValue(new Error("ECONNREFUSED"));
    mockFetch.mockResolvedValue(neo4jHttpError(503));
    mockReadFile.mockRejectedValue(new Error("ENOENT"));

    const req = new NextRequest("http://localhost:3000/api/admin/policies");
    const res = await GET(req);
    const data = await res.json();

    expect(res.status).toBe(502);
    expect(data.error).toBe("Failed to list policies");
    expect(data.detail).toBeDefined();
  });

  it("should include Neo4j error detail in 502 response", async () => {
    mockManagement.mockRejectedValue(new Error("ECONNREFUSED"));
    mockFetch.mockResolvedValue(neo4jHttpError(503));
    mockReadFile.mockRejectedValue(new Error("ENOENT"));

    const req = new NextRequest("http://localhost:3000/api/admin/policies");
    const res = await GET(req);
    const data = await res.json();

    expect(data.detail).toContain("Neo4j HTTP API error");
  });

  it("should return 502 with participantId when all fallbacks fail", async () => {
    mockManagement.mockRejectedValue(new Error("ECONNREFUSED"));
    mockFetch.mockResolvedValue(neo4jHttpError(404));
    mockReadFile.mockRejectedValue(new Error("ENOENT"));

    const req = new NextRequest(
      "http://localhost:3000/api/admin/policies?participantId=ctx-1",
    );
    const res = await GET(req);

    expect(res.status).toBe(502);
  });
});

// =====================================================================
// POST /api/admin/policies
// =====================================================================
describe("POST /api/admin/policies", () => {
  function postReq(body: unknown) {
    return new NextRequest("http://localhost:3000/api/admin/policies", {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  // ── Validation ─────────────────────────────────────────────────────

  it("should return 400 when body has no participantId", async () => {
    const res = await POST(
      postReq({ policy: { "@type": "PolicyDefinition" } }),
    );
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toContain("participantId");
  });

  it("should return 400 when body has no policy", async () => {
    const res = await POST(postReq({ participantId: "ctx-1" }));

    expect(res.status).toBe(400);
  });

  it("should return 400 when body is completely empty", async () => {
    const res = await POST(postReq({}));

    expect(res.status).toBe(400);
  });

  // ── EDC success ────────────────────────────────────────────────────

  it("should return 201 with EDC result on success", async () => {
    mockManagement.mockResolvedValue({
      "@id": "pol-new",
      "@type": "PolicyDefinition",
    });

    const res = await POST(
      postReq({
        participantId: "ctx-1",
        policy: { "@type": "PolicyDefinition", permission: [] },
      }),
    );
    const data = await res.json();

    expect(res.status).toBe(201);
    expect(data["@id"]).toBe("pol-new");
  });

  it("should forward EDC_CONTEXT and policy to management API", async () => {
    mockManagement.mockResolvedValue({ "@id": "pol-new" });

    await POST(
      postReq({
        participantId: "ctx-1",
        policy: { "@type": "PolicyDefinition", myProp: "test" },
      }),
    );

    expect(mockManagement).toHaveBeenCalledWith(
      "/v5alpha/participants/ctx-1/policydefinitions",
      "POST",
      expect.objectContaining({
        "@context": ["https://w3id.org/edc/connector/management/v2"],
        "@type": "PolicyDefinition",
        myProp: "test",
      }),
    );
  });

  // ── EDC offline → Neo4j fallback ──────────────────────────────────

  it("should persist policy in Neo4j when EDC is offline (policy has @id)", async () => {
    mockManagement.mockRejectedValue(new Error("ECONNREFUSED"));
    mockFetch.mockResolvedValue(neo4jOk());

    const res = await POST(
      postReq({
        participantId: "ctx-1",
        policy: { "@id": "custom-pol-id", "@type": "PolicyDefinition" },
      }),
    );
    const data = await res.json();

    expect(res.status).toBe(201);
    expect(data["@id"]).toBe("custom-pol-id");
    expect(data.source).toBe("neo4j");
    expect(data.offline).toBe(true);
  });

  it("should use policy.id when @id is not present", async () => {
    mockManagement.mockRejectedValue(new Error("ECONNREFUSED"));
    mockFetch.mockResolvedValue(neo4jOk());

    const res = await POST(
      postReq({
        participantId: "ctx-1",
        policy: { id: "my-policy-id", "@type": "PolicyDefinition" },
      }),
    );
    const data = await res.json();

    expect(data["@id"]).toBe("my-policy-id");
  });

  it("should generate local policyId when neither @id nor id is present", async () => {
    mockManagement.mockRejectedValue(new Error("ECONNREFUSED"));
    mockFetch.mockResolvedValue(neo4jOk());

    const res = await POST(
      postReq({
        participantId: "ctx-1",
        policy: { "@type": "PolicyDefinition" },
      }),
    );
    const data = await res.json();

    expect(data["@id"]).toMatch(/^policy:local:\d+$/);
  });

  it("should send correct Cypher parameters to Neo4j for persist", async () => {
    mockManagement.mockRejectedValue(new Error("ECONNREFUSED"));
    mockFetch.mockResolvedValue(neo4jOk());

    await POST(
      postReq({
        participantId: "ctx-1",
        policy: { "@id": "pol-99", "@type": "PolicyDefinition" },
      }),
    );

    const fetchCall = mockFetch.mock.calls[0];
    const body = JSON.parse(fetchCall[1].body);
    const params = body.statements[0].parameters;

    expect(params.policyId).toBe("pol-99");
    expect(params.participantId).toBe("ctx-1");
    expect(params.policyJson).toContain('"@id":"pol-99"');
    expect(params.createdAt).toBeDefined();
  });

  // ── EDC offline + Neo4j fails → 502 ──────────────────────────────

  it("should return 502 when both EDC and Neo4j fail on POST", async () => {
    mockManagement.mockRejectedValue(new Error("ECONNREFUSED"));
    mockFetch.mockResolvedValue(neo4jHttpError(500));

    const res = await POST(
      postReq({
        participantId: "ctx-1",
        policy: { "@type": "PolicyDefinition" },
      }),
    );
    const data = await res.json();

    expect(res.status).toBe(502);
    expect(data.error).toBe("Failed to create policy");
  });

  it("should return 502 when Neo4j returns Cypher errors on POST", async () => {
    mockManagement.mockRejectedValue(new Error("ECONNREFUSED"));
    mockFetch.mockResolvedValue(neo4jCypherError("constraint violation"));

    const res = await POST(
      postReq({
        participantId: "ctx-1",
        policy: { "@id": "pol-1" },
      }),
    );

    expect(res.status).toBe(502);
  });
});

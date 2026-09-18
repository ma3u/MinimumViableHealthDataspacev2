/**
 * API route tests for GET /api/federated and POST/GET /api/nlq
 *
 * These routes proxy to the neo4j-proxy service.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Mock global fetch for proxy calls
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// The permit headers come from the graph (issue #206); the routes must not
// reach a real Neo4j from a unit test.
vi.mock("@/lib/permit-gate", () => ({
  activePermitHeaders: vi.fn().mockResolvedValue({
    "X-Permit": "permit-test",
    "X-Dataset": "dataset:synthea-fhir-r4-mvd",
  }),
  // POST /api/nlq stands behind the secondary-use gate (Art. 61(1)); by
  // default it lets the caller through with the permit's audit headers.
  gateSecondaryUse: vi.fn().mockResolvedValue({
    allowed: true,
    check: null,
    headers: {
      "X-Permit": "permit-test",
      "X-Dataset": "dataset:synthea-fhir-r4-mvd",
    },
  }),
}));

// POST /api/nlq resolves the caller's ODRL scope before it proxies, and that
// goes to Neo4j over Bolt, not through fetch. Without this mock the test hangs
// on a real connection attempt until vitest times out at 5s.
//
// It used to pass anyway, because another test file mocks this module and
// vitest module mocks leak between files sharing a worker. That made the
// failure depend on file order: green in a full run, red under `--bail 1`,
// which is what the pre-push hook uses. Mocked here so this file stands alone.
// importActual, not a bare factory: the route also imports
// userToParticipantId from this module, and replacing the whole module drops
// it, so the route throws and answers 502 instead of proxying. Only the call
// that reaches Neo4j is overridden.
vi.mock("@/lib/odrl-engine", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/odrl-engine")>()),
  resolveOdrlScope: vi.fn().mockResolvedValue({
    participantName: "AlphaKlinik Berlin",
    permissions: ["read"],
    prohibitions: [],
    datasetIds: [],
  }),
}));

describe("/api/federated", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should proxy federated stats from neo4j-proxy", async () => {
    const mockData = {
      participants: 3,
      datasets: 5,
      totalRecords: 10000,
    };

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => mockData,
    });

    // Import after mocking
    const { GET } = await import("@/app/api/federated/route");
    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.participants).toBe(3);
    // The proxy records the request as a TransferEvent; the header is what
    // names the caller in the audit trail (issue #205).
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/federated/stats"),
      expect.objectContaining({
        headers: expect.objectContaining({
          "X-Participant": expect.stringMatching(/^did:web:/),
        }),
      }),
    );
  });

  it("should return 502 when proxy is unavailable", async () => {
    mockFetch.mockRejectedValue(new Error("ECONNREFUSED"));

    const { GET } = await import("@/app/api/federated/route");
    const response = await GET();

    expect(response.status).toBe(502);
    const data = await response.json();
    expect(data.error).toBeDefined();
  });
});

describe("/api/nlq", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("GET should return NLQ templates", async () => {
    const mockTemplates = [
      {
        id: "t1",
        name: "Count patients",
        query: "MATCH (p:Patient) RETURN count(p)",
      },
    ];

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => mockTemplates,
    });

    const { GET } = await import("@/app/api/nlq/route");
    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toHaveLength(1);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/nlq/templates"),
    );
  });

  it("POST should forward NLQ query to proxy", async () => {
    const mockResult = {
      cypher: "MATCH (p:Patient) RETURN count(p)",
      results: [{ count: 100 }],
    };

    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockResult,
    });

    const { POST } = await import("@/app/api/nlq/route");
    const req = new NextRequest("http://localhost:3000/api/nlq", {
      method: "POST",
      body: JSON.stringify({ question: "How many patients?" }),
    });
    const response = await POST(req);
    const data = await response.json();

    expect(data.cypher).toBeDefined();
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/nlq"),
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("POST should return 502 when proxy fails", async () => {
    mockFetch.mockRejectedValue(new Error("Connection refused"));

    const { POST } = await import("@/app/api/nlq/route");
    const req = new NextRequest("http://localhost:3000/api/nlq", {
      method: "POST",
      body: JSON.stringify({ question: "test" }),
    });
    const response = await POST(req);

    expect(response.status).toBe(502);
  });

  it("POST forwards the gate's permit headers to the proxy", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ results: [] }),
    });

    const { POST } = await import("@/app/api/nlq/route");
    const req = new NextRequest("http://localhost:3000/api/nlq", {
      method: "POST",
      body: JSON.stringify({ question: "How many patients?" }),
    });
    await POST(req);

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/nlq"),
      expect.objectContaining({
        headers: expect.objectContaining({
          "X-Participant": expect.stringMatching(/^did:web:/),
          "X-Permit": "permit-test",
          "X-Dataset": "dataset:synthea-fhir-r4-mvd",
        }),
      }),
    );
  });

  it("POST refuses a data user without a permit and never reaches the proxy (Art. 61(1))", async () => {
    const { gateSecondaryUse } = await import("@/lib/permit-gate");
    vi.mocked(gateSecondaryUse).mockResolvedValueOnce({
      allowed: false,
      status: 403,
      body: {
        error: "No data permit covers this query",
        reason:
          "did:web:pharmaco.de:research holds no data permit: no health data access body has decided on an access application for this participant.",
        article: "Regulation (EU) 2025/327, Art. 61(1) and Art. 68",
        consumerDid: "did:web:pharmaco.de:research",
        permitId: null,
        odrlEnforced: true,
      },
    });

    const { POST } = await import("@/app/api/nlq/route");
    const req = new NextRequest("http://localhost:3000/api/nlq", {
      method: "POST",
      body: JSON.stringify({ question: "How many patients?" }),
    });
    const response = await POST(req);
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data.error).toBe("No data permit covers this query");
    expect(data.article).toContain("Art. 61(1)");
    expect(data.odrlEnforced).toBe(true);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("POST checks the dataset the caller names, as a transfer would", async () => {
    const { gateSecondaryUse } = await import("@/lib/permit-gate");
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ results: [] }),
    });

    const { POST } = await import("@/app/api/nlq/route");
    const req = new NextRequest("http://localhost:3000/api/nlq", {
      method: "POST",
      body: JSON.stringify({
        question: "How many patients?",
        datasetId: "dataset:journey40-x",
      }),
    });
    await POST(req);

    expect(gateSecondaryUse).toHaveBeenCalledWith(
      expect.objectContaining({
        datasetId: "dataset:journey40-x",
        what: "query",
        roles: expect.any(Array),
      }),
    );
  });
});

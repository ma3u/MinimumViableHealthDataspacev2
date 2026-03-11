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
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/federated/stats"),
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
});

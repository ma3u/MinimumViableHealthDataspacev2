/**
 * API route tests for GET /api/compliance/tck
 *
 * Tests the combined compliance scorecard endpoint which fetches DSP+DCP
 * results from neo4j-proxy /tck, then runs EHDS Neo4j queries directly.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock neo4j before import
vi.mock("@/lib/neo4j", () => ({
  runQuery: vi.fn(),
}));

// Mock global fetch for neo4j-proxy /tck
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import { runQuery } from "@/lib/neo4j";
import { GET } from "@/app/api/compliance/tck/route";

const mockRunQuery = vi.mocked(runQuery);

/** Helper: create DSP + DCP test results as the proxy would return */
function makeDspDcpResults(status: "pass" | "fail") {
  return [
    {
      id: "DSP-1",
      category: "Schema Compliance",
      suite: "DSP",
      name: "Catalog endpoint",
      status,
      detail: "ok",
    },
    {
      id: "DSP-2",
      category: "Schema Compliance",
      suite: "DSP",
      name: "Negotiation endpoint",
      status,
      detail: "ok",
    },
    {
      id: "DCP-1",
      category: "DID Resolution",
      suite: "DCP",
      name: "IdentityHub",
      status,
      detail: "ok",
    },
    {
      id: "DCP-2",
      category: "DID Resolution",
      suite: "DCP",
      name: "KeyPairs",
      status,
      detail: "ok",
    },
  ];
}

describe("GET /api/compliance/tck", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return all-pass when proxy and Neo4j succeed", async () => {
    // neo4j-proxy /tck returns DSP + DCP results
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ results: makeDspDcpResults("pass") }),
    });

    // All 6 Neo4j EHDS queries return positive counts
    mockRunQuery
      .mockResolvedValueOnce([{ count: 5 }]) // HealthDataset
      .mockResolvedValueOnce([{ count: 3 }]) // EEHRxF
      .mockResolvedValueOnce([{ count: 10 }]) // OMOPPerson
      .mockResolvedValueOnce([{ count: 2 }]) // HDABApproval
      .mockResolvedValueOnce([{ count: 4 }]) // VerifiableCredential
      .mockResolvedValueOnce([{ count: 200 }]); // Total nodes

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.summary.failed).toBe(0);
    expect(data.summary.total).toBe(10); // 4 proxy + 6 EHDS
    expect(data.suites.DSP).toBeDefined();
    expect(data.suites.DCP).toBeDefined();
    expect(data.suites.EHDS).toBeDefined();
    expect(data.suites.DSP.total).toBe(2);
    expect(data.suites.DCP.total).toBe(2);
    expect(data.suites.EHDS.total).toBe(6);
  });

  it("should return fail results when proxy and EHDS fail", async () => {
    // Proxy returns error status
    mockFetch.mockResolvedValue({ ok: false, status: 500 });

    // EHDS queries return zero counts
    mockRunQuery.mockResolvedValue([{ count: 0 }]);

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    // DSP-ERR + DCP-ERR + 6 EHDS (all fail) = 8 total, 0 passed
    expect(data.summary.passed).toBe(0);
    expect(data.summary.failed).toBe(data.summary.total);
  });

  it("should handle Neo4j connection failure gracefully", async () => {
    // Proxy works fine
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ results: makeDspDcpResults("pass") }),
    });

    // Neo4j throws
    mockRunQuery.mockRejectedValue(new Error("Neo4j connection refused"));

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    // DSP and DCP should still pass
    expect(data.suites.DSP.results.length).toBeGreaterThan(0);
    expect(data.suites.DCP.results.length).toBeGreaterThan(0);
    // EHDS should have error result
    const ehdsResults = data.suites.EHDS.results;
    expect(
      ehdsResults.some((r: { status: string }) => r.status === "fail"),
    ).toBe(true);
  });

  it("should handle fetch network errors gracefully", async () => {
    // Proxy unreachable
    mockFetch.mockRejectedValue(new Error("Network unreachable"));

    // Neo4j queries succeed
    mockRunQuery.mockResolvedValue([{ count: 5 }]);

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    // DSP and DCP should have error entries
    const dspResults = data.suites.DSP.results;
    expect(
      dspResults.every((r: { status: string }) => r.status === "fail"),
    ).toBe(true);
    // EHDS should still pass
    expect(data.suites.EHDS.passed).toBeGreaterThan(0);
  });

  it("should include timestamp and summary structure", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ results: [] }),
    });
    mockRunQuery.mockResolvedValue([{ count: 1 }]);

    const response = await GET();
    const data = await response.json();

    expect(data.timestamp).toBeDefined();
    expect(data.summary).toEqual(
      expect.objectContaining({
        total: expect.any(Number),
        passed: expect.any(Number),
        failed: expect.any(Number),
        skipped: expect.any(Number),
      }),
    );
  });
});

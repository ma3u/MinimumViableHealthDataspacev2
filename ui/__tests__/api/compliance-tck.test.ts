/**
 * API route tests for GET /api/compliance/tck
 *
 * Tests the combined compliance scorecard endpoint which probes DSP, DCP,
 * and EHDS (Neo4j) layers. All external calls are mocked.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock neo4j before import
vi.mock("@/lib/neo4j", () => ({
  runQuery: vi.fn(),
}));

// Mock global fetch for probe/probeJson
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import { runQuery } from "@/lib/neo4j";
import { GET } from "@/app/api/compliance/tck/route";

const mockRunQuery = vi.mocked(runQuery);

describe("GET /api/compliance/tck", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset env vars
    process.env.EDC_MANAGEMENT_URL =
      "http://health-dataspace-controlplane:8081/api/mgmt";
    process.env.EDC_IDENTITY_URL =
      "http://health-dataspace-identityhub:7081/api/identity";
    process.env.EDC_ISSUER_URL =
      "http://health-dataspace-issuerservice:10013/api/admin";
  });

  it("should return all-pass when every probe succeeds", async () => {
    // All HTTP probes succeed — return array to satisfy key-pair Array.isArray check
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => [{ "@type": "dcat:Catalog", id: "kp-1" }],
    });

    // All Neo4j queries return positive counts
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
    expect(data.summary.total).toBeGreaterThan(0);
    expect(data.suites.DSP).toBeDefined();
    expect(data.suites.DCP).toBeDefined();
    expect(data.suites.EHDS).toBeDefined();
    // 4 participants × catalog + readiness + liveness = 6 DSP tests
    expect(data.suites.DSP.total).toBe(6);
    // IdentityHub + 4 keypairs + IssuerService = 6 DCP tests
    expect(data.suites.DCP.total).toBe(6);
    // 6 EHDS graph queries
    expect(data.suites.EHDS.total).toBe(6);
  });

  it("should return fail results when probes fail", async () => {
    // All HTTP probes fail
    mockFetch.mockResolvedValue({ ok: false });

    // EHDS queries return zero counts
    mockRunQuery.mockResolvedValue([{ count: 0 }]);

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.summary.passed).toBe(0);
    expect(data.summary.failed).toBe(data.summary.total);
  });

  it("should handle Neo4j connection failure gracefully", async () => {
    // HTTP probes succeed
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({}) });

    // Neo4j throws
    mockRunQuery.mockRejectedValue(new Error("Neo4j connection refused"));

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    // Should still have DSP and DCP results
    expect(data.suites.DSP.results.length).toBeGreaterThan(0);
    expect(data.suites.DCP.results.length).toBeGreaterThan(0);
    // EHDS should have error result
    const ehdsResults = data.suites.EHDS.results;
    expect(
      ehdsResults.some((r: { status: string }) => r.status === "fail"),
    ).toBe(true);
  });

  it("should handle fetch network errors gracefully", async () => {
    // All fetch calls throw network error
    mockFetch.mockRejectedValue(new Error("Network unreachable"));

    // Neo4j queries succeed
    mockRunQuery.mockResolvedValue([{ count: 5 }]);

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    // All DSP and DCP tests should fail
    const dspResults = data.suites.DSP.results;
    expect(
      dspResults.every((r: { status: string }) => r.status === "fail"),
    ).toBe(true);
    // EHDS should still pass
    expect(data.suites.EHDS.passed).toBeGreaterThan(0);
  });

  it("should include timestamp and summary structure", async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({}) });
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

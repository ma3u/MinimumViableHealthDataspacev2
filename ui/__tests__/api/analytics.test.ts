/**
 * API route tests for GET /api/analytics
 *
 * Tests the OMOP analytics dashboard endpoint.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/neo4j", () => ({
  runQuery: vi.fn(),
}));

// The route stands behind the secondary-use gate (Art. 61(1), issue #206);
// mocked so the graph mock above only sees the six statistics queries.
vi.mock("@/lib/permit-gate", () => ({
  gateSecondaryUse: vi
    .fn()
    .mockResolvedValue({ allowed: true, check: null, headers: {} }),
}));

import { runQuery } from "@/lib/neo4j";
import { gateSecondaryUse } from "@/lib/permit-gate";
import { GET } from "@/app/api/analytics/route";

const mockRunQuery = vi.mocked(runQuery);
const mockGate = vi.mocked(gateSecondaryUse);

describe("GET /api/analytics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return summary and breakdowns", async () => {
    const mockSummary = {
      persons: 100,
      conditions: 250,
      drugs: 180,
      measurements: 500,
      procedures: 50,
      visits: 300,
    };

    mockRunQuery
      .mockResolvedValueOnce([mockSummary]) // summary
      .mockResolvedValueOnce([
        // topConditions
        { label: "Diabetes", count: 30 },
        { label: "Hypertension", count: 25 },
      ])
      .mockResolvedValueOnce([
        // topDrugs
        { label: "Metformin", count: 20 },
      ])
      .mockResolvedValueOnce([
        // topMeasurements
        { label: "HbA1c", count: 40 },
      ])
      .mockResolvedValueOnce([
        // topProcedures
        { label: "Blood draw", count: 15 },
      ])
      .mockResolvedValueOnce([
        // genderBreakdown
        { gender: "Male", count: 55 },
        { gender: "Female", count: 45 },
      ]);

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.summary.persons).toBe(100);
    expect(data.topConditions).toHaveLength(2);
    expect(data.topDrugs).toHaveLength(1);
    expect(data.topMeasurements).toHaveLength(1);
    expect(data.topProcedures).toHaveLength(1);
    expect(data.genderBreakdown).toHaveLength(2);
    // Should make 6 parallel queries
    expect(mockRunQuery).toHaveBeenCalledTimes(6);
  });

  it("should return defaults when OMOP layer is empty", async () => {
    mockRunQuery
      .mockResolvedValueOnce([]) // empty summary
      .mockResolvedValueOnce([]) // no conditions
      .mockResolvedValueOnce([]) // no drugs
      .mockResolvedValueOnce([]) // no measurements
      .mockResolvedValueOnce([]) // no procedures
      .mockResolvedValueOnce([]); // no gender data

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    // Should have default summary with zeros
    expect(data.summary.persons).toBe(0);
    expect(data.topConditions).toEqual([]);
  });

  it("refuses a data user without a permit before touching the graph (Art. 61(1))", async () => {
    mockGate.mockResolvedValueOnce({
      allowed: false,
      status: 403,
      body: {
        error: "No data permit covers this analysis",
        reason:
          "did:web:pharmaco.de:research holds no data permit: no health data access body has decided on an access application for this participant.",
        article: "Regulation (EU) 2025/327, Art. 61(1) and Art. 68",
        consumerDid: "did:web:pharmaco.de:research",
        permitId: null,
        odrlEnforced: true,
      },
    });

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data.error).toBe("No data permit covers this analysis");
    expect(data.article).toContain("Art. 61(1)");
    expect(mockRunQuery).not.toHaveBeenCalled();
    expect(mockGate).toHaveBeenCalledWith(
      expect.objectContaining({ what: "analysis" }),
    );
  });

  it("names the permit a data user's analysis ran under", async () => {
    mockGate.mockResolvedValueOnce({
      allowed: true,
      check: {
        allowed: true,
        consumerDid: "did:web:pharmaco.de:research",
        permitId: "permit-app-1",
        datasetId: "dataset:synthea-fhir-r4-mvd",
        datasetMatched: false,
        validUntil: "2027-09-17T23:59:59Z",
        purpose: "SCIENTIFIC_RESEARCH",
        reason: "Covered by data permit permit-app-1.",
        article: "Regulation (EU) 2025/327, Art. 61(1) and Art. 68",
      },
      headers: { "X-Permit": "permit-app-1" },
    });
    mockRunQuery.mockResolvedValue([]);

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.permit).toMatchObject({
      permitId: "permit-app-1",
      datasetId: "dataset:synthea-fhir-r4-mvd",
      validUntil: "2027-09-17T23:59:59Z",
    });
    expect(data.permit.article).toContain("Art. 68");
  });
});

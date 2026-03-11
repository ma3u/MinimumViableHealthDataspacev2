/**
 * API route tests for GET /api/analytics
 *
 * Tests the OMOP analytics dashboard endpoint.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/neo4j", () => ({
  runQuery: vi.fn(),
}));

import { runQuery } from "@/lib/neo4j";
import { GET } from "@/app/api/analytics/route";

const mockRunQuery = vi.mocked(runQuery);

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
});

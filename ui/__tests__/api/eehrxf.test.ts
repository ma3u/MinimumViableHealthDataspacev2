/**
 * API route tests for GET /api/eehrxf
 *
 * Tests the EEHRxF profile categories endpoint.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/neo4j", () => ({
  runQuery: vi.fn(),
}));

import { runQuery } from "@/lib/neo4j";
import { GET } from "@/app/api/eehrxf/route";

const mockRunQuery = vi.mocked(runQuery);

describe("GET /api/eehrxf", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return categories with nested profiles", async () => {
    const mockCategories = [
      {
        categoryId: "cat-patient-summary",
        name: "Patient Summary",
        description: "Core patient data",
        ehdsDeadline: "2025-12-31",
        ehdsGroup: 1,
        status: "mandatory",
        totalResources: 100,
        profileCount: 3,
      },
    ];

    const mockProfiles = [
      {
        profileId: "prof-001",
        name: "EEHRxF Patient",
        igName: "hl7.fhir.eu.eps",
        igPackage: "hl7.fhir.eu.eps#1.0.0",
        fhirVersion: "R4",
        status: "active",
        url: "http://example.com/profile",
        baseResource: "Patient",
        description: "Patient summary profile",
        coverage: "full",
        resourceCount: 50,
        categoryId: "cat-patient-summary",
      },
    ];

    const mockResourceCounts = [
      { categoryId: "cat-patient-summary", actualResources: 80 },
    ];

    mockRunQuery
      .mockResolvedValueOnce(mockCategories)
      .mockResolvedValueOnce(mockProfiles)
      .mockResolvedValueOnce(mockResourceCounts);

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.categories).toHaveLength(1);
    expect(data.categories[0].name).toBe("Patient Summary");
    expect(data.categories[0].profiles).toHaveLength(1);
    expect(mockRunQuery).toHaveBeenCalledTimes(3);
  });

  it("should handle empty categories", async () => {
    mockRunQuery
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.categories).toEqual([]);
  });
});

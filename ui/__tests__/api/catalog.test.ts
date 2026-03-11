/**
 * API route tests for GET /api/catalog
 *
 * Tests the catalog API handler by mocking the Neo4j runQuery function.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the neo4j module
vi.mock("@/lib/neo4j", () => ({
  runQuery: vi.fn(),
}));

import { runQuery } from "@/lib/neo4j";
import { GET } from "@/app/api/catalog/route";

const mockRunQuery = vi.mocked(runQuery);

describe("GET /api/catalog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return dataset rows from Neo4j", async () => {
    const mockDatasets = [
      {
        id: "ds-001",
        title: "FHIR Cohort Alpha",
        description: "A test dataset",
        license: "CC-BY-4.0",
        conformsTo: "hl7.fhir.eu.ehds.hdr",
        publisher: "SPE-1",
        theme: "health",
        datasetType: "ehr",
        legalBasis: "EHDS Art.33(1)(b)",
        recordCount: 1000,
      },
    ];

    mockRunQuery.mockResolvedValue(mockDatasets);

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual(mockDatasets);
    expect(mockRunQuery).toHaveBeenCalledOnce();
    // Verify it queries HealthDataset nodes
    expect(mockRunQuery.mock.calls[0][0]).toContain("HealthDataset");
  });

  it("should return empty array when no datasets exist", async () => {
    mockRunQuery.mockResolvedValue([]);

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual([]);
  });

  it("should return multiple datasets", async () => {
    const mockDatasets = [
      {
        id: "ds-001",
        title: "Dataset 1",
        description: "First",
        license: "CC-BY-4.0",
        conformsTo: "hl7.fhir.eu.ehds.hdr",
        publisher: "SPE-1",
        theme: "health",
        datasetType: "ehr",
        legalBasis: "EHDS Art.33(1)(b)",
        recordCount: 500,
      },
      {
        id: "ds-002",
        title: "Dataset 2",
        description: "Second",
        license: "CC-BY-SA-4.0",
        conformsTo: "hl7.fhir.eu.ehds.hdr",
        publisher: "SPE-2",
        theme: "research",
        datasetType: "registry",
        legalBasis: "EHDS Art.33(1)(a)",
        recordCount: 2500,
      },
    ];

    mockRunQuery.mockResolvedValue(mockDatasets);

    const response = await GET();
    const data = await response.json();

    expect(data).toHaveLength(2);
    expect(data[0].title).toBe("Dataset 1");
    expect(data[1].title).toBe("Dataset 2");
  });
});

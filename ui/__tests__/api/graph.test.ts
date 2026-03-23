/**
 * API route tests for GET /api/graph
 *
 * Tests the 5-layer graph API handler by mocking the Neo4j runQuery function.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the neo4j module
vi.mock("@/lib/neo4j", () => ({
  runQuery: vi.fn(),
}));

import { runQuery } from "@/lib/neo4j";
import { GET } from "@/app/api/graph/route";

const mockRunQuery = vi.mocked(runQuery);

describe("GET /api/graph", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return nodes and links with layer colors", async () => {
    // The handler makes 8 queries:
    // 1. coreNodes (L1), 2. metadataNodes (L2), 3. credentialNodes (L5 VCs),
    // 4. patientNodes (L3), 5. fhirNodes (L3 events),
    // 6. omopNodes (L4), 7. ontologyNodes (L5 codes), 8. relationships
    mockRunQuery
      .mockResolvedValueOnce([
        // L1: coreNodes
        {
          id: "n1",
          labels: ["Participant"],
          name: "SPE-1",
        },
      ])
      .mockResolvedValueOnce([
        // L2: metadataNodes
        {
          id: "n2",
          labels: ["HealthDataset"],
          name: "FHIR Cohort",
        },
      ])
      .mockResolvedValueOnce([
        // L5: credentialNodes
      ])
      .mockResolvedValueOnce([
        // L3: patientNodes
        {
          id: "n3",
          labels: ["Patient"],
          name: "Patient-001",
        },
      ])
      .mockResolvedValueOnce([
        // L3: fhirNodes (clinical events)
        {
          id: "n4",
          labels: ["Condition"],
          name: "Diabetes",
        },
      ])
      .mockResolvedValueOnce([
        // L4: omopNodes
        {
          id: "n5",
          labels: ["OMOPConditionOccurrence"],
          name: "OMOP-Diabetes",
        },
      ])
      .mockResolvedValueOnce([
        // L5: ontologyNodes
        {
          id: "n6",
          labels: ["SnomedConcept"],
          name: "SNOMED:73211009",
        },
      ])
      .mockResolvedValueOnce([
        // Relationships
        { source: "n1", target: "n2", type: "PUBLISHES" },
        { source: "n3", target: "n4", type: "HAS_CONDITION" },
        { source: "n4", target: "n5", type: "MAPPED_TO" },
        { source: "n4", target: "n6", type: "CODED_BY" },
      ]);

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.nodes).toHaveLength(6);
    expect(data.links).toHaveLength(4);

    // Check layer colors are assigned correctly
    const participantNode = data.nodes.find(
      (n: any) => n.label === "Participant",
    );
    expect(participantNode.layer).toBe(1);
    expect(participantNode.color).toBe("#2471A3"); // Layer 1 color

    const datasetNode = data.nodes.find(
      (n: any) => n.label === "HealthDataset",
    );
    expect(datasetNode.layer).toBe(2);
    expect(datasetNode.color).toBe("#148F77"); // Layer 2 color

    const patientNode = data.nodes.find((n: any) => n.label === "Patient");
    expect(patientNode.layer).toBe(3);
    expect(patientNode.color).toBe("#1E8449"); // Layer 3 color
  });

  it("should deduplicate nodes across layers", async () => {
    const duplicateNode = {
      id: "dup-1",
      labels: ["Patient"],
      name: "Duplicate",
    };

    mockRunQuery
      .mockResolvedValueOnce([duplicateNode]) // coreNodes
      .mockResolvedValueOnce([]) // metadataNodes
      .mockResolvedValueOnce([]) // credentialNodes
      .mockResolvedValueOnce([duplicateNode]) // patientNodes (duplicate)
      .mockResolvedValueOnce([]) // fhirNodes
      .mockResolvedValueOnce([]) // omopNodes
      .mockResolvedValueOnce([]) // ontologyNodes
      .mockResolvedValueOnce([]); // relationships

    const response = await GET();
    const data = await response.json();

    // Should only appear once despite being returned in two queries
    expect(data.nodes).toHaveLength(1);
  });

  it("should return empty graph when no data exists", async () => {
    mockRunQuery.mockResolvedValue([]);

    const response = await GET();
    const data = await response.json();

    expect(data.nodes).toEqual([]);
    expect(data.links).toEqual([]);
  });

  it("should make exactly 8 Neo4j queries", async () => {
    mockRunQuery.mockResolvedValue([]);

    await GET();

    expect(mockRunQuery).toHaveBeenCalledTimes(8);
  });
});

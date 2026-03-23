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
    // The handler makes 2 queries: 1. allNodes, 2. relationships
    mockRunQuery
      .mockResolvedValueOnce([
        { id: "n1", labels: ["Participant"], name: "SPE-1" },
        { id: "n2", labels: ["HealthDataset"], name: "FHIR Cohort" },
        { id: "n3", labels: ["Patient"], name: "Patient-001" },
        { id: "n4", labels: ["Condition"], name: "Diabetes" },
        {
          id: "n5",
          labels: ["OMOPConditionOccurrence"],
          name: "OMOP-Diabetes",
        },
        { id: "n6", labels: ["SnomedConcept"], name: "SNOMED:73211009" },
      ])
      .mockResolvedValueOnce([
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

  it("should handle empty graph gracefully", async () => {
    mockRunQuery.mockResolvedValue([]);

    const response = await GET();
    const data = await response.json();

    expect(data.nodes).toEqual([]);
    expect(data.links).toEqual([]);
  });

  it("should make exactly 2 Neo4j queries", async () => {
    mockRunQuery.mockResolvedValue([]);

    await GET();

    expect(mockRunQuery).toHaveBeenCalledTimes(2);
  });

  it("should pass known labels to the node query", async () => {
    mockRunQuery.mockResolvedValue([]);

    await GET();

    const firstCallArgs = mockRunQuery.mock.calls[0];
    expect(firstCallArgs[1]).toHaveProperty("knownLabels");
    expect(firstCallArgs[1]!.knownLabels).toContain("Patient");
    expect(firstCallArgs[1]!.knownLabels).toContain("HealthDataset");
    expect(firstCallArgs[1]!.knownLabels).toContain("SnomedConcept");
  });
});

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

/** Build a mock Request with optional pagination query params */
function makeRequest(params: Record<string, string> = {}): Request {
  const url = new URL("http://localhost/api/graph");
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  return new Request(url.toString());
}

describe("GET /api/graph", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return nodes and links with layer colors", async () => {
    // Handler now makes 3 queries: count, paginated nodes, relationships
    mockRunQuery
      .mockResolvedValueOnce([{ total: 6 }]) // count query
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

    const response = await GET(makeRequest());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.nodes).toHaveLength(6);
    expect(data.links).toHaveLength(4);

    // Check pagination metadata is present
    expect(data.pagination).toBeDefined();
    expect(data.pagination.page).toBe(0);
    expect(data.pagination.total).toBe(6);

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
    mockRunQuery.mockResolvedValueOnce([{ total: 0 }]).mockResolvedValue([]);

    const response = await GET(makeRequest());
    const data = await response.json();

    expect(data.nodes).toEqual([]);
    expect(data.links).toEqual([]);
    expect(data.pagination.total).toBe(0);
    expect(data.pagination.hasMore).toBe(false);
  });

  it("should make exactly 3 Neo4j queries (count + nodes + edges)", async () => {
    mockRunQuery.mockResolvedValueOnce([{ total: 0 }]).mockResolvedValue([]);

    await GET(makeRequest());

    expect(mockRunQuery).toHaveBeenCalledTimes(3);
  });

  it("should respect page and limit query params", async () => {
    mockRunQuery
      .mockResolvedValueOnce([{ total: 500 }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const response = await GET(makeRequest({ page: "2", limit: "50" }));
    const data = await response.json();

    expect(data.pagination.page).toBe(2);
    expect(data.pagination.limit).toBe(50);
    expect(data.pagination.total).toBe(500);
    expect(data.pagination.totalPages).toBe(10);
    expect(data.pagination.hasMore).toBe(true);

    // Verify SKIP was passed correctly (page=2, limit=50 → skip=100)
    const nodeQueryArgs = mockRunQuery.mock.calls[1];
    expect(nodeQueryArgs[1]).toMatchObject({ skip: 100, limit: 50 });
  });

  it("should pass known labels to the node query", async () => {
    mockRunQuery.mockResolvedValueOnce([{ total: 0 }]).mockResolvedValue([]);

    await GET(makeRequest());

    const nodeQueryArgs = mockRunQuery.mock.calls[1];
    expect(nodeQueryArgs[1]).toHaveProperty("knownLabels");
    expect(nodeQueryArgs[1]!.knownLabels).toContain("Patient");
    expect(nodeQueryArgs[1]!.knownLabels).toContain("HealthDataset");
    expect(nodeQueryArgs[1]!.knownLabels).toContain("SnomedConcept");
  });
});

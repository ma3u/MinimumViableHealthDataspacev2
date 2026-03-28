/**
 * API route tests for GET /api/graph
 *
 * The graph route uses persona-specific subgraph builders.
 * Default persona (no ?persona param) calls buildDefaultGraph() which runs
 * 6 parallel queries via Promise.all, followed by 1 links query = 7 total.
 * Response shape: { nodes, links, persona, question }  — no pagination.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the neo4j module
vi.mock("@/lib/neo4j", () => ({
  runQuery: vi.fn(),
}));

import { runQuery } from "@/lib/neo4j";
import { GET } from "@/app/api/graph/route";

const mockRunQuery = vi.mocked(runQuery);

/** Build a mock Request with optional query params */
function makeRequest(params: Record<string, string> = {}): Request {
  const url = new URL("http://localhost/api/graph");
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  return new Request(url.toString());
}

/** Default node rows the builder queries return */
const SAMPLE_NODES = [
  { id: "n1", labels: ["Participant"], name: "SPE-1" },
  { id: "n2", labels: ["HealthDataset"], name: "FHIR Cohort" },
  { id: "n3", labels: ["Patient"], name: "Patient-001" },
  { id: "n4", labels: ["Condition"], name: "Diabetes" },
  { id: "n5", labels: ["OMOPConditionOccurrence"], name: "OMOP-Diabetes" },
  { id: "n6", labels: ["SnomedConcept"], name: "SNOMED:73211009" },
];

const SAMPLE_LINKS = [
  { source: "n1", target: "n2", type: "PUBLISHES" },
  { source: "n3", target: "n4", type: "HAS_CONDITION" },
];

describe("GET /api/graph", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return nodes and links with layer colors", async () => {
    // buildDefaultGraph() makes 6 parallel queries; links query is the 7th.
    // mockResolvedValueOnce for the first query (govNodes), mockResolvedValue for rest.
    mockRunQuery
      .mockResolvedValueOnce(SAMPLE_NODES) // govNodes (first in Promise.all)
      .mockResolvedValueOnce([SAMPLE_NODES[2]]) // patientNodes
      .mockResolvedValueOnce([SAMPLE_NODES[3]]) // conditionNodes
      .mockResolvedValueOnce([SAMPLE_NODES[5]]) // snomedNodes
      .mockResolvedValueOnce([]) // loincNodes
      .mockResolvedValueOnce([]) // rxnormNodes
      .mockResolvedValueOnce(SAMPLE_LINKS); // links query

    const response = await GET(makeRequest());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.nodes).toBeDefined();
    expect(Array.isArray(data.nodes)).toBe(true);
    expect(data.links).toBeDefined();
    expect(Array.isArray(data.links)).toBe(true);

    // No pagination in new design
    expect(data.pagination).toBeUndefined();

    // Persona metadata
    expect(data.persona).toBe("default");

    // Check layer colors are assigned correctly on found nodes
    const participantNode = data.nodes.find(
      (n: { label: string }) => n.label === "Participant",
    );
    expect(participantNode).toBeDefined();
    expect(participantNode.layer).toBe(1);
    // Participant uses NODE_ROLE_COLORS override (#E67E22 amber), not base layer color
    expect(participantNode.color).toBe("#E67E22");

    const datasetNode = data.nodes.find(
      (n: { label: string }) => n.label === "HealthDataset",
    );
    expect(datasetNode).toBeDefined();
    expect(datasetNode.layer).toBe(2);
    expect(datasetNode.color).toBe("#148F77"); // Layer 2 color

    const patientNode = data.nodes.find(
      (n: { label: string }) => n.label === "Patient",
    );
    expect(patientNode).toBeDefined();
    expect(patientNode.layer).toBe(3);
    expect(patientNode.color).toBe("#1E8449"); // Layer 3 color
  });

  it("should handle empty graph gracefully", async () => {
    // All 7 queries return empty arrays
    mockRunQuery.mockResolvedValue([]);

    const response = await GET(makeRequest());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.nodes).toEqual([]);
    expect(data.links).toEqual([]);
  });

  it("should make exactly 7 Neo4j queries for default persona (6 node + 1 link)", async () => {
    mockRunQuery.mockResolvedValue([]);

    await GET(makeRequest());

    expect(mockRunQuery).toHaveBeenCalledTimes(7);
  });

  it("should pass GOVERNANCE_LABELS to the first node query", async () => {
    mockRunQuery.mockResolvedValue([]);

    await GET(makeRequest());

    // First call is govNodes, receives { labels: GOVERNANCE_LABELS }
    const firstCallArgs = mockRunQuery.mock.calls[0];
    expect(firstCallArgs[1]).toHaveProperty("labels");
    const labels = firstCallArgs[1]!.labels as string[];
    expect(labels).toContain("Participant");
    expect(labels).toContain("HealthDataset");
    expect(labels).toContain("TrustCenter");
  });

  it("should return 502 if Neo4j is unavailable", async () => {
    mockRunQuery.mockRejectedValue(new Error("Connection refused"));

    const response = await GET(makeRequest());

    expect(response.status).toBe(502);
    const data = await response.json();
    expect(data.error).toBe("Neo4j unavailable");
  });

  it("should use edc-admin persona builder (1 query + 1 links)", async () => {
    mockRunQuery.mockResolvedValue([]);

    await GET(makeRequest({ persona: "edc-admin" }));

    // buildEdcAdminGraph makes 1 query; links query is 2nd → total 2
    expect(mockRunQuery).toHaveBeenCalledTimes(2);

    const response = await GET(makeRequest({ persona: "edc-admin" }));
    const data = await response.json();
    expect(data.persona).toBe("edc-admin");
  });

  it("should deduplicate nodes with the same id", async () => {
    const dupNode = { id: "dup1", labels: ["Participant"], name: "SPE-Dup" };
    // govNodes and patientNodes both return the same node
    mockRunQuery
      .mockResolvedValueOnce([dupNode, dupNode]) // govNodes (duplicate)
      .mockResolvedValue([]); // all other queries

    const response = await GET(makeRequest());
    const data = await response.json();

    const dupCount = data.nodes.filter(
      (n: { id: string }) => n.id === "dup1",
    ).length;
    expect(dupCount).toBe(1);
  });
});

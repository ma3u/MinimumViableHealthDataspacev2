/**
 * API route tests for GET /api/graph
 *
 * Tests the 5-layer graph API handler by mocking the Neo4j runQuery function.
 * The route makes 6 parallel node queries (gov, patient, condition, snomed,
 * loinc, rxnorm) + 1 link query = 7 total runQuery calls.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the neo4j module
vi.mock("@/lib/neo4j", () => ({
  runQuery: vi.fn(),
}));

import { runQuery } from "@/lib/neo4j";
import { GET } from "@/app/api/graph/route";

const mockRunQuery = vi.mocked(runQuery);

/** Helper to set up mock returns for all 7 queries */
function mockGraphQueries(opts?: {
  govNodes?: any[];
  patientNodes?: any[];
  conditionNodes?: any[];
  snomedNodes?: any[];
  loincNodes?: any[];
  rxnormNodes?: any[];
  links?: any[];
}) {
  const {
    govNodes = [],
    patientNodes = [],
    conditionNodes = [],
    snomedNodes = [],
    loincNodes = [],
    rxnormNodes = [],
    links = [],
  } = opts ?? {};

  mockRunQuery
    .mockResolvedValueOnce(govNodes) // L1/L2 governance nodes
    .mockResolvedValueOnce(patientNodes) // Top patients
    .mockResolvedValueOnce(conditionNodes) // Top conditions
    .mockResolvedValueOnce(snomedNodes) // Top SNOMED
    .mockResolvedValueOnce(loincNodes) // Top LOINC
    .mockResolvedValueOnce(rxnormNodes) // Top RxNorm
    .mockResolvedValueOnce(links); // Relationships
}

describe("GET /api/graph", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return nodes and links with layer colors", async () => {
    mockGraphQueries({
      govNodes: [
        { id: "n1", labels: ["Participant"], name: "SPE-1" },
        { id: "n2", labels: ["HealthDataset"], name: "FHIR Cohort" },
      ],
      patientNodes: [
        { id: "n3", labels: ["Patient"], name: "Patient-001" },
      ],
      conditionNodes: [
        { id: "n4", labels: ["Condition"], name: "Diabetes" },
      ],
      snomedNodes: [
        { id: "n6", labels: ["SnomedConcept"], name: "SNOMED:73211009" },
      ],
      loincNodes: [],
      rxnormNodes: [],
      links: [
        { source: "n1", target: "n2", type: "PUBLISHES" },
        { source: "n3", target: "n4", type: "HAS_CONDITION" },
      ],
    });

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.nodes).toHaveLength(5);
    expect(data.links).toHaveLength(2);

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
    mockGraphQueries();

    const response = await GET();
    const data = await response.json();

    expect(data.nodes).toEqual([]);
    expect(data.links).toEqual([]);
  });

  it("should make exactly 7 Neo4j queries (6 node groups + 1 links)", async () => {
    mockGraphQueries();

    await GET();

    expect(mockRunQuery).toHaveBeenCalledTimes(7);
  });

  it("should pass governance labels to the first query", async () => {
    mockGraphQueries();

    await GET();

    // First call is the governance node query with labels param
    const govQueryArgs = mockRunQuery.mock.calls[0];
    expect(govQueryArgs[1]).toHaveProperty("labels");
    expect(govQueryArgs[1]!.labels).toContain("Participant");
    expect(govQueryArgs[1]!.labels).toContain("HealthDataset");
    expect(govQueryArgs[1]!.labels).toContain("VerifiableCredential");
    // Phase 18: Trust Center labels
    expect(govQueryArgs[1]!.labels).toContain("TrustCenter");
    expect(govQueryArgs[1]!.labels).toContain("ResearchPseudonym");
    expect(govQueryArgs[1]!.labels).toContain("ProviderPseudonym");
    expect(govQueryArgs[1]!.labels).toContain("SPESession");
  });

  it("should deduplicate nodes across query groups", async () => {
    // Same node ID returned by two different queries
    mockGraphQueries({
      govNodes: [
        { id: "n1", labels: ["Participant"], name: "SPE-1" },
      ],
      patientNodes: [
        { id: "n1", labels: ["Participant"], name: "SPE-1" }, // duplicate
        { id: "n2", labels: ["Patient"], name: "Patient-001" },
      ],
    });

    const response = await GET();
    const data = await response.json();

    expect(data.nodes).toHaveLength(2); // deduplicated
  });

  it("should assign layer 1 color to Trust Center nodes", async () => {
    mockGraphQueries({
      govNodes: [
        { id: "tc1", labels: ["TrustCenter"], name: "RKI Trust Center DE" },
        { id: "rp1", labels: ["ResearchPseudonym"], name: "RPSN-DE-1138" },
        { id: "ss1", labels: ["SPESession"], name: "spe-session-001" },
      ],
      links: [
        { source: "rp1", target: "tc1", type: "RESOLVED_BY" },
      ],
    });

    const response = await GET();
    const data = await response.json();

    const tcNode = data.nodes.find((n: any) => n.label === "TrustCenter");
    expect(tcNode).toBeDefined();
    expect(tcNode.layer).toBe(1);
    expect(tcNode.color).toBe("#2471A3"); // Layer 1 governance color

    const rpNode = data.nodes.find(
      (n: any) => n.label === "ResearchPseudonym",
    );
    expect(rpNode).toBeDefined();
    expect(rpNode.layer).toBe(1);

    const ssNode = data.nodes.find((n: any) => n.label === "SPESession");
    expect(ssNode).toBeDefined();
    expect(ssNode.layer).toBe(1);
  });
});

/**
 * Tests for /api/graph/validate/route.ts
 *
 * Validates the 5-layer knowledge graph and returns: node counts, edge
 * counts, orphans, missing required properties, unknown labels, and
 * unexpected edge types. Tests cover:
 *   - Neo4j failure → 502
 *   - Full happy path with all six parallel queries mocked
 *   - issueCount aggregates orphans + missing-props + unexpected edges
 *   - `defined` flag on edge counts reflects VALID_EDGES set
 *   - `known` flag on node counts reflects LABEL_LAYER mapping
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockRunQuery = vi.fn();
vi.mock("@/lib/neo4j", () => ({
  runQuery: (...args: unknown[]) => mockRunQuery(...args),
}));

import { GET } from "@/app/api/graph/validate/route";

describe("GET /api/graph/validate", () => {
  beforeEach(() => {
    mockRunQuery.mockReset();
  });

  it("returns 502 when Neo4j is unavailable", async () => {
    mockRunQuery.mockRejectedValue(new Error("ECONNREFUSED"));
    const res = await GET();
    expect(res.status).toBe(502);
  });

  it("returns a structured validation report on the happy path", async () => {
    // The route runs 6 queries concurrently. The 4th is itself a
    // Promise.all of one query per REQUIRED_PROPS label (15 labels).
    // Mock the first three queries, then 15 missing-prop queries, then
    // the remaining two (unknown labels + unexpected edges).
    mockRunQuery.mockImplementation((cypher: string) => {
      if (cypher.includes("UNWIND labels(n) AS lbl")) {
        // Two queries reuse this prefix — node label counts and
        // unknown labels. Differentiate by the presence of WHERE NOT.
        if (cypher.includes("WHERE NOT lbl IN $knownLabels")) {
          return Promise.resolve([{ label: "MysteryLabel", count: 2 }]);
        }
        return Promise.resolve([
          { label: "Patient", count: 127 },
          { label: "Condition", count: 540 },
        ]);
      }
      if (cypher.includes("MATCH ()-[r]->()")) {
        return Promise.resolve([
          { type: "HAS_CONDITION", count: 540 },
          { type: "UNEXPECTED_REL", count: 3 },
        ]);
      }
      if (cypher.includes("WHERE NOT (n)--()")) {
        return Promise.resolve([
          { label: "Participant", name: "Orphan Co", id: "p-orphan" },
        ]);
      }
      if (cypher.includes("WHERE all(p IN $props WHERE n[p] IS NULL)")) {
        // Simulate one label (Patient) having 1 missing-props node; all
        // others clean.
        if (cypher.includes("MATCH (n:`Patient`)")) {
          return Promise.resolve([{ id: "patient-broken", name: "Anonymous" }]);
        }
        return Promise.resolve([]);
      }
      if (cypher.includes("AND NOT type(r) IN $validTypes")) {
        return Promise.resolve([{ type: "UNEXPECTED_REL", count: 3 }]);
      }
      return Promise.resolve([]);
    });

    const res = await GET();
    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.summary.totalNodes).toBe(127 + 540);
    expect(data.summary.totalEdges).toBe(540 + 3);
    // orphans(1) + missingPropIssues(1) + unexpectedEdgeTypes(1) = 3
    expect(data.summary.issueCount).toBe(3);

    // node counts keep a `known` flag
    const patient = data.nodeCounts.find(
      (n: { label: string }) => n.label === "Patient",
    );
    expect(patient.known).toBe(true);

    // edge counts keep a `defined` flag (validates against VALID_EDGES)
    const hasCondition = data.edgeCounts.find(
      (e: { type: string }) => e.type === "HAS_CONDITION",
    );
    expect(hasCondition.defined).toBe(true);
    const unexpected = data.edgeCounts.find(
      (e: { type: string }) => e.type === "UNEXPECTED_REL",
    );
    expect(unexpected.defined).toBe(false);

    expect(data.orphans).toHaveLength(1);
    expect(data.orphans[0].name).toBe("Orphan Co");
    expect(data.unknownLabels).toEqual([{ label: "MysteryLabel", count: 2 }]);

    expect(data.missingProps).toHaveLength(1);
    expect(data.missingProps[0].label).toBe("Patient");
    expect(data.missingProps[0].count).toBe(1);

    expect(data.unexpectedEdgeTypes).toEqual([
      { type: "UNEXPECTED_REL", count: 3 },
    ]);
    expect(Array.isArray(data.validEdgeRules)).toBe(true);
    expect(data.validEdgeRules.length).toBeGreaterThan(5);
  });

  it("reports issueCount=0 when graph is clean", async () => {
    mockRunQuery.mockResolvedValue([]);
    const res = await GET();
    const data = await res.json();
    expect(data.summary.issueCount).toBe(0);
    expect(data.orphans).toEqual([]);
    expect(data.missingProps).toEqual([]);
    expect(data.unexpectedEdgeTypes).toEqual([]);
  });
});

/**
 * Unit tests for the GraphRAG pipeline (services/neo4j-proxy/src/graphrag.ts).
 *
 * These exercise the branching logic end-to-end with a mocked Neo4j driver —
 * no real Bolt connection, no real LLM. Covers:
 *   - no vector indexes → null
 *   - no embedding produced → null
 *   - semantic search + rerank → decision payload with trace
 *   - semantic search without rerank → structural fallback Cypher
 */

import { describe, it, expect, vi } from "vitest";
import { runGraphRag } from "../src/graphrag.js";

function makeSessionRunner(sequence: Array<() => unknown>) {
  let i = 0;
  return vi.fn(async () => {
    const next = sequence[i++];
    if (!next) throw new Error("no more mocked results");
    const records = (next() as any) ?? [];
    return { records: records as any[] };
  });
}

function makeDriver(sequence: Array<() => unknown>) {
  const run = makeSessionRunner(sequence);
  const close = vi.fn();
  return {
    run,
    driver: {
      session: () => ({ run, close }),
    } as any,
  };
}

function rec(fields: Record<string, unknown>) {
  return {
    get: (k: string) => fields[k],
    keys: Object.keys(fields),
  };
}

describe("runGraphRag", () => {
  it("returns null when no vector indexes exist", async () => {
    const { driver } = makeDriver([
      () => [], // SHOW INDEXES returns empty
    ]);

    const result = await runGraphRag("anything", {
      driver,
      generateSemanticEmbedding: async () => [0.1, 0.2],
      llmRerank: null,
    });
    expect(result).toBeNull();
  });

  it("returns null when embedding backend produces nothing", async () => {
    const { driver } = makeDriver([
      () => [rec({ name: "node_semantic_index" })], // SHOW INDEXES
    ]);
    const result = await runGraphRag("anything", {
      driver,
      generateSemanticEmbedding: async () => null,
      llmRerank: null,
    });
    expect(result).toBeNull();
  });

  it("returns structural fallback when semantic search hits but no rerank is configured", async () => {
    const { driver } = makeDriver([
      () => [rec({ name: "node_semantic_index" })], // SHOW INDEXES
      () => [
        // semantic vector search
        rec({
          nodeId: "42",
          labels: ["HealthDataset"],
          score: 0.91,
          text: "Diabetes registry",
        }),
        rec({
          nodeId: "43",
          labels: ["HealthDataset"],
          score: 0.83,
          text: "Diabetes cohort",
        }),
      ],
      () => [rec({ cnt: 12 })], // subgraph expansion count
    ]);

    const result = await runGraphRag("diabetes datasets", {
      driver,
      generateSemanticEmbedding: async () => Array(1536).fill(0.01),
      llmRerank: null,
    });

    expect(result).not.toBeNull();
    expect(result?.params.topIds).toEqual(["42", "43"]);
    expect(result?.cypher).toMatch(
      /MATCH \(n\) WHERE elementId\(n\) IN \$topIds/,
    );
    const stages = result?.trace.map((t) => t.stage) ?? [];
    expect(stages).toContain("embed");
    expect(stages).toContain("vector-search");
    expect(stages).toContain("expand");
    expect(stages).toContain("plan");
  });

  it("uses the rerank decision when LLM rerank succeeds", async () => {
    const { driver } = makeDriver([
      () => [rec({ name: "node_semantic_index" })],
      () => [
        rec({ nodeId: "1", labels: ["HealthDataset"], score: 0.9, text: "A" }),
        rec({ nodeId: "2", labels: ["Condition"], score: 0.8, text: "B" }),
      ],
      () => [rec({ cnt: 6 })],
    ]);

    const rerank = vi.fn(async () => ({
      topNodeIds: ["2"],
      cypher: "MATCH (n) WHERE elementId(n) IN $topIds RETURN n.name AS name",
    }));

    const result = await runGraphRag("condition about B", {
      driver,
      generateSemanticEmbedding: async () => Array(1536).fill(0),
      llmRerank: rerank,
    });

    expect(rerank).toHaveBeenCalledOnce();
    expect(result?.cypher).toBe(
      "MATCH (n) WHERE elementId(n) IN $topIds RETURN n.name AS name",
    );
    expect(result?.params.topIds).toEqual(["2"]);
    const rerankStage = result?.trace.find((t) => t.stage === "rerank");
    expect(rerankStage).toBeDefined();
  });

  it("falls back to structural when the rerank throws", async () => {
    const { driver } = makeDriver([
      () => [rec({ name: "node_semantic_index" })],
      () => [
        rec({ nodeId: "99", labels: ["HealthDataset"], score: 0.5, text: "X" }),
      ],
      () => [rec({ cnt: 3 })],
    ]);

    const rerank = vi.fn(async () => {
      throw new Error("rate limited");
    });

    const result = await runGraphRag("q", {
      driver,
      generateSemanticEmbedding: async () => Array(1536).fill(0),
      llmRerank: rerank,
    });

    expect(result).not.toBeNull();
    expect(result?.params.topIds).toEqual(["99"]);
  });
});

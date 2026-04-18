/**
 * GraphRAG pipeline — Phase 25e (Issue #13).
 *
 * Flow:
 *   1. Embed user query (prefers Azure OpenAI semantic, falls back to FastRP
 *      of a structural sketch; otherwise returns null).
 *   2. Vector search against the two native Neo4j vector indexes:
 *        - node_semantic_index  (1536-d, Azure OpenAI, high-value nodes)
 *        - node_fastrp_index    (256-d,  structural, full 5-layer graph)
 *   3. 2-hop neighbourhood expansion via apoc.path.subgraphAll — cheap and
 *      typed via the same relationship list the FastRP projection uses.
 *   4. Rerank with gpt-5-mini (if AZURE_OPENAI_GPT4O_URL is set), returning
 *      the top-k node ids and a final Cypher plan.
 *   5. Return { cypher, params, trace[] } so /query can show reasoning.
 *
 * Every step is env-gated and gracefully degrades:
 *   - no GDS plugin        → falls back to the semantic index only
 *   - no semantic index    → falls back to FastRP only
 *   - no LLM rerank        → returns the structural top-k directly
 *   - no vector index at all → return null, /nlq cascades to llm/fulltext
 */

import type { Driver } from "neo4j-driver";

export type GraphRagTraceStage =
  | {
      stage: "embed";
      backend: "azure-openai" | "fastrp-hash" | "none";
      dims: number | null;
    }
  | { stage: "vector-search"; index: string; candidates: number }
  | { stage: "expand"; seeds: number; subgraphNodes: number }
  | { stage: "rerank"; model: string; tookMs: number; topK: number }
  | { stage: "plan"; cypher: string };

export interface GraphRagResult {
  cypher: string;
  params: Record<string, unknown>;
  trace: GraphRagTraceStage[];
}

export interface GraphRagContext {
  driver: Driver;
  generateSemanticEmbedding: (text: string) => Promise<number[] | null>;
  llmRerank:
    | ((
        question: string,
        candidates: RerankCandidate[],
      ) => Promise<RerankDecision | null>)
    | null;
}

export interface RerankCandidate {
  nodeId: string;
  label: string;
  score: number;
  text: string;
}

export interface RerankDecision {
  topNodeIds: string[];
  cypher: string;
  params?: Record<string, unknown>;
}

const SEMANTIC_INDEX = "node_semantic_index";
const FASTRP_INDEX = "node_fastrp_index";
const VECTOR_SEARCH_LIMIT = 10;
const EXPAND_MAX_LEVELS = 2;
const RERANK_TOP_K = 5;

const TYPED_EXPAND_LABELS = [
  "Patient",
  "Encounter",
  "Condition",
  "Observation",
  "MedicationRequest",
  "Procedure",
  "HealthDataset",
  "Distribution",
  "Catalogue",
  "Participant",
  "DataProduct",
  "OdrlPolicy",
  "Contract",
  "HDABApproval",
  "TransferEvent",
  "OMOPPerson",
  "OMOPVisitOccurrence",
  "OMOPConditionOccurrence",
  "OMOPMeasurement",
  "OMOPDrugExposure",
  "SnomedConcept",
  "LoincCode",
  "ICD10Code",
  "RxNormConcept",
];

async function listVectorIndexes(driver: Driver): Promise<Set<string>> {
  const session = driver.session({ database: "neo4j" });
  try {
    const res = await session.run(
      `SHOW INDEXES YIELD name, type, state
       WHERE type = 'VECTOR' AND state = 'ONLINE'
       RETURN name`,
    );
    return new Set(res.records.map((r) => String(r.get("name"))));
  } catch {
    return new Set();
  } finally {
    await session.close();
  }
}

async function vectorSearch(
  driver: Driver,
  indexName: string,
  embedding: number[],
): Promise<RerankCandidate[]> {
  const session = driver.session({ database: "neo4j" });
  try {
    const res = await session.run(
      `CALL db.index.vector.queryNodes($indexName, $k, $embedding)
       YIELD node, score
       RETURN elementId(node) AS nodeId,
              labels(node) AS labels,
              score,
              coalesce(node.display, node.title, node.name, node.resourceId, elementId(node)) AS text
       ORDER BY score DESC`,
      { indexName, k: VECTOR_SEARCH_LIMIT, embedding },
    );
    return res.records.map((r) => ({
      nodeId: String(r.get("nodeId")),
      label: (r.get("labels") as string[])[0] ?? "",
      score: Number(r.get("score")),
      text: String(r.get("text") ?? ""),
    }));
  } catch (err) {
    console.warn(`[graphrag] vector search on ${indexName} failed:`, err);
    return [];
  } finally {
    await session.close();
  }
}

async function expandSubgraph(
  driver: Driver,
  seedIds: string[],
): Promise<{ nodeCount: number }> {
  if (seedIds.length === 0) return { nodeCount: 0 };
  const session = driver.session({ database: "neo4j" });
  try {
    const res = await session.run(
      `MATCH (seed)
       WHERE elementId(seed) IN $seedIds
       CALL apoc.path.subgraphAll(seed, {
         maxLevel: $maxLevel,
         labelFilter: $labelFilter
       })
       YIELD nodes
       UNWIND nodes AS n
       RETURN count(DISTINCT n) AS cnt`,
      {
        seedIds,
        maxLevel: EXPAND_MAX_LEVELS,
        labelFilter: TYPED_EXPAND_LABELS.map((l) => `+${l}`).join("|"),
      },
    );
    return { nodeCount: Number(res.records[0]?.get("cnt") ?? 0) };
  } catch (err) {
    console.warn("[graphrag] subgraph expansion failed:", err);
    return { nodeCount: 0 };
  } finally {
    await session.close();
  }
}

function mergeCandidates(
  semantic: RerankCandidate[],
  structural: RerankCandidate[],
): RerankCandidate[] {
  // Semantic signals usually matter more; weight them 2× during merge.
  const byId = new Map<string, RerankCandidate>();
  for (const c of semantic) {
    byId.set(c.nodeId, { ...c, score: c.score * 2 });
  }
  for (const c of structural) {
    const prev = byId.get(c.nodeId);
    byId.set(c.nodeId, {
      ...c,
      score: (prev?.score ?? 0) + c.score,
    });
  }
  return [...byId.values()].sort((a, b) => b.score - a.score);
}

function buildFallbackCypher(candidates: RerankCandidate[]): {
  cypher: string;
  params: Record<string, unknown>;
} {
  // No LLM rerank — return the top candidates directly as a result set.
  // The caller treats the Cypher as read-only; we inline $topIds via
  // parameter binding, never string-interpolate.
  return {
    cypher: `MATCH (n) WHERE elementId(n) IN $topIds
             WITH n
             OPTIONAL MATCH (n)-[r]-(m)
             WITH n, collect(DISTINCT {type: type(r), other: coalesce(m.display,m.title,m.name,elementId(m))})[0..5] AS context
             RETURN coalesce(n.display, n.title, n.name, elementId(n)) AS match,
                    labels(n)[0] AS type,
                    n.description AS description,
                    context
             LIMIT $limit`,
    params: {
      topIds: candidates.slice(0, RERANK_TOP_K).map((c) => c.nodeId),
      limit: RERANK_TOP_K,
    },
  };
}

export async function runGraphRag(
  question: string,
  ctx: GraphRagContext,
): Promise<GraphRagResult | null> {
  const trace: GraphRagTraceStage[] = [];

  const indexes = await listVectorIndexes(ctx.driver);
  const hasSemantic = indexes.has(SEMANTIC_INDEX);
  const hasFastrp = indexes.has(FASTRP_INDEX);
  if (!hasSemantic && !hasFastrp) return null;

  // Step 1 — embed
  let embedding: number[] | null = null;
  let backend: "azure-openai" | "fastrp-hash" | "none" = "none";
  if (hasSemantic) {
    embedding = await ctx.generateSemanticEmbedding(question);
    if (embedding) backend = "azure-openai";
  }
  trace.push({
    stage: "embed",
    backend,
    dims: embedding ? embedding.length : null,
  });
  if (!embedding) return null; // FastRP-only querying requires a query sketch; defer to hybrid path once available.

  // Step 2 — vector search across available indexes
  const semantic = hasSemantic
    ? await vectorSearch(ctx.driver, SEMANTIC_INDEX, embedding)
    : [];
  trace.push({
    stage: "vector-search",
    index: SEMANTIC_INDEX,
    candidates: semantic.length,
  });

  let structural: RerankCandidate[] = [];
  if (hasFastrp && embedding.length === 256) {
    // Semantic embeddings are typically 1536-d; we only hit FastRP when the
    // dimensions happen to match (rare — kept for future local-only paths).
    structural = await vectorSearch(ctx.driver, FASTRP_INDEX, embedding);
    trace.push({
      stage: "vector-search",
      index: FASTRP_INDEX,
      candidates: structural.length,
    });
  }

  const merged = mergeCandidates(semantic, structural);
  if (merged.length === 0) return null;

  // Step 3 — expand neighbourhood for context (diagnostics only — count)
  const seedIds = merged.slice(0, RERANK_TOP_K).map((c) => c.nodeId);
  const expansion = await expandSubgraph(ctx.driver, seedIds);
  trace.push({
    stage: "expand",
    seeds: seedIds.length,
    subgraphNodes: expansion.nodeCount,
  });

  // Step 4 — LLM rerank (optional)
  if (ctx.llmRerank) {
    const started = Date.now();
    try {
      const decision = await ctx.llmRerank(question, merged);
      const tookMs = Date.now() - started;
      if (decision && decision.cypher) {
        trace.push({
          stage: "rerank",
          model: "gpt-5-mini",
          tookMs,
          topK: decision.topNodeIds.length,
        });
        trace.push({ stage: "plan", cypher: decision.cypher });
        return {
          cypher: decision.cypher,
          params: { topIds: decision.topNodeIds, ...(decision.params ?? {}) },
          trace,
        };
      }
    } catch (err) {
      console.warn(
        "[graphrag] rerank failed, falling back to structural top-k:",
        err,
      );
    }
  }

  // Step 5 — fallback: return structural top-k without LLM
  const fallback = buildFallbackCypher(merged);
  trace.push({ stage: "plan", cypher: fallback.cypher });
  return { ...fallback, trace };
}

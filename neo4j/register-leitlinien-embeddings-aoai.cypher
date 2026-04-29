// ==============================================================================
// Layer 6 embeddings — chunk-level semantic vectors via Azure OpenAI.
//
// Phase 2 of issue #20. Run after:
//   1. neo4j/register-leitlinien-schema.cypher       (creates the vector index)
//   2. scripts/leitlinien/load_layer6.py             (creates the chunks)
//
// Matches the existing Layer 2-5 convention from
// neo4j/register-embeddings-aoai.cypher: apoc.ml.azure.openai.embedding(),
// 1536-dim, property name `semanticEmbedding`, batched via
// apoc.periodic.iterate so progress is visible and partial failures don't
// abort the run.
//
// Environment (set on the seed container or your local shell, not committed):
//   AZURE_OPENAI_API_KEY
//   AZURE_OPENAI_EMBEDDINGS_URL
//     e.g. https://<resource>.openai.azure.com/openai/deployments/text-embedding-3-small/embeddings?api-version=2024-10-21
//
// Re-runnable: WHERE c.semanticEmbedding IS NULL means subsequent runs only
// embed new chunks. To force a full refresh:
//   MATCH (c:GuidelineChunk) WHERE c.semanticEmbedding IS NOT NULL
//   REMOVE c.semanticEmbedding;
//
// Cost guardrail: 223 S3 guidelines yield ~30-60K chunks; at ~500 words /
// chunk and text-embedding-3-small at $0.02 / 1M tokens, total cost is
// ~€0.50-1.50 — comparable to the existing AOAI embeddings step.
// ==============================================================================

// ── GuidelineChunk — chunk-level semantic embedding ─────────────────────────
CALL apoc.periodic.iterate(
  'MATCH (c:GuidelineChunk)
   WHERE c.semanticEmbedding IS NULL
     AND c.text IS NOT NULL AND c.text <> ""
   RETURN c',
  'CALL apoc.ml.azure.openai.embedding(
      [c.text],
      $apiKey,
      $endpoint,
      {}
   ) YIELD index, embedding
   WITH c, embedding
   SET c.semanticEmbedding = embedding',
  {
    batchSize: 50,
    parallel: false,
    params: {
      apiKey: $apiKey,
      endpoint: $endpoint
    }
  }
) YIELD batches, total, errorMessages
RETURN 'GuidelineChunk' AS label, batches, total, errorMessages;

// ── Guideline-level embedding — title + description ─────────────────────────
// Useful for guideline-level retrieval ("which guideline best fits this
// patient summary"). Cheap: 223 calls vs 30-60K for chunks.
CALL apoc.periodic.iterate(
  'MATCH (g:Guideline)
   WHERE g.semanticEmbedding IS NULL
     AND (g.name IS NOT NULL OR g.description IS NOT NULL)
   RETURN g',
  'CALL apoc.ml.azure.openai.embedding(
      [coalesce(g.name,"") + " " + coalesce(g.description,"")],
      $apiKey,
      $endpoint,
      {}
   ) YIELD index, embedding
   WITH g, embedding
   SET g.semanticEmbedding = embedding',
  {
    batchSize: 50,
    parallel: false,
    params: {
      apiKey: $apiKey,
      endpoint: $endpoint
    }
  }
) YIELD batches, total, errorMessages
RETURN 'Guideline' AS label, batches, total, errorMessages;

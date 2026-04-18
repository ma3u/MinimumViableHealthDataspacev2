// ==============================================================================
// Phase 25d (Issue #13): Semantic embeddings via Azure OpenAI (optional).
//
// Uses apoc.ml.azure.openai.embedding() — available in apoc-extended — to
// produce 1536-dim embeddings for high-value nodes whose natural-language
// description is the discriminating signal. FastRP already covers structural
// relationships (Phase 25b); this layer adds meaning.
//
// Scope (keep cost bounded — full seed budgets under €0.02 with
// text-embedding-3-small on oai-mvhd-5f53b7):
//   :HealthDataset  — title + description
//   :Condition      — display text
//   :Observation    — display text
//   :MedicationRequest — display text
//   :SnomedConcept  — name
//   :LoincCode      — name
//
// Environment (set on the seed container / ACA job, not committed):
//   AZURE_OPENAI_API_KEY
//   AZURE_OPENAI_EMBEDDINGS_URL
//     e.g. https://oai-mvhd-5f53b7.openai.azure.com/openai/deployments/text-embedding-3-small/embeddings?api-version=2024-10-21
//
// Re-runnable: WHERE n.semanticEmbedding IS NULL means subsequent runs only
// embed new / updated nodes. To force a full refresh, delete the property
// first:  MATCH (n) WHERE n.semanticEmbedding IS NOT NULL REMOVE n.semanticEmbedding;
// ==============================================================================

// ── HealthDataset — title + description ──────────────────────────────────────
CALL apoc.periodic.iterate(
  'MATCH (d:HealthDataset)
   WHERE d.semanticEmbedding IS NULL
     AND (d.title IS NOT NULL OR d.description IS NOT NULL)
   RETURN d',
  'CALL apoc.ml.azure.openai.embedding(
      [coalesce(d.title,"") + " " + coalesce(d.description,"")],
      $apiKey,
      $endpoint,
      {}
   ) YIELD index, embedding
   WITH d, embedding
   SET d.semanticEmbedding = embedding',
  {
    batchSize: 50,
    parallel: false,
    params: {
      apiKey: $apiKey,
      endpoint: $endpoint
    }
  }
) YIELD batches, total, errorMessages
RETURN 'HealthDataset' AS label, batches, total, errorMessages;

// ── Condition, Observation, MedicationRequest — clinical display text ────────
CALL apoc.periodic.iterate(
  'MATCH (c)
   WHERE (c:Condition OR c:Observation OR c:MedicationRequest)
     AND c.semanticEmbedding IS NULL
     AND c.display IS NOT NULL AND c.display <> ""
   RETURN c',
  'CALL apoc.ml.azure.openai.embedding(
      [c.display],
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
RETURN 'FHIR clinical' AS label, batches, total, errorMessages;

// ── Ontology concepts — SNOMED + LOINC descriptive names ─────────────────────
CALL apoc.periodic.iterate(
  'MATCH (o)
   WHERE (o:SnomedConcept OR o:LoincCode)
     AND o.semanticEmbedding IS NULL
     AND o.name IS NOT NULL AND o.name <> ""
   RETURN o',
  'CALL apoc.ml.azure.openai.embedding(
      [o.name],
      $apiKey,
      $endpoint,
      {}
   ) YIELD index, embedding
   WITH o, embedding
   SET o.semanticEmbedding = embedding',
  {
    batchSize: 50,
    parallel: false,
    params: {
      apiKey: $apiKey,
      endpoint: $endpoint
    }
  }
) YIELD batches, total, errorMessages
RETURN 'ontology' AS label, batches, total, errorMessages;

// ── Vector index over semantic embeddings ────────────────────────────────────
CREATE VECTOR INDEX node_semantic_index IF NOT EXISTS
FOR (n:HealthDataset|Condition|Observation|MedicationRequest|SnomedConcept|LoincCode)
ON n.semanticEmbedding
OPTIONS {
  indexConfig: {
    `vector.dimensions`: 1536,
    `vector.similarity_function`: 'cosine'
  }
};

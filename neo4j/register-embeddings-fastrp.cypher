// ==============================================================================
// Phase 25b (Issue #13): Structural embeddings via Neo4j GDS FastRP.
//
// Always-on, zero-cost, no API key. Works offline; foundation for the
// GraphRAG fallback when no Azure OpenAI / Ollama is configured.
//
// Scope: the full 5-layer graph — L1 marketplace, L2 HealthDCAT-AP,
// L3 FHIR R4 clinical, L4 OMOP CDM, L5 biomedical ontology.
// Dimensions: 256 (cheap to embed queries, precise enough for rerank).
// Re-runnable: drops and re-creates the projection; vector index uses
// IF NOT EXISTS so re-seeds do not fail.
//
// Prerequisites:
//   - Neo4j 5.x with the graph-data-science plugin loaded
//     (see docker-compose.yml and scripts/azure/02-data-layer.sh).
//   - The :Patient, :Encounter, :Condition, :Observation,
//     :MedicationRequest, :Procedure, :HealthDataset, :Distribution,
//     :Participant, :DataProduct, :OdrlPolicy, :Contract,
//     :SnomedConcept, :LoincCode, :ICD10Code, :RxNormConcept nodes
//     already seeded.
//
// Smoke test after run:
//   CALL gds.version() YIELD gdsVersion;
//   SHOW INDEXES YIELD name, state WHERE name = 'node_fastrp_index';
//   MATCH (n) WHERE n.embedding IS NOT NULL
//   RETURN labels(n)[0] AS label, count(*) AS withEmbedding
//   ORDER BY withEmbedding DESC LIMIT 10;
// ==============================================================================

// ── 1. Drop any prior projection so re-runs start clean ──
CALL gds.graph.exists('health-dataspace-rp')
YIELD exists
WITH exists
CALL apoc.do.when(
  exists,
  "CALL gds.graph.drop('health-dataspace-rp') YIELD graphName RETURN graphName",
  "RETURN null AS graphName",
  {}
) YIELD value
RETURN value;

// ── 2. Project the 5-layer graph ──
// Directed; FastRP ignores direction internally but the projection needs one.
CALL gds.graph.project.cypher(
  'health-dataspace-rp',
  // Node query — include every labelled node across L1–L5
  'MATCH (n)
   WHERE any(l IN labels(n) WHERE l IN [
     "Patient","Encounter","Condition","Observation","MedicationRequest","Procedure",
     "HealthDataset","Distribution","DataService","Catalogue",
     "Participant","DataProduct","OdrlPolicy","Contract","HDABApproval","TransferEvent",
     "OMOPPerson","OMOPVisitOccurrence","OMOPConditionOccurrence","OMOPMeasurement","OMOPDrugExposure",
     "SnomedConcept","LoincCode","ICD10Code","RxNormConcept"
   ])
   RETURN id(n) AS id, labels(n) AS labels',
  // Relationship query — include the main semantic edges
  'MATCH (a)-[r]->(b)
   WHERE type(r) IN [
     "HAS_ENCOUNTER","HAS_CONDITION","HAS_OBSERVATION",
     "HAS_MEDICATION","HAS_MEDICATION_REQUEST","HAS_PROCEDURE",
     "CODED_BY","HAS_THEME","HAS_DISTRIBUTION","PUBLISHED_BY",
     "OFFERS","CONSUMES","GOVERNS","GOVERNED_BY","COVERS","COVERS_DATASET","UNDER",
     "MAPPED_TO","HAS_CONDITION_OCCURRENCE","HAS_MEASUREMENT","HAS_DRUG_EXPOSURE",
     "HAS_VISIT_OCCURRENCE","FROM_DATASET"
   ]
   RETURN id(a) AS source, id(b) AS target, type(r) AS type',
  {
    // Some target nodes may fall outside the curated label set (e.g. audit
    // nodes, contract stubs); skip those relationships rather than failing.
    validateRelationships: false
  }
) YIELD graphName, nodeCount, relationshipCount
RETURN graphName, nodeCount, relationshipCount;

// ── 3. Compute and persist FastRP embeddings ──
// iterationWeights = [0.0, 1.0, 1.0, 1.0] → skip L0, weight hops 1–3 equally.
// normalizationStrength = 0.0 → preserve raw degree information.
CALL gds.fastRP.write(
  'health-dataspace-rp',
  {
    embeddingDimension: 256,
    iterationWeights: [0.0, 1.0, 1.0, 1.0],
    normalizationStrength: 0.0,
    randomSeed: 20260418,
    writeProperty: 'embedding'
  }
) YIELD nodePropertiesWritten, computeMillis
RETURN nodePropertiesWritten, computeMillis;

// ── 4. Drop the projection — embeddings are now persisted on nodes ──
CALL gds.graph.drop('health-dataspace-rp') YIELD graphName
RETURN graphName;

// ── 5. Mark embedded nodes with a shared label so a single vector index
//       covers the full 5-layer set without Neo4j-5 multi-label syntax ──
MATCH (n) WHERE n.embedding IS NOT NULL SET n:Embedded;

// ── 6. Native vector index (cosine, 256-d) — one per graph rather than
//       one per label, reflecting that GraphRAG compares across layers ──
CREATE VECTOR INDEX node_fastrp_index IF NOT EXISTS
FOR (n:Embedded)
ON n.embedding
OPTIONS {
  indexConfig: {
    `vector.dimensions`: 256,
    `vector.similarity_function`: 'cosine'
  }
};

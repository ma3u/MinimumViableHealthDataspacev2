// ==============================================================================
// Layer 6: Clinical Guidelines (AWMF Leitlinien)
//
// Phase 2 of issue #20 — schema for the German clinical guidelines layer that
// composes with Layers 1-5 of the EHDS Integration Hub knowledge graph.
//
// Pipeline upstream (see scripts/leitlinien/):
//   fetch_index.py        AWMF register API   → data/awmf-index.json
//   download_s3_pdfs.py   register.awmf.org   → data/leitlinien-pdf/*.pdf
//   parse_with_docling.py docling CPU pass    → data/leitlinien-docling/*.json
//                                             → data/leitlinien-markdown/*.md
//   load_layer6.py        Bolt, this schema   → :Guideline / :GuidelineSection
//                                                / :GuidelineChunk nodes
//
// Embeddings layer (separate file, matching the Layer 2-5 convention):
//   register-leitlinien-embeddings-aoai.cypher
//
// Run after: init-schema.cypher, register-eehrxf-profiles.cypher
// Idempotent: safe to re-run.
// ==============================================================================

// ────────────────────────────────────────────────────────────
// Node constraints — unique identifiers
// ────────────────────────────────────────────────────────────

CREATE CONSTRAINT guideline_awmf_id IF NOT EXISTS
  FOR (g:Guideline) REQUIRE g.awmfId IS UNIQUE;

CREATE CONSTRAINT guideline_section_id IF NOT EXISTS
  FOR (s:GuidelineSection) REQUIRE s.sectionId IS UNIQUE;

CREATE CONSTRAINT guideline_recommendation_id IF NOT EXISTS
  FOR (r:GuidelineRecommendation) REQUIRE r.recId IS UNIQUE;

CREATE CONSTRAINT guideline_chunk_id IF NOT EXISTS
  FOR (c:GuidelineChunk) REQUIRE c.chunkId IS UNIQUE;

// ────────────────────────────────────────────────────────────
// Property indexes — common filter / lookup paths
// ────────────────────────────────────────────────────────────

CREATE INDEX guideline_class IF NOT EXISTS
  FOR (g:Guideline) ON (g.guidelineClass);

CREATE INDEX guideline_release_date IF NOT EXISTS
  FOR (g:Guideline) ON (g.releaseDate);

CREATE INDEX guideline_valid_until IF NOT EXISTS
  FOR (g:Guideline) ON (g.validUntilDate);

CREATE INDEX guideline_section_awmf IF NOT EXISTS
  FOR (s:GuidelineSection) ON (s.awmfId);

CREATE INDEX guideline_recommendation_grade IF NOT EXISTS
  FOR (r:GuidelineRecommendation) ON (r.gradeOfRecommendation);

CREATE INDEX guideline_recommendation_evidence IF NOT EXISTS
  FOR (r:GuidelineRecommendation) ON (r.levelOfEvidence);

CREATE INDEX guideline_chunk_awmf IF NOT EXISTS
  FOR (c:GuidelineChunk) ON (c.awmfId);

CREATE INDEX guideline_chunk_section IF NOT EXISTS
  FOR (c:GuidelineChunk) ON (c.sectionId);

// ────────────────────────────────────────────────────────────
// Fulltext index — German clinical search
// ────────────────────────────────────────────────────────────

CREATE FULLTEXT INDEX guideline_search IF NOT EXISTS
  FOR (n:Guideline|GuidelineSection|GuidelineRecommendation|GuidelineChunk)
  ON EACH [n.name, n.heading, n.description, n.recommendationText, n.titleKeywords, n.text]
  OPTIONS {
    indexConfig: {
      `fulltext.analyzer`: 'german',
      `fulltext.eventually_consistent`: false
    }
  };

// ────────────────────────────────────────────────────────────
// Vector index — chunk-level GraphRAG retrieval
//
// Matches the convention used by node_semantic_index
// (register-embeddings-aoai.cypher): 1536-dim cosine, OpenAI / Azure OpenAI
// text-embedding-3-small. Stored on :GuidelineChunk.semanticEmbedding so that
// it composes with Layer 2-5 retrievers without code changes.
// ────────────────────────────────────────────────────────────

CREATE VECTOR INDEX guideline_chunk_embedding IF NOT EXISTS
  FOR (c:GuidelineChunk) ON (c.semanticEmbedding)
  OPTIONS {
    indexConfig: {
      `vector.dimensions`: 1536,
      `vector.similarity_function`: 'cosine'
    }
  };

RETURN 'Layer 6 (Clinical Guidelines) schema registered' AS status;

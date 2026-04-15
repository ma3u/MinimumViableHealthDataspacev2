# ADR-019: Neo4j GDS + APOC + Azure AI Foundry for GraphRAG Accuracy

**Status:** Proposed
**Date:** 2026-04-15
**Relates to:**
[ADR-001](ADR-001-postgresql-neo4j-split.md),
[ADR-012](ADR-012-azure-container-apps.md),
[ADR-017](ADR-017-persistent-storage-aca.md),
[ADR-018](ADR-018-24x7-workaround-b.md)
**Tracked by:** Phase 25 in `docs/planning-health-dataspace-v2.md`

## Context

The NLP query view (`ui/src/app/query/page.tsx` → `/api/nlq` →
`services/neo4j-proxy/src/index.ts`) already supports five resolution strategies:
`template`, `fulltext`, `graphrag`, `llm`, `none`. The multi-provider LLM backend
(OpenAI, Anthropic, Ollama, Azure OpenAI) is wired but **not exercised on the live
stack**, because:

1. **GDS plugin is absent on both local and Azure Neo4j.** `docker-compose.yml`
   sets `NEO4J_PLUGINS='["apoc","n10s"]'`; `scripts/azure/02-data-layer.sh` sets
   `'["apoc"]'`. Without `gds.*`, we cannot compute node embeddings in-database
   (FastRP, Node2Vec, graphSAGE) or run similarity/PageRank over the 5-layer
   graph. GraphRAG falls back to fulltext, which conflates "diabetes" with
   "gestational diabetes" and misses relationship context entirely.
2. **No vector index on nodes.** Neo4j 5.11+ supports native vector indexes
   (`CREATE VECTOR INDEX`), but we never create one — so even if we had
   embeddings, similarity search would be a linear scan.
3. **No embeddings are materialised at seed time.** The seed pipeline
   (`neo4j/seed.sh` + 12 Cypher files) leaves `embedding` properties empty. Any
   NLQ request that reaches the GraphRAG branch pays the full embedding cost on
   every call — unacceptable for interactive UX and expensive against a paid
   Azure OpenAI endpoint.
4. **No Azure AI Foundry deployment exists.** The env vars
   `AZURE_OPENAI_GPT4O_URL` and `AZURE_OPENAI_API_KEY` are read by the proxy but
   never set on the `mvhd-neo4j-proxy` container app. The cloud demo therefore
   cannot showcase LLM-assisted Text2Cypher or semantic rerank.
5. **Local-install burden.** Contributors without an Azure subscription or an
   API key cannot run the NLP view at all — the query page should still work
   with template + fulltext only, and the LLM features must be strictly
   optional, auto-detected from environment, and never required for a green
   `docker compose up`.

## Decision

Ship a coherent GraphRAG stack in three layers, each independently shippable
and independently optional at runtime.

### 1. Neo4j plugin layer — enable GDS + APOC everywhere

**Local (`docker-compose.yml`):**

```yaml
environment:
  NEO4J_PLUGINS: '["apoc","apoc-extended","graph-data-science","n10s"]'
  NEO4J_dbms_security_procedures_unrestricted: "apoc.*,gds.*"
  NEO4J_dbms_security_procedures_allowlist: "apoc.*,gds.*"
  NEO4J_server_memory_heap_initial__size: "1G"
  NEO4J_server_memory_heap_max__size: "2G"
  NEO4J_server_memory_pagecache_size: "1G"
```

Memory bumped from 512m/1G to 1G/2G because GDS projects the in-memory graph
and FastRP touches every node+relationship. Pagecache bumped to 1G for
ontology-heavy queries.

**Azure (`scripts/azure/02-data-layer.sh`):**

Same `NEO4J_PLUGINS` + allowlist/unrestricted flags. Container app resources
bump from 1.0 vCPU / 2 GiB → **1.5 vCPU / 4 GiB** and a dedicated
`NEO4J_server_memory_pagecache_size=2G` env var. This stays inside the
Consumption workload profile limits and does not require a Dedicated profile.

**Why both APOC + GDS, not GDS alone:**

- `apoc.ml.openai.embedding()` and `apoc.ml.azure.openai.embedding()` let us
  call the embeddings endpoint directly from Cypher, so bulk seeding runs
  in-database without a round-trip to the proxy.
- `apoc.periodic.iterate` for batching embedding generation over 5300+ nodes
  without lock contention.
- `gds.fastRP.mutate` / `gds.node2vec.mutate` as an **offline** fallback when
  no Azure OpenAI key is available — FastRP produces 256-dim structural
  embeddings purely from the graph topology, which is enough for coarse
  retrieval and works zero-cost in the local docker-compose install.

### 2. Embedding layer — FastRP (always) + Azure OpenAI (optional)

**Structural embeddings (FastRP, always-on):**

New Cypher file `neo4j/register-embeddings-fastrp.cypher`, run by `seed.sh`
after `insert-synthetic-schema-data.cypher`:

```cypher
CALL gds.graph.project(
  'ehds-graph',
  ['Patient','Condition','Observation','MedicationRequest',
   'OMOPPerson','OMOPConditionOccurrence','OMOPDrugExposure',
   'HealthDataset','Distribution','DataProduct','Participant',
   'SnomedConcept','LoincCode','ICD10Code','RxNormConcept'],
  '*'
);
CALL gds.fastRP.write(
  'ehds-graph',
  { embeddingDimension: 256,
    iterationWeights: [0.0, 1.0, 1.0, 1.0],
    writeProperty: 'embeddingFastRP' }
);
CREATE VECTOR INDEX node_fastrp_index IF NOT EXISTS
FOR (n) ON (n.embeddingFastRP)
OPTIONS { indexConfig: {
  `vector.dimensions`: 256,
  `vector.similarity_function`: 'cosine'
}};
```

**Semantic embeddings (Azure OpenAI `text-embedding-3-small`, optional):**

New Cypher file `neo4j/register-embeddings-aoai.cypher`, run **only if**
`AZURE_OPENAI_EMBEDDING_URL` + `AZURE_OPENAI_API_KEY` are set. `seed.sh` guards
this with an `if` block so the seed succeeds in zero-cost mode.

```cypher
CALL apoc.periodic.iterate(
  'MATCH (d:HealthDataset) WHERE d.embedding IS NULL RETURN d',
  'WITH d, d.title + " " + coalesce(d.description,"") AS text
   CALL apoc.ml.azure.openai.embedding([text], $apiKey, $url, {}) YIELD embedding
   SET d.embedding = embedding',
  { batchSize: 50, parallel: false,
    params: { apiKey: $azureKey, url: $azureEmbeddingUrl } }
);
CREATE VECTOR INDEX dataset_semantic_index IF NOT EXISTS
FOR (d:HealthDataset) ON (d.embedding)
OPTIONS { indexConfig: {
  `vector.dimensions`: 1536,
  `vector.similarity_function`: 'cosine'
}};
```

The 1536-dim index for `text-embedding-3-small` lives alongside the 256-dim
FastRP index. GraphRAG at query time uses whichever is populated (semantic
preferred, structural fallback).

### 3. LLM layer — Azure AI Foundry deployment + local optional

**Azure AI Foundry setup (new `scripts/azure/07-ai-foundry.sh`):**

1. `az cognitiveservices account create --kind OpenAI --sku S0` creating
   `aoai-mvhd-ehds` in `westeurope`.
2. Deploy two models:
   - `gpt-4o-mini` (for Text2Cypher + rerank — cheap, 128k context)
   - `text-embedding-3-small` (1536-dim, low cost)
3. Extract endpoint + key, inject as env vars into the `mvhd-neo4j-proxy`
   container app:
   - `AZURE_OPENAI_GPT4O_URL`
   - `AZURE_OPENAI_EMBEDDING_URL`
   - `AZURE_OPENAI_API_KEY` (marked as secret in ACA)
4. Also inject into `mvhd-neo4j-seed` job so seeding can materialise
   semantic embeddings on every reseed.

`AZURE_OPENAI_API_KEY` is stored as an **ACA secret**, not a plain env var,
and referenced via `--secrets aoai-key=... --env-vars AZURE_OPENAI_API_KEY=secretref:aoai-key`.
No key ever lands in the build image or Git.

**Local install — strictly optional:**

- `docker-compose.yml` declares `AZURE_OPENAI_*` variables with empty defaults
  using `${VAR:-}` syntax; no `.env` file is required.
- A new `neo4j-proxy` startup check logs exactly one of three lines:
  - `NLP backend: Azure OpenAI (gpt-4o-mini)`
  - `NLP backend: Ollama (llama3.1)` (when `OLLAMA_URL` is set)
  - `NLP backend: template + fulltext only (no LLM configured)`
- The query UI surfaces the detected mode in a single badge on
  `ui/src/app/query/page.tsx`, so the user immediately sees which resolution
  strategies are available.
- `README.md` gets a new "Optional AI backends" section with three
  copy-pasteable setups: zero-cost (nothing), local Ollama, Azure OpenAI.

### 4. GraphRAG pipeline (runtime)

New file `services/neo4j-proxy/src/graphrag.ts` implements the pipeline used
by `POST /nlq` when the template branch misses:

```
user_query
  └─> embed(query) via Azure OpenAI (or FastRP fallback)
  └─> vector_search(HealthDataset, top_k=10)   ──┐
  └─> vector_search(Condition, top_k=10)       ──┤── merge & dedupe
  └─> vector_search(Observation, top_k=10)     ──┘
  └─> expand_neighbourhood(2 hops) via apoc.path.subgraphAll
  └─> llm_rerank(gpt-4o-mini, top_k=5) → Cypher plan
  └─> execute plan, return rows + provenance trace
```

Every stage is **traced** and surfaced in the response's `trace` field, which
the query page already renders in its debug drawer.

## Consequences

### Positive

- **Accuracy**: semantic search over HealthDCAT-AP datasets + FHIR clinical
  concepts, with graph-neighbourhood expansion for context — currently
  impossible.
- **Azure demo parity**: NLP view becomes a first-class feature on
  `ehds.mabu.red`, demonstrating an end-to-end EHDS-compliant GraphRAG flow
  with zero hardcoded templates.
- **Local install stays zero-cost**: existing `docker compose up` continues to
  work; FastRP embeddings alone give coarse GraphRAG without any API key.
- **Cost**: `text-embedding-3-small` is ~$0.02 per 1M tokens; the full seed
  (5300 nodes × ~100 tokens/node) costs <$0.02. `gpt-4o-mini` rerank at query
  time is ~$0.15 per 1M input tokens → <$0.001 per query. Well within ADR-018's
  cost envelope.
- **No secret leakage**: key lives in ACA secret, never in code or image.
- **Foundation for future work**: once vector indexes exist, we can add
  hybrid search (BM25 + vector) and cross-encoder rerank without schema
  changes.

### Negative

- **Neo4j memory footprint grows** (512m → 2G local, 2Gi → 4Gi Azure). On
  constrained laptops this may push the full JAD stack over 10 GB. Documented
  in `docs/gotchas.md`.
- **GDS licence footprint**: `graph-data-science` is GPL-v3 community edition
  (sufficient for FastRP, Node2Vec, PageRank, similarity). The enterprise
  features (incremental updates, bigger graphs) are not used and not required.
- **Seed time grows** by ~30s for FastRP and, when Azure OpenAI is enabled, by
  ~60–90s for semantic embeddings over ~250 datasets/concepts. Acceptable for
  the weekly reset (ADR-014) and one-shot on `docker compose up`.
- **New external dependency** on Azure Cognitive Services. ADR-018's strict
  subscription-RBAC analysis must be re-checked — `Microsoft.CognitiveServices`
  resource provider registration may require owner-only approval on
  `INF-STG-EU_EHDS`. If blocked, fall back to Ollama-in-ACA (a fourth option
  this ADR explicitly keeps open: see `OLLAMA_URL` env var in neo4j-proxy).

### Neutral

- No schema changes to L1–L5. Embeddings live as `embeddingFastRP` /
  `embedding` properties next to existing node properties.
- No API contract change for `/nlq` — the response shape is unchanged; only
  the `method` and `trace` fields gain new values (`graphrag-vector`,
  `graphrag-hybrid`).
- NLQ templates remain the primary strategy for the 50 most common demo
  questions — GraphRAG is the fallback that makes the open set work.

## Alternatives considered

1. **GDS-only, no LLM** — FastRP is free and fast, but structural embeddings
   alone cannot distinguish "diabetes type 1" from "diabetes type 2" and will
   always return the wrong dataset on semantic ambiguity. Rejected.
2. **External vector DB (Weaviate, Qdrant)** — Adds a new container, new
   network hop, duplicate persistence layer, and a second graph-↔-vector sync
   problem. Neo4j's native vector index is adequate for 10k nodes. Rejected.
3. **Ollama-only** — Zero-cost and self-hosted, but `llama3.1` at 8B on a
   laptop CPU is ~15 s/query and not representative of the cloud demo UX.
   Kept as a **fallback**, not the primary.
4. **Skip embeddings, use LLM-only Text2Cypher** — Works for well-formed
   questions, but has no recall path for exploratory queries ("what datasets
   are about cardiovascular?") and cannot expand neighbourhoods. Rejected as
   the sole strategy; kept as the final branch after GraphRAG.
5. **Do nothing** — The query page currently shows "No results" for the
   majority of free-form inputs, which is visibly broken on the public demo.
   Rejected.

## Implementation plan

See **Phase 25** in [`planning-health-dataspace-v2.md`](../planning-health-dataspace-v2.md)
for the step-by-step rollout. Tracked by GitHub issue
[ma3u/MinimumViableHealthDataspacev2#13](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/13).

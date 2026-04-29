# Leitlinien ingestion pipeline (issue #20)

Discovers, downloads, parses, and **loads into Neo4j as Layer 6** of the EHDS
Integration Hub knowledge graph the corpus of German medical guidelines (AWMF
Leitlinien).

Tracks [issue #20](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/20).
Phase 1 = discovery + download + Docling parse. Phase 2 = Neo4j Layer 6 loader
(this PR).

## Pipeline

```
AWMF register SPA
  │ (api-key header discovered via Playwright)
  ▼
leitlinien-api.awmf.org/v1/list/guidelines   ──►  data/awmf-index.json          (848 guidelines, all classes)
                                                        │ filter: S3 + active longVersion
                                                        ▼
register.awmf.org/assets/guidelines/{folder}/{media}  ──►  data/leitlinien-pdf/*.pdf
                                                        │ docling
                                                        ▼
                                                  data/leitlinien-docling/*.json  (structured)
                                                  data/leitlinien-markdown/*.md   (chunk-friendly)
                                                        │ load_layer6.py
                                                        ▼
                                                  Neo4j Layer 6:
                                                    (:Guideline)-[:HAS_SECTION]->(:GuidelineSection)
                                                                                     │
                                                                                     ▼
                                                                              (:GuidelineChunk)
                                                    (:Guideline)-[:COVERS_EHDS_CATEGORY]->(:EEHRxFCategory)
                                                    (:Guideline)-[:PUBLISHED_BY]->(:Organization)
                                                        │ register-leitlinien-embeddings-aoai.cypher
                                                        ▼
                                                  c.semanticEmbedding (1536-dim, cosine)
                                                  → guideline_chunk_embedding vector index
```

Outputs are **gitignored** — the PDFs are AWMF-copyrighted, the docling JSON is
derivative data, and the corpus is >1 GB.

## Setup

```bash
cd scripts/leitlinien
uv sync                                    # python 3.11 + playwright + docling
uv run playwright install chromium         # one-time: ~150 MB chromium download
```

First `parse_with_docling.py` run additionally downloads ~2 GB of docling
layout/table/OCR models into `~/.cache/docling/` (cached across runs).

## Usage

```bash
# 1. Fetch the full AWMF guideline index (848 entries, one API call, 4.6 MB)
uv run python fetch_index.py

# 2. Download S3 longVersion PDFs  (polite: 1s sleep between requests)
uv run python download_s3_pdfs.py --limit 5   # smoke test
uv run python download_s3_pdfs.py             # all ~238 S3 guidelines with derivable folders

# 3. Parse downloaded PDFs with docling
uv run python parse_with_docling.py --limit 3           # smoke test
uv run python parse_with_docling.py --only 018-038OL    # single-PDF mode
uv run python parse_with_docling.py                     # full parse
```

Both download and parse scripts are **resumable** — they skip outputs that
already exist on disk.

## AWMF API auth

The backing API at `leitlinien-api.awmf.org` requires an `api-key` header.
The key is a static token **embedded in the AWMF register's JS bundle** and is
sent to the API from every browser that loads the register — effectively a
public token with no secrecy expectation. It is used here only to read the
public guideline index; no personal data, no authenticated user context.

If the token ever rotates and `fetch_index.py` starts returning
`{"status":"error","message":"Unauthorized..."}`, re-extract it by running:

```bash
uv run python discover_auth.py
```

which loads the register in headless Chromium via Playwright, captures the
`api-key` header from the live request, and prints it for you to paste back
into `fetch_index.py`.

## Current coverage (2026-04-24 run)

| Class | In index | Downloaded | Notes                                                     |
| ----- | -------: | ---------: | --------------------------------------------------------- |
| S3    |      250 |        223 | 94% success; 15 `HTTP 500` on `-abgelaufen-` URLs (stale) |
| S2k   |      330 |          — | roadmap — same pipeline, flip `AWMFGuidelineClass` filter |
| S2e   |       39 |          — | roadmap                                                   |
| S1    |      229 |          — | roadmap                                                   |
| Total |      848 |        223 |                                                           |

**Docling parse on 3 S3 smoke-test PDFs: 3/3 OK.** Handles German umlauts,
section hierarchy, and Markdown-table extraction cleanly. Minor quirks on
leader-dot TOC tables (PDF-source artefact, not docling bug) and occasional
merged adjacent numbered list items.

Steady-state parse cost: **~0.2-0.3 seconds per PDF page** after model warmup.
Full 223-PDF parse: ~3 hours CPU-bound.

## Phase 2 — Neo4j Layer 6 loader

### Schema

`neo4j/register-leitlinien-schema.cypher` registers four new node labels with
constraints and indexes, plus a German fulltext index across all four labels
and a 1536-dim cosine vector index on `:GuidelineChunk.semanticEmbedding`
(matching the convention from `register-embeddings-aoai.cypher`).

| Node                       | Unique key                          | Source                                       |
| -------------------------- | ----------------------------------- | -------------------------------------------- |
| `:Guideline`               | `awmfId` (e.g. `001-018`)           | `data/awmf-index.json`                       |
| `:GuidelineSection`        | `sectionId` (`{awmfId}::sNNN-slug`) | H2 headings in the Markdown rendering        |
| `:GuidelineRecommendation` | `recId`                             | _deferred — Phase 2.1, needs LLM extraction_ |
| `:GuidelineChunk`          | `chunkId` (`{sectionId}::cNNN`)     | ~500-word windows over section bodies        |

### Load

```bash
# 1. Register the Layer 6 schema (once per database)
cypher-shell -u neo4j -p $NEO4J_PASSWORD < neo4j/register-leitlinien-schema.cypher

# 2. Load Guideline + Section + Chunk nodes from local data
cd scripts/leitlinien
uv sync
NEO4J_PASSWORD=... uv run python load_layer6.py --limit 5      # smoke test
NEO4J_PASSWORD=... uv run python load_layer6.py                # full corpus

# 3. Embed chunks via Azure OpenAI (matches the Layer 2-5 convention)
cypher-shell -u neo4j -p $NEO4J_PASSWORD \
  --param 'apiKey => $AZURE_OPENAI_API_KEY' \
  --param 'endpoint => $AZURE_OPENAI_EMBEDDINGS_URL' \
  < neo4j/register-leitlinien-embeddings-aoai.cypher
```

The loader is **resumable** — guidelines whose `chunkCount` is already > 0 are
skipped unless `--force` is passed. `--dry-run` reports what would be written
without touching the database.

### Costs

For 223 S3 guidelines:

| Stage            | Output                                | Cost                                                 |
| ---------------- | ------------------------------------- | ---------------------------------------------------- |
| `load_layer6.py` | ~25-40K Section + ~30-60K Chunk nodes | Free (local Bolt session)                            |
| AOAI embedding   | `c.semanticEmbedding` on every chunk  | ~€0.50-1.50 (`text-embedding-3-small` at $0.02/MTok) |

### Tests

```bash
cd scripts/leitlinien
uv run --group dev pytest test_layer6_unit.py -v   # 21 unit tests, no DB needed
```

Covers: Markdown section parsing, chunk grouping with target/min word logic,
section/chunk ID generators, and EEHRxF category-mapping heuristics. Live-DB
integration tests are deferred to a separate PR (require docker-compose Neo4j).

## Deferred follow-ups under issue #20

- **Phase 2.1 — `:GuidelineRecommendation` extraction.** German S3 guidelines
  embed structured recommendations with grade-of-recommendation (A/B/0/GCP)
  and level-of-evidence (1++/1+/2-/...) markers. Extracting these reliably
  needs an LLM-per-section pass; not in this PR.
- **Phase 2.2 — `APPLIES_TO` edges to ontology concepts.** Pivot
  recommendations to existing `:SnomedConcept` / `:ICD10Code` / `:RxNormConcept`
  / `:LoincCode` nodes via German biomedical NER (likely scispaCy + a German
  medical model, or a structured-output LLM call).
- **Phase 3 — UI.** New `/guidelines` route in `ui/`, Layer 6 colour in
  Graph Explorer, integration with `/query` natural-language search (#19).
- **Live-DB integration tests.** docker-compose Neo4j harness, ~10 E2E tests,
  90 % coverage push.
- **S2k / S2e / S1 ingestion.** Same pipeline, flip the `AWMFGuidelineClass`
  filter in `download_s3_pdfs.py`. Trivial after Phase 2 lands.

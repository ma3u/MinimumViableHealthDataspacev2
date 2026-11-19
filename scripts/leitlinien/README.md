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

## Open sources: NVL and DEGAM, cited studies, weekly watch

The AWMF register's `robots.txt` now reads "Block other automated retrieval"
(`User-agent: *`, `Disallow: /`) and the register and its API answer a script
with a bot check (seen 2026-11-19). `fetch_index.py` and `download_s3_pdfs.py`
above therefore need the AWMF's consent before they run again, on a laptop or
in CI. What follows reads the publishers whose `robots.txt` allows every
agent: `www.leitlinien.de` (Nationale VersorgungsLeitlinien) and `www.degam.de`.

```bash
cd scripts/leitlinien
python3 guideline_pipeline.py              # fetch new versions, convert, extract references
python3 guideline_pipeline.py --offline    # only convert what is on disk
python3 resolve_pmids.py                   # look up PubMed ids the guideline does not print
NEO4J_PASSWORD=... python3 load_guideline_citations.py
python3 -m pytest -q                       # 67 tests, no network, no database
```

`guideline_pipeline.py` needs `pdftotext` (poppler) and nothing else. It reads
the pages in `guideline-sources.json`, downloads a PDF it has not seen, writes
page-wise Markdown to `data/<store>-markdown/`, extracts the numbered reference
list of each long version, and writes `data/guidelines-manifest.json`. A
guideline is set `active: false` when its validity has passed (`expired`), a
newer version replaced it (`superseded`) or the page no longer offers it
(`withdrawn`); `partly-expired` marks a current version whose unrevised
chapters have run out. Nothing is deleted.

`resolve_pmids.py` asks PubMed's E-utilities for the entries without a PubMed
id: by DOI, else by journal, year, volume, first page and first author. It
takes a match only when PubMed returns exactly one record, sends bibliographic
data only, and caches every answer in `data/pmid-cache.json`. A sample of 12
citation matches was checked by hand against author and year: 12 correct.

`guidelines-state.json` is the committed record: titles, versions, dates,
status and reference counts, no guideline text. It counts only the PubMed ids
a guideline prints, so the weekly run, which does not resolve, reaches the
same file. `.github/workflows/guidelines-watch.yml` runs the pipeline every
Monday and opens an issue with the diff when the state changed.

`load_guideline_citations.py` writes `(:Guideline)-[:CITES]->(:Study)`.
`Study.id` is `pmid-<pmid>`, the form the Klarbefund health graph uses;
`CITES.pmidSource` is `reference list`, `doi` or `citation match`.

| Guideline                          | Version | Valid until                          | References | PubMed id printed | after resolving |
| ---------------------------------- | ------- | ------------------------------------ | ---------: | ----------------: | --------------: |
| NVL Typ-2-Diabetes                 | 3.0     | 2028-05-15                           |        238 |               123 |             124 |
| NVL Chronische KHK                 | 7.0     | 2029-08-14                           |        408 |               331 |             332 |
| NVL Chronische Herzinsuffizienz    | 4.0     | 2028-12-12, most chapters 2024-10-22 |        648 |               534 |             534 |
| NVL Hypertonie                     | 1.0     | 2028-06-29                           |        201 |               161 |             163 |
| DEGAM S3 Risikoberatung (053-024)  | 2.3     | 2029-11-30                           |        301 |                 0 |             189 |
| DEGAM S3 Nierenkrankheit (053-048) | 2.0     | 2029-06-30                           |        277 |                 0 |             197 |

Loaded on 2026-11-19 into the compose Neo4j: 6 guidelines, 1,496 studies,
1,539 `CITES` relationships.

The texts are copyrighted (ÄZQ, DEGAM), and both imprints name storage in
electronic systems as needing written consent. `data/` stays git-ignored;
loading the full text into a graph that others use needs that consent.
`docs/klarbefund/leitlinien-zusammenfassung.md` summarises, in its own words
and with page numbers, what the six guidelines say about the values Klarbefund
shows.

### Status and type of the cited studies

```bash
python3 study_status.py      # after resolve_pmids.py; then load_guideline_citations.py again
```

`study_status.py` asks PubMed (esummary) for every cited study and records
its notices (retracted, expression of concern, corrected and republished,
erratum) and its type (guideline, meta-analysis, systematic review,
randomised trial, ...). Every run also asks for one paper known to be
retracted and fails when PubMed does not show it as such, so "nothing found"
is backed by a positive control. A study PubMed does not return is listed as
not found, never as clean. `study-flags.json` is the committed record: the
flagged studies with the guidelines that cite them, and the count of study
types per guideline. The loader writes `publicationStatus`, `statusFlags`,
`studyType` and `statusCheckedAt` on each `Study`; the weekly watch reports a
study that gains a notice.

On 2026-11-19, of 1,496 studies: none retracted, one with an expression of
concern (the Hygia Chronotherapy Trial, cited by NVL Hypertonie, which draws
no recommendation from it), one corrected and republished (PREDIMED, the
2018 version), 111 with an erratum.

Open tasks are listed in issue #20.

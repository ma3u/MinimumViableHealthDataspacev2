# Leitlinien ingestion pipeline (Phase 1 of issue #20)

Discovers, downloads, and parses German medical guidelines (AWMF Leitlinien)
into structured DoclingDocument JSON and Markdown, ready for Neo4j GraphRAG
ingestion as Layer 6 of the health knowledge graph.

Tracks [issue #20](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/20).

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

## Next — Layer 6 loader (this issue, Phase 2)

The parsed Markdown + DoclingDocument JSON feed into a new Cypher loader that
creates `Guideline` / `GuidelineSection` / `GuidelineRecommendation` /
`GuidelineChunk` nodes per the graph schema described in issue #20. The
`neo4j-graphrag` Python package handles chunking and embedding; the
`APPLIES_TO` edges to existing `OntologyConcept` nodes (SNOMED CT / ICD-10-CM /
ATC / LOINC) pivot through the AWMF guideline text — likely via a named-entity
pass with a biomedical NER model.

Not yet implemented. Tracked under the same issue.

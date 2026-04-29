# ADR-021: Docling for AWMF Leitlinien PDF Ingestion (Layer 6)

**Status:** Proposed
**Date:** 2026-04-29
**Deciders:** Architecture, Security & Compliance, Platform/Cloud
**Relates to:**
[ADR-001](ADR-001-postgresql-neo4j-split.md),
[ADR-013](ADR-013-simpl-open-alignment.md),
[ADR-019](ADR-019-gds-apoc-azure-ai-foundry-graphrag.md),
[ADR-020](ADR-020-cross-participant-dataset-discovery.md)
**Tracks:** [Issue #20 — AWMF Leitlinien ingestion pipeline (Layer 6)](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/20)
**Tracked by:** Phase 27 in `docs/planning-health-dataspace-v2.md`

## Context

Issue #20 introduces a sixth knowledge-graph layer — German clinical
guidelines published by AWMF (Arbeitsgemeinschaft der Wissenschaftlichen
Medizinischen Fachgesellschaften). The S3-class guidelines are
methodologically rigorous, citable, and the canonical reference
clinicians consult alongside FHIR L3 records and SNOMED/LOINC L5
ontologies. To compose them with the existing graph (L1 marketplace,
L2 catalog, L3 clinical, L4 ODRL policy, L5 ontology), each PDF must
be parsed into structured `:Guideline → :GuidelineSection →
:GuidelineRecommendation → :GuidelineChunk` nodes with provenance
preserved.

The current pipeline, partially in place on
`feature/20-leitlinien-layer6-loader`:

1. `fetch_index.py` — pulls the AWMF register API into
   `data/awmf-index.json`.
2. `download_s3_pdfs.py` — fetches S3 guideline PDFs from
   `register.awmf.org`.
3. `parse_with_docling.py` — converts PDFs to structured
   `DoclingDocument` JSON + Markdown via the Docling library
   (CPU-only, resumable manifest, Phase 1 of issue #20).
4. `load_layer6.py` — Bolt-loads the parsed output into Neo4j against
   the schema in `neo4j/register-leitlinien-schema.cypher`.
5. `register-leitlinien-embeddings-aoai.cypher` — Azure OpenAI
   embeddings (AOAI), already covered by [ADR-019](ADR-019-gds-apoc-azure-ai-foundry-graphrag.md).

This ADR is specifically about step 3 — **how we extract structure
from clinical guideline PDFs** — because that step determines:

- where PHI-adjacent content travels (data residency),
- what licence governs the parsing toolchain,
- how portable the pipeline is across our local-dev,
  Azure Container Apps, and any future sovereign-cloud deployment
  targets ([ADR-012](ADR-012-azure-container-apps.md),
  [ADR-013](ADR-013-simpl-open-alignment.md)),
- how reliable the section/recommendation/grade extraction is for
  graph composition with L3 FHIR + L5 SNOMED.

### Constraints (from the project + ADR intake)

- **Security & compliance.** AWMF guidelines themselves are public, but
  the pipeline must run in environments that also process pseudonymous
  FHIR L3 data and HDAB-approved access requests. We cannot route
  guideline content (or future PHI-bearing extensions) through a
  third-party SaaS that breaks the data-residency story we tell to
  hospitals and data spaces participants. EU/DE residency is required
  by default; on-prem fallback must remain feasible.
- **Vendor lock-in.** The parser is a foundational primitive — it sits
  upstream of every downstream node, embedding, and NLQ result on
  Layer 6. Switching it later means re-ingesting every PDF and
  re-anchoring every chunk back to FHIR codes. We therefore weight
  permissive licensing, self-hostability, and a stable on-disk format
  much higher than peak extraction quality.
- **Existing stack.** `apoc + n10s` Neo4j plugins, Azure Container
  Apps for cloud, Docker Compose for local, Python 3.12 + uv for
  scripts, GHCR for image distribution
  ([ADR-006](ADR-006-ghcr-image-publishing.md)).
- **Local-dev friction budget.** A green `docker compose up` must not
  require a paid API key or a GPU. Contributors with a laptop and no
  Azure subscription should be able to ingest a small PDF set.

## Decision

**Use [Docling](https://github.com/docling-project/docling) (IBM
Research, MIT licence, currently a Linux Foundation AI & Data project)
as the canonical PDF → structured-document converter for Layer 6, run
locally inside our own containers / scripts on every deployment
target.** Do not call any external document-AI SaaS (AWS Textract,
Azure AI Document Intelligence, Mistral OCR, Unstructured.io Hosted)
from this step.

### Concrete consequences for the codebase

- `scripts/leitlinien/parse_with_docling.py` stays the single entry
  point. Inputs: `data/leitlinien-pdf/*.pdf`. Outputs:
  `data/leitlinien-docling/{awmfId}.json` (canonical) +
  `data/leitlinien-markdown/{awmfId}.md` (chunk-friendly fallback) +
  `data/parse-manifest.json` (resumability + audit).
- The `DoclingDocument` JSON is the **on-disk source of truth** for
  Layer 6 ingestion. `load_layer6.py` reads from JSON, never re-parses
  from PDF, so a parser swap later is a re-run of step 3, not a
  re-download from AWMF.
- Docling runs in a dedicated Python 3.12 container image
  (`ghcr.io/ma3u/leitlinien-parser:vX`, [ADR-006](ADR-006-ghcr-image-publishing.md))
  with CPU-only models pinned. No GPU dependency in the default path.
- We treat Docling's output schema as a **versioned contract** — pin
  the Docling version per release, write an export-version field into
  every JSON, and surface mismatches in `load_layer6.py`.
- We don't send guideline content to AOAI for parsing. AOAI is used
  only after parsing, at the embedding step
  ([ADR-019](ADR-019-gds-apoc-azure-ai-foundry-graphrag.md)) — and
  even there is optional: missing AOAI degrades NLQ to template +
  fulltext, never blocks ingestion.

## Options Considered

### Option A — Docling (selected)

| Dimension          | Assessment                                                                                                                         |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| Licence            | MIT. Linux Foundation governance. No "free tier vs paid" cliff.                                                                    |
| Hosting            | Self-hosted, in-process, runs anywhere a Python container runs. CPU-only path works.                                               |
| Data residency     | Content never leaves our perimeter. PDFs and parsed JSON stay on the same Azure region (or local box).                             |
| Output structure   | Native `DoclingDocument` graph: pages, sections, tables, lists, captions. Maps cleanly to `:GuidelineSection` / `:GuidelineChunk`. |
| Quality on AWMF S3 | Phase 1 spike on `feature/20-leitlinien-docling-pipeline` parses the long-form PDFs end-to-end with stable section detection.      |
| Speed              | Minutes per PDF on CPU; acceptable for a one-shot batch + nightly delta. Not interactive — but parsing is a build-time step.       |
| Lock-in risk       | Low. Output is plain JSON, schema is documented, multiple readers exist.                                                           |
| Team familiarity   | Pipeline already authored against this API; switching costs are real.                                                              |

**Pros:** OSS + permissive licence, self-hosted, structurally rich
output, lines up with the rest of our open-source stack
(Neo4j Community + APOC + n10s + EDC).

**Cons:** Slower than commercial OCR, no built-in layout model for
exotic page formats, ongoing maintenance is on us. Quality on
non-AWMF guideline sources (international ones) is uneven and would
need re-evaluation before reuse.

### Option B — Azure AI Document Intelligence (formerly Form Recognizer)

| Dimension        | Assessment                                                                                                                |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Licence          | Proprietary, per-page pricing.                                                                                            |
| Hosting          | Microsoft-managed. Container variant exists but is a separate licensing track and lags features.                          |
| Data residency   | EU regions available, but content traverses Microsoft service boundaries. Adds DPIA scope and a sub-processor disclosure. |
| Output structure | High-quality layout + table extraction. Custom extractors for hierarchical headings need training.                        |
| Speed            | Fast (seconds/page).                                                                                                      |
| Lock-in risk     | High. Output schema is Azure-specific. Re-running on a different cloud means re-ingesting.                                |
| Team familiarity | Already use AOAI for embeddings — additional surface area is small.                                                       |

**Pros:** Best-in-class layout/table fidelity, fast, fits the existing
Azure relationship.

**Cons:** Adds a Microsoft cloud dependency to a step that does not
strictly need it. Tightens the coupling between "this project runs on
Azure" and "this project ingests guidelines at all." Conflicts with the
SIMPL-Open alignment posture of [ADR-013](ADR-013-simpl-open-alignment.md).

### Option C — Unstructured.io (Open-source library + Hosted API)

| Dimension        | Assessment                                                                                       |
| ---------------- | ------------------------------------------------------------------------------------------------ |
| Licence          | Apache-2.0 for the library. Hosted API is paid.                                                  |
| Hosting          | Self-host the library, or use the hosted API. Best quality is on the hosted side.                |
| Data residency   | Self-host: fine. Hosted: extra processor.                                                        |
| Output structure | Flat element list (Title, NarrativeText, Table, ListItem, …). Reconstructing hierarchy is on us. |
| Lock-in risk     | Medium. Two-tier ecosystem creates a temptation to drift onto the paid path for quality.         |
| Team familiarity | None.                                                                                            |

**Pros:** Mature OSS, broad format support, good ergonomics.

**Cons:** Output model is flatter than Docling's, which means more
glue code on our side to recover the section tree we need for
`:GuidelineSection` / `:GuidelineRecommendation`. The "hosted is
better" gradient is a soft lock-in we'd rather not introduce.

### Option D — Mistral OCR / GPT-4o Vision via AOAI

| Dimension        | Assessment                                                                                                   |
| ---------------- | ------------------------------------------------------------------------------------------------------------ |
| Licence          | Proprietary, per-token pricing.                                                                              |
| Hosting          | Hosted only (Mistral) or via AOAI (Microsoft).                                                               |
| Data residency   | Mistral: EU-hosted but separate processor. AOAI: same region as our embeddings deployment.                   |
| Output structure | Free-form Markdown / JSON; no canonical schema. Requires post-processing.                                    |
| Cost             | High at scale — ~hundreds of pages per guideline × hundreds of guidelines.                                   |
| Determinism      | Low. Same PDF → different output across model revisions. Bad for a graph that's supposed to be re-buildable. |
| Lock-in risk     | High (model-revision lock-in is its own kind).                                                               |

**Pros:** Strong on messy scans and non-textual layouts.

**Cons:** Non-deterministic outputs make reproducible Layer 6 builds
hard. Costs scale with re-ingestion. Not a fit for "the parser is a
foundational primitive."

### Option E — pdfminer.six / PyMuPDF + custom heuristics

| Dimension        | Assessment                                                      |
| ---------------- | --------------------------------------------------------------- |
| Licence          | MIT / AGPL (PyMuPDF dual). Both self-hostable.                  |
| Hosting          | In-process.                                                     |
| Output structure | Raw text + bbox. We rebuild heading/section logic from scratch. |
| Quality          | Fragile on AWMF formatting variations.                          |
| Lock-in risk     | Lowest. Pure stdlib-shaped libraries.                           |

**Pros:** Tiny dependency footprint, full control.

**Cons:** All the heuristic work that Docling already encapsulates
becomes our maintenance burden. We'd be reinventing a layout model.

## Trade-off Analysis

The two named constraints — **security/compliance** and **vendor
lock-in** — both push toward in-process OSS with permissive licence
and self-host capability. That eliminates **B** and **D**. Between
**A**, **C**, and **E**, **A** wins because:

- It produces a **hierarchically structured** document model
  (Docling's `DoclingDocument`) that maps almost 1:1 onto our Layer 6
  Cypher schema, where C and E require us to rebuild that hierarchy.
- It already sits inside our Phase 1 spike on the active branch and
  has parsed the canonical AWMF PDFs end-to-end.
- The MIT licence + LF-AI governance gives us a credible long-term
  story: if the IBM stewardship changed, the project is portable, the
  output schema is documented, and the operational model (Python
  package, no daemon, JSON output) is trivial to re-implement against
  any successor parser without re-downloading PDFs.

The cost we accept is **slower-per-PDF parsing** and **a heavier
ongoing dependency** than a quick `pdftotext` script. We mitigate the
first with resumable batch builds (already implemented via
`parse-manifest.json`) and the second by treating Docling's JSON as
the on-disk contract — load steps don't depend on the Python API,
only on the schema.

## Consequences

**Becomes easier**

- Layer 6 ingestion is reproducible from a clean clone with no API
  keys: `uv run python parse_with_docling.py --limit 3` works on a
  laptop.
- The pipeline can run inside a sovereign-cloud deployment (BMDS /
  Deutschland Stack scenarios) without changing the parser.
- Privacy reviewers can audit the entire Layer 6 path without
  third-party DPAs for the parsing step.
- Re-anchoring extracted recommendations to FHIR/SNOMED is mechanical:
  Docling's `DoclingDocument` already preserves heading paths and
  page references, which become `:GuidelineSection.path` and
  `:GuidelineChunk.pageRange`.

**Becomes harder**

- Quality bumps require either upstream Docling improvements or
  in-house heuristics. We carry the quality risk.
- Long PDFs are CPU-bound; CI runs that exercise Layer 6 must
  pre-bake a small fixture set rather than parse end-to-end on every
  job.
- Edge formats (scanned-only PDFs, encrypted PDFs) will need a
  pre-processing step we own.

**Will need to revisit**

- If we ingest non-AWMF guideline corpora (NICE, USPSTF) and find
  Docling lags on their layout, evaluate Option C as a complement —
  but keep Docling as default to preserve schema continuity.
- If Docling stewardship materially changes (project archive, licence
  switch, breaking-schema majors), trigger a rebuild evaluation —
  output JSON is portable, so this is a parser swap not a data
  migration.
- A vector-index step downstream of this ADR is covered by
  [ADR-019](ADR-019-gds-apoc-azure-ai-foundry-graphrag.md); cross-
  participant discovery is covered by [ADR-020](ADR-020-cross-participant-dataset-discovery.md).
  No further ADRs needed in this slice.

## Action Items

1. [ ] Pin Docling version in `scripts/leitlinien/pyproject.toml`
       (or `requirements.txt`) and record it in the parse manifest's
       `parser.version` field.
2. [ ] Add a `parser` block to `data/parse-manifest.json` schema
       (`{name, version, options}`) and assert it in
       `load_layer6.py` before loading.
3. [ ] Build and publish `ghcr.io/ma3u/leitlinien-parser:vX`
       (CPU-only image) and reference it from
       `docker-compose.jad.yml`.
4. [ ] Add a smoke fixture (3 small guidelines) and a CI job that
       parses + loads + queries them on every PR touching
       `scripts/leitlinien/` or `neo4j/register-leitlinien-*.cypher`.
5. [ ] Document in `docs/security/` that Layer 6 parsing is
       in-process, with no third-party data flow, and link this ADR.
6. [ ] Open follow-up issues for: scanned-PDF fallback, NICE/USPSTF
       evaluation, Docling-version bump policy.

## Out of scope

- Embedding strategy and AOAI usage — covered by ADR-019.
- Cross-participant guideline discovery via federated catalogs —
  covered by ADR-020.
- Layer 6 → Layer 3 (FHIR) and Layer 6 → Layer 5 (SNOMED/LOINC/ICD-10)
  anchoring rules — separate ADR (proposed: ADR-022).

# Issue #26 — HealthDCAT-AP metadata validation (SHACL) + source-level data quality (DQV)

**Issue:** [#26 — RDF Validate HealthDCAT-AP with SHACL and validate the structure ShEx](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/26)
**Status:** planned (future) · **Depends on:** ADR-003 (HealthDCAT-AP alignment), ADR-020 (federated discovery)
**Motivation (from the issue):** quality measures must run **at the data source, before sharing**, so
researchers get an honest assessment of the data in the W3C DCAT catalog.

## Decision: SHACL primary, ShEx optional spike

- **SHACL is the primary validation technology.** Official artefacts exist: the EU runs an
  ITB-based [HealthDCAT-AP SHACL validator](https://health-data-itb-rdf-validator.acceptance.data.health.europa.eu/shacl/ehds/upload)
  (with an API) for HealthData@EU, [Health-RI publishes open SHACL shapes](https://github.com/Health-RI/metadata-shacl-validation),
  and [SEMICeu ships DCAT-AP 3.0 shapes](https://github.com/SEMICeu/DCAT-AP). Mature runtimes exist
  for both our stacks: `rdf-validate-shacl` (npm — neo4j-proxy) and `pyshacl` (Python — enricher).
- **ShEx has no official HealthDCAT-AP schema** — the former healthdcat-ap.github.io spec has been
  migrated to EC infrastructure and publishes SHACL only. A ShEx schema would have to be
  hand-authored and maintained in parallel. Keep it as a **Phase 4 time-boxed spike**, expected
  outcome "covered by SHACL".

## Current state (verified in repo, 2026-07-17)

| Concern               | Today                                                                                                                                                                                                                          |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| JSON-LD serialization | Two serializers: proxy full-catalog `services/neo4j-proxy/src/index.ts:627-833` (rich, `Content-Type: application/ld+json`) and an 11-field client-side one in `ui/src/app/catalog/page.tsx:177-199` ("Download DCAT-AP", J88) |
| Namespace consistency | **Divergent**: client uses `https://healthdcat-ap.github.io/ns#`, proxy uses `http://healthdcat-ap.eu/ns#`                                                                                                                     |
| Graph write paths     | **Divergent**: enricher/seeds key `HealthDataset {datasetId}` + `[:PUBLISHED_BY]`; UI POST `ui/src/app/api/catalog/route.ts` keys `{id}` + `[:PUBLISHES]`; GET coalesces both                                                  |
| Validation            | None. Enricher does Pydantic envelope checks only (`services/catalog-enricher/src/models.py`); ADR-020 made the interface deliberately loose. `conformsTo` is an unchecked string                                              |
| Quality metrics       | DQV appears only in docs/diagrams (`ui/src/app/docs/architecture/page.tsx:18`); nothing in Neo4j or services                                                                                                                   |

## Existing building blocks (inventory 2026-07-17)

Quality/validation pieces already implemented — none at the RDF/SHACL level, but real head starts:

- **Graph structural validation** — `GET /api/graph/validate` (J160–J164): required props per
  label, edge rules, orphans, unknown labels. Guards the property graph; SHACL will guard the
  exported RDF. Complementary, keep both.
- **`DataQualityLabelCredential`** — issued by issuerservice, seeded + linked to HealthDatasets
  (`neo4j/register-ehds-credentials.cypher`), requirable by ODRL policies, NLQ-discoverable.
  Currently _asserted, not measured_ — Phase 3 DQV measurements should become its backing
  evidence (measured quality feeding credential issuance).
- **Cohort data quality** (issue #19) — `computeCohortDataQuality` in the proxy: SNOMED/RxNorm
  coding coverage %, global + cohort-scoped, in NLQ responses. First DQV dimension, already
  computed — Phase 3 re-publishes it in the catalog.
- **k-anonymity suppression** (issue #8) — `aggregateSuppressed`/`contributor_k_violation` on
  `QueryAuditEvent`. Second ready-made DQV dimension.
- **Ingest envelope validation** — enricher Pydantic checks + `unknownThemes[]` metric.
- **JSON-LD export** — both endpoints exist; Phase 1 only adds shapes + validator over them.

## Phases

### Phase 0 — Serialization hygiene (prerequisite, ~1 PR)

Validation will instantly flag today's inconsistencies, so fix them first:

1. One canonical JSON-LD serializer: "Download DCAT-AP" fetches the proxy's
   `GET /catalog/datasets/:id` instead of building its own JSON-LD client-side.
2. Pin one `healthdcatap:` namespace URI in a shared constant.
   `UNKNOWN — exact canonical URI; verify against the EC-hosted HealthDCAT-AP spec at
implementation time (github.io spec is decommissioned).`
3. Unify the `HealthDataset` write paths on `datasetId` + `[:PUBLISHED_BY]` (migration Cypher:
   `SET d.datasetId = coalesce(d.datasetId, d.id)`, idempotent MERGE per repo convention).

### Phase 1 — SHACL validation of our own catalog (source-level, pre-sharing)

1. Vendor pinned shape files under `services/neo4j-proxy/shapes/` (DCAT-AP 3.0 + Health-RI
   HealthDCAT-AP shapes; swap in the official EC shapes when published) — ADR-029 pinning policy
   applies (record versions/digests).
2. New proxy endpoints:
   - `POST /validate/dcat` — validate arbitrary JSON-LD payload, return SHACL report
     (violations grouped by severity, focusNode, path).
   - `GET /catalog/validate` — validate our own generated catalog; this is the "honest
     assessment at the source" the issue asks for.
     Implementation: `jsonld` → RDF/JS dataset → `rdf-validate-shacl`.
3. CI gate: Vitest unit test in `services/neo4j-proxy/__tests__/` validating the serializer
   output for seeded datasets against the shapes (catches regressions in the serializer or seeds).
4. Optional nightly cross-check against the EU ITB validator API as an external oracle —
   acceptable because all catalog data is fictional/synthetic (fictional-org policy).

### Phase 2 — Ingest-side validation in the federated pipeline

In `services/catalog-enricher` (Python → `pyshacl`), after Pydantic envelope validation:

1. Validate each crawled DSP catalog entry against the same pinned shapes.
2. **Non-blocking by design** (preserves ADR-020's loose interface): store the outcome instead of
   dropping data — `d.shaclConformant: boolean`, `d.shaclViolationCount`, worst severity; add
   counts to the existing `:CatalogEnrichmentEvent` audit node and a Prometheus-style metric
   (pattern: `enricher_unknown_theme_total`).
3. Same treatment for the crawler's own participant catalog fetches (crawler stays dumb; the
   enricher is the single validation point — one NATS consumer, no new services).

### Phase 3 — DQV quality measures in the catalog (the Kanzo-style ask)

Surface source-level quality in a standardized way (W3C Data Quality Vocabulary):

1. Compute per-dataset measurements: mandatory/recommended HealthDCAT-AP field completeness (%),
   SHACL conformance, freshness (`lastSeenAt` age), and the existing k-anonymity signal
   (`aggregateSuppressed` from issue #19/#8 work).
2. Graph model (idempotent MERGE): `(:QualityMeasurement {measurementId, dimension, value,
computedAt})-[:MEASUREMENT_OF]->(:HealthDataset)`; constraints with `IF NOT EXISTS` in
   `neo4j/init-schema.cypher` + datamodel doc update (`docs/knowledge/datamodels/healthdcat-ap.md`).
3. Export: include `dqv:hasQualityMeasurement` in both JSON-LD endpoints.
4. UI: quality badge + expandable panel on the catalog dataset card (dark-first Tailwind, existing
   card in `ui/src/app/catalog/page.tsx`); mock fixture update in `ui/public/mock/catalog.json`
   (static-export rule); new Playwright journeys in the J100– catalog range.

### Phase 4 — ShEx spike (time-boxed, 1 day)

Author a minimal ShEx schema for the structural core (Dataset/Distribution/publisher), run with
`shex.js` against the same fixtures, and write the comparison down. Decision gate: does ShEx catch
anything the SHACL shapes miss? If not (expected), close as "covered by SHACL" in the issue.

## Out of scope for #26 (from the issue's broader notes)

- **OpenID4VC / federated identity** — already the DCP/identityhub track (ADR-007, issue #97
  EDC 0.18 line); not a validation concern.
- **Vocabulary Hub (world ontology)** — separate concern; today's partial equivalent is the
  enricher's known-theme classification (SNOMED/LOINC/ICD-10 + `unknownThemes[]`). If wanted,
  raise as its own issue.

## Deliverables checklist

- [ ] ADR-031 "Catalog metadata validation & quality (SHACL + DQV)" — Proposed, at Phase 1 start
- [ ] Phase 0 hygiene PR (serializer, namespace, write-path unification)
- [ ] Phase 1 proxy validation endpoints + vendored shapes + CI gate
- [ ] Phase 2 enricher pyshacl validation + graph flags + metrics
- [ ] Phase 3 DQV nodes + JSON-LD export + catalog UI badges + mock fixtures + e2e journeys
- [ ] Phase 4 ShEx spike write-up → close or extend

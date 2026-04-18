# ADR-020: Cross-Participant Dataset Discovery via Federated Catalog + NLQ

**Status:** Accepted
**Date:** 2026-04-18
**Relates to:**
[ADR-003](ADR-003-healthdcat-ap-alignment.md),
[ADR-007](ADR-007-did-web-dsp-negotiation.md),
[ADR-013](ADR-013-simpl-open-alignment.md),
[ADR-019](ADR-019-gds-apoc-azure-ai-foundry-graphrag.md)
**Tracks:** [Issue #8 — Cross-Participant Dataset Discovery](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/8)
**Tracked by:** Phase 26 in `docs/planning-health-dataspace-v2.md`

## Context

### Current NLP implementation (baseline)

The `/query` page
(`ui/src/app/query/page.tsx` → `ui/src/app/api/nlq/route.ts` →
`services/neo4j-proxy/src/index.ts`) runs a **4-tier cascading resolver**
per question:

| #   | Strategy     | Location                                                                                                 | What it does                                                                                                                                                               |
| --- | ------------ | -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Template** | `matchTemplate()` at `services/neo4j-proxy/src/index.ts:1280–1295`, 9 regex patterns starting at `:1074` | Deterministic NL → Cypher: `how many patients`, `top conditions`, `condition prevalence`, `omop cohort stats`, etc.                                                        |
| 2   | **Fulltext** | `:1963–1969`                                                                                             | Neo4j native `db.index.fulltext.queryNodes` on three indexes: `clinical_search` (FHIR L3), `catalog_search` (HealthDataset L2), `ontology_search` (SNOMED/LOINC/ICD-10 L5) |
| 3   | **GraphRAG** | `:1972–1979`                                                                                             | Vector-index similarity when embeddings + vector index are present; falls back silently when absent (cf. ADR-019)                                                          |
| 4   | **LLM**      | `llmText2Cypher()` at `:1301–1421`                                                                       | Anthropic / OpenAI / Azure OpenAI / Ollama, system prompt enforces READ-ONLY                                                                                               |

Safety rails present today:

- LLM-generated Cypher filtered via regex against
  `CREATE|MERGE|DELETE|SET|REMOVE|DROP|CALL { … CREATE/MERGE/... }`
  (`:2004–2015`).
- ODRL temporal + re-identification checks (`:1942–1950, :2017–2027`).
- Parameter binding via neo4j-driver (no string interpolation in
  template path).
- IP rate limiting (100 req/min, `:88–100`).
- Query audit logging to `:QueryAuditEvent` nodes (`:1471–1504`).

Federation primitives already wired (but limited):

- `POST /federated/query` and `GET /federated/stats`
  (`:804, :924`) — fan out to a hard-coded list of SPE drivers
  (`getSpeDrivers()` returns **primary + optional SPE-2 only**).
- k-anonymity check via `MIN_COHORT_SIZE` env var (default 5).

### What issue #8 asks for

Move from **"SPE-1 + SPE-2 on the same Neo4j cluster"** federation to
**"query the whole dataspace through HealthDCAT-AP catalogs of
participants we have not pre-configured"** — e.g.

> _"Find all diabetes datasets across German hospitals with
> DataQualityLabelCredential."_

Today the resolver cannot discover AlphaKlinik, Limburg MC, PharmaCo,
MedReg DE from a question alone: participant DIDs, DSP catalog URLs,
and their HealthDCAT-AP datasets are neither crawled nor indexed.

### Gaps the baseline has, verified today (2026-04-18)

1. **No L1 marketplace templates** — `Participant`, `DataProduct`,
   `Contract`, `HDABApproval` nodes are queryable via Cypher but have
   zero NLQ templates.
2. **No composite L1 × L2 × L5 templates** — e.g. "which participants
   offer diabetes datasets under OdrlPolicy X?" requires LLM or manual
   Cypher.
3. **No SNOMED / LOINC / ICD-10 hierarchical rollup** — substring
   match only; "diabetes" does not expand to `E11*`, `E10*`, etc.
4. **Federated list is static** — `getSpeDrivers()` returns SPE-1 +
   SPE-2. No discovery of other participants' Neo4j, no access to
   their DSP catalogs.
5. **No catalog aggregation layer** — HealthDCAT-AP datasets from
   remote participants are not stored locally; `catalog_search`
   fulltext index only covers our own `:HealthDataset` nodes.
6. **Re-identification heuristic is simple** — only flags
   simultaneous `NAME + BIRTHDATE + GEO`; won't catch rare-disease
   triangulation via SNOMED code sequences.

## Decision

Adopt **Approach 1 (Centralized Aggregation + NLP)** from issue #8 as
the shippable path, built on **Eclipse EDC v0.16.0** (latest stable,
released 2026-02-19) and **`org.eclipse.edc:federated-catalog-core
:0.16.0`**. Keep Approach 2 (distributed query broadcast) documented
as a future option behind a feature flag. Implementation is
**additive** — the baseline 4-tier resolver continues to serve
single-participant queries unchanged.

We do **not** wait for or depend on XFSC FACIS DCM. The crawler
interface is kept deliberately loose (a single NATS producer) so any
future source — FACIS, Simpl, a different broker — can replace it
without touching the enricher or NLQ layer.

### Architecture delta

```
┌─ Eclipse EDC FederatedCatalog ──────────────┐
│  TargetNodeDirectory (static + DCP-sourced) │
│  ↓ periodic crawl (DSP catalog requests)    │
└──────────────┬──────────────────────────────┘
               │ raw DSP catalogs (JSON-LD)
               ▼
┌─ Catalog Enrichment Service ────────────────┐
│  DSP → HealthDCAT-AP → Neo4j Layer 2        │
│  +  SNOMED / LOINC / ICD-10 linkage         │
│  writes :HealthDataset {source: "federated"}│
│  writes :Participant  {source: "crawled"}   │
└──────────────┬──────────────────────────────┘
               │ enriched nodes
               ▼
┌─ Existing 4-tier NLQ resolver ──────────────┐
│  templates ∪ NEW L1×L2×L5 templates         │
│  fulltext: catalog_search now federated     │
│  graphrag: embeddings include federated     │
│  llm: schema context includes federated tag │
└─────────────────────────────────────────────┘
```

### What we add

1. **EDC FederatedCatalog runner** (new ACA job `mvhd-catalog-crawler`)
   running `org.eclipse.edc:federated-catalog-core` on a 15-min
   interval. Participant list sourced from (a) static YAML under
   `jad/federated-targets.yaml` and (b) DCP trust-anchor queries when
   `DCP_DISCOVERY_URL` is set.
2. **Enrichment worker** (Python script in
   `services/catalog-enricher/`) — consumes raw DSP catalog JSON-LD
   from NATS subject `dataspace.catalog.raw`, produces
   `MERGE`-idempotent Cypher that creates
   `:Participant`, `:HealthDataset {source: "federated"}`,
   `:Distribution`, and links SNOMED / LOINC concepts via existing
   ontology nodes.
3. **New NLQ templates** in `services/neo4j-proxy/src/index.ts`:
   - `federated_dataset_search` — "find diabetes datasets across
     German hospitals" → `(ds:HealthDataset)-[:HAS_THEME]->(:SnomedConcept {conceptId: $snomed})`
     joined with `(ds)-[:PUBLISHED_BY]->(p:Participant)
WHERE p.country = $iso2`.
   - `participant_count_by_theme` — "how many hospitals offer
     oncology datasets?"
   - `dataset_with_credential` — "find datasets with
     DataQualityLabelCredential" — joins `:HealthDataset` →
     `:VerifiableCredential`.
4. **ICD-10 / SNOMED hierarchy expansion** — a small glossary table
   keyed by common NL terms (`"diabetes" → {snomed: 73211009, icd10:
"E11"}`, `"german" → {iso2: "DE"}`) loaded from
   `neo4j/nlq-glossary.cypher`. This addresses gap #3 without waiting
   for ADR-019's embedding work.
5. **Federated-flag in audit log** — `:QueryAuditEvent` gets a
   `federated: boolean` property + list of participants contributing
   results. Enables EHDS Art. 50–51 transparency reporting.

### What we do not do now (scoped out)

- **Approach 2 distributed broadcast** — documented, gated behind
  `NLQ_DISTRIBUTED=true` env var, initial implementation deferred
  until at least one follow-up ADR (semantic query DSP extension, DCP
  trust anchor). Deferring keeps scope tight and avoids proposing a
  DSP extension before we have operational data to motivate one.
- **XFSC / FACIS DCM** — out of scope. We ship on stock EDC v0.16.0.
  If FACIS later becomes compatible, the loose crawler interface lets
  us swap it in; we do not gate issue #8 on that path.
- **LLM fine-tuning on schema** — remains in ADR-019's scope; this
  ADR consumes ADR-019's embeddings when available but does not
  require them.

### User journey: discovery → offer → contract → negotiation

The journey this ADR enables is the EHDS data-user loop, documented
in detail in `docs/persona-journeys/data-user-federated-discovery.md`
(new, Phase 26g):

1. **Discover.** Data user opens `/query`, asks
   _"Find diabetes datasets across German hospitals with
   DataQualityLabelCredential."_ NLQ resolver matches
   `federated_dataset_search` template → returns rows with
   `source: "federated"`, `publisherDid`, `accessUrl`, SNOMED theme,
   and a DQL-credential flag.
2. **Inspect offer.** Each row is a link to
   `/catalog/[datasetId]?source=federated` — reuses the existing
   catalog detail page, which fetches the live `dcat:Dataset` +
   linked `odrl:Policy` from the publisher's DSP catalog via the
   already-crawled participant entry (no fresh DSP round-trip unless
   the "Refresh from source" button is clicked).
3. **Check my eligibility.** The catalog page renders the
   publisher's ODRL policy (purpose, retention, DQL-credential
   requirement) against the caller's own Verifiable Credentials
   (held in Keycloak as `VerifiableCredential` claims, or via
   IdentityHub). Badges: ✅ eligible / ⚠ missing credential /
   ❌ policy mismatch.
4. **Start negotiation.** "Request contract" button fires
   `POST /api/negotiate` (already implemented) which invokes the
   connector's `dsp:ContractRequestMessage` against the publisher's
   DSP endpoint. Uses the **dedicated crawler DID is for discovery
   only** — contract negotiation uses the user's participant DID.
5. **Track + sign.** The negotiation appears in `/tasks` (existing
   DPS page) with status `REQUESTED → OFFERED → AGREED → FINALIZED`
   driven by DSP state-machine events on NATS subject
   `dataspace.contract.negotiation`.
6. **Fetch data.** On `FINALIZED`, the DPS task gains a "Start
   transfer" action that issues `dsp:TransferProcess`; the data
   lands at the caller's dataplane endpoint; a new
   `:TransferEvent` node links the Contract to the dataset the user
   originally discovered via NLQ. Closes the loop: one audit trail
   from question → dataset → contract → transfer.

Phase 26f (Playwright J730–J749) covers steps 1–4 end-to-end;
J745–J749 cover steps 5–6 against the live Azure stack.

## Alternatives considered

1. **Approach 2 only (distributed broadcast)** — rejected as primary
   path: requires a DSP extension for semantic filters that does not
   exist in the 2025-1 spec, adds N×latency per query, and complicates
   k-anonymity (each participant must enforce independently, no
   central view). Keep as future option.
2. **Hybrid with routing heuristic** — common queries cached, rare
   queries broadcast. Rejected for v1: we have no traffic data to
   classify "common" vs "rare", and routing logic becomes the hardest
   part to validate. Revisit once Approach 1 has 30 days of audit log.
3. **Wait for XFSC FACIS DCM** — rejected: timeline is unknown, the
   XFSC stack still targets EDC v0.2.1, and EHDS Art. 50–51 obligations
   do not wait for upstream. We can migrate later if FACIS matures.

## Consequences

**Positive**

- Issue #8 example query becomes answerable end-to-end without a
  human in the loop; the `/query` page's method badge shows `template`
  or `llm` for federated questions.
- Reuses ADR-003 HealthDCAT-AP mapping and ADR-019 GraphRAG runtime
  without contradicting either.
- EHDS Art. 50–51 audit trail extended with federation metadata —
  regulators can see which participants a query actually hit.
- Data sovereignty preserved at the row level: only catalog metadata
  is mirrored, not patient data. (Patient data still requires a
  signed DSP contract.)

**Negative**

- Adds two new long-running services (`mvhd-catalog-crawler` ACA
  job + `services/catalog-enricher` container). Each is a new
  failure mode.
- Crawled catalog is stale (15-min default) — callers must treat
  "last seen" metadata as advisory. Docs must state this.
- Increases Neo4j node count (federated datasets + participants) —
  re-tune GDS heap budget from ADR-019 once federated node count
  crosses 10k.
- Glossary-driven code expansion (item 4) is a manual list; until
  ADR-019 embeddings land, terms outside the glossary still substring
  match.

## Implementation plan (Phase 26)

See planning doc Phase 26 for the task breakdown. High level:

1. Author `jad/federated-targets.yaml` and decide initial
   participants (AlphaKlinik, Limburg MC, PharmaCo, MedReg DE, IRS).
2. Build the crawler image: Eclipse FederatedCatalog core + Kafka/NATS
   producer. Deploy as ACA job with `--replica-timeout 900` and 15-min
   cron trigger.
3. Build enricher (Python + neo4j-driver). Subscribe to NATS subject,
   run idempotent MERGE, write audit log.
4. Add the three new NLQ templates + glossary.
5. E2E test: a journey spec under
   `ui/__tests__/e2e/journeys/32-federated-nlq.spec.ts` that
   (a) seeds a mock remote catalog, (b) asks the example query,
   (c) asserts the method badge is `template`, (d) asserts at least
   one result row carries `source=federated`.
6. Extend audit dashboard (`/admin/audit`) to surface federation
   metadata.

## Resolved decisions

The nine questions below were walked through and resolved on
2026-04-18; each answer is binding on the Phase 26 implementation.

1. **Participant list source of truth → DCP + dynamic DB-backed
   list.** The crawler reads a `:Participant {source}` label space
   in Neo4j, not a static YAML. Three sources feed into it:
   a. **DCP trust anchor** (`DCP_DISCOVERY_URL`) — periodic
   discovery pull creates `:Participant {source: "dcp"}`.
   b. **Business wallets** — onboarded via the existing IssuerService
   VC flow; each onboarded org surfaces as
   `:Participant {source: "business-wallet", walletType: "business"}`.
   c. **Private wallets** — individual researchers / clinicians with
   personal wallets register themselves; stored as
   `:Participant {source: "private-wallet", walletType: "private"}`.
   Admin can add/remove rows via `/admin/participants` without a
   restart. The `jad/federated-targets.yaml` from the original draft
   is demoted to a **seed file only** — loaded once during bootstrap
   to populate the five demo orgs.
2. **Crawler refresh interval → 5 min.** It is a demo environment;
   freshness beats cost. `CRAWL_INTERVAL=300` default, overridable per
   environment. Phase 26e audit dashboard shows the actual observed
   refresh per participant so slow crawlers are visible.
3. **Authentication to remote DSP catalogs → dedicated crawler DID.**
   Mint `did:web:ehds.mabu.red:crawler` with its own key. Crawler
   has discovery rights only (can fetch catalogs); contract
   negotiation and transfer still use the caller's participant DID.
4. **Enricher location → new service `services/catalog-enricher/`.**
   Its own Dockerfile, own container app, own restart cycle,
   independent of neo4j-proxy. See [Enricher service spec](#enricher-service-spec)
   below.
5. **Glossary → hand-curated.** One file
   `neo4j/nlq-glossary.cypher`, ≤100 entries v1, reviewed in PR like
   any other schema change. ADR-019 embeddings remain the longer-
   term replacement but are not a prerequisite.
6. **k-anonymity on federated aggregates → enforce both.** Suppress
   any per-participant `count < MIN_COHORT_SIZE`. Additionally, if
   any contributor's count is suppressed, suppress the global
   aggregate too. Response carries
   `{ aggregateSuppressed: true, reason: "contributor_k_violation" }`.
7. **ODRL semantics → enforce both.** Publisher's ODRL policy is
   evaluated against the caller (does the caller meet purpose,
   retention, credential requirements?). Independently, the
   caller's own `odrlScope` is evaluated against the dataset. Both
   must pass for a result row to surface. Temporal and re-id
   heuristics (`:1942–1950, :2017–2027`) run unchanged on top.
8. **Loose crawler interface → yes, single NATS producer.** Crawler
   publishes JSON-LD to NATS subject `dataspace.catalog.raw`
   (contract: `{ participantDid, fetchedAt, catalog }`). Any
   alternate source — FACIS DCM, SIMPL, a manually-posted catalog —
   conforms to the same subject schema and the enricher is
   unchanged.
9. **Rate limiting remote participants →** max 1 concurrent request
   per participant, 10 s request timeout, exponential backoff on
   5xx (1 s → 2 s → 4 s, 3 retries), circuit-breaker trips after
   5 consecutive failures (closed again after 5 min).

## Enricher service spec

Full name: **`mvhd-catalog-enricher`**. Canonical location:
`services/catalog-enricher/`.

### Responsibilities

- Subscribe to NATS subject `dataspace.catalog.raw` (durable
  consumer, name `enricher`).
- Parse each message `{ participantDid, fetchedAt, catalog }`
  where `catalog` is a DSP `dcat:Catalog` JSON-LD document.
- Map each `dcat:Dataset` into the HealthDCAT-AP shape (per
  ADR-003) and produce idempotent `MERGE`-only Cypher.
- Link themes (`dcat:theme`) to existing `:SnomedConcept` /
  `:LoincCode` / `:ICD10Code` nodes; create stubs only when the
  code is unknown (flagged for ontology team follow-up).
- Upsert the publishing `:Participant` node if absent, with
  `walletType` derived from the DCP registry or a default of
  `business`.
- Emit Prometheus metrics: `enricher_messages_total`,
  `enricher_merge_seconds`, `enricher_unknown_theme_total`.
- Emit one `:CatalogEnrichmentEvent` audit node per catalog
  processed, linked back to the `:Participant`.

### Non-responsibilities

- **Not** a crawler — the crawler is a separate service that
  _produces_ the NATS messages this service consumes.
- **Not** a query path — the NLQ resolver reads the enriched graph;
  the enricher never answers user questions.
- **Not** a policy engine — it stores ODRL policies verbatim as
  `:OdrlPolicy` nodes; enforcement lives in neo4j-proxy.

### Interfaces

| Direction | Interface                            | Contract                                                                        |
| --------- | ------------------------------------ | ------------------------------------------------------------------------------- |
| In        | NATS subject `dataspace.catalog.raw` | `{ participantDid: string, fetchedAt: ISO8601, catalog: JSON-LD }`              |
| Out       | Neo4j Bolt `mvhd-neo4j:7687`         | Parameterised `MERGE` Cypher, `source: "federated"` tag                         |
| Out       | Prometheus `/metrics` on :9464       | See metrics list above                                                          |
| Out       | Audit                                | `:CatalogEnrichmentEvent {ts, participantDid, datasetsUpserted, themesUnknown}` |

### Runtime

- Python 3.12-slim, `neo4j==5.23.0`, `nats-py==2.7.0`, pydantic.
- ACA container app, 0.25 vCPU / 0.5 GiB, min 1 max 1 replica.
- Restart does not lose work: NATS durable consumer replays
  unacknowledged messages.
- Deployment: new `scripts/azure/11-catalog-enricher.sh` + GitHub
  Actions workflow (same CI-SP pattern as ADR-018 / project
  memory notes).

### Interactions with other services

```
                       ┌───────────────────────────┐
                       │  mvhd-catalog-crawler     │
                       │  (EDC FederatedCatalog)   │
                       │  reads :Participant list  │
                       │  from Neo4j, signs with   │
                       │  did:web:…:crawler        │
                       └────────┬──────────────────┘
                                │ dcat:Catalog JSON-LD
                                ▼
                       NATS  dataspace.catalog.raw
                                │
                                ▼
                       ┌───────────────────────────┐
                       │  mvhd-catalog-enricher    │  (this service)
                       │  DSP → HealthDCAT-AP      │
                       │  SNOMED / LOINC linkage   │
                       └────────┬──────────────────┘
                                │ MERGE Cypher
                                ▼
                       Neo4j :HealthDataset {source:"federated"}
                             :Participant   {source in dcp|business-wallet|private-wallet}
                             :OdrlPolicy    (verbatim)
                             :CatalogEnrichmentEvent (audit)
                                ▲
                                │ reads
                       neo4j-proxy NLQ resolver
                                ▲
                                │ POST /api/nlq
                            UI /query
```

## References

- Issue: [#8 Cross-Participant Dataset Discovery](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/8)
- EDC FederatedCatalog:
  https://github.com/eclipse-edc/FederatedCatalog
- HealthDCAT-AP 2.1: `docs/ADRs/ADR-003-healthdcat-ap-alignment.md`
- DCP v1.0: https://projects.eclipse.org/projects/technology.dataspace-dcp
- Current NLQ implementation:
  - `ui/src/app/query/page.tsx`
  - `ui/src/app/api/nlq/route.ts`
  - `services/neo4j-proxy/src/index.ts`
    (templates `:1074`, resolver `:1953–2001`, safety `:2004–2027`)
- Baseline E2E: `ui/__tests__/e2e/journeys/31-backend-health-and-nlq.spec.ts`

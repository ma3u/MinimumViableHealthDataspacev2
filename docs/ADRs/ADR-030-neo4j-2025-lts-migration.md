# ADR-030: Neo4j 5.26 → 2025.x calver line — migration readiness

**Status:** Proposed
**Date:** 2026-07-16
**Relates to:** [ADR-019](ADR-019-gds-apoc-azure-ai-foundry-graphrag.md), [ADR-029](ADR-029-dependency-version-pinning.md)
**Tracks:** [Issue #97 — dependency refresh](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/97), Phase C spike

## Context

We pin `neo4j:5.26.28-community` (ADR-029) — the last 5.x line. Neo4j moved to
calver; the 2025.x line ends at 2025.12.1 and 2026.06 is current. Before any
migration decision we spiked our actual workload against `2025.12.1-community`
(2026-07-16, throwaway Docker container).

## Spike results (all against neo4j:2025.12.1-community)

| Check                                                    | Result                                                            |
| -------------------------------------------------------- | ----------------------------------------------------------------- |
| Full `neo4j/init-schema.cypher` apply                    | ✅ 0 errors                                                       |
| Idempotent re-run of the schema                          | ✅ 0 errors                                                       |
| `insert-synthetic-schema-data.cypher` seed               | ✅ 0 errors (124 nodes)                                           |
| Vector indexes (3 from schema + 1 ad-hoc 768-dim cosine) | ✅ created + `db.index.vector.queryNodes` returns correct results |
| Constraints                                              | ✅ 39 present                                                     |
| APOC plugin                                              | ✅ loads, reports 2025.12.1                                       |

**Not covered by the spike:** GDS (`gds.graph.project.cypher` — see the
2026-04 gotchas), the Azure AI Foundry embedding registration path
(`register-embeddings-aoai.cypher` at production scale), and the proxy's
GraphRAG tier against a full 127-patient graph.

## Decision (proposed)

Migrate to the newest calver LTS-designated release **in Phase D or later**,
gated on one full-stack rehearsal: JAD stack + GDS-dependent GraphRAG suite
(`33-graphrag-nlp.spec.ts`) against a calver Neo4j with production-shaped
data. Until then 5.26.x remains the pin — it is still a supported LTS line
and nothing in the current workload requires calver features.

## Consequences

- No forced migration now; the upgrade is de-risked and scheduled, not ad hoc.
- The spike script lives in this ADR's table; re-running it against 2026.06
  when scheduling Phase D costs minutes.

## Alternatives considered

- **Migrate now** — rejected: GDS/GraphRAG path unverified, and 5.26.x is
  still in support; no feature pressure.
- **Never migrate / ride 5.26 to EOL** — rejected: 5.x support ends before
  the project's horizon; calver is where vector/GDS improvements land.

# ADR-043: UI routes read the graph directly; the proxy serves the data planes and what needs its credentials

**Status:** Accepted (2026-10-02, #404)
**Date:** 2026-10-02
**Relates to:** [ADR-002](ADR-002-edc-data-plane-architecture.md), [ADR-004](ADR-004-nextjs-unified-frontend.md), [ADR-019](ADR-019-gds-apoc-azure-ai-foundry-graphrag.md), [ADR-020](ADR-020-cross-participant-dataset-discovery.md)
**Tracks:** [#404](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/404)

## Context

There are two ways from the UI into Neo4j, and no ADR says which one a new
route should take.

- **Directly.** 42 of the 67 API routes import `runQuery()` from
  `@/lib/neo4j` and send parameterised Cypher over Bolt: catalog, graph,
  patient, compliance, permits, overview, admin and most others.
- **Through `services/neo4j-proxy`.** Seven routes call it over HTTP, for
  `/nlq`, `/nlq/templates`, `/nlq/backend`, `/federated/stats`, `/tasks`,
  `/tasks/sync`, `/tck` and `/debug/phase26`; `compliance/requests/decide`
  uses `/nlq` too. Each repeated the default base URL until #407 moved it to
  `NEO4J_PROXY_URL` in `@/lib/proxy`.

The proxy has other callers besides the UI. The EDC asset data addresses
point at it (`jad/edcv-assets/*.json`: `/fhir/Bundle`, `/omop/...`,
`/catalog/datasets`), so it is the HTTP backend of the FHIR, OMOP and
HealthDCAT-AP data planes (ADR-002). It holds the LLM and embedding
credentials and the GraphRAG pipeline (ADR-019), the federated query
fan-out (ADR-020), the TCK runner, and the task store in Postgres. It is
one 4,257-line `src/index.ts`.

Read that way, the split that exists is already a rule, just an unwritten
one, and it is the reason a new route could go either way.

## Decision

1. **A UI API route reads and writes the graph directly**, through
   `runQuery()` in `@/lib/neo4j`, parameterised, never interpolated. This is
   the default for every view the UI owns.
2. **A UI API route calls the proxy only for a capability the proxy owns**:
   natural-language query and GraphRAG, federated query across participants,
   the TCK, the task store, and the FHIR, OMOP and catalog endpoints the data
   planes serve. It uses `NEO4J_PROXY_URL` from `@/lib/proxy`.
3. **Neither side reimplements the other.** A UI route does not rebuild a
   FHIR bundle or an OMOP aggregate that a data plane serves through the
   proxy; the proxy does not grow an endpoint whose only caller is one UI
   page.
4. **A new capability goes to the proxy when** it needs credentials the UI
   container should not hold (LLM keys, a second database), or a caller
   other than the UI (a data plane, a partner, a job). Otherwise it is a UI
   route.

## Consequences

- A reviewer can now tell a misplaced route from a correct one. The existing
  routes already follow points 1 and 2.
- Point 3 needs one audit that has not been done: whether a UI route and a
  proxy endpoint compute the same answer twice (the obvious pair to check is
  `/api/catalog` against the proxy's `/catalog/datasets`). Recorded in #404.
- The proxy's single `index.ts` is the next refactor once a change touches it:
  one router per capability (`fhir`, `omop`, `catalog`, `trust-center`,
  `nlq`, `federated`, `tasks`, `tck`), as `graphrag.ts` already is.
- `/debug/phase26` is an operator diagnostic, not a capability; it stays
  behind `requireAuth(["EDC_ADMIN"])` and is a candidate for removal when
  Phase 26 is done.

## Alternatives considered

- **Everything through the proxy.** Rejected: 42 routes would trade a Bolt
  call for an HTTP hop plus a Bolt call, with no new caller to justify it,
  and the UI would need a proxy endpoint per view.
- **Nothing through the proxy.** Rejected: the UI container would have to
  hold the LLM keys and the task database, and the data planes need an HTTP
  backend anyway.

# ADR-040: Derived compliance state is computed in the API from the graph, never persisted

**Status:** Proposed
**Date:** 2026-09-24
**Relates to:** [ADR-010](ADR-010-wcag-accessibility.md), [ADR-039](ADR-039-published-reference-ranges.md)
**Tracks:** [#271](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/271), [discussion #265](https://github.com/ma3u/MinimumViableHealthDataspacev2/discussions/265)

## Context

The persona views of #271 show state, not structure: a measured value against
its printed range, a trend over months, a consumer's chain of trust, a decision
past its Art. 68(4) deadline, a quality label below its renewal band. Discussion
#265 asked where that state should live. Two options were on the table:

1. Compute it in the browser from the existing routes, as the prototypes under
   `ui/public/poc/persona-3d/` did.
2. Persist it in the graph as a `ComplianceFinding` node type written by a job,
   so it can be queried and audited.

Trust in EHDS terms is a chain and not a flag: DCP credentials, an Art. 68
permit, a DSP contract, and an access log that agrees with all three
(Art. 61(1), 73(1)(e)). Every link of that chain is already a record the graph
holds and a route already serves. The findings are therefore a function of
data that changes on every access, every decision and every credential
presentation.

Two defects in the fixtures made the point: expired credentials kept
`status: "active"`, and the credential seed dated expiry relative to its run.
Anything that had trusted a stored flag would have been wrong.

## Decision

Derived state is computed in the API, at request time, from the graph, by pure
functions, and is not persisted.

- `ui/src/lib/overview/derive.ts` holds the rules (`trendOf`,
  `credentialState`, `permitState`, `decisionClock`, `chainOfTrust`,
  `aggregateMonthly`) as pure functions over plain records, with their own unit
  tests.
- `GET /api/overview?persona=` composes the existing routes in-process, adds
  the few graph queries the view needs, and calls one builder per persona
  (`patient.ts`, `hdab.ts`, `hospital.ts`, `researcher.ts`) that returns the
  complete view model. The browser renders; it derives nothing.
- State is always read from a date, never from a flag: a credential is expired
  because `expiresAt` has passed, a permit is valid because `validUntil` has
  not. A stored `status` is at most a hint.
- Every signal carries a stable `code` and the article it rests on, so the
  activity report (Art. 59), the tests and a future enforcement record can name
  the same finding the same way.

A persisted finding record comes only with the Art. 63 enforcement flow of #206
M4, where a finding must be notified to a party, answered within four weeks and
kept as evidence. That record will reference the computed finding by its code
and subject; it will not replace the computation.

## Consequences

Easier: one place for each rule, tested once, used by four views and by the
static-export fixture generator; no job to schedule, no stale findings, no
migration when a rule changes; the article behind every finding travels with
it.

Harder: the route does more work per request (four composed routes and up to
five graph queries, a few seconds on Azure), so the page shows a loading state
and the journey tests allow 45 s; findings have no history of their own, which
is exactly what the Art. 63 record will add when needed; two builders that
disagree on a rule would be a defect, which the shared `derive.ts` and the
shared `series.ts` are there to prevent.

## Alternatives considered

- **Compute in the browser** (the prototypes): rejected because the rules
  would live in page code, untestable without a browser and unavailable to the
  activity report and the fixture generator.
- **Persist `ComplianceFinding` nodes**: rejected for now because the findings
  are a pure function of records that change on every access; a stored finding
  is stale the moment the next event arrives, and the fixtures had already
  shown what a stored flag does. Kept for the enforcement record of #206 M4.
- **Materialise in the Neo4j proxy**: rejected because the proxy serves FHIR,
  OMOP and federated queries and has no view of permits and credentials, which
  live behind the Next.js routes.

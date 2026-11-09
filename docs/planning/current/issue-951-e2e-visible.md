---
title: "E2E fails visibly and runs on the pull requests that can break it"
status: current
owner: ma3u
updated: 2026-11-09
issue: https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/951
adr: ../../ADRs/ADR-079-e2e-runs-on-pull-requests-and-fails-visibly.md
---

The nightly reported success on 2026-11-07 while 293 Playwright tests failed
and 564 skipped. The task boxes live in
[#951](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/951); the
decision is [ADR-079](../../ADRs/ADR-079-e2e-runs-on-pull-requests-and-fails-visibly.md).
This file keeps the order of the work.

## Done in the first pull request

1. Every spec green or skipping with a stated reason against the CI stack:
   the demo graph (`neo4j/seed.sh`), the neo4j-proxy, forged sessions, no EDC
   connector, no Postgres task store, no Keycloak.
2. `nightly.yml`: no `continue-on-error`, the demo graph and the proxy, the
   static-only specs (19, 23, 37) against GitHub Pages, `/e2e-report/` is the
   night's report.
3. `e2e.yml` and `scripts/select-e2e-specs.sh`: the specs a pull request can
   break, every spec on three shards when shared code changed.
4. `scripts/run-e2e-local.sh`: the same run on a laptop, `--changed` for the
   selection.

## Done after it

5. `pages.yml` deploys again when a nightly run finishes, so `/e2e-report/` is
   the night's report the same night (#983).
6. `pages.yml` no longer seeds a Neo4j to refresh the mocks: without a session
   every request answered 401 since ADR-044 and nothing was written, about
   220 s of every deploy. The site serves the committed fixtures.
7. The in-app developer page has an `e2e.yml` card in five languages.

## Next, in this order

1. After ten green `E2E` runs on pull requests in a row: make `E2E` a required
   check (ADR-079 decision 2).
2. Decide J313: may a PATIENT read `/api/analytics` (cohort statistics)? The
   journey is marked `test.fail()` until then.
3. Build or drop the scope features J325, J327, J328, J330 to J332 and J347
   describe (`aggregateOnly`, `maxRowLimit`, expiry and revocation in the
   scope); they are `test.fixme` with the reason.
4. A seed that terminates one negotiation, or J38's premise changed: no seed
   holds a TERMINATED negotiation.

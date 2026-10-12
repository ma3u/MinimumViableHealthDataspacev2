---
title: "After the load and stress tests (#571): the UI's size, the runs left, one decision"
status: current
owner: ma3u
updated: 2026-10-12
issue: https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/571
knowledge: ../../knowledge/runbooks/load-and-stress-test.md
---

The load and stress tests of 2026-10-05 and 2026-10-06 (#519) moved the
platform's ceiling twice: `/api/graph` and the access log out of the graph
views (#576, #580), then Neo4j to 2 vCPU and 4 GiB (ADR-056). `stress`
reaches 400 users with no failed request; the UI, three replicas of half a
core, is what saturates from 200 users on.

## Done on 2026-10-12

- [ADR-059](../../ADRs/ADR-059-the-ui-scales-out-on-whole-cores.md), Proposed:
  a whole core per UI replica, up to six, on an HTTP concurrency rule of 15.
  Values in `scripts/azure/env.sh`, applied by `scripts/azure/size-ui.sh`,
  kept by `offhours.sh` on the morning start. The ADR carries the cost per
  step, the cost per 1,000 requests and the scalability of every component.
- Deploys wait while a load test runs: the repository variable
  `LOAD_TEST_RUNNING`, set by both run scripts, read by `deploy-azure.yml`.
- `/api/tasks` says who answered (`source`: the connector or the hub's store)
  and answers 502 when both fail; it serves no fixtures any more. The local
  task table belongs to its user (`jad/init-postgres.sql`).
- `deploy-azure.yml` sets the UI's `EDC_MANAGEMENT_URL` and `EDC_IDENTITY_URL`
  on every deploy, so the live app cannot drift to the ingress FQDN again.
- Keycloak keeps login events seven days (`jad/keycloak-realm.json`,
  `scripts/azure/wire-keycloak-events.sh` for the live realm); the UI client's
  token carries the seven EHDS roles and nothing else
  (`scripts/azure/wire-ui-client-scope.sh`).
- `/compliance` says when the trust centre register refuses the role instead
  of showing an empty section.
- The March 2026 readiness assessment is archived under `docs/loadtest/`.

## Open, on the live hub (office hours, az signed in, PIM for the job)

1. `scripts/azure/wire-keycloak-events.sh`, `scripts/azure/wire-ui-client-scope.sh`,
   then sign in as each persona once.
2. `scripts/azure/size-ui.sh`, then `ABORT_ON=failures scripts/azure/run-load-test.sh stress`.
   Accept ADR-059 when 200 users stay inside the SLOs; update its table with
   the per-stage p95 from Grafana.
3. `spike`, `soak` and `signin` (hypotheses 4 and 6), one per day; the Postgres
   burst credits are the "Postgres (Flexible Server B1ms)" panel of the Azure
   row. A General Purpose SKU if `soak` drains them.
4. Cost per 1,000 requests from Cost Management over the `soak` window,
   against the estimate in ADR-059.

## Decision for Matthias

May a health data access body (`HDAB_AUTHORITY`) read the trust centre
register (`/api/trust-center`)? The page names them "HDAB-designated trust
centers", and the secure processing environment sessions on the same route
are the access body's own (Regulation (EU) 2025/327 Art. 50). Recommendation:
yes, read only, by adding the role to the route's `requireAuth` list and
changing the Bruno request in `09 Access control` that expects the 403 (#538).
Until then the page says why the section is empty.

# Production readiness assessment, October 2026

Well-Architected Framework (WAF) and Cloud Adoption Framework (CAF), applied
to the EHDS Integration Hub as it runs on Azure Container Apps on 2026-10-16.
Each pillar states what is in place, with the evidence, and what is still
open. The scores are the project's own judgement on a ten-point scale; none
of this is an independent audit.

| Pillar                      | Score    | In one line                                                                                                          |
| --------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------- |
| WAF: Operational Excellence | 7/10     | Deploy on every merge, tracing and structured logs, sixteen runbooks; no alert rules, no on-call                     |
| WAF: Security               | 8/10     | Tested by the project with nine of ten findings closed; no independent test                                          |
| WAF: Reliability            | 6/10     | 400 users with no failed request, health checks everywhere, managed Postgres with restore; Neo4j one node, no backup |
| WAF: Performance Efficiency | 7/10     | Sized from measurements, 50 users inside every SLO; 200 users not yet                                                |
| WAF: Cost Optimization      | 7/10     | Everything stops off hours, cost per 1,000 requests measured; no cost allocation per tenant                          |
| WAF: Sustainability         | 6/10     | The stack runs a third of the week; no carbon-aware choice                                                           |
| CAF: Strategy & Plan        | 8/10     | The EHDS roles, the BSI standards and sixty-one decisions written down; no SLA                                       |
| CAF: Govern & Manage        | 6/10     | Retention policy, audit trail, incident clocks; no SOC, no named incident team                                       |
| **Overall**                 | **7/10** | **A measured demonstrator. Not an operable platform for real data; the gap is listed at the end.**                   |

The platform assessed: the hub and its connectors on Azure Container Apps in
`rg-mvhd-dev`, West Europe, 21 apps and 9 jobs. PostgreSQL on a Flexible
Server ([ADR-041](../ADRs/ADR-041-managed-postgres-on-azure-containerised-locally.md)),
Neo4j Community at 2 vCPU and 4 GiB ([ADR-056](../ADRs/ADR-056-neo4j-grows-to-2-vcpu-and-4-gib.md)),
the UI on whole cores with up to six replicas ([ADR-061](../ADRs/ADR-061-the-ui-scales-out-on-whole-cores.md)),
Vault with its state on the Flexible Server ([ADR-046](../ADRs/ADR-046-vault-keeps-its-state-on-the-flexible-server.md)),
stopped outside office hours ([ADR-053](../ADRs/ADR-053-everything-stops-off-hours.md),
[ADR-058](../ADRs/ADR-058-azure-triggers-the-off-hours-schedule.md)). The
load numbers are the runs in [the results index](README.md); the security
state is the [security test report of 2026-10-15](../security/security-test-report-2026-10-15.md);
how the platform is meant to be run for real is the
[operational guideline](../security/operational-guideline.md).

## WAF pillar 1: Operational Excellence, 7/10

In place:

- A merge to main deploys to Azure (`deploy-azure.yml`); the deploy waits
  while a load test runs and pins the connector addresses on every run. The
  PR gate, the test, security, compliance and CodeQL workflows run on every
  pull request; `demo-smoke.yml` runs Bruno, Playwright and ZAP against the
  live hub.
- OpenTelemetry collector, Prometheus, Loki, Tempo and Grafana
  ([ADR-045](../ADRs/ADR-045-observability-and-regulatory-audit-trail.md));
  the proxy is traced (`src/tracing.ts`) and logs structured JSON with the
  caller and the run on every line (`pino`); every audit record carries its
  run. Logs in Azure Monitor for 30 days.
- Vault keeps its state across restarts, locally in a file and on Azure in a
  database on the Flexible Server with an unseal sidecar (ADR-046).
- Sixteen runbooks under `docs/knowledge/runbooks/`: deploy, seeding, realm
  drift, Postgres recovery, off hours, load and stress test, the audit chain,
  the Klarbefund connection.
- Every image carries a `HEALTHCHECK`; the crawlers expose `/metrics` and are
  checked on it; the seed phases are resumable.
- The documentation is published from the repository and checked in
  pre-commit, so the docs cannot drift from the files.

Open:

- No alert rules. The load dashboard, the audit chain and the Postgres burst
  credits are read by a person; nobody is paged.
- No on-call model and no named operator; the operational guideline
  describes the roles, the project cannot fill them.
- No feature flags beyond the demo switches.

## WAF pillar 2: Security, 8/10

In place:

- The [security test report of 2026-10-15](../security/security-test-report-2026-10-15.md):
  CodeQL, Semgrep, grype, npm audit, trivy, gitleaks, hadolint, shellcheck,
  the app's posture tests and 46 anonymous black-box checks of the live hub.
  Ten findings; nine closed, one reviewed and accepted (the published
  development key of the local compose stack; Azure takes its keys from
  Vault).
- The [threat model of the hub](../security/threat-model.md) and
  [of the app](../security/threat-model-klarbefund.md), each mitigation
  naming the code or test that shows it; one CycloneDX bill of materials per
  deployable part ([SBOM](../sbom/README.md)), checked against the lockfiles.
- Every API route needs a session ([ADR-044](../ADRs/ADR-044-every-api-route-needs-a-session.md));
  who sees a patient's identity is decided by role, never by a query
  parameter; the UI reads the graph directly and the proxy serves the data
  planes ([ADR-043](../ADRs/ADR-043-graph-access-direct-or-through-the-proxy.md)).
- Rate limits in the proxy, per user and per participant, measured under
  load; k-anonymity with a minimum cohort of five in the proxy's
  configuration.
- Operator secrets are Key Vault references ([ADR-036](../ADRs/ADR-036-operator-secrets-in-key-vault.md));
  the live `NEXTAUTH_SECRET` was rotated; participant keys live in Vault.
- Keycloak: login events kept seven days, the UI client's scope limited to
  the seven EHDS roles, the admin console off the internet, every privileged
  role behind the console guard. The app locks with Face ID or the passcode
  ([ADR-060](../ADRs/ADR-060-the-app-locks-with-face-id-and-answers-pinning-and-jailbreak-detection.md)).
- Only the hub and Keycloak have public ingress; everything else is internal
  to the environment.
- The [audit retention policy](../audit-retention-policy.md): ten years for
  access, transfer, contract and permit records, two years for sign-ins and
  edge logs, applied by `/api/admin/audit/retention`, which cannot destroy
  the only copy.

Open:

- No independent penetration test of the hub and no TR-03161 test of the app;
  the report's last section says what each would add.
- No mTLS between apps and no private endpoints; the guideline asks for both
  before real data.
- Neo4j has one database user; access is controlled in the hub and the proxy.
- Secret rotation is written down, not scheduled.
- The operator accounts and `edcadmin` are on generated passwords in Key Vault
  only once `scripts/azure/secure-accounts.sh` has run against the live realm.

## WAF pillar 3: Reliability, 6/10

In place:

- The stress run of 2026-10-06 reached 400 users with 0 failed requests out
  of 81,518, at 63.6 requests a second; nothing restarted. At 50 users every
  SLO holds.
- Every image has a health check and Container Apps probes come from it; the
  proxy drains on `SIGTERM`; every outbound call has a timeout; `/api/tasks`
  answers from its store when the connector fails and says so.
- PostgreSQL on the Flexible Server keeps seven days of point-in-time
  restore; the realm, the contracts and the task store live there. Vault's
  state is there too.
- The graph views are capped at the newest 30 access events, which removed
  the one request that could take the UI down.
- A deploy cannot land in the middle of a load run.

Open:

- Neo4j is one Community node on Azure Files with no backup. Its data is
  re-seedable synthetic data today; before any real data the guideline asks
  for Neo4j Enterprise or a managed graph with backups tested quarterly.
- No circuit breaker; a slow connector is bounded by timeouts only.
- From 200 users the latency SLOs break on the UI's CPU. The UI's new size
  (ADR-061) is applied by `scripts/azure/size-ui.sh` and not yet measured.
- The connectors' pages did no real work in the runs so far (the UI called
  the management API at the wrong address, pinned since); the next `load`
  run is the first with contracts and transfers under load.
- No chaos engineering; the stress runs are the nearest thing.

## WAF pillar 4: Performance Efficiency, 7/10

In place:

- Measured, not guessed: the ceiling moved from Neo4j's memory to the UI's
  CPU within one day of runs, and each size was decided from the measurement
  (ADR-056 for Neo4j, ADR-061 for the UI, with the
  [scalability per component](../ADRs/ADR-061-the-ui-scales-out-on-whole-cores.md#scalability-per-component)).
- At 50 users: API p95 155 ms, pages 43 ms, NLQ 217 ms, 21.5 requests a
  second. `/api/graph` inside the SLO after the cap and the resize.
- Neo4j at 2 vCPU and 4 GiB, heap 1.5 GiB, page cache 1 GiB; indexes for
  every FHIR query path in `neo4j/init-schema.cypher` (more than 70, three
  vector indexes).
- The audit chain's batch writer takes the write load; audited queries are
  not a ceiling (434 ms p95 at about 16 a second).
- Next.js compresses its responses; the static demo is served by GitHub
  Pages.

Open:

- No response cache on the catalog or the overview; no compression in the
  proxy.
- 200 users inside the SLOs is the target of the next `stress` run, after
  `size-ui.sh`; the per-stage p95 goes into ADR-061's table.
- No CDN in front of the live hub.

## WAF pillar 5: Cost Optimization, 7/10

In place:

- Everything stops at 18:13 UTC and starts at 05:17 UTC on weekdays,
  triggered by Azure as a managed identity; about 65 office hours a week. The
  decision followed a month that billed €741 against an estimate of €426 for
  a stack running around the clock (ADR-053).
- Container Apps scale rules: the UI on an HTTP concurrency rule of 15, one
  to six replicas; everything to zero off hours.
- The cost of a request is known: at list price the apps that serve a request
  bill about $0.60 an hour, about **$0.01 per 1,000 requests at 50 users**
  (ADR-061, from `20261006-2115-load-aca`); a 20-minute stress run at six UI
  replicas adds about $0.22.
- Cost guards watch the total (`cost-guards.yml`).

Open:

- One resource group, one bill: no cost allocation per tenant or per role.
- The cost per 1,000 requests from Cost Management over a `soak` window is
  still to be taken.

## WAF pillar 6: Sustainability, 6/10

In place:

- The stack runs a third of the week (ADR-053, ADR-058).
- Resource use is visible: the containers row of the load dashboard, Cost
  Management.
- The one wasteful request, the uncapped graph view, is gone.

Open:

- West Europe, no carbon signal in the schedule or the region choice.

## CAF

**Strategy and plan, 8/10.** The regulatory motivation is written per article
(Regulation (EU) 2025/327 in its adopted numbering); the
[operational guideline](../security/operational-guideline.md) names which
EHDS role operates which part and what BSI C5, IT-Grundschutz, TR-02102 and
TR-03161 ask of each; sixty-one ADRs record the decisions; the planning index
tracks the work. Open: a formal SLA for participants, which the guideline
puts into the operator's service contract.

**Ready, 7/10.** Azure from a merge; the local stack in one compose command;
the seed phases resumable; one Dockerfile per part with its bill of
materials. Open: the operator's own environment, which does not exist yet.

**Adopt, 7/10.** DSP 2025-1 TCK, DCP and EHDS compliance suites on every pull
request; the Bruno collection asserts every route by persona
([ADR-031](../ADRs/ADR-031-checks-must-assert.md), [ADR-032](../ADRs/ADR-032-persona-organised-api-collection.md));
2,317 UI unit tests, 1,145 Playwright journeys, 279 Swift tests. Open: chaos
engineering, and a rehearsal of the Neo4j 5 to 2025 migration
([ADR-030](../ADRs/ADR-030-neo4j-2025-lts-migration.md)).

**Govern and manage, 6/10.** The retention policy and the tamper-evident
audit trail exist (ADR-045); the incident clocks of GDPR and NIS2 and who
holds each are in the guideline (section 7); the EHDS roles have their
go-live checklist (section 10). Open: an SLA and its dashboard, an incident
response plan with a named team, change management beyond pull requests,
cost allocation per tenant, an independent test.

## What stands between the demonstrator and an operable platform

The gap is no longer in the code; it is in the operation, and the
[guideline's checklist](../security/operational-guideline.md#10-before-go-live-the-checklist-by-role)
lists it by EHDS role. The items the project itself can still do:

| #   | Item                                                                                                      | Pillar                   | Tracked in                  |
| --- | --------------------------------------------------------------------------------------------------------- | ------------------------ | --------------------------- |
| 1   | `stress` after `size-ui.sh`, then `spike`, `soak` and `signin`; the per-stage p95 into ADR-061            | Performance, Reliability | #571                        |
| 2   | Alert rules on the load dashboard and the audit chain, and who is paged                                   | Operational Excellence   | open                        |
| 3   | A Neo4j backup, or Neo4j Enterprise or a managed graph, before any non-synthetic data                     | Reliability              | guideline, section 2        |
| 4   | Compression and a short cache on the catalog and overview responses                                       | Performance              | open                        |
| 5   | Secret rotation on a schedule: the Keycloak clients, the account service, the catalog token               | Security                 | guideline, section 2        |
| 6   | An independent penetration test of the hub and a TR-03161 test of the app                                 | Security                 | #655                        |
| 7   | Operator accounts and `edcadmin` on generated passwords in Key Vault (`scripts/azure/secure-accounts.sh`) | Security                 | #671                        |
| 8   | An SLA with its dashboard, and the incident response plan with a named team                               | Govern and manage        | guideline, sections 7 and 8 |

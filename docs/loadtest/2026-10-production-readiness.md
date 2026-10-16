# Production readiness assessment, October 2026

Well-Architected Framework (WAF) and Cloud Adoption Framework (CAF), applied
to the EHDS Integration Hub as it runs on Azure Container Apps on 2026-10-16.
It updates the [assessment of 2026-03-25](2026-03-production-readiness.md),
which was written against the compose stack before any of the live runs;
every line of that assessment is answered below with what has been done, with
the evidence, and with what is still open. Scores are the project's own
judgement on the same ten-point scale as in March, so the two can be read
against each other. None of this is an independent audit.

| Pillar                      | March    | October  | What moved it                                                                                                              |
| --------------------------- | -------- | -------- | -------------------------------------------------------------------------------------------------------------------------- |
| WAF: Operational Excellence | 4/10     | 7/10     | Vault with state, OpenTelemetry and structured logs, sixteen runbooks, deploy on every merge, a deploy hold for runs       |
| WAF: Security               | 6/10     | 8/10     | Security test report with nine of ten findings closed, threat models, SBOMs, rate limits, every route behind a session     |
| WAF: Reliability            | 5/10     | 6/10     | 400 users with no failed request, health checks everywhere, managed Postgres with restore; Neo4j still one node, no backup |
| WAF: Performance Efficiency | 4/10     | 7/10     | Graph views capped, Neo4j and the UI sized from measurements, 50 users inside every SLO; 200 users not yet                 |
| WAF: Cost Optimization      | 5/10     | 7/10     | Everything stops off hours, cost per 1,000 requests measured, sizes decided in ADRs                                        |
| WAF: Sustainability         | 3/10     | 6/10     | Off hours cut the stack to a third of the week; no carbon-aware choice yet                                                 |
| CAF: Strategy & Plan        | 7/10     | 8/10     | Operational guideline with the EHDS roles and the BSI standards, sixty-one ADRs                                            |
| CAF: Govern & Manage        | 4/10     | 6/10     | Retention policy, incident clocks, audit trail; no SLA, no SOC, no independent test                                        |
| **Overall**                 | **5/10** | **7/10** | **A measured demonstrator. Not yet an operable platform for real data: the gap is listed at the end.**                     |

The platform assessed: the hub and its connectors on Azure Container Apps in
`rg-mvhd-dev`, West Europe, with PostgreSQL on a Flexible Server
([ADR-041](../ADRs/ADR-041-managed-postgres-on-azure-containerised-locally.md)),
Neo4j Community at 2 vCPU and 4 GiB ([ADR-056](../ADRs/ADR-056-neo4j-grows-to-2-vcpu-and-4-gib.md)),
the UI on whole cores ([ADR-061](../ADRs/ADR-061-the-ui-scales-out-on-whole-cores.md)),
Vault with its state on the Flexible Server ([ADR-046](../ADRs/ADR-046-vault-keeps-its-state-on-the-flexible-server.md)),
stopped outside office hours ([ADR-053](../ADRs/ADR-053-everything-stops-off-hours.md),
[ADR-058](../ADRs/ADR-058-azure-triggers-the-off-hours-schedule.md)). The load
numbers are the runs in [the results index](README.md).

## WAF pillar 1: Operational Excellence, 7/10

| March said                                    | October                                                                                                                                                                                                                                                             |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vault in dev mode, in memory, lost on restart | **Done.** File-backed locally since 2026-09-26; on Azure the state is a database on the Flexible Server with an unseal sidecar (ADR-046). A restart keeps every participant's key.                                                                                  |
| No structured logging, no correlation ids     | **Done in the proxy** (`pino`, the run's `testid` and the caller on every line); the UI logs through Next.js. Every audit record carries its run.                                                                                                                   |
| No distributed tracing, no OpenTelemetry      | **Done.** OpenTelemetry collector, Prometheus, Loki, Tempo, Grafana ([ADR-045](../ADRs/ADR-045-observability-and-regulatory-audit-trail.md)); the proxy is traced (`src/tracing.ts`). Logs in Azure Monitor, 30 days.                                               |
| No alerting rules, no on-call runbooks        | **Partly.** Sixteen runbooks under `docs/knowledge/runbooks/` (deploy, seeding, realm drift, Postgres recovery, off hours, load test, audit chain). No alert rules yet; the dashboards are read by a person.                                                        |
| No CI/CD beyond GitHub Pages                  | **Done.** A merge to main deploys to Azure (`deploy-azure.yml`) and waits while a load test runs; the PR gate, the test, security, compliance and CodeQL workflows run on every pull request; `demo-smoke.yml` runs Bruno, Playwright and ZAP against the live hub. |
| No Helm chart for 19 services                 | **Replaced, not done.** The target is Container Apps, not Kubernetes (ADR-012); the stack is 25 compose services and 21 apps and 9 jobs on Azure. `k8s/` holds a probe set and one manifest, scanned by Kubescape, not a deployment.                                |
| No feature flags                              | Open. Demo flags only (`NEXT_PUBLIC_DEMO_TK`, `LIVE_DEMO_OFFLINE`).                                                                                                                                                                                                 |
| No `/metrics` on the proxy                    | **Done.** The proxy exports to the collector; the crawlers expose `/metrics` and are health-checked on it.                                                                                                                                                          |

Still open: alert rules on the dashboards (errors during a run, Postgres burst
credits, a container at its CPU limit), and the operator's on-call model, which
the [operational guideline](../security/operational-guideline.md) describes
and the project cannot provide.

## WAF pillar 2: Security, 8/10

| March said                              | October                                                                                                                                                                                                                                                         |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vault seal keys not persisted           | **Done** (ADR-046).                                                                                                                                                                                                                                             |
| No rate limiting on the proxy           | **Done.** Per user (100 requests and 20 analytical queries a minute) and per participant for callers that name no user, per replica (#534, #536). The 2026-10-05 audited run measured it: 83.6 % refused before, 23.2 % after.                                  |
| k-anonymity not enforced by policy      | **Done in code**, `MIN_COHORT_SIZE` of 5 in the proxy's configuration; the policy statement is the operational guideline's secure processing section. Output control by the access body is a process the demo does not run.                                     |
| No network policies, no mTLS            | **Partly.** Only the hub and Keycloak have public ingress; everything else is internal to the environment. No mTLS between apps; the guideline asks for private endpoints and mutually authenticated DSP endpoints for real data.                               |
| No OWASP ZAP or security scan in CI     | **Done.** ZAP in `demo-smoke.yml`; grype over the bills and trivy over the images on every push; CodeQL for TypeScript and Swift; gitleaks, hadolint, shellcheck and Semgrep in the hooks; Kubescape over the manifests.                                        |
| No audit log retention policy           | **Done.** [Audit retention policy](../audit-retention-policy.md): ten years for access, transfer, contract and permit records, two years for sign-ins and edge logs; `/api/admin/audit/retention` applies it and cannot destroy the only copy.                  |
| Neo4j single user, no role-based access | **Mitigated.** The UI reads the graph directly and the proxy serves the data planes (ADR-043); every API route needs a session (ADR-044); who sees a patient's identity is decided by role (#475), never by a query parameter. Neo4j itself still has one user. |
| Keycloak client secrets not rotated     | **Partly.** Operator secrets are Key Vault references (ADR-036) and the live `NEXTAUTH_SECRET` was rotated; a rotation schedule is written down (C5 CRY-04) but not automated.                                                                                  |

New since March: the [security test report of 2026-10-15](../security/security-test-report-2026-10-15.md),
ten findings, nine closed and one reviewed and accepted (the published
development key of the local compose stack; Azure takes its keys from Vault);
the [threat model of the hub](../security/threat-model.md) and
[of the app](../security/threat-model-klarbefund.md); one CycloneDX bill of
materials per deployable part ([SBOM](../sbom/README.md)); Keycloak login events
kept seven days and the UI client's scope limited to the seven EHDS roles
(#648); the admin console off the internet (F10); the app locked with Face ID
(ADR-060). Found on 2026-10-16 while applying #648: the console guard had told
Keycloak every request was plain HTTP, which broke every admin script for a
day (#670). What an independent test would add is in the report's last
section; none has been done.

## WAF pillar 3: Reliability, 6/10

| March said                                                   | October                                                                                                                                                                                                        |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/api/graph` crashes Next.js at about 90 concurrent requests | **Done.** The graph views are capped at the newest 30 access events (#580); the stress run of 2026-10-06 reached 400 users with 0 failed requests out of 81,518.                                               |
| No health checks, no readiness or liveness probes            | **Done.** Every image carries a `HEALTHCHECK` (F6, 2026-10-16); Container Apps probes come from it; `k8s/probes.yaml` for a Kubernetes target.                                                                 |
| No circuit breaker, no graceful shutdown in the proxy        | **Partly.** The proxy drains on `SIGTERM` (`src/index.ts`); every outbound call has a timeout and `/api/tasks` answers from its store when the connector fails and says so (#648). No circuit breaker library. |
| Neo4j Community: no clustering, no failover, no backup       | **Open.** One node at 2 vCPU and 4 GiB on Azure Files, no backup. The guideline asks for Neo4j Enterprise or a managed graph with backups tested quarterly before real data.                                   |
| Docker volumes not backed up                                 | **Postgres done, Neo4j open.** The Flexible Server keeps 7 days of point-in-time restore (ADR-041); the realm, the contracts and the task store live there. Neo4j's data is re-seedable synthetic data today.  |
| Vault restart loses all secrets                              | **Done** (ADR-046).                                                                                                                                                                                            |

What the runs showed: at 50 users every SLO holds (API p95 155 ms, pages 43 ms,
NLQ 217 ms); from 200 users the latency SLOs break on the UI's CPU, and the
UI's new size (ADR-061) has not been measured yet. The connectors' pages did
no real work in the runs because the UI called the management API at the wrong
address, which #648 pins on every deploy; the next `load` run is the first with
contracts and transfers under load.

## WAF pillar 4: Performance Efficiency, 7/10

| March said                         | October                                                                                                                                                                         |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Graph API: 60 MB payload, 22 s p95 | **Done** (#580). `/api/graph` p95 587 ms at 50 users on compose; 10 s on Azure before the Neo4j resize, inside the SLO after it.                                                |
| Patient API p95 8.5 s at 200 users | **Done.** Neo4j at 2 vCPU and 4 GiB, heap 1.5 GiB, page cache 1 GiB (ADR-056); indexes for every FHIR query path in `neo4j/init-schema.cypher` (70 and more, 3 vector indexes). |
| No response caching                | **Open.** No cache on the catalog or the overview; the audit chain's batch writer takes the write load (hypothesis 2 of the runbook: not a ceiling).                            |
| No compression                     | **Open in the proxy**; Next.js compresses its own responses by default.                                                                                                         |
| Neo4j heap 1 GiB tight             | **Done** (ADR-056).                                                                                                                                                             |
| No CDN                             | **Partly.** The static export is served by GitHub Pages; the hub's assets come from the app. No CDN in front of the live hub.                                                   |

Measured capacity: 66 requests a second at 400 users with no failure; the
ceiling moved from Neo4j's memory (morning of 2026-10-06) to the UI's CPU
(evening), and the UI's size was decided from that measurement. The
[scalability per component](../ADRs/ADR-061-the-ui-scales-out-on-whole-cores.md#scalability-per-component)
is written down in ADR-061. The March targets, 40 requests a second sustained
at 200 participants under 500 ms, hold at 50 users today and are to be
measured at 200 after `size-ui.sh`.

## WAF pillar 5: Cost Optimization, 7/10

| March said                               | October                                                                                                                                                                   |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vault re-bootstrap as an operations cost | **Done** (ADR-046).                                                                                                                                                       |
| No autoscaling                           | **Done.** Container Apps rules: the UI on an HTTP concurrency rule of 15, one to six replicas (ADR-061); the proxy on ACA's rule; everything to zero off hours (ADR-053). |
| Graph API egress                         | **Done** (#580).                                                                                                                                                          |
| No cost tagging                          | **Open.** One resource group, one bill; cost guards (`cost-guards.yml`) watch the total.                                                                                  |

Measured: the bill of a month that ran around the clock was €741 against an
estimate of €426, which is what made everything stop off hours (ADR-053,
about 65 office hours a week). At list price the apps that serve a request
bill about $0.60 an hour, about **$0.01 per 1,000 requests at 50 users**
(ADR-061, from `20261006-2115-load-aca`). The cost per 1,000 requests from
Cost Management over a `soak` window is still to be taken.

## WAF pillar 6: Sustainability, 6/10

| March said                           | October                                                                                                                               |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| No idle-down outside business hours  | **Done.** The whole stack stops at 18:13 UTC and starts at 05:17 UTC on weekdays, triggered by Azure as a managed identity (ADR-058). |
| Graph API wastes compute and network | **Done** (#580).                                                                                                                      |
| No resource utilisation reporting    | **Done.** The containers row of the load dashboard; Cost Management.                                                                  |
| No carbon-aware scheduling           | **Open.** West Europe, no carbon signal in the schedule.                                                                              |

## CAF

**Strategy and plan, 8/10.** The regulatory motivation is written down per
article (Regulation (EU) 2025/327 in its adopted numbering), the
[operational guideline](../security/operational-guideline.md) names which
EHDS role operates which part and what BSI C5, IT-Grundschutz, TR-02102 and
TR-03161 ask of each, sixty-one ADRs record the decisions, and the planning
index tracks the work. Still no formal SLA for participants; the guideline
puts the targets into the service contract the operator signs.

**Ready, 7/10.** Everything runs on Azure from a merge; the local stack is one
compose command; the seed phases are resumable. The Kubernetes target of March
was replaced by Container Apps (ADR-012), so the Helm chart was never needed.

**Adopt, 7/10.** DSP 2025-1 TCK, DCP and EHDS compliance suites run on every
pull request, the Bruno collection asserts every route by persona (ADR-031,
ADR-032), 2,317 UI unit tests, 1,145 Playwright journeys, 279 Swift tests. No
chaos engineering; the stress runs are the nearest thing. The Neo4j 5 to 2025
migration has an ADR (ADR-030), not yet a rehearsal.

**Govern and manage, 6/10.** The retention policy and the tamper-evident audit
trail exist (ADR-045), the incident clocks of GDPR and NIS2 and who holds each
are in the guideline (section 7), and the EHDS roles have their go-live
checklist (section 10). Open: an SLA and its dashboard, an incident response
plan with a named team, change management beyond pull requests, cost
allocation per tenant, and an independent penetration test.

## From a demonstrator to an operable platform

The P0 list of March is closed: the graph API, Vault, rate limiting,
k-anonymity, health checks and the retention policy are done. What stands
between the demonstrator and a platform that may hold real data is no longer
in the code; it is in the operation, and the
[operational guideline's checklist](../security/operational-guideline.md#10-before-go-live-the-checklist-by-role)
lists it by role. The items the project itself can still do:

| #   | Item                                                                                                      | Pillar                   | Where it is tracked         |
| --- | --------------------------------------------------------------------------------------------------------- | ------------------------ | --------------------------- |
| 1   | `stress` after `size-ui.sh`, then `spike`, `soak` and `signin`; the per-stage p95 into ADR-061            | Performance, Reliability | #571                        |
| 2   | Alert rules on the load dashboard and the audit chain, and who is paged                                   | Operational Excellence   | open                        |
| 3   | Neo4j backup, or Neo4j Enterprise or a managed graph, before any non-synthetic data                       | Reliability              | guideline, section 2        |
| 4   | Compression and a short cache on the catalog and overview responses                                       | Performance              | open                        |
| 5   | Secret rotation on a schedule (Keycloak clients, the account service, the catalog token)                  | Security                 | guideline, section 2        |
| 6   | An independent penetration test of the hub and a TR-03161 test of the app                                 | Security                 | #655                        |
| 7   | Operator accounts and `edcadmin` on generated passwords in Key Vault (`scripts/azure/secure-accounts.sh`) | Security                 | #671                        |
| 8   | An SLA with its dashboard, and the incident response plan with a named team                               | Govern and manage        | guideline, sections 7 and 8 |

Everything else in the March timeline, the Helm chart, the StackIT deployment
and the mesh, was overtaken by the decision for Azure Container Apps and is
not planned.

# ADR-042: Cloud-native, vendor-agnostic observability, and a tamper-evident audit trail for regulators

**Status:** Proposed
**Date:** 2026-10-02
**Relates to:** [ADR-029](ADR-029-dependency-version-pinning.md), [ADR-036](ADR-036-operator-secrets-in-key-vault.md), [ADR-037](ADR-037-secure-processing-environment-confidential-computing.md), [ADR-040](ADR-040-derived-compliance-state-in-the-api.md), [ADR-041](ADR-041-managed-postgres-on-azure-containerised-locally.md)
**Supersedes:** the `neo4j-logs` row of [ADR-017](ADR-017-persistent-storage-aca.md) (Neo4j `/logs` is no longer mounted on SMB)
**Tracks:** [#418](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/418)

## Context

An HDAB, a data protection authority or a NIS2 supervisor will ask two different
questions, and the stack answers neither well today.

1. **"Is the service working, and what happened during the incident?"** That is
   operations: logs, metrics, traces, alerts.
2. **"Who accessed which health data, under which permit, and can you prove the record
   was not changed?"** That is the audit trail, and it is evidence, not telemetry.

Obligations that shape the second question:

| Source                                 | What it asks of us                                                                |
| -------------------------------------- | --------------------------------------------------------------------------------- |
| Regulation (EU) 2025/327 Art. 9        | A natural person can see who accessed their data in primary use; kept ≥ 3 years   |
| Regulation (EU) 2025/327 Art. 73(1)(e) | SPE logs of access and activity kept ≥ 1 year (implemented in `lib/retention.ts`) |
| Regulation (EU) 2025/327 Annex II      | EHR systems carry a logging component                                             |
| GDPR Art. 5(2), 30, 32, 33             | Accountability, records of processing, integrity, breach notice within 72 h       |
| NIS2 Art. 21, 23                       | Health is a sector of high criticality: logging, monitoring, 24 h early warning   |

What exists:

- **Audit records live in Neo4j as ordinary nodes.** `TransferEvent` (Art. 73 access
  events, with `permitId` and `retainUntil`), `DataTransfer`, and `QueryAuditEvent`
  (written best-effort from `services/neo4j-proxy/src/index.ts`, `logQueryAudit`). They
  are written with `MERGE`, can be edited by anyone with Bolt access, and are deleted by
  `POST /api/admin/audit/retention`. Nothing would reveal an edit. A record that can be
  silently changed is not evidence.
- **`QueryAuditEvent` stores the raw question text** (up to 500 chars) and falls back to
  `participantId: "anonymous"`. A free-text question can carry personal data, and an
  anonymous audit record answers no one's question.
- **Operational logs go to Log Analytics `mvhd-logs`** (`provision-aca-env-logging.yml`,
  `scripts/azure/07-observability.sh`), console output only, retention **30 days**. No
  traces, no request correlation between UI, proxy, EDC control plane and data plane, and
  no Keycloak admin events. A DSP negotiation that fails across four services is
  reconstructed by hand with `az monitor log-analytics query`.
- **Log Analytics is costly and already losing data.** Measured on 2026-10-02 over the
  previous 30 days: 19.2 GB billable (18.3 GB console, 0.9 GB system), at an average
  0.62 GB a day. The workspace has a **1 GB daily cap, and 14 of 31 days hit it**: after
  that, ingestion stops and the rest of the day's logs are discarded. The cap keeps the
  bill bounded by throwing away the evidence of whatever happened that afternoon.
  **91 % of console bytes (15.8 of 17.3 GB) were Java stack-trace lines from crash
  loops**: EDC services retrying against a missing database (#318), and Neo4j's log4j
  failing to roll its log file on the SMB `/logs` mount. User traffic produced under
  1 MB a day. The bill tracks failures, not usage. Analytics-tier ingestion is
  priced per GB ingested (list price roughly €2.50 to €3 per GB in West Europe after
  5 GB free a month), so the bill scales with how much we say, not with what we keep.
- **The EDC images already carry the OpenTelemetry Java agent** (see the
  `otel.javaagent` filters in `scripts/request-participant-credentials.sh`); it exports
  nowhere.
- **Durable storage is constrained** (ADR-041): ACA offers no block storage, and SMB
  cannot host a database. Anything we self-host must keep its durable state in object
  storage, not on a volume.
- **The project must stay portable.** It is a reference implementation that other
  dataspace operators, HDABs and EU sovereign-cloud tenants (IONOS, OVHcloud, Scaleway,
  STACKIT, Open Telekom Cloud) should be able to run. Azure is one deployment target, not
  the architecture.

## Decision

**Separate the two planes, and build both on open standards with swappable adapters. No
cloud-provider service is required; each provider service we use is one adapter among
several, chosen by configuration.**

The rule for every component: an open protocol at the boundary (OTLP, PromQL/LogQL, S3,
FHIR, RFC 3161), CNCF or OSI-licensed software behind it, durable state only in
S3-compatible object storage, and the same container images on Compose, Kubernetes and
ACA.

**Cost is a design input, not an afterthought.** The cost driver is volume, not the tool,
so we cut volume before choosing where it goes, and we pay for object storage (cents per
GB-month) rather than per-GB ingestion (euros per GB). See "Cost" below.

### Plane 1: operations (logs, metrics, traces)

1. **Instrument with OpenTelemetry only.** `@opentelemetry/sdk-node` in the Next.js UI
   (`instrumentation.ts`) and `services/neo4j-proxy`; the Java agent the EDC images
   already carry, switched on; Keycloak 26's built-in OTel support. W3C `traceparent`
   propagates across DSP calls, so one negotiation is one trace. Application code talks
   OTLP to a collector and nothing else; no vendor SDK enters the codebase.
2. **Structured JSON logs to stdout** (pino in Node services) carrying `trace_id`,
   `participant` and role. Never patient identifiers, tokens or question text. The
   collector picks them up; the app does not know where they go.
3. **OpenTelemetry Collector (contrib) is the single egress point.** It batches, redacts
   (`transform`/`redaction` processors as a second line of defence for PII), drops
   health-check and readiness-probe noise and anything below `INFO` (`filter`
   processor), samples traces tail-based (keep every error and slow trace, 10 % of the
   rest), and fans out to exporters. Changing the backend is a collector config change,
   and so is changing how much we keep.
4. **Default backend: the Grafana LGTM stack, self-hosted, on object storage.** Loki
   (logs), Tempo (traces), Mimir or Prometheus (metrics), Grafana (dashboards, alerting).
   Loki, Tempo and Mimir keep their durable data in any S3-compatible bucket (AWS S3,
   MinIO, Ceph RGW, IONOS, OVHcloud, Scaleway) or Azure Blob / GCS natively, so they
   sidestep ADR-041: local disk holds only a WAL and caches, and losing it costs at most
   the unflushed minutes, not the history.
   - **Locally:** `docker-compose.observability.yml` with the collector, the LGTM services
     and MinIO.
   - **Kubernetes:** the upstream Helm charts (`opentelemetry-collector`, `loki`,
     `tempo`, `mimir-distributed`, `grafana`), versions pinned per ADR-029.
   - **Azure (current demo):** **one** container app, `mvhd-observability`, running the
     collector and Loki, Tempo, Prometheus and Grafana in monolithic mode as containers of
     that app, 1 vCPU and 2 GiB in total, with Azure Blob as the bucket. It follows the
     off-hours scale-down of the rest of the stack (ADR-023, ADR-027). Five separate apps
     would cost five idle minimums for no benefit at this volume.
   - **Any managed OTLP backend** (Grafana Cloud, Azure Monitor, Elastic, Dynatrace,
     Datadog) is an optional extra exporter in the collector, never a dependency.
5. **Dashboards, alert rules and recording rules are code**: Grafana provisioning files,
   Prometheus-format rules and LogQL in `observability/` in this repo, so they move with
   the stack. Alerts: authorize endpoint (gotcha 7), Postgres connectivity, failed DSP
   negotiations, 5xx rate, audit outbox lag. Notification goes through Alertmanager
   receivers (webhook, email, Matrix, Slack), not a provider action group.
6. **Retention 90 days** for operational data, set in Loki/Tempo/Mimir compactors and
   the bucket lifecycle rule.

### Plane 2: regulatory audit trail

7. **One record shape: FHIR R4 `AuditEvent`, profiled per IHE BALP.** Every access to
   health data (FHIR read, OMOP query, NLQ, transfer, SPE session, permit decision,
   patient-rights request, Keycloak admin action) emits one. Fields: who (participant DID,
   role, pseudonymous user id), what (resource type and id or dataset id), why (purpose
   of use, `permitId`), outcome, when, source service. Question text is replaced by its
   SHA-256 and the resolved query template. FHIR is the vendor-neutral format a health
   regulator can read without our software.
8. **Hash chain, verifiable by anyone.** Each record carries `prevHash` and `hash` over
   its canonical JSON (RFC 8785 JCS). The chain head is digested daily and the digest is
   **signed through Vault's Transit engine**, which already runs in the stack
   (`jad/vault.hcl`); OpenBao is a drop-in, open-governance replacement. The digest is
   additionally timestamped by an **RFC 3161 Time-Stamp Authority**: any TSA works, and a
   qualified eIDAS TSA turns it into a qualified timestamp (with #204). Verification is
   `scripts/verify-audit-chain.sh` plus a status in the Trust Center page, and needs only
   the public key and the records.
9. **Write-once copy outside the graph, behind one port.** An `AuditSink` interface with
   adapters:

   - **S3 Object Lock in compliance mode** (default): AWS S3, MinIO, Ceph RGW and most
     EU sovereign clouds implement it, retention 3 years (covers Art. 9, exceeds Art.
     73's one year).
   - **Azure Blob immutability policy** for the current Azure deployment.
   - **Filesystem** for local development and CI, explicitly marked as not evidence.

   Neo4j keeps its copy for the UI and graph queries; the bucket is the evidence.
   Retention deletion in Neo4j (`/api/admin/audit/retention`) no longer destroys the only
   copy.

10. **Audit writes are not best-effort.** The Neo4j write is synchronous, and the data
    access fails closed if it fails. The sink write is asynchronous through an outbox
    (`exported: false`) so an object-store outage does not block users; outbox lag is
    alerted. `logQueryAudit`'s fire-and-forget pattern goes.
11. **Regulator export:** `GET /api/admin/audit/export` returns a FHIR `Bundle` of
    `AuditEvent`s for a time range, participant or permit, with the chain verification
    result and the signed digests. This is what an HDAB inspector receives, and it is
    readable with any FHIR tool.
12. **Audit events never travel through Plane 1 alone.** The collector may receive a copy
    for correlation, but sampling, redaction and 90-day retention make telemetry unfit as
    evidence.

### Cost

13. **Cut volume at the source first.** Stop the crash loops that produced 91 % of
    today's volume (remove Neo4j's SMB `/logs` mount, finish #318, retry with backoff),
    collapse and deduplicate exceptions, keep production at `INFO`, drop probe lines.
    Target: under 6 GB a month at demo load. The detail is in the
    [cost-efficient logging runbook](../knowledge/runbooks/cost-efficient-logging.md).
14. **Stop paying per-GB ingestion for bulk logs.** Once the collector route works, the
    ACA environment sends console logs to the collector only; Log Analytics keeps the
    platform's `ContainerAppSystemLogs` (under 1 GB a month, inside the free 5 GB). The
    1 GB daily cap goes, because it silently discards data, and the budget alert in item
    16 takes its place.
15. **Tiered retention in object storage.** Loki and Tempo data move to a cool tier after
    30 days through a bucket lifecycle rule and expire at 90. Audit objects sit in a cool,
    Object Lock-protected bucket for 3 years: at a few KB per event that is megabytes,
    i.e. cents a year.
16. **A budget alert, not a cap.** A monthly budget on the resource group with alerts at
    50, 80 and 100 %, plus a collector metric alert when daily log volume exceeds twice
    its 7-day average. We find out that we are spending, instead of losing logs.

Estimated monthly cost at demo volume (list prices, before ACA's monthly free grant; to be
confirmed against the first full month's bill):

| Option                                                        | Approx. €/month | Keeps every log? | Portable? |
| ------------------------------------------------------------- | --------------: | ---------------- | --------- |
| Today: Log Analytics Analytics tier, 1 GB cap                 |        35 to 50 | No (14/31 days)  | No (KQL)  |
| Log Analytics after volume cut only                           |          0 to 5 | Yes              | No        |
| **Chosen: one LGTM app, 1 vCPU / 2 GiB, Blob, off-hours off** |    **25 to 40** | **Yes**          | **Yes**   |
| Same, but running 24/7                                        |        60 to 75 | Yes              | Yes       |
| Grafana Cloud free tier (EU region) via OTLP exporter         |               0 | Yes, 14 days     | Yes       |
| Audit plane: Object Lock bucket + Vault Transit + daily TSA   |             < 1 | n/a              | Yes       |

The honest reading: at demo volume, self-hosting is not cheaper than a trimmed Log
Analytics workspace. It is chosen because it is the cheapest option that is also portable
and gives traces. The saving against today comes from cutting volume, which every option
needs. If cost must reach zero, the Grafana Cloud free tier is a collector exporter away;
it is excluded as the default only because the default must not depend on a vendor.

### Later, not now

- **SIEM for NIS2 detection** (Wazuh, or a provider SIEM) consuming the collector's log
  stream, when the stack leaves demo status.
- **Transparency log anchoring** (Sigstore Rekor or a dataspace-shared log) for the daily
  digest, so participants can cross-verify each other's audit chains.

## Consequences

- An access record can be proven unchanged by anyone holding the public key, with no
  access to our cloud account. That is the property an auditor tests, and it survives a
  change of hosting provider.
- Moving from Azure to Kubernetes or a sovereign cloud changes the collector exporters,
  the bucket endpoint and the `AuditSink` adapter. No application code changes.
- One request is one trace from the UI through the proxy to both connectors, which
  shortens incidents like #318 from hours of KQL to one view.
- **We operate the observability stack ourselves.** That is the price of vendor
  neutrality: upgrades, capacity and Loki/Tempo/Mimir configuration are ours. Mitigation:
  single-binary or monolithic modes at demo scale, upstream charts, pinned versions, and
  a managed OTLP backend remains a one-line exporter if the operations cost outgrows the
  benefit.
- **Licences:** Loki, Tempo, Mimir and Grafana are AGPLv3. Running them unmodified as
  separate services is fine for this project and its users; a redistributor that
  modifies them must publish changes. The OTel Collector, Prometheus and Jaeger are
  Apache 2.0 if that ever matters.
- The ACA demo gains one container app and one bucket. The existing Log Analytics
  workspace keeps the platform's system logs only, within its free allowance, and the
  KQL in `07-observability.sh` and the workflows is replaced by LogQL over time. The
  workflows that query `ContainerAppConsoleLogs_CL` for seed diagnostics must move first,
  or they lose their data source.
- Logs are no longer discarded at a daily cap. Spending is watched by a budget alert, so
  a noisy service raises a warning instead of erasing the afternoon.
- While the stack is scaled down off-hours, the observability app is down too. Nothing
  runs then that needs observing; the audit plane is unaffected because it does not go
  through it.
- Fail-closed auditing makes Neo4j a dependency of every data access, which it already is.
- Object Lock in compliance mode cannot be shortened or deleted, by us either. CI and
  local runs use the filesystem adapter or an unlocked bucket.
- `/api/admin/audit/export` needs a mock fixture and Bruno requests like every route.

## Alternatives considered

**Azure Monitor, Application Insights, Key Vault and Blob immutability as the design.**
Rejected as the architecture, kept as adapters: it locks a reference implementation
meant for any EU operator to one provider's APIs, query language (KQL) and pricing.

**Keep audit only in Neo4j and add access control.** Rejected: an operator with database
access can still change a record without trace; access control is not tamper evidence.

**Elasticsearch or OpenSearch.** Rejected: both need durable block storage for their
indexes, which ACA does not have (ADR-041), and they are heavier to run than LGTM at
this scale. Elasticsearch is also no longer OSI-licensed by default.

**VictoriaMetrics / VictoriaLogs, SigNoz, ClickHouse-based stacks.** Credible and
OTLP-native, rejected for now because they keep their data on local disk rather than in
object storage, which our ACA target cannot provide. Revisit on Kubernetes with
persistent volumes.

**Jaeger instead of Tempo.** Viable and Apache 2.0, but its durable storage is Cassandra,
Elasticsearch or OpenSearch, which brings back the block-storage problem. Tempo writes to
a bucket.

**Commercial SaaS (Datadog, Splunk, New Relic, Dynatrace).** Rejected as defaults: a
second processor for health telemetry, outside the operator's control, priced per host.
OTLP keeps them available as exporters.

**Azure Confidential Ledger or Amazon QLDB for audit records.** Rejected: provider-
specific, and QLDB is discontinued, which is exactly the risk this ADR avoids. A signed,
RFC 3161-timestamped hash chain in Object Lock storage gives the same guarantee portably.

**immudb.** Rejected: another stateful service needing a durable disk, for a property the
hash chain plus Object Lock already gives.

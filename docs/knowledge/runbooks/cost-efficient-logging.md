---
type: runbook
title: Cost-efficient logging strategy
description: What we log, at which level, where it goes and for how long, so logs stay useful to operators and regulators while the bill tracks traffic rather than failures. Baseline measured on mvhd-logs 2026-10-02.
resource: docs/ADRs/ADR-045-observability-and-regulatory-audit-trail.md, scripts/azure/07-observability.sh, .github/workflows/provision-aca-env-logging.yml, scripts/azure/02-data-layer.sh
tags: [runbook, logging, observability, cost, azure, opentelemetry]
generated: { by: claude-code/opus-5.5, at: 2026-10-02T00:00:00Z }
verified: { by: UNKNOWN, at: UNKNOWN }
status: draft
---

Implements the cost part of [ADR-045](../../ADRs/ADR-045-observability-and-regulatory-audit-trail.md).
Tracked in [#418](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/418).

## 1. Baseline: what we pay for today

Measured on Log Analytics `mvhd-logs` (`PerGB2018`, 30-day retention, 1 GB daily cap) for
2026-09-01 to 2026-10-02:

| Finding                                                                              | Number                                                                                               |
| ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| Billable ingestion                                                                   | 19.2 GB (18.3 console, 0.9 system)                                                                   |
| Days that hit the 1 GB cap and **discarded the rest of the day**                     | 14 of 31 (2026-09-02 to 09-16)                                                                       |
| Console bytes that were Java stack-trace lines (`at ...`, `Caused by`, `... N more`) | **15.8 of 17.3 GB, 91 %**                                                                            |
| Cause, 09-02 to 09-16                                                                | IdentityHub, IssuerService, control plane crash-looping on a missing database (#318), about 1 GB/day |
| Cause, 09-22 to 09-29                                                                | `mvhd-neo4j` log4j failing to roll its log file on the SMB `/logs` mount, 180 MB/day                 |
| Cause, 09-30 onward                                                                  | EDC services again: `FATAL: database "controlplane" does not exist`, 60 to 80 MB/day                 |
| Log lines from actual user traffic (`mvhd-ui`, proxy)                                | under 1 MB/day                                                                                       |
| Health-probe lines                                                                   | about 0.4 MB/day                                                                                     |

**The bill is driven by failure loops, not by traffic.** A service that fails to start
retries every few seconds and prints a 60-line stack trace each time; on ACA each line
becomes a separate record carrying its own copy of the app, revision and replica
columns. The daily cap then hides the incident it was paid to record.

Rough cost: about 14 GB over the free 5 GB at roughly €2.50 to €3 per GB, so €35 to 50 a
month, most of it for repeated copies of one exception.

Reproduce:

```kusto
// Daily billable GB
Usage | where TimeGenerated > ago(31d) and IsBillable
| summarize GB = round(sum(Quantity)/1024, 2) by bin(TimeGenerated, 1d)

// Share of stack-trace lines
ContainerAppConsoleLogs_CL | where TimeGenerated > ago(31d)
| extend stack = Log_s startswith "\tat " or Log_s startswith "Caused by:"
                 or Log_s matches regex @"^\s+\.\.\. \d+ more"
| summarize totalGB = sum(_BilledSize)/1073741824.0, stackGB = sumif(_BilledSize, stack)/1073741824.0
```

## 2. Principles

1. **Fix loops at the source, not the bill.** A crash loop is an incident. It raises one
   alert and produces one record per distinct exception, not 50,000 lines a day.
2. **One event, one record, short trace.** A multi-line exception is joined into one
   JSON record, with the stack trace in a field truncated to the first 20 frames and the
   root cause. That alone saves the per-line metadata; it is what makes principle 3
   possible, because a joined exception can be recognised as a repeat.
3. **Repeats are counted, not repeated.** Identical errors within a window are rate
   limited: the first is kept, the rest are summarised as a count.
4. **Counts are metrics, not logs.** Request rates, probe results, retry counts and
   latency go to metrics (fractions of a cent per series). A log line is for something a
   human will read.
5. **INFO in production, DEBUG on demand.** DEBUG is turned on for one service, for a set
   time, and turned off by the same change.
6. **Structured, plain, minimal.** JSON lines, no ANSI colour codes, no banners, no
   request or response bodies, no personal data.
7. **Audit events are not logs.** Access to health data is recorded in the audit trail
   (ADR-045 plane 2), never only in operational logs, so log sampling, filtering and
   retention can be aggressive without touching evidence.
8. **Pay for storage, not ingestion.** Bulk logs end in object storage (cents per
   GB-month), not per-GB ingestion (euros per GB).
9. **Budget alerts, never a cap that drops data.**

## 3. Log levels per service

| Service                                                   | Production level                             | Notes                                                                                      |
| --------------------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `mvhd-ui` (Next.js)                                       | `info`                                       | pino JSON; no request bodies; `trace_id` on every line                                     |
| `mvhd-neo4j-proxy`                                        | `info`                                       | pino JSON; Cypher text never logged, only the template name                                |
| EDC control plane, data plane, IdentityHub, IssuerService | `INFO`                                       | console monitor without ANSI colour; Vault "Secret not found" is `DEBUG` and must not ship |
| Keycloak                                                  | `INFO`                                       | login and admin events go to the audit trail, not the console                              |
| Neo4j                                                     | `INFO`, `neo4j.log` to stdout only           | `debug.log` and `query.log` stay inside the container, never on the SMB share              |
| Postgres                                                  | default, `log_min_duration_statement = 1000` | slow queries only                                                                          |
| Vault                                                     | `info`                                       | Vault's own audit device is part of the audit trail                                        |
| Catalog crawler / enricher                                | `info`                                       | one summary line per run, not one per dataset                                              |

## 4. Never log

Patient identifiers (names, birth dates, `patientId`, OMOP `personId`), NLQ question
text, Cypher with literals, FHIR or OMOP payloads, access and refresh tokens, cookies,
`Authorization` headers, Vault tokens, private keys, credentials of any kind. The
collector's `redaction` processor is the second line of defence; the first is not
writing them. A unit test per Node service asserts that a request carrying a token and a
patient id produces log output containing neither.

## 5. Retention by class

| Class                   | Where                                  | Retention | Approx. cost at demo volume |
| ----------------------- | -------------------------------------- | --------- | --------------------------- |
| DEBUG                   | not shipped                            | 0         | 0                           |
| INFO                    | Loki, object storage                   | 30 days   | cents                       |
| WARN, ERROR             | Loki, object storage                   | 90 days   | cents                       |
| Traces                  | Tempo, object storage, tail-sampled    | 14 days   | cents                       |
| Metrics                 | Prometheus / Mimir                     | 90 days   | cents                       |
| Platform system logs    | Log Analytics `ContainerAppSystemLogs` | 30 days   | inside free 5 GB            |
| Audit events (not logs) | Object Lock bucket, ADR-045            | 3 years   | under €1 a month            |

Loki's compactor applies per-stream retention by `level`; the bucket lifecycle rule moves
objects to a cool tier after 14 days and deletes them after 90 as a backstop.

## 6. Volume budget

| Scope                         | Steady-state budget             | Alert                                           |
| ----------------------------- | ------------------------------- | ----------------------------------------------- |
| Any single service            | 20 MB/day                       | over 2x its 7-day average, or over 50 MB in 1 h |
| Whole stack                   | 200 MB/day, 6 GB/month          | over 2x the 7-day average                       |
| Monthly spend, resource group | budget in Azure Cost Management | 50, 80, 100 %                                   |

A volume alert names the service and its top message template, so the first thing the
on-call person sees is the loop, not the bill.

## 7. Rollout

### Phase A: stop the loops (no new infrastructure, biggest saving)

1. **Neo4j:** remove the `neo4j-logs` mount from `mvhd-neo4j` and from
   `scripts/azure/02-data-layer.sh`. **Done 2026-10-02** (revision 179). It needed
   two more fixes first: the memory settings did not fit the 2 GiB container, and
   a stale April revision held the store lock (`docs/gotchas.md`, 2026-10-02).
2. **EDC services:** finish #318 (managed Postgres, ADR-041) so the databases exist, and
   set connection retry with backoff so a missing database produces one error per
   minute, not per second. **#318 done:** the `database ... does not exist` loops
   stopped on 2026-10-02 19:22 UTC. Backoff is still open.
3. **EDC console monitor:** confirm the level is `INFO` and disable ANSI colour codes
   (seen as `[0;37mDEBUG` in `mvhd-controlplane` output). Exact setting to be verified
   against the EDC version in use (ADR-029 pins it). **Verified 2026-10-04:** every
   `jad-*:2026-04-14` image bakes `--log-level=debug` into its start command, and the
   runtime accepts `--log-level=info --no-color` (both strings are in the jar's
   `ExtensionLoader`). The issuer service sets it in its ENTRYPOINT, the other three in
   CMD. `scripts/azure/set-edc-log-level.sh` applies it (ARM PATCH of the template, since
   `az containerapp update --args sh -c ...` rejects `-c`). Not yet run.
4. **Crash-loop alert:** restart count over 3 in 15 minutes on any app raises one alert,
   in `scripts/azure/set-cost-guards.sh`, run by the `cost-guards.yml` workflow (the
   laptop account is Container Apps Contributor only and cannot write alert rules).
5. **Replace the 1 GB cap with a budget** on `rg-mvhd-dev`, alerts at 50/80/100 %.
   Same script and workflow; the cap goes only after the budget exists.
6. **Re-measure after 7 days** with the queries in section 1. Expected: under 200 MB/day.
   Interim 2026-10-04: 91.6 MB billed on 2026-10-03, against 250 to 270 MB a day from
   2026-09-21 to 09-28. Full reading due 2026-10-09; ADR-053's off-hours stop lowers
   it further, so compare per running hour, not per day.
   Half of it was `ContainerAppSystemLogs_CL`: about 19,000 `ProbeFailed` events every
   three hours from two April data-plane revisions, which `retire-stale-revisions.sh`
   (#491) deactivated on 2026-10-04.
7. **Deploy smoke tests on the custom domain.** They signed in on the raw ACA host and
   produced about 115 `State cookie was missing` stack traces per deploy
   (`docs/gotchas.md`, 2026-10-04). Fixed in `deploy-azure.yml`.

### Phase B: structured logs and the collector (ADR-045 plane 1)

8. pino in `ui/` and `services/neo4j-proxy` with `trace_id`, plus the no-PII unit test.
   **Proxy done 2026-10-04:** `services/neo4j-proxy/src/logger.ts` (JSON on stdout,
   `trace_id` from `traceparent`, one line per request naming the route pattern, never
   the URL; `/health` not logged; errors cut to their first line, since a Neo4j error
   quotes its query). `__tests__/logger.test.ts` is the runbook's test, and fails with
   redaction switched off. The 25-line startup banner is one line. **UI open** (75
   `console` calls in 41 files, 36 of them API routes).
9. OpenTelemetry Collector with `recombine` (multi-line join), `filter` (drop DEBUG and
   probe lines), rate limiting of repeats, `redaction`, and tail sampling for traces.
   **Local done 2026-10-04:** `observability/otel-collector.yaml` (contrib 0.161.0)
   discovers containers through the Docker socket, joins stack traces, parses pino JSON
   and EDC levels, drops DEBUG and probe lines, strips ANSI codes, masks bearer tokens
   and JWTs. Verified against the running JAD stack: 0 DEBUG and 0 ANSI lines reach Loki,
   Java stack traces arrive as one entry. Rate limiting of repeats and tail sampling are
   open (no traces flow yet).
10. Loki, Tempo, Prometheus and Grafana in one `mvhd-observability` app, data in a bucket,
    following off-hours scale-down; locally `docker-compose.observability.yml`.
    **Local done 2026-10-04:** `docker-compose.observability.yml` runs the collector and
    `grafana/otel-lgtm:0.35.0` (Loki, Tempo, Prometheus, Grafana in one container, the
    shape ADR-045 plans for Azure) on <http://localhost:3300>. Data in a volume, not
    MinIO, for now. **Azure open.**
11. Move the workflows that query `ContainerAppConsoleLogs_CL` (`edc-*`, `cfm-seed`,
    `neo4j-seed`, `vault-bootstrap-participant-keys`) to LogQL **before** switching
    console logs away from Log Analytics.
12. Switch ACA console logs to the collector; Log Analytics keeps system logs only.

### Phase C: keep it cheap

13. Volume alerts from section 6 as code in `observability/`.
14. Monthly: compare the bill with the budget, and review the top 10 message templates by
    volume. Anything in the top 10 that nobody reads gets demoted to DEBUG or turned into
    a metric.

## 8. Expected outcome

| Stage                              | Volume / month | Cost / month (approx.) | Logs discarded |
| ---------------------------------- | -------------- | ---------------------- | -------------- |
| Today                              | about 19 GB    | €35 to 50              | 14 of 31 days  |
| After phase A, still Log Analytics | under 6 GB     | €0 to 5                | none           |
| After phase B, self-hosted LGTM    | under 6 GB     | €25 to 40 (compute)    | none           |

Phase A alone is the largest saving and costs nothing to run. Phase B costs some of that
back in compute, and buys portability, traces and LogQL (see ADR-045, section Cost).

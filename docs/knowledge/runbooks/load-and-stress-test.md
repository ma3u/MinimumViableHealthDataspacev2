# Runbook: load, stress and scalability test (#519)

How to run k6 against the compose stack or the live hub, watch it on the
Grafana dashboard, find the bottleneck, and keep what is needed for the report.
The tools are the common ones: [k6](https://k6.io) for the load, Prometheus and
Loki in the `grafana/otel-lgtm` container for the numbers and the logs, and the
OpenTelemetry Collector between them (ADR-045).

## Before a run

```bash
brew install k6                                            # once
docker compose -f docker-compose.observability.yml up -d   # Grafana on :3300, Prometheus on :9091
```

For the compose stack nothing else: `run.sh` reads the UI's `NEXTAUTH_SECRET`
from the container to forge one session per persona. For the live hub, export
the deployment's `NEXTAUTH_SECRET` first (`az containerapp secret show`, never
printed). A `stress`, `spike` or `soak` run against the live hub scales the apps
out and costs money: inside office hours (ADR-053), announced, and `run.sh` asks
once before it starts.

## Run

```bash
load-tests/run.sh smoke local            # one user, one minute: does the run work at all
load-tests/run.sh load local             # 50 users, 15 minutes: the expected peak
load-tests/run.sh stress azure           # 50 → 400 users, aborts when errors pass 1 % or API p95 passes 1 s
load-tests/run.sh spike azure            # 10 → 200 users in 10 seconds
load-tests/run.sh soak azure             # 50 users, 2 hours
load-tests/run.sh audited local          # NLQ only, 1 → 20 parallel: the audit chain (hypothesis 2)
load-tests/run.sh contracts local        # contracts and transfers only, 2 → 10 users: the dsp chain (#571)
load-tests/run.sh proxy local            # the proxy without the UI in front (hypothesis 1)
load-tests/run.sh signin local           # real Keycloak sign-ins, 5 → 50 a minute (hypotheses 4 and 6)
```

`TIME_SCALE=0.1` shortens every stage to a tenth for a dry run. Each run has a
`testid` (`<date>-<scenario>-<target>`, or `TESTID=...`): k6 tags every metric
with it, every request carries it as `X-Load-Test`, and the proxy logs it as
`load_test`. The summary goes to `load-tests/results/<testid>.json`.

### Contracts and transfers (#571)

Browsing alone writes nothing to the contract and transfer chain, so the
dashboards **EHDS audit trail** and **EDC contracts and transfers** stayed empty under
load. Every third visit of a researcher in `browse` (and every iteration of
`contracts`) now runs the data user's DSP flow, as the negotiate and transfer
pages do: PharmaCo reads AlphaKlinik's catalogue (`GET /api/negotiations
(catalogue)`), negotiates the first offer (`POST /api/negotiations`, 201), transfers
under its data permit (`POST /api/transfers`, 201), and one time in four asks for a
dataset no permit covers (`POST /api/transfers (no permit)`, **403 expected**,
Regulation (EU) 2025/327 Art. 61(1)).

Each step is on the `dsp` chain, and **every record a run writes carries the run's id**
(`loadTest`, from `X-Load-Test`), on the query chain too. The chains cannot be
pruned, so this is how an auditor tells a load test from real use: the column
_Load test run_ in the record tables. Where the connector cannot serve the catalogue
(Azure today, #25), the hub falls back to its demo offers and the records say _Demo_;
the flow and its audit writes are the same.

## Run inside Azure (metrics on grafana.ehds.mabu.red)

```bash
scripts/azure/run-load-test.sh smoke                 # or load | stress | spike | soak | audited | contracts | proxy | signin
ABORT_ON=failures scripts/azure/run-load-test.sh stress
```

The run is the Container Apps job `mvhd-load-test` (`load-tests/azure`): k6 inside
`mvhd-env`, writing to `mvhd-observability`'s Prometheus (`:9090`, internal), so the k6
rows and the server-side rows of the dashboard both show on
<https://grafana.ehds.mabu.red>. The script forges the sessions (8 h), hands them to the
job as a secret, starts it and waits. Jobs need the PIM role `rol-ssg-prd-project_owner`
active: Container Apps Contributor has no `Microsoft.App/jobs` action.

## Watch

The dashboard **Load and stress test**, filtered by the run:
<http://localhost:3300/d/mvhd-load-test/load-and-stress-test?var-testid=TESTID>
(`run.sh` prints the link).

| Row                    | What it answers                                                                                                         |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Load                   | Users, requests a second, failed share, 429s, checks passed. 429 is the rate limit, 5xx the hub, 0 no answer.           |
| Response time (client) | p95 by kind: website pages, API, NLQ, sign-in, against the SLOs (2 s, 1 s, 3 s); p95 per endpoint, sorted table.        |
| Server side (proxy)    | The same run from the proxy's log lines: requests and p95 by route, 429 and 5xx, audit records per transaction, errors. |
| Containers             | CPU, memory and network per container of the compose stack: which one saturates first.                                  |
| Azure                  | The commands below, for the live hub.                                                                                   |

The difference between the client-side and the proxy-side p95 of the same route
is the UI and the network.

## Follow the logs for errors

- Grafana, Explore, Loki:
  `{service_name=~".*(neo4j-proxy|ui).*"} |~ "(?i)\\berror\\b|exception|ECONN"` and,
  for one run, `{service_name=~".*neo4j-proxy.*"} | json | load_test="TESTID" | status >= 500`.
- Compose: `docker compose -f docker-compose.yml -f docker-compose.jad.yml logs -f --tail 20 ui neo4j-proxy | grep -iE "error|exception"`.
- Live hub, one app: `az containerapp logs show -n mvhd-ui -g rg-mvhd-dev --follow --tail 20 | grep -iE "error|exception|ECONN"`.
- Live hub, after the run, Log Analytics (the same `load_test` field):

  ```kusto
  ContainerAppConsoleLogs_CL
  | where ContainerAppName_s == "mvhd-neo4j-proxy" and TimeGenerated between (datetime(START) .. datetime(END))
  | extend j = parse_json(Log_s)
  | where tostring(j.load_test) == "TESTID"
  | summarize requests = count(), p95_ms = percentile(toreal(j.duration_ms), 95),
              errors = countif(toint(j.status) >= 500), limited = countif(toint(j.status) == 429)
      by route = tostring(j.route), bin(TimeGenerated, 1m)
  ```

## After a live run

```bash
scripts/azure/export-load-metrics.sh TESTID 2026-10-06T08:00:00Z 2026-10-06T08:20:00Z
```

writes replicas, CPU, memory, requests and restarts per app and the Flexible
Server's CPU, burst credits and connections, one row a minute, to
`load-tests/results/TESTID/`. With the k6 summary and the Grafana screenshots that
is the report: `docs/loadtest/<date>-<scenario>.md`.

## Reading the result

- **429s, and the failures are all 429:** a rate limit, not capacity. The proxy
  counts per user (`X-Caller`, a hash of the session's user id: 100 requests and
  20 analytical queries a minute), per participant for callers that name no user
  (ten times that), each per proxy replica. `RATE_LIMIT_MAX`,
  `RATE_LIMIT_HEAVY_MAX`, `RATE_LIMIT_PARTICIPANT_MAX` and
  `RATE_LIMIT_PARTICIPANT_HEAVY_MAX` on `mvhd-neo4j-proxy` change the numbers.
  The forged sessions are ten users per persona for the same reason.
- **NLQ p95 climbs with parallel users while the proxy's p95 by route does not:**
  the audit chain. "Audit records per transaction" above 1 means the batch
  writer is taking the load; at 1 every query waits for its own transaction.
- **A container at 100 % CPU:** that is the ceiling. Neo4j Community has no
  cluster mode; it only gets a bigger machine. Keycloak and the EDC services can
  run more than one replica (Keycloak needs its cache cluster, EDC leases its
  state machines in Postgres).
- **Postgres CPU credits falling:** the B1ms burst budget. Everything that shares
  the server slows down together; the next size up, or a General Purpose SKU.
- **Replicas climbing on `mvhd-ui` or `mvhd-neo4j-proxy`:** ACA's default HTTP
  rule (10 concurrent requests) is scaling them. Whether that helps shows in the
  p95 after the new replica is up.

## Hypotheses and findings

| #   | Hypothesis (from the code)                       | Finding                                                                                                                                                                                                  |
| --- | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | The proxy's rate limits are shared by everyone   | Per IP: one bucket for the platform (86 of 202 queries 429 on compose). Per participant (#534): one organisation's 20 users, 4,071 of 4,871 429 live. Per user (#536): 50 users, 16,950 requests, no 429 |
| 2   | Audited queries run one transaction at a time    | Not a ceiling: 434 ms p95 at about 16 audited queries a second live, batch writer deployed (#534)                                                                                                        |
| 3   | The UI's in-memory limiter scales with replicas  | Known; left as is (3× at 3 replicas)                                                                                                                                                                     |
| 4   | Postgres runs out of burst credit                | A first sign: 36 of the B1ms burst credits left at 08:45 Berlin, before any test load. `signin` and `soak` to measure                                                                                    |
| 5   | Neo4j is the ceiling for graph and patient pages | Yes, by memory: 97 % of 2 GiB and 45 % CPU at 50 users; `/api/graph` p95 10 s, `/api/compliance` 1.8 s, `/api/overview` 1.2 s, everything else under 0.7 s (2026-10-05 baseline, #540)                   |
| 6   | Sign-in is a singleton                           | To measure with `signin`                                                                                                                                                                                 |

Related: [ADR-045](../../ADRs/ADR-045-observability-and-regulatory-audit-trail.md),
[query audit chain](query-audit-chain.md), [`observability/README.md`](../../../observability/README.md).

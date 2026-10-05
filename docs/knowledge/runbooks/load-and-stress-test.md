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
load-tests/run.sh proxy local            # the proxy without the UI in front (hypothesis 1)
load-tests/run.sh signin local           # real Keycloak sign-ins, 5 → 50 a minute (hypotheses 4 and 6)
```

`TIME_SCALE=0.1` shortens every stage to a tenth for a dry run. Each run has a
`testid` (`<date>-<scenario>-<target>`, or `TESTID=...`): k6 tags every metric
with it, every request carries it as `X-Load-Test`, and the proxy logs it as
`load_test`. The summary goes to `load-tests/results/<testid>.json`.

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

- **429s, and the failures are all 429:** a rate limit, not capacity. Since
  #519 the proxy counts per participant (`X-Participant`), 100 requests and 20
  analytical queries a minute each, per proxy replica. Raise `RATE_LIMIT_MAX` or
  `RATE_LIMIT_HEAVY_MAX` on `mvhd-neo4j-proxy` if the limit is the finding.
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

| #   | Hypothesis (from the code)                       | Finding                                                                                                                                    |
| --- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | The proxy's rate limits are shared by everyone   | Confirmed 2026-10-05 on compose, proxy from `main`: 20 parallel NLQ users, 86 of 202 queries answered 429 (42.6 %). Fixed: per participant |
| 2   | Audited queries run one transaction at a time    | Fixed: batched writes. To measure after deploy with `audited`                                                                              |
| 3   | The UI's in-memory limiter scales with replicas  | Known; left as is (3× at 3 replicas)                                                                                                       |
| 4   | Postgres runs out of burst credit                | To measure with `signin` and `soak` on the live hub                                                                                        |
| 5   | Neo4j is the ceiling for graph and patient pages | To measure with `load` and `stress`                                                                                                        |
| 6   | Sign-in is a singleton                           | To measure with `signin`                                                                                                                   |

Related: [ADR-045](../../ADRs/ADR-045-observability-and-regulatory-audit-trail.md),
[query audit chain](query-audit-chain.md), [`observability/README.md`](../../../observability/README.md).

# Observability and audit dashboards

ADR-045 ([plane 1](../docs/ADRs/ADR-045-observability-and-regulatory-audit-trail.md)
operations, plane 2 the regulatory audit trail), issue #418. Runs locally beside any of
the compose stacks; the Azure `mvhd-observability` app is not built yet.

```bash
docker compose -f docker-compose.observability.yml up -d
```

| What                        | Where                                                              | Login                                                                    |
| --------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| Grafana                     | <http://localhost:3300>                                            | `admin` / `admin` (Grafana asks to change it on first login; local only) |
| EHDS audit trail            | <http://localhost:3300/d/mvhd-ehds-audit/ehds-audit-trail>         | same                                                                     |
| EDC contracts and transfers | <http://localhost:3300/d/mvhd-edc-dsp/edc-contracts-and-transfers> | same                                                                     |
| Load and stress test        | <http://localhost:3300/d/mvhd-load-test/load-and-stress-test>      | same                                                                     |
| Prometheus remote write     | `localhost:9091/api/v1/write` (k6, `load-tests/run.sh`)            | none                                                                     |
| OTLP in (collector)         | `localhost:4317` gRPC, `localhost:4318` HTTP                       | none                                                                     |
| Collector health            | <http://localhost:13133>                                           | none                                                                     |

The dashboards read the neo4j-proxy at `http://host.docker.internal:9090`, the port the
compose stack publishes. Point them elsewhere with `MVHD_AUDIT_URL`, and set
`MVHD_AUDIT_TOKEN` when the proxy runs with `AUDIT_CALLBACK_TOKEN`.

## The dashboards

**EHDS audit trail.** Is the evidence intact: the proxy re-verifies both hash chains
(queries; contract negotiations and transfers) on every refresh, hash by hash. How many
records, how many refused, and whether an audit write failed (each failure is a request
that was not carried out). The newest records, from the chain.

**EDC contracts and transfers.** Every DSP negotiation and transfer by state (requested,
agreed, finalized, started, completed, refused for want of a permit, terminated), the
ones that did not complete with their reasons, and the connector services' errors and log
volume.

**Load and stress test** (#519). What to watch while k6 runs (`load-tests/run.sh`): users,
requests a second, failures and 429s; the client-side p95 by kind (website pages, API, NLQ,
sign-in) and per endpoint; the proxy's own view of the same run from its log lines, filtered
by the run's `load_test` id; which container saturates first (Docker stats); and the commands
that pull the live hub's replicas and CPU afterwards. Runbook:
[`docs/knowledge/runbooks/load-and-stress-test.md`](../docs/knowledge/runbooks/load-and-stress-test.md).

## Where the numbers come from

Every audit number is counted from the hash chain itself, through the proxy's read-only
endpoints (`/audit/chains/{query,dsp}/verify|events|stats`) and the Infinity datasource.
Loki supplies only what leaves no record: failed audit writes, and connector errors.

The load test numbers come from k6 itself: it writes every metric to the LGTM container's
Prometheus (remote write, native histograms, tagged with the run's `testid`), and the
collector's `docker_stats` receiver adds each container's CPU, memory and network.

The proxy's `audit recorded` log lines are not used for counting. Locally the Docker
observer restarts the collector's receivers on every container health-check event, and
lines around a restart can be missed; storing read offsets made it worse (duplicates and
lock timeouts). Container logs are an operational view, the chain is the evidence.

## Files

| File                          | Purpose                                                                        |
| ----------------------------- | ------------------------------------------------------------------------------ |
| `otel-collector.yaml`         | Collector: container logs and stats, OTLP, filtering, redaction, tail sampling |
| `grafana/build-dashboards.py` | Builds the dashboard JSON; edit this, not the JSON                             |
| `grafana/dashboards/*.json`   | Generated dashboards, provisioned read-only                                    |
| `grafana/provisioning/`       | Datasource (Infinity → proxy) and dashboard provider                           |

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

## Where the numbers come from

Every audit number is counted from the hash chain itself, through the proxy's read-only
endpoints (`/audit/chains/{query,dsp}/verify|events|stats`) and the Infinity datasource.
Loki supplies only what leaves no record: failed audit writes, and connector errors.

The proxy's `audit recorded` log lines are not used for counting. Locally the Docker
observer restarts the collector's receivers on every container health-check event, and
lines around a restart can be missed; storing read offsets made it worse (duplicates and
lock timeouts). Container logs are an operational view, the chain is the evidence.

## Files

| File                          | Purpose                                                              |
| ----------------------------- | -------------------------------------------------------------------- |
| `otel-collector.yaml`         | Collector: container logs, OTLP, filtering, redaction, tail sampling |
| `grafana/build-dashboards.py` | Builds the dashboard JSON; edit this, not the JSON                   |
| `grafana/dashboards/*.json`   | Generated dashboards, provisioned read-only                          |
| `grafana/provisioning/`       | Datasource (Infinity → proxy) and dashboard provider                 |

# catalog-enricher

Consumes raw DSP `dcat:Catalog` JSON-LD envelopes from NATS subject
`dataspace.catalog.raw`, maps them to HealthDCAT-AP per
[ADR-003](../../docs/ADRs/ADR-003-healthdcat-ap-alignment.md), and writes
idempotent `MERGE` Cypher to Neo4j so the NLQ resolver can answer
cross-participant dataset questions.

Role and boundaries are defined in
[ADR-020](../../docs/ADRs/ADR-020-cross-participant-dataset-discovery.md) —
this service is **not** a crawler, **not** a query path, **not** a policy
engine.

## Quick start — local

```bash
cd services/catalog-enricher
pip install -e '.[dev]'
pytest

# run against a local NATS + Neo4j (expects docker compose stack)
NATS_URL=nats://localhost:4222 NEO4J_URI=bolt://localhost:7687 python -m src.main
```

Metrics on `http://localhost:9464/metrics`.

## Environment

| Variable         | Default                  | Notes                          |
| ---------------- | ------------------------ | ------------------------------ |
| `NATS_URL`       | `nats://mvhd-nats:4222`  | ACA short-name per ADR-018     |
| `NATS_SUBJECT`   | `dataspace.catalog.raw`  | Contract-fixed by ADR-020      |
| `NATS_CONSUMER`  | `enricher`               | Durable consumer name          |
| `NEO4J_URI`      | `bolt://mvhd-neo4j:7687` | Short service name (ADR-018)   |
| `NEO4J_USER`     | `neo4j`                  |                                |
| `NEO4J_PASSWORD` | `healthdataspace`        | Matches `scripts/azure/env.sh` |
| `METRICS_PORT`   | `9464`                   |                                |
| `LOG_LEVEL`      | `INFO`                   |                                |

## Observability

Counters (Prometheus):

- `enricher_messages_total{outcome="ok|schema_error|neo4j_error"}`
- `enricher_unknown_theme_total{publisher="<did>"}`
- `enricher_merge_seconds` (histogram)

Audit: one `:CatalogEnrichmentEvent` node per processed envelope.

## Deploy to Azure

```bash
./scripts/azure/12-catalog-enricher.sh
```

Or via GitHub Actions: `FHIR / Catalog Enricher` workflow
(`.github/workflows/catalog-enricher.yml`). The CI path is recommended
because personal `az` CLI loses `Microsoft.App/apps/write` after the
PIM role activation expires (~1 h) — see memory
`project_aca_job_write_via_ci`.

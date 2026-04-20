# catalog-crawler

Periodically fetches DSP `dcat:Catalog` documents from every dataspace
participant and publishes each response as a `CrawlEnvelope` on NATS
subject `dataspace.catalog.raw`. The
[catalog-enricher](../catalog-enricher/) service consumes that subject
and materialises federated `:HealthDataset` nodes in Neo4j.

Together these two services close the loop started in
[ADR-020](../../docs/ADRs/ADR-020-cross-participant-dataset-discovery.md) /
[issue #8](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/8).

## Implementation note — Python, not Java EDC SDK

ADR-020 originally suggested
`org.eclipse.edc:federated-catalog-core:0.16.0`. The crawler's actual
surface — POST empty QuerySpec to `{base}/catalog/request`, parse JSON-LD,
publish — is thin enough that the JVM + EDC SDK is overkill. Python keeps
the deploy pipeline aligned with the enricher (same image template, same
ACA rules) and iterates faster. DID signing is deferred until a remote
participant demands it (ADR-020 open question 3).

## Quick start — local

```bash
cd services/catalog-crawler
pip install -e '.[dev]'
pytest

# one-shot cycle against local NATS + Neo4j
RUN_ONCE=true python -m src.main
```

Metrics on `http://localhost:9465/metrics`.

## Environment

| Variable            | Default                         | Notes                                  |
| ------------------- | ------------------------------- | -------------------------------------- |
| `NATS_URL`          | `nats://mvhd-nats:4222`         | ACA short-name per ADR-018             |
| `NATS_SUBJECT`      | `dataspace.catalog.raw`         | Contract fixed by ADR-020              |
| `NEO4J_URI`         | `bolt://mvhd-neo4j:7687`        | Short service name (ADR-018)           |
| `NEO4J_USER`        | `neo4j`                         |                                        |
| `NEO4J_PASSWORD`    | `healthdataspace`               |                                        |
| `CRAWLER_DID`       | `did:web:ehds.mabu.red:crawler` | Sent as `X-Crawler-Did` header         |
| `REQUEST_TIMEOUT_S` | `10`                            | Per-participant HTTP timeout           |
| `CRAWL_INTERVAL_S`  | `300`                           | 5 min per ADR-020                      |
| `RUN_ONCE`          | `false`                         | `true` on the ACA Schedule-trigger Job |
| `METRICS_PORT`      | `9465`                          |                                        |
| `LOG_LEVEL`         | `INFO`                          |                                        |

## Target list

The crawler reads its targets directly from Neo4j every cycle:

```cypher
MATCH (p:Participant)
WHERE p.source IN ['dcp','business-wallet','private-wallet','seed']
  AND p.dspCatalogUrl IS NOT NULL
  AND coalesce(p.crawlerEnabled, true) = true
RETURN p
```

Operators can take a participant out of rotation with a single `SET
p.crawlerEnabled = false` — no restart required.

## NATS contract

Each successful fetch publishes exactly one message:

```json
{
  "participantDid": "did:web:alpha-klinik.de:participant",
  "fetchedAt": "2026-04-20T06:00:00+00:00",
  "catalog": {
    /* dcat:Catalog JSON-LD */
  }
}
```

The enricher's `CrawlEnvelope` model in
`services/catalog-enricher/src/models.py` must stay byte-compatible with
the crawler's.

## Observability

- `crawler_requests_total{participant,outcome}` — counter, one of
  `ok | http_error | timeout | invalid_json`
- `crawler_request_seconds{participant}` — histogram
- `crawler_last_success_ts{participant}` — monotonic counter to spot
  targets that stopped answering

## Deploy to Azure

```bash
./scripts/azure/10-catalog-crawler.sh
```

Or via GitHub Actions: the `Catalog Crawler Deploy` workflow. Same CI
service principal we use for every other ACA write, same reasons as
ADR-018 / memory `project_aca_job_write_via_ci`.

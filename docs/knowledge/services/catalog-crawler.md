---
type: service
title: catalog-crawler — federated DSP catalog fetcher
description: ACA job that crawls participants' DSP catalogs every 5 minutes and publishes raw JSON-LD to NATS.
resource: services/catalog-crawler/ (Python), ACA job mvhd-catalog-crawler
tags: [federation, crawler, issue-8, aca-job]
generated: { by: claude-code/fable-5, at: 2026-07-15T15:30:23Z }
verified: { by: human:ma3u, at: 2026-07-15T15:30:23Z }
status: stable
---

Reads crawl targets from Neo4j (`:Participant` with `dspCatalogUrl` +
`crawlerEnabled` — see [participant-directory](../datamodels/participant-directory.md)),
publishes to NATS subject `dataspace.catalog.raw`, consumed by
[catalog-enricher](catalog-enricher.md). Deploy workflow:
`.github/workflows/catalog-crawler.yml`. Mapping note: ADR-020 planned Java 21 +
federated-catalog-core; the implementation is Python (`pyproject.toml`) — same
contract, different runtime. Flow diagram: `docs/diagrams/federation-sequence.mmd`.

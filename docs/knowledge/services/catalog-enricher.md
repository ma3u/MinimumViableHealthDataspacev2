---
type: service
title: catalog-enricher — DSP→HealthDCAT-AP mapper
description: NATS durable consumer that MERGEs crawled catalogs into Neo4j L2 as federated datasets.
resource: services/catalog-enricher/ (Python), ACA app mvhd-catalog-enricher
tags: [federation, enricher, issue-8]
generated: { by: claude-code/fable-5, at: 2026-07-15T15:30:23Z }
verified: { by: human:ma3u, at: 2026-07-15T15:30:23Z }
status: stable
---

Durable consumer `enricher` on `dataspace.catalog.raw`; writes idempotent
`MERGE`-only Cypher: `:HealthDataset {source:'federated', publisherDid,
lastSeenAt}`, `:OdrlPolicy` verbatim, `:CatalogEnrichmentEvent` audit
(source: Phase 26c spec in `docs/planning/cross-cutting-and-architecture.md`).
Deploy: `scripts/azure/12-catalog-enricher.sh` —
`UNKNOWN — script referenced by the Phase 26c plan; verify it exists before citing.`

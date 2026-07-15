---
type: service
title: Neo4j 5 Community — knowledge graph
description: Single graph database holding all 5 layers; 127 synthetic patients, 5300+ nodes.
resource: docker-compose.yml (health-dataspace-neo4j), ACA app mvhd-neo4j
tags: [neo4j, graph, L1-L5]
timestamp: 2026-07-15T00:00:00Z
---

Ports 7687 (bolt) / 7474 (browser); credentials `neo4j/healthdataspace` (local
dev only — source: `.claude/rules/api-conventions.md`). Schema in
`neo4j/init-schema.cypher` — idempotent, `MERGE` + `IF NOT EXISTS` only, safe to
re-run. Layers: [graph-5layer](../datamodels/graph-5layer.md). Consumers:
[neo4j-proxy](neo4j-proxy.md), [ui](ui.md) API routes via `ui/src/lib/neo4j.ts`.
Gotcha: vector indexes are single-label only (docs/gotchas.md 2026-04).

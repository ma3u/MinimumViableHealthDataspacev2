---
type: datamodel
title: Participant directory fields (Phase 26a)
description: Crawl-target and wallet metadata on :Participant nodes driving federated discovery.
resource: neo4j/participant-source-init.cypher, ui/src/app/api/admin/participants/route.ts
tags: [federation, participant, issue-8]
generated: { by: claude-code/fable-5, at: 2026-07-15T15:30:23Z }
verified: { by: human:ma3u, at: 2026-07-15T15:30:23Z }
status: stable
---

On `:Participant`: `source` (`seed | dcp | business-wallet | private-wallet`),
`walletType` (`business | private`), `country` (ISO-3166-1 alpha-2),
`dspCatalogUrl` (null = not crawlable), `crawlerEnabled`, `onboardedAt`.
Written by: seed cypher, `/api/admin/participants` (EDC_ADMIN CRUD;
seed-sourced entries are delete-protected), and the neo4j-proxy DCP discovery
loop. Read by: [catalog-crawler](../services/catalog-crawler.md) each tick.

---
type: service
title: NATS — async event bus
description: Message bus carrying crawled catalogs and dataspace events.
resource: docker-compose.jad.yml, ACA app mvhd-nats, port 4222
tags: [nats, messaging]
generated: { by: claude-code/fable-5, at: 2026-07-15T15:30:23Z }
verified: { by: human:ma3u, at: 2026-07-15T15:30:23Z }
status: stable
---

Key subject: `dataspace.catalog.raw` ([catalog-crawler](catalog-crawler.md) →
[catalog-enricher](catalog-enricher.md)). ACA gotcha: needs `--transport tcp` +
`--exposed-port` (docs/gotchas.md 2026-04-21).

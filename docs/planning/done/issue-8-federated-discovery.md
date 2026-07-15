---
title: Cross-Participant Dataset Discovery (issue #8, Phase 26)
status: done
owner: ma3u
updated: 2026-07-15
adr: ../../ADRs/ADR-020-cross-participant-dataset-discovery.md
knowledge: ../../knowledge/runbooks/federated-discovery.md
---

Federated discovery pipeline: catalog-crawler (ACA job, 5-min) → NATS →
catalog-enricher → Neo4j L2 `:HealthDataset {source:'federated'}`; dynamic
participant directory (`/admin/participants` + DCP discovery loop); federated
NLQ templates; dual-side k-anonymity + `:QueryAuditEvent` provenance;
Playwright J730–J749. Merged in PR #95, issue closed 2026-07-15.

Deferred remainder tracked in [phase-26g-deferred](../future/phase-26g-deferred.md).
Sources: issue #8 closing comment, `docs/architecture/federation.md`,
`docs/planning/cross-cutting-and-architecture.md` (Phase 26).

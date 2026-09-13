---
type: service
title: neo4j-proxy — Express FHIR/OMOP/NLQ bridge
description: TypeScript Express service exposing FHIR, OMOP, catalog, NLQ (4-tier), federated query, and Trust Center endpoints over Neo4j.
resource: services/neo4j-proxy/src/index.ts, ACA app mvhd-neo4j-proxy
tags: [express, nlq, federated, port-9090]
generated: { by: claude-code/fable-5, at: 2026-07-15T15:30:23Z }
verified: { by: human:ma3u, at: 2026-07-15T15:30:23Z }
status: stable
---

Port 9090. NLQ resolves in 4 tiers: template → fulltext → GraphRAG → LLM
(source: ADR-020 baseline table). Federated `/federated/query` enforces
dual-side k-anonymity + caller ODRL — rules in `docs/architecture/federation.md`.
DCP discovery loop (`DCP_DISCOVERY_URL`) upserts participants — see
[participant-directory](../datamodels/participant-directory.md).
Endpoints: [neo4j-proxy-endpoints](../apis/neo4j-proxy-endpoints.md).
Tests: `services/neo4j-proxy/__tests__/` (Vitest + supertest, mocked driver).

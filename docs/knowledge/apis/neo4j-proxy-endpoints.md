---
type: api
title: neo4j-proxy endpoints
description: The Express bridge's public surface — FHIR, OMOP, catalog, NLQ, federated, Trust Center.
resource: services/neo4j-proxy/src/index.ts (startup log lists all endpoints)
tags: [express, fhir, omop, nlq, federated]
timestamp: 2026-07-15T00:00:00Z
---

Core (from `.claude/rules/api-conventions.md` + startup log):
`GET /health` · `GET /fhir/Patient` · `GET /fhir/Patient/:id/$everything` ·
`POST /omop/cohort` · `GET /catalog/datasets` · `POST /nlq` (4-tier resolver) ·
`GET /nlq/templates` · `POST /federated/query` · `GET /federated/stats` ·
`POST /trust-center/resolve` (HDAB only) · `GET /tck`.

`/federated/query` response contract (Phase 26e): `{results, sources, totalRows,
filtered, speCount, minKApplied, aggregateSuppressed, suppressionReason}` —
suppression rules in `docs/architecture/federation.md`. Rate limits: 100 req/min
per IP; heavier limiter on federated/NLQ (source: ADR-020 safety-rails list).

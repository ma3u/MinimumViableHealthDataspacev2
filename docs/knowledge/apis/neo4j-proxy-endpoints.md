---
type: api
title: neo4j-proxy endpoints
description: The Express bridge's public surface — FHIR, OMOP, catalog, NLQ, federated, Trust Center.
resource: services/neo4j-proxy/src/routes/ (one module per capability; index.ts startup log lists all endpoints)
tags: [express, fhir, omop, nlq, federated]
generated: { by: claude-code/fable-5, at: 2026-07-15T15:30:23Z }
verified: { by: human:ma3u, at: 2026-07-15T15:30:23Z }
status: stable
---

Core (from `.claude/rules/api-conventions.md` + startup log):
`GET /health` · `GET /fhir/Patient` · `GET /fhir/Patient/:id/$everything` ·
`POST /omop/cohort` · `GET /catalog/datasets` · `POST /nlq` (4-tier resolver) ·
`GET /nlq/templates` · `POST /federated/query` · `GET /federated/stats` ·
`POST /trust-center/resolve` (HDAB only) · `GET /tck`.

`POST /trust-center/resolve` and `DELETE /trust-center/revoke/:rpsn` take a Keycloak
access token (`Authorization: Bearer`) whose `realm_access.roles` holds `HDAB_AUTHORITY`
or `TRUST_CENTER_OPERATOR`: 401 `{error: "Unauthorized"}` without a valid one, 403
`{error: "Forbidden"}` with another role (#1029, `services/neo4j-proxy/src/realm-auth.ts`,
keys from `KEYCLOAK_ISSUER`, issuer `KEYCLOAK_PUBLIC_URL` or `KEYCLOAK_ISSUER`). An
unhandled error answers 500 `{error: "Internal Server Error"}`; the message goes to the
log only.

`/federated/query` response contract (Phase 26e): `{results, sources, totalRows,
filtered, speCount, minKApplied, aggregateSuppressed, suppressionReason}` —
suppression rules in `docs/architecture/federation.md`. `/nlq` adds
`minKApplied, filtered, aggregateSuppressed, suppressionReason` to its answer
and applies the same rules, with or without `federated: true`. Rate limits: 100 req/min
per IP; heavier limiter on federated/NLQ (source: ADR-020 safety-rails list).

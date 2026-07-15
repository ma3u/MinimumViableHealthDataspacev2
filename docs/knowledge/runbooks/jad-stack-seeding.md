---
type: runbook
title: Full JAD stack + seed phases
description: Start all 19 services and seed them in the mandatory order.
resource: CLAUDE.md (Commands), jad/seed-all.sh, scripts/bootstrap-jad.sh
tags: [runbook, jad, docker]
timestamp: 2026-07-15T00:00:00Z
---

Needs 8 GB Docker RAM.

1. `docker compose -f docker-compose.yml -f docker-compose.jad.yml up -d`
2. `./scripts/bootstrap-jad.sh` — MUST re-run after every `docker compose down`
   ([vault](../services/vault.md) is in-memory).
3. `./jad/seed-all.sh` — phases 1–7 strictly sequential; FHIR (3) before
   OMOP (4). Resume with `--from N`.
4. UI against this stack runs on port 3003; E2E:
   `PLAYWRIGHT_BASE_URL=http://localhost:3003 npm run test:e2e`.

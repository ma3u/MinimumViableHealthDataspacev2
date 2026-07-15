---
type: service
title: Vault — secrets store (in-memory)
description: Holds participant keys and JWT config for the JAD stack; loses everything on restart.
resource: docker-compose.jad.yml, ACA app mvhd-vault, port 8200
tags: [vault, secrets]
timestamp: 2026-07-15T00:00:00Z
---

**In-memory only** — every `docker compose down` wipes it; re-run
`./scripts/bootstrap-jad.sh` (idempotent). Top gotcha #1 in CLAUDE.md.
JWT validation wired to Keycloak JWKS in `scripts/azure/06-post-deploy.sh`.

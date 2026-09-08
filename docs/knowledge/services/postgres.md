---
type: service
title: PostgreSQL — JAD service metadata
description: Relational store for EDC/CFM service state (7 databases).
resource: docker-compose.jad.yml, ACA app mvhd-postgres, port 5432
tags: [postgres, edc]
generated: { by: claude-code/fable-5, at: 2026-07-15T15:30:23Z }
verified: { by: human:ma3u, at: 2026-07-15T15:30:23Z }
status: stable
---

Databases: keycloak, controlplane, dataplane, dataplane_omop, identityhub,
issuerservice, cfm (source: `scripts/azure/env.sh` PG_DATABASES; non-keycloak
DBs created by `06-post-deploy.sh`). Split from Neo4j per ADR-001.

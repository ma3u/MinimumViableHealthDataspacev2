---
type: service
title: PostgreSQL — JAD service metadata
description: Relational store for EDC/CFM service state (7 databases).
resource: docker-compose.jad.yml, ACA app mvhd-postgres, port 5432
tags: [postgres, edc]
timestamp: 2026-07-15T00:00:00Z
---

Databases: keycloak, controlplane, dataplane, dataplane_omop, identityhub,
issuerservice, cfm (source: `scripts/azure/env.sh` PG_DATABASES; non-keycloak
DBs created by `06-post-deploy.sh`). Split from Neo4j per ADR-001.

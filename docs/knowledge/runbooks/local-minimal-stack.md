---
type: runbook
title: Start the minimal local stack (Neo4j + UI)
description: Smallest working environment for UI and graph work.
resource: CLAUDE.md (Commands), docker-compose.yml
tags: [runbook, local-dev]
timestamp: 2026-07-15T00:00:00Z
---

1. `docker compose up -d`
2. Seed schema + data (idempotent, re-runnable):
   `cat neo4j/init-schema.cypher | docker exec -i health-dataspace-neo4j cypher-shell -u neo4j -p healthdataspace`
   then the same with `neo4j/insert-synthetic-schema-data.cypher`.
3. `cd ui && npm install && npm run dev` → http://localhost:3000
4. Keycloak is NOT part of this stack — login-dependent pages need the JAD
   stack ([jad-stack-seeding](jad-stack-seeding.md)) or the static persona mode.

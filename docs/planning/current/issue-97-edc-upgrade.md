---
title: "Dependency refresh: EDC v0.18.0, Metaform JAD/CFM, OSS baseline (issue #97)"
status: current
owner: ma3u
updated: 2026-07-15
adr: ../../ADRs/ADR-005-jad-cfm-source-builds.md
---

Three tiers: (1) Eclipse EDC — Connector + IdentityHub two minors behind
(v0.16.0 per ADR-020; upstream v0.18.0, 2026-06-30); (2) Metaform sources our
`jad-*`/`cfm-*` images are built from (`jad`, `cfm-edc`, `cfm-fulcrum`) — rebuild
in lockstep with EDC (BOM coupling); (3) OSS baseline — Postgres 16-vs-17.7
local/Azure skew, Node 20 past LTS EOL → 22, unpinned Keycloak/Vault/NATS
`:latest` tags, Neo4j 2025.x LTS spike. Phases A–D in issue #97. **Phase A done 2026-07-15** (ADR-029): inventory, tag/digest pins in compose + azure env, Postgres skew documented.

---
title: Upgrade Eclipse EDC components to v0.18.0 + pin image versions (issue #97)
status: future
owner: ma3u
updated: 2026-07-15
adr: ../../ADRs/ADR-005-jad-cfm-source-builds.md
---

Connector + IdentityHub are two minors behind (v0.16.0 in use per ADR-020;
upstream v0.18.0, 2026-06-30) and every JAD/CFM image floats on `:latest`.
Plan: inventory & pin → rebuild from v0.18.0 → TCK/DCP/EHDS suites + live
Playwright → CI rollout. Risks: management-API path drift, CFM agents built
against the EDC BOM. Source: issue #97.

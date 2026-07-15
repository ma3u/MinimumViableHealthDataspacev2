---
title: Deploy MVHD to Azure — ACA + managed services (issue #10)
status: done
owner: ma3u
updated: 2026-07-15
adr: ../../ADRs/ADR-012-azure-container-apps.md
knowledge: ../../knowledge/runbooks/azure-deploy.md
---

15 Container Apps + ACA jobs in `rg-mvhd-dev`, custom domains
`ehds.mabu.red` / `auth.ehds.mabu.red` (ADR-025), off-hours scale-down chain
ADR-016 → ADR-023 → ADR-027. Deploys ride `.github/workflows/deploy-azure.yml`
on push to main. Source: issue table in `docs/planning-health-dataspace-v2.md`
(✅ Closed, v1.2.0), `scripts/azure/*.sh`.

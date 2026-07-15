---
type: runbook
title: Deploy to Azure (ACA)
description: How code reaches https://ehds.mabu.red and how to verify it.
resource: .github/workflows/deploy-azure.yml, scripts/azure/*.sh, docs/azure-deployment-guide.md
tags: [runbook, azure, aca, ci]
timestamp: 2026-07-15T00:00:00Z
---

**Normal path:** merge to `main` → `.github/workflows/deploy-azure.yml` builds
the UI + neo4j-proxy images, pushes to ACR, updates ACA apps in `rg-mvhd-dev`.
Watch: `gh run list --workflow=deploy-azure.yml --limit 1`.

**Full-stack provisioning:** numbered scripts `scripts/azure/01-foundation.sh`
… `10-catalog-crawler.sh`, config in `env.sh`. Post-deploy
(`06-post-deploy.sh`) seeds Neo4j, bootstraps Vault, imports the Keycloak realm
and hard-verifies the client redirect URIs (fails loudly on drift).

Gotchas (docs/gotchas.md): ACA caches `:latest` — jobs won't re-pull on
restart; personal `az` CLI loses ACA write perms after ~1h — ACA-job writes go
through CI (project memory `project_aca_job_write_via_ci`); off-hours
scale-down schedule covers all 15 apps (ADR-027).

---
type: runbook
title: Deploy to Azure (ACA)
description: How code reaches https://ehds.mabu.red and how to verify it.
resource: .github/workflows/deploy-azure.yml, scripts/azure/*.sh, docs/azure-deployment-guide.md
tags: [runbook, azure, aca, ci]
generated: { by: claude-code/fable-5, at: 2026-07-15T15:30:23Z }
verified: { by: human:ma3u, at: 2026-07-15T15:30:23Z }
status: stable
---

**Normal path:** merge to `main` → `.github/workflows/deploy-azure.yml` builds
the UI + neo4j-proxy images, pushes to ACR, updates ACA apps in `rg-mvhd-dev`.
Watch: `gh run list --workflow=deploy-azure.yml --limit 1`.

**Matchbox, the FHIR validator (ADR-097).** The same workflow builds
`mvhd-matchbox:<git tree hash of services/matchbox>` only when that
directory changes (the bake fetches the IG packages, about five minutes) and
moves an existing `mvhd-matchbox` to it. Creating the app, internal ingress,
2 vCPU / 4 GiB, and setting the proxy's
`MATCHBOX_URL=http://mvhd-matchbox/matchboxv3/fhir` is
`scripts/azure/22-matchbox.sh`, run as the CI identity (it reads the registry
credentials), in office hours:

```bash
gh workflow run matchbox.yml -f mode=apply    # create or update, wire the proxy
gh workflow run matchbox.yml -f mode=check    # report only
gh workflow run matchbox.yml -f mode=unwire-proxy   # $validate back to 503
```

It stops and starts with the stack (`offhours.sh`: started before the proxy,
stopped after it). A new IG version in `scripts/eehrxf/profiles.json` is
`python3 scripts/eehrxf/build.py` and a merge: a new tree hash, a new image.

**Full-stack provisioning:** numbered scripts `scripts/azure/01-foundation.sh`
… `10-catalog-crawler.sh`, config in `env.sh`. Post-deploy
(`06-post-deploy.sh`) seeds Neo4j, bootstraps Vault, imports the Keycloak realm
and hard-verifies the client redirect URIs (fails loudly on drift).

Gotchas (docs/gotchas.md): ACA caches `:latest` — jobs won't re-pull on
restart; personal `az` CLI loses ACA write perms after ~1h — ACA-job writes go
through CI (project memory `project_aca_job_write_via_ci`); off-hours
scale-down schedule covers all 15 apps (ADR-027).

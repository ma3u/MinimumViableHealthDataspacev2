---
type: runbook
title: mvhd-postgres restart/loss recovery (Azure)
description: Recover the full stack after the ephemeral ACA Postgres restarts or its revision is replaced — verified live during the 2026-07-16 incident.
resource: incident 2026-07-16 (issue #97 rollout), .github/workflows/reset-demo.yml, jad/keycloak-realm.json
tags: [runbook, postgres, azure, incident, recovery]
timestamp: 2026-07-17T00:00:00Z
---

**Why this exists:** `mvhd-postgres` on ACA is effectively **ephemeral**. Its
app template contains an Azure Files mount, but `initdb` cannot `chmod` on
Azure Files, so every revision created _with_ the mount fails; the revision
that serves traffic runs _without_ mounts. Consequence: **any** update/restart
of the app replaces the replica and wipes all 7 databases (keycloak,
controlplane, dataplane, dataplane_omop, identityhub, issuerservice, cfm).
Confirmed live 2026-07-16 when the ADR-029 tag pin was applied.

## Recovery procedure (verified 2026-07-16/17)

1. **Get a bootable revision:** if the current template has the Azure Files
   volume, strip it (export `az containerapp show -o yaml`, set
   `template.volumes`/`volumeMounts` to null, `az containerapp update --yaml`).
   The new revision initdbs a fresh ephemeral cluster.
2. **Recreate databases:** `az containerapp job start -n mvhd-pg-init -g rg-mvhd-dev`
   (job exists for exactly this; verify `Succeeded` in execution list).
3. **Keycloak:** restart the active revision (schema migrates into the empty
   `keycloak` DB, admin user re-bootstraps from env), then import the realm —
   `POST /admin/realms` with `jad/keycloak-realm.json` returns **201** on a
   fresh instance and includes all users/roles/redirect URIs (this is why the
   realm file must stay complete — see keycloak-realm-drift runbook).
   Verify: password grant for all 7 personas.
4. **EDC/CFM state + Vault:** trigger the demo reset workflow —
   `gh workflow run reset-demo.yml` — it runs under the CI service principal
   (no PIM needed), restarts the EDC apps (schema autocreate), re-runs Vault
   bootstrap, and re-seeds participants/assets/credentials (ADR-014).
5. **Verify:** all 7 persona logins · `https://ehds.mabu.red/api/health` ·
   `/data/discover` shows datasets · reset workflow smoke-test job green.

## Notes

- Neo4j is a separate app and unaffected — clinical/graph demo pages keep
  working throughout; only auth + EDC state go down.
- `az containerapp exec` needs a TTY; from automation prefer ACA jobs
  (mvhd-pg-init) over exec.
- PIM az sessions cap at 4h — long recoveries should lean on CI-SP workflows.
- Permanent fix options (Phase D): NFS-backed ACA storage or Azure Database
  for PostgreSQL Flexible Server; until then treat every mvhd-postgres
  restart as a reset event.

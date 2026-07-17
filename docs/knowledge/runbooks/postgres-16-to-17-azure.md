---
type: runbook
title: Postgres 16 → 17 major upgrade on Azure (mvhd-postgres)
description: Dump/restore migration for the ACA Postgres with persistent storage — closes the local/Azure major-version skew from ADR-029 §4.
resource: scripts/azure/02-data-layer.sh, ADR-017 (persistent storage), ADR-029 §4
tags: [runbook, postgres, azure, migration, issue-97]
timestamp: 2026-07-15T00:00:00Z
---

> **⚠️ CORRECTED after the 2026-07-16 incident** (see
> [aca-postgres-ephemeral-recovery](aca-postgres-ephemeral-recovery.md)):
> `mvhd-postgres` data is **EPHEMERAL** — the app template carries an Azure
> Files mount, but Postgres `initdb` cannot `chmod` on Azure Files, so every
> revision created with that mount **fails to boot**; the long-running
> revision that actually served traffic had **no volume mounts**. Any restart
> or image change loses all data and requires the re-seed procedure. The
> steps below that assume a persistent share (dump-to-share, PGDATA swap,
> rollback-to-old-datadir) are therefore INVALID until persistent storage is
> actually fixed (NFS-backed share or managed PostgreSQL — Phase D decision).

Azure runs `postgres:16` with local dev on 17.x. A major bump cannot be done
by changing the image tag — and on the current ephemeral setup ANY image
change is a full data reset (recovery runbook above).

## Preconditions

- Maintenance window (the 7 databases serve controlplane, dataplanes,
  identityhub, issuerservice, keycloak, cfm — the whole EDC stack pauses).
- `az login` with write permissions (or run via CI-SP — ACA-write gotcha in
  `docs/gotchas.md`).
- Free storage ≥ 2× current data size on the ACA file share.

## Procedure

1. **Scale writers to zero** (order: UI-facing first):
   `az containerapp update -n <app> -g rg-mvhd-dev --min-replicas 0 --max-replicas 0`
   for controlplane, dp-fhir, dp-omop, identityhub, issuerservice,
   tenant-mgr, provision-mgr, keycloak.
2. **Dump all databases** inside the running PG 16 container:
   `az containerapp exec -n mvhd-postgres -g rg-mvhd-dev --command "pg_dumpall -U mvhdadmin -f /var/lib/postgresql/data/all-pg16.sql"`
   (the dump lands on the persistent share and survives the container swap).
3. **Verify dump size** > 0 and contains all 7 DB names before proceeding.
4. **Point the data dir at a fresh path:** update the app's `PGDATA` env (or
   mount subpath) to a new directory, e.g. `/var/lib/postgresql/data/pg17`,
   so the 16 datadir stays untouched as rollback.
5. **Swap the image:** mirror `postgres:17.10-alpine` to ACR
   (`scripts/azure/02-data-layer.sh` pattern), update `POSTGRES_VERSION` in
   `scripts/azure/env.sh`, `az containerapp update` mvhd-postgres.
6. **Restore:** `az containerapp exec … "psql -U mvhdadmin -f /var/lib/postgresql/data/all-pg16.sql postgres"`.
7. **Verify:** the `PG_DATABASES` list from `env.sh` exists; row counts on
   `controlplane` contract tables match the pre-dump counts.
8. **Scale services back up**; run `./scripts/run-dsp-tck.sh` and a login
   smoke test against https://ehds.mabu.red.
9. **Rollback path:** revert image to 16.14 + `PGDATA` to the old directory —
   the 16 datadir was never modified.
10. After 7 quiet days: delete `all-pg16.sql` and the old datadir; flip local
    compose to the same 17.x patch so the skew stays closed.

`UNKNOWN — exact PGDATA/mount layout of mvhd-postgres; read it with
"az containerapp show -n mvhd-postgres" before step 4 (az session required).`

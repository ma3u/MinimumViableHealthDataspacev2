# ADR-041: Managed PostgreSQL on Azure, containerised PostgreSQL for local development

**Status:** Proposed
**Date:** 2026-10-02
**Relates to:** [ADR-001](ADR-001-postgresql-neo4j-split.md), [ADR-036](ADR-036-operator-secrets-in-key-vault.md)
**Tracks:** [#318](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/318)

## Context

`mvhd-postgres` runs on Azure Container Apps with no durable storage, and it has
destroyed the dataspace twice.

On 2026-09-30 ACA recreated the replica at 03:59:55Z. PGDATA was container-local,
`initdb` ran, and the `keycloak` and `cfm` databases were gone. On 2026-10-02 the
`edcv` realm was still missing, so `https://auth.ehds.mabu.red/realms/edcv/...`
answered 404 and nobody could sign in to the live demo.

`docs/gotchas.md` (2026-09-30) diagnosed this as a misconfiguration: the `pg-data`
AzureFile volume was declared with `volumeMounts: null`, so the fix was to mount it.
`scripts/azure/02-data-layer.sh` and `scripts/azure/repair-live-stack.sh` phase 1 both
do exactly that.

**That diagnosis is wrong, and mounting the volume makes things worse.** Running phase 1
on 2026-10-02 produced, in the `mvhd-postgres` log:

```
chmod: changing permissions of '/var/lib/postgresql/data/pgdata': Operation not permitted
initdb: error: could not change permissions of directory ".../pgdata": Operation not permitted
```

The replica went to `NotRunning` and the revision to `Failed`. `initdb` chmods PGDATA
unconditionally, and SMB cannot do POSIX chmod, so no combination of `mountOptions`
(`uid`, `gid`, `dir_mode`, `file_mode`) can satisfy it. The `volumeMounts: null` in the
live app was therefore most likely a deliberate, undocumented workaround by whoever hit
this first, not the oversight we recorded.

Both scripts verify only that the `mountPath` is set, never that Postgres started, so
both report success while leaving a crash-looping database. A fresh `02-data-layer.sh`
run would reproduce this.

The NFS escape route is closed on this estate:

| Requirement for Azure Files NFS  | Actual                                                        |
| -------------------------------- | ------------------------------------------------------------- |
| Premium FileStorage account      | `stmvhddev3e2079` is `Standard_LRS`, `StorageV2`              |
| ACA environment on a custom VNet | `mvhd-env` has `vnetConfiguration: null`, Consumption profile |

ACA offers ephemeral storage, `AzureFile` (SMB) and `NfsAzureFile` (NFS) only. There is
no block-storage volume type, so there is no option left that gives this container a
durable disk.

Vault and Neo4j mount shares from the same storage account and are fine. Postgres is the
one service whose startup requires chmod on its data directory.

Keeping the database ephemeral is not neutral. ADR-001 makes PostgreSQL the system of
record for EDC contract negotiation and transfer state across seven databases
(`keycloak`, `controlplane`, `dataplane`, `dataplane_omop`, `identityhub`,
`issuerservice`, `cfm`). Every replace of that replica silently discards signed
contracts and transfer history, and the only reason this reads as "the realm is gone" is
that sign-in is the first thing anyone notices.

Local development has no such problem. Container filesystems and Kubernetes
PersistentVolumes both support chmod, so the containerised Postgres that the Compose
stack and local clusters use is unaffected by any of this.

## Decision

**Azure uses Azure Database for PostgreSQL Flexible Server. Local development keeps
containerised PostgreSQL. The two differ only in the connection string.**

1. Provision Flexible Server `Standard_B1ms`, 32 GiB storage, West Europe, PostgreSQL 17,
   in `rg-mvhd-dev`. Create the seven databases on it.
2. Point `mvhd-keycloak` and the EDC services at it by changing `KC_DB_URL` and the
   equivalent JDBC URLs. Azure requires TLS, so those URLs carry `sslmode=require`;
   local URLs keep `sslmode=disable`.
3. Store the server password in Key Vault and reference it, per ADR-036. It is never a
   plaintext env var. (`mvhd-keycloak` currently carries `KC_DB_PASSWORD` in clear; that
   moves to a `secretRef` in the same change.)
4. Delete the `pg-data` volume and mount from `mvhd-postgres`, delete the mount patching
   from `02-data-layer.sh`, and delete `repair-live-stack.sh` phase 1. Retire the
   `mvhd-postgres` container app once the cutover is verified.
5. Keep `docker-compose.yml` and local Kubernetes on `postgres:17.7-alpine` with a
   volume, unchanged.

### Cost

Azure Retail Prices API, West Europe, pay-as-you-go, read 2026-10-02. Excludes any
EA or CSP discount.

| Item                              | Rate                                       | Monthly    |
| --------------------------------- | ------------------------------------------ | ---------- |
| B1ms compute, 730 h               | $0.0199 /h                                 | $14.53     |
| Storage, 32 GiB                   | $0.1369 /GB                                | $4.38      |
| Backup at default 7-day retention | included up to 100% of provisioned storage | $0.00      |
| **Total, always on**              |                                            | **$18.91** |

The repo already scales ACA down out of hours (`.github/workflows/aca-schedule.yml`,
Mon to Fri 07-20 Europe/Berlin). Applying the same window here, 65 h/week is about
282 h/month, so compute falls to about $5.61 and the total to about **$9.99/month**.
A stopped Flexible Server still bills storage, so the floor is $4.38.

This is the cost of not losing the dataspace on a restart. It replaces an ACA container
that was nominally free and was in practice destroying data.

### The connection budget is the real constraint

B1ms allows **50 connections, of which 35 are available to users** (15 are reserved).
PgBouncer is not offered on the Burstable tier, so there is no pooler to hide behind.

Keycloak's default Agroal pool is 100, which is larger than the whole server. **Pool
sizes must be set explicitly before cutover, not after:**

| Consumer                                                                               | Max pool |
| -------------------------------------------------------------------------------------- | -------- |
| `mvhd-keycloak` (`KC_DB_POOL_MAX_SIZE`)                                                | 10       |
| each EDC service (controlplane, dataplane, dataplane_omop, identityhub, issuerservice) | 3        |
| CFM agents, combined                                                                   | 8        |

That totals 33 against a budget of 35. It is deliberately tight, and it is the number to
revisit first when something reports `sorry, too many clients already`.

B2s lifts this to 414 user connections but costs $0.0796/h, about $58.11/month, roughly
four times B1ms. We take that step on measured evidence, not pre-emptively.

## Consequences

**Easier.** Restarts stop destroying contract state and the realm. Point-in-time restore
exists for the first time. `restore-keycloak-realm.sh` becomes a rare repair rather than
routine recovery, and the three guards that failed to notice the 2026-09-30 wipe stop
being load-bearing.

**Harder.** A failure mode appears that a local container never had: connection
exhaustion, with no pooler available at this tier. The database is now reachable over the
network, so a firewall rule governs access and a misconfigured one locks out the whole
stack. Cost moves from zero to roughly $10 to $19/month. Local and Azure now differ in
TLS settings, which is a seam that can rot if only one side is exercised.

**New constraints.** Pool sizes become part of the deployment contract. ACA on a
Consumption profile does not publish a stable documented egress IP: the environment
reports `staticIp 4.231.86.46` and `outboundIpAddresses: null`, so the firewall approach
must be confirmed against a real connection at cutover rather than assumed. If egress
proves unstable, the fallback is "allow Azure services" plus strong credentials, which is
weaker and should be recorded if taken.

**Migration.** There is nothing to migrate. The current cluster holds only what has
accumulated since the last wipe, so the seven databases are created empty and reseeded
with `cfm-seed.yml` and `restore-keycloak-realm.sh`.

## Local development is unaffected, and this was verified

Both local paths were tested on 2026-10-02 with the same image and the same PGDATA
layout that fails on ACA.

**Docker Compose** (`postgres:17.7-alpine`, named volume, `jad/init-postgres.sql`): all
ten databases created (`cfm`, `controlplane`, `dataplane`, `dataplane_omop`,
`identityhub`, `issuerservice`, `keycloak`, `postgres`, `redlinedb`, `taskdb`), zero
`Operation not permitted` in the log.

**Local Kubernetes** (OrbStack v1.35.6, `local-path` provisioner, 1 GiB PVC, PGDATA set
to `/var/lib/postgresql/data/pgdata` exactly as on ACA):

```
fixing permissions on existing directory /var/lib/postgresql/data/pgdata ... ok
database system is ready to accept connections
```

PGDATA came out `700 postgres:root`, which is the step that returns `Operation not
permitted` on SMB. A row was written, the pod was deleted, and the row was still there
after the new pod came up. A `kind-edcv` context is also configured and uses the same
provisioner model.

**One gap to close.** `jad/init-postgres.sql` says it "mirrors the K8s ConfigMap in
`k8s/base/postgres.yaml`", and that file does not exist. `k8s/` holds only
`health-dataspace-ui.yaml` and `probes.yaml`, and the UI manifest reaches Postgres
through `host.docker.internal` at the Compose stack. Either add `k8s/base/postgres.yaml`
or correct the comment, so a developer on a local cluster is not hunting a manifest that
was never committed.

## Alternatives considered

**Mount the SMB share with `mountOptions`.** Rejected: `initdb` chmods PGDATA
unconditionally and SMB returns `EPERM` regardless of `uid`, `gid`, `dir_mode` or
`file_mode`. Observed first-hand in the failure log above.

**Azure Files NFS (`NfsAzureFile`).** Rejected: needs a Premium FileStorage account and a
VNet-injected ACA environment. We have `Standard_LRS` and no VNet, so this means
rebuilding the environment and migrating every app, which costs more effort and more
money than the managed server.

**Azure Disk on the container app.** Rejected: ACA has no block-storage volume type.

**Stay ephemeral and auto-reimport the realm on restart.** Rejected as the primary
answer: it restores sign-in but not `controlplane`, `dataplane`, `identityhub`,
`issuerservice` or `cfm`, so signed contracts and transfer history still vanish and
ADR-001 is still violated. Worth keeping as a safety net underneath this decision.

**Start at B2s.** Rejected: four times the cost to buy connection headroom we have not
measured. The pool budget above is the cheaper experiment, and B2s stays available if it
fails.

**A non-Azure hosted Postgres (Neon, Supabase).** Rejected: it puts dataspace state with
a second vendor outside the subscription and region the rest of the estate sits in, which
is the wrong default for an EHDS reference implementation.

# ADR-046: The Azure Vault keeps its state on the Flexible Server

**Status:** Accepted (2026-10-04, Matthias Buchhorn)
**Date:** 2026-10-03
**Relates to:** [ADR-017](ADR-017-persistent-storage-aca.md), [ADR-036](ADR-036-operator-secrets-in-key-vault.md), [ADR-041](ADR-041-managed-postgres-on-azure-containerised-locally.md), [ADR-042](ADR-042-off-hours-scaledown-current-state.md), ADR-047 ([#458](https://github.com/ma3u/MinimumViableHealthDataspacev2/pull/458))
**Supersedes:** the `mvhd-vault` row of ADR-017 (file backend on the `vault-data` share), and the open point in ADR-042 on whether the Azure Vault needs a bootstrap on every start
**Tracks:** [#455](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/455)

## Context

`mvhd-vault` on Azure runs `vault server -dev`. Everything it holds is in
memory. ADR-017 mounted the `vault-data` share at `/vault/data` for a file
backend, but Vault was never switched to it.

On Container Apps, an in-memory Vault is emptied by anything that starts a new
container:

- a new revision: the evening stop sets `min=0`, which is a revision change
  (revision `mvhd-vault--0000175`, 2026-10-02 21:55, logged
  `security barrier not initialized`, then `no mounts; adding default mount table`);
- a scale from zero: `min=0` with a 300 s cooldown;
- a replica move by the platform.

What is lost is not only configuration. The weekday bootstrap job puts the JWT
auth, the policies and the transit key back, but the participant signing keys
and STS client secrets that CFM and the EDC services write at run time have no
second copy. Since 2026-09-29 the CFM Keycloak and EDC-V agents have panicked
about 1,090 times each on their Vault login and never started once (#455).

The local compose stack solved the same problem on 2026-09-26: file storage on
a named volume and a `vault-unseal` sidecar running
`scripts/vault-init-or-unseal.sh`. On ACA the only volume type is Azure Files
over SMB, which already crash-looped Postgres (ADR-041). The one durable store
the environment has that is not SMB is the Flexible Server ADR-041 introduced.

ADR-047 takes Vault out of the evening stop as a stopgap. That removes the
nightly wipe but none of the others.

## Decision

On Azure, Vault stores its data in PostgreSQL on the Flexible Server and is
unsealed by a sidecar.

1. **Storage.** `storage "postgresql"` in a new `vault` database on
   `mvhd-pg-b53a0449`, as the admin user, over TLS with `sslmode=require` like
   every other client (#442 moves all of them to `verify-full`). The
   connection URL reaches the app as the ACA secret `vault-pg-url`, built from
   `postgres-admin-password` in Key Vault, the way Keycloak gets its database
   password. HA is off; Vault runs one replica.
2. **Unseal sidecar.** A second container, `vault-unseal`, in the same
   replica (image `mvhd-vault-unseal:<commit>`, built from
   `scripts/azure/vault-unseal/`). On every start it creates Vault's table if
   missing, initialises Vault once, unseals it, and makes sure the fixed-id
   service token exists. Then it checks every 10 s and unseals again if the
   Vault container restarted alone. It runs the same
   `vault-init-or-unseal.sh` as the compose sidecar.
3. **Keys.** One unseal share and the root token are kept in `init.json` on
   the `vault-data` share, mounted into the sidecar only. This is dev-grade
   and the same trade as the compose stack's `vault_keys` volume.
4. **Service token.** Unchanged for now: the token id stays `VAULT_ROOT_TOKEN`
   (`root`), so no consumer changes in this step. Rotating it into Key Vault
   belongs to #359, which rotates the other hardcoded defaults.
5. **Deployment.** `scripts/azure/14-vault-on-postgres.sh` creates the
   database, builds and pushes the sidecar under an immutable tag, and
   switches the app. `03-identity.sh` calls it, so a rebuild does not bring
   dev mode back.

Verified locally on 2026-10-03 with `hashicorp/vault:2.0` (v2.0.4),
`postgres:17.7-alpine` and the sidecar image, in an ACA-shaped pod (one
network namespace, two containers):

| Case                                        | Result                                                          |
| ------------------------------------------- | --------------------------------------------------------------- |
| first start, Postgres still booting         | sidecar retries, creates the table, initialises, unseals in 9 s |
| Vault container restarts alone              | comes back sealed, sidecar unseals in 11 s                      |
| both containers recreated (scale from zero) | unsealed in 6 s, written secret still readable                  |
| `init.json` missing, storage initialised    | sidecar stops with the recovery steps                           |

## Consequences

- A restart, a new revision or a scale from zero no longer empties Vault.
  Participant keys survive, and the CFM agents can log in after any of them.
- Vault can go back into the evening stop once this is live, which reverts
  ADR-047. The morning re-run of `mvhd-vault-bootstrap` becomes a harmless
  safety net instead of a requirement.
- Vault exits at startup when the database is unreachable
  (`failed to check for native upsert`). Container Apps restarts it, and the
  Flexible Server is always on, so this only matters during a database outage,
  when Keycloak is down too.
- Vault data is now in the Flexible Server's backups (7-day retention). The
  data is encrypted by Vault's barrier, so the backups hold no readable secret
  without the unseal key.
- Whoever can read the `vault-data` share can unseal Vault and holds the root
  token. Today that is whoever holds the storage account key, which already
  reads the Neo4j data. Accepted for a demo; see below for the production
  path.
- Losing `init.json` loses Vault. Recovery is to empty `vault_kv_store`,
  restart, re-run the bootstrap and reseed the participants, which is what
  happens today after every wipe anyway.
- The first switch starts from an empty Vault, so the bootstrap
  (`repair-live-stack.sh 5`) and a CFM reseed follow it once.
- One more container: 0.25 vCPU and 0.5 GiB, while Vault runs.

## Alternatives considered

- **File backend on the `vault-data` SMB share** (ADR-017's plan). Not tried
  on purpose: ADR-041 showed that SMB on Container Apps breaks a store that
  expects POSIX file semantics, and Vault's file backend writes with
  restricted modes. Postgres was already proven.
- **Integrated storage (Raft) on the share.** Raft uses bbolt with `mmap` and
  `fsync`; on SMB that is a data-loss risk, not a saving.
- **Auto-unseal with an Azure Key Vault key.** This is the production path:
  no unseal key on a file share. It needs a Key Vault key and a role
  assignment (`Key Vault Crypto User` for the app's identity), which the
  operator account can only do under the PIM project-owner activation. Kept
  as the follow-up; the sidecar is then dropped.
- **Keep dev mode and only stop scaling Vault down** (ADR-047). It removes
  the nightly wipe, but not the ones from revisions, platform moves or
  restarts, so it stays a stopgap.

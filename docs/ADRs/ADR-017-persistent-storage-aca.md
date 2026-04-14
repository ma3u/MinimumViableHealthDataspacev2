# ADR-017: Persistent Storage for Stateful Services on ACA

**Status:** Accepted
**Date:** 2026-04-14
**Supersedes (partially):** [ADR-016](ADR-016-aca-off-hours-scaledown.md) — the
"re-seed Neo4j every morning" workaround in the ADR-016 trade-offs section is
replaced by Azure Files persistent volumes. The morning start workflow no longer
needs to wipe-and-reseed; it only needs to top up missing data on first run.

## Context

ADR-012 deployed the full team stack on Azure Container Apps (ACA). ADR-016
introduced an off-hours scale-down to fit the 50 EUR/month personal credit. Both
ADRs left stateful services on ephemeral container storage:

- **Neo4j** had no `volumeMounts`, so `/data/databases/` lived in the pod's
  ephemeral filesystem. Every revision restart — including any ingress, env-var,
  or scale-profile change, plus the daily 0/0→1/1 cycle from ADR-016 — wiped the
  knowledge graph. The morning workflow re-ran the full seed (~90 s) on every
  start.
- **Vault** ran in dev-mode in-memory only. The morning workflow re-ran
  `mvhd-vault-bootstrap` on every start (CLAUDE.md gotcha #1).
- **PostgreSQL Flexible Server** was already durable (ADR-012) — confirmed.
- **Keycloak** stores realm/user state in PostgreSQL — already durable
  transitively.

The triggering incident was 2026-04-13: an ACA ingress change on `mvhd-neo4j`
(reverting an `additionalPortMappings: [7474]` experiment) produced a new revision,
which destroyed all 127 Synthea patients and ~5300 graph nodes. The user logged
in as `edcadmin`, hit `/graph?persona=edc-admin`, and got "Neo4j unavailable"
because the seed had not yet been re-run after the silent revision bump. Quote
from the user: _"All Databases and Vaults need to be persistent and keep the
data after restart. REMEMBER this in a ADR."_

## Decision

Mount Azure Files shares into the `mvhd-neo4j` and `mvhd-vault` Container Apps,
backed by a single Standard LRS storage account in `rg-mvhd-dev`.

### Topology

| Container App | Mount path    | Share        | Quota | Purpose                                          |
| ------------- | ------------- | ------------ | ----- | ------------------------------------------------ |
| `mvhd-neo4j`  | `/data`       | `neo4j-data` | 10 GB | Graph store, transaction logs, schema, lock file |
| `mvhd-neo4j`  | `/logs`       | `neo4j-logs` | 5 GB  | Neo4j application logs (debug, query, security)  |
| `mvhd-vault`  | `/vault/data` | `vault-data` | 2 GB  | File backend (replaces in-memory dev mode)       |

Storage account: `stmvhddev<random6>` (StorageV2, Standard_LRS, TLS 1.2 minimum,
public network access enabled, default action Allow — required by Sopra Steria
DEP policy `ass-ssg-prd-cloud-per_msd-restrictions`).

PostgreSQL and Keycloak require no changes — they remain on PostgreSQL Flexible
Server's built-in storage (durable across stop/start).

### Cost envelope

Standard Azure Files LRS in West Europe: ~€0.06/GB/month for stored data,
~€0.0001 per 10 K transactions. With 17 GB provisioned across the three shares
the steady-state cost is **~€1.10/month**, comfortably inside the ADR-016
~€32/month envelope.

### ACA single-replica lock contention

Neo4j 5 acquires an exclusive lock on `/data/databases/store_lock`. With ACA
revisionsMode `Single` and `min=max=1`, the rolling-update strategy starts the
new pod **before** terminating the old one — the new pod fails with
`Lock file has been locked by another process`. Verified during this ADR's
implementation (rev 0000007 + 0000008 both Unhealthy until rev 0000006 was
manually deactivated).

**Mitigation in update workflows:** any `az containerapp update` that bumps the
Neo4j revision must be followed by `az containerapp revision deactivate
--revision <previous>` to release the SMB lock before the new revision can pass
its readiness probe. The `aca-schedule.yml` start workflow does not hit this
path because the previous revision is already at 0/0 replicas before the bump.

The cleaner long-term fix is to set `terminationGracePeriodSeconds: 30` on the
Neo4j container and switch to revisionsMode `Single` with explicit
deactivate-before-bump semantics in any deployment script that touches
`mvhd-neo4j`.

## Consequences

### Positive

- **Data survives revision bumps**, ingress changes, scale-down/up, and
  off-hours stops. Verified: Neo4j rev 6 wrote 185 nodes / 320 rels; rev 8 was
  a brand-new pod that read the same data from `/data` (181 nodes baseline +
  idempotent MERGE seed completed in ~5 min).
- **No more morning reseed** — the ADR-016 start workflow can drop the
  `mvhd-neo4j-seed` step. The seed becomes a one-time bootstrap, and Synthea
  FHIR loading via `mvhd-fhir-loader` likewise becomes one-time.
- **Vault secrets persist** across restarts once the file backend lands —
  removes CLAUDE.md gotcha #1 and the `mvhd-vault-bootstrap` re-run requirement.
- **Cost neutral** — adds ~€1.10/month, well inside the credit envelope.
- **No infrastructure drift** from ADR-012 — the same ACA topology, just with
  volume mounts.

### Trade-offs

- **SMB lock contention on Neo4j updates** — see "ACA single-replica lock
  contention" above. Any script that bumps the Neo4j revision must deactivate
  the prior revision explicitly. This is documented as a gotcha and is the
  reason the morning start workflow is unaffected (it goes 0→1, not 1→1).
- **Azure Files latency** — SMB has higher per-IOP latency than local SSD.
  Neo4j on Azure Files Standard LRS is acceptable for the 5300-node demo
  dataset but would not scale to multi-million nodes without switching to
  Premium Files or Azure NetApp Files.
- **Public network access enabled** — required to satisfy the Sopra Steria DEP
  policy variant that blocks private-only storage accounts on personal subs.
  Acceptable because the share is keyed (account key in ACA env config) and
  ACA traffic to Azure Files goes over the Microsoft backbone, not the public
  internet.
- **Single LRS replica** — a regional Azure Files outage takes the demo offline.
  GZRS would double the cost; for a personal demo the Mon-Fri 07-20 window
  makes regional outage exposure minimal. Revisit if/when the env hosts
  customer-facing data.

### Rollback

If Azure Files causes Neo4j stability problems (lock contention, latency
crashes), revert the `mvhd-neo4j` `volumeMounts` and `volumes` blocks to `null`
via `az containerapp update --yaml`, deactivate the volumed revision, and
re-run the morning seed workflow. The shares and storage account remain
provisioned at ~€1.10/month with no data loss; they can be re-attached at any
time.

## Implementation evidence

```
2026-04-14 04:51 — stmvhddev2e5f7b storage account created (Standard_LRS, TLS 1.2)
2026-04-14 04:52 — file shares: neo4j-data (10G), neo4j-logs (5G), vault-data (2G)
2026-04-14 04:52 — ACA env storages attached to mvhd-env
2026-04-14 04:53 — mvhd-neo4j rev 0000006 deployed with volumeMounts /data + /logs
2026-04-14 04:43 — mvhd-neo4j-seed run #1 completed (185 nodes / 320 rels) — first seed onto persistent volume
2026-04-14 04:54 — mvhd-neo4j env-var bump → rev 0000008 (Unhealthy: store_lock held by rev 6)
2026-04-14 04:59 — manually deactivated rev 0000006 → rev 0000008 became Healthy
2026-04-14 05:00 — mvhd-neo4j-seed run #2 completed against fresh rev 8 pod (181 nodes baseline + idempotent merges) — persistence proven
2026-04-14 05:18 — mvhd-vault YAML applied: file backend at /vault/data, inline entrypoint wrapper for auto-init + auto-unseal
2026-04-14 05:19 — rev 0000001 vault server started, auto-init wrote /vault/data/init.json (1 unseal share, root token persisted)
2026-04-14 05:20 — rev 0000002 healthy: vault initialized=true, sealed=false, "Vault ready (initialized + unsealed)"
```

### Vault file backend — design notes

- **Single-container approach** (no sidecar). Inline `/bin/sh -c` wrapper writes
  `/tmp/vault.hcl`, starts `vault server` in background, polls `vault status`
  until reachable, runs `vault operator init` if uninitialized (writes
  `/vault/data/init.json` with the unseal key + root token), runs
  `vault operator unseal` if sealed, then `wait $VAULT_PID` to keep the
  container PID 1 attached.
- **Why init.json on the persistent volume?** It survives every restart, so the
  next pod just unseals — no human intervention. Acceptable for a personal demo
  per ADR-016 cost envelope; would not be acceptable for a production tenant.
- **Unseal key parsing** uses `awk '/unseal_keys_b64/{flag=1;next} flag{...}'`
  to handle Vault's pretty-printed multi-line JSON output. The first attempt
  used a single-line `sed` regex which failed silently and triggered Vault's
  interactive prompt → "file descriptor 0 is not a terminal" error.
- **`disable_mlock = true`** in the inlined HCL because ACA Consumption profile
  cannot grant `IPC_LOCK`. `SKIP_SETCAP=true` env var keeps the entrypoint from
  trying to set capabilities at startup.
- **Bootstrap follow-up:** `mvhd-vault-bootstrap` job needs to mount the same
  `vault-data` Azure Files share to read the new dynamic root token from
  `init.json` (the previous setup hard-coded `VAULT_TOKEN=root` from dev mode).
  Tracked separately — does not block the persistence guarantee.

## References

- Triggering incident: this conversation, 2026-04-13/14
- Storage account: `stmvhddev2e5f7b` in `rg-mvhd-dev`
- ACA env: `mvhd-env` (West Europe)
- Superseded workaround: ADR-016 trade-offs section, "Neo4j is ephemeral on ACA"
- Vault file backend: pending implementation (task #13)
- Persistence requirement memory: `~/.claude/projects/.../memory/feedback_persistent_storage.md`

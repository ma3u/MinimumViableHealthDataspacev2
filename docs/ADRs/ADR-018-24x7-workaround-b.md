# ADR-018: 24×7 Operation on INF-STG-EU_EHDS + Postgres-on-ACA Workaround

**Status:** Accepted
**Date:** 2026-04-14
**Supersedes:** [ADR-016](ADR-016-aca-off-hours-scaledown.md) — off-hours
scale-down is no longer required and the cron schedule is disabled.
**Relates to:** [ADR-012](ADR-012-azure-container-apps.md),
[ADR-017](ADR-017-persistent-storage-aca.md)

## Context

Two constraints changed simultaneously:

1. **Unlimited Azure subscription** — the demo moves from the 50 EUR/month
   VS-Enterprise credit (ADR-016) to the corporate `INF-STG-EU_EHDS`
   subscription (`27836c51-b944-484c-bf76-8de3e9642238`). The cost envelope that
   forced Mon–Fri 07–20 scale-down no longer applies. The demo must be available
   24×7 to external visitors of `https://ehds.mabu.red`.
2. **Corp-policy RBAC limits** — the user's role on the new subscription,
   `rol-ssg-prd-project_owner`, **cannot register** two resource providers that
   the original IaC depends on:

   | Provider                        | Used for                             | Status      |
   | ------------------------------- | ------------------------------------ | ----------- |
   | `Microsoft.DBforPostgreSQL`     | PostgreSQL Flexible Server (ADR-012) | **BLOCKED** |
   | `Microsoft.OperationalInsights` | Log Analytics workspace (ADR-012)    | **BLOCKED** |
   | `Microsoft.App`                 | Container Apps                       | OK          |
   | `Microsoft.ContainerRegistry`   | ACR                                  | OK          |
   | `Microsoft.KeyVault`            | (future, not used in MVP)            | OK          |
   | `Microsoft.Network`             | VNet / public IP                     | OK          |
   | `Microsoft.Storage`             | Storage Account for Azure Files      | OK          |
   | `Microsoft.Insights`            | App Insights (already registered)    | OK          |
   | `Microsoft.ManagedIdentity`     | ACR pull (future)                    | OK          |

   Sopra Steria's subscription governance restricts these two providers to
   owner-only registration. Requesting owner action was considered (Option A) but
   rejected in favour of a self-contained workaround so the demo can ship without
   waiting on a ticket.

Subscription-scope policy evaluation shows **13 non-compliant Security Center
audit policies** (Defender plans, security contact email, guest account review).
All are `AuditIfNotExists` / `Audit` — none are `Deny`. None block resource
creation in `westeurope` or `northeurope`. No location or SKU restriction
policies were found.

## Decision

Run the entire stack 24×7 on the `INF-STG-EU_EHDS` subscription and route it
through a public custom domain. Replace the two blocked Azure services with
container-based equivalents:

### 1. Disable the off-hours scale-down

- `.github/workflows/aca-schedule.yml` `schedule:` block is commented out.
- `workflow_dispatch` trigger is retained so manual stop/start is still possible
  for planned maintenance windows.
- The workflow is renamed to **"ACA Manual Scale (disabled schedule — ADR-018)"**
  to make its post-ADR purpose obvious in the Actions UI.

### 2. Postgres as a Container App on Azure Files

| Property        | Value                                                                                                                                |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Image           | `acrmvhddev.azurecr.io/postgres:16` (retagged from Docker Hub)                                                                       |
| Ingress         | Internal, transport `Tcp`, target/exposed port `5432`                                                                                |
| Resources       | 1.0 vCPU / 2 GiB                                                                                                                     |
| Replicas        | 1/1 (single writer, SMB lock contention risk — see gotchas)                                                                          |
| Volume          | `pg-data` share (20 GiB) mounted at `/var/lib/postgresql/data`                                                                       |
| PGDATA          | `/var/lib/postgresql/data/pgdata` (subdirectory required by SMB)                                                                     |
| Auto-created DB | `keycloak` via `POSTGRES_DB`                                                                                                         |
| Other DBs       | `controlplane`, `dataplane`, `dataplane_omop`, `identityhub`, `issuerservice`, `cfm` — created in phase 6 via `az containerapp exec` |

Consumers use the short service name `mvhd-postgres` on port `5432` for both
the JDBC URL (EDC services, Keycloak) and the `DATABASE_URL` environment
variables (CFM tenant/provision managers). `sslmode=disable` is set because the
container image does not enable TLS by default.

### 3. Log Analytics disabled

- Phase 1 creates the ACA environment with `--logs-destination none`.
- Phase 7 (`07-observability.sh`) is skipped entirely — all of its outputs
  (diagnostic settings, saved KQL queries, replica alerts, portal dashboard)
  depend on Log Analytics.
- Per-container logs remain accessible via `az containerapp logs show --follow`
  and via the Log Stream blade in the Azure Portal.
- If observability becomes a blocker we can route to the already-registered
  `microsoft.insights` provider (App Insights) in a follow-up ADR.

### 4. Storage Account topology

A single storage account `stmvhddev<hash>` (StorageV2, `Standard_LRS`, TLS 1.2,
public network access **enabled** per Sopra Steria policy
`ass-ssg-prd-cloud-per_msd-restrictions`) hosts four Azure Files shares:

| Share        | Quota | Mount on                                 | Purpose                          |
| ------------ | ----- | ---------------------------------------- | -------------------------------- |
| `neo4j-data` | 10 GB | `mvhd-neo4j:/data`                       | Graph store (ADR-017)            |
| `neo4j-logs` | 5 GB  | `mvhd-neo4j:/logs`                       | Neo4j debug/query logs (ADR-017) |
| `vault-data` | 2 GB  | `mvhd-vault:/vault/data`                 | Vault file backend (ADR-017)     |
| `pg-data`    | 20 GB | `mvhd-postgres:/var/lib/postgresql/data` | Postgres data directory          |

All four shares are attached to the ACA environment via `az containerapp env
storage set` and referenced by `storageName` in each app's YAML.

### 5. Custom domain `https://ehds.mabu.red`

The DNS zone for `mabu.red` is managed at iwantmyname. Phase 6 (post-deploy)
emits the two required records to the console, waits for DNS propagation
verified via `dig @8.8.8.8`, then runs:

```bash
az containerapp hostname add  --hostname ehds.mabu.red --name mvhd-ui ...
az containerapp hostname bind --hostname ehds.mabu.red --name mvhd-ui \
  --environment mvhd-env --validation-method CNAME
```

ACA provisions a free managed certificate (Let's Encrypt–backed) which
auto-renews. Expected cert issuance time: 5–15 min after DNS verification.

Post-binding, the script updates:

- `NEXTAUTH_URL` on `mvhd-ui` → `https://ehds.mabu.red`
- Keycloak client `health-dataspace-ui` `redirectUris` and `webOrigins`
  to include `https://ehds.mabu.red/*`

Required DNS records:

| Type    | Name         | TTL  | Value                                               |
| ------- | ------------ | ---- | --------------------------------------------------- |
| `CNAME` | `ehds`       | 3600 | `mvhd-ui.<random>.westeurope.azurecontainerapps.io` |
| `TXT`   | `asuid.ehds` | 3600 | `<customDomainVerificationId>` from ACA env         |

## Consequences

### Positive

- **24×7 public demo** at `https://ehds.mabu.red` with a trusted TLS cert.
- **Self-contained deployment** — no owner-level tickets, no waiting on corp IT.
- **All stateful data persists across restarts** (Neo4j, Vault, Postgres,
  Keycloak-via-Postgres) per `feedback_persistent_storage.md`.
- **Simpler rollback** — one storage account holds every stateful volume;
  deleting the resource group wipes everything cleanly.

### Trade-offs

- **No managed PostgreSQL backups.** Flexible Server's automatic 7-day PITR
  backups are gone. For a demo this is acceptable; production would need
  pg_dump cron jobs or to request `Microsoft.DBforPostgreSQL` registration.
- **Postgres container is a single writer** with an SMB lock on `/var/lib/postgresql/data`.
  Any revision bump that doesn't deactivate the prior revision first will fail
  to start the new pod — same gotcha ADR-017 documents for `mvhd-neo4j`. Any
  `az containerapp update` on `mvhd-postgres` must be followed by
  `az containerapp revision deactivate --revision <previous>`.
- **Azure Files SMB latency** affects Postgres under load. The 127-patient demo
  dataset is tiny and runs fine; larger workloads would need Premium Files or a
  return to Flexible Server once RP registration is unblocked.
- **No Log Analytics → no central log search, no KQL alerts.** We lose the
  cross-app error dashboards from phase 7. Per-app streaming still works via
  `az containerapp logs show`.
- **Cost goes up** — the ADR-016 envelope was ~€32/mo on a Mon–Fri 07–20
  schedule. Running 24×7 roughly triples ACA compute and keeps storage + ACR
  flat. Rough estimate: ~€90–120/mo depending on traffic. Acceptable because
  the sub is `INF-STG-EU_EHDS` (unlimited).
- **Cold-start after revision bump** still exists for individual apps when
  someone deploys new code, but there's no daily morning 502 window.
- **Sopra Steria DEP policy** requires public network access on the storage
  account. This is documented in ADR-017 and carried over unchanged.

### Rollback

If the Postgres-on-ACA container proves unstable under demo load:

1. File a ticket with corp IT to register `Microsoft.DBforPostgreSQL` on
   `27836c51-b944-484c-bf76-8de3e9642238`.
2. Revert `scripts/azure/env.sh` to `PG_SERVER=pg-mvhd-dev` flexible-server
   path, restore `02-data-layer.sh` to the Flexible Server version (git history).
3. Dump `mvhd-postgres` via `pg_dumpall`, restore into the new flexible server.
4. Update `03-identity.sh`, `04-edc-services.sh`, `05-cfm-ui.sh` JDBC URLs back
   to `${PG_SERVER}.postgres.database.azure.com` + `sslmode=require`.
5. Delete `mvhd-postgres` container app and its `pg-data` share.

If the custom domain binding fails:

- Users can still reach the UI at its ACA default FQDN; no data impact.
- Re-run `az containerapp hostname bind` after DNS propagates.
- Worst-case: delete the hostname binding and fall back to the ACA FQDN while
  debugging cert validation.

## References

- Subscription: `INF-STG-EU_EHDS` (27836c51-b944-484c-bf76-8de3e9642238)
- Role: `rol-ssg-prd-project_owner`
- DNS provider: iwantmyname (zone `mabu.red`, record `ehds`)
- Storage policy: `ass-ssg-prd-cloud-per_msd-restrictions`
- Persistence requirement: `feedback_persistent_storage.md`
- Schedule workflow: `.github/workflows/aca-schedule.yml` (schedule disabled)
- Azure Container Apps custom domain docs: <https://learn.microsoft.com/en-us/azure/container-apps/custom-domains-managed-certificates>
- ACA TCP ingress docs: <https://learn.microsoft.com/en-us/azure/container-apps/tcp-ingress>

# ADR-016: ACA Off-Hours Scale-Down

**Status:** Accepted
**Date:** 2026-04-13
**Supersedes (partially):** [ADR-015](ADR-015-single-vm-dev-deployment.md) — the single-VM alternative is kept as a fallback but is no longer the preferred cost-control path.

## Context

The full team deployment on Azure Container Apps (ADR-012) runs 13 Container Apps,
3 Jobs, PostgreSQL Flexible Server, ACR Basic, Key Vault, Log Analytics, and a VNet.
At 24×7 scale it consumes the full personal 50 EUR/month VS-Enterprise credit within
~10 days. We need the full ACA topology — not a single-VM substitute — because:

- CI/CD, Playwright smoke tests, and the external demo URL all target ACA
- Contributors validate PRs against the same infrastructure that compliance tests run on
- The demo schedule (Mon–Fri 07:00–20:00 Europe/Berlin) already matches our working hours

ADR-015 documented a single-VM fallback, but running the stack on ACA during working
hours and scaling everything down outside them is strictly better: no drift between
"personal dev" and "team deployment", no cloud-init / systemd maintenance, and the
cost difference is meaningful enough to fit the credit.

## Decision

Implement a **scheduled off-hours scale-down** of the entire `rg-mvhd-dev` resource group
via GitHub Actions cron:

1. **Stop action** — daily 18:00 UTC (= 20:00 Europe/Berlin CEST / 19:00 CET):
   - `az containerapp update --min-replicas 0 --max-replicas 0` for all 13 Container Apps
   - `az postgres flexible-server stop --name pg-mvhd-dev`
2. **Start action** — Monday–Friday 05:00 UTC (= 07:00 Europe/Berlin CEST / 06:00 CET):
   - `az postgres flexible-server start` (waits for Ready)
   - Restore original `min-replicas` / `max-replicas` per app (baked into the workflow)
   - Re-run `mvhd-bootstrap-job` because Vault loses in-memory state on pod restart
     (CLAUDE.md gotcha #1)
   - Smoke-check the UI URL returns HTTP 200

### Scale profile (baseline)

| App                                                                                                                         | min | max |
| --------------------------------------------------------------------------------------------------------------------------- | --- | --- |
| mvhd-neo4j, mvhd-keycloak, mvhd-vault, mvhd-nats, mvhd-identityhub, mvhd-issuerservice, mvhd-tenant-mgr, mvhd-provision-mgr | 1   | 1   |
| mvhd-neo4j-proxy, mvhd-controlplane, mvhd-dp-fhir, mvhd-dp-omop                                                             | 1   | 2   |
| mvhd-ui                                                                                                                     | 1   | 3   |

All apps scale to `0/0` off-hours; started apps restore these values.

### Cost envelope (revised)

At West Europe list prices, April 2026:

| Component                            | On-hours (Mon–Fri 07–20) | Off-hours      | Monthly        |
| ------------------------------------ | ------------------------ | -------------- | -------------- |
| ACA compute (13 apps, ~1.0 vCPU avg) | ~286 h                   | 0 (scaled)     | ~€18           |
| PostgreSQL Flexible Server B1ms      | ~286 h                   | stopped (free) | ~€4            |
| ACR Basic                            | 24×7                     | 24×7           | ~€4            |
| Log Analytics (pay-as-you-go)        | usage-based              | minimal        | ~€3            |
| VNet + private endpoints + public IP | 24×7                     | 24×7           | ~€3            |
| GitHub Actions (scale jobs)          | ~25 runs/month           | —              | €0             |
| **Total**                            |                          |                | **~€32/month** |

Comfortable 36% margin under the 50 EUR credit.

## Consequences

### Positive

- No infrastructure drift: team deployment, personal dev, and CI all target the same ACA topology
- Eliminates cloud-init / systemd / custom VM image maintenance
- ~€32/month vs. ~€53/month (ADR-015 VM path) → more room under the 50 EUR cap
- Free cold-start recovery for stateful services via native ACA lifecycle
- Weekend safety: on Saturday/Sunday the env stays at 0 replicas so no one can accidentally
  burn credit running expensive queries

### Trade-offs

- **Cold-start delay**: ~60–90 s for Neo4j to accept connections, ~30 s for Keycloak.
  Users hitting the URL at 07:00 sharp may see 502s for up to ~2 minutes. Workflow
  waits for `mvhd-ui` HTTP 200 before declaring success.
- **Vault re-bootstrap required every morning**: Vault is in-memory (gotcha #1). The
  start workflow must re-run `mvhd-vault-bootstrap` before the UI is usable. Adds ~30 s
  to morning startup.
- ~~**Neo4j is ephemeral on ACA and must be re-seeded every morning**~~ —
  **Superseded by [ADR-017](ADR-017-persistent-storage-aca.md).** The
  `mvhd-neo4j` Container App now mounts Azure Files at `/data` and `/logs`,
  so the knowledge graph survives revision restarts and the morning scale-up
  no longer wipes the database. The seed job runs as a one-time bootstrap
  rather than a daily re-population. The seed job talks to Neo4j via Bolt
  (cypher-shell) on port 7687, so the `mvhd-neo4j` ingress only needs
  `transport: Tcp, targetPort: 7687` — no `additionalPortMappings` required.
- **DST drift**: GitHub Actions cron is UTC-only. 18:00 UTC = 20:00 Europe/Berlin
  in summer (CEST), 19:00 local in winter (CET). Same ±1 h drift as ADR-014.
- **Accidental manual scaling**: if a contributor manually scales an app during the
  on-hours window, the stop job will still set min=max=0 at 20:00 regardless. This
  is intentional — the schedule is authoritative.

### Rollback

If scale-down causes persistent problems (e.g., Keycloak cold-start corrupts state),
disable the cron in `.github/workflows/aca-schedule.yml` and manually run the start
job. The VM fallback in ADR-015 remains provisioned as an option.

## References

- Workflow: `.github/workflows/aca-schedule.yml`
- Team deployment: [ADR-012: Azure Container Apps](ADR-012-azure-container-apps.md)
- Weekly reset: [ADR-014: Weekly Demo Reset](ADR-014-weekly-demo-reset.md)
- VM fallback: [ADR-015: Single-VM Dev Deployment](ADR-015-single-vm-dev-deployment.md)
- Vault-in-memory constraint: `CLAUDE.md` gotcha #1 — **resolution pending in [ADR-017](ADR-017-persistent-storage-aca.md)** (Vault file backend on Azure Files)
- Neo4j ephemeral on ACA: **resolved by [ADR-017](ADR-017-persistent-storage-aca.md)** — Azure Files volumes mounted at `/data` and `/logs`
- Persistent storage decision: [ADR-017: Persistent Storage for Stateful Services on ACA](ADR-017-persistent-storage-aca.md)

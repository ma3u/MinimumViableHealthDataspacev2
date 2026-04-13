# ADR-015: Single-VM Dev Deployment for Personal VS Subscription

**Status:** Superseded by [ADR-016](ADR-016-aca-off-hours-scaledown.md) · Kept as fallback
**Date:** 2026-04-13 · Superseded 2026-04-13

> **Superseded note (2026-04-13):** After re-evaluation, scaling the full ACA topology down
> outside working hours (ADR-016) fits the 50 EUR/month budget while avoiding infrastructure
> drift. The scripts in `scripts/azure-vm/` remain available as a disaster-recovery fallback
> if ACA proves unreliable at cold-start, but are no longer the recommended path.

## Context

The team-shared environment runs on Azure Container Apps ([ADR-012](ADR-012-azure-container-apps.md)), billed against a shared engineering subscription. Individual contributors also need a throwaway cloud environment for:

- Offline-from-laptop demos (WiFi-independent)
- Pre-PR smoke tests against the full 19-service JAD stack without draining the shared ACA environment
- Reproducing bugs that only manifest in a clean Linux container runtime

The constraint is a personal **Visual Studio Enterprise MSDN subscription** with a **50 EUR/month** Azure credit (`PER-MSD-VS-MBUCHHORN-01`). The full ACA topology does not fit this budget because 13 Container Apps + PostgreSQL Flexible Server + ACR Basic exceeds the credit even with aggressive scale-to-zero.

## Decision

Deploy the **full local Docker Compose stack on a single Azure VM** (`Standard_B4ms`, 4 vCPU / 16 GB RAM) in West Europe, scheduled to run weekdays 07:00–20:00 Europe/Berlin only.

### Topology

| Component      | Choice                                                                                                            | Rationale                                                             |
| -------------- | ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| VM size        | `Standard_B4ms` burstable                                                                                         | 16 GB RAM covers 8 GB Docker floor; ~€0.17/h                          |
| OS image       | Ubuntu 24.04 LTS                                                                                                  | Matches local dev; cloud-init first-class                             |
| Disk           | 64 GB Premium SSD (P6)                                                                                            | Neo4j + PostgreSQL volumes + container pull                           |
| Region         | `westeurope`                                                                                                      | Matches ACA region (ADR-012)                                          |
| Stack          | `docker compose -f docker-compose.yml -f docker-compose.jad.yml`                                                  | Identical to local dev (no drift)                                     |
| Bootstrap      | `cloud-init` clones public repo, installs Docker, enables systemd unit                                            | Idempotent, re-runnable on every boot                                 |
| Vault re-seed  | systemd `ExecStartPost` runs `./scripts/bootstrap-jad.sh`                                                         | Works around Vault-in-memory ([CLAUDE.md gotcha #1](../../CLAUDE.md)) |
| Stop schedule  | Built-in VM auto-shutdown at 20:00 Europe/Berlin daily                                                            | Free, native, zero dependencies                                       |
| Start schedule | Azure Logic App (Consumption), recurrence Mon–Fri 07:00, managed identity with `Virtual Machine Contributor` role | Consumption-tier cost ≈ €0 at 22 runs/month                           |

### Cost envelope

At B4ms list price in West Europe (April 2026): **~€0.166/hour compute + ~€5/month storage**.

- Weekdays 07:00–20:00 × ~22 workdays = 286 h/month compute ≈ **€47.50**
- Disk + networking + Logic App runs ≈ **€5.50**
- **Total ≈ €53/month** — marginal overrun; trim to 08:00–19:00 (242 h) for a ~€40 comfort margin.

## Consequences

### Positive

- **Bit-for-bit parity with local dev**: same Compose files, same images, same seed scripts.
- **No drift risk against ACA**: this path is explicitly opt-in and separate from the team deployment.
- **Full JAD stack** works without ACA's per-service limits (probe timing, state set sizes).
- **Zero shared-resource cost**: the VS credit is per-person, so running it does not deplete the team engineering budget.

### Trade-offs

- **Not highly available**: single VM, no load balancer, single AZ. Acceptable for personal dev.
- **Vault re-seed on every boot** (~90 seconds added to startup) because Vault is in-memory.
- **Data is ephemeral by design**: managed disk survives stop/start, but teardown deletes the RG.
- **Separate code path to maintain**: `scripts/azure-vm/` is distinct from `scripts/azure/` (ACA). Kept intentionally small.
- **B4ms CPU credits** can deplete under sustained load (e.g., Synthea regeneration). Upgrade to `D4s_v5` (€0.20/h) if observed.

## Non-goals

- Multi-user access, TLS-terminated public ingress, managed identity federation for GitHub Actions, persistent backups. These are ACA's job (ADR-012).
- Replacing the team deployment. Contributors MUST still validate PRs against the shared ACA environment before merge.

## References

- Scripts: `scripts/azure-vm/`
- Team deployment: [ADR-012: Azure Container Apps](ADR-012-azure-container-apps.md)
- Weekly reset parallel: [ADR-014: Weekly Demo Reset](ADR-014-weekly-demo-reset.md)
- Vault-in-memory constraint: `CLAUDE.md` gotcha #1

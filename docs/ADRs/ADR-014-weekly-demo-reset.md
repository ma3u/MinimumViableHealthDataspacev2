# ADR-014: Weekly Demo Environment Reset

**Status:** Accepted
**Date:** 2026-04-12 (original) · Amended 2026-04-13
**File:** Renamed from `ADR-014-nightly-demo-reset.md` on 2026-04-13 to reflect the weekly cadence.

## Amendment (2026-04-13)

The reset cadence has been changed from **daily 02:00 UTC** to **weekly, Monday 05:15 UTC
(07:15 Europe/Berlin CEST / 06:15 CET)**. Rationale:

- Aligns with the Mon–Fri 07:00–20:00 environment schedule ([ADR-015](ADR-015-single-vm-dev-deployment.md)): a daily reset while the environment is offline wastes no compute, but compressing it to a single pre-week run removes 6 redundant runs per week of GitHub Actions minutes.
- The 24 h retention commitment in the original ADR is **relaxed to 7 days** as a consequence. Anyone using the shared demo to stage sensitive-looking (still fictional) data should be aware state now persists across a work week. No real PII is involved, so this remains GDPR-compliant in practice, but the change is documented here for transparency.
- The "dirty check" (`check-dirty` job) still runs and will skip a reset when Neo4j has not drifted from the baseline, so the Monday run is often a no-op.

## Context

The Azure demo environment is accessible to stakeholders, partners, and potential customers for evaluation. Data entered through the EHDS portal (contracts, negotiations, credentials, custom policies) must be reset on a predictable cadence to ensure:

- Data minimisation — the shared environment never accumulates stale or sensitive-looking state indefinitely
- Consistent demo experience for all visitors at the start of each work week
- No accumulated state drift from experiments or failed operations

## Decision

Implement a **scheduled weekly reset** via GitHub Actions cron job on Monday 05:15 UTC (= 07:15 Europe/Berlin CEST / 06:15 CET):

1. **Restart stateful services** (Neo4j, PostgreSQL, Vault, Keycloak) to clear runtime state
2. **Re-run bootstrap job** — Vault secrets, signing keys, auth backends
3. **Re-run schema job** — Neo4j constraints, indexes, base schema
4. **Re-run seed job** — Synthetic patients, EHDS credentials, demo policies, marketplace chain
5. **Restart application services** — UI, Neo4j Proxy, EDC-V, IdentityHub pick up fresh data
6. **Smoke tests** — Playwright verifies environment is healthy post-reset

### What gets reset

| Component  | Reset Method                      | Baseline State                               |
| ---------- | --------------------------------- | -------------------------------------------- |
| Neo4j      | Container restart + schema + seed | 5-layer graph, 127 patients, 5300+ nodes     |
| PostgreSQL | Container restart + seed          | EDC-V contracts, CFM tenants, Keycloak realm |
| Vault      | Container restart + bootstrap     | EdDSA keys, AES keys, JWT auth backend       |
| Keycloak   | Container restart                 | 7 demo users, edcv realm, PKCE client        |
| EDC-V      | Service restart                   | 5 participants, 14 policies, 4 assets        |

### What is preserved

- Azure infrastructure (Container Apps, ACR, VNet, certificates)
- Container images in ACR
- GitHub Actions secrets and OIDC federation

## Consequences

### Positive

- Bounded data retention — shared state never persists beyond one work week
- Demo always shows a clean, working baseline at the start of each Monday
- Broken experiments self-heal over the weekend
- 6× fewer GitHub Actions runs per week vs. the previous daily cadence

### Trade-offs

- 5–10 minute window of unavailability during reset (Mon 05:15–05:25 UTC)
- Users cannot save long-running work across weeks (documented in UI banner)
- Relaxed retention — state can now live up to 7 days. Acceptable because no real PII is stored, but documented in the amendment note at the top of this ADR.
- Full restart is slower than selective cleanup but simpler and more reliable

## References

- GitHub Issue: [#11](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/11)
- Workflow: `.github/workflows/reset-demo.yml`
- Azure deployment: [ADR-012](ADR-012-azure-container-apps.md)
- Environment schedule: [ADR-015](ADR-015-single-vm-dev-deployment.md)

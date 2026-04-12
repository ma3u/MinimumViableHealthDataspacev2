# ADR-014: Nightly Demo Environment Reset

**Status:** Accepted
**Date:** 2026-04-12

## Context

The Azure demo environment is accessible to stakeholders, partners, and potential customers for evaluation. Any data entered through the EHDS portal (contracts, negotiations, credentials, custom policies) must not persist beyond 24 hours to ensure:

- GDPR-aligned data minimization (no unnecessary data retention)
- Consistent demo experience for all visitors
- No accumulated state drift from experiments or failed operations

## Decision

Implement a **scheduled nightly reset** via GitHub Actions cron job at 02:00 UTC (04:00 CET):

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

- Zero risk of customer data retention beyond 24 hours
- Demo always shows a clean, working baseline
- Broken experiments self-heal overnight
- No manual intervention needed

### Trade-offs

- 5-10 minute window of unavailability during reset (02:00-02:10 UTC)
- Users cannot save long-running work across days (documented in UI banner)
- Full restart is slower than selective cleanup but simpler and more reliable

## References

- GitHub Issue: [#11](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/11)
- Workflow: `.github/workflows/reset-demo.yml`
- Azure deployment: [ADR-012](ADR-012-azure-container-apps.md)

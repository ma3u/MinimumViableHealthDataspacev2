# ADR-012: Azure Container Apps Deployment

**Status:** Accepted
**Date:** 2026-04-10

## Context

The local Docker Compose deployment (22 containers) demonstrates the architecture but cannot serve as a shared environment for team collaboration, stakeholder demos, or integration testing against a persistent instance. A cloud deployment is needed that balances cost, operational simplicity, and fidelity to the local stack.

## Decision

Deploy to **Azure Container Apps (ACA)** with the following topology:

1. **13 Container Apps** — UI, Neo4j, Keycloak, Vault, NATS, PostgreSQL, Neo4j Proxy, EDC-V Control Plane, DCore Data Plane, IdentityHub, IssuerService, CFM Tenant Manager, CFM Provision Manager
2. **3 ACA Jobs** — Bootstrap (Vault init), Seed (JAD data), Schema (Neo4j init)
3. **Azure Container Registry (ACR)** — `acrmvhddev.azurecr.io` for custom images
4. **OIDC federation** — GitHub Actions authenticates via workload identity (no stored credentials)
5. **CI/CD pipeline** — `.github/workflows/deploy-azure.yml` builds, pushes, and deploys on every push to main
6. **E2E validation** — Playwright tests run against Azure after each deployment

## Infrastructure

- Resource Group: `rg-mvhd-dev` (West Europe)
- ACA Environment: `mvhd-env` (shared VNet, internal DNS)
- Managed certificates for HTTPS on all ingress endpoints
- Persistent storage via Azure Files for Neo4j data

## Deployment Scripts

11 scripts in `scripts/azure/` handle full lifecycle:

- `deploy-all.sh` — orchestrates complete deployment
- `create-container-apps.sh` — provisions all 13 apps
- `run-bootstrap-job.sh` — executes post-deploy initialization

## Consequences

### Positive

- Persistent shared environment for team and stakeholders
- CI/CD with E2E tests against real deployment
- No credential management (OIDC federation)
- Cost-effective (consumption plan, scale-to-zero)

### Trade-offs

- ACA does not support Docker Compose directly — each service configured individually
- Neo4j Community Edition lacks clustering — single-instance with Azure Files persistence
- Vault in-memory mode — secrets lost on container restart, bootstrap job re-runs

## Follow-up — EDC scope on ACA (issue #25)

EDC's controlplane needs four distinct Jetty ports (web 8080 / management 8081 / protocol 8082 / control 8083). ACA's default ingress exposes one. Three follow-up decisions, captured separately:

1. **Multi-port via `additionalPortMappings`** — implemented in commit `3ee18be` (2026-05-02). The controlplane now boots cleanly on ACA with all 4 ports mapped; 114 service extensions start. NATS JetStream enabled in the same change.
2. **Scope split between Azure (demo / showcase) and local Docker (full DSP/DCP validation)** — formalised in [ADR-022](ADR-022-edc-connector-cost-vs-function.md). DSP/DCP TCK probes against unprovisioned services are reported as `skip` (neutral blue) on the live `/compliance/tck` page via `TCK_INFRA_OPTIONAL=true` on the proxy.
3. **Participant seeding on ACA** — outstanding. Tracked as the last open task under issue #25; needs a `scripts/azure/05-edc-seed.sh` that mirrors `jad/seed-all.sh` phases 2-4 against the ACA-internal management API.

Until (3) lands, the live demo TCK page intentionally shows green for all 6 EHDS rows + neutral skips for everything that depends on per-participant DSP/DCP state. The skip-explainer banner links back to issue #25.

## References

- [Azure Container Apps documentation](https://learn.microsoft.com/en-us/azure/container-apps/)
- Deployment guide: `docs/azure-deployment-guide.md`
- CI/CD workflow: `.github/workflows/deploy-azure.yml`
- Scripts: `scripts/azure/`
- [ADR-022](ADR-022-edc-connector-cost-vs-function.md) — EDC connector function-vs-cost decision, formalises the scope split
- Issue [#25](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/25) — multi-port ACA + EDC architectural mismatch tracker

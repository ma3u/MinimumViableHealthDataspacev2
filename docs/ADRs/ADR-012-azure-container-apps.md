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

## References

- [Azure Container Apps documentation](https://learn.microsoft.com/en-us/azure/container-apps/)
- Deployment guide: `docs/azure-deployment-guide.md`
- CI/CD workflow: `.github/workflows/deploy-azure.yml`
- Scripts: `scripts/azure/`

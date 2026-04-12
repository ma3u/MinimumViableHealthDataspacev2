# ADR-005: JAD + CFM Source Builds

**Status:** Accepted (revised)
**Date:** 2026-03-09
**Supersedes:** —

## Context

The JAD (Joint Aruba-Dataspace) architecture and CFM (Connector Framework Module) components are not published as pre-built Docker images. To run the full 19-service stack locally — including EDC connectors, IdentityHub, FederatedCatalog, and supporting services — all images must be built from source. This ensures version alignment and allows local debugging of connector behavior.

## Decision

Build all connector images from source by cloning JAD and CFM repositories into `vendor/`:

- **JAD** (Java/Gradle): 4 images — EDC connector, control plane, management API, data plane
- **CFM** (Go/Make): 7 images — IdentityHub, FederatedCatalog, CredentialService, and supporting services
- Pin to EDC 0.16.0-SNAPSHOT for consistent behavior across all components
- Use `docker compose build` with BuildKit for parallel multi-stage builds

## Consequences

### Positive

- Full JAD architecture runs locally with all 19 services
- Source builds allow local debugging and patch application
- Version pinning ensures reproducible builds across developer machines
- No dependency on external image registries for development

### Trade-offs

- Initial build requires cloning ~2 GB of source and 15-20 min compile time
- Developers need Java 17+, Go 1.21+, and Docker BuildKit
- EDC 0.16.0-SNAPSHOT may have upstream breaking changes between pulls
- `vendor/` directory must be kept in sync with upstream releases

## References

- [Full details in planning document](../planning-health-dataspace-v2.md)
- Build scripts: `scripts/bootstrap-jad.sh`
- Docker Compose: `docker-compose.jad.yml`

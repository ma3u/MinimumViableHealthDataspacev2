# ADR-006: GHCR Image Publishing

**Status:** Accepted
**Date:** 2026-03-10
**Supersedes:** —

## Context

Building all 11 JAD/CFM images from source (ADR-005) takes 15-20 minutes and requires Java, Go, and Docker BuildKit. This creates a high barrier for contributors who want to run the full stack without modifying connector code. A shared image registry allows pre-built images to be pulled directly.

## Decision

Publish all source-built images to the GitHub Container Registry (GHCR) under the `ghcr.io/ma3u/health-dataspace/*` namespace:

- 11 images total: 4 JAD (Java) + 7 CFM (Go)
- CI workflow builds and pushes on merge to `main`
- Images tagged with git SHA and `latest`
- `docker-compose.jad.yml` defaults to pulling from GHCR, with local build as override

## Consequences

### Positive

- Contributors can `docker compose pull` and run the full stack in minutes
- Standard Docker Compose workflow without local build toolchains
- CI ensures images are always current with `main` branch
- GHCR is free for public repositories

### Trade-offs

- GHCR storage and bandwidth costs scale with image count and pull frequency
- Image tags must be kept in sync with `docker-compose.jad.yml` references
- Contributors modifying connector code still need local build capability (ADR-005)

## References

- [Full details in planning document](../planning-health-dataspace-v2.md)
- Related: [ADR-005 — JAD + CFM Source Builds](ADR-005-jad-cfm-source-builds.md)
- Docker Compose: `docker-compose.jad.yml`

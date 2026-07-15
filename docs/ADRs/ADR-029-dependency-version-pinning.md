# ADR-029: Dependency version pinning and refresh cadence

**Status:** Accepted
**Date:** 2026-07-15
**Relates to:** [ADR-005](ADR-005-jad-cfm-source-builds.md), [ADR-006](ADR-006-ghcr-image-publishing.md), [ADR-012](ADR-012-azure-container-apps.md), [ADR-017](ADR-017-persistent-storage-aca.md)
**Tracks:** [Issue #97 — dependency refresh](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/97), Phase A

## Context

Before this ADR, every third-party image in `docker-compose*.yml` and
`scripts/azure/env.sh` floated (`:latest`, `:alpine`, `neo4j:5-community`,
`postgres:16`), and all 11 self-published `ghcr.io/ma3u/health-dataspace/*`
images existed only as `:latest`. Combined with ACA's `:latest` caching
(`docs/gotchas.md`, 2026-04), we could not state which build ran where.
Compounding it, local and Azure Postgres diverged (17.7 vs 16).

Inventory performed 2026-07-15 (registry manifests + live instances):

| Image                     | Was            | Resolved to               | Evidence                                                                                                                                                                                |
| ------------------------- | -------------- | ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| quay.io/keycloak/keycloak | `:latest`      | **26.6.0** (Java 21.0.10) | live `admin/serverinfo` on auth.ehds.mabu.red                                                                                                                                           |
| hashicorp/vault           | `:latest`      | **2.0**                   | Docker Hub digest match                                                                                                                                                                 |
| nats                      | `:alpine`      | **2.14.3-alpine**         | Docker Hub digest match                                                                                                                                                                 |
| neo4j                     | `:5-community` | **5.26.28-community**     | Docker Hub digest match                                                                                                                                                                 |
| curlimages/curl           | `:latest`      | **8.21.0**                | Docker Hub digest match                                                                                                                                                                 |
| postgres (local)          | 17.7-alpine    | already pinned            | compose file                                                                                                                                                                            |
| postgres (Azure)          | `:16`          | **16.14** pin             | Docker Hub tag list                                                                                                                                                                     |
| ghcr `jad-*`/`cfm-*` (11) | `:latest`      | digest pins               | GHCR manifests, all built **2026-04-11** (EDC 0.16 era, ADR-005); all six `cfm-*` tags share one image; **no OCI source/revision labels** — source commit unrecoverable from the images |

## Decision

1. **Third-party images are pinned to exact versions** — the version each
   floating tag resolved to on 2026-07-15 (pin-in-place, no upgrades; upgrades
   are issue #97 Phases B/C). Azure pins live centrally in
   `scripts/azure/env.sh` (`*_VERSION` variables) and the mirror scripts pull
   those pinned tags.
2. **Self-published JAD/CFM images are pinned by digest**
   (`:latest@sha256:…`) in `docker-compose.jad.yml` until Phase B rebuilds
   them with proper version tags and OCI `org.opencontainers.image.revision`
   / `.source` labels (mandatory from Phase B on).
3. **Our own CD-managed images (`mvhd-ui`, `mvhd-neo4j-proxy`) stay
   `:latest`** — they are rebuilt and rolled by `deploy-azure.yml` on every
   merge to main; their version identity is the git SHA of main.
4. **Postgres skew is resolved by documentation, not by upgrade:** Azure stays
   on major **16** (pinned 16.14) because its data directory lives on ACA
   persistent storage (ADR-017) and a 16→17 major jump requires
   `pg_upgrade`/dump-restore — a migration runbook is a Phase C deliverable.
   Local dev (ephemeral, reseedable) stays on 17.x. The skew is intentional
   and bounded to the major version.
5. **Refresh cadence:** patch/minor bumps land as deliberate PRs, one service
   per PR, at most monthly, gated by the standard suites
   (`run-dsp-tck.sh`, `run-dcp-tests.sh`, `run-ehds-tests.sh`, Vitest,
   Playwright live). Exceptions: security advisories (immediate) and the
   `npm audit --audit-level=high` pre-push gate that already exists.
6. `traefik:v3.4` keeps its bounded minor tag (patch tags for that line are no
   longer enumerable on Docker Hub; the v3.4 line is EOL-bound and will be
   bumped in Phase C instead).

## Consequences

- Reproducible stack: every compose/provision run yields the same bits;
  ACA `:latest` cache staleness can no longer cause silent version drift for
  third-party services.
- Version bumps become visible in diffs and reviewable.
- Digest pins are unreadable — acceptable as a Phase A stopgap; Phase B
  replaces them with versioned tags + provenance labels.
- The Metaform source commits behind the 2026-04-11 JAD/CFM builds remain
  UNKNOWN (no labels, no local `vendor/` checkout) — Phase B must rebuild from
  known commits rather than recover the old provenance.

## Alternatives considered

- **Renovate/Dependabot for images** — rejected for now: the JAD/CFM images
  have no version tags to track, and auto-bump PRs without the live-stack
  suites would create noise; revisit after Phase B tagging.
- **Upgrade Azure Postgres to 17 now** — rejected: data migration on ACA
  persistent storage without a tested runbook risks the 24/7 demo (ADR-018).
- **Digest-pin the third-party images too** — rejected: version tags from
  official registries are effectively immutable and stay human-readable.

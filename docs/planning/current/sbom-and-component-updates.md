---
title: "SBOM, automated CVE scanning, and the component update queue"
status: current
owner: ma3u
updated: 2026-09-08
adr: ../../ADRs/ADR-029-dependency-version-pinning.md
knowledge: ../../knowledge/index.md
---

Extends the issue #97 dependency refresh (Phase A done 2026-07-15) with a
machine-generated SBOM, automated CVE scanning in CI, and an evidence-based
update queue. Every version and CVE below was measured on 2026-09-08 with
`syft` 1.51.1 / `grype` 0.118.0, not read off a changelog.

## Why this exists

The pre-push gate is `npm audit --audit-level=high`, and it has been **failing on
`main`** — every push needs `--no-verify`, which also skips the full Vitest run
(issue #112). Worse, `npm audit` only sees npm packages: Keycloak, Postgres,
Neo4j, NATS, Traefik, Vault and the JAD/EDC images are most of the attack
surface and nothing was checking them. Dependabot would not have closed that gap
either — it reads Dockerfile `FROM` lines, not `docker-compose*.yml`.

## What is now automated

| Mechanism                             | Covers                                                 | Cadence                                  |
| ------------------------------------- | ------------------------------------------------------ | ---------------------------------------- |
| `scripts/generate-sbom.sh`            | CycloneDX SBOM, source + images                        | On demand                                |
| `.github/workflows/security-scan.yml` | Source CVEs (grype) + 11 images (Trivy) → Security tab | Mon 04:30 UTC, PRs touching deps, manual |
| `.github/dependabot.yml`              | npm ×2, GitHub Actions, 5 Dockerfiles, pip             | Weekly, grouped                          |
| pre-commit `actionlint`               | Workflow syntax + shellcheck                           | Every commit                             |
| pre-commit `image-scan-coverage`      | Compose images vs scan matrix drift                    | Every commit                             |

The coverage check exists because the scan matrix has to duplicate the compose
image list (an Actions matrix cannot read a compose file). It caught the
JAD/EDC images missing from the matrix on its first run.

## Component inventory

Declared versions are from `scripts/azure/env.sh` and the compose files. Live ACA
tags could not be confirmed on 2026-09-08 — the Azure token had expired past the
4 h PIM cap, so **verify against the running revisions before acting**.

| Component           | Declared          | Latest upstream      | Gap                       |
| ------------------- | ----------------- | -------------------- | ------------------------- |
| Keycloak            | 26.6.4            | 26.7.3               | 1 minor                   |
| Neo4j               | 5.26.28-community | 5.26.30-community    | 2 patch                   |
| Postgres (compose)  | 17.7-alpine       | 17.9-alpine          | 2 patch                   |
| Postgres (`env.sh`) | 16.14             | —                    | **major skew, see below** |
| Traefik             | v3.4              | v3.7.12              | 3 minor                   |
| NATS                | 2.14.3-alpine     | 2.14.6               | 3 patch                   |
| Vault               | 2.0               | 2.1.0                | 1 minor                   |
| JAD / EDC ×4        | git SHA `4a7e5bd` | tracked by issue #97 | see #97                   |

## Measured CVEs

`ui` — 1 critical, 11 high, 15 medium, 2 low. `services/neo4j-proxy` — 2 high.

| Severity     | Package                | Installed | Fixed in |
| ------------ | ---------------------- | --------- | -------- |
| **Critical** | next-auth              | 4.24.14   | 4.24.15  |
| High         | next                   | 15.5.20   | 15.5.21  |
| High         | next-auth              | 4.24.14   | 4.24.15  |
| High         | postcss                | 8.4.31    | 8.5.18   |
| High         | nanoid                 | 3.3.11    | 3.3.18   |
| High         | sharp                  | 0.34.5    | 0.35.0   |
| High         | path-to-regexp (proxy) | 0.1.12    | 0.1.13   |
| High         | ip-address (proxy)     | 10.1.0    | 10.3.1   |

### Container images (Trivy, CRITICAL/HIGH, fixed-only)

Measured locally 2026-09-08. This is the surface `npm audit` cannot reach, and
it is worse than the npm side:

| Image                               | Critical | High | Notable                                                            |
| ----------------------------------- | -------: | ---: | ------------------------------------------------------------------ |
| `ghcr.io/metaform/jad/controlplane` |        5 |   60 | openssl/libssl3/libcrypto3 → 3.5.6-r0, gnutls → 3.8.13-r0          |
| `ghcr.io/metaform/jad/identity-hub` |        5 |   60 | identical base-layer set                                           |
| `postgres:17.7-alpine`              |        3 |   43 | openssl → 3.5.6-r0, Go stdlib → 1.24.13                            |
| `neo4j:5.26.28-community`           |        4 |  300 | mostly **no fix available** (Debian `linux-libc-dev`, `perl-base`) |

Two readings of that table matter:

- The **EDC images carry fixable critical OpenSSL CVEs in their base layer**.
  They are rebuilt from Metaform sources (ADR-005), so the fix is a base-image
  rebuild in lockstep with the issue #97 EDC bump — not something we can patch
  from here.
- Neo4j's 300 highs are overwhelmingly unfixable Debian base CVEs. Do not treat
  that number as an action queue; `ignore-unfixed: true` is set in the CI scan
  for exactly this reason. The 4 criticals are also no-fix.

Keycloak's image was not scanned locally — the amd64 image under arm64 emulation
did not complete in reasonable time. The scheduled CI run covers it.

## Update queue

### Wave 1 — no manifest change, unblocks the push gate

`next` is declared `^15.5.14` and `next-auth` `^4.24.13`, so **15.5.21 and
4.24.15 are already inside the allowed range**. `npm update` takes them without
editing `package.json`:

```bash
cd ui && npm update next next-auth nanoid postcss sharp
cd services/neo4j-proxy && npm update path-to-regexp ip-address
```

This is a patch-level move, not the major auth upgrade described earlier in
issue #112 — that assessment was wrong and the issue has been corrected.

Verify: `npx tsc --noEmit -p tsconfig.build.json`, `npm run lint`, `npm test`,
then the **J180 Keycloak login journeys** specifically, because next-auth sits
directly on the login path (CLAUDE.md gotcha #5). Do not skip that last step
just because the version delta is small.

Avoid bare `npm audit fix`: the dry run removes 421 packages and pulls `next`
across a major boundary.

### Wave 2 — patch/minor infra bumps, one PR each

Neo4j 5.26.28 → 5.26.30, Postgres 17.7 → 17.9, NATS 2.14.3 → 2.14.6. Low risk;
bump the tag in compose **and** `scripts/azure/env.sh` together, and let the
scheduled image scan confirm the CVE count drops.

### Wave 3 — needs its own change window

- **Keycloak 26.6.4 → 26.7.3.** A minor. Re-import `jad/keycloak-realm.json`
  against the new version in a local container first and run the 7-persona
  password grant — the procedure is in the realm-drift runbook and was exercised
  on 2026-09-08 during the login incident.
- **Traefik v3.4 → v3.7.12.** Three minors; routing rules need review.
- **Vault 2.0 → 2.1.0.** Secrets are in-memory and re-bootstrapped, so the blast
  radius is a re-run of `bootstrap-jad.sh`.
- **Postgres major skew.** `env.sh` pins 16.14 while compose runs 17.7. The
  migration runbook exists (`runbooks/postgres-16-to-17-azure.md`); until it is
  executed, local and Azure differ by a major version. Note that ACA Postgres is
  ephemeral, so this is a rebuild rather than a data migration.
- **JAD / EDC images — now the highest-value item.** 5 criticals and 60 highs
  each on controlplane and identity-hub, all fixable base-layer packages
  (openssl 3.5.6-r0, gnutls 3.8.13-r0). These are built from Metaform sources
  per ADR-005, so closing them means a base-image rebuild alongside the issue
  #97 EDC bump. Raise it with the Metaform upstream if we do not control the
  rebuild.

## Open items

- Keycloak image CVE baseline is still missing — the local scan did not
  complete under arm64 emulation. The first scheduled `security-scan.yml` run
  fills it in.
- `npm audit` will keep failing pre-push until Wave 1 lands (issue #112).
- Confirm live ACA image tags once an `az login` session is available.

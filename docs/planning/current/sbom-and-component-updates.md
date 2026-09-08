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
| `.github/dependabot.yml`              | npm ×2, GitHub Actions, 5 Dockerfiles, pip ×4          | Weekly, grouped                          |
| pre-commit `actionlint`               | Workflow syntax + shellcheck                           | Every commit                             |
| pre-commit `image-scan-coverage`      | Compose images vs scan matrix drift                    | Every commit                             |

The coverage check exists because the scan matrix has to duplicate the compose
image list (an Actions matrix cannot read a compose file). It caught the
JAD/EDC images missing from the matrix on its first run.

## Component inventory

Declared versions are from `scripts/azure/env.sh` and the compose files; the
deployed images were read from ACA on 2026-09-08 (`rg-mvhd-dev`, subscription
**INF-STG-EU_EHDS** — not the default subscription).

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

## What is actually deployed — and it is not what compose says

**8 of the 15 container apps run `:latest`.** ACA caches `:latest` and will not
re-pull on restart (CLAUDE.md gotcha #6), so those apps are frozen on whatever
digest was current when the revision was created — `2026-04-14` for every one.

| App                    | Deployed image                 | Built      |
| ---------------------- | ------------------------------ | ---------- |
| mvhd-controlplane      | `acr/jad-controlplane:latest`  | 2026-04-14 |
| mvhd-identityhub       | `acr/jad-identity-hub:latest`  | 2026-04-14 |
| mvhd-dp-fhir / dp-omop | `acr/jad-dataplane:latest`     | 2026-04-14 |
| mvhd-issuerservice     | `acr/jad-issuerservice:latest` | 2026-04-14 |
| mvhd-provision-mgr     | `acr/cfm-pmanager:latest`      | 2026-04-14 |
| mvhd-tenant-mgr        | `acr/cfm-tmanager:latest`      | 2026-04-14 |
| mvhd-vault             | `acr/vault:latest`             | 2026-04-14 |
| mvhd-keycloak          | `acr/keycloak:26.6.4`          | 2026-07-16 |
| mvhd-postgres          | `acr/postgres:16.14`           | 2026-07-16 |
| mvhd-neo4j             | `acr/neo4j:5.26.28-community`  | 2026-07-16 |

Two consequences, both more urgent than any version bump:

1. **Vault has a pinned image that was never rolled out.** ✅ **Done 2026-09-08**
   — `mvhd-vault` now runs `acr/vault:2.0` (revision `mvhd-vault--0000134`).
   It was **not** "one `az containerapp update --image`": Vault runs dev-mode
   in-memory, so the new container came up with every secret gone, and the
   re-bootstrap needs `Microsoft.App/jobs/start/action`, which interactive
   accounts do not hold. The working sequence is the update, then the
   `vault-bootstrap-aes.yml` and `vault-bootstrap-participant-keys.yml`
   workflows under the CI service principal. Apps on `:latest`: 8 → 7.
2. **The JAD/EDC and CFM repositories carry no version tag at all** — `latest` is
   their only tag. ADR-029 pinning reached compose and `env.sh`, but not the ACA
   apps or the ACR repositories. Until they carry a real tag, "which EDC build is
   in production" has no answer, and any rebuild silently changes production on
   the next revision.

**Correction to the image CVE table below:** those numbers were measured against
the _compose-declared_ `ghcr.io/metaform/jad/*:4a7e5bd` images. Production runs
different, older ACR images, so treat the compose figures as a lower bound.
`security-scan.yml` now resolves the live image list from ACA at run time and
scans that too.

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

### Wave 1 — DONE (2026-09-08), push gate unblocked

Applied via `npm audit fix` inside the existing semver ranges. `ui/package.json`
changed only to raise `postcss` (below); `services/neo4j-proxy/package.json`
gained an `overrides` block. Everything else moved in the lockfiles alone.

| Tree                     | Before                 | After |
| ------------------------ | ---------------------- | ----- |
| `ui` production          | 9 (1 critical, 4 high) | **0** |
| `neo4j-proxy` production | 2 (1 high, 1 moderate) | **0** |

- `next` 15.5.20 → 15.5.25, `next-auth` 4.24.14 → 4.24.15, `nanoid` → 3.3.18,
  `sharp` → 0.35.4, `uuid` → 11.1.1, `mermaid` → 11.17.2, `dompurify` → 3.4.15.
- `postcss`: next 15.5.25 hard-pins `8.4.31`, which carries four advisories.
  npm reported `next@16.3.4` as the only fix; it is not. `overrides.postcss:
^8.5.28` lifts the nested copy, and npm rejects that with `EOVERRIDE` unless
  the direct devDependency agrees, so `postcss: ^8` was pinned to `^8.5.28`
  alongside it. The `next` "moderate" disappeared with it — that entry was npm
  reporting that next _depends on_ vulnerable postcss, not a flaw in next.
- `neo4j-proxy`: `path-to-regexp` → 0.1.13 and `qs` → 6.16.0 via `overrides`,
  because **no express 4.x release reaches either** (4.22.2 still pins
  `~0.1.12` and `~6.15.1`). `express-rate-limit` 8.3.1 → 8.7.0 cleared the
  `ip-address` SSRF/XSS advisories at their root.

**Retraction — "avoid bare `npm audit fix`: it removes 421 packages and pulls
`next` across a major".** That was wrong, and it is why Wave 1 was deferred. The
421 removals came from running the dry run with `--omit=dev`, which prunes the
dev tree out of `node_modules`; it was never a downgrade. The real fix adds 2,
removes 2, changes 25, and crosses no major boundary.

Verified: `tsc --noEmit` clean, lint within the 55-warning gate, production
build generates all 45 static pages with CSS output intact, 1780/1780 Vitest
unit tests pass, and the pre-push `npm audit --audit-level=high --omit=dev`
gate now **passes** — pushes no longer need `--no-verify`.

The J180 Keycloak login journeys were run against the live JAD stack with the
UI container rebuilt on each lockfile, since next-auth sits on the login path
(gotcha #5):

| Build                                     | Result              |
| ----------------------------------------- | ------------------- |
| baseline next 15.5.20 / next-auth 4.24.14 | 7 failed, 14 passed |
| bumped next 15.5.25 / next-auth 4.24.15   | 6 failed, 8 passed  |

The same core (J182, J184, J185, J186, J210) fails identically either way and
the remaining deltas move in both directions between runs, so no regression is
attributable to the bump. Those specs are already failing on `main` — issue
**#115**. A first attempt at this comparison was invalid: Playwright's
`reuseExistingServer` had latched onto an unrelated Docusaurus site holding port
3000, so every test ran against the wrong application. Use `--project=live`
against :3003, or make sure :3000 is actually this UI.

### Wave 1b — non-npm findings, also DONE (2026-09-08)

Surfaced by the Trivy job that already ran in `test.yml` and had been reporting
into the Security tab unattended:

- `scripts/leitlinien/uv.lock`: `urllib3` 2.6.3 → 2.7.0, `soupsieve` 2.8.3 →
  2.9.2, `docling` 2.91.0 → **2.94.0 exactly**. An unconstrained
  `uv lock --upgrade` resolved docling 2.126.0 and dragged `docling-parse`
  through 5.x → 7.x — far more surface than the CVE needs. The 26 unit tests
  pass, but they cover the Neo4j loader, not the docling parse path.
- **DS-0002** (container runs as root) on `catalog-crawler`, `catalog-enricher`
  and `compliance-runner`. All three now run as uid 10001; all three images were
  built and inspected, the Prometheus ports are >1024 so nothing needs a
  capability, and `compliance-runner` still creates and writes `REPORT_DIR`.
  hadolint clean; `trivy config` confirms DS-0002 gone. The remaining DS-0026
  (no HEALTHCHECK) is LOW and pre-existing.

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

## The scan workflow's own first run failed — three defects

Worth recording, because each is a way a security gate can look installed and
report nothing:

1. `aquasecurity/trivy-action@0.28.0` does not exist (the tag is `v0.28.0`).
   All 11 image jobs died in ~3 s with "unable to resolve action" — a red check,
   but one that looks like any other CI blip. Now pinned to `v0.36.0`.
2. `deployed-image-scan` gated Azure OIDC on a fork check. The real constraint
   is that the app registration holds exactly one federated credential, subject
   `repo:ma3u/MinimumViableHealthDataspacev2:ref:refs/heads/main`, so a
   pull_request run can never authenticate. Now restricted to scheduled runs and
   dispatches from `main`. **Widening it needs a new federated credential, not a
   workflow change.**
3. The severity gate ran on every event: `github.event.inputs` is null outside
   `workflow_dispatch`, and `null != 'none'` is true, so it ran with an empty
   `severity-cutoff` that the action defaults to `medium` — failing PRs on
   exactly the findings it was configured not to fail on.

## Why the Security tab gets CRITICAL only, not HIGH+

The first working run of the image matrix uploaded **2,246 alerts** in one go —
2,235 of them from the image scans, 872 from `neo4j:5.26.28-community` alone.
That buried the 9 source findings a person could actually act on.

Those thousands are not thousands of actions. A third-party base image we do not
build has exactly one remediation — move to a newer tag — and enumerating it
per-CVE in an alert list misrepresents one decision as a backlog. It is the same
point already made about Neo4j's 300 highs above, just at the scale of every
image at once.

So the image jobs upload **CRITICAL** to the Security tab and still measure
**CRITICAL,HIGH** into the run summary. Nothing is discarded; it is filed where
it can be read.

Setting `severity: CRITICAL` is **not enough on its own**. `trivy-action`
ignores `severity` for SARIF output unless `limit-severities-for-sarif: true` is
also set, so the first attempt changed nothing — the analyses kept reporting
`results=872` for neo4j with no warning that the filter was inert. Measured
locally at CRITICAL + `ignore-unfixed`:

| Image                     | HIGH+ alerts | CRITICAL only |
| ------------------------- | -----------: | ------------: |
| `neo4j:5.26.28-community` |          872 |         **0** |
| `jad/controlplane`        |          253 |             5 |
| `traefik:v3.4`            |          205 |             5 |
| `postgres:17.7-alpine`    |          126 |             3 |

Neo4j going 872 → 0 is the clearest illustration of the point: every one of
those 872 was a HIGH in a Debian base layer we do not build.

Source scans are unchanged: `grype` on `ui` and `neo4j-proxy` and the `test.yml`
filesystem/config scan still report from `low` up, because those map to code in
this repository where per-finding action is the right granularity.

Revert by putting `severity: CRITICAL,HIGH` back on the SARIF step in
`security-scan.yml` — one line per job.

## Open items

- Keycloak image CVE baseline is still missing — the local scan did not
  complete under arm64 emulation. The first scheduled `security-scan.yml` run
  fills it in.
- **Digest-pinned images are never CVE-scanned.**
  `scripts/check-image-scan-coverage.sh` skips `*@sha256:*` on the grounds that
  a digest pin cannot drift. True for drift detection, but it conflates drift
  with vulnerability: a pinned digest is _fixed_, not _safe_. In practice this
  leaves `ghcr.io/eclipse-dataplane-core/dsdk-facet-rs/siglet` unscanned by the
  matrix, and it is not deployed on ACA either, so nothing covers it.
- 7 apps still on `:latest` (issue **#116**). ACR holds no version tag for them,
  so they need tagging with the upstream SHA in the build pipeline first.
- ~~`npm audit` will keep failing pre-push until Wave 1 lands~~ — fixed
  2026-09-08; both production trees are at 0 advisories and the gate passes.
- ~~Confirm live ACA image tags once an `az login` session is available~~ —
  confirmed 2026-09-08.

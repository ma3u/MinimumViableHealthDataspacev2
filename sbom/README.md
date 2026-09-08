# SBOM

CycloneDX 1.6 software bills of materials for this repository.

**The `*.cdx.json` files here are generated and git-ignored.** They are
reproducible from the tree at any commit, and a 780 KB JSON that churns on every
dependency bump makes for unreadable diffs. CI publishes them instead:
`.github/workflows/security-scan.yml` attaches an SBOM artifact to every run and
uploads the CVE results to the **Security → Code scanning** tab.

If your compliance process requires a _versioned_ SBOM rather than a build
artifact — plausible here given the BSI C5 controls already referenced in
`.pre-commit-config.yaml` — attach the generated files to the GitHub Release for
the tag being certified. That gives an immutable, dated artifact tied to a
specific commit without polluting the branch history.

## Generating

```bash
./scripts/generate-sbom.sh            # source trees only — fast, no image pulls
./scripts/generate-sbom.sh --scan     # + grype vulnerability scan
./scripts/generate-sbom.sh --images   # + one SBOM per container image (slow)
```

Requires `syft`; `--scan` also needs `grype`:

```bash
brew install syft grype
```

## What is covered

| SBOM                   | Source                              | Components (2026-09-08) |
| ---------------------- | ----------------------------------- | ----------------------- |
| `ui.cdx.json`          | `ui/` — Next.js app                 | 642                     |
| `neo4j-proxy.cdx.json` | `services/neo4j-proxy/`             | 95                      |
| `image-*.cdx.json`     | Each image in `docker-compose*.yml` | `--images` only         |

Container images are the reason this exists separately from `npm audit`: the npm
audit gate cannot see Keycloak, Postgres, Neo4j, NATS, Traefik, Vault, or the
JAD/EDC images, and Dependabot only reads Dockerfile `FROM` lines — not
`docker-compose*.yml`. `scripts/check-image-scan-coverage.sh` runs in pre-commit
to keep the CI scan matrix in step with the compose files.

Current findings and the prioritised update queue live in
[`docs/planning/current/sbom-and-component-updates.md`](../docs/planning/current/sbom-and-component-updates.md).

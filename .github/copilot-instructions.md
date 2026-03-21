# Project Guidelines

Health Dataspace v2: an EHDS-compliant demo using EDC-V, DCore, CFM, Neo4j,
FHIR R4, and OMOP CDM. See `docs/planning-health-dataspace-v2.md` for the
full roadmap.

## Code Style

- **Markdown** (`.md`): headings, fenced code blocks, ~80 char line wrap,
  clean tables.
- **Cypher** (`.cypher`): `UPPER_SNAKE_CASE` relationship types, `PascalCase`
  node labels, `camelCase` properties. Use idempotent `MERGE` (not `CREATE`)
  for data operations.
- **TypeScript** (UI + neo4j-proxy): strict mode, `@/*` path alias maps to
  `ui/src/*`. Follow existing ESLint rules (`next/core-web-vitals` +
  `@typescript-eslint/recommended`). Prefix unused vars with `_`.
- **Bash** (seed/bootstrap scripts): use `set -euo pipefail`, quote variables.
- Prettier auto-formats `.md`, `.yaml`, `.json`, `.ts`, `.tsx` via pre-commit
  hooks.

## Architecture

- `docs/planning-health-dataspace-v2.md` — multi-phase implementation roadmap
  (EDC-V + DCore + CFM + Neo4j).
- `docs/health-dataspace-graph-schema.md` — 5-layer Neo4j graph schema
  (Marketplace → HealthDCAT-AP → FHIR → OMOP → Ontology).
- `ui/` — Next.js 14 App Router, React 18, Tailwind CSS 3, NextAuth v4.
- `services/neo4j-proxy/` — Express/TypeScript bridge between DCore data
  planes and Neo4j (FHIR bundles, OMOP cohort queries, HealthDCAT-AP catalog).
- `jad/` — JAD stack configs: EDC-V Control Plane, 2× DCore Data Planes
  (FHIR push + OMOP pull), IdentityHub, IssuerService, CFM agents, Keycloak,
  Vault, NATS, PostgreSQL.
- `neo4j/init-schema.cypher` — all Neo4j constraints and indexes for the
  5-layer model.
- `docker-compose.yml` — Neo4j 5 + UI.
- `docker-compose.jad.yml` — full JAD dataspace stack (~14 services).

## Build and Test

```bash
# ── Neo4j only (graph explorer) ──
docker compose up -d
cat neo4j/init-schema.cypher | docker exec -i health-dataspace-neo4j \
  cypher-shell -u neo4j -p healthdataspace

# ── Full JAD stack (all dataspace services) ──
docker compose -f docker-compose.yml -f docker-compose.jad.yml up -d
# Bootstrap + seed (idempotent):
./scripts/bootstrap-jad.sh
./jad/seed-all.sh          # 7 sequential phases; --from N / --only N

# ── UI (Next.js) ──
cd ui && npm install
npm run dev                 # http://localhost:3000
npm run build               # production build
npm run lint                # ESLint (max 55 warnings in CI)

# ── Tests ──
cd ui && npm test           # Vitest unit tests
npm run test:coverage       # with v8 coverage
npm run test:e2e            # Playwright e2e (needs running UI + Neo4j)

# ── Neo4j proxy ──
cd services/neo4j-proxy && npm install && npm run dev

# ── Pre-commit checks ──
pre-commit install                  # install hooks (once)
pre-commit install --hook-type pre-push  # install pre-push hooks (once)
pre-commit run --all-files          # run all hooks manually
```

## Pre-commit Hooks

Configured in `.pre-commit-config.yaml`. Install with
`pre-commit install && pre-commit install --hook-type pre-push`.

**Pre-commit stage (on every commit):**

| Hook                                 | Purpose                                       |
| ------------------------------------ | --------------------------------------------- |
| trailing-whitespace                  | Strip trailing spaces                         |
| end-of-file-fixer                    | Ensure files end with newline                 |
| check-yaml / check-json              | Validate syntax                               |
| check-added-large-files              | Block files > 5 MB                            |
| check-merge-conflict                 | Catch unresolved conflict markers             |
| detect-private-key                   | Prevent accidental key commits                |
| check-case-conflict                  | Prevent case-only filename conflicts          |
| check-symlinks                       | Verify symlinks point to valid targets        |
| check-executables-have-shebangs      | Ensure executables have shebangs              |
| check-shebang-scripts-are-executable | Ensure shebanged scripts are +x               |
| no-commit-to-branch                  | Block direct commits to `main`                |
| shellcheck                           | Lint shell scripts (error severity)           |
| hadolint-docker                      | Lint Dockerfiles                              |
| prettier                             | Format MD, YAML, JSON, TS, TSX                |
| tsc-ui                               | TypeScript type-check (`tsconfig.build.json`) |
| eslint-ui                            | ESLint with max 55 warnings                   |

**Pre-push stage:**

| Hook      | Purpose                                       |
| --------- | --------------------------------------------- |
| vitest-ui | Run full Vitest suite (bail on first failure) |

**Key notes:**

- `no-commit-to-branch` blocks direct commits to `main` — use feature
  branches and PRs.
- `tsc-ui` uses `tsconfig.build.json` (excludes test files) to avoid
  false positives from Vitest type patterns.
- To skip a hook temporarily: `SKIP=hook-id git commit -m "msg"`

## Project Conventions

- Maintain existing tone and formatting when editing Markdown.
- Use relative links between documents.
- Schema changes in `.md` must be reflected in `neo4j/init-schema.cypher`.
- Keep `docker-compose.yml` in sync with technical requirements in `README.md`.
- UI tests live in `ui/__tests__/unit/` (Vitest) and `ui/__tests__/e2e/`
  (Playwright). Name test files `*.test.ts(x)`.
- API mocks use MSW (Mock Service Worker) — see `ui/__tests__/setup.ts`.
- Neo4j proxy tests live alongside source in `services/neo4j-proxy/`.

## Key Pitfalls

- **Vault secrets are in-memory**: lost on Docker restart; the bootstrap
  sidecar re-provisions idempotently.
- **Seed order matters**: JAD seed phases 1–7 must run sequentially.
  FHIR data must exist before OMOP transformation.
- **GitHub Pages static export**: API routes (`src/app/api/`) are disabled
  during Pages build — the workflow renames the folder. Never assume API
  routes work in the static export.
- **`init-schema.cypher` uses IF NOT EXISTS**: safe to re-run, but indexes
  are immutable after creation.
- **Resource requirements**: 8+ GB Docker RAM for full JAD stack; ports
  80, 4222, 5432, 7474, 7687, 8080, 8200 must be free.

## Integration Points

- **Neo4j 5** (Community Edition) — Bolt on port 7687, Browser on port 7474.
- **Neo4j Query Proxy** — Express service on port 9090 bridging DCore ↔
  Neo4j (`/fhir/Patient/{id}/$everything`, `/omop/cohort`,
  `/catalog/datasets`).
- **Synthea** — synthetic FHIR patient data (Phase 3):
  `scripts/generate-synthea.sh`.
- **Eclipse EDC-V / DCore / CFM** — dataspace connector stack.
  Traefik routes services via `*.localhost`.
- **Keycloak** — OIDC provider with `EDCV` realm, 6 role-based client
  scopes. Middleware enforces role-based routes in the UI.
- **GitHub Pages Deployment** — `.github/workflows/pages.yml` builds a
  static export. `basePath` is set dynamically in `next.config.js` inside
  GitHub Actions.

## Security

- No patient data or credentials in the repository.
- Default Neo4j credentials (`neo4j/healthdataspace`) are for local dev only.
- Production credentials must use `.env` files (excluded via `.gitignore`).

## Trademark Policy

All demo participant names must use fictional organisations only — no real
company, hospital, regulatory-agency, or research-institute trademarks are
permitted.

**Approved fictional participants:**

| Role                   | Fictional Name              | Country | Domain slug     |
| ---------------------- | --------------------------- | ------- | --------------- |
| DATA_HOLDER (Clinic)   | AlphaKlinik Berlin          | DE      | alpha-klinik.de |
| DATA_USER (CRO/Pharma) | PharmaCo Research AG        | DE      | pharmaco.de     |
| HDAB (Authority)       | MedReg DE                   | DE      | medreg.de       |
| DATA_HOLDER (Clinic)   | Limburg Medical Centre      | NL      | lmc.nl          |
| HDAB (Research)        | Institut de Recherche Santé | FR      | irs.fr          |

**Forbidden trademarks:** Charité, Bayer, BfArM, Zuyderland, INSERM, and
any other real organisation names. If a new participant is needed, invent a
fictional name and add it to this table.

**DID conventions for fictional participants:**

- `did:web:alpha-klinik.de:participant`
- `did:web:pharmaco.de:research`
- `did:web:medreg.de:hdab`
- `did:web:lmc.nl:clinic`
- `did:web:irs.fr:hdab`

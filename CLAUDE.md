# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Project Is

A reference implementation of the **European Health Data Space (EHDS)** regulation. It demonstrates an end-to-end health data governance system combining DSP Dataspace Protocol, FHIR R4 clinical data, OMOP CDM analytics, and biomedical ontologies in a single Neo4j knowledge graph. Runs locally with 127 synthetic patients and 5300+ graph nodes.

## Build & Development Commands

### UI (Next.js 14)

```bash
cd ui && npm install
npm run dev          # http://localhost:3000
npm run build        # production build
npm run lint         # ESLint (max 55 warnings in CI)
npx tsc --noEmit     # TypeScript type check
```

### Neo4j Query Proxy (Express + TypeScript)

```bash
cd services/neo4j-proxy && npm install
npm run dev          # dev with tsx watch
npm run build        # TypeScript compilation
```

### Starting the Stack

```bash
# Minimal: Neo4j + UI only
docker compose up -d
cat neo4j/init-schema.cypher | docker exec -i health-dataspace-neo4j \
  cypher-shell -u neo4j -p healthdataspace
cat neo4j/insert-synthetic-schema-data.cypher | docker exec -i health-dataspace-neo4j \
  cypher-shell -u neo4j -p healthdataspace

# Full JAD stack (19 services, needs 8+ GB Docker RAM)
docker compose -f docker-compose.yml -f docker-compose.jad.yml up -d
./scripts/bootstrap-jad.sh
./jad/seed-all.sh          # 7 sequential phases
./jad/seed-all.sh --from 3 # resume from phase 3
./jad/seed-all.sh --only 4 # run only phase 4
```

### Pre-commit Hooks

```bash
pre-commit install                            # install (once)
pre-commit install --hook-type pre-push      # install pre-push hooks (once)
pre-commit run --all-files                   # run manually
SKIP=hook-id git commit -m "msg"            # skip a specific hook
```

Pre-commit runs: Prettier (MD/YAML/JSON/TS/TSX), shellcheck, hadolint, TypeScript type-check, ESLint.
Pre-push runs: full Vitest suite (bail on first failure).

## Testing

### Unit Tests (Vitest)

```bash
cd ui && npm test                                         # run once
npm run test:watch                                        # watch mode
npm run test:coverage                                     # with v8 coverage

# Run a single test file
npx vitest run __tests__/unit/components/Navigation.test.tsx

cd services/neo4j-proxy && npm test                      # proxy tests
```

### E2E Tests (Playwright)

```bash
cd ui && npm run test:e2e                                 # needs running UI + Neo4j
npm run test:e2e:ui                                       # interactive UI mode
npx playwright test __tests__/e2e/graph-explorer.spec.ts # single spec

# Against live JAD stack
PLAYWRIGHT_BASE_URL=http://localhost:3003 npm run test:e2e
```

### Compliance Tests

```bash
./scripts/run-dsp-tck.sh      # DSP 2025-1 TCK
./scripts/run-dcp-tests.sh    # DCP v1.0 compliance
./scripts/run-ehds-tests.sh   # EHDS domain tests
```

## Architecture

### 5-Layer Neo4j Knowledge Graph

```
Layer 1: Dataspace Marketplace  — DataProduct → OdrlPolicy → Contract → HDABApproval
Layer 2: HealthDCAT-AP Metadata — Catalogue → Dataset → Distribution → DataService
Layer 3: FHIR R4 Clinical       — Patient → Encounter → Condition → Observation → Medication
Layer 4: OMOP CDM Analytics     — OMOPPerson → ConditionOccurrence → DrugExposure
Layer 5: Biomedical Ontology    — SNOMED CT / ICD-10-CM / RxNorm / LOINC (CODED_BY edges)
```

All cross-layer relationships form the connective tissue. Schema is in `neo4j/init-schema.cypher` (uses `IF NOT EXISTS` — safe to re-run).

### Service Topology

| Component                   | Purpose                              | Port        |
| --------------------------- | ------------------------------------ | ----------- |
| Neo4j 5 Community           | Knowledge graph (Bolt + Browser)     | 7687 / 7474 |
| `services/neo4j-proxy`      | Express bridge: DCore ↔ Neo4j       | 9090        |
| UI (`ui/`)                  | Next.js 14 with 6 domain views       | 3000        |
| EDC-V Control Plane         | DSP governance & contract management | via Traefik |
| DCore Data Planes (×2)      | FHIR push + OMOP pull                | via Traefik |
| CFM                         | Audit trail & compliance logging     | via Traefik |
| IdentityHub + IssuerService | DID & Verifiable Credentials         | via Traefik |
| Keycloak                    | OIDC with 6 role-based personas      | 80          |
| Vault                       | Secret management (in-memory)        | 8200        |
| NATS                        | Async event bus                      | 4222        |
| PostgreSQL                  | Metadata for all JAD services        | 5432        |

Traefik routes services via `*.localhost` hostnames.

### UI Views (`ui/src/app/`)

| Route         | Purpose                                         |
| ------------- | ----------------------------------------------- |
| `/graph`      | Force-directed visualization of all 5 layers    |
| `/catalog`    | HealthDCAT-AP dataset catalogue                 |
| `/compliance` | DSP contract trace (DataProduct → HDABApproval) |
| `/patient`    | FHIR R4 timeline + OMOP CDM mapping             |
| `/analytics`  | OMOP cohort statistics and charts               |
| `/eehrxf`     | EU FHIR profile alignment scores                |
| `/admin`      | JAD service health and metrics                  |
| `/onboarding` | Participant registration                        |

API routes in `ui/src/app/api/` (18 routes). These are **disabled** in GitHub Pages static export — the workflow renames the folder.

### Neo4j Proxy Endpoints

`/fhir/Patient/{id}/$everything`, `/omop/cohort`, `/catalog/datasets` — bridges DCore data planes to Neo4j.

## Code Conventions

### Cypher

- Node labels: `PascalCase`
- Relationship types: `UPPER_SNAKE_CASE`
- Properties: `camelCase`
- Always use idempotent `MERGE`, not `CREATE`
- Schema changes in `.md` docs **must** be reflected in `neo4j/init-schema.cypher`

### TypeScript

- Strict mode throughout; `@/*` alias maps to `ui/src/*`
- Prefix unused variables with `_`
- Test files: `*.test.ts(x)`, placed in `ui/__tests__/unit/` (Vitest) or `ui/__tests__/e2e/` (Playwright)
- API mocks use MSW (Mock Service Worker) — see `ui/__tests__/setup.ts`

### Bash Scripts

- Always use `set -euo pipefail` and quote all variables
- shellcheck runs at error severity in pre-commit

## Key Pitfalls

- **Vault secrets are in-memory**: lost on Docker restart. Re-run `./scripts/bootstrap-jad.sh` (idempotent).
- **JAD seed order is strict**: phases 1–7 must run sequentially. FHIR data must exist before OMOP transformation.
- **GitHub Pages static export disables API routes**: never assume API routes work in the static build.
- **Port conflicts**: ports 80, 4222, 5432, 7474, 7687, 8080, 8200 must be free for the full JAD stack.
- **`tsc-ui` uses `tsconfig.build.json`** (not `tsconfig.json`) to exclude test files from the pre-commit type check.

## Integration Notes

- **Keycloak realm**: `EDCV` with 6 role-based client scopes. Middleware at `ui/src/middleware.ts` enforces role-based route protection.
- **Synthea** generates synthetic FHIR patients: `scripts/generate-synthea.sh`.
- **DID conventions**: `did:web:alpha-klinik.de:participant`, `did:web:pharmaco.de:research`, `did:web:medreg.de:hdab`, etc.
- **GitHub Pages**: `basePath` set dynamically in `next.config.js` inside the Actions workflow.
- Default Neo4j credentials (`neo4j` / `healthdataspace`) are for local dev only.

## Trademark Policy

All demo participants must use **fictional organisations only**.

| Role                 | Fictional Name              | DID                                   |
| -------------------- | --------------------------- | ------------------------------------- |
| DATA_HOLDER (Clinic) | AlphaKlinik Berlin          | `did:web:alpha-klinik.de:participant` |
| DATA_USER (Pharma)   | PharmaCo Research AG        | `did:web:pharmaco.de:research`        |
| HDAB (Authority)     | MedReg DE                   | `did:web:medreg.de:hdab`              |
| DATA_HOLDER (Clinic) | Limburg Medical Centre      | `did:web:lmc.nl:clinic`               |
| HDAB (Research)      | Institut de Recherche Santé | `did:web:irs.fr:hdab`                 |

Forbidden: Charité, Bayer, BfArM, Zuyderland, INSERM, or any real organisation name. Add new fictional names to `copilot-instructions.md`.

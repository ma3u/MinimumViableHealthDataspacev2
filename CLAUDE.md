# CLAUDE.md

EHDS regulation reference implementation: DSP Dataspace Protocol + FHIR R4 + OMOP CDM + biomedical
ontologies unified in a Neo4j knowledge graph. 127 synthetic patients, 5300+ graph nodes.

## Build Commands

```bash
# UI (Next.js 14) — primary working area
cd ui && npm install
npm run dev            # http://localhost:3000
npm run build          # production build
npm run lint           # ESLint — CI threshold: max 55 warnings
npx tsc --noEmit       # type-check (uses tsconfig.json)
npx tsc --noEmit -p tsconfig.build.json  # pre-commit type-check (excludes tests)

# Neo4j proxy (Express + TypeScript)
cd services/neo4j-proxy && npm run dev   # port 9090

# Minimal stack: Neo4j + UI
docker compose up -d
cat neo4j/init-schema.cypher | docker exec -i health-dataspace-neo4j \
  cypher-shell -u neo4j -p healthdataspace
cat neo4j/insert-synthetic-schema-data.cypher | docker exec -i health-dataspace-neo4j \
  cypher-shell -u neo4j -p healthdataspace

# Full JAD stack (19 services — needs 8 GB Docker RAM)
docker compose -f docker-compose.yml -f docker-compose.jad.yml up -d
./scripts/bootstrap-jad.sh
./jad/seed-all.sh              # phases 1–7 (sequential, strict order)
./jad/seed-all.sh --from 3     # resume from phase 3
```

## Testing

```bash
cd ui
npm test                          # Vitest unit (once)
npm run test:watch                # Vitest watch
npm run test:coverage             # v8 coverage
npx vitest run __tests__/unit/components/Navigation.test.tsx  # single file

npm run test:e2e                  # Playwright (needs running UI + Neo4j)
npm run test:e2e:ui               # Playwright interactive
npx playwright test __tests__/e2e/journeys/19-static-github-pages.spec.ts

PLAYWRIGHT_BASE_URL=http://localhost:3003 npm run test:e2e  # against JAD stack

# Compliance suites (run by CI weekly)
./scripts/run-dsp-tck.sh          # DSP 2025-1 TCK
./scripts/run-dcp-tests.sh        # DCP v1.0
./scripts/run-ehds-tests.sh       # EHDS domain
```

## Architecture

### 5-Layer Neo4j Knowledge Graph

```
L1 Dataspace Marketplace  — Participant → DataProduct → OdrlPolicy → Contract → HDABApproval
L2 HealthDCAT-AP Metadata — Catalogue → Dataset → Distribution → DataService
L3 FHIR R4 Clinical       — Patient → Encounter → Condition → Observation → MedicationRequest
L4 OMOP CDM Analytics     — OMOPPerson → ConditionOccurrence → DrugExposure → Measurement
L5 Biomedical Ontology    — SnomedConcept / ICD10Code / RxNormConcept / LoincCode (CODED_BY)
```

Schema: `neo4j/init-schema.cypher` — idempotent (`MERGE`/`IF NOT EXISTS`), safe to re-run.

### Key Services

| Service           | Purpose                         | Port        |
| ----------------- | ------------------------------- | ----------- |
| Neo4j 5 Community | Knowledge graph                 | 7687 / 7474 |
| neo4j-proxy       | Express bridge: DCore ↔ Neo4j  | 9090        |
| UI                | Next.js 14                      | 3000        |
| Keycloak          | OIDC (realm `edcv`, 7 personas) | 8080        |
| Vault             | Secrets (in-memory)             | 8200        |
| NATS              | Async event bus                 | 4222        |
| PostgreSQL        | JAD service metadata            | 5432        |

Traefik routes JAD services via `*.localhost` hostnames.

## Key Directories

```
ui/src/app/             — Next.js 14 app router (16 pages, 36 API routes)
ui/src/app/api/         — API routes — DISABLED in static export (workflow renames folder)
ui/src/lib/             — auth.ts, api.ts, use-demo-persona.ts, graph-constants.ts
ui/src/components/      — Navigation.tsx, UserMenu.tsx, shared UI components
ui/__tests__/unit/      — Vitest tests (MSW mocks via __tests__/setup.ts)
ui/__tests__/e2e/       — Playwright specs (journeys/ subdirectory)
ui/public/mock/         — JSON fixtures served in NEXT_PUBLIC_STATIC_EXPORT=true mode
neo4j/                  — init-schema.cypher, insert-synthetic-schema-data.cypher
services/neo4j-proxy/   — Express FHIR/OMOP bridge
docs/                   — Architecture docs, persona journeys, planning phases
jad/                    — JAD stack seed scripts (phases 1–7)
scripts/                — bootstrap-jad.sh, generate-synthea.sh, compliance runners
k8s/                    — OrbStack / Kubernetes manifests
```

## Coding Conventions

**Cypher:** Labels `PascalCase` · Relationships `UPPER_SNAKE_CASE` · Properties `camelCase` ·
Always `MERGE`, never `CREATE` · Schema doc changes must mirror `neo4j/init-schema.cypher`

**TypeScript:** Strict mode · `@/*` → `ui/src/*` · Unused vars prefixed `_` ·
Unit tests in `ui/__tests__/unit/` · E2E tests in `ui/__tests__/e2e/journeys/`

**Bash scripts:** `set -euo pipefail` + quote all variables · shellcheck at error severity

**Fictional orgs only:** AlphaKlinik Berlin, PharmaCo Research AG, MedReg DE, Limburg Medical Centre,
Institut de Recherche Santé. Never use real names (Charité, Bayer, BfArM, etc.).

## Top 5 Gotchas

1. **Vault secrets lost on Docker restart** — Vault is in-memory only. Re-run
   `./scripts/bootstrap-jad.sh` (idempotent) after any `docker compose down`.

2. **JAD seed phases are strictly ordered** — Phases 1–7 must run sequentially.
   FHIR data must exist before OMOP transformation (phase 4 depends on phase 3).

3. **Static export disables API routes** — GitHub Pages workflow runs
   `mv src/app/api /tmp/api_disabled` before building. Never assume API routes work
   in the static build; use `NEXT_PUBLIC_STATIC_EXPORT` guards and `ui/public/mock/*.json`.

4. **Pre-commit Prettier auto-reformats staged files** — After prettier runs you must
   `git add` the reformatted files before the commit succeeds. Pre-push runs full Vitest.

5. **Keycloak `wellKnown` vs `issuer` split** — In Docker, `KEYCLOAK_SERVER_URL` must use
   the internal hostname (`http://keycloak:8080`) for token discovery; `KEYCLOAK_PUBLIC_URL`
   uses `localhost:8080` for browser redirects. Mixing them causes `?error=keycloak` on sign-in.
   See `ui/src/lib/auth.ts` `wellKnown` field.

6. **Keycloak client must be confidential, not public** — `health-dataspace-ui` is configured
   as `publicClient: false` with `secret: "health-dataspace-ui-secret"` in `jad/keycloak-realm.json`.
   NextAuth always sends `client_secret` in the token exchange; if the Keycloak client is
   `publicClient: true`, Keycloak rejects the secret and the callback fails with `?error=OAuthCallback`.
   PKCE (`pkce.code.challenge.method: S256`) must NOT be set for confidential clients.

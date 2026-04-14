# Developer Onboarding Guide

## Welcome & Overview

The EHDS Integration Hub is a reference implementation of the **European Health Data Space (EHDS) regulation**. It demonstrates how health data can be shared across organizations while preserving sovereignty, consent, and regulatory compliance.

The system unifies:

- **DSP (Dataspace Protocol) 2025-1** — contract negotiation and data transfer
- **FHIR R4** — clinical data exchange
- **OMOP CDM v5.4** — observational analytics
- **Biomedical ontologies** (SNOMED CT, ICD-10, RxNorm, LOINC)
- **Neo4j knowledge graph** — 127 synthetic patients, 5300+ nodes across 5 layers

The project serves as a testbed for EHDS Articles 3-12 (primary use / patient rights) and Articles 50-51 (secondary use / research), with full DID:web identity, ODRL policy enforcement, and HDAB approval workflows.

---

## First Day Checklist

### Prerequisites

| Tool           | Version | Purpose                               |
| -------------- | ------- | ------------------------------------- |
| Node.js        | 18+     | UI and proxy                          |
| Docker Desktop | 4.x     | Neo4j, Keycloak, services             |
| Git            | 2.x     | Version control (15 pre-commit hooks) |
| npm            | 9+      | Package management                    |

Allocate **8 GB RAM** to Docker if you plan to run the full JAD stack (19 services).

### Clone and Minimal Stack Setup

```bash
# Clone the repository
git clone https://github.com/ma3u/MinimumViableHealthDataspacev2.git
cd MinimumViableHealthDataspacev2

# Start Neo4j
docker compose up -d

# Seed the knowledge graph (idempotent, safe to re-run)
cat neo4j/init-schema.cypher | docker exec -i health-dataspace-neo4j \
  cypher-shell -u neo4j -p healthdataspace
cat neo4j/insert-synthetic-schema-data.cypher | docker exec -i health-dataspace-neo4j \
  cypher-shell -u neo4j -p healthdataspace

# Start the UI
cd ui && npm install
npm run dev
# Open http://localhost:3000
```

### Full JAD Stack (optional, 19 services)

```bash
docker compose -f docker-compose.yml -f docker-compose.jad.yml up -d
./scripts/bootstrap-jad.sh
./jad/seed-all.sh   # phases 1-7, strictly sequential
```

---

## Understanding the Architecture

### 5-Layer Neo4j Knowledge Graph

| Layer | Domain                 | Key Nodes                                                     |
| ----- | ---------------------- | ------------------------------------------------------------- |
| L1    | Dataspace Marketplace  | Participant, DataProduct, OdrlPolicy, Contract, HDABApproval  |
| L2    | HealthDCAT-AP Metadata | Catalogue, Dataset, Distribution, DataService                 |
| L3    | FHIR R4 Clinical       | Patient, Encounter, Condition, Observation, MedicationRequest |
| L4    | OMOP CDM Analytics     | OMOPPerson, ConditionOccurrence, DrugExposure, Measurement    |
| L5    | Biomedical Ontology    | SnomedConcept, ICD10Code, RxNormConcept, LoincCode            |

Schema definition: `neo4j/init-schema.cypher`

### Key Services

| Service         | Port        | Purpose                            |
| --------------- | ----------- | ---------------------------------- |
| Neo4j 5         | 7474 / 7687 | Knowledge graph                    |
| neo4j-proxy     | 9090        | Express bridge (FHIR/OMOP queries) |
| UI (Next.js 14) | 3000        | Frontend                           |
| Keycloak        | 8080        | OIDC authentication                |
| Vault           | 8200        | Secrets (in-memory dev mode)       |
| NATS            | 4222        | Async event bus                    |
| PostgreSQL      | 5432        | JAD service metadata               |

Architecture documentation: `docs/` directory and ADRs in `docs/ADRs/`.

---

## Development Workflow

### Branch Strategy

- `main` — production branch, deploys to GitHub Pages
- Feature branches — `feature/description` or `fix/description`
- Create PRs against `main`

### Pre-commit Hooks (15 hooks)

The project uses pre-commit with hooks including:

- Prettier formatting (`.md`, `.yaml`, `.json`, `.ts`, `.tsx`)
- ESLint (max 55 warnings threshold)
- TypeScript type-check (`tsconfig.build.json`, excludes tests)
- shellcheck for bash scripts
- gitleaks for secret detection

After Prettier reformats files, you must re-stage them:

```bash
git add -u
git commit  # retry
```

### Pre-push Gate

- Full Vitest suite runs with `--bail` (stops on first failure)
- Fix all unit test failures before pushing

### CI Pipeline

- GitHub Actions runs lint, type-check, unit tests, E2E tests
- GitHub Pages deployment (static export, API routes disabled)
- Weekly compliance suite runs (DSP TCK, DCP, EHDS)

---

## Key Concepts

| Concept               | What It Does                                                                                 |
| --------------------- | -------------------------------------------------------------------------------------------- |
| **DSP 2025-1**        | Dataspace Protocol for contract negotiation and secure data transfer between participants    |
| **DCP v1.0**          | Decentralised Claims Protocol — Verifiable Credential attestation for participant identity   |
| **HealthDCAT-AP 2.1** | Metadata standard for health dataset catalogues (based on DCAT-AP)                           |
| **FHIR R4**           | HL7 standard for clinical data (Patient, Condition, Observation, MedicationRequest)          |
| **OMOP CDM v5.4**     | Common Data Model for observational research analytics                                       |
| **ODRL 2.2**          | Policy language expressing usage constraints on DataProduct nodes                            |
| **DID:web**           | W3C decentralised identifiers for participants (e.g., `did:web:alpha-klinik.de:participant`) |
| **HDAB**              | Health Data Access Body — regulatory authority approving secondary use requests              |

---

## Demo Personas

| Role                    | Username    | Nav Group     | Access                                   |
| ----------------------- | ----------- | ------------- | ---------------------------------------- |
| `EDC_ADMIN`             | admin       | Manage        | Full access including `/admin/*`         |
| `DATA_HOLDER`           | alphaklinik | Exchange      | Catalog, data sharing, negotiation       |
| `DATA_USER`             | pharmaco    | My Researches | Discovery, negotiation, analytics, query |
| `HDAB_AUTHORITY`        | medreg      | Governance    | Compliance, policy management            |
| `TRUST_CENTER_OPERATOR` | trustcenter | Governance    | Trust Center graph views                 |
| `PATIENT`               | patient1    | My Health     | Profile, research programmes, insights   |
| `EDC_USER_PARTICIPANT`  | participant | Exchange      | Base authenticated access                |

### Fictional Organizations

| Organization                | Role           |
| --------------------------- | -------------- |
| AlphaKlinik Berlin          | DATA_HOLDER    |
| Limburg Medical Centre      | DATA_HOLDER    |
| PharmaCo Research AG        | DATA_USER      |
| MedReg DE                   | HDAB_AUTHORITY |
| Institut de Recherche Sante | HDAB           |

Never use real organization names (no Charite, Bayer, BfArM, etc.).

---

## Common Tasks

### Add a New Page

1. Create `ui/src/app/<route>/page.tsx`
2. Add static export guard: check `NEXT_PUBLIC_STATIC_EXPORT`
3. Add mock data to `ui/public/mock/<route>.json`
4. Update navigation in `ui/src/components/Navigation.tsx` if needed
5. Add E2E test in `ui/__tests__/e2e/journeys/`

### Add an API Route

```bash
# Create the route handler
mkdir -p ui/src/app/api/<resource>
# Create route.ts with GET/POST exports
```

1. Export named handlers (`GET`, `POST`) in `ui/src/app/api/<resource>/route.ts`
2. Add corresponding mock fixture at `ui/public/mock/<resource>.json`
3. Ensure the page falls back to mock data when `NEXT_PUBLIC_STATIC_EXPORT=true`
4. Add MSW handler in test setup for unit tests

### Add a Mock Fixture

1. Create JSON file in `ui/public/mock/` matching the API response shape exactly
2. Reference it from `fetchApi()` logic in `ui/src/lib/api.ts`

### Run Tests

```bash
cd ui

# Unit tests
npm test                    # once
npm run test:watch          # watch mode
npm run test:coverage       # coverage report

# E2E tests (requires running UI + Neo4j)
npm run test:e2e            # headless
npm run test:e2e:ui         # interactive Playwright UI

# Single test file
npx vitest run __tests__/unit/components/Navigation.test.tsx
npx playwright test __tests__/e2e/journeys/19-static-github-pages.spec.ts
```

### Add an ADR (Architecture Decision Record)

1. Check existing ADRs in `docs/ADRs/` (currently ADR-001 to ADR-013)
2. Create `docs/ADRs/ADR-NNN-slug.md` with the next available number
3. Link the new ADR in `docs/planning-health-dataspace-v2.md` ADR index table
4. Reference the related GitHub Issue if one exists

---

## Troubleshooting

| Problem                          | Cause                                                         | Fix                                                                            |
| -------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Vault secrets gone after restart | Vault runs in-memory (dev mode)                               | Re-run `./scripts/bootstrap-jad.sh` (idempotent)                               |
| JAD seed fails at phase N        | Phases 1-7 are strictly ordered; FHIR must exist before OMOP  | Run `./jad/seed-all.sh` from phase 1, or `--from N` to resume                  |
| API routes 404 in static build   | CI renames `src/app/api/` before build                        | Use `NEXT_PUBLIC_STATIC_EXPORT` guard + mock fixtures                          |
| Pre-commit fails after Prettier  | Prettier reformats staged files                               | Run `git add -u` then retry the commit                                         |
| `ECONNREFUSED` on token exchange | `wellKnown` resolves Keycloak to container-internal localhost | Set `token`, `userinfo`, `jwks_endpoint` explicitly (see `ui/src/lib/auth.ts`) |
| Keycloak `invalid_request` error | Missing PKCE code_challenge_method                            | Ensure NextAuth checks include `["pkce", "state"]`                             |
| Type errors in tests             | `tsconfig.build.json` excludes `__tests__/`                   | Use `npx tsc --noEmit` (includes tests) for full check                         |
| ESLint warnings > 55             | CI threshold enforced                                         | Fix warnings or adjust threshold in CI config                                  |

---

## Further Reading

- `docs/planning-health-dataspace-v2.md` — project phases and roadmap
- `docs/ADRs/` — architectural decision records
- `CLAUDE.md` — build commands, architecture summary, gotchas
- `.claude/rules/` — API conventions, code style, testing standards

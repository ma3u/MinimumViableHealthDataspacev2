# Developer Guide

Technical documentation for developing, testing, and deploying the Health Dataspace v2 platform — an EHDS regulation reference implementation built on Eclipse Dataspace Components.

> **Rendered version:** [/docs/developer](https://ma3u.github.io/MinimumViableHealthDataspacev2/docs/developer)

## JAD Stack Architecture

The full JAD stack runs **19 Docker services** via `docker-compose.yml` + `docker-compose.jad.yml`.

| Service           | Port          | Traefik Route      | Purpose                         | Depends On          |
| ----------------- | ------------- | ------------------ | ------------------------------- | ------------------- |
| Traefik           | :80 / :8090   | traefik.localhost  | API gateway & reverse proxy     | —                   |
| PostgreSQL 17     | :5432         | —                  | Runtime store (8 databases)     | —                   |
| Vault             | :8200         | vault.localhost    | Secret management (dev mode)    | —                   |
| Keycloak          | :8080         | keycloak.localhost | OIDC SSO (realm: edcv, 7 users) | PostgreSQL          |
| NATS              | :4222 / :8222 | —                  | Async event mesh (JetStream)    | —                   |
| Control Plane     | :11003        | cp.localhost       | DSP protocol + management API   | PG, Vault, NATS, KC |
| Data Plane FHIR   | :11002        | dp-fhir.localhost  | FHIR PUSH transfer type         | PG, Vault, CP       |
| Data Plane OMOP   | :11012        | dp-omop.localhost  | OMOP PULL transfer type         | PG, Vault, CP       |
| Identity Hub      | :11005        | ih.localhost       | DCP v1.0 — DID + VC store       | PG, Vault, KC       |
| Issuer Service    | :10013        | issuer.localhost   | VC issuance + DID:web           | PG, Vault, KC       |
| Tenant Manager    | :11006        | tm.localhost       | CFM tenant lifecycle            | PG, KC              |
| Provision Manager | :11007        | pm.localhost       | CFM resource provisioning       | PG, KC, CP          |
| Neo4j 5           | :7474 / :7687 | —                  | Knowledge graph (APOC + n10s)   | —                   |
| Neo4j Proxy       | :9090         | proxy.localhost    | Express bridge: UI ↔ Neo4j     | CP                  |
| Next.js UI        | :3000 / :3003 | —                  | Application frontend            | Neo4j               |

Plus 4 background CFM agents (keycloak, edcv, registration, onboarding), 1 vault-bootstrap sidecar, and 1 one-shot seed container.

## Prerequisites

**Required:**

- Node.js 20+
- Docker Desktop with Docker Compose V2
- 8 GB Docker RAM for full JAD stack
- Git with pre-commit hooks enabled

**Optional:**

- Python 3.11+ — Synthea FHIR data loading
- gitleaks — local secret scanning (`brew install gitleaks`)
- lychee — broken link checker (`brew install lychee`)
- Playwright browsers — E2E tests (`npx playwright install`)

**Port requirements:** 80, 3000, 3003, 4222, 5432, 7474, 7687, 8080, 8090, 8200, 8222, 9090, 10013, 11002, 11003, 11005, 11006, 11007, 11012

## Quick Start — Minimal Stack

Run Neo4j + Next.js UI with synthetic data. No JAD services needed.

```bash
# 1. Start Neo4j & load schema
docker compose up -d
cat neo4j/init-schema.cypher | \
  docker exec -i health-dataspace-neo4j \
  cypher-shell -u neo4j -p healthdataspace
cat neo4j/insert-synthetic-schema-data.cypher | \
  docker exec -i health-dataspace-neo4j \
  cypher-shell -u neo4j -p healthdataspace

# 2. Start the UI
cd ui && npm install && npm run dev  # → http://localhost:3000
npm test       # 1,613 unit tests
npm run lint   # ESLint (max 55 warnings)
```

## Quick Start — Full JAD Stack

```bash
# 1. Bootstrap everything (~3-5 min first run)
./scripts/bootstrap-jad.sh
./scripts/bootstrap-jad.sh --status

# 2. Seed the dataspace (7 phases, strict order)
./jad/seed-all.sh
./jad/seed-all.sh --from 3   # resume from phase 3
./jad/seed-all.sh --only 5   # run only phase 5

# 3. Access the platform
open http://localhost:3003           # Live UI
open http://keycloak.localhost       # Keycloak (admin/admin)
open http://localhost:7474           # Neo4j Browser
open http://traefik.localhost        # Traefik Dashboard

# Common operations
./scripts/bootstrap-jad.sh --ui-only   # Rebuild UI only
./scripts/bootstrap-jad.sh --seed      # Re-run seed pipeline
./scripts/bootstrap-jad.sh --pull      # Pull latest images
./scripts/bootstrap-jad.sh --down      # Stop all services
./scripts/bootstrap-jad.sh --reset     # Stop + remove volumes
```

## Data Seeding Pipeline

| Phase | Script                       | Target Service | What It Does                                |
| ----- | ---------------------------- | -------------- | ------------------------------------------- |
| 1     | seed-health-tenants.sh       | Tenant Manager | Create 5 participant tenants via CFM        |
| 2     | seed-ehds-credentials.sh     | Issuer Service | Register EHDS credential types              |
| 3     | seed-ehds-policies.sh        | Control Plane  | Create ODRL policies for all participants   |
| 4     | seed-data-assets.sh          | Control Plane  | Register data assets + contracts            |
| 5     | seed-contract-negotiation.sh | Control Plane  | PharmaCo ↔ AlphaKlinik negotiations        |
| 6     | seed-federated-catalog.sh    | Control Plane  | MedReg ↔ LMC federated catalog negotiation |
| 7     | seed-data-transfer.sh        | Data Plane     | Verify EDR tokens and data plane transfers  |

> **Important:** Vault secrets are lost on Docker restart (in-memory dev mode). Re-run `./scripts/bootstrap-jad.sh --seed` after any `docker compose down`.

## Neo4j Graph Schema

The 5-layer knowledge graph spans **27 node labels** with **70+ indexes** and **3 vector indexes** (384-dim, cosine similarity for GraphRAG). Schema: `neo4j/init-schema.cypher` (idempotent).

| Layer            | Colour  | Node Labels                                                   |
| ---------------- | ------- | ------------------------------------------------------------- |
| L1 Marketplace   | #2471A3 | Participant, DataProduct, Contract, HDABApproval, OdrlPolicy  |
| L2 HealthDCAT-AP | #148F77 | Catalogue, HealthDataset, Distribution, DataService           |
| L3 FHIR R4       | #1E8449 | Patient, Encounter, Condition, Observation, MedicationRequest |
| L4 OMOP CDM      | #CA6F1E | OMOPPerson, ConditionOccurrence, DrugExposure, Measurement    |
| L5 Ontology      | #7D3C98 | SnomedConcept, ICD10Code, RxNormConcept, LoincCode            |

**Conventions:** Labels `PascalCase`, relationships `UPPER_SNAKE_CASE`, properties `camelCase`, always `MERGE` (never `CREATE`), constraints use `IF NOT EXISTS`.

## PostgreSQL Schema

PostgreSQL serves as the runtime store for all JAD services. Neo4j holds the health knowledge graph. (ADR-1)

| Database       | Service             | Contents                                                |
| -------------- | ------------------- | ------------------------------------------------------- |
| controlplane   | EDC-V Control Plane | Contract negotiations, transfer processes, policy store |
| dataplane_fhir | DCore FHIR          | FHIR data plane state, EDR tokens                       |
| dataplane_omop | DCore OMOP          | OMOP data plane state, EDR tokens                       |
| identityhub    | Identity Hub        | DID documents, VC store, key pairs                      |
| issuerservice  | Issuer Service      | Credential definitions, attestation records             |
| keycloak       | Keycloak            | Users, roles, realm config, sessions                    |
| cfm_tenant     | Tenant Manager      | Tenant records, VPA                                     |
| cfm_provision  | Provision Manager   | Provisioning tasks, resource allocation                 |

## Testing

### Unit Tests (Vitest)

- **1,613 tests** across 80+ files, **93.8% statement / 94.7% line** coverage
- MSW for API mocking, Testing Library for components

```bash
npm test               # Run once
npm run test:watch     # Watch mode
npm run test:coverage  # With v8 coverage
```

### E2E Tests (Playwright)

- **19 spec files** (J001–J260 journey range)
- WCAG 2.2 AA accessibility audit, OWASP/BSI security & pentest

```bash
npm run test:e2e                                    # Headless
npm run test:e2e:ui                                 # Interactive
PLAYWRIGHT_BASE_URL=http://localhost:3003 npm run test:e2e  # JAD stack
```

### Protocol Compliance

```bash
./scripts/run-dsp-tck.sh     # DSP 2025-1 TCK
./scripts/run-dcp-tests.sh   # DCP v1.0
./scripts/run-ehds-tests.sh  # EHDS domain
```

## CI/CD Pipeline

### test.yml — Every Push (8 jobs)

1. UI Tests (Vitest) + coverage
2. Neo4j Proxy Tests (Vitest)
3. ESLint lint check
4. Secret scan (gitleaks v8.27.2, SHA-256 verified)
5. Dependency audit (npm audit --audit-level=high)
6. Trivy security scan (v0.69.3, CVE-2026-33634 safe)
7. Kubescape K8s posture (NSA + CIS)
8. E2E + WCAG 2.2 AA + Security pentest (main only)

### pages.yml — Deploy to GitHub Pages

Runs on push to main: Vitest → Build → Playwright → WCAG → Security → disable API routes → static export → deploy.

### compliance.yml — Weekly + Push to Main

DSP 2025-1 TCK, DCP v1.0, EHDS domain tests against full JAD stack. Scheduled Monday 06:00 UTC.

## Latest Reports

- [Test Coverage Report](https://ma3u.github.io/MinimumViableHealthDataspacev2/test-reports/)
- [Playwright E2E Report](https://ma3u.github.io/MinimumViableHealthDataspacev2/e2e-report/)
- [CI Workflow Runs](https://github.com/ma3u/MinimumViableHealthDataspacev2/actions/workflows/test.yml)
- [Compliance Runs](https://github.com/ma3u/MinimumViableHealthDataspacev2/actions/workflows/compliance.yml)
- [Security Advisories](https://github.com/ma3u/MinimumViableHealthDataspacev2/security)
- [EHDS User Journey](https://github.com/ma3u/MinimumViableHealthDataspacev2/blob/main/docs/FULL_USER_JOURNEY.md)

## Architecture Decision Records

| ID    | Title                      | Decision                                                       |
| ----- | -------------------------- | -------------------------------------------------------------- |
| ADR-1 | PostgreSQL vs Neo4j Split  | EDC runtime in PostgreSQL (8 databases), health graph in Neo4j |
| ADR-2 | Dual EDC Data Planes       | Separate FHIR R4 (PUSH) and OMOP CDM (PULL) planes             |
| ADR-3 | HealthDCAT-AP Alignment    | Graph nodes aligned with HealthDCAT-AP 3.0                     |
| ADR-4 | Next.js App Router         | SPA with 36 API routes; static export for demo                 |
| ADR-5 | Vitest + MSW Testing       | 1,613 tests, MSW mocking, pre-push gate                        |
| ADR-6 | Tailwind + Lucide Icons    | Utility CSS with 5-layer colour palette                        |
| ADR-7 | GitHub Pages Static Export | 38 JSON mock fixtures for demo deployment                      |

## Conventions

- **Commits:** Conventional Commits (feat:, fix:, docs:, chore:)
- **Branches:** Feature branches → PR to main
- **Pre-commit:** 15 hooks — Prettier, ESLint, TypeScript, gitleaks, broken links, screenshot guard
- **Pre-push:** Full Vitest (--bail), npm audit (HIGH+)
- **Cypher:** MERGE only, PascalCase labels, UPPER_SNAKE_CASE relationships
- **TypeScript:** Strict mode, @/_ path alias → ui/src/_
- **Fictional orgs only:** AlphaKlinik Berlin, PharmaCo Research AG, MedReg DE, Limburg Medical Centre, Institut de Recherche Santé

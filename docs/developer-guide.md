# Developer Guide

Technical documentation for developing, testing, and deploying the Health Dataspace v2 platform — an EHDS regulation reference implementation built on Eclipse Dataspace Components.

> **Rendered version:** [/docs/developer](https://ma3u.github.io/MinimumViableHealthDataspacev2/docs/developer)

## JAD Stack Architecture

The full JAD stack runs **15 Docker services** via `docker-compose.yml` + `docker-compose.jad.yml`, on EDC 1.0.0-RC5 with siglet as the data plane and no CFM, as Azure does ([ADR-078](ADRs/ADR-078-edc-1-on-container-apps-without-cfm.md)). The three EDC launchers are built from `runtimes/edc` (`mvhd/edc-<runtime>:1.0.0-RC5`).

| Service         | Port          | Traefik Route      | Purpose                                                         | Depends On          |
| --------------- | ------------- | ------------------ | --------------------------------------------------------------- | ------------------- |
| Traefik         | :80 / :8090   | traefik.localhost  | API gateway & reverse proxy                                     | none                |
| PostgreSQL 17   | :5432         | none               | Runtime store (databases below)                                 | none                |
| Vault           | :8200         | vault.localhost    | Secrets, file storage; `vault-unseal` unseals it on start       | none                |
| Keycloak        | :8080 / :9000 | keycloak.localhost | OIDC SSO (realm: edcv, 8 demo users)                            | PostgreSQL          |
| NATS            | :4222 / :8222 | nats.localhost     | Async event mesh (JetStream)                                    | none                |
| Control Plane   | :11003        | cp.localhost       | DSP 2025-1 + Management API `v5`                                | PG, Vault, NATS, KC |
| siglet          | internal      | none               | Data plane: signalling, and the access tokens of pull transfers | Vault               |
| Identity Hub    | :11005        | ih.localhost       | DCP v1.0: DID + VC store (Identity API `v1`)                    | PG, Vault, KC       |
| Issuer Service  | :10013        | issuer.localhost   | VC issuance + DID:web                                           | PG, Vault, KC       |
| Simpl GA issuer | :10023        | none               | The fictional Simpl Governance Authority's issuer (ADR-064)     | PG, Vault, KC       |
| Neo4j 5         | :7474 / :7687 | none               | Knowledge graph (APOC + n10s)                                   | none                |
| Neo4j Proxy     | :9090         | proxy.localhost    | Express bridge: UI ↔ Neo4j; serves pulls at `/dataspace/data`  | CP                  |
| Next.js UI      | :3000 / :3003 | none               | Application frontend                                            | Neo4j               |

Plus two Vault sidecars: `vault-unseal` initialises and unseals Vault, `vault-bootstrap` writes the secrets the services read.

A pull transfer runs like this: the consumer's control plane negotiates, siglet issues the access token, and the consumer reads the token from its siglet (`GET /tokens/{participantContextId}/{transferId}`) and sends it to the provider's Neo4j Proxy at `/dataspace/data`, which serves the dataset the token names (`jad/siglet-edc1.toml`). siglet keeps its tokens in memory on this stack, so a restart of siglet loses every issued token; start the transfer again.

Five compose profiles hold what the default stack leaves out:

- `edc018`: the EDC 0.18 services, the two DCore data planes (FHIR :11002, OMOP :11012), CFM's Tenant Manager (:11006) and Provision Manager (:11007), its four agents and shim, and the one-shot `jad-seed`. They are kept until #927 retires them; nothing in CI starts them.
- `trust-check`: `rogue-issuer` (:10033), the untrusted issuer the identity checks must refuse.
- `wellbeing`: `wellbeing-ga-issuer` (:10053), the Governance Authority of a second data space that admits AlphaKasse DE (#934). `scripts/seed-second-data-space.sh` starts it and seeds AlphaKasse; CI runs it before the identity checks.
- `simpl`: `simpl-issuer` (:10043) and its `simpl-vault`, Simpl-Open's own issuer service, which `scripts/run-simpl-issuer-interop.sh` starts to test whether the hub accepts its credentials (#934 step 0a; today it does not).
- `federated`: `neo4j-spe2` (:7475 / :7688), the second SPE.

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

**Port requirements:** 80, 3000, 3003, 4222, 5432, 7474, 7687, 8080, 8090, 8200, 8222, 9000, 9090, 10013, 10023, 11003, 11005

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

| Phase | Script                            | Target Service           | What It Does                                                                                     |
| ----- | --------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------ |
| 1     | ../scripts/seed-identity-layer.sh | Identity Hub, Issuer, CP | The 5 participants: contexts, DIDs, keys, a DCP MembershipCredential each (ADR-078)              |
| 2     | seed-ehds-credentials.sh          | Issuer Service           | Register EHDS credential types                                                                   |
| 3     | seed-ehds-policies.sh             | Control Plane            | Create ODRL policies for all participants                                                        |
| 4     | seed-data-assets.sh               | Control Plane            | Register data assets + contracts                                                                 |
| 5     | seed-contract-negotiation.sh      | Control Plane            | PharmaCo ↔ AlphaKlinik negotiations, transfers to STARTED, one refused negotiation (TERMINATED) |
| 6     | seed-federated-catalog.sh         | Control Plane            | MedReg ↔ LMC federated catalog negotiation                                                      |
| 7     | seed-data-transfer.sh             | siglet, Neo4j Proxy      | Pull patients and the catalogue with siglet's tokens; record the TransferEvents                  |

`bootstrap-jad.sh` loads the graph (`init-schema.cypher` and the files CI loads) only when Neo4j holds no patients, so a graph you filled yourself stays as it is. Phase 7 rewrites three tracked fixtures, `ui/public/mock/{fhir_bundles,negotiations,transfers}.json`; restore them with `git checkout --` when you did not mean to refresh them. Phase 1 reports `HTTP 400` for the attestation types `ehds-participant` and `ehds-quality`, which no issuer launcher registers, and for the credential types defined on them (finding 7 in #881); phase 2 registers the EHDS credential types anyway.

> **Important:** Vault keeps its secrets on disk (volumes `vault_data` and `vault_keys`; the `vault-unseal` sidecar unseals it on every start), so a restart or a `docker compose down` keeps every secret. Only removing the volumes (`docker compose down -v` or `./scripts/bootstrap-jad.sh --reset`) deletes them; bootstrap and seed the stack again after that. If IdentityHub logs `Private key ... not found`, check that `health-dataspace-vault-unseal` reported `ready`.

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

| Database         | Service         | Contents                                                |
| ---------------- | --------------- | ------------------------------------------------------- |
| controlplane_v1  | Control Plane   | Contract negotiations, transfer processes, policy store |
| identityhub_v1   | Identity Hub    | DID documents, VC store, key pairs                      |
| issuerservice_v1 | Issuer Service  | Credential definitions, attestation records             |
| simplga_v1       | Simpl GA issuer | The Simpl Governance Authority's credentials            |
| rogueissuer_v1   | rogue-issuer    | The untrusted issuer of the identity checks             |
| keycloak         | Keycloak        | Users, roles, realm config, sessions                    |
| taskdb           | Neo4j Proxy     | The task store                                          |

The image creates `controlplane` (`POSTGRES_DB`); `jad/init-postgres.sql` creates the users, `keycloak`, `taskdb` and the other EDC 0.18 databases (`identityhub`, `issuerservice`, `dataplane`, `dataplane_omop`, `cfm`, `redlinedb`, ...), which the 1.0 services no longer use. `jad/init-postgres-edc1.sql` creates the `_v1` databases after it, on a fresh `postgres_data` volume only; on an existing volume, run that file once with `psql` as `cp` (see `docs/gotchas.md`).

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
./scripts/run-ehds-dataspace-checks.sh     # EHDS dataspace checks (not a TCK, see #338)
./scripts/run-ehds-identity-checks.sh   # EHDS identity checks (not a TCK)
./scripts/run-ehds-tests.sh  # EHDS domain
```

### API Collection (Bruno)

`bruno/MVHDv2/` is organised by EHDS persona: one folder per role in Regulation
(EU) 2025/327, two for the two-sided procedures of Chapter IV, one for the role
boundaries, three for the protocol and platform surfaces (ADR-032). 151
requests, every route covered, every request asserting a status and a body
property.

```bash
./scripts/run-api-tests.sh Local        # compose stack, all thirteen folders
./scripts/run-api-tests.sh Static-mock  # GitHub Pages fixtures, GET only, no auth
./scripts/run-api-tests.sh Azure-Dev    # live demo, needs NEXTAUTH_SECRET
./scripts/run-api-tests.sh Local "07 Journey - Data permit"   # one folder
```

The runner forges one NextAuth session per persona and writes HTML, JUnit and
baseline reports into `test-results/bruno/`. See `bruno/MVHDv2/README.md`.

## CI/CD Pipeline

### test.yml: every push and pull request

1. Vitest for the UI (with coverage), the Neo4j proxy, the SPE loader and ePA ingest; OPA policy tests
2. iOS analyte parity, only when `clients/ios/` changed
3. One job of scans: Trivy (v0.69.3, CVE-2026-33634 safe), Kubescape (NSA + CIS), npm audit (high and above), the CycloneDX SBOM and the licence check

ESLint, `tsc` and gitleaks over the pull request's commits run in PR Gate; E2E, WCAG 2.2 AA, the security pentest, Lighthouse and gitleaks over the whole history run in `nightly.yml`.

### pages.yml — Deploy to GitHub Pages

Runs on push to main and when a nightly run finishes: disable API routes → static export from the mock fixtures committed in `ui/public/mock/` → add the latest nightly test reports → deploy. `scripts/refresh-mocks.sh` refreshes the fixtures by hand from a stack you are signed in to.

### e2e.yml: the specs a pull request can break

The Playwright specs the change can break, picked by `scripts/select-e2e-specs.sh`: the changed specs and those that visit a changed route, or every spec on three runners when shared code changed. A seeded Neo4j (`neo4j/seed.sh`) and the neo4j-proxy, no EDC connector and no Keycloak, forged sessions for the realm users. A failure is a red check ([ADR-079](ADRs/ADR-079-e2e-runs-on-pull-requests-and-fails-visibly.md)), and the job `E2E`, which reports on every pull request, is required on `main`. Locally, the same run: `scripts/run-e2e-local.sh --changed`.

### nightly.yml: once a night when main changed

Vitest with coverage, every Playwright spec (WCAG 2.2 AA and the OWASP/BSI checks included) against the demo graph, spec 19 against the published GitHub Pages site, Lighthouse, and `compliance.yml`: DSP 2025-1 TCK, DCP v1.0 and EHDS domain tests against the full JAD stack on EDC 1.0 ([ADR-074](ADRs/ADR-074-e2e-and-compliance-suites-run-nightly-when-main-changed.md)). A failing suite opens the "Nightly suites failed" issue; no step has `continue-on-error` ([ADR-079](ADRs/ADR-079-e2e-runs-on-pull-requests-and-fails-visibly.md)).

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

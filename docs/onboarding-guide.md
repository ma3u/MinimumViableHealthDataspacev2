# Developer Onboarding Guide

New to the project? Follow this page top to bottom on your first day. Every
step links to the file, page or command it is about. The public demo runs at
[ma3u.github.io/MinimumViableHealthDataspacev2](https://ma3u.github.io/MinimumViableHealthDataspacev2/)
without any backend, so you can look around before you install anything.

## Welcome & Overview

The EHDS Integration Hub is a reference implementation of the **European
Health Data Space (EHDS) regulation**,
[Regulation (EU) 2025/327](https://eur-lex.europa.eu/eli/reg/2025/327/oj). It
shows how health data can be shared across organisations while preserving
sovereignty, consent and regulatory compliance. What it implements, article by
article, is in [the regulation implementation table](ehds/regulation-implementation.md).

The system unifies:

- **[DSP (Dataspace Protocol) 2025-1](https://eclipse-dataspace-protocol-base.github.io/DataspaceProtocol/2025-1/)**: contract negotiation and data transfer
- **[FHIR R4](https://hl7.org/fhir/R4/)**: clinical data exchange
- **[OMOP CDM v5.4](https://ohdsi.github.io/CommonDataModel/cdm54.html)**: observational analytics
- **Biomedical ontologies**: [SNOMED CT](https://www.snomed.org/), [ICD-10](https://icd.who.int/browse10/2019/en), [RxNorm](https://www.nlm.nih.gov/research/umls/rxnorm/), [LOINC](https://loinc.org/)
- **[Neo4j](https://neo4j.com/docs/) knowledge graph**: 127 synthetic patients, 5300+ nodes across 5 layers ([explore it](https://ma3u.github.io/MinimumViableHealthDataspacev2/graph))

The project is a testbed for primary use (patient rights) and secondary use
(research) under the EHDS, with `did:web` identity, ODRL policy enforcement and
the health data access body's approval workflow. The words used for all of
this are in [the EHDS glossary](https://ma3u.github.io/MinimumViableHealthDataspacev2/docs/ehds/glossary)
and [the stack glossary](developer/stack-and-environment.md#glossary).

---

## First Day Checklist

1. [ ] Read this page and [the developer guide](https://ma3u.github.io/MinimumViableHealthDataspacev2/docs/developer).
2. [ ] Try the [public demo](https://ma3u.github.io/MinimumViableHealthDataspacev2/) as two or three [personas](#demo-personas).
3. [ ] Install the [prerequisites](#prerequisites) and the [hooks](#pre-commit-and-pre-push-hooks).
4. [ ] Run the [minimal stack](#clone-and-minimal-stack-setup) and open http://localhost:3000.
5. [ ] Run the unit tests once: [Run Tests](#run-tests).
6. [ ] Read [`CLAUDE.md`](../CLAUDE.md) (commands and the top gotchas) and the three rules files in [`.claude/rules/`](../.claude/rules/).
7. [ ] Skim [the SDLC](SDLC.md) to see how a change reaches the live hub.
8. [ ] Pick an issue labelled [`good first issue`](https://github.com/ma3u/MinimumViableHealthDataspacev2/labels/good%20first%20issue) or ask in [Discussions](https://github.com/ma3u/MinimumViableHealthDataspacev2/discussions).

### Prerequisites

| Tool                                                                                                                                                                        | Version    | Purpose                                                             |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------- |
| [Node.js](https://nodejs.org/)                                                                                                                                              | 20+        | the UI and the Neo4j proxy                                          |
| [Docker Desktop](https://www.docker.com/products/docker-desktop/) or [OrbStack](https://orbstack.dev/)                                                                      | Compose v2 | Neo4j, Keycloak and the JAD services                                |
| [Git](https://git-scm.com/)                                                                                                                                                 | 2.x        | version control                                                     |
| [Python](https://www.python.org/)                                                                                                                                           | 3.11+      | the repository's checks in `scripts/`                               |
| [pre-commit](https://pre-commit.com/)                                                                                                                                       | current    | 31 commit hooks and 3 push hooks                                    |
| [gitleaks](https://github.com/gitleaks/gitleaks), [Semgrep](https://semgrep.dev/docs/), [lychee](https://lychee.cli.rs/), [actionlint](https://github.com/rhysd/actionlint) | optional   | hooks that warn and skip when missing; the PR Gate runs them anyway |

Allocate **8 GB RAM** to Docker if you plan to run the full JAD stack. The full
list, with ports and environment variables, is in
[the stack and the development environment](developer/stack-and-environment.md#development-environment).

### Clone and Minimal Stack Setup

```bash
# Clone the repository
git clone https://github.com/ma3u/MinimumViableHealthDataspacev2.git
cd MinimumViableHealthDataspacev2

# Install the hooks (commit and push)
pip install pre-commit
pre-commit install --hook-type pre-commit --hook-type pre-push

# Start Neo4j only (a bare `docker compose up -d` also starts the UI container on :3000)
docker compose up -d neo4j

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

The files: [`docker-compose.yml`](../docker-compose.yml),
[`neo4j/init-schema.cypher`](../neo4j/init-schema.cypher),
[`neo4j/insert-synthetic-schema-data.cypher`](../neo4j/insert-synthetic-schema-data.cypher).
Neo4j's browser is then at http://localhost:7474 (user `neo4j`, password
`healthdataspace`, local development only). The runbook is
[Start the minimal local stack](knowledge/runbooks/local-minimal-stack.md).

The minimal stack has no Keycloak, so pages behind sign-in need the full stack
or the persona picker of the public demo.

### Full JAD Stack (optional)

```bash
docker compose -f docker-compose.yml -f docker-compose.jad.yml up -d
./scripts/bootstrap-jad.sh
./jad/seed-all.sh   # phases 1-7, strictly sequential; --from N resumes
```

The files: [`docker-compose.jad.yml`](../docker-compose.jad.yml),
[`scripts/bootstrap-jad.sh`](../scripts/bootstrap-jad.sh),
[`jad/seed-all.sh`](../jad/seed-all.sh). What each seed phase does is in
[the seed phases](developer/stack-and-environment.md#the-seed-phases-in-order),
and the runbook is [JAD stack seeding](knowledge/runbooks/jad-stack-seeding.md).
The UI container then answers on http://localhost:3003, with sign-in through
Keycloak at http://localhost:8080.

---

## Understanding the Architecture

Start with [the architecture page](https://ma3u.github.io/MinimumViableHealthDataspacev2/docs/architecture)
(diagrams of every layer and service), then
[how the stack fits together](developer/stack-and-environment.md#how-they-fit-together).

### 5-Layer Neo4j Knowledge Graph

| Layer | Domain                 | Key Nodes                                                     |
| ----- | ---------------------- | ------------------------------------------------------------- |
| L1    | Dataspace Marketplace  | Participant, DataProduct, OdrlPolicy, Contract, HDABApproval  |
| L2    | HealthDCAT-AP Metadata | Catalogue, Dataset, Distribution, DataService                 |
| L3    | FHIR R4 Clinical       | Patient, Encounter, Condition, Observation, MedicationRequest |
| L4    | OMOP CDM Analytics     | OMOPPerson, ConditionOccurrence, DrugExposure, Measurement    |
| L5    | Biomedical Ontology    | SnomedConcept, ICD10Code, RxNormConcept, LoincCode            |

Schema definition: [`neo4j/init-schema.cypher`](../neo4j/init-schema.cypher);
the model in prose: [the graph schema](health-dataspace-graph-schema.md). See
the layers live in the [graph explorer](https://ma3u.github.io/MinimumViableHealthDataspacev2/graph).

### Key Services

| Service                                                           | Port        | Purpose                                                  | Code or config                                                                                                            |
| ----------------------------------------------------------------- | ----------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| [Neo4j](https://neo4j.com/docs/)                                  | 7474 / 7687 | knowledge graph                                          | [`neo4j/`](../neo4j/)                                                                                                     |
| neo4j-proxy                                                       | 9090        | Express bridge: FHIR and OMOP endpoints, NLQ, federation | [`services/neo4j-proxy/`](../services/neo4j-proxy/)                                                                       |
| UI ([Next.js](https://nextjs.org/docs) 15)                        | 3000        | frontend and `/api/*` routes                             | [`ui/src/app/`](../ui/src/app/)                                                                                           |
| [Keycloak](https://www.keycloak.org/documentation)                | 8080        | OIDC sign-in, realm `edcv`                               | [`jad/keycloak-realm.json`](../jad/keycloak-realm.json), [`ui/src/lib/auth.ts`](../ui/src/lib/auth.ts)                    |
| [Vault](https://developer.hashicorp.com/vault/docs)               | 8200        | keys and secrets, file-backed on a volume                | [`jad/vault.hcl`](../jad/vault.hcl)                                                                                       |
| [NATS](https://docs.nats.io/)                                     | 4222        | async event bus                                          | [`jad/nats.conf`](../jad/nats.conf)                                                                                       |
| [PostgreSQL](https://www.postgresql.org/docs/)                    | 5432        | EDC and Keycloak runtime stores                          | [`jad/init-postgres.sql`](../jad/init-postgres.sql)                                                                       |
| EDC-V control plane, data planes, IdentityHub, IssuerService, CFM | 10013-11012 | the connector and its identity layer                     | [`docker-compose.jad.yml`](../docker-compose.jad.yml), [glossary](developer/stack-and-environment.md#the-connector-edc-v) |

Every port is in [the port table](developer/stack-and-environment.md#ports).
The reasons behind each part are in the [ADRs](ADRs/), from ADR-001 on.

---

## Development Workflow

The full process, with every hook and workflow, is [the SDLC](SDLC.md).

### Branch Strategy

- `main` is always deployable; a push to it deploys the
  [live hub on Azure](SDLC.md#65-deploy-to-azure) and the
  [GitHub Pages demo](SDLC.md#64-github-pages-the-static-demo).
- Branches are named `type/short-slug`, often with the issue number:
  `feat/…`, `fix/708-…`, `docs/…`, `chore/…`, `ci/…`.
- Open a [pull request](https://github.com/ma3u/MinimumViableHealthDataspacev2/pulls)
  against `main`; the [PR Gate](SDLC.md#61-pr-gate-the-required-check) must be
  green and every review thread resolved. PRs are squash-merged with a
  [Conventional Commits](https://www.conventionalcommits.org/) title.

### Pre-commit and Pre-push Hooks

[`.pre-commit-config.yaml`](../.pre-commit-config.yaml) runs 31 hooks at
commit, among them [Prettier](https://prettier.io/),
[ESLint](https://eslint.org/) (at most 55 warnings), `tsc` on
[`ui/tsconfig.build.json`](../ui/tsconfig.build.json),
[shellcheck](https://www.shellcheck.net/),
[gitleaks](https://github.com/gitleaks/gitleaks),
[Semgrep](https://semgrep.dev/docs/) and the API collection check. At push it
runs the whole Vitest suite, `npm audit` (HIGH and above) and, when the iPhone
app changed, CodeQL. Each hook and what to do when it fails:
[the hooks on your machine](SDLC.md#5-the-hooks-on-your-machine).

When a hook rewrites a file (Prettier, the docs facts), stage that file again
by its path and commit again, then check that `HEAD` moved:

```bash
git add path/to/the/file   # not `git add -u`, which also stages unrelated local changes
git commit                 # retry
git log --oneline -1
```

### CI Pipeline

- [PR Gate](../.github/workflows/pr-gate.yml): the one required check on every PR.
- [Test Suite](../.github/workflows/test.yml): unit tests and one job of security scans.
- [Deploy to GitHub Pages](../.github/workflows/pages.yml): the static export, API routes disabled.
- [Deploy to Azure](../.github/workflows/deploy-azure.yml): the live hub, on every push to `main`.
- [Nightly](../.github/workflows/nightly.yml): Playwright, Lighthouse and the [protocol compliance](../.github/workflows/compliance.yml) suites, once a night when `main` changed.
- All [39 workflows](SDLC.md#62-the-other-workflows) and their [latest runs](https://github.com/ma3u/MinimumViableHealthDataspacev2/actions).

---

## Key Concepts

| Concept                     | What It Does                                                                                 | Read more                                                                                                                                                                      |
| --------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **DSP 2025-1**              | Dataspace Protocol for contract negotiation and secure data transfer between participants    | [spec](https://eclipse-dataspace-protocol-base.github.io/DataspaceProtocol/2025-1/), [ADR-007](ADRs/ADR-007-did-web-dsp-negotiation.md)                                        |
| **DCP v1.0**                | Decentralised Claims Protocol: Verifiable Credential attestation for participant identity    | [spec](https://eclipse-dataspace-dcp.github.io/decentralized-claims-protocol/), [ADR-009](ADRs/ADR-009-issuerservice-credential-fix.md)                                        |
| **HealthDCAT-AP Release 8** | Metadata standard for health dataset catalogues (based on DCAT-AP)                           | [spec](https://healthdataeu.pages.code.europa.eu/healthdcat-ap/releases/release-8/), [ADR-063](ADRs/ADR-063-healthdcat-ap-release-8-and-its-namespace.md)                      |
| **FHIR R4**                 | HL7 standard for clinical data (Patient, Condition, Observation, MedicationRequest)          | [spec](https://hl7.org/fhir/R4/)                                                                                                                                               |
| **OMOP CDM v5.4**           | Common Data Model for observational research analytics                                       | [spec](https://ohdsi.github.io/CommonDataModel/cdm54.html)                                                                                                                     |
| **ODRL 2.2**                | Policy language expressing usage constraints on DataProduct nodes                            | [spec](https://www.w3.org/TR/odrl-model/), [policies in the demo](https://ma3u.github.io/MinimumViableHealthDataspacev2/admin/policies)                                        |
| **did:web**                 | W3C decentralised identifiers for participants (e.g., `did:web:alpha-klinik.de:participant`) | [spec](https://w3c-ccg.github.io/did-method-web/), [the two forms used here](../.claude/rules/api-conventions.md#did-conventions)                                              |
| **HDAB**                    | Health data access body: the authority approving secondary use requests                      | [compliance view](https://ma3u.github.io/MinimumViableHealthDataspacev2/compliance), [EHDS glossary](https://ma3u.github.io/MinimumViableHealthDataspacev2/docs/ehds/glossary) |

---

## Demo Personas

In the [public demo](https://ma3u.github.io/MinimumViableHealthDataspacev2/)
pick a persona in the user menu; on the JAD stack sign in through Keycloak as
one of these users (the realm is [`jad/keycloak-realm.json`](../jad/keycloak-realm.json),
the list is `DEMO_PERSONAS` in [`ui/src/lib/auth.ts`](../ui/src/lib/auth.ts)).
What each persona sees is in [the user guide](https://ma3u.github.io/MinimumViableHealthDataspacev2/docs/user-guide#personas).

| Username       | Organisation                   | Role             | Nav Group     | Start here                                                                                                                                                       |
| -------------- | ------------------------------ | ---------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `edcadmin`     | Dataspace Operator             | `EDC_ADMIN`      | Manage        | [admin](https://ma3u.github.io/MinimumViableHealthDataspacev2/admin), [policies](https://ma3u.github.io/MinimumViableHealthDataspacev2/admin/policies)           |
| `clinicuser`   | AlphaKlinik Berlin             | `DATA_HOLDER`    | Exchange      | [catalog](https://ma3u.github.io/MinimumViableHealthDataspacev2/catalog), [negotiate](https://ma3u.github.io/MinimumViableHealthDataspacev2/negotiate)           |
| `lmcuser`      | Limburg Medical Centre         | `DATA_HOLDER`    | Exchange      | [catalog](https://ma3u.github.io/MinimumViableHealthDataspacev2/catalog)                                                                                         |
| `researcher`   | PharmaCo Research AG           | `DATA_USER`      | My Researches | [analytics](https://ma3u.github.io/MinimumViableHealthDataspacev2/analytics), [query](https://ma3u.github.io/MinimumViableHealthDataspacev2/query)               |
| `regulator`    | MedReg DE                      | `HDAB_AUTHORITY` | Governance    | [compliance](https://ma3u.github.io/MinimumViableHealthDataspacev2/compliance), [policies](https://ma3u.github.io/MinimumViableHealthDataspacev2/admin/policies) |
| `regulator-es` | MedReg ES                      | `HDAB_AUTHORITY` | Governance    | [compliance](https://ma3u.github.io/MinimumViableHealthDataspacev2/compliance) (cross-border permits)                                                            |
| `patient1`     | AlphaKlinik Berlin patient     | `PATIENT`        | My Health     | [profile](https://ma3u.github.io/MinimumViableHealthDataspacev2/patient/profile)                                                                                 |
| `patient2`     | Limburg Medical Centre patient | `PATIENT`        | My Health     | [profile](https://ma3u.github.io/MinimumViableHealthDataspacev2/patient/profile)                                                                                 |

Data holders and data users also carry `EDC_USER_PARTICIPANT`, the base role.
The routes each role may open are in
[the role table of the API conventions](../.claude/rules/api-conventions.md#roles-and-access-control).

### Fictional Organizations

| Organization                | Role           |
| --------------------------- | -------------- |
| AlphaKlinik Berlin          | DATA_HOLDER    |
| Limburg Medical Centre      | DATA_HOLDER    |
| PharmaCo Research AG        | DATA_USER      |
| MedReg DE                   | HDAB_AUTHORITY |
| Institut de Recherche Santé | HDAB           |

Never use real organisation names in demo data, docs, tests or screenshots.
The rule and its one exception are in
[the code style rules](../.claude/rules/code-style.md#fictional-organisation-policy).

---

## Common Tasks

### Add a New Page

1. Create `ui/src/app/<route>/page.tsx` ([existing pages](../ui/src/app/)).
2. Read data with `fetchApi()` from [`ui/src/lib/api.ts`](../ui/src/lib/api.ts), which serves fixtures in the static export; import `IS_STATIC` from [`ui/src/lib/static-export.ts`](../ui/src/lib/static-export.ts) where you need it.
3. Add the fixture to [`ui/public/mock/`](../ui/public/mock/); `static-mock-coverage.test.ts` fails without it.
4. Add it to the navigation in [`ui/src/components/Navigation.tsx`](../ui/src/components/Navigation.tsx) if needed, and to `PROTECTED_PATHS` in [`ui/src/middleware.ts`](../ui/src/middleware.ts) if it needs sign-in.
5. Translate its texts: `useT()` from [`ui/src/lib/i18n/translate.tsx`](../ui/src/lib/i18n/translate.tsx) and the dictionaries in [`ui/src/messages/`](../ui/src/messages/) ([ADR-070](ADRs/ADR-070-the-interface-follows-the-language-picker-without-locale-urls.md)).
6. Add an E2E journey in [`ui/__tests__/e2e/journeys/`](../ui/__tests__/e2e/journeys/).

### Add an API Route

```bash
mkdir -p ui/src/app/api/<resource>
# create route.ts with named GET/POST exports
```

1. Export named handlers (`GET`, `POST`) in `ui/src/app/api/<resource>/route.ts`, and call `requireAuth()` first ([ADR-044](ADRs/ADR-044-every-api-route-needs-a-session.md), [the pattern](../.claude/rules/api-conventions.md#authentication-inside-routes)).
2. Add the fixture at `ui/public/mock/<resource>.json`, in the exact response shape.
3. Document it in [`ui/public/openapi.yaml`](../ui/public/openapi.yaml); the `api-spec-drift` hook checks.
4. Add a request in the persona's folder of [`bruno/MVHDv2/`](../bruno/MVHDv2/) that asserts the status and a body property ([how](developer/api-integration-tests.md#the-rules-a-request-follows)).
5. Unit-test it in [`ui/__tests__/unit/api/`](../ui/__tests__/unit/api/): Neo4j is mocked at `@/lib/neo4j`, and a test that needs the network stubs `fetch` itself (there is no MSW).

### Add a Mock Fixture

1. Create the JSON file in [`ui/public/mock/`](../ui/public/mock/), matching the API response shape exactly.
2. Map the route to it in `fetchApi()` in [`ui/src/lib/api.ts`](../ui/src/lib/api.ts) if the file name does not follow from the path.

### Run Tests

```bash
cd ui

# Unit tests (Vitest)
npm test                    # once
npm run test:watch          # watch mode
npm run test:coverage       # coverage report

# E2E tests (Playwright; needs a running UI + Neo4j)
npm run test:e2e            # headless
npm run test:e2e:ui         # interactive Playwright UI

# Single test file
npx vitest run __tests__/unit/components/Navigation.test.tsx
npx playwright test __tests__/e2e/journeys/19-static-github-pages.spec.ts

# The API collection against the public demo (no secret needed)
cd .. && ./scripts/run-api-tests.sh Static-mock
```

Conventions: [`.claude/rules/testing.md`](../.claude/rules/testing.md); the
API tests in depth: [integration tests through the APIs](developer/api-integration-tests.md);
the latest reports: [unit coverage](test-coverage-report.md),
[E2E](e2e-test-report.md).

### Add an ADR (Architecture Decision Record)

1. Check the existing [ADRs](ADRs/) (from ADR-001 on; 051 is reserved) and the ADR table in [`docs/planning-health-dataspace-v2.md`](planning-health-dataspace-v2.md).
2. Copy [the template](adr/0000-template.md) to `docs/ADRs/ADR-NNN-slug.md` with the next free number.
3. Add it to that ADR table.
4. Link the issue it belongs to. An accepted ADR is never edited, only superseded.

---

## Troubleshooting

| Problem                                       | Cause                                                                      | Fix                                                                                                                                                        |
| --------------------------------------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| IdentityHub logs `Private key ... not found`  | Vault did not unseal after a restart                                       | Check that `health-dataspace-vault-unseal` reported `ready`; Vault is file-backed ([`jad/vault.hcl`](../jad/vault.hcl)), so the keys are still there       |
| JAD seed fails at phase N                     | Phases 1-7 are strictly ordered; a failed phase invalidates the later ones | Fix the cause, then `./jad/seed-all.sh --from N` ([the phases](developer/stack-and-environment.md#the-seed-phases-in-order))                               |
| API routes 404 in the static build            | CI renames `src/app/api/` before the build                                 | Read through `fetchApi()` and add the fixture in `ui/public/mock/`                                                                                         |
| Commit fails after Prettier or the docs facts | The hook rewrote a staged file                                             | `git add` that file by path and commit again; check `HEAD` moved                                                                                           |
| `ECONNREFUSED` on token exchange              | `wellKnown` resolves Keycloak to container-internal localhost              | Never use `wellKnown`; set the endpoints explicitly ([`ui/src/lib/auth.ts`](../ui/src/lib/auth.ts), [runbook](knowledge/runbooks/keycloak-realm-drift.md)) |
| Keycloak `invalid_request` error              | Missing PKCE `code_challenge_method`                                       | Keep the NextAuth checks at `["pkce", "state"]`; the UI client is confidential with PKCE S256                                                              |
| Type errors only in tests                     | `tsconfig.build.json` excludes `__tests__/`                                | `npx tsc --noEmit` (the full config) checks the tests too                                                                                                  |
| ESLint fails with more than 55 warnings       | The warning budget of the `eslint-ui` hook                                 | Fix the new warnings; the budget only goes down                                                                                                            |

Everything else that cost someone a day, dated: [`docs/gotchas.md`](gotchas.md).

---

## Further Reading

- [The developer guide](https://ma3u.github.io/MinimumViableHealthDataspacev2/docs/developer): the manual, with the API reference and the quality gates.
- [The SDLC](SDLC.md): issues, pull requests, hooks, workflows, releases, contributing.
- [The stack and the development environment](developer/stack-and-environment.md): glossary, ports, environment variables, the iPhone app.
- [Integration tests through the APIs](developer/api-integration-tests.md): the Bruno collection and the protocol checks.
- [`docs/planning/index.md`](planning/index.md) and [`docs/planning-health-dataspace-v2.md`](planning-health-dataspace-v2.md): what is being worked on, phases and roadmap.
- [ADRs](ADRs/): every architectural decision and its reasons.
- [`CLAUDE.md`](../CLAUDE.md): build commands, the directory map, the top gotchas.
- [`.claude/rules/`](../.claude/rules/): [code style](../.claude/rules/code-style.md), [testing](../.claude/rules/testing.md), [API conventions](../.claude/rules/api-conventions.md).
- [Contributing](../.github/CONTRIBUTING.md) and the [open issues](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues).

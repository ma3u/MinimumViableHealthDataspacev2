# Minimum Viable Health Dataspace v2

[![CI Tests](https://github.com/ma3u/MinimumViableHealthDataspacev2/actions/workflows/test.yml/badge.svg)](https://github.com/ma3u/MinimumViableHealthDataspacev2/actions/workflows/test.yml) [![Coverage 72%](https://img.shields.io/badge/coverage-72%25-green)](docs/test-report.md) [![247 Tests](https://img.shields.io/badge/tests-247%20passed-brightgreen)](docs/test-report.md) [![Playwright 31](https://img.shields.io/badge/E2E-31%20passed-brightgreen)](docs/test-report.md)

[![EHDS Compliant](https://img.shields.io/badge/EHDS-Compliant-0ea5e9)](https://health.ec.europa.eu/ehealth-digital-health-and-care/european-health-data-space_en) [![FHIR R4](https://img.shields.io/badge/FHIR-R4-orange)](https://hl7.org/fhir/R4/) [![OMOP CDM](https://img.shields.io/badge/OMOP-CDM%20v5.4-yellow)](https://ohdsi.github.io/CommonDataModel/) [![EEHRxF](https://img.shields.io/badge/EEHRxF-HL7%20Europe-148F77)](https://hl7.eu/fhir/) [![Neo4j 5](https://img.shields.io/badge/Neo4j-5%20Community-008CC1?logo=neo4j&logoColor=white)](https://neo4j.com/) [![Next.js 14](https://img.shields.io/badge/Next.js-14-black?logo=next.js&logoColor=white)](https://nextjs.org/) [![Eclipse EDC](https://img.shields.io/badge/Eclipse-EDC--V-blue)](https://eclipse-edc.github.io/docs/) [![DSP Dataspace Protocol 2025-1](https://img.shields.io/badge/DSP-Dataspace%20Protocol%202025--1-6366f1)](https://docs.internationaldataspaces.org/ids-knowledgebase/v/dataspace-protocol) [![DCP Decentralized Claims Protocol v1.0](https://img.shields.io/badge/DCP-Decentralized%20Claims%20Protocol%20v1.0-7c3aed)](https://projects.eclipse.org/projects/technology.dataspace-dcp/releases/1.0.0) [![DPS](https://img.shields.io/badge/DPS-Data%20Plane%20Signaling-0891b2)](https://projects.eclipse.org/proposals/eclipse-data-plane-core) [![SIMPL](https://img.shields.io/badge/SIMPL-EU%20Cloud%20Federation-e11d48)](https://simpl-programme.eu/) [![License: Apache 2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)

## Why This Project Exists

The [European Health Data Space (EHDS)](https://health.ec.europa.eu/ehealth-digital-health-and-care/european-health-data-space_en) regulation creates a legal framework for sharing health data across the EU, but turning that regulation into running software is an unsolved integration challenge. A hospital in Berlin that wants to share de-identified patient cohorts with a pharmaceutical researcher in Amsterdam needs to navigate five layers of technology: dataspace governance contracts, standardised metadata catalogues, clinical data formats, research-grade analytics schemas, and biomedical terminologies. Today, no single reference implementation shows how these layers connect end-to-end.

This project builds that missing reference. It takes the [Eclipse Dataspace Components](https://eclipse-edc.github.io/docs/) (open-source building blocks for sovereign data exchange) and wires them to a health-domain knowledge graph that speaks FHIR R4, OMOP CDM, and HealthDCAT-AP natively. The result is a **self-contained local demo** you can run on your laptop in under five minutes, without any cloud account or real patient data.

The motivation comes from a practical gap: the Eclipse [JAD (Joint Architecture Demo)](https://github.com/Metaform/jad) shows how EDC-V, DCore, and CFM work together for generic cloud-provider deployments, but it has no health-domain content. Conversely, FHIR servers and OMOP databases exist in isolation, disconnected from dataspace governance. This project bridges that gap it puts EHDS governance contracts, HealthDCAT-AP catalogue metadata, FHIR patient journeys, OMOP research analytics, and SNOMED/LOINC ontologies into a single queryable graph, all accessible through the Dataspace Protocol.

For the full background, see the companion article: [European Health Dataspaces, Digital Twins: A Journey from FHIR Basics to Intelligent Patient Models](https://www.linkedin.com/pulse/european-health-dataspaces-digital-twins-journey-fhir-buchhorn-roth-8t51c/).

**Live Demo:** The UI layout is deployed as a static page at [ma3u.github.io/MinimumViableHealthDataspacev2](https://ma3u.github.io/MinimumViableHealthDataspacev2/).

---

## What It Does

The demo models a concrete EHDS secondary-use scenario: a **clinical research organisation (CRO)** in Amsterdam wants to run a drug-repurposing study using synthetic patient data held by a **hospital (Clinic)** in Berlin, with access governed by a **Health Data Access Body (HDAB)** in Germany. All five layers of this scenario live in a single Neo4j knowledge graph:

- **Layer 1 — DSP Marketplace**: DataProduct / OdrlPolicy / Contract / HDABApproval nodes model the full EHDS Article 45–53 secondary-use access flow, enforced by the Dataspace Protocol (DSP 2025-1).
- **Layer 2 — HealthDCAT-AP Catalogue**: Dataset / Distribution / DataService / Organization nodes expose W3C HealthDCAT-AP 1.0 metadata — the mandatory standard for health dataset discovery across EU Health Data Access Bodies.
- **Layer 3 — FHIR R4 Clinical Data**: 127 synthetic patients generated by [Synthea](https://github.com/synthetichealth/synthea) with Encounters, Conditions, Observations, MedicationRequests, and Procedures — loaded as first-class graph nodes with full provenance chains.
- **Layer 4 — OMOP CDM Research Layer**: FHIR clinical events are transformed into OMOP v5.4 nodes (Person, ConditionOccurrence, DrugExposure, ProcedureOccurrence, Measurement), enabling cohort-level analytics without moving data out of the graph.
- **Layer 5 — Biomedical Ontology Backbone**: SNOMED CT, ICD-10-CM, RxNorm, LOINC, and CPT-4 concept nodes link clinical events to standardised terminologies via `CODED_BY` edges.

![Architecture Diagram](docs/images/architecture.svg)

On top of these five layers, **EEHRxF Profile Alignment** nodes map the six EHDS priority categories (Patient Summary, ePrescription, Laboratory Results, Hospital Discharge, Medical Imaging, Rare Disease) to HL7 Europe FHIR Implementation Guides, with dynamic coverage scores computed against the loaded data.

A **Next.js 14 application** provides six purpose-built views to explore all of this: an interactive graph explorer, a HealthDCAT-AP dataset catalogue, a DSP compliance chain inspector, a patient journey timeline, an OMOP research analytics dashboard, and an EEHRxF profile gap analysis view.

---

## Architecture

All five layers are persisted as a single **Neo4j 5 knowledge graph**. Each layer is a distinct
set of labelled nodes; cross-layer `GOVERNS`, `DESCRIBES`, `MAPS_TO`, and `CODED_BY` relationships
form the connective tissue that makes the graph queryable end-to-end — from a governance contract
all the way down to a SNOMED code on a patient condition.

| Layer           | Nodes                                                                           | Technology                     |
| --------------- | ------------------------------------------------------------------------------- | ------------------------------ |
| 1 · Marketplace | DataProduct, OdrlPolicy, Contract, AccessApplication, HDABApproval              | Eclipse EDC-V, DSP, CFM, DCore |
| 2 · Catalogue   | Catalogue, Dataset, Distribution, DataService, Organization                     | HealthDCAT-AP / DCAT-AP 3      |
| 3 · Clinical    | Patient, Observation, Condition, Encounter, MedicationRequest, Procedure        | FHIR R4 / Synthea              |
| 4 · Research    | PersonNode, ConditionOccurrence, DrugExposure, ProcedureOccurrence, Measurement | OMOP CDM v5.4                  |
| 5 · Ontology    | OntologyConcept (SNOMED CT, ICD-10-CM, RxNorm, LOINC, CPT-4)                    | Biomedical Terminologies       |

The schema below shows the node labels and relationship types as rendered by Neo4j Browser's
`CALL db.schema.visualization()` after the seed data is loaded:

![Knowledge Graph Schema](docs/images/graph-schema.png)

---

## UI Views

The Next.js 14 app is served at <http://localhost:3000> and provides six purpose-built views,
each backed by a dedicated API route that queries Neo4j directly over Bolt.

| View             | Route         | Description                                                                                                     |
| ---------------- | ------------- | --------------------------------------------------------------------------------------------------------------- |
| Graph Explorer   | `/graph`      | Force-directed graph of all 5 layers; click a node to highlight its neighbourhood and view details.             |
| Data Catalogue   | `/catalog`    | HealthDCAT-AP dataset cards with publisher, license, temporal coverage, and expandable detail panels.           |
| Compliance Chain | `/compliance` | Trace a DSP contract from DataProduct → OdrlPolicy → Contract → HDABApproval in one query.                      |
| Patient Journey  | `/patient`    | Time-ordered FHIR R4 timeline (encounters, conditions, medications, procedures) alongside the OMOP CDM mapping. |
| OMOP Analytics   | `/analytics`  | Cohort-level stat cards (patients, conditions, drugs, procedures), gender breakdown, and top-15 bar charts.     |
| EEHRxF Profiles  | `/eehrxf`     | EU FHIR profile alignment with EHDS priority category coverage, HL7 Europe IG inventory, and gap analysis.      |

---

## Project Structure

The repository is intentionally minimal. Neo4j Cypher scripts in `neo4j/` build the graph in
layers; the `ui/` directory is a standalone Next.js app that only requires the Neo4j container to
be running. No build step is needed for the graph itself.

```text
MinimumViableHealthDataspacev2/
├── README.md
├── docker-compose.yml            # Neo4j 5 with APOC + n10s plugins
├── docker-compose.jad.yml        # JAD stack: 19 EDC-V/CFM/DCore services
├── LICENSE
├── docs/
│   ├── planning-health-dataspace-v2.md   # 7-phase implementation roadmap
│   ├── health-dataspace-graph-schema.md  # 5-layer Neo4j schema reference
│   └── images/
│       ├── social-preview.svg            # GitHub social preview / OG image
│       ├── architecture.svg              # 5-layer architecture diagram
│       ├── graph-schema.png              # Knowledge graph schema screenshot
│       ├── synthetic-patient-journey.png # Full patient journey screenshot
│       └── ui-screenshot.png             # Graph Explorer UI screenshot
├── jad/                          # JAD stack configuration
│   ├── edcv-assets/              # Phase 4a: EDC-V asset + policy + contract JSON
│   ├── openapi/                  # OpenAPI specs for all JAD services
│   ├── keycloak-realm.json       # Keycloak realm import
│   ├── bootstrap-vault.sh        # Vault JWT auth + data plane keys
│   ├── init-postgres.sql         # 8-database PostgreSQL init
│   └── *.yaml / *.env            # Per-service configuration files
├── neo4j/
│   ├── init-schema.cypher        # Neo4j constraints and indexes
│   ├── seed-data.cypher          # L1–L5 seed data (Synthea-derived)
│   ├── register-dsp-marketplace.cypher   # Phase 3e: DSP marketplace chain
│   └── register-eehrxf-profiles.cypher   # Phase 3h: EEHRxF profile alignment
├── services/
│   └── neo4j-proxy/              # DCore ↔ Neo4j bridge (TypeScript/Express)
│       ├── src/index.ts          # 6 endpoints: FHIR, OMOP, HealthDCAT-AP
│       ├── Dockerfile            # Multi-stage Node.js 20 build
│       └── package.json
├── scripts/                      # Utility and data-prep scripts
│   ├── bootstrap-jad.sh          # Start JAD stack with health checks
│   └── generate-synthea.sh       # Generate synthetic FHIR data
└── ui/                           # Next.js 14 application
    └── src/app/
        ├── graph/                # Graph Explorer
        ├── catalog/              # HealthDCAT-AP Catalogue
        ├── compliance/           # Compliance Chain Inspector
        ├── patient/              # Patient Journey
        ├── analytics/            # OMOP Analytics Dashboard
        └── eehrxf/               # EEHRxF Profile Alignment
```

---

## Quick Start

The full stack runs locally in under five minutes. You need Docker for Neo4j and Node.js for the
UI — no cloud account or external services required.

### Step 1 — Prerequisites

Make sure the following tools are installed and available on your `$PATH`:

- **Docker Desktop ≥ 24** — runs the Neo4j 5 container with APOC and n10s plugins.
- **Node.js ≥ 20 with npm** — required to run the Next.js UI.
- **Git** — to clone the repository.

### Step 2 — Clone

Fetch the repository and enter the project root:

```bash
git clone https://github.com/ma3u/MinimumViableHealthDataspacev2.git
cd MinimumViableHealthDataspacev2
```

### Step 3 — Start Neo4j

The `docker-compose.yml` at the root starts a Neo4j 5 Community container named
`health-dataspace-neo4j` and exposes Bolt on port **7687** and the browser UI on port **7474**.
APOC and n10s plugins are pre-configured via environment variables.

```bash
docker compose up -d
```

Verify the container is healthy, then open Neo4j Browser at <http://localhost:7474> and log in
with `neo4j` / `healthdataspace`.

### Step 4 — Initialise Schema

This step creates all uniqueness constraints and indexes for the five layers. Running it before
loading data ensures fast lookups and prevents duplicate nodes from being created on re-runs.

```bash
cat neo4j/init-schema.cypher | \
  docker exec -i health-dataspace-neo4j \
  cypher-shell -u neo4j -p healthdataspace
```

You can verify the schema was applied by running `CALL db.schema.visualization()` in Neo4j
Browser — the meta-graph should show all five layer labels.

### Step 5 — Load Seed Data

This script inserts a complete synthetic scenario: eight patients with FHIR clinical events (Layer 3) already transformed into OMOP CDM node equivalents (Layer 4) and linked to biomedical ontology
codes (Layer 5). The HealthDCAT-AP catalogue entry (Layer 2) referencing the dataset is also
created here.

```bash
cat neo4j/seed-data.cypher | \
  docker exec -i health-dataspace-neo4j \
  cypher-shell -u neo4j -p healthdataspace
```

After loading, the cross-layer patient journey is visible in Neo4j Browser:

![Full Synthetic Patient Journey](docs/images/synthetic-patient-journey.png)

### Step 6 — Register DSP Marketplace Chain

This script wires up the full EHDS data-access governance chain (Layer 1): a `DataProduct` is
linked to an `OdrlPolicy`, which is referenced by a `Contract`. An `AccessApplication` and
`HDABApproval` node complete the chain and are connected back to the seed dataset via a
`GRANTS_ACCESS_TO` relationship. This models Article 45–52 EHDS compliance in the graph.

```bash
cat neo4j/register-dsp-marketplace.cypher | \
  docker exec -i health-dataspace-neo4j \
  cypher-shell -u neo4j -p healthdataspace
```

### Step 7 — Register EEHRxF Profile Alignment

This script creates EEHRxFCategory and EEHRxFProfile nodes representing the six EHDS priority
categories and their corresponding HL7 Europe FHIR Implementation Guide profiles. Coverage
scores are computed dynamically against the loaded FHIR resources.

```bash
cat neo4j/register-eehrxf-profiles.cypher | \
  docker exec -i health-dataspace-neo4j \
  cypher-shell -u neo4j -p healthdataspace
```

### Step 8 — Install UI Dependencies

The UI is a standard Next.js 14 application in the `ui/` directory. It connects to Neo4j over
Bolt using the credentials from `.env.local` (matching the local container defaults). Install
npm packages once:

```bash
cd ui && npm install
```

> **Note:** A `.env.local.example` is provided. Copy it to `.env.local` if you need to customise
> the Neo4j connection URL or credentials.

### Step 9 — Start the UI

Start the development server. Hot-reload is enabled, so any UI changes are reflected immediately without restarting Neo4j or reloading data.

```bash
npm run dev
```

Open <http://localhost:3000> in your browser. The home page links to all six views.

![Graph Explorer UI](docs/images/ui-screenshot.png)

---

## Testing

The project has comprehensive test coverage across unit, API-route, and end-to-end tests.
See the full **[Test Report](docs/test-report.md)** for detailed metrics and inventory.

| Suite      | Framework    |   Tests |  Files | Status      |
| ---------- | ------------ | ------: | -----: | ----------- |
| Unit + API | Vitest + RTL |     247 |     35 | ✅ All pass |
| E2E        | Playwright   |      31 |      4 | ✅ All pass |
| **Total**  |              | **278** | **39** | ✅          |

**Code coverage** (v8): 71.76% statements · 51.15% branches · 67.16% functions · 72.10% lines

```bash
# Run unit tests
cd ui && npx vitest run

# Run with coverage report
npx vitest run --coverage

# Run Playwright E2E tests (requires dev server on :3000)
npx playwright test

# Regenerate the test report markdown
../scripts/generate-test-report.sh
```

CI runs on every push and PR via [`.github/workflows/test.yml`](.github/workflows/test.yml).
Coverage reports and Playwright HTML reports are uploaded as GitHub Actions artifacts.

---

## Development

This project uses [pre-commit](https://pre-commit.com/) hooks to keep Markdown, YAML, and JSON
sources consistently formatted. Hooks run automatically on every `git commit` and fix files in place (e.g. trailing whitespace, missing newlines, Prettier formatting).

### Run pre-commit checks

Run all hooks against every file without making a commit:

```bash
pre-commit run --all-files
```

> **Tip:** If a commit fails because a hook auto-fixed a file, stage the fixed file and retry:
>
> ```bash
> git add <file> && git commit
> ```

### Neo4j driver note

The UI driver (`ui/src/lib/neo4j.ts`) is configured with `{ disableLosslessIntegers: true }`. By default the JavaScript Neo4j driver wraps 64-bit integers as `{ low, high }` objects; this flag converts them to native JavaScript numbers so stat card values render correctly instead of showing `[object Object]`.

### JAD Stack (EDC-V + CFM + DCore)

The full dataspace connector stack is defined in `docker-compose.jad.yml` using container images from the [JAD (Joint Architecture Demo)](https://github.com/Metaform/jad). This runs 19 services including EDC-V Control Plane, dual DCore Data Planes (FHIR PUSH + OMOP PULL), Neo4j Query Proxy, IdentityHub (DCP v1.0), IssuerService, Keycloak, Vault, NATS, and CFM agents.

```bash
# Start full JAD stack (+ Neo4j from base compose)
./scripts/bootstrap-jad.sh

# Or manually with docker compose
docker compose -f docker-compose.yml -f docker-compose.jad.yml up -d

# Check status
./scripts/bootstrap-jad.sh --status

# Tear down
./scripts/bootstrap-jad.sh --down
```

Service endpoints after startup:

| Service           | URL                       | Credentials       |
| ----------------- | ------------------------- | ----------------- |
| Traefik Dashboard | http://localhost:8090     | —                 |
| Keycloak Admin    | http://keycloak.localhost | admin / admin     |
| Vault UI          | http://vault.localhost    | token: root       |
| Control Plane     | http://cp.localhost       | OAuth2 (Keycloak) |
| Data Plane FHIR   | http://dp-fhir.localhost  | OAuth2 (Keycloak) |
| Data Plane OMOP   | http://dp-omop.localhost  | OAuth2 (Keycloak) |
| Neo4j Query Proxy | http://proxy.localhost    | internal (DCore)  |
| Identity Hub      | http://ih.localhost       | OAuth2 (Keycloak) |
| Issuer Service    | http://issuer.localhost   | OAuth2 (Keycloak) |
| Tenant Manager    | http://tm.localhost       | OAuth2 (Keycloak) |
| Provision Manager | http://pm.localhost       | OAuth2 (Keycloak) |
| NATS Monitor      | http://localhost:8222     | —                 |

Configuration files are in the `jad/` directory. OpenAPI specs are in `jad/openapi/`. EDC-V asset registration payloads (Phase 4a) are in `jad/edcv-assets/`.

### All Docker Service Endpoints

Complete list of all services and their direct `localhost` port mappings when the full stack
(base + JAD + UI) is running in Docker / OrbStack:

| Service                 | Port(s)                       | URL / Endpoint         | Description                                               |
| ----------------------- | ----------------------------- | ---------------------- | --------------------------------------------------------- |
| **Graph Explorer UI**   | 3000                          | http://localhost:3000  | Next.js 14 app — graph, catalogue, analytics views        |
| **Neo4j Browser**       | 7474                          | http://localhost:7474  | Neo4j Browser (primary instance, `neo4j/healthdataspace`) |
| **Neo4j Bolt**          | 7687                          | bolt://localhost:7687  | Bolt driver endpoint (primary instance)                   |
| **Neo4j SPE-2 Browser** | 7475                          | http://localhost:7475  | Neo4j Browser (second participant)                        |
| **Neo4j SPE-2 Bolt**    | 7688                          | bolt://localhost:7688  | Bolt driver endpoint (second participant)                 |
| **Neo4j Query Proxy**   | 9090                          | http://localhost:9090  | DCore ↔ Neo4j bridge (NLQ + federated queries)           |
| **Traefik Proxy**       | 80                            | http://localhost       | Reverse proxy — routes `*.localhost` domains              |
| **Traefik Dashboard**   | 8090                          | http://localhost:8090  | Traefik admin dashboard                                   |
| **Keycloak**            | 8080, 9000                    | http://localhost:8080  | IAM / OAuth2 provider (`admin/admin`)                     |
| **Vault**               | 8200                          | http://localhost:8200  | HashiCorp Vault (token: `root`)                           |
| **Control Plane**       | 11003                         | http://localhost:11003 | EDC-V Management API (DSP + DCP)                          |
| **Data Plane FHIR**     | 11002                         | http://localhost:11002 | DCore Data Plane — FHIR PUSH                              |
| **Data Plane OMOP**     | 11012                         | http://localhost:11012 | DCore Data Plane — OMOP PULL                              |
| **Identity Hub**        | 11005                         | http://localhost:11005 | DCP v1.0 Decentralized Claims                             |
| **Issuer Service**      | 10013                         | http://localhost:10013 | Verifiable Credential issuer                              |
| **Tenant Manager**      | 11006                         | http://localhost:11006 | Multi-tenant management API                               |
| **Provision Manager**   | 11007                         | http://localhost:11007 | Resource provisioning API                                 |
| **NATS**                | 4222 (client), 8222 (monitor) | http://localhost:8222  | Message bus — monitoring dashboard                        |
| **PostgreSQL**          | 5432                          | localhost:5432         | Shared database (8 schemas)                               |
| CFM EDC-V Agent         | —                             | internal               | Connector Framework Module agent                          |
| CFM Keycloak Agent      | —                             | internal               | Keycloak integration agent                                |
| CFM Onboarding Agent    | —                             | internal               | Participant onboarding agent                              |
| CFM Registration Agent  | —                             | internal               | Service registration agent                                |

> **Note:** Inside Docker, services communicate using Docker DNS names (e.g. `bolt://neo4j:7687`).
> The `localhost` ports above are the host-mapped ports for external access from your browser or
> development tools.

---

## Documentation

Detailed reference documents live in the `docs/` directory. The UI documentation is also
available online at **[ma3u.github.io/MinimumViableHealthDataspacev2/docs](https://ma3u.github.io/MinimumViableHealthDataspacev2/docs)**.

| Document                                                                       | Description                                                                              |
| ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| [docs/planning-health-dataspace-v2.md](docs/planning-health-dataspace-v2.md)   | 7-phase implementation roadmap covering EDC-V, DCore, CFM, and Neo4j integration steps.  |
| [docs/health-dataspace-graph-schema.md](docs/health-dataspace-graph-schema.md) | Full 5-layer Neo4j graph schema: node labels, property keys, indexes, and relationships. |
| [docs/test-report.md](docs/test-report.md)                                     | Test suite metrics, coverage data, and test inventory (278 tests across 39 files).       |
| [.github/workflows/test.yml](.github/workflows/test.yml)                       | CI pipeline — lint, unit tests with coverage, Playwright E2E tests.                      |
| [jad/openapi/](jad/openapi/)                                                   | OpenAPI specs for all JAD services (Management, Identity, Issuer APIs).                  |

---

## Implementation Status

The project follows a phased roadmap. Phases 1–5 implement the full local demo stack with
live DSP contract negotiation and federated queries; Phase 6b adds the unified participant
portal with onboarding, data sharing, and operator dashboard; Phase 7 will add protocol
compliance testing.

| Phase | Description                                                                                     | Status      |
| ----- | ----------------------------------------------------------------------------------------------- | ----------- |
| 1     | Environment setup — Neo4j 5, Docker Compose, Next.js scaffold, pre-commit hooks                 | ✅ Complete |
| 1c    | JAD Docker Compose — full EDC-V + CFM + DCore stack with bootstrap script                       | ✅ Complete |
| 1d    | OpenAPI TypeScript client generation — type-safe API clients for all JAD services               | ✅ Complete |
| 1e    | ADR-2 Implementation — dual data planes (FHIR PUSH + OMOP PULL) + Neo4j Query Proxy             | ✅ Complete |
| 1f    | Phase 4a prep — EDC-V asset/policy/contract registration payloads + Vault dual-DP key bootstrap | ✅ Complete |
| 2     | Identity and Trust — DID:web for 3 tenants, Ed25519 keys, all activated (ADR-7)                 | ✅ Complete |
| 2b    | EHDS credential types — 3 credential defs on IssuerService, 5 VC nodes in Neo4j, DCP scopes     | ✅ Complete |
| 2c    | Keycloak SSO — PKCE client, 3 roles, 3 demo users, NextAuth.js, role-based middleware           | ✅ Complete |
| 3     | Graph schema + seed data for all 5 layers, APOC/n10s plugins, GraSS colour style                | ✅ Complete |
| 3a    | Graph Explorer UI — force-directed 5-layer graph via `react-force-graph-2d`                     | ✅ Complete |
| 3b    | HealthDCAT-AP Catalogue view — dataset cards with publisher, license, and distribution info     | ✅ Complete |
| 3c    | Compliance Chain Inspector — ODRL policy + HDABApproval trace                                   | ✅ Complete |
| 3d    | Patient Journey view — FHIR R4 timeline with OMOP CDM mapping sidebar                           | ✅ Complete |
| 3e    | DSP Marketplace registration — full Layer 1 EDC governance chain wired to dataset               | ✅ Complete |
| 3f    | OMOP Research Analytics dashboard — cohort stat cards, gender breakdown, top-15 bar charts      | ✅ Complete |
| 3g    | Procedure pipeline — 8,534 FHIR Procedures → OMOPProcedureOccurrence; Analytics home card       | ✅ Complete |
| 3h    | EEHRxF FHIR profile alignment — EU priority categories, HL7 Europe IG profiles, gap analysis UI | ✅ Complete |
| 4     | Dataspace Integration — DSP contract negotiation, federated catalog, DCore data transfer        | ✅ Complete |
| 4a    | Data asset registration — 4 assets on Clinic EDC-V, ODRL policies, contract definitions         | ✅ Complete |
| 4b    | Contract negotiation — 3 FINALIZED negotiations, transfer STARTED (CRO → Clinic)                | ✅ Complete |
| 4c    | Federated Catalog — 4 datasets discoverable via DSP, HDAB contract FINALIZED                    | ✅ Complete |
| 4d    | Data Plane Transfer — 100 FHIR patients + 2 HealthDCAT-AP datasets via DCore                    | ✅ Complete |
| 5     | Federated Queries — Neo4j SPE-2, federated dispatch, k-anonymity, Text2Cypher NLQ               | ✅ Complete |
| 6a    | Graph Explorer UI — 7 views + Docker `graph-explorer` container + GitHub Pages static export    | ✅ Complete |
| 6b    | Unified Participant Portal — 12 pages, 11 API routes, dropdown nav, auth middleware             | ✅ Complete |
| 7     | TCK DCP & DSP Compliance Verification — protocol conformance testing                            | 🔲 Planned  |

---

## Contributing

Contributions are welcome — whether that is a bug fix, a new UI view, an improved Cypher query, or additional documentation. Please open an issue first to discuss larger changes before sending a pull request. See [.github/CONTRIBUTING.md](.github/CONTRIBUTING.md) for coding conventions,
schema change rules, and the PR checklist.

---

## Background

- **Background LinkedIn Article:** [European Health Dataspaces, Digital Twins: A Journey from FHIR Basics to Intelligent Patient Models](https://www.linkedin.com/pulse/european-health-dataspaces-digital-twins-journey-fhir-buchhorn-roth-8t51c/)

---

## Security

- **No patient data** — all clinical records are synthetic (Synthea-generated) and are excluded from the repository via `.gitignore`. Never commit real patient data.
- **Local credentials only** — the default Neo4j credentials (`neo4j` / `healthdataspace`) are intentionally weak and suitable only for local development. They must not be used in any internet-facing deployment.
- **Environment files** — production deployments should inject credentials via `.env` files or secret managers. `.env` is excluded from version control via `.gitignore`.

---

## License

[Apache 2.0](LICENSE) © 2026 Matthias Buchhorn-Roth

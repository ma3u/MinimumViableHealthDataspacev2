# Minimum Viable Health Dataspace v2

[![CI Tests](https://github.com/ma3u/MinimumViableHealthDataspacev2/actions/workflows/test.yml/badge.svg)](https://github.com/ma3u/MinimumViableHealthDataspacev2/actions/workflows/test.yml) [![Coverage 72%](https://img.shields.io/badge/coverage-72%25-green)](docs/test-report.md) [![247 Tests](https://img.shields.io/badge/tests-247%20passed-brightgreen)](docs/test-report.md) [![Playwright 31](https://img.shields.io/badge/E2E-31%20passed-brightgreen)](docs/test-report.md)

[![EHDS Compliant](https://img.shields.io/badge/EHDS-Compliant-0ea5e9)](https://health.ec.europa.eu/ehealth-digital-health-and-care/european-health-data-space_en) [![FHIR R4](https://img.shields.io/badge/FHIR-R4-orange)](https://hl7.org/fhir/R4/) [![OMOP CDM](https://img.shields.io/badge/OMOP-CDM%20v5.4-yellow)](https://ohdsi.github.io/CommonDataModel/) [![EEHRxF](https://img.shields.io/badge/EEHRxF-HL7%20Europe-148F77)](https://hl7.eu/fhir/) [![Neo4j 5](https://img.shields.io/badge/Neo4j-5%20Community-008CC1?logo=neo4j&logoColor=white)](https://neo4j.com/) [![Next.js 14](https://img.shields.io/badge/Next.js-14-black?logo=next.js&logoColor=white)](https://nextjs.org/) [![Eclipse EDC](https://img.shields.io/badge/Eclipse-EDC--V-blue)](https://eclipse-edc.github.io/docs/) [![DSP Dataspace Protocol 2025-1](https://img.shields.io/badge/DSP-Dataspace%20Protocol%202025--1-6366f1)](https://docs.internationaldataspaces.org/ids-knowledgebase/v/dataspace-protocol) [![DCP Decentralized Claims Protocol v1.0](https://img.shields.io/badge/DCP-Decentralized%20Claims%20Protocol%20v1.0-7c3aed)](https://projects.eclipse.org/projects/technology.dataspace-dcp/releases/1.0.0) [![DPS](https://img.shields.io/badge/DPS-Data%20Plane%20Signaling-0891b2)](https://projects.eclipse.org/proposals/eclipse-data-plane-core) [![SIMPL](https://img.shields.io/badge/SIMPL-EU%20Cloud%20Federation-e11d48)](https://simpl-programme.eu/) [![License: Apache 2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)

## Table of Contents

- [Minimum Viable Health Dataspace v2](#minimum-viable-health-dataspace-v2)
  - [Table of Contents](#table-of-contents)
  - [Why This Project Exists](#why-this-project-exists)
  - [What It Does](#what-it-does)
  - [Architecture](#architecture)
  - [UI Views](#ui-views)
  - [Project Structure](#project-structure)
  - [Quick Start](#quick-start)
    - [Step 1 — Prerequisites](#step-1--prerequisites)
    - [Step 2 — Clone](#step-2--clone)
    - [Step 3 — Start Neo4j](#step-3--start-neo4j)
    - [Step 4 — Initialise Schema](#step-4--initialise-schema)
    - [Step 5 — Load Seed Data](#step-5--load-seed-data)
    - [Step 6 — Register DSP Marketplace Chain](#step-6--register-dsp-marketplace-chain)
    - [Step 7 — Register EEHRxF Profile Alignment](#step-7--register-eehrxf-profile-alignment)
    - [Step 8 — Install UI Dependencies](#step-8--install-ui-dependencies)
    - [Step 9 — Start the UI](#step-9--start-the-ui)
  - [Testing](#testing)
  - [Development](#development)
    - [Run pre-commit checks](#run-pre-commit-checks)
    - [Neo4j driver note](#neo4j-driver-note)
    - [JAD Stack (EDC-V + CFM + DCore)](#jad-stack-edc-v--cfm--dcore)
    - [All Docker Service Endpoints](#all-docker-service-endpoints)
  - [Documentation](#documentation)
  - [Implementation Status](#implementation-status)
    - [Container Inventory](#container-inventory)
      - [Tier 0 — Infrastructure Foundations (no dependencies, start first)](#tier-0--infrastructure-foundations-no-dependencies-start-first)
      - [Tier 1 — Core Identity \& UI (depend on Tier 0)](#tier-1--core-identity--ui-depend-on-tier-0)
      - [Tier 2 — EDC-V Core + Identity Services (depend on Tier 0 + 1)](#tier-2--edc-v-core--identity-services-depend-on-tier-0--1)
      - [Tier 3 — Data Planes, Proxy, Provisioning \& CFM Agents (depend on Tier 2)](#tier-3--data-planes-proxy-provisioning--cfm-agents-depend-on-tier-2)
      - [Tier 4 — Seed Job (runs once after all services are ready)](#tier-4--seed-job-runs-once-after-all-services-are-ready)
      - [Dependency Graph](#dependency-graph)
  - [Contributing](#contributing)
  - [Background](#background)
  - [Security](#security)
  - [License](#license)

---

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

To access the protected **Portal** views (which simulate dataspace participation, policy management, and onboarding), use any of the following pre-configured Keycloak test accounts:

| Username     | Password     | Persona / Role                                    |
| ------------ | ------------ | ------------------------------------------------- |
| `edcadmin`   | `edcadmin`   | Dataspace Administrator (`EDC_ADMIN`)             |
| `clinicuser` | `clinicuser` | Hospital Participant (`EDC_USER_PARTICIPANT`)     |
| `regulator`  | `regulator`  | Health Data Access Body / HDAB (`HDAB_AUTHORITY`) |

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

All 12 phases are **✅ Complete** — from infrastructure migration through EDC-V topology and EHDS policy seeding.

| Phase | Description                                              | Status      |
| ----- | -------------------------------------------------------- | ----------- |
| 1     | Infrastructure Migration (EDC-V + DCore + CFM)           | ✅ Complete |
| 2     | Identity & Trust (DCP v1.0 + Verifiable Credentials)     | ✅ Complete |
| 3     | Health Knowledge Graph — Schema, FHIR Pipeline, EEHRxF   | ✅ Complete |
| 4     | Dataspace Integration (DSP negotiation + DCore transfer) | ✅ Complete |
| 5     | Federated Queries & GraphRAG (Text2Cypher NLQ)           | ✅ Complete |
| 6     | Graph Explorer UI + Participant Portal (19 pages)        | ✅ Complete |
| 7     | TCK DCP & DSP Compliance Verification                    | ✅ Complete |
| 8     | Test Coverage (291 tests — 260 unit + 31 E2E)            | ✅ Complete |
| 9     | Documentation & Navigation Restructuring                 | ✅ Complete |
| 10    | Tasks Dashboard & DPS Integration                        | ✅ Complete |
| 11    | EDC Components — Per-Participant Topology & Info Layer    | ✅ Complete |
| 12    | API QuerySpec Fix & EHDS Policy Seeding                  | ✅ Complete |

#### Phase 1 — Infrastructure Migration (EDC-V + DCore + CFM)

Replaced the monolithic Minimum Viable Dataspace (MVD) reference with a production-grade
Eclipse stack: EDC-V control plane, DCore Rust data planes, and CFM multi-tenant management.
Deployed the full JAD (Joint Applicant Deployment) via `docker-compose.jad.yml` with 18
Docker services, including PostgreSQL 17 (8 isolated schemas), HashiCorp Vault, NATS
JetStream, Keycloak, and Traefik reverse proxy. Provisioned three EHDS tenant profiles —
AlphaKlinik Berlin (DATA_HOLDER), PharmaCo Research AG (DATA_USER), and MedReg DE (HDAB) —
each with their own participant context and Virtual Participant Addresses (VPAs). Designed a
dual data plane architecture (ADR-2): `dataplane-fhir` for HttpData-PUSH clinical transfers
and `dataplane-omop` for HttpData-PULL analytics queries routed through a Neo4j Query Proxy.
Generated TypeScript API clients from OpenAPI specs for all JAD management, identity, and
issuer endpoints. Bootstrapped Vault with per-participant Ed25519 signing keys, AES
encryption keys, and STS client secrets.

#### Phase 2 — Identity & Trust (DCP v1.0 + Verifiable Credentials)

Established decentralised identity following the DCP v1.0 specification. Created `did:web`
identifiers for all five fictional participants (AlphaKlinik Berlin, PharmaCo Research AG,
MedReg DE, Limburg Medical Centre, Institut de Recherche Santé) with Ed25519 key pairs
stored in Vault. Configured the IssuerService with three EHDS credential type definitions —
`EHDSParticipantCredential`, `DataProcessingPurposeCredential`, and
`DataQualityLabelCredential` — and issued 15 Verifiable Credentials (3 per participant)
stored in each participant's IdentityHub. Deployed Keycloak as the OAuth2/OIDC identity
provider with PKCE authorization code flow, three demo roles (`edcadmin`, `clinicuser`,
`regulator`), three demo users, and a pre-configured realm. Integrated Keycloak with the
Next.js UI via NextAuth.js for session-based authentication across all views.

#### Phase 3 — Health Knowledge Graph (Schema, FHIR Pipeline, EEHRxF)

Built the five-layer Neo4j knowledge graph that underpins the entire dataspace. Layer 1
(Marketplace) models the DSP approval chain; Layer 2 (HealthDCAT-AP) stores dataset catalog
metadata; Layer 3 (FHIR R4) holds clinical data; Layer 4 (OMOP CDM) provides the research
analytics model; Layer 5 (Ontology) contains SNOMED CT and LOINC hierarchies linked via
`IS_A` relationships. Generated 167 synthetic patients with Synthea, producing 58,000+
clinical events (encounters, conditions, observations, medications, procedures). Transformed
FHIR resources into OMOP CDM entities with bidirectional `MAPPED_TO` links. Registered two
HealthDCAT-AP datasets with distributions and EHDS Article 53 legal basis. Mapped 8,534
procedures across the patient population. Aligned FHIR resources with the six EEHRxF priority
categories (Patient Summary, ePrescription, Laboratory, Medical Imaging, Discharge Reports,
Rare Diseases) referencing 14 HL7 Europe profiles.

#### Phase 4 — Dataspace Integration (DSP Negotiation + DCore Transfer)

Demonstrated end-to-end DSP-compliant data exchange between participants. Registered four
data assets on the AlphaKlinik Clinic EDC-V control plane (FHIR patient bundles, OMOP
cohorts, HealthDCAT-AP catalogs). Executed three contract negotiations through the full DSP
state machine (`REQUESTED → OFFERED → ACCEPTED → AGREED → VERIFIED → FINALIZED`). Populated
the HDAB federated catalog with all four datasets discoverable via DSP catalog queries.
Completed DCore data plane transfers: 100 FHIR patients pulled via `dataplane-fhir`
(HttpData-PUSH) and 2 HealthDCAT-AP datasets via `dataplane-omop` (HttpData-PULL), all
authenticated with Ed25519 JWT bearer tokens. Projected completed contract and transfer
events into Neo4j Layer 1 for audit trail and graph-based provenance queries.

#### Phase 5 — Federated Queries & GraphRAG (Text2Cypher NLQ)

Added cross-SPE federation and natural language querying to support multi-site research.
Deployed a second Neo4j Secure Processing Environment (`neo4j-spe2`) with an independent data
partition (37 patients, 25,000+ clinical events). Built application-layer federation in the
Neo4j Proxy — dispatching read-only Cypher to all SPEs in parallel, merging results with
source labels, and supporting k-anonymity filtering (`minK` threshold suppression).
Implemented a Text2Cypher natural language query pipeline with three resolution tiers:
template matching (9 built-in patterns), optional LLM fallback (OpenAI/Ollama), and federated
dispatch mode. Created the NLQ Explorer UI (`/query`) with free-text input, federated toggle,
dynamic result tables, method badges (template vs. LLM), Cypher inspector, SPE overview, and
query history.

#### Phase 6 — Graph Explorer UI + Participant Portal (19 Pages)

Delivered a unified Next.js 14 web application covering exploration, governance, onboarding,
data sharing, and operations. Phase 6a built seven explorer views: Graph Explorer (force-
directed 5-layer visualisation), Dataset Catalog (HealthDCAT-AP browser), EHDS Compliance
(HDAB approval chain validator), Patient Journey (FHIR→OMOP timeline), OMOP Analytics
(cohort-level dashboard), EEHRxF Profiles (gap analysis), and NLQ/Federated query. Phase 6b
ported three reference Angular UIs into Next.js: Aruba participant onboarding (self-
registration, credential management), Fraunhofer data sharing (asset publishing, catalog
discovery, contract negotiation wizard, transfer monitoring), and Redline operator dashboard
(tenant management, policy editor, audit log). Added Keycloak role-based access control to all
portal routes. Deployed as a Docker service (`graph-explorer`) and as a static export to
GitHub Pages.

#### Phase 7 — TCK DCP & DSP Compliance Verification

Validated protocol conformance using official Technology Compatibility Kits and custom test
suites. Ran the DSP 2025-1 TCK (140+ test cases) against all three participant connectors,
covering catalog protocol, contract negotiation lifecycle, transfer process, and message
schema validation. Verified DCP v1.0 compliance for IdentityHub and IssuerService: DID
resolution, Self-Issued Identity Token generation/validation, credential presentation
exchange, and credential issuance with StatusList2021 revocation. Created a custom EHDS health
domain test suite covering Article 53 purpose enforcement (accepted/rejected negotiations
based on credential presence), HealthDCAT-AP v3.0 schema compliance, EEHRxF FHIR profile
validation, and OMOP CDM transformation integrity. Automated all tests in a GitHub Actions
CI/CD pipeline with weekly scheduled runs.

#### Phase 8 — Test Coverage (291 Tests — 260 Unit + 31 E2E)

Expanded test coverage from initial scaffolding to comprehensive quality assurance. Added
integration tests for all API routes using Vitest with mocked Neo4j and EDC clients — covering
happy-path responses, empty-data scenarios, POST validation, and 502 error handling. Tested UI
components (UserMenu states, fetchApi routing, Navigation highlighting). Lifted overall
statement coverage from 10.5% to 71.76% (+583%). Created `.github/workflows/test.yml` for
automated CI: unit tests with coverage, ESLint linting, and Playwright E2E tests on every push
and pull request. Coverage reports published as CI artifacts and documented in
`docs/test-report.md`.

#### Phase 9 — Documentation & Navigation Restructuring

Made the project accessible to both business stakeholders and developers. Created four in-app
documentation pages: landing page with section cards, user guide covering all application
views and EHDS workflows, developer guide with tech stack, API reference, testing setup, and
ADR summaries, and architecture page with interactive Mermaid diagrams (5-layer graph, data
flow pipeline, deployment topology, DSP negotiation sequence, DCP trust framework).
Reorganised navigation from flat links and overflow menus into five logical dropdown clusters:
Explore, Governance, Exchange, Portal, and Docs. Refreshed the home page with a two-section
card layout. All pages use client-side Mermaid rendering, fully compatible with Next.js static
export for GitHub Pages deployment.

#### Phase 10 — Tasks Dashboard & DPS Integration

Built a unified operational view for monitoring contract negotiations and transfer processes.
The `/api/tasks` route queries all registered participant contexts in parallel, mapping raw
EDC objects to a unified task type with human-readable participant names, asset labels, and DPS
metadata. For transfers in `STARTED` state, it checks `contentDataAddress` for Endpoint Data
Reference availability — indicating the Data Plane has processed the DPS START signal. The
`/tasks` UI renders DSP pipeline steppers showing each task's position in the state machine
(animated for active states, green checkmarks for completed, red X for terminated). Features
include summary cards, filter tabs, auto-refresh polling, and deep links to negotiation/
transfer detail pages.

#### Phase 11 — EDC Components Topology & Info Layer

Enhanced the `/admin/components` page to reflect the decentralised architecture where each
participant operates their own connector stack. Added info overlays (ⓘ) on all 18 component
types explaining their role, protocol implementation, ports, dependencies, and health source.
Restructured the view with a Layer ↔ Participant toggle: the participant view groups
components by owner (Control Plane, Data Planes, IdentityHub, Keycloak, Vault, Tenant
Manager per participant). Added critical service indicators with severity escalation — red
(unhealthy/exited), yellow (starting/high resource), green (healthy), grey (unknown) — and a
degraded-participant summary banner with quick-navigation links.

#### Phase 12 — API QuerySpec Fix & EHDS Policy Seeding

Resolved a critical EDC-V Management API compatibility issue: `POST .../request` list
endpoints returned empty results when the `QuerySpec` body omitted `filterExpression`. The
EDC-V query engine treats a missing field as "match nothing" rather than "no filter". Fixed by
adding `"filterExpression": []` to all QuerySpec objects across 6 API routes (policies, assets,
tasks, negotiations, transfers). Created `jad/seed-ehds-policies.sh` to dynamically discover
participant context IDs and seed 14 EHDS-specific ODRL policy definitions across all five
participants — covering research access, cross-border access, public health, AI training,
regulatory, and open catalog scenarios. Replaced the card grid for participants in the Layer
View with a consistent table layout.

For detailed sub-task breakdowns, ADR references, and implementation notes, see the full **[Implementation Roadmap](docs/planning-health-dataspace-v2.md#implementation-progress)**.

### Container Inventory

The full stack comprises **22 containers** across two Docker Compose files. Containers are
grouped by startup tier — Docker Compose launches each tier in parallel once all dependencies
in the previous tier report healthy. The `neo4j-spe2` and `jad-seed` containers only start
when their respective profiles (`federated`, `seed`) are explicitly activated.

![ORB K8s cluster with all Minimum Viable Health Dataspace V2](image-1.png)

```
Tier 0 ──► Tier 1 ──► Tier 2 ──► Tier 3 ──► Tier 4
```

#### Tier 0 — Infrastructure Foundations (no dependencies, start first)

| #   | Service        | Container Name                | Compose File             | Port(s)    | Description                                                                                                                                       |
| --- | -------------- | ----------------------------- | ------------------------ | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `neo4j`        | `health-dataspace-neo4j`      | `docker-compose.yml`     | 7474, 7687 | Neo4j 5 Community — primary graph database with APOC + n10s plugins. Stores the 5-layer knowledge graph.                                          |
| 2   | `postgres`     | `health-dataspace-postgres`   | `docker-compose.jad.yml` | 5432       | PostgreSQL 17 — multi-database server (8 schemas: controlplane, identityhub, issuerservice, dataplane, dataplane_omop, keycloak, cfm, redlinedb). |
| 3   | `vault`        | `health-dataspace-vault`      | `docker-compose.jad.yml` | 8200       | HashiCorp Vault (dev mode) — secret management for signing keys, AES keys, and data plane token keys.                                             |
| 4   | `nats`         | `health-dataspace-nats`       | `docker-compose.jad.yml` | 4222, 8222 | NATS JetStream — async messaging bus for contract negotiation and transfer process state machine events.                                          |
| 5   | `traefik`      | `health-dataspace-traefik`    | `docker-compose.jad.yml` | 80, 8090   | Traefik v3 reverse proxy — routes `*.localhost` domains to internal services; replaces K8s Gateway API.                                           |
| 6   | `neo4j-spe2` ¹ | `health-dataspace-neo4j-spe2` | `docker-compose.yml`     | 7475, 7688 | Neo4j 5 Community — second Secure Processing Environment for federated query testing (Phase 5).                                                   |

> ¹ Only starts with `--profile federated`.

#### Tier 1 — Core Identity & UI (depend on Tier 0)

| #   | Service          | Container Name              | Compose File             | Port(s)    | Dependencies | Description                                                                                                       |
| --- | ---------------- | --------------------------- | ------------------------ | ---------- | ------------ | ----------------------------------------------------------------------------------------------------------------- |
| 7   | `keycloak`       | `health-dataspace-keycloak` | `docker-compose.jad.yml` | 8080, 9000 | `postgres`   | Keycloak — OAuth2/OIDC identity provider. Hosts `edcv` realm with 3 demo users, PKCE client, and role mappings.   |
| 8   | `graph-explorer` | `health-dataspace-ui`       | `docker-compose.yml`     | 3000       | `neo4j`      | Next.js 14 UI — Graph Explorer, Catalogue, Analytics, Portal views. Connects to Neo4j (Bolt) and Keycloak (OIDC). |

#### Tier 2 — EDC-V Core + Identity Services (depend on Tier 0 + 1)

| #   | Service           | Container Name                     | Compose File             | Port(s) | Dependencies                            | Description                                                                                                                              |
| --- | ----------------- | ---------------------------------- | ------------------------ | ------- | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| 9   | `vault-bootstrap` | `health-dataspace-vault-bootstrap` | `docker-compose.jad.yml` | —       | `vault`, `keycloak`                     | Init job (runs once, then exits) — configures JWT auth backend, secrets engine, policies, and signing keys in Vault.                     |
| 10  | `controlplane`    | `health-dataspace-controlplane`    | `docker-compose.jad.yml` | 11003   | `postgres`, `vault`, `nats`, `keycloak` | EDC-V Control Plane — DSP protocol engine, management API, contract negotiation state machine, ODRL policy evaluation.                   |
| 11  | `identityhub`     | `health-dataspace-identityhub`     | `docker-compose.jad.yml` | 11005   | `postgres`, `vault`, `keycloak`         | DCP v1.0 Identity Hub — stores Verifiable Credentials, handles DID resolution, and credential presentation requests.                     |
| 12  | `issuerservice`   | `health-dataspace-issuerservice`   | `docker-compose.jad.yml` | 10013   | `postgres`, `vault`, `keycloak`         | Verifiable Credential Issuer — trust anchor that issues MembershipCredential, EHDSParticipantCredential, and DataQualityLabelCredential. |
| 13  | `tenant-manager`  | `health-dataspace-tenant-manager`  | `docker-compose.jad.yml` | 11006   | `postgres`, `keycloak`                  | CFM Tenant Manager — multi-tenant participant lifecycle (create, activate, deactivate dataspace tenants).                                |

#### Tier 3 — Data Planes, Proxy, Provisioning & CFM Agents (depend on Tier 2)

| #   | Service                  | Container Name                            | Compose File             | Port(s) | Dependencies                                                     | Description                                                                                                                                            |
| --- | ------------------------ | ----------------------------------------- | ------------------------ | ------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 14  | `dataplane-fhir`         | `health-dataspace-dataplane-fhir`         | `docker-compose.jad.yml` | 11002   | `postgres`, `vault`, `controlplane`                              | DCore Data Plane (FHIR PUSH) — transfers FHIR R4 Bundle JSON to consumer endpoints via HttpData-PUSH protocol.                                         |
| 15  | `dataplane-omop`         | `health-dataspace-dataplane-omop`         | `docker-compose.jad.yml` | 11012   | `postgres`, `vault`, `controlplane`                              | DCore Data Plane (OMOP PULL) — serves OMOP CDM aggregate query results via HttpData-PULL protocol.                                                     |
| 16  | `neo4j-proxy`            | `health-dataspace-neo4j-proxy`            | `docker-compose.jad.yml` | 9090    | `controlplane`                                                   | Node.js/Express bridge — translates DCore HTTP requests into Cypher queries; serialises results as FHIR JSON, OMOP JSON/CSV, or HealthDCAT-AP JSON-LD. |
| 17  | `provision-manager`      | `health-dataspace-provision-manager`      | `docker-compose.jad.yml` | 11007   | `postgres`, `keycloak`, `controlplane`                           | CFM Provision Manager — automated resource provisioning for new tenants (Vault keys, DB schemas, EDC-V registrations).                                 |
| 18  | `cfm-agents`             | `health-dataspace-cfm-keycloak-agent`     | `docker-compose.jad.yml` | —       | `keycloak`, `tenant-manager`                                     | CFM Keycloak Agent — watches tenant events and provisions Keycloak client registrations and role mappings.                                             |
| 19  | `cfm-edcv-agent`         | `health-dataspace-cfm-edcv-agent`         | `docker-compose.jad.yml` | —       | `controlplane`, `tenant-manager`                                 | CFM EDC-V Agent — provisions connector resources (data plane selectors, asset definitions) for new tenants.                                            |
| 20  | `cfm-registration-agent` | `health-dataspace-cfm-registration-agent` | `docker-compose.jad.yml` | —       | `identityhub`, `issuerservice`, `tenant-manager`                 | CFM Registration Agent — registers DID documents and requests Verifiable Credentials from IssuerService for new tenants.                               |
| 21  | `cfm-onboarding-agent`   | `health-dataspace-cfm-onboarding-agent`   | `docker-compose.jad.yml` | —       | `controlplane`, `identityhub`, `issuerservice`, `tenant-manager` | CFM Onboarding Agent — orchestrates the full onboarding sequence: DID creation → VC issuance → connector setup → catalog entry.                        |

#### Tier 4 — Seed Job (runs once after all services are ready)

| #   | Service      | Container Name              | Compose File             | Port(s) | Dependencies                                                                          | Description                                                                                                                                    |
| --- | ------------ | --------------------------- | ------------------------ | ------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| 22  | `jad-seed` ² | `health-dataspace-jad-seed` | `docker-compose.jad.yml` | —       | `controlplane`, `identityhub`, `issuerservice`, `tenant-manager`, `provision-manager` | One-shot seed job — initialises IssuerService credential definitions, creates demo tenants, and triggers provisioning. Exits after completion. |

> ² Only starts with `--profile seed`.

#### Dependency Graph

```
                    ┌─────────┐
                    │  neo4j  │
                    └────┬────┘
                         │
                ┌────────▼────────┐
                │  graph-explorer  │
                └─────────────────┘

┌──────────┐  ┌──────────┐  ┌──────┐  ┌─────────┐
│ postgres │  │  vault   │  │ nats │  │ traefik │
└────┬─────┘  └────┬─────┘  └──┬───┘  └─────────┘
     │             │            │
     ├─────────────┼────────────┤
     │             │            │
     ▼             ▼            │
┌──────────┐  ┌──────────────┐  │
│ keycloak │  │vault-bootstrap│ │
└────┬─────┘  └──────────────┘  │
     │                          │
     ├──────────────────────────┤
     │                          │
     ▼                          ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌────────────────┐
│ controlplane │  │ identityhub  │  │issuerservice │  │ tenant-manager │
└──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └───────┬────────┘
       │                 │                 │                   │
       ├─────────────────┼─────────────────┼───────────────────┤
       │                 │                 │                   │
       ▼                 ▼                 ▼                   ▼
┌───────────────┐ ┌───────────────┐ ┌───────────┐ ┌─────────────────────┐
│dataplane-fhir │ │dataplane-omop │ │neo4j-proxy│ │ provision-manager   │
└───────────────┘ └───────────────┘ └───────────┘ └─────────────────────┘
                                                  ┌─────────────────────┐
                                                  │ cfm-agents (×4)     │
                                                  └─────────────────────┘
```

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

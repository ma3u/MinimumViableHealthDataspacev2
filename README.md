# Minimum Viable Health Dataspace v2

[![GitHub](https://img.shields.io/badge/GitHub-Repository-181717?logo=github&logoColor=white)](https://github.com/ma3u/MinimumViableHealthDataspacev2) [![CI Tests](https://github.com/ma3u/MinimumViableHealthDataspacev2/actions/workflows/test.yml/badge.svg)](https://github.com/ma3u/MinimumViableHealthDataspacev2/actions/workflows/test.yml) [![Coverage 94%](https://img.shields.io/badge/coverage-94%25-brightgreen)](docs/test-coverage-report.md) [![1490 Tests](https://img.shields.io/badge/tests-1490%20passed-brightgreen)](docs/test-coverage-report.md) [![Playwright 778](https://img.shields.io/badge/E2E-778%20tests-brightgreen)](docs/e2e-test-report.md) [![Azure](https://img.shields.io/badge/Azure-Deployed-0078D4?logo=microsoftazure&logoColor=white)](docs/azure-deployment-guide.md)

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
  - [Quick Start — Full Dataspace (JAD Stack)](#quick-start--full-dataspace-jad-stack)
    - [Prerequisites](#prerequisites)
    - [One-Command Start](#one-command-start)
    - [Verify Services](#verify-services)
    - [Start the UI](#start-the-ui)
    - [Run Seeding Separately](#run-seeding-separately)
    - [Tear Down](#tear-down)
  - [Testing](#testing)
  - [Development](#development)
    - [Run pre-commit checks](#run-pre-commit-checks)
    - [Neo4j driver note](#neo4j-driver-note)
    - [JAD Stack (EDC-V + CFM + DCore)](#jad-stack-edc-v--cfm--dcore)
    - [All Docker Service Endpoints](#all-docker-service-endpoints)
  - [Documentation](#documentation)
  - [Implementation Status](#implementation-status)
    - [Phase 1 — Infrastructure Migration](#phase-1--infrastructure-migration)
    - [Phase 2 — Identity \& Trust](#phase-2--identity--trust)
    - [Phase 3 — Health Knowledge Graph](#phase-3--health-knowledge-graph)
    - [Phase 4 — Dataspace Integration](#phase-4--dataspace-integration)
    - [Phase 5 — Federated Queries \& Natural Language Search](#phase-5--federated-queries--natural-language-search)
    - [Phase 6 — Web Application \& Participant Portal](#phase-6--web-application--participant-portal)
    - [Phase 7 — Protocol Compliance Testing](#phase-7--protocol-compliance-testing)
    - [Phase 8 — Automated Testing](#phase-8--automated-testing)
    - [Phase 9 — Documentation \& Navigation](#phase-9--documentation--navigation)
    - [Phase 10 — Tasks Dashboard](#phase-10--tasks-dashboard)
    - [Phase 11 — System Topology View](#phase-11--system-topology-view)
    - [Phase 12 — Data Query Fix \& Policy Seeding](#phase-12--data-query-fix--policy-seeding)
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

![MVD Health](docs/images/social-preview.svg)

For the full background, see the companion article: [European Health Dataspaces, Digital Twins: A Journey from FHIR Basics to Intelligent Patient Models](https://www.linkedin.com/pulse/european-health-dataspaces-digital-twins-journey-fhir-buchhorn-roth-8t51c/).

**Live Demo:** Static UI at [ma3u.github.io/MinimumViableHealthDataspacev2](https://ma3u.github.io/MinimumViableHealthDataspacev2/) | Full stack on [Azure EHDS Portal](https://mvhd-ui.blackforest-0a04f26e.westeurope.azurecontainerapps.io) ([deployment guide](docs/azure-deployment-guide.md))

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

## Demo Users & Roles

The JAD stack comes with **seven** pre-configured Keycloak demo users in the **EDCV realm**.
Sign in at `http://localhost:3003/auth/signin` — password equals username in local dev.

| Username     | Organisation           | EHDS Role         | Keycloak Role(s)                      | Graph persona |
| ------------ | ---------------------- | ----------------- | ------------------------------------- | ------------- |
| `edcadmin`   | Dataspace Operator     | Operator          | `EDC_ADMIN`                           | `edc-admin`   |
| `clinicuser` | AlphaKlinik Berlin     | Data Holder       | `EDC_USER_PARTICIPANT`, `DATA_HOLDER` | `hospital`    |
| `lmcuser`    | Limburg Medical Centre | Data Holder       | `EDC_USER_PARTICIPANT`, `DATA_HOLDER` | `hospital`    |
| `researcher` | PharmaCo Research AG   | Researcher        | `EDC_USER_PARTICIPANT`, `DATA_USER`   | `researcher`  |
| `regulator`  | MedReg DE              | HDAB Authority    | `HDAB_AUTHORITY`                      | `hdab`        |
| `patient1`   | AlphaKlinik Berlin     | Patient / Citizen | `PATIENT`                             | `patient`     |
| `patient2`   | Limburg Medical Centre | Patient / Citizen | `PATIENT`                             | `patient`     |

> **Returning users** (switching personas): the UserMenu **"Returning users"** section lets you
> switch between demo accounts. Each switch redirects to Keycloak — you must enter the target
> user's password. Trust Center operators use the `hdab` graph persona and
> `/compliance#trust-center`.

### Navigation Groups per Role

Each role sees a **single primary menu** tailored to their daily work. "Explore" is replaced
by persona-specific menus for researchers (My Researches) and patients (My Health).

| Role           | Primary Menu     | Graph Center         | EHDS Articles |
| -------------- | ---------------- | -------------------- | ------------- |
| Public         | Explore          | Health Dataspace     | —             |
| Patient        | My Health        | My Health            | Art. 3-12     |
| Data Holder    | Explore+Exchange | Our Data Offerings   | Art. 33-37    |
| Researcher     | My Researches    | My Researches        | Art. 46-49    |
| HDAB Authority | Governance       | Govern the Dataspace | Art. 45-53    |
| Trust Center   | Governance       | Privacy Operations   | Art. 50-51    |
| EDC Admin      | Manage           | Manage Dataspace     | Art. 33       |

**Researcher workflow (My Researches menu — EHDS Art. 46-49):**

| Step | Route            | Label             | EHDS Article | What happens                                         |
| ---- | ---------------- | ----------------- | ------------ | ---------------------------------------------------- |
| 1    | `/graph`         | Research Overview | —            | Knowledge graph with researcher focus                |
| 2    | `/catalog`       | Browse Catalogs   | Art. 47      | HealthDCAT-AP dataset catalog                        |
| 3    | `/data/discover` | Discover Datasets | Art. 47      | Federated search across participant catalogs         |
| 4    | `/negotiate`     | Request Access    | Art. 48      | Submit access application with purpose + legal basis |
| 5    | `/tasks`         | My Applications   | Art. 49      | Track HDAB approval status                           |
| 6    | `/data/transfer` | Retrieve Data     | Art. 50      | Transfer approved data to Secure Processing Env      |
| 7    | `/analytics`     | Run Analytics     | Art. 50/53   | OMOP cohort analytics in SPE                         |
| 8    | `/query`         | Query & Export    | Art. 50      | NLQ/federated queries, export aggregate results only |

**Menu items per role:**

| Route                           | Public | Patient | Data Holder | Researcher | HDAB | EDC Admin |
| ------------------------------- | :----: | :-----: | :---------: | :--------: | :--: | :-------: |
| `/graph`                        |   ✅   |    —    |     ✅      |     ✅     |  ✅  |    ✅     |
| `/catalog`                      |   ✅   |    —    |     ✅      |     ✅     |  ✅  |    ✅     |
| `/catalog/editor`               |   —    |    —    |     ✅      |     —      |  —   |    ✅     |
| `/patient`                      |   ✅   |   ✅    |     ✅      |     ✅     |  ✅  |    ✅     |
| `/patient/profile`              |   —    |   ✅    |      —      |     —      |  —   |     —     |
| `/patient/research`             |   —    |   ✅    |      —      |     —      |  —   |     —     |
| `/patient/insights`             |   —    |   ✅    |      —      |     —      |  —   |     —     |
| `/analytics`                    |   —    |    —    |      —      |     ✅     |  ✅  |    ✅     |
| `/query` (NLQ)                  |   —    |    —    |      —      |     ✅     |  ✅  |    ✅     |
| `/eehrxf`                       |   ✅   |    —    |     ✅      |     ✅     |  ✅  |    ✅     |
| `/compliance`                   |   —    |    —    |      —      |     —      |  ✅  |    ✅     |
| `/credentials`                  |   —    |    —    |     ✅      |     ✅     |  ✅  |    ✅     |
| `/data/share`                   |   —    |    —    |     ✅      |     —      |  —   |    ✅     |
| `/data/discover`                |   —    |    —    |      —      |     ✅     |  ✅  |    ✅     |
| `/negotiate`                    |   —    |    —    |     ✅      |     ✅     |  —   |    ✅     |
| `/tasks`                        |   —    |    —    |     ✅      |     ✅     |  ✅  |    ✅     |
| `/data/transfer`                |   —    |    —    |     ✅      |     ✅     |  ✅  |    ✅     |
| `/admin` + components + tenants |   —    |    —    |      —      |     —      |  —   |    ✅     |
| `/admin/policies` + audit       |   —    |    —    |      —      |     —      |  ✅  |    ✅     |
| `/onboarding`, `/settings`      |   —    |    —    |     ✅      |     ✅     |  ✅  |    ✅     |
| `/docs`                         |   ✅   |   ✅    |     ✅      |     ✅     |  ✅  |    ✅     |

### Graph Explorer — Persona Views

The graph center shows a **value-centric starting node** per persona, with nodes
arranged in concentric rings by relevance (not by technical layer).

| Persona                | URL param               | Center node          | Primary question                                       |
| ---------------------- | ----------------------- | -------------------- | ------------------------------------------------------ |
| Default                | `?persona=default`      | Health Dataspace     | What does the full dataspace look like?                |
| Hospital / Data Holder | `?persona=hospital`     | Our Data Offerings   | What data do we offer? Who is using it?                |
| Researcher / Data User | `?persona=researcher`   | My Researches        | Which datasets can I use? How do I get access?         |
| HDAB Authority         | `?persona=hdab`         | Govern the Dataspace | What approvals are pending? Which policies govern use? |
| Trust Center Operator  | `?persona=trust-center` | Privacy Operations   | Which pseudonym flows am I running?                    |
| EDC Admin              | `?persona=edc-admin`    | Manage Dataspace     | Who are my participants? What contracts are live?      |
| Patient / Citizen      | `?persona=patient`      | My Health            | What health data do I have? Who is using it?           |

**Persona-specific filter presets** (sidebar questions per role):

| Persona    | Filter questions                                                                                             |
| ---------- | ------------------------------------------------------------------------------------------------------------ |
| Patient    | Who is using my data? · Which research programme? · Show my data · Show health interests and risks           |
| Researcher | Which datasets can I use? · How do I get access? · What analytics? · Clinical data? · Where is it processed? |
| Hospital   | Which data do we offer? · Who is using our data? · What contracts? · Are we compliant? · Clinical data?      |
| HDAB       | What approvals are pending? · Which policies? · What contracts? · Credentials valid? · Trust Center?         |

**Node role colours** (warm/vivid accents — distinct from cool/muted layer colours):

| Node type         | Colour              | Role                                             |
| ----------------- | ------------------- | ------------------------------------------------ |
| `Participant`     | 🟠 Orange `#F97316` | Dataspace actors (data holders, researchers)     |
| `TrustCenter`     | 🔴 Red `#EF4444`    | EHDS Art. 50 pseudonym authority                 |
| `HDABApproval`    | 🩷 Pink `#EC4899`   | HDAB access decisions                            |
| `SPESession`      | 🟡 Amber `#F59E0B`  | Active secure processing sessions                |
| `PatientConsent`  | 🟣 Purple `#A855F7` | Patient consent for secondary use (EHDS Art. 10) |
| `ResearchInsight` | 🩵 Cyan `#06B6D4`   | Personalised insights from research studies      |

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
├── docker-compose.live.yml       # Live-mode UI override (port 3003)
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
│   ├── init-schema.cypher                 # Neo4j constraints and indexes
│   ├── insert-synthetic-schema-data.cypher # L1–L5 seed data (Synthea-derived)
│   ├── register-dsp-marketplace.cypher    # Phase 3e: DSP marketplace chain
│   ├── register-eehrxf-profiles.cypher    # Phase 3h: EEHRxF profile alignment
│   ├── register-ehds-credentials.cypher   # Phase 4: EHDS verifiable credentials
│   ├── register-fhir-dataset-hdcatap.cypher # Phase 3: HealthDCAT-AP catalogue
│   ├── fhir-to-omop-transform.cypher      # FHIR → OMOP CDM mapping
│   └── seed-audit-provenance.cypher       # Audit trail seed data
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

- **OrbStack** (or Docker Desktop ≥ 24) — runs the Neo4j 5 container with APOC and n10s plugins.
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
cat neo4j/insert-synthetic-schema-data.cypher | \
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

`npm install` automatically creates `ui/.env.local` from `.env.example` on first run
(with a random `NEXTAUTH_SECRET`). No manual copy step is needed. To customise Neo4j
or Keycloak connection settings, edit `ui/.env.local` directly.

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

## Quick Start — Full Dataspace (JAD Stack)

The full EHDS-compliant dataspace runs 19+ services locally using the
[JAD (Joint Architecture Demo)](https://github.com/Metaform/jad) container images.
This brings up EDC-V, DCore, CFM, IdentityHub, IssuerService, Keycloak, Vault, NATS,
and all supporting infrastructure.

### Prerequisites

- **OrbStack** (or Docker Desktop ≥ 24) with **≥ 8 GB RAM** allocated
- **Ports available:** 80, 4222, 5432, 7474, 7687, 8080, 8090, 8200, 8222, 9090,
  10013, 11002, 11003, 11005, 11006, 11007, 11012
- **Node.js ≥ 20** (for the UI)
- **Python 3** (for seed script parsing)

### One-Command Start

The bootstrap script handles image pulls, startup ordering, health checks, identity
provisioning, and full dataspace seeding:

```bash
git clone https://github.com/ma3u/MinimumViableHealthDataspacev2.git
cd MinimumViableHealthDataspacev2
./scripts/bootstrap-jad.sh
```

This takes approximately 5–10 minutes on first run (image pulls). Subsequent runs are
faster. When complete, all 20 services are healthy, the live UI is running on
<http://localhost:3003>, and the dataspace is seeded with:

- **5 participants** — AlphaKlinik Berlin, Limburg Medical Centre, PharmaCo Research AG,
  MedReg DE, Institut de Recherche Santé
- **10 Verifiable Credentials** (EHDSParticipantCredential, DataProcessingPurposeCredential)
- **9 data assets** (FHIR R4, OMOP CDM, HealthDCAT-AP)
- **Contract negotiations** — PharmaCo↔AlphaKlinik (FHIR data), MedReg↔LMC (catalog metadata)
- **Active data transfers** via DCore data planes

### Verify Services

```bash
./scripts/bootstrap-jad.sh --status
```

### Start the UI

**Option A — Development mode** (hot reload, ideal for code changes):

```bash
cd ui && npm install && npm run dev
```

Open <http://localhost:3000>. Log in with `edcadmin` / `edcadmin` (admin),
`clinicuser` / `clinicuser` (hospital), or `regulator` / `regulator` (HDAB).

**Option B — Live Docker container** (production build connected to JAD cluster):

The bootstrap script (`./scripts/bootstrap-jad.sh`) automatically builds and starts
the live UI on port 3003. To rebuild manually after code changes:

```bash
docker compose -f docker-compose.yml \
               -f docker-compose.jad.yml \
               -f docker-compose.live.yml \
               up -d --build graph-explorer
```

Open <http://localhost:3003>. This runs the production-built UI inside Docker,
connected to the live Neo4j, Keycloak, and EDC-V services in the cluster.

| Port | Mode   | Compose Files                                  | Description                 |
| ---- | ------ | ---------------------------------------------- | --------------------------- |
| 3000 | Static | `docker-compose.yml` only                      | Mock/static data, no JAD    |
| 3003 | Live   | `docker-compose.yml` + `jad` + `live` overlays | Full JAD cluster, live data |

> **Rebuild after UI code changes:** > `docker compose -f docker-compose.yml -f docker-compose.jad.yml -f docker-compose.live.yml up -d --build graph-explorer`

### Run Seeding Separately

If the stack is already running, you can re-seed without restarting:

```bash
# Re-run the full bootstrap seed pipeline (identity fixup + definitions + dataspace)
./scripts/bootstrap-jad.sh --seed

# Or run individual seed phases:

# 1. Seed IssuerService credential definitions (idempotent, runs from host)
./jad/seed-issuer-defs.sh

# 2. Full dataspace seed pipeline (tenants → credentials → policies → assets → …)
./jad/seed-all.sh

# Resume from a specific step (e.g. step 5 = negotiations)
./jad/seed-all.sh --from 5

# Run only one step
./jad/seed-all.sh --only 3
```

**Seed dependency order:** IssuerService definitions must exist _before_
running `seed-all.sh`, because the CFM onboarding agent needs credential
definitions to issue Verifiable Credentials during tenant onboarding.
The bootstrap script handles this automatically.

Seed-all steps: (1) health tenants, (2) EHDS credentials, (3) ODRL policies,
(4) data assets, (5) contract negotiations, (6) federated catalog, (7) data transfers.

### Bootstrap Phases

The bootstrap script (`./scripts/bootstrap-jad.sh`) orchestrates startup in the
correct dependency order with health checks at each phase:

| Phase | Services                                                                    | Health Check                           |
| ----- | --------------------------------------------------------------------------- | -------------------------------------- |
| 1     | PostgreSQL, Vault, Keycloak, NATS                                           | HTTP readiness / health endpoints      |
| 2     | vault-bootstrap (sidecar)                                                   | Log polling for success message        |
| 3     | Traefik reverse proxy                                                       | —                                      |
| 4     | Control Plane, Data Plane FHIR, Data Plane OMOP, IdentityHub, IssuerService | Management API readiness (accepts 401) |
| 4b    | Neo4j Query Proxy                                                           | `/health` endpoint                     |
| 5     | Tenant Manager, Provision Manager, 4× CFM agents                            | —                                      |
| 6     | Neo4j                                                                       | —                                      |
| 6b    | Graph Explorer Live UI (port 3003)                                          | Docker build + start                   |
| 7     | JAD seed (jad-seed container) — best-effort                                 | Exit code (non-fatal)                  |
| 8     | IssuerService identity fixup (SQL → restart → DID verification)             | DID document check                     |
| 8b    | IssuerService attestation + credential definitions (`seed-issuer-defs.sh`)  | HTTP 200/409 per definition            |
| 9     | Dataspace seeding (`seed-all.sh`: 7 phases)                                 | Exit code                              |

The script is **idempotent** — safe to re-run on an existing stack. It performs
`docker compose down --remove-orphans` at the start to clean up stale containers.

### Troubleshooting Seeding

If participants don't appear in the UI or EDC-V API after bootstrap:

1. **Check IssuerService credential definitions exist:**

   ```bash
   docker exec health-dataspace-postgres psql -U issuer -d issuerservice \
     -c "SELECT id, credential_type FROM credential_definitions;"
   ```

   If empty, run: `./jad/seed-issuer-defs.sh`

2. **Check participant contexts in EDC-V:**

   ```bash
   curl -s http://localhost:11003/api/mgmt/v5alpha/participants | python3 -m json.tool
   ```

   If empty, participants haven't been onboarded yet — re-run `./jad/seed-all.sh --only 1`.

3. **Re-run full seed pipeline:**

   ```bash
   ./scripts/bootstrap-jad.sh --seed
   ```

### Verify Deployment (E2E Tests)

After bootstrap completes, run the end-to-end test suite to verify all
infrastructure, dataspace state, and API routes:

```bash
./scripts/run-e2e-tests.sh
```

Expected result: **166 PASS**, 0 FAIL (Keycloak auth tests require SSO and are skipped in static mode).

### Tear Down

```bash
./scripts/bootstrap-jad.sh --down     # Stop all services
./scripts/bootstrap-jad.sh --reset    # Stop + remove volumes (full reset)
```

---

## Testing

The project has comprehensive test coverage across unit, API-route, and end-to-end tests.
See the full **[Test Coverage Report](docs/test-coverage-report.md)** for detailed metrics and inventory.

| Suite      | Framework    |     Tests |  Files | Status      |
| ---------- | ------------ | --------: | -----: | ----------- |
| Unit + API | Vitest + RTL |     1,490 |     78 | ✅ All pass |
| E2E        | Playwright   |       166 |     18 | ✅ All pass |
| **Total**  |              | **1,656** | **96** | ✅          |

**Code coverage** (v8): 93.78% statements · 81.65% branches · 89.57% functions · 94.73% lines

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

**Published Reports (GitHub Pages):**

| Report                | URL                                                                                                                |
| --------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Unit Test Coverage    | [test-reports/](https://ma3u.github.io/MinimumViableHealthDataspacev2/test-reports/)                               |
| Playwright E2E Report | [e2e-report/](https://ma3u.github.io/MinimumViableHealthDataspacev2/e2e-report/)                                   |
| EHDS Journey Report   | [e2e-report/ehds-journey.html](https://ma3u.github.io/MinimumViableHealthDataspacev2/e2e-report/ehds-journey.html) |
| CI E2E Report         | [ci-e2e-report/](https://ma3u.github.io/MinimumViableHealthDataspacev2/ci-e2e-report/)                             |
| EHDS User Journey     | [docs/FULL_USER_JOURNEY.md](docs/FULL_USER_JOURNEY.md)                                                             |

> **Note:** `test-reports/` and `ci-e2e-report/` are generated during CI only
> (by `pages.yml`). The committed `e2e-report/` in `ui/public/` is the source
> of truth for the live Playwright report — it includes results from both
> chromium and live (JAD stack) test projects.

**Generating the E2E Report Locally:**

The Playwright report (including the EHDS Journey Report) is generated
automatically when you run E2E tests. To produce a report that includes
live JAD stack tests:

```bash
# 1. Start the full JAD stack (includes live UI on :3003)
./scripts/bootstrap-jad.sh

# 2. Run both chromium (mock) and live (JAD) E2E test projects
cd ui
PLAYWRIGHT_BASE_URL=http://localhost:3003 npx playwright test --project=chromium --project=live

# 3. View the report locally
open playwright-report/index.html          # interactive Playwright report
open playwright-report/ehds-journey.html   # EHDS journey report
```

**Publishing to GitHub Pages:**

To update the committed E2E report that appears on GitHub Pages:

```bash
# Copy the local report to the committed public/ folder
rm -rf ui/public/e2e-report
cp -r ui/playwright-report ui/public/e2e-report

# Commit and push — pages.yml will deploy it
git add ui/public/e2e-report
git commit -m "Update E2E report from local JAD stack run"
git push
```

The report includes a screenshot for every test (captured automatically), traces on retries,
and video recordings when tests are retried — making visual regression and debugging easy.

**GitHub Pages Deployment:** The site is deployed by
[`.github/workflows/pages.yml`](.github/workflows/pages.yml) using the
"GitHub Actions" source (not "Deploy from a branch"). The repo Pages settings
must use **Source: GitHub Actions** — if switched to "Deploy from a branch",
a built-in Jekyll workflow will overwrite the Next.js static export with
the rendered README.md.

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
| **Graph Explorer UI**   | 3000                          | http://localhost:3000  | Next.js 14 app — mock/static mode (base compose only)     |
| **Graph Explorer Live** | 3003                          | http://localhost:3003  | Next.js 14 app — live mode with JAD cluster data          |
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

## Azure Deployment

The full stack is deployed to **Azure Container Apps** for shared team access and CI/CD validation.

| Resource       | Details                                                                                                                              |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Environment    | `mvhd-env` (West Europe, consumption plan)                                                                                           |
| Container Apps | 13 (UI, Neo4j, Keycloak, Vault, NATS, PostgreSQL, Neo4j Proxy, EDC-V, DCore, IdentityHub, IssuerService, CFM TManager, CFM PManager) |
| ACA Jobs       | 3 (bootstrap, schema, seed)                                                                                                          |
| CI/CD          | GitHub Actions with OIDC federation — no stored credentials                                                                          |
| E2E Validation | Playwright runs against Azure after every deploy                                                                                     |

**Guides:**

- [Azure Deployment Guide](docs/azure-deployment-guide.md) — full setup, endpoints, and troubleshooting
- [Deploy workflow](.github/workflows/deploy-azure.yml) — CI/CD pipeline
- [Deployment scripts](scripts/azure/) — 11 scripts for provisioning and lifecycle management

---

## Documentation

Detailed reference documents live in the `docs/` directory. The UI documentation is also
available online at **[ma3u.github.io/MinimumViableHealthDataspacev2/docs](https://ma3u.github.io/MinimumViableHealthDataspacev2/docs)**.

| Document                                                        | Description                                                                 |
| --------------------------------------------------------------- | --------------------------------------------------------------------------- |
| [Implementation Roadmap](docs/planning-health-dataspace-v2.md)  | Full planning document: 12 phases, 9+ ADRs, architecture decisions.         |
| [Architecture Decision Records](docs/ADRs/)                     | Standalone ADRs (001–013): data storage, testing, Azure, WCAG, security.    |
| [Azure Deployment Guide](docs/azure-deployment-guide.md)        | Azure Container Apps setup, endpoints, post-deploy configuration.           |
| [Graph Schema Reference](docs/health-dataspace-graph-schema.md) | Full 5-layer Neo4j schema: node labels, properties, indexes, relationships. |
| [E2E Test Report](docs/e2e-test-report.md)                      | Playwright E2E results: 778 tests across 29 spec files.                     |
| [Unit Test Coverage](docs/test-coverage-report.md)              | Vitest coverage: 1,490 tests, 94% statement coverage across 78 files.       |
| [SIMPL-Open Gap Analysis](docs/simpl-ehds-gap-analysis.md)      | Alignment assessment with EU SIMPL programme requirements.                  |
| [Quality Gates](docs/quality-gates.md)                          | CI quality standards: lint, type-check, test thresholds.                    |
| [Full User Journey](docs/FULL_USER_JOURNEY.md)                  | EHDS 8-step journey from onboarding to analytics with sequence diagram.     |
| [OpenAPI Specs](jad/openapi/)                                   | OpenAPI specs for all JAD services (Management, Identity, Issuer APIs).     |

---

## Implementation Status

All 12 phases are **✅ Complete** — from infrastructure migration through Azure cloud deployment.

| Phase | Description              | Key Deliverables                                                                |
| ----- | ------------------------ | ------------------------------------------------------------------------------- |
| 1     | Infrastructure Migration | 22-service Docker Compose (EDC-V + DCore + CFM), Vault, NATS, Traefik           |
| 2     | Identity & Trust         | DID:web for 5 participants, 15 Verifiable Credentials (DCP v1.0), Keycloak SSO  |
| 3     | Health Knowledge Graph   | 5-layer Neo4j schema, 127 Synthea patients, FHIR→OMOP pipeline, EEHRxF profiles |
| 4     | Dataspace Integration    | DSP 2025-1 contract negotiation, DCore FHIR/OMOP transfers, audit trail         |
| 5     | Federated Queries        | Multi-site federation, k-anonymity, Text2Cypher NLQ (9 templates + LLM)         |
| 6     | Web Application          | 22 Next.js pages, 36 API routes, 7 personas, role-based navigation              |
| 7     | Protocol Compliance      | DSP TCK (140+ tests), DCP suite, EHDS domain tests (Art. 53 enforcement)        |
| 8     | Automated Testing        | 1,490 unit tests (94% coverage), 778 E2E tests (Playwright)                     |
| 9     | Documentation            | 4 in-app doc pages, 5 interactive architecture diagrams, navigation restructure |
| 10    | Tasks Dashboard          | Aggregated contract/transfer pipeline view with step indicators                 |
| 11    | System Topology          | Per-participant service health view, component info catalog                     |
| 12    | Policy Seeding           | QuerySpec fix, 14 EHDS access policies across 5 organisations                   |

**Additional capabilities:**

- **WCAG 2.2 AA** — Zero accessibility violations, automated axe-core enforcement ([ADR-010](docs/ADRs/ADR-010-wcag-accessibility.md))
- **Security Testing** — 50 automated OWASP/BSI checks, Trivy CVE scanning, Gitleaks ([ADR-011](docs/ADRs/ADR-011-security-testing.md))
- **Azure Deployment** — 13 Container Apps + 3 Jobs with CI/CD and E2E validation ([ADR-012](docs/ADRs/ADR-012-azure-container-apps.md))
- **SIMPL-Open Alignment** — 5/7 EU programme requirements met ([ADR-013](docs/ADRs/ADR-013-simpl-open-alignment.md))

For detailed phase descriptions, sub-tasks, and architecture decisions, see the full **[Implementation Roadmap](docs/planning-health-dataspace-v2.md)** and **[Architecture Decision Records](docs/ADRs/)**.

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
> ³ Port 3003 is exposed when using the `docker-compose.live.yml` overlay for live JAD cluster data.

#### Tier 1 — Core Identity & UI (depend on Tier 0)

| #   | Service          | Container Name              | Compose File             | Port(s)      | Dependencies | Description                                                                                                                                                        |
| --- | ---------------- | --------------------------- | ------------------------ | ------------ | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 7   | `keycloak`       | `health-dataspace-keycloak` | `docker-compose.jad.yml` | 8080, 9000   | `postgres`   | Keycloak — OAuth2/OIDC identity provider. Hosts `edcv` realm with 3 demo users, PKCE client, and role mappings.                                                    |
| 8   | `graph-explorer` | `health-dataspace-ui`       | `docker-compose.yml`     | 3000, 3003 ³ | `neo4j`      | Next.js 14 UI — Graph Explorer, Catalogue, Analytics, Portal views. Connects to Neo4j (Bolt) and Keycloak (OIDC). Port 3003 via `docker-compose.live.yml` overlay. |

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

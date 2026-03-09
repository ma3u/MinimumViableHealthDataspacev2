# Minimum Viable Health Dataspace v2

[![Neo4j 5](https://img.shields.io/badge/Neo4j-5%20Community-008CC1?logo=neo4j&logoColor=white)](https://neo4j.com/)
[![FHIR R4](https://img.shields.io/badge/FHIR-R4-orange)](https://hl7.org/fhir/R4/)
[![OMOP CDM](https://img.shields.io/badge/OMOP-CDM%20v5.4-yellow)](https://ohdsi.github.io/CommonDataModel/)
[![Next.js 14](https://img.shields.io/badge/Next.js-14-black?logo=next.js&logoColor=white)](https://nextjs.org/)
[![Eclipse EDC](https://img.shields.io/badge/Eclipse-EDC--V-blue)](https://eclipse-edc.github.io/docs/)
[![EHDS Compliant](https://img.shields.io/badge/EHDS-Compliant-0ea5e9)](https://health.ec.europa.eu/ehealth-digital-health-and-care/european-health-data-space_en)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![pre-commit](https://img.shields.io/badge/pre--commit-enabled-brightgreen?logo=pre-commit)](https://pre-commit.com/)

> **An open-source, EHDS-compliant health data space demo** combining Eclipse EDC-V, DCore, CFM,
> HealthDCAT-AP, FHIR R4, OMOP CDM v5.4, and Neo4j 5 into a unified 5-layer knowledge graph.
> Synthetic patient journeys are navigable through a Next.js UI with compliance chain inspection,
> OMOP research analytics, and an interactive graph explorer.

![Architecture Diagram](docs/images/architecture.svg)

---

## Key Features

- **DSP Marketplace** — Eclipse EDC-V DataProduct / OdrlPolicy / Contract / HDABApproval chain
- **HealthDCAT-AP Catalogue** — Dataset / Distribution / DataService / Organization nodes
- **FHIR R4 Clinical Data** — Patient, Observation, Condition, Encounter, MedicationRequest,
  Procedure
- **OMOP CDM Research Layer** — PersonNode, ConditionOccurrence, DrugExposure,
  ProcedureOccurrence, Measurement
- **Biomedical Ontology Layer** — SNOMED CT, ICD-10-CM, RxNorm, LOINC, CPT-4
- **Interactive UI** — Graph explorer, compliance chain viewer, patient timeline, OMOP analytics

---

## Architecture

The project stores all five layers as a single **Neo4j knowledge graph**:

| Layer           | Nodes                                                                           | Technology                     |
| --------------- | ------------------------------------------------------------------------------- | ------------------------------ |
| 1 · Marketplace | DataProduct, OdrlPolicy, Contract, AccessApplication, HDABApproval              | Eclipse EDC-V, DSP, CFM, DCore |
| 2 · Catalogue   | Catalogue, Dataset, Distribution, DataService, Organization                     | HealthDCAT-AP / DCAT-AP 3      |
| 3 · Clinical    | Patient, Observation, Condition, Encounter, MedicationRequest, Procedure        | FHIR R4 / Synthea              |
| 4 · Research    | PersonNode, ConditionOccurrence, DrugExposure, ProcedureOccurrence, Measurement | OMOP CDM v5.4                  |
| 5 · Ontology    | OntologyConcept (SNOMED CT, ICD-10-CM, RxNorm, LOINC, CPT-4)                    | Biomedical Terminologies       |

Cross-layer relationships (`GOVERNS`, `DESCRIBES`, `MAPS_TO`, `CODED_BY`) are first-class edges
in the graph.

---

## UI Views

| View             | Route         | Description                                                       |
| ---------------- | ------------- | ----------------------------------------------------------------- |
| Graph Explorer   | `/graph`      | Interactive 5-layer knowledge graph (node selection, edge labels) |
| Data Catalogue   | `/catalog`    | HealthDCAT-AP datasets with expandable detail panels              |
| Compliance Chain | `/compliance` | DSP contract and ODRL policy inspection                           |
| Patient Journey  | `/patient`    | FHIR R4 → OMOP CDM patient timeline                               |
| OMOP Analytics   | `/analytics`  | Cohort-level OMOP CDM research analytics dashboard                |

---

## Project Structure

```text
MinimumViableHealthDataspacev2/
├── README.md
├── docker-compose.yml            # Neo4j 5 with APOC + n10s plugins
├── LICENSE
├── docs/
│   ├── planning-health-dataspace-v2.md   # 5-phase implementation roadmap
│   ├── health-dataspace-graph-schema.md  # 5-layer Neo4j schema reference
│   └── images/
│       ├── social-preview.svg            # GitHub social preview / OG image
│       ├── architecture.svg              # 5-layer architecture diagram
│       ├── graph-schema.png              # Knowledge graph schema screenshot
│       ├── synthetic-patient-journey.png # Full patient journey screenshot
│       └── ui-screenshot.png             # Graph Explorer UI screenshot
├── neo4j/
│   ├── init-schema.cypher        # Neo4j constraints and indexes
│   ├── seed-data.cypher          # L1–L5 seed data (Synthea-derived)
│   └── register-dsp-marketplace.cypher   # Phase 3e: DSP marketplace chain
├── scripts/                      # Utility and data-prep scripts
└── ui/                           # Next.js 14 application
    └── src/app/
        ├── graph/                # Graph Explorer
        ├── catalog/              # HealthDCAT-AP Catalogue
        ├── compliance/           # Compliance Chain Inspector
        ├── patient/              # Patient Journey
        └── analytics/            # OMOP Analytics Dashboard
```

---

## Quick Start

### Step 1 — Prerequisites

- Docker Desktop ≥ 24
- Node.js ≥ 20 with npm
- Git

### Step 2 — Clone

```bash
git clone https://github.com/ma3u/MinimumViableHealthDataspacev2.git
cd MinimumViableHealthDataspacev2
```

### Step 3 — Start Neo4j

```bash
docker compose up -d
```

Neo4j Browser: <http://localhost:7474> (credentials: `neo4j` / `healthdataspace`)

### Step 4 — Initialise Schema

```bash
cat neo4j/init-schema.cypher | \
  docker exec -i health-dataspace-neo4j \
  cypher-shell -u neo4j -p healthdataspace
```

### Step 5 — Load Seed Data

```bash
cat neo4j/seed-data.cypher | \
  docker exec -i health-dataspace-neo4j \
  cypher-shell -u neo4j -p healthdataspace
```

### Step 6 — Register DSP Marketplace Chain

```bash
cat neo4j/register-dsp-marketplace.cypher | \
  docker exec -i health-dataspace-neo4j \
  cypher-shell -u neo4j -p healthdataspace
```

### Step 7 — Install UI Dependencies

```bash
cd ui && npm install
```

### Step 8 — Start the UI

```bash
npm run dev
```

Open <http://localhost:3000>

---

## Screenshots

### Graph Explorer

![Graph Explorer UI](docs/images/ui-screenshot.png)

### Full Synthetic Patient Journey

![Full Synthetic Patient Journey](docs/images/synthetic-patient-journey.png)

### Knowledge Graph Schema

![Knowledge Graph Schema](docs/images/graph-schema.png)

---

## Development

### Run pre-commit checks

```bash
pre-commit run --all-files
```

> **Tip:** If a commit fails due to auto-formatting, run `git add <file> && git commit` again.
> Prettier and trailing-whitespace hooks fix files in place.

### Neo4j driver note

The UI driver uses `{ disableLosslessIntegers: true }` so Neo4j integer objects are returned as
native JavaScript numbers — no `[object Object]` in stat cards.

---

## Documentation

| Document                                                                       | Description                     |
| ------------------------------------------------------------------------------ | ------------------------------- |
| [docs/planning-health-dataspace-v2.md](docs/planning-health-dataspace-v2.md)   | 5-phase implementation roadmap  |
| [docs/health-dataspace-graph-schema.md](docs/health-dataspace-graph-schema.md) | Full 5-layer Neo4j graph schema |

---

## Implementation Status

| Phase | Description                                   | Status      |
| ----- | --------------------------------------------- | ----------- |
| 1     | Environment Setup (Neo4j, Docker, Next.js)    | ✅ Complete |
| 2     | Graph Schema + Seed Data (all 5 layers)       | ✅ Complete |
| 3     | Graph Explorer UI                             | ✅ Complete |
| 3a    | HealthDCAT-AP Catalogue View                  | ✅ Complete |
| 3b    | Compliance Chain Inspector                    | ✅ Complete |
| 3c    | Patient Journey View                          | ✅ Complete |
| 3d    | Graph node selection + edge labels            | ✅ Complete |
| 3e    | DSP Marketplace Registration (EDC chain)      | ✅ Complete |
| 3f    | OMOP Research Analytics Dashboard             | ✅ Complete |
| 4     | Eclipse EDC-V connector integration           | 🔲 Planned  |
| 5     | Real Synthea data pipeline + IDS-G compliance | 🔲 Planned  |

---

## Contributing

Contributions are welcome! Please open an issue or pull request.
See [.github/CONTRIBUTING.md](.github/CONTRIBUTING.md) for guidelines.

---

## Background

- **LinkedIn Article:**
  [European Health Dataspaces, Digital Twins: A Journey from FHIR Basics to Intelligent Patient
  Models](https://www.linkedin.com/pulse/european-health-dataspaces-digital-twins-journey-fhir-buchhorn-roth-8t51c/)

---

## Security

- No patient data or real credentials are stored in this repository.
- Default Neo4j credentials (`neo4j` / `healthdataspace`) are for **local development only**.
- Production deployments must use `.env` files (excluded via `.gitignore`).

---

## License

[MIT](LICENSE) © 2024 ma3u

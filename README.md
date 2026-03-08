# Minimum Viable Health Dataspace v2

A EHDS-compliant health dataspace demo using Eclipse Dataspace Components (EDC-V, DCore, CFM), Neo4j knowledge graphs, FHIR R4, and OMOP CDM.

## Background & Resources

- **LinkedIn Article:** [European Health Dataspaces, Digital Twins: A Journey from FHIR Basics to Intelligent Patient Models](https://www.linkedin.com/pulse/european-health-dataspaces-digital-twins-journey-fhir-buchhorn-roth-8t51c/)

## Structure

```
├── planning-health-dataspace-v2.md      # Implementation roadmap (5 phases)
├── health-dataspace-graph-schema.md     # 5-layer Neo4j graph schema
├── docker-compose.yml                   # Neo4j + Graph Explorer UI stack
├── neo4j/
│   ├── init-schema.cypher                  # Constraint & index initialization
│   ├── insert-synthetic-schema-data.cypher # Sample data for all 5 layers
│   ├── fhir-to-omop-transform.cypher       # Phase 3b: FHIR → OMOP transformation
│   ├── health-dataspace-style.grass        # Neo4j Browser color style sheet
│   └── import/fhir/                        # Synthea FHIR bundle staging (gitignored)
├── scripts/
│   ├── generate-synthea.sh                 # Phase 3b: Download Synthea & generate cohort
│   ├── load_fhir_neo4j.py                  # Phase 3b: Load FHIR bundles into Neo4j
│   └── requirements.txt                    # Python deps (neo4j driver)
├── ui/                                     # Phase 6a Next.js Graph Explorer
│   ├── src/app/                            # Next.js App Router pages + API routes
│   ├── src/lib/neo4j.ts                    # Neo4j driver singleton
│   ├── src/components/Navigation.tsx       # Top navigation bar
│   ├── Dockerfile                          # Multi-stage production image
│   └── package.json
├── .pre-commit-config.yaml                 # Formatting hooks (Prettier, etc.)
└── .github/copilot-instructions.md         # AI agent workspace guidance
```

## Technical Requirements

| Tool               | Version | Purpose                                     |
| ------------------ | ------- | ------------------------------------------- |
| **Java (OpenJDK)** | ≥ 21    | EDC-V / Gradle builds                       |
| **Gradle**         | ≥ 8.x   | Build system for EDC components             |
| **Rust**           | ≥ 1.75  | DCore data plane                            |
| **Docker**         | ≥ 24    | Container runtime (Neo4j, EDC services)     |
| **Docker Compose** | ≥ 2.20  | Multi-service orchestration                 |
| **Node.js**        | ≥ 18    | Tooling, Prettier, future UI                |
| **Python**         | ≥ 3.10  | pre-commit, Synthea data generation scripts |
| **pre-commit**     | latest  | Git hook framework                          |

## Tooling & Container Strategy Recommendations

This project targets a multi-participant architecture (EDC-V + CFM + DCore). Because of the complexity of running multiple connectors and databases simultaneously:

- **macOS Users:** We strongly recommend [OrbStack](https://orbstack.dev/) over Docker Desktop. It is significantly faster, uses less memory, and integrates seamlessly with both Docker Compose and local Kubernetes instances.
- **Local Kubernetes:** For Phase 4 (Dataspace Integration), running a local cluster becomes necessary. We recommend [KinD (Kubernetes in Docker)](https://kind.sigs.k8s.io/) as it is lightweight and CI/CD friendly. If you use OrbStack, its built-in zero-config Kubernetes is also an excellent choice.
- **Cluster Management:** Use [OpenLens](https://github.com/lensapp/lens) for visual debugging of the local cluster deployments (pods, services, logs).

## Getting Started

### 1. Install prerequisites

**macOS:**

```bash
# Core dependencies
brew install openjdk gradle pre-commit

# Container & Kubernetes tools
brew install orbstack kind
brew install --cask openlens

# Rust (via rustup)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

**Linux (WSL2 / Ubuntu):**

```bash
# Core dependencies
sudo apt update && sudo apt install -y openjdk-21-jdk gradle python3-pre-commit

# Container tools (Docker Engine)
sudo apt-get install ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update && sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# KinD
[ $(uname -m) = x86_64 ] && curl -Lo ./kind https://kind.sigs.k8s.io/dl/v0.22.0/kind-linux-amd64
chmod +x ./kind && sudo mv ./kind /usr/local/bin/kind

# Rust (via rustup)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

### 2. Clone and set up hooks

```bash
git clone https://github.com/ma3u/MinimumViableHealthDataspacev2.git
cd MinimumViableHealthDataspacev2
pre-commit install
```

### 3. Start Neo4j

```bash
docker compose up -d
# Neo4j Browser: http://localhost:7474 (neo4j / healthdataspace)
```

### 4. Initialize the graph schema

Open [Neo4j Browser](http://localhost:7474) and run the contents of `neo4j/init-schema.cypher`, or:

```bash
cat neo4j/init-schema.cypher | docker exec -i health-dataspace-neo4j cypher-shell -u neo4j -p healthdataspace
```

### Step 5: Insert Synthetic Data (Optional but Recommended)

To visualize the 5-layer architecture properly, Neo4j needs sample data. We provide a script that generates a complex, interconnected dataspace scenario covering Marketplace Metadata down to Clinical Ontology.

```bash
cat neo4j/insert-synthetic-schema-data.cypher | docker exec -i health-dataspace-neo4j cypher-shell -u neo4j -p healthdataspace
```

### 6. Apply the Color Style

To colorize nodes by architectural layer, import the included GraSS style sheet into Neo4j Browser:

1. Open [Neo4j Browser](http://localhost:7474)
2. Click the **database icon** in the left sidebar → scroll down to **"Style"**
3. Click **"Load from file"** (or drag-and-drop) and select `neo4j/health-dataspace-style.grass`

Alternatively, paste the contents of the file directly into the style editor.

**Layer color legend:**

| Color     | Layer                                 | Node Types                                                                                            |
| --------- | ------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| 🔵 Blue   | **Layer 1** — Dataspace Marketplace   | `Participant`, `DataProduct`, `Contract`, `AccessApplication`, `HDABApproval`                         |
| 🩵 Teal   | **Layer 2** — HealthDCAT-AP Metadata  | `HealthDataset`, `Distribution`                                                                       |
| 🟢 Green  | **Layer 3** — FHIR Clinical Graph     | `Patient`, `Encounter`, `Condition`, `Observation`, `MedicationRequest`                               |
| 🟠 Orange | **Layer 4** — OMOP Research Analytics | `OMOPPerson`, `OMOPVisitOccurrence`, `OMOPConditionOccurrence`, `OMOPMeasurement`, `OMOPDrugExposure` |
| 🟣 Purple | **Layer 5** — Clinical Ontology       | `SnomedConcept`, `LoincCode`, `ICD10Code`, `RxNormConcept`                                            |

### 7. Visualize the Data Model

Run this in the Neo4j Browser query bar to see the schema meta-graph:

```cypher
CALL db.schema.visualization()
```

![Knowledge Graph Data Schema](image-2.png)
Or explore the full synthetic patient journey across all 5 layers:

```cypher
MATCH (hd:HealthDataset {datasetId: 'urn:uuid:charite:dataset:diab-001'})
MATCH (dp:DataProduct)-[:DESCRIBED_BY]->(hd)
MATCH (contract:Contract)-[:GOVERNS]->(dp)
MATCH (hd)-[:HAS_DISTRIBUTION]->(dist:Distribution)
MATCH (p:Patient)-[:FROM_DATASET]->(hd)
MATCH (p)-[:MAPPED_TO]->(op:OMOPPerson)
MATCH (p)-[:HAS_CONDITION]->(c)-[:CODED_BY]->(sc)
RETURN *
```

![Full Synthetic Patient Journey](image-1.png)

### 9. Phase 3b — Real FHIR Data Pipeline (Synthea → Neo4j → OMOP)

Replace the hand-crafted synthetic data with a real Synthea-generated Type 2 Diabetes cohort.
The Graph Explorer UI will automatically show the new patients.

**Requirements:** Java ≥ 21 on `$PATH`.

```bash
# Step 1 — generate 50 patients (FHIR R4 bundles → neo4j/import/fhir/)
./scripts/generate-synthea.sh 50

# Step 2 — load bundles into Neo4j (install deps first)
pip install -r scripts/requirements.txt
python3 scripts/load_fhir_neo4j.py

# Step 3 — transform FHIR Layer 3 nodes → OMOP Layer 4 nodes
cat neo4j/fhir-to-omop-transform.cypher | \
  docker exec -i health-dataspace-neo4j cypher-shell -u neo4j -p healthdataspace
```

After loading, explore the real patient data in the Graph Explorer (`/graph`) or Patient Journey (`/patient`) views.

> **Note:** FHIR bundles in `neo4j/import/fhir/` are `.gitignore`d — no patient data is stored in the repository.

### 8. Launch the Graph Explorer UI (Phase 6a)

A Next.js 14 web app connects directly to Neo4j Bolt and provides four interactive views.

**Run locally (development mode):**

```bash
cd ui
cp .env.local.example .env.local   # credentials already match local Neo4j
npm install
npm run dev
# Open http://localhost:3000
```

**Run via Docker Compose (alongside Neo4j):**

```bash
docker compose up -d
# Graph Explorer UI: http://localhost:3000
```

| View            | Path          | Description                                |
| --------------- | ------------- | ------------------------------------------ |
| Home            | `/`           | Dashboard with links to all views          |
| Graph Explorer  | `/graph`      | Force-directed graph of all 5 layers       |
| Dataset Catalog | `/catalog`    | HealthDCAT-AP metadata table               |
| EHDS Compliance | `/compliance` | HDAB approval chain validator (Art. 45–52) |
| Patient Journey | `/patient`    | FHIR R4 → OMOP CDM timeline                |

## Development and Contributing

We use `pre-commit` hooks alongside Prettier to ensure consistent formatting across Markdown, YAML, and future code files. All hooks run automatically on `git commit`.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

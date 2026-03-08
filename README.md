# Minimum Viable Health Dataspace v2

A EHDS-compliant health dataspace demo using Eclipse Dataspace Components (EDC-V, DCore, CFM), Neo4j knowledge graphs, FHIR R4, and OMOP CDM.

## Background & Resources

- **LinkedIn Article:** [European Health Dataspaces, Digital Twins: A Journey from FHIR Basics to Intelligent Patient Models](https://www.linkedin.com/pulse/european-health-dataspaces-digital-twins-journey-fhir-buchhorn-roth-8t51c/)

## Structure

```
├── planning-health-dataspace-v2.md   # Implementation roadmap (5 phases)
├── health-dataspace-graph-schema.md  # 5-layer Neo4j graph schema
├── docker-compose.yml                # Neo4j + APOC + n10s local dev stack
├── neo4j/
│   ├── init-schema.cypher            # Constraint & index initialization
│   └── import/                       # FHIR bundle / CSV import staging
├── .pre-commit-config.yaml           # Formatting hooks (Prettier, etc.)
└── .github/copilot-instructions.md   # AI agent workspace guidance
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

### 5. Visualize the Data Model

To view the structure of the data model you just initialized, run this built-in meta-graph command in the Neo4j Browser UI query bar:

```cypher
CALL db.schema.visualization()
```

## Development and Contributing

We use `pre-commit` hooks alongside Prettier to ensure consistent formatting across Markdown, YAML, and future code files. All hooks run automatically on `git commit`.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

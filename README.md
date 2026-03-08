# Minimum Viable Health Dataspace v2

A production-ready, EHDS-compliant health dataspace demo using Eclipse Dataspace Components (EDC-V, DCore, CFM), Neo4j knowledge graphs, FHIR R4, and OMOP CDM.

## Background & Resources

- **Article:** [European Health Dataspaces, Digital Twins: A Journey from FHIR Basics to Intelligent Patient Models](https://www.linkedin.com/pulse/european-health-dataspaces-digital-twins-journey-fhir-buchhorn-roth-8t51c/)

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

## Getting Started

### 1. Install prerequisites (macOS)

```bash
brew install openjdk gradle pre-commit
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

Open Neo4j Browser and run the contents of `neo4j/init-schema.cypher`, or:

```bash
cat neo4j/init-schema.cypher | docker exec -i health-dataspace-neo4j cypher-shell -u neo4j -p healthdataspace
```

## Development and Contributing

We use `pre-commit` hooks alongside Prettier to ensure consistent formatting across Markdown, YAML, and future code files. All hooks run automatically on `git commit`.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

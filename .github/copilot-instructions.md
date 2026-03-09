# Project Guidelines

Health Dataspace v2: an EHDS-compliant demo using EDC-V, DCore, CFM, Neo4j, FHIR R4, and OMOP CDM.

## Code Style

- Markdown (`.md`): headings, fenced code blocks, ~80 char line wrap, clean tables.
- Cypher (`.cypher`): UPPER_SNAKE_CASE relationship types, PascalCase node labels, camelCase properties.
- Prettier auto-formats `.md`, `.yaml`, `.json` via pre-commit hooks.
- Future Java/Rust/Python code should follow standard language formatters.

## Architecture

- `docs/planning-health-dataspace-v2.md` — 5-phase implementation roadmap (EDC-V + DCore + CFM + Neo4j).
- `docs/health-dataspace-graph-schema.md` — 5-layer Neo4j graph schema (Marketplace → HealthDCAT-AP → FHIR → OMOP → Ontology).
- `docker-compose.yml` — Local Neo4j 5 with APOC + n10s plugins.
- `neo4j/init-schema.cypher` — All Neo4j constraints and indexes for the 5-layer model.

## Build and Test

```bash
# Start Neo4j locally
docker compose up -d

# Initialize schema
cat neo4j/init-schema.cypher | docker exec -i health-dataspace-neo4j cypher-shell -u neo4j -p healthdataspace

# Run pre-commit checks
pre-commit run --all-files
```

## Project Conventions

- Maintain existing tone and formatting when editing Markdown.
- Use relative links between documents.
- Schema changes in `.md` must be reflected in `neo4j/init-schema.cypher`.
- Keep `docker-compose.yml` in sync with technical requirements in `README.md`.

## Integration Points

- **Neo4j 5** (Community Edition) — graph database via Docker, Bolt on port 7687, Browser on port 7474.
- **Synthea** — synthetic FHIR patient data generation (Phase 3).
- **Eclipse EDC-V / DCore / CFM** — dataspace connector stack (Phase 1-2).

## Security

- No patient data or credentials in the repository.
- Default Neo4j credentials (`neo4j/healthdataspace`) are for local dev only.
- Production credentials must use `.env` files (excluded via `.gitignore`).

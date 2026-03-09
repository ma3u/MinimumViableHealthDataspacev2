# Neo4j Query Proxy

Bridges DCore data planes to the Neo4j 5-layer health knowledge graph (ADR-2).

## Endpoints

| Endpoint                         | Method | Description                                     | Content-Type            |
| -------------------------------- | ------ | ----------------------------------------------- | ----------------------- |
| `/health`                        | GET    | Health check (Neo4j connectivity)               | `application/json`      |
| `/fhir/Patient/{id}/$everything` | GET    | Patient-level FHIR Bundle (all resources)       | `application/fhir+json` |
| `/fhir/Bundle`                   | POST   | Cohort FHIR Bundle (patients matching criteria) | `application/fhir+json` |
| `/omop/cohort`                   | POST   | OMOP CDM aggregate query (count by concept)     | `application/json`      |
| `/omop/person/{id}/timeline`     | GET    | Single person clinical timeline                 | `application/json`      |
| `/catalog/datasets`              | GET    | HealthDCAT-AP dataset listing (JSON-LD)         | `application/ld+json`   |
| `/catalog/datasets/{id}`         | GET    | Single dataset metadata (JSON-LD)               | `application/ld+json`   |

## Environment Variables

| Variable         | Default                 | Description      |
| ---------------- | ----------------------- | ---------------- |
| `PORT`           | `9090`                  | HTTP listen port |
| `NEO4J_URI`      | `bolt://localhost:7687` | Neo4j Bolt URI   |
| `NEO4J_USER`     | `neo4j`                 | Neo4j username   |
| `NEO4J_PASSWORD` | `healthdataspace`       | Neo4j password   |

## Development

```bash
npm install
npm run dev     # Watch mode with tsx
npm run build   # TypeScript → dist/
npm start       # Production
```

## Docker

```bash
docker build -t health-dataspace/neo4j-proxy .
docker run -p 9090:9090 \
  -e NEO4J_URI=bolt://host.docker.internal:7687 \
  health-dataspace/neo4j-proxy
```

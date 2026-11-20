# Neo4j Query Proxy

Bridges DCore data planes to the Neo4j 5-layer health knowledge graph (ADR-2).

## Endpoints

| Endpoint                         | Method | Description                                     | Content-Type            |
| -------------------------------- | ------ | ----------------------------------------------- | ----------------------- |
| `/health`                        | GET    | Health check (Neo4j connectivity)               | `application/json`      |
| `/fhir/metadata`                 | GET    | CapabilityStatement of the FHIR facade          | `application/fhir+json` |
| `/fhir/Patient`                  | GET    | Patient search (gender, name), paged            | `application/fhir+json` |
| `/fhir/Patient/{id}`             | GET    | Read by id, over a dataspace pull only          | `application/fhir+json` |
| `/fhir/Patient/{id}/$everything` | GET    | Patient-level FHIR Bundle (all resources)       | `application/fhir+json` |
| `/fhir/Observation`              | GET    | Observation search (patient, code, date), paged | `application/fhir+json` |
| `/fhir/Observation/{id}`         | GET    | Read by id, over a dataspace pull only          | `application/fhir+json` |
| `/fhir/$validate`                | POST   | Forwarded to Matchbox; 503 without one          | `application/fhir+json` |
| `/fhir/{type}/$validate`         | POST   | Forwarded to Matchbox; 503 without one          | `application/fhir+json` |
| `/fhir/Bundle`                   | POST   | Cohort FHIR Bundle (patients matching criteria) | `application/fhir+json` |
| `/omop/cohort`                   | POST   | OMOP CDM aggregate query (count by concept)     | `application/json`      |
| `/omop/person/{id}/timeline`     | GET    | Single person clinical timeline                 | `application/json`      |
| `/catalog/datasets`              | GET    | HealthDCAT-AP dataset listing (JSON-LD)         | `application/ld+json`   |
| `/catalog/datasets/{id}`         | GET    | Single dataset metadata (JSON-LD)               | `application/ld+json`   |

## Environment Variables

| Variable         | Default                 | Description                        |
| ---------------- | ----------------------- | ---------------------------------- |
| `PORT`           | `9090`                  | HTTP listen port                   |
| `NEO4J_URI`      | `bolt://localhost:7687` | Neo4j Bolt URI                     |
| `NEO4J_USER`     | `neo4j`                 | Neo4j username                     |
| `NEO4J_PASSWORD` | `healthdataspace`       | Neo4j password                     |
| `MATCHBOX_URL`   | unset                   | Matchbox FHIR base for `$validate` |

## The FHIR facade (#1174)

A narrow FHIR R4 facade over the graph, decided in discussion #1169: no FHIR
server of our own, the graph stays the source. What it serves is one table,
`src/fhir-capability.ts`; the routes in `src/routes/fhir.ts` are registered
from it and `GET /fhir/metadata` answers it as a `CapabilityStatement`.
`__tests__/fhir-capability.test.ts` fails when the statement and the routes
Express holds, or a listed search parameter and what its route applies,
disagree.

- **Search** (`src/fhir-search.ts`): `Observation?patient=&code=&date=` and
  `Patient?gender=&name=` with R4 token, date-prefix and reference semantics;
  `_count` and `_offset` page, the Bundle carries `self`, `next` and
  `previous` links. A parameter the route does not declare (or a modifier on
  one) is not applied: it is left out of the `self` link and named in an
  `OperationOutcome` entry with `search.mode: outcome`; with
  `Prefer: handling=strict` the search is 400 instead (R4 3.1.1.5).
- **Read by id** (`Patient`, `Observation`) answers a dataspace pull only, as
  `/programmes/answers` does: `GET /dataspace/data/{id}` with the siglet token
  of a transfer of a dataset whose route is `/fhir/{type}`. Called directly
  it is 401. The other FHIR routes rely on the container network, as before.
- **Opt-out**: every query runs in `secondaryUseSession` and every node is
  checked with `releasable()` (EHDS Art. 71, ADR-062). Data reads write the
  audit record (`logTransferEvent`); `/metadata` and `$validate` read no
  patient data and write none.
- **Errors** under `/fhir` are `OperationOutcome`s.
- **`$validate`** is forwarded to Matchbox (`MATCHBOX_URL`), started locally
  with `docker-compose.matchbox.yml`; its IG packages come from
  `scripts/eehrxf/profiles.json` through `scripts/eehrxf/build.py`. Not on
  Azure. Without it, `$validate` is 503 and `/metadata` does not list it.
- **`meta.profile`** is not set on any served resource: they are rebuilt from
  graph nodes (the `code` of an Observation is a string, not a
  CodeableConcept) and do not validate against base R4 yet (#1144).

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

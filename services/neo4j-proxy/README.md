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

| Variable              | Default                 | Description                                                                         |
| --------------------- | ----------------------- | ----------------------------------------------------------------------------------- |
| `PORT`                | `9090`                  | HTTP listen port                                                                    |
| `NEO4J_URI`           | `bolt://localhost:7687` | Neo4j Bolt URI                                                                      |
| `NEO4J_USER`          | `neo4j`                 | Neo4j username                                                                      |
| `NEO4J_PASSWORD`      | `healthdataspace`       | Neo4j password                                                                      |
| `MATCHBOX_URL`        | unset                   | Matchbox FHIR base for `$validate`; on Azure `http://mvhd-matchbox/matchboxv3/fhir` |
| `MATCHBOX_TIMEOUT_MS` | `120000`                | How long one validation may take                                                    |

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
- **`$validate`** is forwarded to Matchbox (`MATCHBOX_URL`), the image in
  `services/matchbox` with its IG packages baked in (ADR-095). Its config
  comes from `scripts/eehrxf/profiles.json` through `scripts/eehrxf/build.py`.
  Without `MATCHBOX_URL`, `$validate` is 503 and `/metadata` does not list it.

  | Where | Matchbox                                     | `MATCHBOX_URL`                                          |
  | ----- | -------------------------------------------- | ------------------------------------------------------- |
  | Local | `docker-compose.matchbox.yml`                | `http://health-dataspace-matchbox:8080/matchboxv3/fhir` |
  | Azure | Container App `mvhd-matchbox`, internal only | `http://mvhd-matchbox/matchboxv3/fhir`                  |

  On Azure `scripts/azure/22-matchbox.sh` (the workflow `matchbox.yml`)
  creates the app and sets the proxy's `MATCHBOX_URL`; it stops off hours
  with the proxy (ADR-053), so `$validate` is 503 then, like everything else.
  `MATCHBOX_TIMEOUT_MS` (default 120000) bounds one validation.

  Every call carries the CI validator's allowed extension domains
  (`allowedExtensionDomains` in `profiles.json`) as Matchbox `extensions`
  parameters, from `src/fhir-extension-domains.ts`, which `build.py`
  generates. Matchbox v4.1.21 does not apply the `extensions` of its
  `application.yaml` to a `$validate`, so without them our own
  `https://ehds.mabu.red/fhir/` extensions were errors. An extension from
  any other domain still is one.

- **Resources** (`src/fhir-resource.ts`, #1144): one mapper per type turns a
  graph node into R4 elements and nothing else. Codes are CodeableConcepts
  with their system (LOINC, SNOMED CT, RxNorm, CVX, ATC; the graph's display
  as `text`), values are UCUM Quantities, statuses come from the R4 value
  sets, every record refers to its patient (`subject`, `patient` for an
  Immunization) and every Bundle entry has an absolute `fullUrl`. Vital
  signs follow R4's vital-sign profiles (category, unit, blood pressure as
  components). A required element the graph does not hold is a
  `data-absent-reason`, never a guess. Graph-only properties (`fictional`,
  `pvCohort`, a node's `name` label) are not served; a device's weekly mean
  keeps its source kind in the shared writer's
  `https://ehds.mabu.red/fhir/StructureDefinition/epa-ingest-source-kind`.
- **`meta.profile`** names a profile only when the resource class passed it
  (`src/fhir-profiles.ts`): Patient (EU core), Condition (EU core),
  MedicationRequest (EU MPD), Encounter (EU HDR) and a laboratory Observation
  (EU Lab). The proof is `scripts/eehrxf/validate.py` over
  `scripts/eehrxf/samples/facade-sample.json`, the mapper's output for fixed
  graph rows (`scripts/export-fhir-facade-samples.ts` writes it, read-only
  on the graph). `__tests__/fhir-facade-sample.test.ts` keeps the sample
  equal to the mapper and `__tests__/fhir-profile-claims.test.ts` keeps the
  claims equal to what the report says passed, in both directions. After a
  mapper change: `npx tsx scripts/export-fhir-facade-samples.ts`, then
  `python3 scripts/eehrxf/validate.py` and `python3 scripts/eehrxf/build.py`.

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

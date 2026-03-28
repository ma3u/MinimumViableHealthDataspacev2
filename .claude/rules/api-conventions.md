---
description: API design patterns, protocols, and data models used in this project
globs:
  - "ui/src/app/api/**"
  - "services/neo4j-proxy/src/**"
  - "docs/**"
  - "neo4j/**"
---

# API Conventions

## Protocols

| Protocol      | Version          | Usage                                                                |
| ------------- | ---------------- | -------------------------------------------------------------------- |
| DSP           | 2025-1           | Data Sovereignty Protocol — contract negotiation, transfer           |
| DCP           | v1.0             | Decentralised Claims Protocol — VC attestation                       |
| FHIR          | R4               | Clinical data exchange (Patient, Condition, Observation, Medication) |
| OMOP CDM      | v5.4             | Observational analytics (Person, ConditionOccurrence, DrugExposure)  |
| HealthDCAT-AP | 2.1              | Dataset catalogue metadata (Catalogue, Dataset, Distribution)        |
| EHDS          | Art. 3–12, 50–51 | Primary use (patient rights) + secondary use (research)              |
| GDPR          | Art. 15–22       | Patient data access, rectification, erasure rights                   |
| ODRL          | 2.2              | Policy expressions on DataProduct nodes                              |
| DID:web       | W3C              | Decentralised identifiers for participants                           |
| OIDC          | 1.0              | Keycloak authentication (realm: `edcv`)                              |

## Next.js API Routes (`ui/src/app/api/`)

### Route file pattern

Every route exports named async handler functions:

```typescript
export async function GET(request: NextRequest): Promise<NextResponse> { ... }
export async function POST(request: NextRequest): Promise<NextResponse> { ... }
```

### Response conventions

- Success: `NextResponse.json(data, { status: 200 })` or just `NextResponse.json(data)`.
- Not found: `NextResponse.json({ error: "Not found" }, { status: 404 })`.
- Unauthorized: handled by middleware redirect to `/auth/unauthorized` before route is reached.
- All errors return `{ error: string }` shape.

### Authentication inside routes

- Extract session via `getServerSession(authOptions)` from `next-auth/next`.
- Extract roles from `(session as { roles?: string[] }).roles ?? []`.
- Enforce role checks manually in routes that middleware does not protect (e.g., `/api/admin/*` checks for `EDC_ADMIN`).

### Static export fallback

- Routes are DISABLED in the static build (folder renamed by CI workflow).
- Each feature page must handle the `NEXT_PUBLIC_STATIC_EXPORT === "true"` case by calling `fetchApi()` from `ui/src/lib/api.ts`, which returns data from `ui/public/mock/*.json`.
- Mock files must match the live API response shape exactly.

## Neo4j Proxy (`services/neo4j-proxy/`, port 9090)

### Endpoints

```
GET  /fhir/Patient                    — list all patients
GET  /fhir/Patient/:id/$everything    — full FHIR bundle for one patient
GET  /omop/cohort                     — OMOP cohort statistics
GET  /catalog/datasets                — HealthDCAT-AP datasets from Neo4j
```

### Query patterns

- Uses `neo4j-driver` with parameterised Cypher (never string-interpolate user input).
- BOLT connection: `bolt://neo4j:7687` inside Docker, `bolt://localhost:7687` locally.
- Credentials: env vars `NEO4J_USER` / `NEO4J_PASSWORD` (default: `neo4j`/`healthdataspace` for local dev only).

## Roles and Access Control

Roles are injected into the JWT by the Keycloak callback in `ui/src/lib/auth.ts` and stored in the NextAuth session. Middleware enforces them at the route level.

| Role                    | Access                                                       |
| ----------------------- | ------------------------------------------------------------ |
| `EDC_ADMIN`             | All routes including `/admin/*`                              |
| `DATA_HOLDER`           | `/catalog`, `/data/share`, `/negotiate`                      |
| `DATA_USER`             | `/analytics`, `/query`, `/data/discover`                     |
| `HDAB_AUTHORITY`        | `/compliance`, `/admin/policies`                             |
| `TRUST_CENTER_OPERATOR` | Trust Center graph views                                     |
| `PATIENT`               | `/patient/profile`, `/patient/research`, `/patient/insights` |
| `EDC_USER_PARTICIPANT`  | Base authenticated user (implied by all above)               |

## Data Models

### FHIR R4 node (Neo4j)

```
(:Patient { resourceId, patientId, name, birthDate, gender, city, country })
  -[:HAS_CONDITION]-> (:Condition { resourceId, code, display, onset })
  -[:HAS_OBSERVATION]-> (:Observation { resourceId, code, display, value, unit, effectiveDate })
  -[:HAS_MEDICATION_REQUEST]-> (:MedicationRequest { resourceId, medicationCode, display })
```

### OMOP CDM node (Neo4j)

```
(:OMOPPerson { personId, genderConceptId, yearOfBirth })
  -[:HAS_CONDITION_OCCURRENCE]-> (:OMOPConditionOccurrence { conditionConceptId, startDate })
  -[:HAS_MEASUREMENT]-> (:OMOPMeasurement { measurementConceptId, valueAsNumber, unit })
  -[:HAS_DRUG_EXPOSURE]-> (:OMOPDrugExposure { drugConceptId, startDate })
```

### DSP contract chain (Neo4j)

```
(:Participant)-[:OFFERS]->(:DataProduct)-[:GOVERNED_BY]->(:OdrlPolicy)
(:DataProduct)-[:SUBJECT_TO]->(:HDABApproval)
(:Contract { contractId, status, signedAt })-[:COVERS]->(:DataProduct)
(:TransferEvent { transferId, timestamp, senderDid, receiverDid })-[:UNDER]->(:Contract)
```

### HealthDCAT-AP (Neo4j)

```
(:Catalogue)-[:CONTAINS]->(:HealthDataset {
  datasetId, title, description, license, conformsTo[], publisher
})-[:HAS_DISTRIBUTION]->(:Distribution { format, accessUrl })
```

## Mock JSON Fixtures (`ui/public/mock/`)

Each mock file maps 1:1 to an API endpoint:

| File                            | API endpoint                        |
| ------------------------------- | ----------------------------------- |
| `catalog.json`                  | `/api/catalog`                      |
| `graph.json`                    | `/api/graph`                        |
| `patient.json`                  | `/api/patient`                      |
| `patient_profile_list.json`     | `/api/patient/profile`              |
| `patient_profile_patient1.json` | `/api/patient/profile?patientId=P1` |
| `patient_profile_patient2.json` | `/api/patient/profile?patientId=P2` |
| `patient_insights.json`         | `/api/patient/insights`             |
| `patient_research.json`         | `/api/patient/research`             |
| `compliance.json`               | `/api/compliance`                   |
| `analytics.json`                | `/api/analytics`                    |
| `credentials.json`              | `/api/credentials`                  |

When adding a new API route, always add a corresponding mock fixture.

## DID Conventions

Participant DIDs follow the `did:web` method:

```
did:web:alpha-klinik.de:participant   — AlphaKlinik Berlin (DATA_HOLDER)
did:web:pharmaco.de:research          — PharmaCo Research AG (DATA_USER)
did:web:medreg.de:hdab                — MedReg DE (HDAB_AUTHORITY)
did:web:lmc.nl:clinic                 — Limburg Medical Centre (DATA_HOLDER)
did:web:irs.fr:hdab                   — Institut de Recherche Santé (HDAB)
```

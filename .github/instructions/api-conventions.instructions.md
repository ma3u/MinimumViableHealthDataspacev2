---
applyTo: "ui/src/app/api/**,services/neo4j-proxy/**,ui/public/mock/**,ui/src/lib/api.ts,ui/src/middleware.ts"
description: Protocol versions, route contracts, RBAC, data models, and the mock-fixture rule.
---

# API conventions

Mirror of `.claude/rules/api-conventions.md` — change both together.

## Protocols

| Protocol      | Version          | Usage                                                           |
| ------------- | ---------------- | --------------------------------------------------------------- |
| DSP           | 2025-1           | Dataspace Protocol — contract negotiation, transfer             |
| DCP           | v1.0             | Decentralised Claims Protocol — VC attestation                  |
| FHIR          | R4               | Clinical exchange (Patient, Condition, Observation, Medication) |
| OMOP CDM      | v5.4             | Analytics (Person, ConditionOccurrence, DrugExposure)           |
| HealthDCAT-AP | 2.1              | Dataset catalogue metadata                                      |
| EHDS          | Art. 3–12, 50–51 | Primary use (patient rights) + secondary use (research)         |
| GDPR          | Art. 15–22       | Access, rectification, erasure                                  |
| ODRL          | 2.2              | Policy expressions on `DataProduct` nodes                       |
| DID:web       | W3C              | Decentralised identifiers for participants                      |
| OIDC          | 1.0              | Keycloak authentication (realm `edcv`)                          |

## Next.js API routes

```typescript
export async function GET(request: NextRequest): Promise<NextResponse> { ... }
export async function POST(request: NextRequest): Promise<NextResponse> { ... }
```

- Success: `NextResponse.json(data)`. Errors always take the shape
  `{ error: string }` — 401 unauthenticated, 403 wrong role, 404 not found,
  502 backend failure.
- Auth: `getServerSession(authOptions)` from `next-auth/next`; roles from
  `(session as { roles?: string[] }).roles ?? []`. Enforce role checks manually in
  routes middleware does not cover — `/api/admin/*` requires `EDC_ADMIN`.
- Query Neo4j only through parameterised `runQuery()`. Never string-interpolate
  user input into Cypher.
- **Every route needs a mock twin** in `ui/public/mock/`, matching the live
  response shape exactly. Routes are disabled in the static build (CI renames the
  folder), and a missing fixture breaks the published demo silently.

## neo4j-proxy (port 9090)

```
GET  /health
GET  /fhir/Patient                    · GET /fhir/Patient/:id/$everything
POST /omop/cohort                     · GET /catalog/datasets
POST /nlq (4-tier resolver)           · GET /nlq/templates
POST /federated/query                 · GET /federated/stats
POST /trust-center/resolve (HDAB only) · GET /tck
```

`/federated/query` response contract (Phase 26e): `{results, sources, totalRows,
filtered, speCount, minKApplied, aggregateSuppressed, suppressionReason}` —
suppression rules in `docs/architecture/federation.md`. Rate limits: 100 req/min
per IP, with a heavier limiter on federated/NLQ (ADR-020).

BOLT is `bolt://neo4j:7687` inside Docker and `bolt://localhost:7687` locally;
credentials come from `NEO4J_USER` / `NEO4J_PASSWORD` (defaulting to
`neo4j`/`healthdataspace` for local dev only).

## Roles

Injected into the JWT by the Keycloak callback in `ui/src/lib/auth.ts` and enforced
by middleware at the route level.

| Role                    | Nav group     | Access / graph centre                                                                                |
| ----------------------- | ------------- | ---------------------------------------------------------------------------------------------------- |
| `EDC_ADMIN`             | Manage        | All routes incl. `/admin/*` · "Manage Dataspace"                                                     |
| `DATA_HOLDER`           | Exchange      | `/catalog`, `/data/share`, `/negotiate` · "Our Data Offerings"                                       |
| `DATA_USER`             | My Researches | `/data/discover`, `/negotiate`, `/tasks`, `/data/transfer`, `/analytics`, `/query` · "My Researches" |
| `HDAB_AUTHORITY`        | Governance    | `/compliance`, `/admin/policies` · "Govern the Dataspace"                                            |
| `TRUST_CENTER_OPERATOR` | Governance    | Trust Center views · "Privacy Operations"                                                            |
| `PATIENT`               | My Health     | `/patient/profile`, `/patient/research`, `/patient/insights` · "My Health"                           |
| `EDC_USER_PARTICIPANT`  | Exchange      | Base authenticated user (implied by all above)                                                       |

## Data models

```
# FHIR R4
(:Patient)-[:HAS_CONDITION]->(:Condition)
          -[:HAS_OBSERVATION]->(:Observation)
          -[:HAS_MEDICATION_REQUEST]->(:MedicationRequest)

# OMOP CDM
(:OMOPPerson)-[:HAS_CONDITION_OCCURRENCE]->(:OMOPConditionOccurrence)
             -[:HAS_MEASUREMENT]->(:OMOPMeasurement)
             -[:HAS_DRUG_EXPOSURE]->(:OMOPDrugExposure)

# DSP contract chain
(:Participant)-[:OFFERS]->(:DataProduct)-[:GOVERNED_BY]->(:OdrlPolicy)
(:DataProduct)-[:SUBJECT_TO]->(:HDABApproval)
(:Contract)-[:COVERS]->(:DataProduct)
(:TransferEvent)-[:UNDER]->(:Contract)

# HealthDCAT-AP
(:Catalogue)-[:CONTAINS]->(:HealthDataset)-[:HAS_DISTRIBUTION]->(:Distribution)
```

## DIDs

```
did:web:alpha-klinik.de:participant   — AlphaKlinik Berlin (DATA_HOLDER)
did:web:pharmaco.de:research          — PharmaCo Research AG (DATA_USER)
did:web:medreg.de:hdab                — MedReg DE (HDAB_AUTHORITY)
did:web:lmc.nl:clinic                 — Limburg Medical Centre (DATA_HOLDER)
did:web:irs.fr:hdab                   — Institut de Recherche Santé (HDAB)
```

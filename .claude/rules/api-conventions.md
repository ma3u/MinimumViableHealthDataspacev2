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

Route handlers call `requireAuth()` from `@/lib/auth-guard`, not `getServerSession()` directly.
`requireAuth()` wraps `getServerSession(authOptions)`, extracts the roles, checks them against the
roles you pass, and returns either `{ session }` or a ready-made `NextResponse` error. Narrow the
union with the `isAuthError()` type guard:

```typescript
import { requireAuth, isAuthError } from "@/lib/auth-guard";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireAuth(["EDC_ADMIN"]);
  if (isAuthError(auth)) return auth;
  const { roles, accessToken } = auth.session;
  ...
}
```

- No argument means "any authenticated user"; a role array means 401 when unauthenticated and 403
  when the session holds none of the listed roles.
- In static-export mode `requireAuth()` returns a synthetic `EDC_ADMIN` demo session rather than an
  error, so guarded routes still render in the GitHub Pages build.
- Reach for `getServerSession(authOptions)` directly only when you need something off the session
  that `AuthSession` does not carry.

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

| Role                    | Nav Group     | Access / Graph Center                                                                                       |
| ----------------------- | ------------- | ----------------------------------------------------------------------------------------------------------- |
| `EDC_ADMIN`             | Manage        | All routes incl. `/admin/*` · Graph: "Manage Dataspace"                                                     |
| `DATA_HOLDER`           | Exchange      | `/catalog`, `/data/share`, `/negotiate` · Graph: "Our Data Offerings"                                       |
| `DATA_USER`             | My Researches | `/data/discover`, `/negotiate`, `/tasks`, `/data/transfer`, `/analytics`, `/query` · Graph: "My Researches" |
| `HDAB_AUTHORITY`        | Governance    | `/compliance`, `/admin/policies` · Graph: "Govern the Dataspace"                                            |
| `TRUST_CENTER_OPERATOR` | Governance    | Trust Center graph views · Graph: "Privacy Operations"                                                      |
| `PATIENT`               | My Health     | `/patient/profile`, `/patient/research`, `/patient/insights` · Graph: "My Health"                           |
| `EDC_USER_PARTICIPANT`  | Exchange      | Base authenticated user (implied by all above)                                                              |

Every route that reads a session enforces it through `requireAuth()`, with no
exceptions. `/api/patient` was the one that did not, answering anonymous
callers while the matrix said otherwise; #357 closed that, and `/patient`
joined `PROTECTED_PATHS` in the same change so a visitor is sent to sign in
rather than shown a page whose data call refuses.

On that route the session both admits and narrows: any authenticated
participant sees the demo cohort, a `PATIENT` sees only their own record
(EHDS Art. 3, GDPR Art. 15). `bruno/MVHDv2/09 Access control/05` asserts the
401 and its `{ error }` body.

### The two routes that answer without a session, and why

#357 prompted a sweep: every handler was classified, then every
public-looking GET was called with no session against a running stack.
Ground truth, not a static scan, because several routes gate through a
file-local helper and a scan reported them as open. It found one gap and one
judgement call, both settled in #377.

`/api/debug/phase26` was the gap. An operator diagnostic that answered
anybody with participant, dataset and glossary counts, while this collection
filed it under `05 Dataspace Operator`. Now `requireAuth(["EDC_ADMIN"])`.
`09 Access control/17` asserts the 401 with no session and `/18` the 403 for
a signed-in data user; `05 Dataspace Operator/28` asserts the operator still
gets through.

`/api/nlq/backend` stays public, deliberately. It is the one route in the
inventory that answers anonymously by decision rather than by oversight. It
reports which chat and embeddings providers are wired and which vector
indexes exist: no secrets, no data. Against that,
`__tests__/e2e/journeys/33-graphrag-nlp.spec.ts` probes it with no session
seven times to decide which GraphRAG branches its environment can run, and
its `fetchBackend()` feeds a null on any non-200 straight into
`test.skip(...)`. Gating it would not fail those tests, it would silently
stop them running, which is what ADR-031 exists to prevent, and section A of
that spec is deliberately Keycloak-free so it runs where no login exists.
Small disclosure against real coverage; the coverage wins. Revisit if that
spec gains an authenticated request context.

These two are the whole list. Any other route answering a caller with no
session is a defect, not a policy.

**Route tests do not check the gate.** `ui/__tests__/setup.ts` mocks
`@/lib/auth-guard` open, so `requireAuth()` returns an `EDC_ADMIN` and
`isAuthError()` returns false for every test that does not say otherwise. That
is deliberate, so route tests exercise business logic, but it means a route
that forgets `requireAuth()` passes its unit tests. A test that means to pin a
gate must close the guard itself; see the no-session block in
`ui/__tests__/unit/api/patient-route.test.ts`. The API collection's
`09 Access control` folder is the check that runs against a real server.

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

Two `did:web` forms coexist, and they belong to different layers. Confusing them
cost a day (#345): a seed copied the first form into the EDC layer, where no
host serves a `did.json` for it, so the IssuerService could never resolve a
holder and CI never issued a credential.

**Graph and UI layer** (Neo4j seeds, mocks, UI tests, docs). Stable identifiers
for the fictional organisations. Nothing resolves them and nothing needs to:

```
did:web:alpha-klinik.de:participant   — AlphaKlinik Berlin (DATA_HOLDER)
did:web:pharmaco.de:research          — PharmaCo Research AG (DATA_USER)
did:web:medreg.de:hdab                — MedReg DE (HDAB_AUTHORITY)
did:web:lmc.nl:clinic                 — Limburg Medical Centre (DATA_HOLDER)
did:web:irs.fr:hdab                   — Institut de Recherche Santé (HDAB)
```

**EDC layer** (control plane participant contexts, IdentityHub, IssuerService
holders). The DID the connector actually resolves, hosted by the IdentityHub's
DID endpoint as other containers reach it. On the compose stack and in CI:

```
did:web:identityhub%3A7083:alpha-klinik     → http://identityhub:7083/alpha-klinik/did.json
did:web:identityhub%3A7083:pharmaco
did:web:identityhub%3A7083:medreg
did:web:identityhub%3A7083:lmc
did:web:identityhub%3A7083:irs
did:web:issuerservice%3A10016:issuer        (the issuer's own DID)
```

CFM creates the EDC-layer contexts locally; `scripts/azure/05-cp-participants.sh`
(`DID_HOST`), `scripts/seed-identityhub-participants.sh` and
`scripts/seed-issuer-holders.sh` create them where CFM is absent, and all three
must carry the same id and DID for a participant or the suites cannot match
them. The compliance suites match on the slug inside the identity, so either
form satisfies them; only the EDC layer's protocol flows need the resolvable one.

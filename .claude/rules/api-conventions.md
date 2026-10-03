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

### Every route needs a session (ADR-044)

Decided 2026-10-02 (#404): every API route needs a session. Middleware skips
`/api/*`, so the route itself is the only gate, and the gate is
`requireAuth()` in every handler. This replaced the earlier list of routes
that were public by decision: `/api/nlq/backend` (#377), the access body's
register, information page, results register and activity report (Art. 58,
59, 73; #206) and `/api/graph`. Those now answer any signed-in participant,
and their pages (`/graph`, `/permits`, `/information`, `/activity-report`)
are in `PROTECTED_PATHS`, so an anonymous visitor is sent to sign in. So are `/catalog`, `/analytics`, `/query`,
`/eehrxf` and `/tasks`, whose APIs needed a session before: a page that
reads the API redirects a signed-out visitor rather than showing empty panels.

The only routes that answer without a session are the ones that make
signing in possible and the probe that keeps the container alive:

- `/api/auth/[...nextauth]`, `/api/auth/eudi/start`, `/api/auth/eudi/status`:
  the sign-in flows themselves.
- `/api/keycloak-config`: tells the sign-in banner where Keycloak is.
- `/api/health`: the liveness and readiness probe (`k8s/probes.yaml`).

The start page's TestFlight form (`/api/testflight-request`, ADR-048) is gone:
Klarbefund's beta is joined by Apple's public link (ADR-050).

One route takes a machine credential instead of, or as well as, a session:
`/api/mock-dsp/[participant]/catalog/request`, which the catalog crawler
POSTs to every five minutes (ADR-020). It calls `requireSessionOrToken()`
from `@/lib/service-auth`: a session, or `Authorization: Bearer
<DSP_CATALOG_TOKEN>`. The token lives once in Key Vault and reaches the UI
and the crawler as a `keyvaultref` (ADR-036,
`scripts/azure/wire-dsp-catalog-token.sh`); the crawler sends it only to
`DSP_CATALOG_TOKEN_HOSTS`. A wrong token is a 401, never a fallback to the
session.

`ui/__tests__/unit/api/every-route-needs-a-session.test.ts` enforces this per
handler, not per file (a file-level scan passed `GET /api/compliance/results`
because its `POST` was gated), and fails on a listed route that no longer
exists. `bruno/MVHDv2/09 Access control/19` to `/24` assert the 401 and its
`{ error }` body on the six routes gated by #404. A new anonymous route needs
a superseding ADR, not a line in this list.

**Route tests do not check the gate.** `ui/__tests__/setup.ts` mocks
`@/lib/auth-guard` open, so `requireAuth()` returns an `EDC_ADMIN` and
`isAuthError()` returns false for every test that does not say otherwise. That
is deliberate, so route tests exercise business logic, but it means a route
that forgets `requireAuth()` passes its unit tests. A test that means to pin a
gate must close the guard itself: either `vi.unmock("@/lib/auth-guard")` at the top of the
file, so the real `requireAuth()` runs against the mocked `getServerSession` (the admin and
patient route tests do this), or override it per test as the no-session block in
`ui/__tests__/unit/api/patient-route.test.ts` does. The API collection's
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
| `credential_definitions.json`   | `/api/credentials/definitions`      |
| `trust_center.json`             | `/api/trust-center`                 |

When adding a new API route, always add a corresponding mock fixture. `__tests__/unit/lib/static-mock-coverage.test.ts`
fails when a page GETs an `/api/...` path that resolves to no file under `public/mock/`.

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

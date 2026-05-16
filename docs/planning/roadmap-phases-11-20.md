# Roadmap — Phases 11–20

> Archived detail from the [Planning index](../planning-health-dataspace-v2.md).
> EDC component topology, operational hardening, E2E testing, Trust Center,
> role-aware UI and the patient portal. All ✅ complete.

---

### Phase 11: EDC Components — Per-Participant Topology & Info Layer ✅

Phase 11 enhances the `/admin/components` page to present a **per-participant
component topology view** that reflects the decentralized architecture of an
Eclipse Dataspace — where each participant operates their own stack of
connector services. Each component receives an **info overlay** explaining its
role in the dataspace protocol stack, and **critical service indicators**
highlight unhealthy or degraded participants at a glance.

**Motivation:** In a real EHDS dataspace every data holder, data user and HDAB
runs their own IdentityHub, Control Plane, Data Plane(s) and CFM agents. The
current view groups services by architectural layer, but does not show _which_
services belong to _which_ participant. Operators need to see the full
decentralised stack per participant — including liveness — at a single glance.

#### 11a: Component Info Tooltips

Add an ⓘ info button to every component card. Clicking it opens an overlay /
popover with:

| Field             | Content                                                                    |
| ----------------- | -------------------------------------------------------------------------- |
| **What**          | One-sentence description of the service's role                             |
| **Protocol**      | Which DSP / DCP / DPS spec it implements                                   |
| **Ports**         | Exposed port(s) and protocol (HTTP / Bolt / AMQP / gRPC)                   |
| **Depends on**    | Direct upstream dependencies (e.g. Control Plane → PostgreSQL, Vault)      |
| **Health source** | How health is determined (Docker healthcheck, TCP probe, /health endpoint) |

**Component description catalog** (static map rendered client-side):

| Component              | Description                                                                                                                                                                                              |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Control Plane**      | Central management API for the EDC connector. Hosts the DSP (Dataspace Protocol) endpoints for catalog queries, contract negotiation, and transfer process state machines. Persists state in PostgreSQL. |
| **Data Plane FHIR**    | DCore-based data plane for FHIR R4 clinical data. Implements HttpData-PUSH transfer type. Selected by DataPlaneSelectorService when `allowedTransferTypes` matches `HttpData-PUSH`.                      |
| **Data Plane OMOP**    | DCore-based data plane for OMOP CDM research analytics. Implements HttpData-PULL transfer type. Proxies Cypher queries through Neo4j Proxy.                                                              |
| **IdentityHub**        | DCP v1.0 credential storage and presentation service. Stores W3C Verifiable Credentials. Creates Verifiable Presentations for DSP protocol handshake authentication.                                     |
| **IssuerService**      | Trust anchor for Verifiable Credential issuance. Issues EHDSParticipantCredential, DataProcessingPurposeCredential, and DataQualityLabelCredential with StatusList2021 revocation.                       |
| **Keycloak**           | OAuth2 / OIDC identity provider. Manages user authentication, SSO sessions, and client credential grants for service-to-service communication.                                                           |
| **Vault**              | HashiCorp Vault for secret management. Stores signing keys, STS client secrets, and transfer tokens. Provides transit engine for key operations.                                                         |
| **PostgreSQL**         | Shared relational database with isolated schemas: controlplane, dataplane, identityhub, issuerservice, keycloak, cfm, redlinedb. Each service auto-migrates its own schema.                              |
| **NATS**               | JetStream messaging broker. Carries EDC-V internal events (contract state changes, transfer signals) and CFM provisioning workflow messages.                                                             |
| **Neo4j**              | 5-layer health knowledge graph (Marketplace, HealthDCAT-AP, FHIR, OMOP, Ontology). Stores ~57K nodes; serves Bolt queries and browser UI.                                                                |
| **Neo4j Proxy**        | HTTP-to-Cypher bridge. Translates REST API calls from the OMOP Data Plane into Cypher queries against Neo4j. Enables pull-based OMOP data transfer.                                                      |
| **Traefik**            | Reverse proxy / API gateway. Routes external traffic to internal services via path-based routing. Provides TLS termination and load balancing.                                                           |
| **Tenant Manager**     | CFM multi-tenant lifecycle manager. Creates tenants, deploys dataspace profiles, provisions VPAs (Virtual Participant Addresses).                                                                        |
| **Provision Manager**  | CFM automated provisioning engine. Orchestrates the sequence of agents (Keycloak → EDC-V → Registration → Onboarding) to bring a participant to ACTIVE state.                                            |
| **Keycloak Agent**     | CFM agent that provisions Keycloak realms, clients, and service accounts for new participants.                                                                                                           |
| **EDC-V Agent**        | CFM agent that creates participant contexts in the EDC-V Control Plane.                                                                                                                                  |
| **Registration Agent** | CFM agent that registers Verifiable Credentials with the IssuerService for new participants.                                                                                                             |
| **Onboarding Agent**   | CFM orchestration agent that chains the full onboarding sequence: DID creation → credential issuance → participant context → catalog registration.                                                       |

**Implementation:**

- Add `COMPONENT_INFO: Record<string, ComponentMeta>` static map in a new
  `ui/src/lib/edc/component-info.ts` module
- Render an `<InfoButton />` component on each card; clicking opens a Tailwind
  popover positioned to the right of the card
- On mobile, the popover renders as a bottom-sheet modal

#### 11b: Per-Participant Component Topology

Restructure the main view to show each participant as an expandable section
containing **their own** component sub-cards. The layout reflects the
decentralized principle: every participant in a real dataspace runs their own
connector stack.

**Per-participant component layout:**

```
┌── AlphaKlinik Berlin (DATA_HOLDER) ──────────────────────────────────────┐
│                                                                          │
│  ┌─ Control Plane ─┐  ┌─ Data Plane ──┐  ┌─ IdentityHub ─┐            │
│  │ ● healthy       │  │   FHIR  OMOP  │  │ ● healthy     │            │
│  │ CPU 2.1%        │  │ ● healthy ●   │  │ 3 VCs stored  │            │
│  │ MEM 245 MB      │  │ CPU 0.8%      │  └───────────────┘            │
│  └─────────────────┘  └───────────────┘                                │
│                                                                          │
│  ┌─ Keycloak ──────┐  ┌─ Vault ───────┐  ┌─ Tenant Mgr ─┐            │
│  │ ● healthy       │  │ ● sealed:no   │  │ State: ACTIVE │            │
│  │ Realm: alpha    │  │ 4 signing keys│  │ 3 VPAs        │            │
│  └─────────────────┘  └───────────────┘  └───────────────┘            │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

**Data source mapping:**

| Component per participant | API endpoint                                                   | Data extracted           |
| ------------------------- | -------------------------------------------------------------- | ------------------------ |
| Control Plane             | `GET /v5alpha/participants/{ctx}/management/v3/assets`         | Asset count, health      |
| Data Plane(s)             | Docker stats for `dataplane-fhir`, `dataplane-omop`            | CPU, MEM, health         |
| IdentityHub               | `GET /v5alpha/participants/{ctx}/identity/v1alpha/credentials` | VC count, types          |
| Keycloak                  | Docker stats for `keycloak` + realm info via admin API         | Realm name, client count |
| Vault                     | Docker stats for `vault` + `/v1/sys/health`                    | Seal status, key count   |
| Tenant Manager            | `GET /v1alpha1/tenants/{id}/profiles`                          | VPA count, state         |

**Implementation:**

- New API route: `GET /api/admin/components/topology` — aggregates per-participant
  component data by iterating over registered participants and fetching their
  component state in parallel
- Toggle button on `/admin/components` page: **"Layer view"** (current) vs
  **"Participant view"** (new topology)
- Each participant section is collapsible; default expanded for unhealthy ones
- Component cards reuse existing `ComponentCard` with an added `<InfoButton />`

#### 11c: Critical Service & Participant Indicators

Add visual escalation for degraded or unreachable services:

| Severity        | Condition                                               | Visual indicator                               |
| --------------- | ------------------------------------------------------- | ---------------------------------------------- |
| 🔴 **Critical** | Container health = `unhealthy` or exited                | Red border + pulsing dot on participant header |
| 🟡 **Warning**  | Container health = `starting` or CPU > 80% or MEM > 90% | Yellow border + warning icon                   |
| 🟢 **Healthy**  | Container health = `healthy` and metrics normal         | Green dot (default)                            |
| ⚫ **Unknown**  | Docker socket unavailable or no health check configured | Gray dot with `?` badge                        |

**Critical participant rollup:**

- A participant is marked critical if **any** of their core components
  (Control Plane, IdentityHub, or Data Plane) is critical
- A summary banner at the top shows: `"2 of 5 participants degraded"` with
  direct links to the affected participant sections
- On the Layer view, critical component cards are sorted to the top within
  their layer group

**Implementation:**

- Add `severity` field to `ComponentInfo` type (computed from Docker health +
  metrics thresholds)
- Add `participantHealth` computed property to the topology API response
- Render `<CriticalBanner />` above the component grid when any participant is
  degraded
- Critical participants in the grid have a red left-border accent and sort
  to the top

#### 11d: Static Export & Mock Data

- Create `ui/public/mock/admin_components_topology.json` — mock topology
  response with 5 participants, each with 6 component sub-cards (mixed
  healthy / warning / critical states)
- Extend `COMPONENT_INFO` map with mock descriptions for all 18 Docker
  services
- Add `/api/admin/components/topology` to `STATIC_MOCK_PREFIX` in
  `ui/src/lib/api.ts`

**Deliverables:**

- ⓘ info overlays for all 18 component types with protocol/port/dependency
  metadata
- Per-participant topology view showing decentralized component ownership
- Critical service indicators with severity escalation (critical / warning /
  healthy / unknown)
- Degraded-participant summary banner with quick-navigation links
- Layer view ↔ Participant view toggle
- Mock data for GitHub Pages static export

---

### Phase 12: API QuerySpec Fix & EHDS Policy Seeding ✅

Phase 12 resolves a critical EDC-V Management API compatibility issue affecting
all `POST .../request` list endpoints, and seeds the full set of EHDS ODRL
policies required for secondary-use data access scenarios.

#### 12a: QuerySpec `filterExpression` Fix ✅

**Problem:** EDC-V's `POST .../request` endpoints (policies, assets, negotiations,
transfers) return empty `[]` when the `QuerySpec` body omits the `filterExpression`
field — even though an empty filter should mean "return all". This caused the UI
to show 0 results for policies, assets, negotiations, and transfers despite data
being present in the control plane.

**Root cause:** EDC-V's query engine treats a missing `filterExpression` property
differently from an empty array `[]`. With `filterExpression` absent, the query
matches nothing; with `"filterExpression": []`, it matches everything (no filter).

**Fix:** Added `"filterExpression": []` to all `QuerySpec` objects across 6 UI API
routes:

- `ui/src/app/api/admin/policies/route.ts` (2 call sites)
- `ui/src/app/api/assets/route.ts` (2 call sites)
- `ui/src/app/api/tasks/route.ts` (2 call sites)
- `ui/src/app/api/negotiations/route.ts` (1 call site)
- `ui/src/app/api/transfers/route.ts` (1 call site)

#### 12b: EHDS Policy Seeding Script ✅

Created `jad/seed-ehds-policies.sh` — a standalone script that discovers current
participant context IDs dynamically and creates EHDS-specific ODRL policy
definitions via the EDC-V Management API.

**Policy assignments by participant:**

| Participant                 | Role        | Policies | Policy IDs                                                                                                         |
| --------------------------- | ----------- | -------- | ------------------------------------------------------------------------------------------------------------------ |
| AlphaKlinik Berlin          | DATA_HOLDER | 3        | `ehds-open-fhir-access`, `ehds-research-access-ak`, `ehds-crossborder-access-ak`                                   |
| Limburg Medical Centre      | DATA_HOLDER | 4        | `ehds-open-catalog-access`, `ehds-research-access-lmc`, `ehds-public-health-access`, `ehds-crossborder-access-lmc` |
| PharmaCo Research AG        | DATA_USER   | 2        | `ehds-research-access-pc`, `ehds-ai-training-access-pc`                                                            |
| MedReg DE                   | HDAB        | 3        | `ehds-regulatory-access-mr`, `ehds-statistics-access-mr`, `ehds-catalog-open-mr`                                   |
| Institut de Recherche Santé | HDAB        | 2        | `ehds-research-access-irs`, `ehds-statistics-access-irs`                                                           |

**Note:** All policies currently use open ODRL constraints (`"constraint": []`).
Custom EHDS leftOperands (`purpose`, `patientConsent`) require EDC-V policy scope
bindings which are not yet configured. EHDS Article semantics are encoded in the
policy IDs. Purpose-based enforcement is planned for Phase 2 of policy scope
configuration.

#### 12c: Layer View Participants as Table ✅

Replaced the card grid layout for participants in the Layer View of
`/admin/components` with a table matching the component table style. Columns:
Participant (name + org), Role (color-coded badge), DID, State, Profiles.

**Deliverables:** All EDC-V list queries return data correctly; 14 EHDS policies
seeded across 5 participants; Layer View participants rendered as a consistent
table layout.

### Phase 13: Operational Hardening & Persistent Task Management ✅

Phase 13 resolves runtime issues discovered during live deployment testing —
empty dropdowns, stale references in seed scripts, missing QuerySpec fields in
TCK probes, and the lack of persistent task history. All fixes ensure the
system is fully operational after running the seed scripts in sequence.

#### 13a: Seed Script Dynamic Discovery ✅

**Problem:** `jad/seed-federated-catalog.sh` contained hardcoded participant
context UUIDs (`d0b1e14e6faa47aca9c2932a5e22885b`, etc.) and stale DID slugs
(`clinic-alphaklinik`, `cro-pharmaco`, `hdab-medreg`) that no longer match the
current EDC-V provisioned contexts.

**Fix:** Replaced all hardcoded values with dynamic `discover_ctx()` and
`discover_did()` functions that query the EDC-V Management API at runtime,
matching the pattern already established in `seed-data-assets.sh`.

**Files changed:** `jad/seed-federated-catalog.sh`

#### 13b: TCK QuerySpec Compliance ✅

**Problem:** The TCK compliance endpoint in `neo4j-proxy` omitted
`filterExpression: []` from two QuerySpec bodies — the assets query and the
IssuerService credential definitions query — causing empty results when EDC-V
strictly requires the field.

**Fix:** Added `"filterExpression": []` to both QuerySpec objects in the TCK
handler.

**Files changed:** `services/neo4j-proxy/src/index.ts` (2 locations in TCK
handler)

#### 13c: EHDS Compliance Checker Fallback ✅

**Problem:** The compliance checker dropdown on `/compliance` only populated
consumers from Neo4j `Participant` nodes with `AccessApplication` relationships.
When no HDAB approval chain exists yet (pre-seed), the dropdown was empty and
users had to guess participant IDs.

**Fix:** Added a two-tier fallback in `/api/compliance/route.ts`:

1. **Consumer dropdown:** When Neo4j returns no approved consumers, falls back to
   all ACTIVATED EDC-V participant contexts with display-name mapping.
2. **Dataset dropdown:** When no HDAB-approved datasets exist, falls back to all
   `HealthDataset` nodes in Neo4j.

**Files changed:** `ui/src/app/api/compliance/route.ts`

#### 13d: Persistent Task Management (PostgreSQL) ✅

**Problem:** Tasks (contract negotiations + data transfers) existed only in
EDC-V's in-memory API responses — no historical persistence, no visibility when
EDC-V is unavailable, and task data lost on container restart.

**Design:** Decentralized task persistence on the provider/consumer side using a
dedicated PostgreSQL database (`taskdb`), with the neo4j-proxy acting as the
persistence broker.

**Implementation:**

| Component                           | Change                                                                                                                                                                        |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `jad/init-postgres.sql`             | Added `taskdb` database, `taskuser` user, `tasks` table with indexes on `participant_id`, `type`, `state`                                                                     |
| `services/neo4j-proxy/package.json` | Added `pg` (^8.16.0) and `@types/pg` (^8.11.6) dependencies                                                                                                                   |
| `services/neo4j-proxy/src/index.ts` | Added `POST /tasks/sync` (upsert from EDC-V) and `GET /tasks` (retrieve with optional participant filter) endpoints; auto-creates table on first use via `ensureTaskTable()`  |
| `ui/src/app/api/tasks/route.ts`     | Added sync step: after aggregating live tasks from EDC-V, POSTs them to neo4j-proxy `/tasks/sync`; error handler falls back to neo4j-proxy `/tasks` when EDC-V is unavailable |

**Task table schema:**

```sql
CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,          -- 'negotiation' | 'transfer'
  participant TEXT NOT NULL,
  participant_id TEXT NOT NULL,
  asset TEXT,
  asset_id TEXT,
  state TEXT NOT NULL,
  counter_party TEXT,
  timestamp_ms BIGINT,
  contract_id TEXT,
  transfer_type TEXT,
  edr_available BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Files changed:** `jad/init-postgres.sql`, `services/neo4j-proxy/package.json`,
`services/neo4j-proxy/src/index.ts`, `ui/src/app/api/tasks/route.ts`

#### 13e: Seed Orchestration Guide

The full seed sequence required to populate a fresh deployment:

| Order | Script                             | Purpose                                                                  | Prerequisites           |
| ----- | ---------------------------------- | ------------------------------------------------------------------------ | ----------------------- |
| 1     | `jad/seed-jad.sh`                  | IssuerService tenant, Cell, Dataspace Profile, ActivityDefinitions       | Docker stack healthy    |
| 2     | `jad/seed-health-tenants.sh`       | 5 participant tenants via CFM Tenant Manager                             | seed-jad.sh complete    |
| 3     | `jad/seed-ehds-credentials.sh`     | EHDS credential definitions on IssuerService                             | Tenants provisioned     |
| 4     | `jad/seed-data-assets.sh`          | Assets, policies, contracts; context activation; data plane registration | Tenants ACTIVATED       |
| 5     | `jad/seed-ehds-policies.sh`        | 14 EHDS ODRL policies across 5 participants                              | Contexts activated      |
| 6     | `jad/seed-contract-negotiation.sh` | Contract negotiations (CRO→Clinic, HDAB→Clinic)                          | Assets + policies exist |
| 7     | `jad/seed-data-transfer.sh`        | Data transfers (FHIR + HealthDCAT-AP)                                    | Negotiations FINALIZED  |
| 8     | `jad/seed-federated-catalog.sh`    | Federated catalog discovery across participants                          | Assets registered       |
| 9     | `jad/issue-ehds-credentials.sh`    | VC issuance to participant IdentityHubs                                  | Credential defs exist   |

**Quick start:**

```bash
# Full seed sequence (run from project root)
for script in seed-jad.sh seed-health-tenants.sh seed-ehds-credentials.sh \
  seed-data-assets.sh seed-ehds-policies.sh seed-contract-negotiation.sh \
  seed-data-transfer.sh seed-federated-catalog.sh issue-ehds-credentials.sh; do
  echo "=== Running $script ==="
  bash "jad/$script"
done
```

**Deliverables:** Dynamic seed discovery (no hardcoded UUIDs); TCK probes
compliant; compliance checker usable pre-seed; persistent task history in
PostgreSQL; documented seed orchestration order.

---

### Phase 14: End-to-End Testing & Demonstration Verification ✅

**Goal:** Verify the full dataspace works end-to-end on localhost, with every UI
page showing enough live data to demonstrate the EHDS dataspace functionality.

**Context:** With all infrastructure fixed (data plane key aliases, federated
catalog LMC targeting, transfer counterparty addresses), the full seed
pipeline runs successfully. This phase adds automated verification that all
services, API routes, and UI pages function correctly with real data.

#### E2E Test Plan

##### A. Infrastructure Verification

| Check                         | Command / Endpoint                                  | Expected                  |
| ----------------------------- | --------------------------------------------------- | ------------------------- |
| All Docker containers healthy | `docker compose ps`                                 | 19+ services Up (healthy) |
| PostgreSQL reachable          | `psql -U cp -d controlplane`                        | Connection OK             |
| Neo4j reachable               | bolt://localhost:7687                               | Schema loaded             |
| Vault unsealed                | http://localhost:8200/v1/sys/health                 | `{"sealed":false}`        |
| Keycloak realm                | http://localhost:8080/realms/edcv                   | Realm JSON returned       |
| NATS connected                | http://localhost:8222/connz                         | Active connections        |
| Control Plane ready           | http://localhost:11003/api/mgmt/check/readiness     | 200 OK                    |
| Data Plane FHIR ready         | http://localhost:11002/api/check/readiness          | 200 OK                    |
| Data Plane OMOP ready         | http://localhost:11012/api/check/readiness          | 200 OK                    |
| Identity Hub ready            | http://localhost:11005/api/identity/check/readiness | 200 OK                    |
| Issuer Service ready          | http://localhost:10013/api/check/readiness          | 200 OK                    |
| Neo4j Query Proxy             | http://localhost:9090/health                        | `{"status":"UP"}`         |

##### B. Dataspace State Verification

| Check                           | Query / API                             | Expected                                 |
| ------------------------------- | --------------------------------------- | ---------------------------------------- |
| 5 participant contexts          | CP mgmt API                             | alpha-klinik, lmc, pharmaco, medreg, irs |
| All contexts ACTIVATED          | `edc_participant_context.state = 200`   | 5 rows                                   |
| 10 Verifiable Credentials       | IssuerService API                       | EHDS + DPP credentials                   |
| 9 data assets registered        | `edc_asset` table                       | 9 rows across 4 participants             |
| ODRL policies created           | `edc_policydefinitions` table           | Policies for all participants            |
| Contract negotiations FINALIZED | `edc_contract_negotiation.state = 1200` | ≥6 FINALIZED                             |
| Transfers in STARTED state      | `edc_transfer_process.state = 600`      | ≥4 STARTED                               |
| DID documents served            | identityhub:7083/{participant}/did.json | Valid DID JSON                           |
| Data plane instances registered | `edc_data_plane_instance`               | Entries for all contexts                 |

##### C. API Route Verification (Next.js Backend)

| Route                          | Method | Expected Response                 |
| ------------------------------ | ------ | --------------------------------- |
| `/api/graph`                   | GET    | Neo4j node/relationship data      |
| `/api/catalog`                 | GET    | Dataset catalog entries           |
| `/api/patient`                 | GET    | Synthetic FHIR patient records    |
| `/api/analytics`               | GET    | OMOP CDM analytics data           |
| `/api/eehrxf`                  | GET    | EEHRxF profile alignment scores   |
| `/api/compliance`              | GET    | Compliance check results          |
| `/api/compliance/tck`          | GET    | TCK probe status                  |
| `/api/participants`            | GET    | Participant list (5 participants) |
| `/api/credentials`             | GET    | Credential status                 |
| `/api/credentials/definitions` | GET    | Credential type definitions       |
| `/api/negotiations`            | GET    | Contract negotiation list         |
| `/api/transfers`               | GET    | Transfer process list             |
| `/api/assets`                  | GET    | Data asset list                   |
| `/api/admin/tenants`           | GET    | Tenant management data            |
| `/api/admin/policies`          | GET    | ODRL policy list                  |
| `/api/admin/components`        | GET    | Component topology                |
| `/api/admin/audit`             | GET    | Audit log entries                 |
| `/api/tasks`                   | GET    | Task dashboard data               |
| `/api/federated`               | GET    | Federated catalog data            |

##### D. UI Page Verification

Each page must render with meaningful content (not empty states):

| Page             | URL                 | Key Content Expected                     |
| ---------------- | ------------------- | ---------------------------------------- |
| Home             | `/`                 | Dashboard cards with live statistics     |
| Graph Explorer   | `/graph`            | Interactive Neo4j graph visualization    |
| Catalog          | `/catalog`          | Dataset cards (≥4 datasets)              |
| Patient Journey  | `/patient`          | Synthetic patient records with FHIR data |
| Analytics        | `/analytics`        | OMOP CDM charts and statistics           |
| EEHRxF Profiles  | `/eehrxf`           | 6 EEHRxF categories with coverage scores |
| Compliance       | `/compliance`       | EHDS compliance checklist                |
| TCK Results      | `/compliance/tck`   | DCP/DSP protocol test results            |
| Data Discovery   | `/data/discover`    | Discoverable datasets from catalog       |
| Data Sharing     | `/data/share`       | Data sharing configuration               |
| Data Transfer    | `/data/transfer`    | Active transfer processes                |
| Negotiations     | `/negotiate`        | Contract negotiation list (≥6 rows)      |
| Credentials      | `/credentials`      | Verifiable credential status             |
| Onboarding       | `/onboarding`       | Participant onboarding flow              |
| Tasks            | `/tasks`            | Task list with DPS state                 |
| Query            | `/query`            | Natural language query interface         |
| Admin Dashboard  | `/admin`            | System overview with stats               |
| Admin Tenants    | `/admin/tenants`    | 5 health tenants                         |
| Admin Policies   | `/admin/policies`   | ODRL policy definitions                  |
| Admin Components | `/admin/components` | Service topology diagram                 |
| Admin Audit      | `/admin/audit`      | Audit trail entries                      |
| Settings         | `/settings`         | User preferences                         |
| Docs             | `/docs`             | Documentation hub                        |

#### Implementation

**Script:** `scripts/run-e2e-tests.sh` — Bash-based E2E test runner that:

1. Verifies all Docker services are healthy
2. Checks dataspace state in PostgreSQL
3. Tests all API routes return non-empty 200 responses
4. Verifies key data counts (participants, assets, negotiations, transfers)

**Discovered Bugs Fixed (during Phase 14):**

1. **Data plane key alias swap** — `docker-compose.jad.yml` had
   `edc.transfer.proxy.token.signer.privatekey.alias` pointing to the
   public key and vice versa for both dataplane-fhir and dataplane-omop.
   Transfers were stuck at REQUESTING because the data plane couldn't sign
   tokens. Fixed by swapping the aliases.

2. **Federated catalog wrong provider** — `seed-federated-catalog.sh` was
   querying AlphaKlinik's catalog for `healthdcatap-catalog`, but that
   asset belongs to LMC. The null offer ID caused a JSON-LD parsing error.
   Fixed by targeting LMC's catalog instead.

3. **Transfer counterparty address** — After fixing the negotiation target
   to LMC, the transfer initiation still used AlphaKlinik's DSP endpoint
   as `counterPartyAddress`. The provider couldn't find the agreement
   because it was negotiated with a different participant. Fixed by using
   `LMC_CTX` in the transfer request.

4. **Unified seed pipeline** — Created `jad/seed-all.sh` to orchestrate
   all 7 seed scripts in correct dependency order. Integrated into
   `scripts/bootstrap-jad.sh` as Phase 9.

**Deliverables:** E2E test script; README quickstart for full JAD stack;
unified seed-all.sh pipeline; bootstrap-jad.sh integration; all 3 data
plane/catalog bugs fixed and verified.

---

### Phase 15: Mock Fallback & Graph Deep-Linking ✅

**Goal:** Make all pages fully demonstrable without live EDC-V/Neo4j
backends by implementing mock data fallback, and add bidirectional
deep-linking between the Graph Explorer and Catalog/Discover/Transfer pages.

**Completed:** 2025-07 (commit `584cc33`)

#### 15a — Mock Fallback for APIs

- **Catalog API** (`/api/catalog`): Added `loadMockCatalog()` — reads
  `public/mock/catalog.json`, merges with live Neo4j results, deduplicates
  by `id`. Catalog page always shows 17+ entries even without Neo4j.
- **Assets API** (`/api/assets`): Added `loadMockAssets()` — reads
  `public/mock/assets.json`, merges with live EDC results using
  identity-based comparison, deduplicates by `@id`. Assets grouped across
  5 fictional participants (21 assets).
- **Mock data files:** `ui/public/mock/catalog.json` (17 entries),
  `ui/public/mock/assets.json` (21 assets across 5 participants).

#### 15b — Graph ↔ Page Deep-Linking

- **Graph → Catalog:** L2 (HealthDCAT-AP) nodes link to
  `/catalog?search=<title>`.
- **Graph → Discover:** L3 (FHIR) nodes link to
  `/data/discover?search=<keyword>` with date-suffix stripping
  (`Encounter 1980-08-17` → `Encounter`).
- **Graph → Transfer:** L1 (Marketplace) nodes link to
  `/data/transfer?search=<label>`.
- **Catalog → Graph:** Each catalog card has a "View in Graph" link →
  `/graph?highlight=<title>`.
- **Discover → Graph:** Each HealthDCAT-AP card links to
  `/graph?highlight=<title>`.

#### 15c — Additional Datasets

- **MedDRA v27.0** — Medical Dictionary for Regulatory Activities
  terminology dataset added to catalog and assets.
- **Clinical Trial Phases I–IV** — Clinical trial phase classification
  dataset added to catalog and assets.

#### 15d — Suspense Boundary Fixes

- Wrapped `useSearchParams()` calls on catalog, discover, and graph pages
  with `<Suspense>` boundaries to prevent Next.js static-generation errors.

**Deliverables:** Mock fallback for catalog + assets APIs; bidirectional
graph deep-linking; 2 new datasets; Suspense fixes; E2E 69/69 passing.

---

### Phase 16: HealthDCAT-AP Display & Editor Integration ✅

**Goal:** Make HealthDCAT-AP metadata visible on the Discover page,
improve search matching for cross-page deep-links, and integrate a
full-featured HealthDCAT-AP metadata editor.

#### 16a — Discover Page: Dual Data Source & Keyword Search

The Discover page (`/data/discover`) previously only fetched EDC assets
from `/api/assets`. HealthDCAT-AP catalog entries were invisible.

**Changes:**

- **Dual data source:** Fetches both `/api/assets` AND `/api/catalog`
  via `Promise.all`. Page now shows EDC assets and HealthDCAT-AP entries.
- **Tab system:** "All" | "EDC Assets" | "HealthDCAT-AP" tabs with live
  counts. Users can filter by data source type.
- **Keyword-based search:** Replaced exact substring matching with
  `keywordMatch()` — splits query into words, filters date patterns
  (`\d{4}-\d{2}…`), matches if ANY keyword appears. Fixes deep-link
  searches like "Encounter 1980-08-17" → matches "Encounter" keyword.
- **HealthDCAT-AP cards:** Purple-themed cards with BookOpen icon,
  publisher, theme badge, expandable detail panel showing license, legal
  basis, conformsTo link, and record count. Action buttons: "View in
  Catalog" and "View in Graph".
- **Updated stats bar:** Shows "N participants · N EDC assets ·
  N HealthDCAT-AP datasets · N matching".

#### 16b — Graph Deep-Link Date Stripping

L3 (FHIR) node deep-links to Discover now strip date suffixes using
`label.replace(/\s+\d{4}-\d{2}.*$/, "")` — so "Encounter 1980-08-17"
becomes "Encounter" in the search parameter.

#### 16c — HealthDCAT-AP Editor

New page at `/catalog/editor` providing a form-based editor for creating
and editing HealthDCAT-AP metadata entries.

**Features:**

- **Browse tab:** Lists all existing catalog entries with edit/delete
  actions. Purple-themed cards show title, description, publisher, theme,
  dataset type, and record count.
- **Create/Edit tab:** Full form with 4 fieldset sections:
  - _DCAT-AP Mandatory:_ title, description, publisher, theme, language
  - _DCAT-AP Recommended:_ conformsTo, spatial coverage, license
  - _HealthDCAT-AP Extensions:_ dataset type, publisher type, legal basis,
    purpose, population coverage, health category, personal/sensitive data
    checkboxes
  - _Statistics:_ record count, unique individuals, min/max typical age
- **API support:** POST `/api/catalog` creates/updates entries in Neo4j
  (with mock JSON fallback). DELETE `/api/catalog?id=<id>` removes entries.
- **Deep-link support:** `?edit=<id>` opens an entry directly in edit mode.
- **Navigation:** Added to Explore group as "DCAT-AP Editor" (Edit3 icon)
  between "Dataset Catalog" and "Patient Journey".

**Files modified:**

- `ui/src/app/data/discover/page.tsx` — Major rewrite (dual fetch, tabs,
  keyword search, catalog cards)
- `ui/src/app/graph/page.tsx` — L3 deep-link date stripping
- `ui/src/app/api/catalog/route.ts` — Added POST and DELETE handlers
- `ui/src/app/catalog/editor/page.tsx` — New DCAT-AP Editor page
- `ui/src/components/Navigation.tsx` — Added DCAT-AP Editor link + Edit3
  icon import

**Deliverables:** HealthDCAT-AP metadata visible on Discover page; keyword
search for cross-page deep-links; tab-based data source filtering; full
DCAT-AP Editor with CRUD operations; Neo4j + mock JSON dual-write support.

---

### Phase 17: 50 User Journey E2E Tests ✅

**Goal:** Implement 50 comprehensive E2E user journey tests using Playwright,
organized into 10 categories (5 tests each), covering the full EHDS dataspace
lifecycle from identity onboarding through cross-border federated compliance.

**Context:** The Health Dataspace v2 portal supports 5 fictional participants
across 3 countries (DE, NL, FR) with 3 roles (DATA_HOLDER, DATA_USER, HDAB).
Tests validate both UI rendering and API-level data assertions. All journeys
are designed to work offline via mock data fallback — the same mock JSON files
used for GitHub Pages static export also serve as the API fallback when
EDC-V, Neo4j, and the CFM Tenant Manager are offline.

#### Participant Login Matrix

| Username   | Password   | Keycloak Role        | Organisation               | Country |
| ---------- | ---------- | -------------------- | -------------------------- | ------- |
| edcadmin   | edcadmin   | EDC_ADMIN            | System Administrator (all) | —       |
| clinicuser | clinicuser | EDC_USER_PARTICIPANT | AlphaKlinik Berlin         | DE      |
| regulator  | regulator  | HDAB_AUTHORITY       | MedReg DE                  | DE      |

**Note:** Keycloak login tests (`auth.spec.ts`) verify authentication for
all 3 users. Journey tests use the public API routes (no auth middleware)
and public pages for data assertions — this allows offline execution without
a live Keycloak instance.

#### Journey Categories (10 × 5 = 50 tests)

##### A · Identity & Participant Management (J01–J05)

| ID  | Title                                         | Type | Assertion                                        |
| --- | --------------------------------------------- | ---- | ------------------------------------------------ |
| J01 | Admin dashboard requires authentication       | UI   | `/admin` → redirect to `/auth/signin`            |
| J02 | All 5 participants registered in network      | API  | `/api/participants` returns ≥5 with known names  |
| J03 | Each participant has a valid DID identity     | API  | All DIDs match `^did:web:`                       |
| J04 | Credentials exist for all participant holders | API  | `/api/credentials` returns ≥5 with holder/type   |
| J05 | Both EHDS and DataQuality credential types    | API  | Credential types include both EHDS + DataQuality |

**Spec file:** `01-identity-onboarding.spec.ts`

##### B · Dataset Upload & Metadata Definition (J06–J15)

| ID  | Title                                         | Type | Assertion                                      |
| --- | --------------------------------------------- | ---- | ---------------------------------------------- |
| J06 | Synthea FHIR R4 Patient Cohort in catalog     | UI   | Card visible, click expands FHIR R4 metadata   |
| J07 | FHIR Encounter History has HealthDCAT-AP      | UI   | Card visible, click shows publisher/license    |
| J08 | FHIR Diagnostic Reports visible               | UI   | Card visible in catalog                        |
| J09 | Catalog API contains OMOP CDM dataset         | API  | Dataset ID `dataset:omop-cdm-v54-analytics`    |
| J10 | Dataset shows EHDS Article 53 legal basis     | UI   | Expand Synthea dataset → EHDS Art. 53 visible  |
| J11 | FHIR Immunization Records visible             | UI   | Card visible in catalog                        |
| J12 | Catalog cards expand with metadata details    | UI   | Click card → publisher field visible           |
| J13 | Catalog has ≥15 registered datasets           | API  | `/api/catalog` returns ≥15 entries             |
| J14 | Datasets include both Synthetic and RWD types | API  | At least one SyntheticData + one non-Synthetic |
| J15 | FHIR conformsTo URLs reference HL7            | API  | Datasets with `conformsTo` matching `hl7.org`  |

**Spec file:** `02-dataset-metadata.spec.ts`

##### C · Policy Definition & Catalog Offering (J16–J22)

| ID  | Title                                        | Type | Assertion                                       |
| --- | -------------------------------------------- | ---- | ----------------------------------------------- |
| J16 | Policies exist for multiple participants     | API  | `/api/admin/policies` returns ≥3 participants   |
| J17 | Policies include ODRL permission/prohibition | API  | First policy has `@type` or `policy.permission` |
| J18 | Policy page requires authentication          | UI   | `/admin/policies` → redirect to sign-in         |
| J19 | MedReg participant has registered policies   | API  | Identity includes `medreg`, policies ≥1         |
| J20 | Catalog page renders dataset cards publicly  | UI   | `/catalog` shows dataset cards without auth     |
| J21 | Catalog API has ≥15 registered datasets      | API  | Array length ≥15                                |
| J22 | At least one SyntheticData type dataset      | API  | Find `datasetType: "SyntheticData"` in catalog  |

**Spec file:** `03-policy-catalog.spec.ts`

##### D · Discovery & Federated Search (J23–J30)

| ID  | Title                                      | Type | Assertion                                           |
| --- | ------------------------------------------ | ---- | --------------------------------------------------- |
| J23 | Catalog page displays FHIR datasets        | UI   | `/catalog` shows text matching "FHIR"               |
| J24 | Catalog API includes datasets with titles  | API  | ≥10 datasets, ≥5 with titles                        |
| J25 | Clinical trial dataset exists in catalog   | API  | Find dataset with "Clinical Trial" in title         |
| J26 | Discover Data page requires authentication | UI   | `/data/discover` → redirect to sign-in              |
| J27 | Graph Explorer shows all 5 graph layers    | UI   | Marketplace, HealthDCAT-AP, FHIR R4, OMOP, Ontology |
| J28 | Graph canvas renders with FHIR + OMOP      | UI   | Canvas visible, layer labels present                |
| J29 | Patient Journey page shows patient cohort  | UI   | `/patient` heading + patient data loaded            |
| J30 | Federated catalog statistics available     | API  | `/api/federated` returns stats object               |

**Spec file:** `04-discovery-search.spec.ts`

##### E · Contract Negotiation (J31–J40)

| ID  | Title                                        | Type | Assertion                                            |
| --- | -------------------------------------------- | ---- | ---------------------------------------------------- |
| J31 | Negotiate page requires authentication       | UI   | `/negotiate` → redirect to sign-in                   |
| J32 | Tasks API includes negotiation entries       | API  | Tasks include `type: "negotiation"`                  |
| J33 | At least one negotiation is FINALIZED        | API  | Find `state: "FINALIZED"` among negotiations         |
| J34 | Negotiations exist for multiple participants | API  | ≥2 distinct participant names                        |
| J35 | Participant-scoped negotiations API works    | API  | GET `/api/negotiations?participantId=` returns array |
| J36 | Negotiations follow DSP protocol             | API  | `protocol` or `@type` field present                  |
| J37 | Assets API returns participant-scoped assets | API  | ≥3 entries with participantId + assets array         |
| J38 | Terminated negotiation exists                | API  | Find `state: "TERMINATED"` in tasks or negotiations  |
| J39 | Finalized negotiations include agreementId   | API  | FINALIZED negotiations have `contractAgreementId`    |
| J40 | Cross-border negotiation: different DIDs     | API  | counterPartyId ≠ participant identity                |

**Spec file:** `05-contract-negotiation.spec.ts`

##### F · Data Transfer & Viewing (J41–J48)

| ID  | Title                                         | Type | Assertion                                            |
| --- | --------------------------------------------- | ---- | ---------------------------------------------------- |
| J41 | Transfer page requires authentication         | UI   | `/data/transfer` → redirect to sign-in               |
| J42 | Share Data page requires authentication       | UI   | `/data/share` → redirect to sign-in                  |
| J43 | Tasks API includes transfer entries           | API  | Tasks include `type: "transfer"`                     |
| J44 | At least one in-progress transfer exists      | API  | Find STARTED/REQUESTING state                        |
| J45 | Transfers span at least 2 different states    | API  | ≥2 unique states among transfers                     |
| J46 | Audit API includes transfers/negotiations     | API  | `/api/admin/audit` returns transfer/negotiation data |
| J47 | Knowledge graph renders with clickable canvas | UI   | Canvas visible, click doesn't crash                  |
| J48 | Transfers involve multiple participants       | API  | ≥2 distinct participant names                        |

**Spec file:** `06-data-transfer.spec.ts`

##### G · Cross-Border & Federated Compliance (J49–J50)

| ID  | Title                                            | Type   | Assertion                                                              |
| --- | ------------------------------------------------ | ------ | ---------------------------------------------------------------------- |
| J49 | Cross-border journey: multi-country participants | API+UI | ≥3 unique DIDs, negotiations exist, graph renders                      |
| J50 | Compliance audit: credentials, policies, catalog | API    | 5 participants, EHDS credentials, ≥3 policy participants, ≥10 datasets |

**Spec file:** `07-cross-border-federated.spec.ts`

#### Test Architecture

```
ui/__tests__/e2e/journeys/
├── helpers.ts                         # Shared utilities
│   ├── PARTICIPANT_NAMES[]            # 5 fictional names
│   ├── T = 15_000                     # Default timeout
│   ├── navigateViaDropdown()          # Nav dropdown UI helper
│   ├── expectHeading()                # h1/h2 assertion
│   ├── expectSigninRedirect()         # Auth redirect check
│   ├── waitForDataLoad()              # Spinner wait
│   └── apiGet()                       # GET + assert 200
├── 01-identity-onboarding.spec.ts     # Group A: J01–J05
├── 02-dataset-metadata.spec.ts        # Group B: J06–J15
├── 03-policy-catalog.spec.ts          # Group C: J16–J22
├── 04-discovery-search.spec.ts        # Group D: J23–J30
├── 05-contract-negotiation.spec.ts    # Group E: J31–J40
├── 06-data-transfer.spec.ts           # Group F: J41–J48
└── 07-cross-border-federated.spec.ts  # Group G: J49–J50
```

#### Mock Data Fallback (Offline-First)

All 50 journey tests work without a live EDC-V, Neo4j, or Keycloak
instance. The following API routes include mock JSON file fallback:

| API Route             | Mock File                         | Fallback Chain                      |
| --------------------- | --------------------------------- | ----------------------------------- |
| `/api/participants`   | `public/mock/participants.json`   | EDC-V → CFM → **mock JSON**         |
| `/api/tasks`          | `public/mock/tasks.json`          | EDC-V → neo4j-proxy → **mock JSON** |
| `/api/admin/policies` | `public/mock/admin_policies.json` | EDC-V → Neo4j → **mock JSON**       |
| `/api/negotiations`   | `public/mock/negotiations.json`   | EDC-V → **merge with mock**         |
| `/api/catalog`        | `public/mock/catalog.json`        | Neo4j → **merge with mock**         |
| `/api/assets`         | `public/mock/assets.json`         | EDC-V → **merge with mock**         |
| `/api/credentials`    | `public/mock/credentials.json`    | EDC-V → **mock JSON**               |
| `/api/admin/audit`    | `public/mock/admin_audit.json`    | EDC-V → **mock JSON**               |

#### Running the Journey Tests

```bash
# Run all 50 journey tests
cd ui && npx playwright test __tests__/e2e/journeys/

# Run a specific group (e.g., Contract Negotiation)
npx playwright test __tests__/e2e/journeys/05-contract-negotiation.spec.ts

# Generate HTML report
npx playwright test --reporter=html

# View HTML report
npx playwright show-report
```

#### Protocol Coverage

| Protocol                   | Tests   | What's Verified                                                |
| -------------------------- | ------- | -------------------------------------------------------------- |
| DSP 2025-1                 | J32–J40 | Negotiation state machine, protocol field, contractAgreementId |
| DPS (Data Plane Signaling) | J43–J48 | Transfer states, HttpData-PULL, multi-participant              |
| DCP v1.0                   | J03–J05 | DID:web resolution, EHDS credentials                           |
| HealthDCAT-AP              | J06–J15 | Metadata fields, FHIR R4 conformance, legal basis              |
| ODRL                       | J16–J19 | Permission/prohibition, constraints, multi-participant         |

**Deliverables:** 50 journey E2E tests (120 total with smoke/nav/page/doc tests);
mock data fallback for 3 additional API routes; enhanced mock tasks.json with
multi-participant data; all tests pass offline (0 failures).

---

### Phase 18: Trust Center & Federated Pseudonym Resolution ✅

**Goal:** Implement a Trust Center service for cross-provider pseudonym
resolution, enabling longitudinal patient linkage across multiple data
holders without revealing real patient identities — the critical missing
piece for EHDS Art. 50 Secure Processing Environment compliance.

**Context — Community Feedback:**

This phase is inspired by community feedback from **Thomas Berlage
(Fraunhofer FIT)** on the project's
[LinkedIn article](https://www.linkedin.com/pulse/european-health-dataspaces-digital-twins-journey-fhir-buchhorn-roth-8t51c/).
Key insights:

- **PPMQ solves the wrong threat model** — In EHDS secondary use, the
  distrusted party is the researcher/CRO, not the data providers. Providers
  publishing to the same SPE are already under HDAB governance.
- **Trust Center is the missing piece** — A federated identity mediation
  layer under HDAB authority that maps provider-specific pseudonyms to
  shared research pseudonyms for longitudinal patient linkage.
- **SPE security model** — Trust is established through the HDAB governance
  chain + TEE hardware attestation, not through cryptographic MPC protocols.
- **German precedent** — RKI (Robert Koch Institute) is designated as the
  national trust center; the MII (Medical Informatics Initiative) community
  is evaluating integration with their brokerage service.

#### 18a: Trust Center Graph Schema & Neo4j Model ✅

1. Add Trust Center node type to the 5-layer graph schema:

```cypher
-- Layer 1 extensions for Trust Center
CREATE CONSTRAINT trust_center_name IF NOT EXISTS
  FOR (tc:TrustCenter) REQUIRE tc.name IS UNIQUE;

MERGE (tc:TrustCenter {
  name: "RKI Trust Center DE",
  operatedBy: "Robert Koch Institute",
  country: "DE",
  status: "active",
  protocol: "deterministic-pseudonym-v1"
})
```

2. Model pseudonym resolution relationships:

   - `(:TrustCenter)-[:GOVERNED_BY]->(:HDABApproval)`
   - `(:TrustCenter)-[:RESOLVES_PSEUDONYMS_FOR]->(:HealthDataset)`
   - `(:ResearchPseudonym)-[:LINKED_FROM]->(:ProviderPseudonym)`
   - `(:ResearchPseudonym)-[:USED_IN]->(:SPESession)`

3. Update `health-dataspace-graph-schema.md` with Layer 1 Trust Center
   extensions.

4. Add seed data for 2 Trust Centers (DE: RKI, NL: RIVM) in
   `scripts/generate-graph-seed.py`.

#### 18b: Pseudonym Resolution Protocol ✅

1. Design the pseudonym resolution API on the Neo4j Query Proxy:

   - `POST /trust-center/resolve` — Map provider pseudonyms → research
     pseudonym (HDAB-authenticated only)
   - `GET /trust-center/audit` — Resolution audit log
   - `DELETE /trust-center/revoke/{rpsn}` — Revoke a research pseudonym

2. Implement two resolution modes:

   - **Stateless** — Deterministic HMAC-based derivation (provider PSN +
     Trust Center key → research PSN). Fast, no storage, but irrevocable.
   - **Key-managed** — Stored mapping with per-dataset revocation. Requires
     PostgreSQL table but supports HDAB-initiated unlinkability.

3. Enforce access control: only HDAB-authority-scoped tokens can invoke
   resolution. Data Users never interact with the Trust Center directly.

#### 18c: SPE Security Model Refinement ✅

1. Replace mock SPE with a TEE attestation model:

   - `(:SPESession {attestation, approvedCodeHash, createdAt})`
   - SPE sessions are created by the HDAB, not the researcher.
   - Approved analytical code is hashed and attested before execution.

2. Enforce aggregate-only output policy:

   - Results leaving the SPE must pass k-anonymity threshold (k ≥ 5).
   - Individual-level data never exits the SPE boundary.

3. Add SPE session audit trail to the compliance dashboard.

#### 18d: Trust Center UI & Compliance Dashboard ✅

1. Add Trust Center section to `/compliance` page:

   - Trust Center status and governance chain
   - Active research pseudonym count
   - Resolution audit log (HDAB view only)

2. Add Trust Center nodes to the graph explorer (Layer 1):

   - Visual: Trust Center → HDAB → HealthDataset relationships
   - Clickable nodes with pseudonym resolution statistics

3. Update Cross-Border Federation view:
   - Show trust center mutual recognition status per country pair
   - Cross-border pseudonym resolution flow diagram

**Deliverables:** Trust Center graph schema + seed data; pseudonym
resolution API (stateless + key-managed modes); SPE attestation model;
compliance dashboard Trust Center section; cross-border trust center
mutual recognition.

**References:**

- Thomas Berlage (Fraunhofer FIT) — LinkedIn community discussion
- RKI as designated German trust center
- MII brokerage service integration evaluation
- EHDS Regulation Art. 50 (Secure Processing Environment)
- EHDS Regulation Art. 51 (Cross-Border Data Exchange)

---

### Phase 19: Role-Aware UI — Persona-Specific Navigation & Graph ✅

**Goal:** Every authenticated user sees only the navigation items, graph view,
and login context relevant to their EHDS role. Makes switching between test
personas fast and unambiguous.

**Context:**
The platform has 5 demo personas (edcadmin, clinicuser, lmcuser, researcher,
regulator) but the navigation always showed every menu item. After adding
6 persona-specific graph views (Phase 18d), the UX gap was clear: the
"View as" selector in the graph sidebar required knowing the persona IDs,
and the login page gave no guidance about which account does what.

#### 19a: Role constants and persona-derivation helpers ✅

New exports in `src/lib/auth.ts`:

- `Roles.DATA_HOLDER`, `Roles.DATA_USER`, `Roles.TRUST_CENTER_OPERATOR` — new
  sub-type constants alongside existing `EDC_ADMIN`, `EDC_USER_PARTICIPANT`,
  `HDAB_AUTHORITY`
- `ROLE_LABELS` — friendly display names (e.g. `EDC_ADMIN` → "Dataspace Admin")
- `DEMO_PERSONAS` — 5 demo user cards with username, org, roles, graph persona
  ID, and description
- `deriveParticipantType(roles, username)` — returns `DATA_HOLDER`,
  `DATA_USER`, `TRUST_CENTER_OPERATOR`, or `null`; checks explicit Keycloak
  roles first, then falls back to username pattern matching for the demo stack
- `derivePersonaId(roles, username)` — maps roles to graph persona ID
  (`edc-admin`, `hospital`, `researcher`, `hdab`, `trust-center`, `default`)

#### 19b: Enhanced UserMenu ✅

`src/components/UserMenu.tsx`:

- Nav bar chip shows username + role label badge (colour-coded per role)
- Dropdown shows role badges with friendly label + shield icon
- `displayRolesFor()` — hides `EDC_USER_PARTICIPANT` when a more specific
  sub-type (`DATA_HOLDER`, `DATA_USER`) is present
- **"My graph view"** deep-link in dropdown → `/graph?persona=<derived>`
  with one-line description of what that view shows
- Role-coloured border accent on dropdown panel
- Shield icon colour matches role (red=admin, amber=HDAB, blue=holder,
  green=researcher, violet=trust-center)

#### 19c: Role-aware Navigation ✅

`src/components/Navigation.tsx`:

- Each `NavLink` and `NavGroup` now has an optional `roles?: string[] | "AUTH"`
  field
- `filterGroup()` removes groups/items the user's role doesn't allow
- Anonymous users see: Explore (partial), Docs — all public items
- Patients (citizens) see: Explore (public items), My Health, Docs — no
  participant features (Get Started, Exchange, Governance, Manage)
- Dataspace participants see role-specific items from all groups

**Navigation groups per role:**

| Nav Group     | Roles                        | Graph Center         |
| ------------- | ---------------------------- | -------------------- |
| Explore       | Public (all)                 | Health Dataspace     |
| My Researches | DATA_USER                    | My Researches        |
| My Health     | PATIENT                      | My Health            |
| Governance    | HDAB_AUTHORITY, TRUST_CENTER | Govern the Dataspace |
| Exchange      | DATA_HOLDER, DATA_USER, all  | Our Data Offerings   |
| Manage        | EDC_ADMIN, HDAB_AUTHORITY    | Manage Dataspace     |
| Docs          | Public (all)                 | —                    |

**EHDS researcher workflow (My Researches menu — Art. 46–49):**

| Step | Route            | Label             | EHDS Article |
| ---- | ---------------- | ----------------- | ------------ |
| 1    | `/data/discover` | Discover Datasets | Art. 47      |
| 2    | `/negotiate`     | Request Access    | Art. 48      |
| 3    | `/tasks`         | My Applications   | Art. 49      |
| 4    | `/data/transfer` | Retrieve Data     | Art. 50      |
| 5    | `/analytics`     | Run Analytics     | Art. 50/53   |
| 6    | `/query`         | Query & Export    | Art. 50      |

**Menu items per role:**

| Route                    | Public | PATIENT | DATA_HOLDER | DATA_USER | HDAB | EDC_ADMIN |
| ------------------------ | ------ | ------- | ----------- | --------- | ---- | --------- |
| `/graph`                 | ✅     | ✅      | ✅          | ✅        | ✅   | ✅        |
| `/graph?persona=patient` | —      | ✅      | —           | —         | —    | —         |
| `/catalog`               | ✅     | ✅      | ✅          | ✅        | ✅   | ✅        |
| `/catalog/editor`        | —      | —       | ✅          | —         | —    | ✅        |
| `/patient`               | ✅     | ✅      | ✅          | ✅        | ✅   | ✅        |
| `/patient/profile`       | —      | ✅      | —           | —         | —    | —         |
| `/patient/research`      | —      | ✅      | —           | —         | —    | —         |
| `/patient/insights`      | —      | ✅      | —           | —         | —    | —         |
| `/analytics`             | —      | —       | —           | ✅        | ✅   | ✅        |
| `/query`                 | —      | —       | —           | ✅        | ✅   | ✅        |
| `/eehrxf`                | ✅     | ✅      | ✅          | ✅        | ✅   | ✅        |
| `/compliance`            | —      | —       | —           | —         | ✅   | ✅        |
| `/compliance/tck`        | —      | —       | —           | —         | ✅   | ✅        |
| `/credentials`           | —      | —       | ✅          | ✅        | ✅   | ✅        |
| `/data/share`            | —      | —       | ✅          | —         | —    | ✅        |
| `/data/discover`         | —      | —       | —           | ✅        | ✅   | ✅        |
| `/negotiate`             | —      | —       | ✅          | ✅        | —    | ✅        |
| `/tasks`                 | —      | —       | ✅          | ✅        | ✅   | ✅        |
| `/data/transfer`         | —      | —       | ✅          | ✅        | ✅   | ✅        |
| `/admin`                 | —      | —       | —           | —         | —    | ✅        |
| `/admin/components`      | —      | —       | —           | —         | —    | ✅        |
| `/admin/tenants`         | —      | —       | —           | —         | —    | ✅        |
| `/admin/policies`        | —      | —       | —           | —         | ✅   | ✅        |
| `/admin/audit`           | —      | —       | —           | —         | ✅   | ✅        |
| `/onboarding`            | —      | —       | ✅          | ✅        | ✅   | ✅        |
| `/settings`              | —      | —       | ✅          | ✅        | ✅   | ✅        |
| `/docs`                  | ✅     | ✅      | ✅          | ✅        | ✅   | ✅        |

Notes:

- **Patients are citizens, not dataspace participants** — EHDS Chapter II
  Art. 3-12 / GDPR Art. 15-22 gives them data-subject rights but not
  participant capabilities (onboarding, data exchange, contract negotiation)
- `DATA_HOLDER` / `DATA_USER` are derived from `EDC_USER_PARTICIPANT` + username
  pattern when explicit Keycloak sub-roles are absent (demo stack fallback)
- Route protection (redirects) remain in `middleware.ts` as before

#### 19d: Enhanced sign-in page with persona cards ✅

`src/app/auth/signin/page.tsx`:

- **Persona reference grid** below the Keycloak sign-in button
- 5 cards (edcadmin, clinicuser, lmcuser, researcher, regulator) each showing:
  - Keycloak username (mono font)
  - Organisation name
  - Role badge(s) with friendly label
  - One-line role description
  - Graph persona ID that will be opened after login
- Clicking a card calls `signIn("keycloak", { callbackUrl: /graph?persona=X })`
  so after authentication the user lands directly on their graph view
- Footer note: password = username, realm = EDCV

**Deliverables:** `auth.ts` role helpers; role-filtered Navigation; enhanced
UserMenu with persona deep-link; sign-in persona cards; 50/50 unit tests pass.

**References:**

- `docs/persona-journeys.md` — per-persona journey maps
- `docs/graph-explorer.md` — persona view API documentation
- Keycloak EDCV realm — 5 demo users with `realm_access.roles`

---

### Phase 20: Patient Portal — GDPR Art. 15-22 & EHDS Chapter II Primary Use ✅

**Goal:** Give patients (citizens) direct access to their own electronic health
data, the ability to donate it to research, and personalised insights from
studies they have contributed to — fully compliant with GDPR data-subject
rights and EHDS Chapter II primary-use rights.

---

#### Legal Basis — Why Patients Need This

**GDPR (Regulation 2016/679) — Data Subject Rights:**

| Article | Right                                                                   | Implementation                                         |
| ------- | ----------------------------------------------------------------------- | ------------------------------------------------------ |
| Art. 15 | Right of access — patients can request a copy of all personal data held | `/patient` timeline + `/api/patient/profile`           |
| Art. 16 | Right to rectification                                                  | Annotations via `HAS_ANNOTATION` edge                  |
| Art. 17 | Right to erasure ("right to be forgotten")                              | `DELETE /api/patient/consent/:id` revokes & anonymises |
| Art. 18 | Right to restriction of processing                                      | Consent revocation stops secondary-use data flow       |
| Art. 20 | Right to data portability — export in machine-readable (FHIR) format    | `GET /api/patient/export` → FHIR Bundle JSON           |
| Art. 22 | Right not to be subject to automated decision-making                    | Aggregate-only SPE output prevents profiling           |

**EHDS Regulation (2025/327) Chapter II — Primary Use:**

| Article | Right                                                                 | Implementation                            |
| ------- | --------------------------------------------------------------------- | ----------------------------------------- |
| Art. 3  | Right to access own EHR through MyHealth@EU or national contact point | Patient login → `/patient`                |
| Art. 4  | Right to request electronic copy of health data (FHIR format)         | `/api/patient/export` → FHIR R4 Bundle    |
| Art. 5  | Right to add corrections and annotations to own records               | Patient annotation on timeline entries    |
| Art. 6  | Right to opt out of secondary use OR consent to specific studies      | `/patient/research` consent management    |
| Art. 7  | Cross-border access via MyHealth@EU                                   | Future: European Health Data Space portal |
| Art. 10 | Consent for secondary use — opt in to specific research programs      | `PatientConsent` node + donation flow     |

**Answer to the question: YES.** Both GDPR and EHDS explicitly require patients
to have access to their data (primary use). EHDS Art. 3 creates a specific
right for natural persons to access their electronic health data through
national contact points. EHDS Art. 6 + 10 additionally give patients the right
to consent to secondary use (research) of their own data — or to opt out.

This is structurally different from secondary use (which is what the rest of
the platform implements): primary use is the patient's own view of their own
data; secondary use is de-identified/pseudonymised research analytics.

---

#### 20a: Patient Role & Demo Users ✅

New Keycloak role: `PATIENT` alongside existing roles.
New demo users (to be added to the EDCV realm):

| Username   | Organisation           | Role    | Graph persona |
| ---------- | ---------------------- | ------- | ------------- |
| `patient1` | AlphaKlinik Berlin     | PATIENT | `patient`     |
| `patient2` | Limburg Medical Centre | PATIENT | `patient`     |

**Changes required:**

- `src/lib/auth.ts` — add `Roles.PATIENT`, `ROLE_LABELS.PATIENT`, two demo personas
- `src/lib/graph-constants.ts` — add `patient` persona view
- `src/components/Navigation.tsx` — patient-only menu items
- `src/middleware.ts` — protect `/patient/*` for PATIENT role

**Menu items for PATIENT role:**

| Route                    | Public | PATIENT | Other roles |
| ------------------------ | ------ | ------- | ----------- |
| `/patient`               | ✅     | ✅      | ✅          |
| `/patient/profile`       | —      | ✅      | —           |
| `/patient/research`      | —      | ✅      | —           |
| `/patient/insights`      | —      | ✅      | —           |
| `/graph?persona=patient` | ✅     | ✅      | ✅          |
| `/catalog` (read-only)   | ✅     | ✅      | ✅          |
| `/docs`                  | ✅     | ✅      | ✅          |
| Everything else          | —      | ❌      | per role    |

#### 20b: Patient Health Profile ✅

**Route:** `/patient/profile?patientId=<id>`

**Features:**

- Personal health timeline summary (from existing `/patient` FHIR data)
- **Computed risk scores** from FHIR conditions (Cypher + clinical rules):
  - Cardiovascular risk (Framingham-inspired: age, conditions, medications)
  - Diabetes risk (HbA1c observations, ICD-10 E11)
  - Longevity interests and preventive care goals
- Personal interests: longevity, preventive screening, clinical trials
- GDPR Art. 15 access rights banner

**New API:** `GET /api/patient/profile?patientId=X`

```json
{
  "patient": { "id": "...", "name": "...", "gender": "...", "birthDate": "..." },
  "conditions": [{ "code": "...", "display": "...", "onsetDate": "..." }],
  "riskScores": {
    "cardiovascular": { "score": 0.23, "level": "moderate", "factors": [...] },
    "diabetes": { "score": 0.12, "level": "low" }
  },
  "interests": ["longevity", "preventive-care", "cardiology"]
}
```

#### 20c: Research Program Discovery & EHR Donation ✅

**Route:** `/patient/research`

**Features:**

- Browse research programs (DataProduct nodes with `purpose = RESEARCH`)
- Each program card shows: study name, institution, what data needed, duration
- **"Donate my EHR"** button → creates `PatientConsent` node
- Consent management: view active/revoked consents
- EHDS Art. 10 compliance: explicit, granular consent per study

**New Neo4j nodes:**

```cypher
CREATE CONSTRAINT patient_consent_id IF NOT EXISTS
  FOR (pc:PatientConsent) REQUIRE pc.consentId IS UNIQUE;
```

**New API routes:**

- `GET /api/patient/research` — list available programs with consent status
- `POST /api/patient/research/[id]/donate` — create PatientConsent node
- `DELETE /api/patient/research/[id]/revoke` — revoke consent (GDPR Art. 17)

**Graph relationships:**

```
(:Patient)-[:HAS_CONSENT]->(:PatientConsent)-[:FOR_STUDY]->(:DataProduct)
(:PatientConsent { consentId, patientId, studyId, purpose, grantedAt, revoked })
```

#### 20d: Research Insights Dashboard ✅

**Route:** `/patient/insights`

**Features:**

- Which studies are currently using donated data (anonymised — no pseudonym IDs)
- Anonymised aggregate findings from completed studies
- **Personalized medical recommendations** based on findings relevant to patient's conditions
- "Your data contributed to X findings in Y active studies"
- Deep-link to relevant medical examinations based on research results

**New API:** `GET /api/patient/insights?patientId=X`

```json
{
  "activeDonations": 2,
  "findings": [
    {
      "studyId": "...",
      "studyName": "T2D Cohort",
      "finding": "Metformin associated with 15% reduced cardiovascular risk",
      "relevance": "high",
      "recommendation": "Discuss cardiovascular screening with your physician",
      "ehdsArticle": "Art. 50"
    }
  ],
  "recommendations": [
    {
      "category": "cardiovascular",
      "action": "Annual HbA1c test",
      "priority": "high"
    }
  ]
}
```

**New Neo4j nodes:**

```cypher
(:ResearchInsight { insightId, studyId, finding, relevantConditions, recommendation })
```

#### 20e: OrbStack Kubernetes Deployment ✅

Deploy the full application to the local OrbStack k8s cluster for integrated
testing.

**Manifests:** `k8s/health-dataspace-ui.yaml`

```
Namespace: health-dataspace
ConfigMap: health-dataspace-config (env vars for Neo4j, Keycloak, etc.)
Deployment: health-dataspace-ui (1 replica, Next.js image)
Service: health-dataspace-ui (ClusterIP, port 3000)
Ingress: health-dataspace.orbstack.local
```

**Build and deploy commands:**

```bash
# Build Docker image
docker build --platform linux/amd64 -t health-dataspace-ui:latest ./ui

# Apply manifests to OrbStack
kubectl apply -f k8s/health-dataspace-ui.yaml

# Verify
kubectl -n health-dataspace get pods
```

**URL after deploy:** `http://health-dataspace.orbstack.local`

**Deliverables:** PATIENT role + demo users; patient health profile with risk
scores; research program discovery + EHR donation; research insights
dashboard; k8s manifests + OrbStack deployment.

**References:**

- GDPR Regulation 2016/679, Articles 15-22 (data subject rights)
- EHDS Regulation 2025/327, Chapter II Art. 3-12 (primary use — patient access)
- EHDS Regulation 2025/327, Art. 10 (consent for secondary use)
- `docs/persona-journeys.md` (patient journey)

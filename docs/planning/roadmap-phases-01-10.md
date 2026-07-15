# Roadmap — Phases 1–10

> Archived detail from the [Planning index](../planning-health-dataspace-v2.md).
> Infrastructure, identity, knowledge graph, dataspace integration, federated
> queries, UI portal, compliance, testing and early operational phases.
> All ✅ complete.

---

### Phase 1: Infrastructure Migration (JAD-Based) ✅

Phase 1 bootstraps the full EDC-V + DCore + CFM stack using the [JAD (Joint Architecture Demo)](https://github.com/Metaform/jad) as the reference deployment. JAD provides pre-built container images, Kubernetes manifests, and automated end-to-end tests — we adapt its infrastructure to serve the health dataspace domain.

#### 1a: JAD Local Deployment ✅

1. ~~Set up **KinD** (Kubernetes in Docker) cluster~~ → Deployed via **Docker Compose** (`docker-compose.jad.yml`) with all 18 services healthy, eliminating KinD dependency
2. Deploy JAD's 11 core services from **GHCR images** (`ghcr.io/ma3u/health-dataspace/*`, see ADR-6):
   - `controlplane` — EDC-V virtualized control plane (DSP + admin APIs)
   - `dataplane-fhir` / `dataplane-omop` — DCore HTTP data planes (ADR-2: dual data planes)
   - `identityhub` — DCP v1.0 credential storage and presentation
   - `issuerservice` — Verifiable Credential issuance (trust anchor)
   - `keycloak` — OAuth2/OIDC identity provider (PKCE flows)
   - `vault` — HashiCorp Vault for secret management (dev mode, HTTP)
   - `postgres` — Persistent storage for EDC-V state (7 databases)
   - `nats` — Event messaging bus (alpine image for healthcheck)
   - `tenant-manager` — Multi-tenant participant lifecycle (CFM)
   - `provision-manager` — Automated resource provisioning (CFM)
   - `cfm-agents` (4) — Keycloak, EDC-V, Registration, Onboarding agents
   - `neo4j-proxy` — Bridges DCore data planes ↔ Neo4j graph (ADR-2)
   - `traefik` — Reverse proxy / API gateway
3. Seed data initialized via `jad/seed-jad.sh`:
   - IssuerService: tenant `did:web:issuerservice%3A10016:issuer`, Membership + Manufacturer attestation/credential definitions
   - TenantManager: Cell + Dataspace Profile (deployed)
   - ProvisionManager: 5 ActivityDefinitions + OrchestrationDefinition (deploy + dispose workflows)
4. ~~Validate deployment with JAD's Bruno API collection (interactive testing)~~ → Superseded by automated TCK compliance tests (Phase 7) and 247-test CI suite (Phase 8)

#### 1b: Health-Specific Tenant Configuration ✅

4. Configure three tenant profiles via CFM Tenant Manager API:
   - **Clinic Riverside** (`clinic-riverside`) — data provider publishing FHIR R4 patient data ✅
   - **CRO TrialCorp** (`cro-trialcorp`) — data consumer requesting OMOP research queries ✅
   - **HDAB HealthGov** (`hdab-healthgov`) — intermediary operating HealthDCAT-AP catalog + SPE ✅
5. Configure CFM Provision Manager to automatically provision per-tenant: ✅
   - EDC-V control plane instance (participant-scoped DSP endpoint)
   - DCore data plane instance (FHIR HTTP transfer + query result streaming)
   - IdentityHub instance (DID:web document + credential wallet)
   - All 9 VPAs (3 per tenant) reached `active` state
6. Wire the existing **Neo4j Health Knowledge Graph** as a data source: ✅
   - Registered 4 data assets on Clinic's EDC-V (FHIR Patient, FHIR Cohort, OMOP Cohort, HealthDCAT-AP)
   - Registered 1 federated catalog asset on HDAB's EDC-V
   - Created access policies (open + membership-based) and contract definitions
   - Data addresses point to `neo4j-proxy:9090` internal endpoints
   - Scripts: `jad/seed-health-tenants.sh`, `jad/seed-data-assets.sh`

#### 1c: Docker Compose Development Profile ✅

7. Create `docker-compose.jad.yml` extending the existing `docker-compose.yml`:
   - Adds JAD services alongside Neo4j for **local development without KinD**
   - Maps JAD service ports to localhost (controlplane:11003, identityhub:11005, keycloak:8080)
   - Shares the `neo4j-data` Docker volume with the EDC-V data plane
   - Configures Traefik routing to match KinD Gateway API routes
8. Create `scripts/bootstrap-jad.sh` automation script:
   - Checks prerequisites (Docker, KinD or docker-compose)
   - Pulls latest JAD GHCR images
   - Initializes Keycloak realm with health-specific roles
   - Provisions the three tenant profiles via CFM API
   - Runs Neo4j schema initialization + Synthea data load
   - Validates end-to-end with JAD's E2E test suite

#### 1d: OpenAPI TypeScript Client Generation ✅

9. Generate typed TypeScript API clients from JAD's OpenAPI specifications:
   - **EDC-V Admin API** — participant management, data asset registration, policy CRUD
   - **EDC-V DSP API** — catalog queries, contract negotiation, transfer processes
   - **CFM Tenant Manager API** — tenant CRUD, provisioning status, lifecycle events
   - **CFM Provision Manager API** — provisioning triggers, status polling, resource inventory
   - **IdentityHub API** — DID resolution, credential storage, presentation exchange
   - **IssuerService API** — credential issuance requests, schema management
10. Use `openapi-typescript-codegen` or `openapi-generator-cli` with TypeScript-fetch template
11. Publish clients as `ui/src/lib/edc/` module for use by Next.js API routes and client components

**Deliverables:** Full EDC-V + CFM + DCore stack running locally; 3 health-specific tenants provisioned; OpenAPI TypeScript clients generated; existing Neo4j graph accessible via EDC-V data plane.

#### 1e: ADR-2 Implementation — Dual Data Planes + Neo4j Query Proxy ✅

12. Implement ADR-2 Docker Compose changes:
    - Renamed `dataplane` → `dataplane-fhir` (DCore PUSH, port 11002, `application/fhir+json`)
    - Added `dataplane-omop` (DCore PULL, port 11012, `application/json` / `text/csv`)
    - Added `neo4j-proxy` service (Node.js/Express, port 9090, bridges DCore ↔ Neo4j)
    - Added `dataplane_omop` PostgreSQL database to `jad/init-postgres.sql`
13. Scaffold Neo4j Query Proxy (`services/neo4j-proxy/`):
    - TypeScript/Express with `neo4j-driver`, multi-stage Docker build
    - 6 endpoints: FHIR `$everything` + cohort, OMOP cohort + timeline, HealthDCAT-AP catalog listing + detail
    - JSON-LD serialization with HealthDCAT-AP `@context` for catalog endpoints
    - Health check at `/health` verifying Neo4j connectivity

#### 1f: Phase 4a Prep — EDC-V Asset Registration + Vault Keys ✅

14. Created `jad/edcv-assets/` directory with EDC-V Management API payloads:
    - **FHIR Cohort Asset** (`fhir-cohort-asset.json`) — `HttpData` data address pointing to `neo4j-proxy:9090/fhir/Bundle`, content type `application/fhir+json`
    - **OMOP Analytics Asset** (`omop-analytics-asset.json`) — `HttpData` data address pointing to `neo4j-proxy:9090/omop/cohort`, content type `application/json`
    - **HealthDCAT-AP Catalog Asset** (`healthdcatap-catalog-asset.json`) — `HttpData` data address pointing to `neo4j-proxy:9090/catalog/datasets`, content type `application/ld+json`
15. Created **EHDS research access policy** (`policy-ehds-research-access.json`):
    - ODRL permission: `use` with EHDS Article 53 purpose constraint (research, public health, education, statistics)
    - 90-day temporal access limit from contract agreement date
    - k-anonymity ≥ 5 duty for all cohort queries
    - Prohibitions: re-identification, commercialization
16. Created **contract definitions** binding FHIR and OMOP assets to the EHDS research policy
17. Updated `jad/bootstrap-vault.sh` with RSA key pairs for both data planes:
    - `dataplane-fhir-public/private` — DPS token signing/verification for FHIR transfers
    - `dataplane-omop-public/private` — DPS token signing/verification for OMOP transfers
18. Updated `scripts/bootstrap-jad.sh`:
    - Phase 4 starts `dataplane-fhir` + `dataplane-omop` (was generic `dataplane`)
    - Phase 4b starts `neo4j-proxy` with health check
    - Updated service endpoints listing and port pre-flight checks

### Phase 2: Identity and Trust (DCP v1.0) ✅

Phase 2 implements the full DCP v1.0 credential lifecycle using JAD's IdentityHub and IssuerService, then adds EHDS-specific credential types.

#### 2a: DID:web and Verifiable Credential Setup ✅

5. **DID:web** identifiers auto-provisioned by CFM for each tenant (see ADR-7 for full architecture):
   - `did:web:alpha-klinik.de:participant` → AlphaKlinik Berlin (provider)
   - `did:web:pharmaco.de:research` → PharmaCo Research AG (consumer)
   - `did:web:medreg.de:hdab` → MedReg DE (operator)
   - `did:web:lmc.nl:clinic` → Limburg Medical Centre (provider)
   - `did:web:irs.fr:hdab` → Institut de Recherche Santé (operator)
   - Each DID document includes Ed25519 verification key, CredentialService endpoint, and DSP ProtocolEndpoint
   - DID documents served at `http://identityhub:7083/{participant-path}/did.json` (Docker-internal)
   - All 4 participant contexts ACTIVATED (state=300)
6. Configure the **IssuerService** as the trust anchor (simulating an EHDS-recognized authority):
   - Define credential schemas for `MembershipCredential` (dataspace membership attestation)
   - Configure Keycloak realm roles mapping to credential issuance policies
   - Set up credential revocation list (StatusList2021)
7. Implement the DCP **Credential Issuance** flow:
   - Participant registers via onboarding portal → CFM creates tenant → IssuerService issues `MembershipCredential`
   - IdentityHub stores issued credentials and exposes DID document at `/{participant-path}/did.json` on port 7083

#### 2b: EHDS-Specific Credential Types ✅

8. Define and register EHDS health domain credentials: ✅
   - `EHDSParticipantCredential` — proof of HDAB registration (issued to Clinics and CROs by the HDAB)
   - `DataProcessingPurposeCredential` — EHDS Article 53 permitted purpose attestation (research, public health, etc.)
   - `DataQualityLabelCredential` — attests to data quality metrics (completeness, conformance to EEHRxF)
   - **IssuerService registration:** 3 credential definitions + 2 attestation types via `jad/seed-ehds-credentials.sh`
     - `ehds-membership-attestation` (type: membership) → `ehds-participant-credential-def` (365-day validity)
     - `ehds-membership-attestation` → `data-processing-purpose-credential-def` (90-day validity)
     - `ehds-manufacturer-attestation` (type: manufacturer) → `data-quality-label-credential-def` (180-day validity)
   - **Neo4j Layer 1b:** 5 `VerifiableCredential` nodes on SPE-1 via `neo4j/register-ehds-credentials.cypher`:
     - `vc:ehds-participant:alpha-klinik` (DataHolder) → HOLDS_CREDENTIAL → AlphaKlinik Berlin
     - `vc:ehds-participant:pharmaco-research` (DataUser) → HOLDS_CREDENTIAL → PharmaCo Research AG
     - `vc:ehds-participant:medreg-de` (HealthDataAccessBody) → HOLDS_CREDENTIAL → MedReg DE
     - `vc:data-processing-purpose:pharmaco-research` (Art 53 research) → HOLDS_CREDENTIAL → PharmaCo Research AG
     - `vc:data-quality-label:alpha-klinik` (95%/92%/98%) → ATTESTS_QUALITY → HealthDataset
   - **DCP scopes:** 3 EHDS credential scopes added to controlplane via `docker-compose.jad.yml`
   - **Note:** IssuerService only supports compiled-in attestation types (`membership`, `manufacturer`). EHDS credentials are mapped to these. Credential issuance is DCP-protocol only (via IdentityHub CredentialRequestMessage during DSP negotiation), not admin API.
9. Implement DCP **Credential Presentation** during DSP contract negotiation: ✅ (infrastructure ready)
   - CRO presents `EHDSParticipantCredential` + `DataProcessingPurposeCredential` to Clinic's EDC-V
   - Clinic's EDC-V validates credentials via IdentityHub before proceeding with contract agreement
   - Policy engine uses **CEL (Common Expression Language)** rules (as used by JAD) to evaluate credential claims
   - DCP scopes configured: `ehds-participant`, `data-processing-purpose`, `data-quality-label`
10. Add credential verification to the **Compliance UI** (`/compliance`): ✅
    - Display VC trust section with credential cards showing status (active/expired), participant role, type-specific details
    - Show trust chain: IssuerService → IdentityHub → Credential Presentation → Policy Evaluation
    - DCP trust chain visualization diagram in Compliance page

#### 2c: Keycloak SSO Integration ✅

11. Configure **Keycloak** for unified authentication across all portals: ✅
    - Extended existing `edcv` realm with SSO client `health-dataspace-ui` (confidential + PKCE S256)
    - PKCE authorization code flow for browser-based login (follows Aruba portal's pattern)
    - Service account flow for backend-to-backend API calls (existing `admin` + `provisioner` clients)
    - Role mapping: `EDC_ADMIN` (operator), `EDC_USER_PARTICIPANT` (clinic/CRO user), `HDAB_AUTHORITY` (regulator)
    - Demo users: `edcadmin`, `clinicuser`, `regulator` with respective roles
    - Provisioning script: `scripts/provision-keycloak-sso.sh` (idempotent)
12. Integrate **NextAuth.js** with Keycloak provider in the Next.js app: ✅
    - NextAuth.js v4 with custom OAuth provider (split endpoints: browser→localhost:8080, server→keycloak:8080)
    - JWT sessions with realm_access roles from Keycloak tokens
    - Role-based route protection via Next.js middleware: `/admin/*` → `EDC_ADMIN`, `/compliance` → `HDAB_AUTHORITY`
    - UserMenu component in navigation showing session, roles, sign-in/sign-out
    - Custom sign-in page (`/auth/signin`) and unauthorized page (`/auth/unauthorized`)
    - UI container connected to `health-dataspace-edcv` Docker network for server-side Keycloak access

**Deliverables:** DID:web identifiers for all participants; EHDS-specific VCs issued and stored; credential presentation integrated into DSP negotiation; Keycloak SSO protecting all UI views.

### Phase 3: Health Knowledge Graph Layer ✅

8. Deploy Neo4j with the [5-layer health graph schema](health-dataspace-graph-schema.md)
9. Implement **FHIR-to-Graph ingestion** pipeline:
   - Generate synthetic patient data with [Synthea](https://github.com/synthetichealth/synthea)
   - Load FHIR Bundles via CyFHIR into Neo4j
   - Create `CODED_BY` relationships to SNOMED CT / LOINC ontology nodes via neosemantics
10. Implement **HealthDCAT-AP metadata** layer:
    - Register datasets as HealthDCAT-AP RDF triples using rdflib-neo4j
    - Expose metadata via the EDC-V Federated Catalog extension
11. Implement **FHIR → OMOP transformation** pipeline for secondary use analytics

### Phase 3b: Real FHIR Data Pipeline ✅

Scripts in `scripts/` automate the full pipeline:

1. **Generate cohort** — `scripts/generate-synthea.sh [N]`
   - Downloads Synthea JAR (v3.3.0) on first run
   - Generates N patients (default 50) using all Synthea modules (chronic conditions emerge naturally)
   - Outputs FHIR R4 JSON bundles to `neo4j/import/fhir/`
2. **Load into Neo4j** — `python3 scripts/load_fhir_neo4j.py`
   - UNWIND bulk upserts: 1 Cypher call per resource type per bundle (handles 37K+ observations efficiently)
   - Parses: `Patient`, `Encounter`, `Condition`, `Observation`, `MedicationRequest`
   - Creates `CODED_BY` links to SNOMED CT / LOINC / RxNorm concepts; links patients to `HealthDataset`
3. **FHIR → OMOP transform** — `neo4j/fhir-to-omop-transform.cypher`
   - Creates: `OMOPPerson`, `OMOPVisitOccurrence`, `OMOPConditionOccurrence`, `OMOPMeasurement`, `OMOPDrugExposure`
   - Adds `MAPPED_TO` (FHIR → OMOP) and `CODED_BY` (OMOP → SNOMED/LOINC/RxNorm) relationships

**Current graph state (100-patient Synthea cohort, Massachusetts):**

| Layer 3 FHIR      | Count  | Layer 4 OMOP            | Count  |
| ----------------- | ------ | ----------------------- | ------ |
| Patient           | 167\*  | OMOPPerson              | 167    |
| Encounter         | 5,461  | OMOPVisitOccurrence     | 5,461  |
| Condition         | 2,421  | OMOPConditionOccurrence | 2,421  |
| Observation       | 37,713 | OMOPMeasurement         | 34,203 |
| MedicationRequest | 3,895  | OMOPDrugExposure        | 3,895  |
| Procedure         | 8,534  | OMOPProcedureOccurrence | 8,534  |

_\* 167 includes deceased patients generated by Synthea alongside the 100 living target patients._

The Graph Explorer UI (`/graph` and `/patient`) immediately reflects the real patient data.

### Phase 3c: HealthDCAT-AP Metadata Registration ✅

The Synthea cohort loaded in Phase 3b needs a corresponding **Layer 2** catalog entry so EDC-V can expose it as a discoverable data asset. This is implemented as an idempotent Cypher script:

- `neo4j/register-fhir-dataset-hdcatap.cypher` — creates/updates the `HealthDataset` node with full HealthDCAT-AP properties (title, description, publisher, temporal coverage, spatial coverage, themes, access conditions)
- Links the dataset to all 167 `Patient` nodes via `FROM_DATASET`
- Registers `Distribution` nodes (Bolt + REST + DCore HTTP endpoints) so EDC-V can reference the access URL
- Adds EHDS purpose restriction annotation (Article 53 permitted purposes)

### Phase 3d: README and UI Completeness Hardening ✅

With Phases 3–3c forming a working end-to-end local stack (Synthea → Neo4j → OMOP → HealthDCAT-AP → UI), the documentation and UI were brought to match:

**README (`README.md`):**

- Corrected step numbering (Phase 3b → Step 9, Phase 3c → Step 10, UI → Step 11)
- Removed stale “Type 2 Diabetes cohort” reference — all Synthea modules now run
- Added Phase 3c CLI invocation and expected outcome
- Added new `register-fhir-dataset-hdcatap.cypher` to the directory structure listing
- Added expected row-count table for the 50-patient cohort

**Dataset Catalog UI (`/catalog`):**

- Card now shows `datasetType` badge (e.g. `SyntheticData`)
- Card footer shows `legalBasis` in green (mapped to human-readable label, e.g. “EHDS Art. 53”)
- Card footer shows `recordCount` (patient count from live Neo4j graph)
- Filter now also searches `description` text

### Phase 3e: DSP Marketplace Registration + Compliance Chain ✅

With the Synthea FHIR dataset registered in HealthDCAT-AP (Phase 3c), Phase 3e wires the full Layer 1 DSP marketplace chain and fixes the EHDS compliance checker UI.

**DSP Marketplace Cypher (`neo4j/register-dsp-marketplace.cypher`):**

- MERGEs three Participants: `Riverside General` (CLINIC), `TrialCorp Research` (CRO), `HealthGov` (HDAB)
- Creates `DataProduct {productId: 'product-synthea-fhir-r4-2026'}` → `[:DESCRIBED_BY]` → `HealthDataset {datasetId: 'dataset:synthea-fhir-r4-mvd'}`
- Creates `OdrlPolicy` with EHDS Art.53 `researchPurpose` permission and re-identification `prohibition`
- Creates `Contract` → `[:GOVERNS]` → DataProduct
- Creates `AccessApplication` (status: `APPROVED`) and `HDABApproval` with relationships:
  - `[:APPROVES]` → AccessApplication
  - `[:APPROVED]` → Contract
  - `[:GRANTS_ACCESS_TO]` → HealthDataset ← key relationship enabling compliance check
- Verification RETURN confirms full chain: consumer, applicationStatus, approvalId, EHDS article, dataset

**Compliance API (`ui/src/app/api/compliance/route.ts`):**

- Added list mode (no query params → returns `{consumers, datasets}` for UI dropdowns)
- Fixed participant lookup: `coalesce(participantId, id) = $consumerId`
- Fixed chain path: `(approval:HDABApproval)-[:APPROVES]->(app)` then `(approval)-[:GRANTS_ACCESS_TO]->(dataset)`
- Fixed contract path: `Contract -[:GOVERNS]-> DataProduct -[:DESCRIBED_BY]-> HealthDataset`

**Compliance UI (`ui/src/app/compliance/page.tsx`):**

- Replaced static text inputs with dropdowns populated from live graph
- Shows consumer name + participantId, dataset title + id
- Result table adds `Contract` column alongside Application / Approval / EHDS Article

### Phase 3f: OMOP Research Analytics View ✅

With five Neo4j OMOP CDM layers populated (Phase 3b), Phase 3f adds a cohort-level research analytics view demonstrating EHDS Article 53 secondary use.

**Analytics API (`ui/src/app/api/analytics/route.ts`):**

- Queries five OMOP node types in parallel: `OMOPPerson`, `OMOPConditionOccurrence`, `OMOPDrugExposure`, `OMOPMeasurement`, `OMOPVisitOccurrence`
- Returns summary counts, top-15 conditions/drugs/measurements by occurrence, and gender breakdown
- Uses `Promise.all` for parallel Neo4j queries

**Analytics UI (`ui/src/app/analytics/page.tsx`):**

- Five stat cards (patients, conditions, drugs, measurements, visits)
- Gender distribution breakdown with percentages
- Three horizontal bar chart sections: Top Conditions, Top Drug Exposures, Top Measurements
- Colour-coded by graph layer: Layer 3 (teal) for conditions, Layer 4 (purple) for drugs, Layer 5 (orange) for measurements

**Navigation:** Added `/analytics` (OMOP Analytics) as fifth nav item with `BarChart2` icon.

### Phase 3g: Procedure Pipeline + UI Polish ✅

Synthea generates ~43 Procedure resources per patient (96% SNOMED CT, 4% ADA CDT) that were previously dropped during FHIR ingestion. Phase 3g closes this gap across the full pipeline.

**FHIR Loader (`scripts/load_fhir_neo4j.py`):**

- Added `UPSERT_PROCEDURES` and `LINK_PROCEDURES_SNOMED` bulk Cypher templates
- Parses Procedure resources: id, code, display, system, performedStart, performedEnd, status
- Creates `(:Patient)-[:HAS_PROCEDURE]->(:Procedure)` and `(:Procedure)-[:CODED_BY]->(:SnomedConcept)` relationships
- Result: 8,534 Procedure nodes upserted from 66 bundles

**Schema (`neo4j/init-schema.cypher`):**

- `CREATE CONSTRAINT procedure_id` (uniqueness)
- `CREATE INDEX procedure_code` (lookup)
- `CREATE CONSTRAINT omop_procedure_occurrence_id` (uniqueness)
- `CREATE INDEX omop_procedure_concept` (lookup)

**OMOP Transform (`neo4j/fhir-to-omop-transform.cypher`):**

- Section 6: `(:Procedure) → (:OMOPProcedureOccurrence)` with `(:OMOPPerson)-[:HAS_PROCEDURE_OCCURRENCE]->` relationships
- SNOMED vocabulary bridge: `(:OMOPProcedureOccurrence)-[:CODED_BY]->(:SnomedConcept)` — 7,768 links
- Result: 8,534 OMOPProcedureOccurrence nodes created

**UI Changes:**

- Home page: Added Analytics card (5th navigation tile)
- Graph explorer: Added Procedure (Layer 3) and OMOPProcedureOccurrence (Layer 4) to force-directed graph
- Analytics dashboard: Added Procedures stat card + Top Procedures bar chart; grid changed to 6-column
- Patient journey: Added Procedures stat badge (6 badges); Procedure events in timeline with purple (#7D3C98) colour

**Updated Node Counts:**

| FHIR Layer (3)    | Count     | OMOP Layer (4)              | Count     |
| ----------------- | --------- | --------------------------- | --------- |
| Patient           | 167       | OMOPPerson                  | 167       |
| Encounter         | 5,461     | OMOPVisitOccurrence         | 5,461     |
| Condition         | 2,421     | OMOPConditionOccurrence     | 2,421     |
| Observation       | 37,713    | OMOPMeasurement             | 34,203    |
| MedicationRequest | 3,895     | OMOPDrugExposure            | 3,895     |
| **Procedure**     | **8,534** | **OMOPProcedureOccurrence** | **8,534** |

### Phase 3h: EEHRxF FHIR Profile Alignment ✅

The **European Electronic Health Record Exchange Format (EEHRxF)** was established by [Commission Recommendation C(2019)800](https://digital-strategy.ec.europa.eu/en/library/recommendation-european-electronic-health-record-exchange-format) of 6 February 2019. The [EHDS Regulation](https://health.ec.europa.eu/ehealth-digital-health-and-care/european-health-data-space_en) (entered into force 26 March 2025) elevates EEHRxF as the standard exchange format for 6 priority categories of electronic health data, with phased rollout:

| #   | Priority Category              | EHDS Deadline | Group |
| --- | ------------------------------ | ------------- | ----- |
| 1   | Patient Summaries              | March 2029    | 1     |
| 2   | ePrescriptions / eDispensation | March 2029    | 1     |
| 3   | Laboratory Results             | March 2031    | 2     |
| 4   | Hospital Discharge Reports     | March 2031    | 2     |
| 5   | Medical Images / Reports       | March 2031    | 2     |
| 6   | Rare Disease Registration      | TBD           | 3     |

**HL7 Europe** publishes FHIR R4 Implementation Guides that provide the technical specifications for EEHRxF, supported by the **Xt-EHR Joint Action** for EHDS alignment:

| Implementation Guide               | Package                          | FHIR | Status  | URL                                       |
| ---------------------------------- | -------------------------------- | ---- | ------- | ----------------------------------------- |
| Base and Core Profiles             | `hl7.fhir.eu.base#0.1.0`         | R4   | STU 1.0 | https://hl7.eu/fhir/base/                 |
| Laboratory Report                  | `hl7.fhir.eu.laboratory#0.1.1`   | R4   | STU 1.1 | https://hl7.eu/fhir/laboratory/           |
| Hospital Discharge Report          | `hl7.fhir.eu.hdr#1.0.0-ci-build` | R4   | Ballot  | https://build.fhir.org/ig/hl7-eu/hdr/     |
| Medication Prescription & Dispense | `hl7.fhir.eu.mpd`                | R4   | Ballot  | https://build.fhir.org/ig/hl7-eu/mpd/     |
| Imaging Study Report               | `hl7.fhir.eu.imaging`            | R5   | Ballot  | https://build.fhir.org/ig/hl7-eu/imaging/ |
| Extensions                         | `hl7.fhir.eu.extensions#0.1.0`   | R4   | STU 1.2 | https://hl7.eu/fhir/extensions/           |

**Implementation scope:** Phase 3h adds `EEHRxFProfile` and `EEHRxFCategory` nodes to the knowledge graph, maps them to existing FHIR resources, and provides a gap analysis showing which priority categories the current Synthea data partially or fully covers.

**Graph Schema Additions:**

- `EEHRxFCategory` — EHDS priority category (Patient Summary, Lab Results, etc.)
- `EEHRxFProfile` — HL7 Europe FHIR profile (PatientEuCore, DiagnosticReportLabEu, etc.)
- `(:EEHRxFProfile)-[:PART_OF_CATEGORY]->(:EEHRxFCategory)` — profile → category
- `(:EEHRxFProfile)-[:PROFILES_RESOURCE]->(resource)` — profile → FHIR resource type in graph

**Cypher Script (`neo4j/register-eehrxf-profiles.cypher`):**

- Creates 6 EEHRxFCategory nodes (one per EHDS priority)
- Creates EEHRxFProfile nodes for the 14 key HL7 Europe profiles across all published IGs
- Maps profiles to existing FHIR resource types via `PROFILES_RESOURCE` relationships
- Calculates coverage status per category based on available FHIR data

**EEHRxF API (`ui/src/app/api/eehrxf/route.ts`):**

- Returns all categories with profile coverage (profiles, matched resource counts, coverage %)
- Returns individual profile details with gap analysis (required vs present fields)

**EEHRxF UI (`ui/src/app/eehrxf/page.tsx`):**

- Priority category cards with EHDS deadline badges and coverage indicators
- Profile-level detail showing which FHIR resources match each EU profile
- EHDS implementation timeline visualization (2025 → 2031)
- Gap analysis highlighting missing resources (e.g., DiagnosticReport, ImagingStudy)

### Phase 4: Dataspace Integration (EDC-V ↔ Neo4j) ✅

Phase 4 wires the Neo4j health knowledge graph into the live EDC-V data plane, enabling full DSP contract negotiation and credentialed data access.

#### 4a: Data Asset Registration ✅

12. Register Neo4j data assets on the Clinic's EDC-V instance via the generated TypeScript Admin API client:
    - **FHIR Cohort Asset** — Cypher query endpoint returning FHIR R4 patient bundles
    - **OMOP Analytics Asset** — Cypher query endpoint returning OMOP CDM aggregated results
    - **HealthDCAT-AP Catalog Asset** — Metadata endpoint for federated catalog discovery
13. Define **ODRL usage policies** per asset:
    - EHDS purpose restriction (Article 53 permitted purposes array)
    - Temporal access limits (e.g., 90-day research window)
    - Anonymization requirements (k-anonymity threshold for cohort queries)
    - Re-identification prohibition (as currently modeled in `OdrlPolicy` graph nodes)

#### 4b: Contract Negotiation Flow ✅

14. Implement end-to-end DSP contract negotiation (see ADR-7 for full architecture):
    - CRO discovers FHIR Cohort Asset via DSP catalog request to Clinic's control plane
    - CRO initiates `ContractNegotiation` request against `fhir-patient-everything` asset
    - Contract FINALIZED → `TransferProcess` initiated with `HttpData-PULL` transfer type → state STARTED
15. **Executed contract negotiation results (PharmaCo Research AG → AlphaKlinik Berlin):**
    - 3 FINALIZED negotiations with contract agreement IDs assigned
    - 1 transfer process in STARTED state (data plane endpoint provisioned)
    - 2 earlier TERMINATED negotiations (protocol errors before root cause fixes — see notes below)
    - Clinic provider-side: 3 matching FINALIZED negotiations confirming bilateral agreement
16. Capture contract lifecycle events in Neo4j provenance graph (Phase 4d):
    - `(:Contract)-[:NEGOTIATED_BY]->(:Participant)` with timestamps
    - `(:TransferProcess)-[:GOVERNED_BY]->(:Contract)` linking data flows to legal basis

**Automation Script:** `jad/seed-contract-negotiation.sh` — idempotent script performing:

1. Data plane registration for CRO participant
2. Catalog discovery (CRO → Clinic)
3. Contract negotiation + transfer initiation loop
4. HDAB operator catalog visibility check
5. Final state verification

#### 4c: Federated Catalog with HealthDCAT-AP ✅

16. ~~Configure HDAB's EDC-V **Federated Catalog** extension:~~
    - ✅ Clinic publishes HealthDCAT-AP dataset descriptions to DSP catalog (4 assets)
    - ✅ CRO discovers available cohorts via DSP catalog request protocol (4 datasets)
    - ✅ HDAB discovers available datasets via DSP catalog request protocol (4 datasets)
    - ✅ HDAB negotiates contract for `healthdcatap-catalog` metadata asset → FINALIZED
    - ✅ HDAB initiates HttpData-PULL transfer for catalog metadata → STARTED
    - Automation script: `jad/seed-federated-catalog.sh`
17. Expose Federated Catalog via the `/catalog` UI view (extending Phase 6a):
    - Live catalog queries via EDC-V DSP API (replacing mock data in production mode)
    - Show dataset provenance: publisher participant + access conditions + credential requirements

> **Federated Catalog Results (Phase 4c):**
>
> | Consumer       | Provider       | Discovery  | Negotiation                                                                       | Transfer                |
> | -------------- | -------------- | ---------- | --------------------------------------------------------------------------------- | ----------------------- |
> | CRO Bayer      | Clinic Charité | 4 datasets | 3 FINALIZED (fhir-patient-everything, fhir-cohort-bundle, omop-cohort-statistics) | 1 STARTED               |
> | HDAB BfArM     | Clinic Charité | 4 datasets | 1 FINALIZED (healthdcatap-catalog)                                                | 1 STARTED               |
> | Clinic Charité | (provider)     | —          | 4 FINALIZED (provider-side)                                                       | 2 STARTED + 2 REQUESTED |
>
> **Discoverable Assets via DSP 2025-1:**
>
> 1. `fhir-patient-everything` — FHIR R4 Patient/$everything (Neo4j Layer 3)
> 2. `fhir-cohort-bundle` — FHIR R4 Cohort Search Bundle (Neo4j Layer 3)
> 3. `omop-cohort-statistics` — OMOP CDM Cohort Statistics (Neo4j Layer 4)
> 4. `healthdcatap-catalog` — HealthDCAT-AP Dataset Catalog JSON-LD (Neo4j Layer 2)

#### 4d: Data Plane Transfer via DCore ✅

18. ~~Configure DCore Rust data plane for FHIR transfer:~~
    - HTTP pull transfer with Ed25519 JWT bearer tokens (Endpoint Data References)
    - Data Plane Signaling (DPS) coordination between control plane and data plane
    - Transfer audit log: `(:TransferEvent)-[:ACCESSED]->(HealthDataset)` stored in Neo4j
19. ~~Implement query result proxying:~~
    - DCore data plane proxies requests to Neo4j Query Proxy (port 9090)
    - Neo4j Query Proxy translates HTTP → Cypher, returns FHIR R4 / HealthDCAT-AP JSON-LD
    - Query parameters (`_count`, `gender`, `name`) proxied through data plane
    - Added `GET /fhir/Patient` search route to neo4j-proxy for data plane base URL

**Phase 4d Results:**

| Metric                  | Value                                                          |
| ----------------------- | -------------------------------------------------------------- |
| FHIR patients via DCore | 100 (CRO Bayer → data plane → neo4j-proxy → Neo4j)             |
| HealthDCAT-AP datasets  | 2 (HDAB BfArM → data plane → neo4j-proxy → Neo4j)              |
| Auth mechanism          | Ed25519 JWT (kid=`dataplane-fhir-private`, alg=`Ed25519`)      |
| Data flow               | Consumer → DCore Data Plane → Neo4j Query Proxy → Neo4j KG     |
| Audit events in Neo4j   | TransferEvent nodes with timestamp, endpoint, resultCount      |
| Query param proxying    | ✅ `_count`, `gender`, `name` forwarded via `proxyQueryParams` |
| Automation script       | `jad/seed-data-transfer.sh`                                    |

**Deliverables:** Neo4j assets registered in EDC-V ✅; DSP contract negotiation working end-to-end ✅; Federated Catalog exposing HealthDCAT-AP metadata via DSP ✅; DCore handling FHIR + catalog transfers with audit trail ✅.

> **Root Causes Discovered (Phase 4b):**
>
> 1. Contract definition `operandLeft` must use full URI `https://w3id.org/edc/v0.0.1/ns/id`, not `@id`
> 2. Participant contexts must be ACTIVATED (state=300) for DID document serving; CFM creates them as CREATED (200)
> 3. Protocol string must be `dataspace-protocol-http:2025-1` (with version suffix), not `dataspace-protocol-http`
> 4. Data plane hostname must match docker-compose service name (`dataplane-fhir`, not `dataplane`)

> **Root Cause Discovered (Phase 4d):**
>
> 5. Neo4j Query Proxy lacked a `GET /fhir/Patient` base route — the data plane's `baseUrl` pointed to `/fhir/Patient` but only `/fhir/Patient/:id/$everything` existed. Added search route returning FHIR R4 searchset Bundle.

### Phase 5: Federated Queries and GraphRAG ✅

Implements application-layer federation across multiple Neo4j Secure Processing Environments (SPEs) and a natural language query (Text2Cypher) interface — using Neo4j Community Edition without Composite Database.

#### 5a: Second Neo4j SPE ✅

- Added `neo4j-spe2` Docker service (ports 7475/7688, `federated` profile)
- Independent data partition: 37 patients, 2,076 encounters, 1,118 conditions, 16,702 observations, 1,485 medication requests, 3,689 procedures
- Seeded via `scripts/seed-spe2.sh` with `--start-index 33` (second half of Synthea bundles)
- OMOP CDM transform applied: 33 OMOP persons, 2,076 visits, 1,118 condition occurrences, 15,138 measurements, 1,485 drug exposures, 3,689 procedure occurrences
- HealthDCAT-AP metadata registered (`register-fhir-dataset-hdcatap-spe2.cypher`): 1 dataset, 3 distributions, EHDS Art 53 purpose
- EEHRxF profiles registered: 6 categories, 12 profiles (same vocabulary as SPE-1)

#### 5b: Federated Query Dispatch ✅

Application-layer federation in `neo4j-proxy` (simulates Composite Database on Community Edition):

| Endpoint                | Method | Description                                                                                                                              |
| ----------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /federated/query` | POST   | Dispatches read-only Cypher to all SPEs in parallel; merges results with `_source` labels; supports k-anonymity filtering (`minK` param) |
| `GET /federated/stats`  | GET    | Aggregate statistics across all SPEs (patients, encounters, conditions, observations, top conditions, gender breakdown)                  |

**Privacy features:**

- Write operation blocking (safety check before dispatch)
- k-anonymity filtering: results with counts below `minK` threshold are suppressed
- Per-SPE breakdown + totals for transparency

#### 5c: Natural Language Query (Text2Cypher) ✅

| Endpoint             | Method | Description                                       |
| -------------------- | ------ | ------------------------------------------------- |
| `POST /nlq`          | POST   | Natural language → Cypher translation + execution |
| `GET /nlq/templates` | GET    | List available query templates + LLM status       |

**Query resolution pipeline:**

1. **Template matching** — 9 built-in templates with regex pattern matching:
   - `patient_count`, `patient_by_gender`, `top_conditions`, `top_medications`
   - `patient_journey`, `condition_prevalence`, `encounters_by_type`
   - `omop_cohort_stats`, `age_distribution`
2. **LLM fallback** — optional OpenAI API or Ollama for free-form questions:
   - Full 5-layer graph schema context provided to LLM
   - Safety validation on generated Cypher (blocks write operations)
3. **Federated mode** — `federated: true` dispatches to all SPEs

#### 5d: NLQ Explorer UI ✅

New `/query` page in the Next.js UI (7th view):

| Feature                | Description                                      |
| ---------------------- | ------------------------------------------------ |
| Natural language input | Free-text question with example question chips   |
| Federated toggle       | One-click federated mode across all SPEs         |
| Result table           | Dynamic columns from query results               |
| Method badge           | Shows template match vs. LLM generation          |
| Cypher inspector       | Toggle to view generated Cypher query            |
| SPE overview           | Per-SPE data counts (patients, encounters, etc.) |
| Query history          | Recent queries with one-click replay             |

**Federated stats header** shows live SPE count + total patients/encounters/conditions.

#### Infrastructure Summary

| Component       | SPE-1 (Primary)           | SPE-2 (Federated)             |
| --------------- | ------------------------- | ----------------------------- |
| Container       | `health-dataspace-neo4j`  | `health-dataspace-neo4j-spe2` |
| Bolt port       | 7687                      | 7688                          |
| Browser port    | 7474                      | 7475                          |
| Patients (FHIR) | 167                       | 37                            |
| Encounters      | 5,461                     | 2,076                         |
| OMOP Persons    | 167                       | 33                            |
| HealthDCAT-AP   | 2 datasets, 3 dists       | 1 dataset, 3 dists            |
| EEHRxF          | 6 categories, 12 profiles | 6 categories, 12 profiles     |
| Docker profile  | (default)                 | `federated`                   |

### Phase 6a: Graph Explorer UI ✅

Deployed as a standalone Next.js 14 web app connecting directly to Neo4j Bolt — no EDC-V dependency, immediately useful for demos and stakeholder review.

| View            | Path          | Description                                                |
| --------------- | ------------- | ---------------------------------------------------------- |
| Graph Explorer  | `/graph`      | Force-directed graph of all 5 architecture layers          |
| Dataset Catalog | `/catalog`    | HealthDCAT-AP metadata browser                             |
| EHDS Compliance | `/compliance` | HDAB approval chain validator (Articles 45–52)             |
| Patient Journey | `/patient`    | FHIR R4 → OMOP CDM event timeline                          |
| OMOP Analytics  | `/analytics`  | Cohort-level OMOP CDM research analytics dashboard         |
| EEHRxF Profiles | `/eehrxf`     | EU FHIR profile alignment + gap analysis                   |
| NLQ / Federated | `/query`      | Natural language → Cypher query with federated SPE support |

**Docker Deployment:**

The UI runs as the `graph-explorer` Docker service (container: `health-dataspace-ui`) defined in `docker-compose.yml`:

- Multi-stage Dockerfile (`ui/Dockerfile`): `node:20-alpine` base → deps → builder → runner
- Next.js `output: "standalone"` for minimal production image (no `node_modules` copy)
- All 9 API routes use `export const dynamic = "force-dynamic"` to prevent build-time prerendering (Neo4j is unavailable inside the Docker build container)
- Environment: `NEO4J_URI=bolt://neo4j:7687` (Docker DNS), `NEO4J_USER`, `NEO4J_PASSWORD`
- Exposed on port 3000; depends on `neo4j` service

**GitHub Pages Deployment:**

A GitHub Actions workflow (`.github/workflows/pages.yml`) builds the UI as a static export (`output: "export"`) and deploys to GitHub Pages. The `basePath` is set dynamically when `GITHUB_ACTIONS` is detected. API routes are excluded during static build (renamed/disabled) since they require a live Neo4j connection.

Live static demo: https://ma3u.github.io/MinimumViableHealthDataspacev2/

#### Phase 6a-2: Graph Explorer UX Improvements ✅

Value-centric, persona-driven graph redesign addressing usability feedback from stakeholder review.

**Problems addressed:**

1. Layer colors and role colors overlapped visually — users could not distinguish structural tiers from actor types
2. Technical jargon (L1-L5, OMOP CDM, HDAB) alienated non-technical users
3. Graph organized by technical layers, not by user value/purpose
4. No hover tooltips — users had to click nodes to learn what they are
5. Numeric SNOMED/ICD-10 codes (e.g. `160903007`) shown instead of human-readable names
6. Double-click required to expand nodes — unintuitive
7. Right detail panel cut off on smaller screens; no way to minimize panels

**Changes implemented:**

| Change                       | Files                            | Description                                                                                                                                                                              |
| ---------------------------- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Color palette split          | `graph-constants.ts`             | Layer colors → cool/muted pastel; Role colors → warm/vivid accents                                                                                                                       |
| Persona-specific labels      | `graph-constants.ts`             | `PERSONA_LAYER_LABELS` per persona (e.g. patient: "My Health Records", "Who Uses My Data")                                                                                               |
| Value-center node            | `graph-constants.ts`, `page.tsx` | Golden center node per persona: Patient→"My Health", Researcher→"My Study", Hospital→"My Data Offerings", HDAB→"Governance", EDC Admin→"My Dataspace", Trust Center→"Privacy Operations" |
| Persona ring layout          | `graph-constants.ts`, `page.tsx` | `PERSONA_RING_ASSIGNMENT` positions nodes by relevance to user's role, not by technical layer                                                                                            |
| Canvas hover tooltip         | `page.tsx`                       | Floating infobox on mouse-over showing node name, type, layer, and description                                                                                                           |
| Human-readable names         | `route.ts`, `expand/route.ts`    | Cypher `coalesce()` order fixed: `display` before `code` for all ontology nodes                                                                                                          |
| Single-click expand          | `page.tsx`                       | One click = select + expand + show detail panel (no double-click needed)                                                                                                                 |
| Collapsible panels           | `page.tsx`                       | Left sidebar and right detail panel have minimize/expand toggles                                                                                                                         |
| Friendly relationship labels | `page.tsx`                       | `FRIENDLY_REL_NAMES` map: `CODED_BY` → "coded as", `HAS_CONDITION` → "has condition", etc.                                                                                               |
| Thicker VALUE_FOCUS lines    | `page.tsx`                       | Golden dashed lines from center node made 2.5x thicker and more visible                                                                                                                  |

**Test coverage:** 1563 unit tests pass (82 files). E2E journey specs J001–J030 cover graph interactions.

### Phase 6b: Unified Participant Portal (Next.js) ✅

Phase 6b consolidates the onboarding and management functionality from three reference implementations — [Aruba Participant Portal](https://github.com/Aruba-it-S-p-A/edc-public-participant-portal) (Angular 20), [Fraunhofer End-User API](https://github.com/FraunhoferISST/End-User-API) (Angular + daisyUI), and [Dataspace Builder Redline](https://dataspacebuilder.github.io/website/docs/components/redline) — into the existing **Next.js 14** application. This avoids running three separate frontend stacks and leverages the 6 views already built in Phase 6a.

#### Technology Decision: Next.js 14 as Unified Frontend ✅

| Criteria             | Next.js 14 (existing)             | Angular 20 (Aruba/Fraunhofer) | Decision                           |
| -------------------- | --------------------------------- | ----------------------------- | ---------------------------------- |
| Existing investment  | 6 views, 8 API routes, mock layer | None in this project          | **Next.js** — avoid rewrite        |
| Styling              | Tailwind CSS                      | Tailwind CSS (both)           | Compatible — port styles directly  |
| API integration      | Next.js API routes → Neo4j        | REST fetch + mock server      | Next.js routes also serve EDC-V    |
| Static export        | `output: "export"` for GH Pages   | nginx static build            | Next.js already configured         |
| SSR/ISR              | Full support                      | Not applicable (SPA)          | **Next.js** — SEO + performance    |
| Auth                 | NextAuth.js ecosystem             | Keycloak PKCE (custom)        | NextAuth.js with Keycloak provider |
| EDC client libraries | OpenAPI-generated TS-fetch        | `edc-connector-client` (npm)  | Both usable; prefer typed clients  |

**Decision:** Remain on Next.js 14. Port the Aruba and Fraunhofer Angular UIs into Next.js pages, reusing their REST API patterns, Tailwind CSS layouts, and Keycloak authentication flow.

#### 6b-1: Participant Onboarding Portal (from Aruba) ✅

Ported from Aruba's Angular self-registration flow into Next.js:

| New Route            | Source                                | Description                                         |
| -------------------- | ------------------------------------- | --------------------------------------------------- |
| `/onboarding`        | Aruba `RegistrationComponent`         | Self-registration form: org name, DID, contact info |
| `/onboarding/status` | Aruba `DashboardComponent`            | Registration status tracker, pending approvals      |
| `/credentials`       | Aruba `CredentialManagementComponent` | View/request/revoke Verifiable Credentials          |
| `/settings`          | Aruba `AccountSettingsComponent`      | Participant profile, API keys, notification prefs   |

**API routes backing onboarding:**

- `POST /api/participants` → CFM Tenant Manager API (create participant tenant)
- `GET /api/participants/me` → EDC-V Admin API (current participant profile)
- `PUT /api/participants/me` → CFM Tenant Manager API (update participant)
- `POST /api/credentials/request` → IssuerService API (request VC issuance)
- `GET /api/credentials` → IdentityHub API (list stored credentials)

**Keycloak integration:** Follows Aruba's PKCE pattern via NextAuth.js Keycloak provider. Registration creates both a Keycloak user and a CFM tenant. Roles `EDC_ADMIN` and `EDC_USER_PARTICIPANT` gate access.

#### 6b-2: Data Sharing & Discovery Portal (from Fraunhofer) ✅

Ported from Fraunhofer's Angular + EDC Data Dashboard into Next.js:

| New Route        | Source                                    | Description                                         |
| ---------------- | ----------------------------------------- | --------------------------------------------------- |
| `/data/share`    | Fraunhofer `DataSharingComponent`         | Publish data assets with usage policies             |
| `/data/discover` | Fraunhofer `DataDiscoveryComponent`       | Browse federated catalog, initiate negotiations     |
| `/data/transfer` | Fraunhofer `TransferManagementComponent`  | Monitor active/completed transfers                  |
| `/negotiate`     | Fraunhofer `ContractNegotiationComponent` | Contract negotiation wizard with credential prompts |

**API routes backing data sharing:**

- `POST /api/assets` → EDC-V Admin API (register data asset)
- `GET /api/catalog` → EDC-V DSP API (federated catalog query) — extends existing `/api/catalog`
- `POST /api/negotiations` → EDC-V DSP API (initiate contract negotiation)
- `GET /api/negotiations/:id` → EDC-V DSP API (negotiation status)
- `POST /api/transfers` → EDC-V DSP API (initiate data transfer)
- `GET /api/transfers/:id` → EDC-V DSP API (transfer status)

**EDC client integration:** Uses the OpenAPI-generated TypeScript clients from Phase 1d (`ui/src/lib/edc/`) rather than Fraunhofer's `edc-connector-client` npm package, ensuring consistent typing with the exact JAD API version.

#### 6b-3: Operator Dashboard (from Redline) ✅

| New Route         | Source                     | Description                                   |
| ----------------- | -------------------------- | --------------------------------------------- |
| `/admin`          | Redline operator dashboard | Tenant overview, system health, audit log     |
| `/admin/tenants`  | CFM Tenant Manager         | Manage participant tenants (create/suspend)   |
| `/admin/policies` | Redline policy editor      | ODRL policy templates + CEL rule editor       |
| `/admin/audit`    | Neo4j provenance graph     | Contract negotiation + transfer event history |

**Role requirement:** All `/admin/*` routes require `EDC_ADMIN` role in Keycloak JWT.

#### Updated Navigation Structure ✅

```
┌─────────────────────────────────────────────────────────────┐
│  Health Dataspace v2                                [User ▼]│
├─────────────────────────────────────────────────────────────┤
│  Existing (Phase 6a)          │  New (Phase 6b)             │
│  ─────────────────────        │  ───────────────────        │
│  /graph      Graph Explorer   │  /onboarding  Registration  │
│  /catalog    Dataset Catalog  │  /credentials Credentials   │
│  /compliance EHDS Compliance  │  /data/share  Data Sharing  │
│  /patient    Patient Journey  │  /data/discover Discovery   │
│  /analytics  OMOP Analytics   │  /negotiate   Negotiation   │
│  /eehrxf     EEHRxF Profiles  │  /admin       Operator      │
└─────────────────────────────────────────────────────────────┘
```

**Deliverables:** 10 new Next.js routes implementing Aruba onboarding + Fraunhofer data sharing + Redline operator dashboard; Keycloak SSO protecting all views; EDC-V/CFM/IdentityHub APIs accessible via typed TypeScript clients.

### Phase 7: TCK DCP & DSP Compliance Verification ✅

Phase 7 validates that the Health Dataspace v2 deployment is **protocol-conformant** using the official Technology Compatibility Kits and custom EHDS-specific test suites. This phase runs after Phases 1–2 provide a working EDC-V + DCP stack.

#### 7a: DSP 2025-1 Technology Compatibility Kit ✅

The [DSP 2025-1 specification](https://internationaldataspaces.org/dataspace-protocol-nears-first-official-release/) includes a **TCK with 140+ test cases** that both EDC and TNO connectors have passed. We run these against our health dataspace deployment:

1. **Catalog Protocol Tests** — Verify DSP catalog request/response between CRO → HDAB Federated Catalog
   - `CatalogRequestMessage` / `CatalogAcknowledgementMessage` schema validation
   - Federated catalog crawling across multiple HDAB instances
   - HealthDCAT-AP metadata faithfully represented in DSP catalog responses
2. **Contract Negotiation Tests** — Verify full negotiation lifecycle
   - `ContractOfferMessage` → `ContractNegotiationEventMessage` → `ContractAgreementMessage`
   - Policy evaluation with EHDS-specific ODRL constraints
   - Error handling: negotiation rejection on invalid credentials
3. **Transfer Process Tests** — Verify DPS-compliant data transfer
   - `TransferRequestMessage` → `TransferStartMessage` → `TransferCompletionMessage`
   - Data Plane Signaling between EDC-V control plane and DCore data plane
   - FHIR Bundle HTTP transfer completion and acknowledgment
4. **Message Schema Validation** — All DSP messages conform to normative JSON schemas
   - Request/response payload validation against published JSON Schema definitions
   - HTTP status code compliance (201 Created, 400 Bad Request, etc.)

**Test execution:**

```bash
# Clone DSP TCK
git clone https://github.com/International-Data-Spaces-Association/ids-specification.git
cd ids-specification/tck

# Configure TCK to target our deployment
export DSP_CONNECTOR_URL=https://clinic-riverside.localhost/api/dsp
export DSP_CATALOG_URL=https://hdab-healthgov.localhost/api/dsp/catalog

# Run full TCK suite
./gradlew test
```

#### 7b: DCP v1.0 Compliance Tests ✅

The [DCP v1.0 specification](https://projects.eclipse.org/projects/technology.dataspace-dcp/releases/1.0.0) defines credential presentation and issuance protocols. We verify compliance of IdentityHub and IssuerService:

1. **DID Resolution Tests** — Verify DID:web document resolution
   - `GET /.well-known/did.json` returns valid DID Document
   - DID Document contains correct verification methods and service endpoints
   - Cross-participant DID resolution works (CRO resolves Clinic's DID)
2. **Self-Issued Identity Token Tests** — Verify SI token generation and validation
   - Token format conforms to DCP SI Token specification
   - Token contains required claims (iss, sub, aud, iat, exp, jti)
   - Token signature verifiable against DID Document verification method
3. **Credential Presentation Tests** — Verify Verifiable Presentation exchange
   - `PresentationRequestMessage` triggers IdentityHub to assemble VP
   - VP contains requested credential types (`EHDSParticipantCredential`, etc.)
   - Verifier validates VP signature chain: VC issuer → VP holder → DID Document
4. **Credential Issuance Tests** — Verify IssuerService protocol compliance
   - `CredentialRequestMessage` triggers credential issuance
   - Issued VC conforms to W3C Verifiable Credentials Data Model 2.0
   - Credential status (StatusList2021) correctly reports active/revoked

**Test execution:**

```bash
# Run DCP compliance tests against local deployment
cd tests/dcp-compliance

# DID resolution
curl -s https://clinic-riverside.localhost/.well-known/did.json | jq '.verificationMethod'

# SI Token validation
npm run test:si-token -- --issuer=did:web:clinic-riverside.localhost

# Full presentation exchange
npm run test:presentation -- --verifier=did:web:cro-trialcorp.localhost \
  --holder=did:web:clinic-riverside.localhost \
  --credential-type=EHDSParticipantCredential
```

#### 7c: EHDS Health-Domain Compliance Tests ✅

Custom test suite verifying health-specific requirements not covered by generic DSP/DCP TCKs:

1. **EHDS Article 53 Purpose Enforcement** — Verify that access requests with unauthorized purposes are rejected
   - Submit negotiation with `researchPurpose` → accepted
   - Submit negotiation with `commercialPurpose` → rejected (CEL policy evaluation)
   - Submit negotiation without `DataProcessingPurposeCredential` → rejected
2. **HealthDCAT-AP Schema Compliance** — Verify catalog entries conform to HealthDCAT-AP v3.0
   - DCAT mandatory properties present (title, description, publisher, theme)
   - Health-specific extensions present (healthCategory, healthTheme, legalBasis)
   - EHDS data quality label annotations present
3. **EEHRxF Conformance** — Verify FHIR data transferred via DCore conforms to EEHRxF profiles
   - Patient Summary resources validate against `hl7.fhir.eu.base` profiles
   - Laboratory resources validate against `hl7.fhir.eu.laboratory` profiles
   - Coverage gap report generated per EEHRxF priority category
4. **OMOP CDM Integrity** — Verify FHIR → OMOP transformation correctness
   - All FHIR resources have corresponding OMOP entities (`MAPPED_TO` relationships complete)
   - Vocabulary mappings correct: SNOMED → condition_concept_id, LOINC → measurement_concept_id
   - No orphaned OMOP entities (every OMOPPerson links to at least one clinical event)

#### 7d: Automated CI/CD Compliance Pipeline ✅

5. Add compliance verification to GitHub Actions:

```yaml
# .github/workflows/compliance.yml
name: Protocol Compliance
on:
  push:
    branches: [main]
  schedule:
    - cron: "0 6 * * 1" # Weekly Monday 6am UTC

jobs:
  dsp-tck:
    name: DSP 2025-1 TCK
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Start JAD infrastructure
        run: docker compose -f docker-compose.jad.yml up -d --wait
      - name: Run DSP TCK (140+ tests)
        run: ./scripts/run-dsp-tck.sh
      - name: Upload TCK results
        uses: actions/upload-artifact@v4
        with:
          name: dsp-tck-results
          path: test-results/dsp-tck/

  dcp-compliance:
    name: DCP v1.0 Compliance
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Start JAD infrastructure
        run: docker compose -f docker-compose.jad.yml up -d --wait
      - name: Run DCP compliance suite
        run: ./scripts/run-dcp-tests.sh
      - name: Upload DCP results
        uses: actions/upload-artifact@v4
        with:
          name: dcp-compliance-results
          path: test-results/dcp/

  ehds-compliance:
    name: EHDS Health Domain
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Start full stack
        run: docker compose -f docker-compose.jad.yml up -d --wait
      - name: Run EHDS compliance tests
        run: npm run test:ehds-compliance
      - name: Generate compliance report
        run: npm run report:compliance
```

**Compliance Dashboard:** Results are aggregated into a `/compliance/tck` UI view showing:

- DSP TCK pass/fail matrix (140+ test cases)
- DCP compliance status per participant
- EHDS domain test results with remediation guidance
- Historical compliance trend (from CI runs)

**Deliverables:** DSP 2025-1 TCK passing for all 3 participants; DCP v1.0 compliance verified for IdentityHub + IssuerService; EHDS-specific tests validating Article 53 enforcement + HealthDCAT-AP + EEHRxF; automated weekly CI compliance runs.

### Phase 8: Test Coverage Expansion + CI/CD ✅

Phase 8 expands the initial test scaffolding (ADR-8) into comprehensive coverage across all API routes, library modules, and UI components. It also establishes automated CI/CD test runs on every commit.

#### 8a: UI API Route Coverage ✅

Added integration tests for all untested API routes (10 new test files, 45+ tests):

- **Neo4j-backed routes:** `patient`, `credentials`, `analytics`, `compliance`, `eehrxf` — test both happy-path and empty-data scenarios using `vi.mock("@/lib/neo4j")`
- **EDC-backed routes:** `participants`, `assets`, `admin/tenants`, `admin/policies` — test GET (list/aggregate), POST (validation + creation), and 502 error handling using `vi.mock("@/lib/edc")`
- **Proxy routes:** `federated`, `nlq` — test proxy forwarding and upstream failure handling using `vi.fn()` on global `fetch`

**Coverage results:** 10 of 16 API routes at 100% statement coverage. Overall API route coverage lifted from ~25% to ~85%.

#### 8b: Component + Library Coverage ✅

- **UserMenu:** 7 tests covering loading/unauthenticated/authenticated states, dropdown toggle, role badges, sign-in/sign-out actions
- **fetchApi:** 9 tests covering normal mode (direct fetch) and static export mode (mock JSON routing for catalog, graph, patient, analytics, credentials, participants)
- **Navigation:** 7 tests (from Phase 7 ADR-8) covering nav links, active highlighting, dropdown groups

**Overall UI coverage improvement:**

| Metric | Before | Phase 8 | Current | Change    |
| ------ | ------ | ------- | ------- | --------- |
| Stmts  | 10.50% | 24.64%  | 71.76%  | **+583%** |
| Branch | 6.55%  | 13.64%  | 51.15%  | **+681%** |
| Funcs  | 7.10%  | 14.46%  | 67.16%  | **+846%** |
| Lines  | 10.23% | 24.28%  | 72.10%  | **+605%** |
| Tests  | 40     | 94      | 247     | **+518%** |

#### 8c: CI/CD Test Pipeline ✅

Created `.github/workflows/test.yml` triggered on every push and PR:

- **`ui-tests` job:** Installs UI dependencies, runs Vitest with coverage, uploads HTML coverage artifacts
- **`proxy-tests` job:** Installs proxy dependencies, runs Vitest with coverage, uploads artifacts
- **`lint` job:** Runs ESLint (`next lint`) on UI code
- **Coverage summaries** written to GitHub Actions job summary for quick review

**Deliverables:** 247 passing UI tests + 31 Playwright E2E tests = 278 total; 71.76% statement coverage; coverage reports in `docs/test-report.md` and CI HTML artifacts; automated test runs on every push via GitHub Actions.

### Phase 9: Documentation & Navigation Restructuring ✅

Phase 9 adds comprehensive user (business) and developer documentation published to GitHub Pages, restructures the app navigation into logical clusters, and embeds interactive Mermaid architecture diagrams throughout the documentation.

#### 9a: Documentation Site ✅

Created in-app documentation under `/docs` with three sub-pages:

- **`/docs`** — Landing page with section cards (User Guide, Developer Guide, Architecture), quick links, and project overview
- **`/docs/user-guide`** — Business user guide covering all application views (Graph Explorer, Dataset Catalog, Patient Journey, OMOP Analytics, EEHRxF Profiles), EHDS compliance workflow, data exchange portal, and administration
- **`/docs/developer`** — Technical documentation with: tech stack overview, quick start guide, project structure, Neo4j graph schema, API reference table (9 routes), testing setup (Vitest + Playwright), CI/CD pipeline, ADR summaries (1–7), and coding conventions
- **`/docs/architecture`** — Interactive Mermaid diagrams:
  1. Five-layer knowledge graph architecture
  2. End-to-end data flow pipeline (Synthea → FHIR → Neo4j → OMOP → Analytics)
  3. Deployment topology (Docker services + GitHub Pages)
  4. DSP contract negotiation sequence with EHDS compliance
  5. DCP identity and trust framework

**Component:** `MermaidDiagram.tsx` — Client-side Mermaid.js renderer with dark theme, error handling, and figure captions.

#### 9b: Navigation Restructuring ✅

Reorganised navigation from a mix of flat links + overflow menu into 5 logical dropdown clusters:

| Before                                                    | After                                                            |
| --------------------------------------------------------- | ---------------------------------------------------------------- |
| 5 flat mainLinks + 3 portalGroup dropdowns + MoreMenu (3) | 5 dropdown clusters with all links grouped                       |
| Graph, Catalog, Patient, Analytics, NLQ (flat)            | **Explore** (6): Graph, Catalog, Patient, Analytics, NLQ, EEHRxF |
| Compliance + EEHRxF hidden in overflow MoreMenu           | **Governance** (3): EHDS Approval, Protocol TCK, Credentials     |
| Onboarding / Data Exchange / Admin as separate dropdowns  | **Exchange** (4): Share, Discover, Negotiate, Transfer           |
| —                                                         | **Portal** (5): Onboarding, Admin, Tenants, Policies, Settings   |
| —                                                         | **Docs** (4): Overview, User Guide, Developer, Architecture      |

#### 9c: Home Page Refresh ✅

Updated the home page card layout into two sections:

- **Explore** (5 cards): Graph Explorer, Dataset Catalog, Patient Journey, OMOP Analytics, EEHRxF Profiles — 3-column grid
- **Govern · Exchange · Manage** (4 cards): Governance, Data Exchange, Portal Admin, Documentation — 4-column grid

Brand title "Health Dataspace" now links to home page.

#### 9d: GitHub Pages Static Export ✅

All documentation pages use `"use client"` with client-side Mermaid rendering — fully compatible with Next.js static export (`output: "export"`). No server-side features or API routes required. Mermaid.js installed as npm dependency (`mermaid@^11`).

**Deliverables:** 4 documentation pages (landing, user guide, developer, architecture); 8 interactive Mermaid diagrams; `MermaidDiagram` component; navigation restructured into 5 clusters; home page refreshed with 2-section layout; all compatible with GitHub Pages static export.

---

### Phase 10: Tasks Dashboard & DPS Integration ✅

Phase 10 adds a unified Tasks dashboard that aggregates contract negotiations and transfer processes across all participant contexts into a single view. The implementation aligns with the EDC Data Plane Signaling (DPS) framework, exposing real-time state progressions for both the DSP Contract Negotiation and Transfer Process state machines.

**Key DPS concepts reflected in the UI:**

- **DSP Contract Negotiation** state machine: `REQUESTED → OFFERED → ACCEPTED → AGREED → VERIFIED → FINALIZED` (or `TERMINATED` at any point)
- **DSP Transfer Process** state machine: `REQUESTED → STARTED → SUSPENDED → COMPLETED` (or `TERMINATED` at any point)
- **Endpoint Data Reference (EDR):** When a transfer reaches `STARTED`, the Control Plane signals the selected Data Plane via the DPS control URL (`/api/control/v1/dataflows`). The Data Plane generates an EDR containing a JWT bearer token and endpoint URL, stored in `contentDataAddress`. The Tasks UI shows EDR availability as a visual indicator.
- **Data Plane topology:** Two disaggregated DCore data planes — `dataplane-fhir` (HttpData-PUSH, FHIR R4) and `dataplane-omop` (HttpData-PULL, OMOP CDM) — selected by `DataPlaneSelectorService` based on `allowedTransferTypes`.

#### 10a: Tasks API Route ✅

Server-side aggregation route (`/api/tasks`) that queries all registered participant contexts and returns a unified task list:

- **Endpoint:** `GET /api/tasks`
- Lists all participants via `GET /v5alpha/participants`
- For each participant context, fetches negotiations (`POST .../contractnegotiations/request`) and transfers (`POST .../transferprocesses/request`) in parallel
- Maps raw EDC objects to unified `Task` type with human-readable names (`didToName`), asset labels (`assetLabel`), and DPS metadata
- For transfers in `STARTED` state, checks `contentDataAddress` for EDR availability (indicates Data Plane has processed the DPS `START` signal)
- Returns `{ tasks: Task[], counts: { total, negotiations, transfers, active } }`
- Includes mock data fallback for static export compatibility

#### 10b: Tasks Page ✅

Client-side dashboard (`/tasks`) with DSP-aligned pipeline visualisation:

- **Summary cards:** Total / Active / Negotiations / Transfers count badges
- **Filter tabs:** All / Active / Negotiations / Transfers with live counts
- **DSP Pipeline Stepper:** `StatePipeline` component renders each task's state as a visual stepper with animated progress indicator for active states, green checkmarks for completed states, and red X for terminated states
- **Task cards:** Asset name, type badge, transfer type tag (`HttpData-PULL`), participant → counter-party flow, timestamp, contract agreement ID, and EDR availability indicator for started transfers
- **Deep links:** Each task card links to the relevant detail page (`/negotiate` or `/data/transfer`)
- **Auto-refresh:** 15-second polling interval for live state updates

#### 10c: Navigation Update ✅

Added Tasks entry to the Exchange navigation cluster:

- `ClipboardList` icon with `/tasks` route
- Positioned between Negotiate and Transfer for logical workflow: Share → Discover → Negotiate → **Tasks** → Transfer
- Active state detection via `pathname.startsWith("/tasks")`

#### 10d: Static Export & Mock Data ✅

- Created `ui/public/mock/tasks.json` — mock aggregated task list mirroring the API response shape (6 tasks: 3 negotiations + 3 transfers with varied states)
- Added `/api/tasks` prefix mapping in `STATIC_MOCK_PREFIX` (`ui/src/lib/api.ts`)
- GitHub Pages deployment renders mock data when `NEXT_PUBLIC_STATIC_EXPORT=true`

**Deliverables:** `/api/tasks` server-side route with DPS-aware aggregation; `/tasks` client-side dashboard with DSP pipeline steppers; Navigation updated with Tasks link; mock data for static export; all aligned with EDC Data Plane Signaling specification.

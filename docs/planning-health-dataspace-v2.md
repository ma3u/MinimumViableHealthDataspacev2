# Planning: Health Dataspace v2

## Table of Contents

- [Planning: Health Dataspace v2](#planning-health-dataspace-v2)
  - [Table of Contents](#table-of-contents)
  - [Background \& Inspiration](#background--inspiration)
  - [New EDC Component Architecture](#new-edc-component-architecture)
    - [Protocol Foundation: DSP + DCP + DPS](#protocol-foundation-dsp--dcp--dps)
  - [Implementation Progress](#implementation-progress)
  - [Implementation Roadmap](#implementation-roadmap)
    - [Phase 1: Infrastructure Migration (JAD-Based) ✅](#phase-1-infrastructure-migration-jad-based-)
      - [1a: JAD Local Deployment ✅](#1a-jad-local-deployment-)
      - [1b: Health-Specific Tenant Configuration ✅](#1b-health-specific-tenant-configuration-)
      - [1c: Docker Compose Development Profile ✅](#1c-docker-compose-development-profile-)
      - [1d: OpenAPI TypeScript Client Generation ✅](#1d-openapi-typescript-client-generation-)
      - [1e: ADR-2 Implementation — Dual Data Planes + Neo4j Query Proxy ✅](#1e-adr-2-implementation--dual-data-planes--neo4j-query-proxy-)
      - [1f: Phase 4a Prep — EDC-V Asset Registration + Vault Keys ✅](#1f-phase-4a-prep--edc-v-asset-registration--vault-keys-)
    - [Phase 2: Identity and Trust (DCP v1.0) ✅](#phase-2-identity-and-trust-dcp-v10-)
      - [2a: DID:web and Verifiable Credential Setup ✅](#2a-didweb-and-verifiable-credential-setup-)
      - [2b: EHDS-Specific Credential Types ✅](#2b-ehds-specific-credential-types-)
      - [2c: Keycloak SSO Integration ✅](#2c-keycloak-sso-integration-)
    - [Phase 3: Health Knowledge Graph Layer ✅](#phase-3-health-knowledge-graph-layer-)
    - [Phase 3b: Real FHIR Data Pipeline ✅](#phase-3b-real-fhir-data-pipeline-)
    - [Phase 3c: HealthDCAT-AP Metadata Registration ✅](#phase-3c-healthdcat-ap-metadata-registration-)
    - [Phase 3d: README and UI Completeness Hardening ✅](#phase-3d-readme-and-ui-completeness-hardening-)
    - [Phase 3e: DSP Marketplace Registration + Compliance Chain ✅](#phase-3e-dsp-marketplace-registration--compliance-chain-)
    - [Phase 3f: OMOP Research Analytics View ✅](#phase-3f-omop-research-analytics-view-)
    - [Phase 3g: Procedure Pipeline + UI Polish ✅](#phase-3g-procedure-pipeline--ui-polish-)
    - [Phase 3h: EEHRxF FHIR Profile Alignment ✅](#phase-3h-eehrxf-fhir-profile-alignment-)
    - [Phase 4: Dataspace Integration (EDC-V ↔ Neo4j) ✅](#phase-4-dataspace-integration-edc-v--neo4j-)
      - [4a: Data Asset Registration ✅](#4a-data-asset-registration-)
      - [4b: Contract Negotiation Flow ✅](#4b-contract-negotiation-flow-)
      - [4c: Federated Catalog with HealthDCAT-AP ✅](#4c-federated-catalog-with-healthdcat-ap-)
      - [4d: Data Plane Transfer via DCore ✅](#4d-data-plane-transfer-via-dcore-)
    - [Phase 5: Federated Queries and GraphRAG ✅](#phase-5-federated-queries-and-graphrag-)
      - [5a: Second Neo4j SPE ✅](#5a-second-neo4j-spe-)
      - [5b: Federated Query Dispatch ✅](#5b-federated-query-dispatch-)
      - [5c: Natural Language Query (Text2Cypher) ✅](#5c-natural-language-query-text2cypher-)
      - [5d: NLQ Explorer UI ✅](#5d-nlq-explorer-ui-)
      - [Infrastructure Summary](#infrastructure-summary)
    - [Phase 6a: Graph Explorer UI ✅](#phase-6a-graph-explorer-ui-)
    - [Phase 6b: Unified Participant Portal (Next.js) ✅](#phase-6b-unified-participant-portal-nextjs-)
      - [Technology Decision: Next.js 14 as Unified Frontend ✅](#technology-decision-nextjs-14-as-unified-frontend-)
      - [6b-1: Participant Onboarding Portal (from Aruba) ✅](#6b-1-participant-onboarding-portal-from-aruba-)
      - [6b-2: Data Sharing \& Discovery Portal (from Fraunhofer) ✅](#6b-2-data-sharing--discovery-portal-from-fraunhofer-)
      - [6b-3: Operator Dashboard (from Redline) ✅](#6b-3-operator-dashboard-from-redline-)
      - [Updated Navigation Structure ✅](#updated-navigation-structure-)
    - [Phase 7: TCK DCP \& DSP Compliance Verification ✅](#phase-7-tck-dcp--dsp-compliance-verification-)
      - [7a: DSP 2025-1 Technology Compatibility Kit ✅](#7a-dsp-2025-1-technology-compatibility-kit-)
      - [7b: DCP v1.0 Compliance Tests ✅](#7b-dcp-v10-compliance-tests-)
      - [7c: EHDS Health-Domain Compliance Tests ✅](#7c-ehds-health-domain-compliance-tests-)
      - [7d: Automated CI/CD Compliance Pipeline ✅](#7d-automated-cicd-compliance-pipeline-)
    - [Phase 8: Test Coverage Expansion + CI/CD ✅](#phase-8-test-coverage-expansion--cicd-)
      - [8a: UI API Route Coverage ✅](#8a-ui-api-route-coverage-)
      - [8b: Component + Library Coverage ✅](#8b-component--library-coverage-)
      - [8c: CI/CD Test Pipeline ✅](#8c-cicd-test-pipeline-)
    - [Phase 9: Documentation \& Navigation Restructuring ✅](#phase-9-documentation--navigation-restructuring-)
      - [9a: Documentation Site ✅](#9a-documentation-site-)
      - [9b: Navigation Restructuring ✅](#9b-navigation-restructuring-)
      - [9c: Home Page Refresh ✅](#9c-home-page-refresh-)
      - [9d: GitHub Pages Static Export ✅](#9d-github-pages-static-export-)
  - [Architecture Decisions](#architecture-decisions)
    - [ADR-1: PostgreSQL vs Neo4j Data Storage Split](#adr-1-postgresql-vs-neo4j-data-storage-split)
      - [Decision](#decision)
      - [Storage Assignment](#storage-assignment)
      - [Event Projection: EDC-V PostgreSQL → Neo4j Layer 1](#event-projection-edc-v-postgresql--neo4j-layer-1)
      - [Consequences](#consequences)
    - [ADR-2: EDC Data Plane Architecture](#adr-2-edc-data-plane-architecture)
      - [Decision](#decision-1)
      - [Data Plane Topology](#data-plane-topology)
      - [Data Plane Specifications](#data-plane-specifications)
      - [Neo4j Query Proxy Service](#neo4j-query-proxy-service)
      - [EDC-V Asset Registration (Phase 4a)](#edc-v-asset-registration-phase-4a)
      - [Docker Compose Changes](#docker-compose-changes)
      - [Consequences](#consequences-1)
    - [ADR-3: W3C HealthDCAT-AP Alignment (Replacing Generic DCAT)](#adr-3-w3c-healthdcat-ap-alignment-replacing-generic-dcat)
      - [HealthDCAT-AP Specification Overview](#healthdcat-ap-specification-overview)
      - [Property Mapping: Current → HealthDCAT-AP](#property-mapping-current--healthdcat-ap)
      - [Node Label Changes](#node-label-changes)
      - [Relationship Changes](#relationship-changes)
      - [JSON-LD Serialization (for Federated Catalog)](#json-ld-serialization-for-federated-catalog)
      - [Migration Steps](#migration-steps)
      - [Consequences](#consequences-2)
    - [ADR-4: Next.js 14 as Unified Frontend (Consolidating Angular Reference UIs)](#adr-4-nextjs-14-as-unified-frontend-consolidating-angular-reference-uis)
      - [Decision](#decision-2)
      - [Alternatives Considered](#alternatives-considered)
      - [Rationale](#rationale)
      - [Technology Stack](#technology-stack)
      - [Application Structure](#application-structure)
      - [Consequences](#consequences-3)
    - [ADR-5: JAD + CFM Source Builds (EDC-V 0.16.0-SNAPSHOT + CFM Go Stack)](#adr-5-jad--cfm-source-builds-edc-v-0160-snapshot--cfm-go-stack)
      - [Decision](#decision-3)
      - [Alternatives Considered](#alternatives-considered-1)
      - [Build Instructions](#build-instructions)
      - [Images Produced](#images-produced)
      - [Configuration Alignment](#configuration-alignment)
      - [Consequences](#consequences-4)
    - [ADR-6: GHCR Image Publishing (Public Container Registry)](#adr-6-ghcr-image-publishing-public-container-registry)
      - [Decision](#decision-4)
      - [Image Registry](#image-registry)
      - [Naming Convention](#naming-convention)
      - [Consequences](#consequences-5)
    - [ADR-7: DID:web Resolution Architecture and DSP Contract Negotiation](#adr-7-didweb-resolution-architecture-and-dsp-contract-negotiation)
      - [DID:web Method and IdentityHub](#didweb-method-and-identityhub)
      - [DID Document Structure](#did-document-structure)
      - [DID Resolution Architecture](#did-resolution-architecture)
      - [Participant Activation Requirement](#participant-activation-requirement)
      - [Contract Negotiation Flow: CRO → Clinic](#contract-negotiation-flow-cro--clinic)
      - [HDAB Operator Oversight](#hdab-operator-oversight)
      - [Consequences](#consequences-6)
    - [ADR-8: Comprehensive Testing Strategy (Vitest + Playwright + Supertest)](#adr-8-comprehensive-testing-strategy-vitest--playwright--supertest)
      - [Decision {#decision-8}](#decision-decision-8)
      - [Alternatives Considered {#alternatives-considered-8}](#alternatives-considered-alternatives-considered-8)
      - [Rationale {#rationale-8}](#rationale-rationale-8)
      - [Test Architecture {#test-architecture}](#test-architecture-test-architecture)
      - [Consequences {#consequences-7}](#consequences-consequences-7)
  - [Target Architecture](#target-architecture)
  - [What This Proves](#what-this-proves)
  - [Implementation Dependencies](#implementation-dependencies)

---

## Background & Inspiration

This project is contextualised by:
[European Health Dataspaces, Digital Twins: A Journey from FHIR Basics to Intelligent Patient Models](https://www.linkedin.com/pulse/european-health-dataspaces-digital-twins-journey-fhir-buchhorn-roth-8t51c/)

The Eclipse Dataspace ecosystem has undergone a fundamental architectural evolution since the first health demo. Three new projects change how dataspaces are built and operated — the [MinimumViableDataspace health demo](https://github.com/ma3u/MinimumViableDataspace/tree/health-demo) needs to evolve with them.

---

## New EDC Component Architecture

The original MVD used a monolithic EDC Connector with an embedded data plane. The new architecture disaggregates this into purpose-built components:

| Component                          | Project                                                                                    | Purpose                                                           | Key Change                                                                                                                                                                       |
| ---------------------------------- | ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **EDC-V** (Virtual Connector)      | [eclipse-edc/Virtual-Connector](https://github.com/eclipse-edc/Virtual-Connector)          | Virtualized control plane optimized for cloud service providers   | Multi-tenant isolation, participant-scoped APIs, provisioning system integration [github](https://github.com/eclipse-edc/Virtual-Connector/blob/main/docs/administration_api.md) |
| **DCore** (Data Plane Core)        | [Eclipse Data Plane Core](https://projects.eclipse.org/projects/technology.dataplane-core) | Multi-language data plane SDKs (Go, Java, .NET, Rust, TypeScript) | Rust-based HTTP data plane, Data Plane Signaling spec compliance [projects.eclipse](https://projects.eclipse.org/proposals/eclipse-data-plane-core)                              |
| **CFM** (Connector Fabric Manager) | [Eclipse CFM](https://projects.eclipse.org/proposals/eclipse-cfm)                          | Management plane for multi-tenant connector orchestration         | Tenant Manager + Provision Manager, multi-role UI (operator, reseller, end user) [projects.eclipse](https://projects.eclipse.org/proposals/eclipse-connector-fabric-manager)     |
| **JAD** (Joint Architecture Demo)  | [Metaform/jad](https://github.com/Metaform/jad)                                            | Reference demonstrator combining EDC-V + CFM + DCore + onboarding | Replaces old MVD as the canonical demo for cloud provider deployments [linkedin](https://www.linkedin.com/posts/mbuchhorn_fulcrum-daas-edc-activity-7427340949279809536-OaG6)    |

EDC-V is not a monolith — it consists of multiple services with separate administration APIs, strictly enforcing isolation boundaries between participants to prevent data leakage. The CFM sits above EDC-V as an automated provisioning system that handles keypair generation, DID document creation, and Verifiable Credential issuance when new participants onboard. [projects.eclipse](https://projects.eclipse.org/proposals/eclipse-connector-fabric-manager)

### Protocol Foundation: DSP + DCP + DPS

All three core specifications are now final or near-final:

- **DSP 2025-1** (Dataspace Protocol) — Catalog access, contract negotiation, and transfer management over RESTful HTTPS. Normative JSON schemas for all message payloads. Technology Compatibility Kit with 140+ test cases passed by both EDC and TNO connectors. [internationaldataspaces](https://internationaldataspaces.org/dataspace-protocol-nears-first-official-release/)
- **DCP v1.0** (Decentralized Claims Protocol) — Self-issued identity tokens, Verifiable Credential storage/presentation, and credential issuance protocols. Released July 2025 with 119 merged PRs from 12 organizations. [projects.eclipse](https://projects.eclipse.org/projects/technology.dataspace-dcp/releases/1.0.0)
- **DPS** (Data Plane Signaling) — Signaling interface between control plane and data plane, enabling independently deployed and scaled DCore data planes. DCore implements this specification natively. [projects.eclipse](https://projects.eclipse.org/proposals/eclipse-data-plane-core)

---

## Implementation Progress

| Phase  | Title                                                  | Status      | Notes                                                                                                                                                                                                                                                                                                                                                                                    |
| ------ | ------------------------------------------------------ | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1**  | Infrastructure Migration (EDC-V + DCore + CFM)         | ✅ Complete | 1a–1f all complete; 18 services healthy; 3 tenants + 9 VPAs provisioned; data assets registered; ADR-1–6 accepted                                                                                                                                                                                                                                                                        |
| **2**  | Identity and Trust (DCP v1.0 + Verifiable Credentials) | ✅ Complete | 2a ✅ (DID:web for 3 tenants, Ed25519 keys, all activated — ADR-7); 2b ✅ (3 EHDS credential defs on IssuerService, 5 VC nodes in Neo4j, DCP scopes configured, Compliance UI with trust chain); 2c ✅ (Keycloak SSO: PKCE client, 3 roles, 3 demo users, NextAuth.js, role-based middleware)                                                                                            |
| **3**  | Health Knowledge Graph Layer — Schema & Synthetic Data | ✅ Complete | 5-layer Neo4j schema, EHDS HDAB chain, style sheet                                                                                                                                                                                                                                                                                                                                       |
| **3b** | Real FHIR Data Pipeline (Synthea → Neo4j → OMOP)       | ✅ Complete | 167 patients · 5,461 encounters · 2,421 conditions · 37,713 observations · 3,895 drug Rxes · 8,534 procedures                                                                                                                                                                                                                                                                            |
| **3c** | HealthDCAT-AP Metadata Registration for FHIR Dataset   | ✅ Complete | Synthea cohort registered as HealthDCAT-AP catalog entry; 2 distributions + EHDS Art 53 purpose                                                                                                                                                                                                                                                                                          |
| **3d** | README + UI completeness hardening                     | ✅ Complete | README step order fixed; catalog UI shows datasetType/legalBasis/recordCount                                                                                                                                                                                                                                                                                                             |
| **3e** | DSP Marketplace Registration + Compliance Chain        | ✅ Complete | Layer 1 DataProduct/Contract/HDABApproval wired to Synthea dataset; compliance UI live dropdowns                                                                                                                                                                                                                                                                                         |
| **3f** | OMOP Research Analytics View                           | ✅ Complete | Layer 4 cohort dashboard: top conditions/drugs/measurements, gender breakdown, stat cards                                                                                                                                                                                                                                                                                                |
| **3g** | Procedure Pipeline + UI Polish                         | ✅ Complete | 8,534 Procedure → OMOPProcedureOccurrence; Analytics card on home; 6-stat patient page                                                                                                                                                                                                                                                                                                   |
| **3h** | EEHRxF FHIR Profile Alignment                          | ✅ Complete | EEHRxF category/profile nodes; gap analysis UI; EHDS priority coverage                                                                                                                                                                                                                                                                                                                   |
| **4**  | Dataspace Integration (EDC-V ↔ Neo4j data assets)     | ✅ Complete | 4a ✅ (assets + policies + contracts); 4b ✅ (3 FINALIZED negotiations + transfer STARTED — ADR-7); 4c ✅ (Federated Catalog: 4 datasets discoverable, HDAB contract FINALIZED); 4d ✅ (Data Plane Transfer: CRO←100 FHIR patients, HDAB←2 HealthDCAT-AP datasets via DCore; audit trail in Neo4j)                                                                                       |
| **5**  | Federated Queries & GraphRAG                           | ✅ Complete | 5a ✅ (Neo4j SPE-2: 37 patients, 2,076 encounters, 33 OMOP persons + HealthDCAT-AP + EEHRxF); 5b ✅ (federated query dispatch + k-anonymity); 5c ✅ (Text2Cypher NLQ: 9 templates + optional LLM); 5d ✅ (UI `/query` page — 7th view)                                                                                                                                                   |
| **6a** | Graph Explorer UI (Next.js → Neo4j Bolt)               | ✅ Complete | Seven views (graph, catalog, compliance, patient, analytics, eehrxf, query/NLQ); Docker `graph-explorer` container on port 3000; GitHub Pages static export                                                                                                                                                                                                                              |
| **6b** | Full Participant Portal (Aruba + Fraunhofer + Redline) | ✅ Complete | 6b-1 ✅ (Onboarding: /onboarding, /onboarding/status, /credentials, /settings + 3 API routes); 6b-2 ✅ (Data Exchange: /data/share, /data/discover, /data/transfer, /negotiate + 5 API routes); 6b-3 ✅ (Admin: /admin, /admin/tenants, /admin/policies, /admin/audit + 3 API routes); Navigation dropdowns + middleware auth for all portal routes; 7 mock JSON files for static export |
| **7**  | TCK DCP & DSP Compliance Verification                  | ✅ Complete | 7a ✅ (DSP 2025-1 TCK: `run-dsp-tck.sh` — 7 test categories, 30+ tests); 7b ✅ (DCP v1.0: `run-dcp-tests.sh` — 5 categories); 7c ✅ (EHDS domain: `run-ehds-tests.sh` — 5 categories); 7d ✅ (CI/CD: `compliance.yml` workflow, orchestrator `run-compliance.sh`, `/compliance/tck` dashboard UI with live + mock data)                                                                  |
| **8**  | Test Coverage Expansion + CI/CD                        | ✅ Complete | 8a ✅ (10 new API route test files, ~85% API coverage); 8b ✅ (UserMenu, fetchApi, Navigation + 6 page-level component suites); 8c ✅ (GitHub Actions test.yml, coverage reports, **260 unit tests + 31 E2E = 291 total**)                                                                                                                                                               |
| **9**  | Documentation & Navigation Restructuring               | ✅ Complete | 9a ✅ (4 doc pages: landing, user guide, developer, architecture + 8 Mermaid diagrams); 9b ✅ (Nav restructured: 5 dropdown clusters — Explore, Governance, Exchange, Portal, Docs); 9c ✅ (Home page refresh: 2-section card layout); 9d ✅ (Static export compatible, mermaid@11)                                                                                                      |

---

## Implementation Roadmap

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

| Implementation Guide               | Package                          | FHIR | Status  | URL                                           |
| ---------------------------------- | -------------------------------- | ---- | ------- | --------------------------------------------- |
| Base and Core Profiles             | `hl7.fhir.eu.base#0.1.0`         | R4   | STU 1.0 | https://hl7.eu/fhir/base/                     |
| Laboratory Report                  | `hl7.fhir.eu.laboratory#0.1.1`   | R4   | STU 1.1 | https://hl7.eu/fhir/laboratory/               |
| Hospital Discharge Report          | `hl7.fhir.eu.hdr#1.0.0-ci-build` | R4   | Ballot  | https://build.fhir.org/ig/hl7-eu/hdr/         |
| Medication Prescription & Dispense | `hl7.fhir.eu.mpd`                | R4   | Ballot  | https://build.fhir.org/ig/hl7-eu/medications/ |
| Imaging Study Report               | `hl7.fhir.eu.imaging`            | R5   | Ballot  | https://build.fhir.org/ig/hl7-eu/imaging/     |
| Extensions                         | `hl7.fhir.eu.extensions#0.1.0`   | R4   | STU 1.2 | https://hl7.eu/fhir/extensions/               |

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

## Architecture Decisions

### ADR-1: PostgreSQL vs Neo4j Data Storage Split

**Status:** Accepted
**Date:** 2025-07-24
**Context:** The JAD stack introduces PostgreSQL 17 with 7 databases for EDC-V/CFM operational state. The existing Neo4j 5 instance stores all 5 layers of the health knowledge graph (~57K nodes). We need a clear boundary for which data belongs where.

#### Decision

**PostgreSQL** stores transactional, state-machine-driven data managed by EDC-V/CFM/Keycloak internal schemas. **Neo4j** stores the relationship-rich health knowledge graph, metadata catalog, and ontology backbone. Layer 1 (marketplace) is **dual-write**: EDC-V is the source of truth in PostgreSQL; Neo4j holds a read-only event-sourced projection for graph queries and visualization.

#### Storage Assignment

| Data Domain                     | PostgreSQL Database           | Neo4j Layer        | Rationale                                                                                                    |
| ------------------------------- | ----------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------ |
| **EDC-V Contract Negotiations** | `controlplane` (auto-schema)  | Layer 1 projection | State machine with ACID transitions; Neo4j mirrors final states for graph traversal                          |
| **EDC-V Asset Registrations**   | `controlplane` (auto-schema)  | —                  | Lightweight JSON pointers to data addresses; no graph value                                                  |
| **EDC-V Transfer Processes**    | `controlplane` (auto-schema)  | Layer 1 projection | DPS state machine; audit events projected to Neo4j `(:TransferProcess)`                                      |
| **EDC-V Policy Definitions**    | `controlplane` (auto-schema)  | —                  | ODRL JSON stored relationally; `(:OdrlPolicy)` in Neo4j is read-only summary                                 |
| **DCore Transfer State**        | `dataplane` (auto-schema)     | —                  | Ephemeral transfer tokens managed by DCore Rust                                                              |
| **DCP Credentials**             | `identityhub` (auto-schema)   | —                  | W3C VC JSON-LD documents; IdentityHub manages lifecycle                                                      |
| **VC Issuance Records**         | `issuerservice` (auto-schema) | —                  | StatusList2021 entries, issuance audit log                                                                   |
| **Keycloak Users/Roles**        | `keycloak` (Keycloak schema)  | —                  | OAuth2/OIDC state; Keycloak owns the schema                                                                  |
| **CFM Tenants/Provisions**      | `cfm` (CFM schema)            | —                  | Multi-tenant lifecycle; CFM owns the schema                                                                  |
| **Redline Operator State**      | `redlinedb` (Redline schema)  | —                  | Operator dashboard preferences, audit views                                                                  |
| **HealthDCAT-AP Catalog**       | —                             | Layer 2            | Linked data with relationships (Dataset→Distribution→Participant); graph queries essential                   |
| **EEHRxF Profiles**             | —                             | Layer 2b           | Profile→Category→Resource chains; graph traversal pattern                                                    |
| **FHIR Clinical Data**          | —                             | Layer 3            | Patient journeys are inherently graph-shaped; multi-hop traversals (Patient→Condition→SNOMED→IS_A hierarchy) |
| **OMOP CDM Data**               | —                             | Layer 4            | Cohort queries traverse Person→Condition→Measurement→Visit chains; bidirectional FHIR↔OMOP links            |
| **Ontology Backbone**           | —                             | Layer 5            | SNOMED IS_A hierarchies, LOINC component trees, RxNorm ingredient graphs — pure graph traversal              |
| **HDAB Approval Chains**        | —                             | Layer 1            | Participant→Application→Approval→Contract→DataProduct traversal; graph query pattern                         |

#### Event Projection: EDC-V PostgreSQL → Neo4j Layer 1

The EDC-V control plane manages assets, contracts, and transfers as internal state machines in PostgreSQL. To enable rich graph queries (e.g., "show all contracts for a participant with their approval chains"), we project completed events into Neo4j:

```
┌─────────────────────┐    NATS JetStream     ┌──────────────────────┐
│  EDC-V Control Plane │ ──── events ────────▶ │  Neo4j Event Sink    │
│  (PostgreSQL truth)  │    contract.agreed     │  (Projection service)│
│                      │    transfer.completed  │  MERGE (:Contract)   │
│                      │    transfer.started    │  MERGE (:Transfer)   │
└─────────────────────┘                        └──────────────────────┘
```

**Implementation:** A lightweight Node.js service subscribes to NATS JetStream topics (`edc.contract.*`, `edc.transfer.*`) and projects completed state transitions into Neo4j Layer 1 nodes. This provides:

- **Consistency:** EDC-V PostgreSQL is always the source of truth for active state machines
- **Query richness:** Neo4j enables cross-layer graph queries spanning contracts → datasets → patients → ontologies
- **Decoupling:** Neo4j failure doesn't block EDC-V operations

#### Consequences

- EDC-V/CFM databases are opaque — we never write directly to their PostgreSQL schemas
- All Neo4j Layer 1 data is eventually consistent (seconds delay via NATS)
- The Neo4j `(:Contract)`, `(:Participant)`, `(:DataProduct)` nodes in Layer 1 become read-only projections once EDC-V is live (Phase 4)
- Pre-Phase 4 demo data (current synthetic marketplace chain) remains valid for standalone demos

---

### ADR-2: EDC Data Plane Architecture

**Status:** Accepted
**Date:** 2025-07-24
**Context:** The current `docker-compose.jad.yml` configures a single generic DCore HTTP data plane. Phase 4 requires data planes that can serve FHIR clinical data and OMOP analytics from Neo4j. DCore data planes register their capabilities with the EDC-V control plane via DPS (Data Plane Signaling), and the control plane's DataPlaneSelectorService routes transfers to the appropriate plane.

#### Decision

Deploy **two DCore data plane instances** plus a **Neo4j Query Proxy** backend service. The proxy translates HTTP requests into Neo4j Cypher queries and serializes results in the appropriate format (FHIR Bundle JSON or OMOP CSV/JSON).

#### Data Plane Topology

```
                    ┌────────────────────────────────────────────┐
                    │         EDC-V Control Plane                 │
                    │   DataPlaneSelectorService (DPS)            │
                    │   Routes by: transferType + dataAddress     │
                    └──────┬─────────────────────┬───────────────┘
                           │                     │
              ┌────────────┴──────┐    ┌────────┴──────────────┐
              │ DCore Data Plane  │    │ DCore Data Plane      │
              │ "fhir-http"       │    │ "omop-http"           │
              │ ───────────────── │    │ ───────────────────── │
              │ Source: HttpData  │    │ Source: HttpData       │
              │ Dest: HttpData    │    │ Dest: HttpData         │
              │ Transfer: PUSH    │    │ Transfer: PULL         │
              │ Port: 11002       │    │ Port: 11012            │
              └────────┬──────────┘    └────────┬──────────────┘
                       │                        │
              ┌────────┴────────────────────────┴──────────────┐
              │           Neo4j Query Proxy                     │
              │  (Node.js / Express — new service)              │
              │  ────────────────────────────────               │
              │  GET /fhir/Patient/{id}/$everything              │
              │  POST /fhir/Bundle (cohort query)               │
              │  POST /omop/cohort (OMOP aggregate query)       │
              │  GET /catalog/datasets (HealthDCAT-AP metadata) │
              │  Port: 9090                                     │
              └────────────────────┬───────────────────────────┘
                                   │ Bolt
              ┌────────────────────┴───────────────────────────┐
              │              Neo4j 5 Community                  │
              │  Layers 1-5: Health Knowledge Graph             │
              │  Port: 7687 (Bolt) / 7474 (HTTP)               │
              └────────────────────────────────────────────────┘
```

#### Data Plane Specifications

| Property                 | fhir-http Data Plane                                                 | omop-http Data Plane                                                 |
| ------------------------ | -------------------------------------------------------------------- | -------------------------------------------------------------------- |
| **Container**            | `ghcr.io/metaform/jad/dataplane:latest`                              | `ghcr.io/metaform/jad/dataplane:latest`                              |
| **Instance Name**        | `dataplane-fhir`                                                     | `dataplane-omop`                                                     |
| **DPS Registration**     | `sourceType=HttpData, destType=HttpData, transferType=HttpData-PUSH` | `sourceType=HttpData, destType=HttpData, transferType=HttpData-PULL` |
| **Public Port**          | 11002                                                                | 11012                                                                |
| **PostgreSQL DB**        | `dataplane` (shared)                                                 | `dataplane_omop` (new)                                               |
| **Asset Data Address**   | `http://neo4j-proxy:9090/fhir/...`                                   | `http://neo4j-proxy:9090/omop/...`                                   |
| **Content-Type (out)**   | `application/fhir+json`                                              | `application/json` or `text/csv`                                     |
| **Use Case**             | CRO receives FHIR R4 patient bundles                                 | CRO runs OMOP CDM cohort analytics                                   |
| **Transfer Pattern**     | Provider pushes FHIR Bundle to consumer endpoint                     | Consumer pulls query results from provider                           |
| **Contract Enforcement** | EHDS Art. 53 purpose + temporal limit                                | Aggregation-only queries + k-anonymity                               |

#### Neo4j Query Proxy Service

A new lightweight Node.js/Express service that acts as the backend for DCore data addresses:

| Endpoint                         | Method | Description                                               | Neo4j Query                                   |
| -------------------------------- | ------ | --------------------------------------------------------- | --------------------------------------------- |
| `/fhir/Patient/{id}/$everything` | GET    | Patient-level FHIR Bundle (all resources for one patient) | Multi-match Cypher across all Layer 3 nodes   |
| `/fhir/Bundle`                   | POST   | Cohort FHIR Bundle (patients matching criteria)           | Parameterized Cypher with cohort filters      |
| `/omop/cohort`                   | POST   | OMOP CDM aggregate query (count, stats by concept)        | OMOP Layer 4 aggregation Cypher               |
| `/omop/person/{id}/timeline`     | GET    | Single person clinical timeline                           | Person→Visit→Condition/Measurement chain      |
| `/catalog/datasets`              | GET    | HealthDCAT-AP dataset listing (JSON-LD)                   | Layer 2 HealthDataset + Distribution nodes    |
| `/catalog/datasets/{id}`         | GET    | Single dataset metadata (JSON-LD)                         | Specific HealthDataset with all relationships |

**Security:** The proxy only accepts requests from the DCore data plane containers (Docker network isolation). It does NOT perform authorization — that is handled by the EDC-V control plane's contract enforcement before the transfer reaches the data plane.

#### EDC-V Asset Registration (Phase 4a)

Three asset types will be registered on the Clinic's EDC-V control plane:

```json
[
  {
    "assetId": "asset-fhir-cohort-synthea-2026",
    "properties": {
      "name": "Synthea FHIR R4 Patient Cohort",
      "contenttype": "application/fhir+json",
      "type": "FhirCohort",
      "version": "1.0"
    },
    "dataAddress": {
      "type": "HttpData",
      "baseUrl": "http://neo4j-proxy:9090/fhir/Bundle",
      "proxyMethod": true,
      "proxyBody": true
    }
  },
  {
    "assetId": "asset-omop-analytics-synthea-2026",
    "properties": {
      "name": "Synthea OMOP CDM Analytics",
      "contenttype": "application/json",
      "type": "OmopAnalytics",
      "version": "1.0"
    },
    "dataAddress": {
      "type": "HttpData",
      "baseUrl": "http://neo4j-proxy:9090/omop/cohort",
      "proxyMethod": true,
      "proxyBody": true
    }
  },
  {
    "assetId": "asset-catalog-healthdcatap-2026",
    "properties": {
      "name": "HealthDCAT-AP Federated Catalog",
      "contenttype": "application/ld+json",
      "type": "HealthDcatApCatalog",
      "version": "3.0"
    },
    "dataAddress": {
      "type": "HttpData",
      "baseUrl": "http://neo4j-proxy:9090/catalog/datasets"
    }
  }
]
```

#### Docker Compose Changes

New services to add to `docker-compose.jad.yml`:

1. **`dataplane-omop`** — Second DCore instance for OMOP queries (clone of `dataplane` with different ports and DB)
2. **`neo4j-proxy`** — Node.js/Express service bridging DCore ↔ Neo4j
3. **`dataplane_omop` PostgreSQL database** — Add to `jad/init-postgres.sql`

Rename existing `dataplane` → `dataplane-fhir` for clarity.

#### Consequences

- Two data planes provide clear separation of concerns (clinical vs analytics)
- The proxy service is the single integration point between EDC-V and Neo4j
- DCore data planes remain generic HTTP proxies — no custom health logic in Rust
- The proxy can be extended for future data plane types (e.g., DICOM imaging, genomics VCF)
- k-anonymity enforcement happens in the proxy's OMOP query execution layer

---

### ADR-3: W3C HealthDCAT-AP Alignment (Replacing Generic DCAT)

**Status:** Accepted
**Date:** 2025-07-24
**Context:** The current implementation uses `HealthDataset` nodes with custom `hdcatap*`-prefixed properties that approximate HealthDCAT-AP but don't formally follow the [W3C HealthDCAT-AP specification](https://healthdcat-ap.github.io/) vocabulary. The EHDS Regulation mandates HealthDCAT-AP as the metadata standard for health dataset discovery across Health Data Access Bodies. Phase 7c TCK tests (Section 2) will validate HealthDCAT-AP schema compliance.

#### HealthDCAT-AP Specification Overview

**HealthDCAT-AP** is an application profile of [DCAT-AP](https://semiceu.github.io/DCAT-AP/releases/3.0.0/) (the EU Data Catalogue Application Profile), which itself extends [W3C DCAT 3](https://www.w3.org/TR/vocab-dcat-3/). The class hierarchy is:

```
W3C DCAT 3 (generic dataset catalog vocabulary)
  └─ DCAT-AP 3.0 (EU public sector application profile)
      └─ HealthDCAT-AP 1.0 (EHDS health domain extension)
          ├─ Mandatory DCAT-AP properties (title, description, publisher, theme)
          ├─ Recommended DCAT-AP properties (contactPoint, distribution, temporal, spatial)
          └─ Health-specific extensions:
              ├─ healthdcatap:healthCategory (EEHRxF priority category)
              ├─ healthdcatap:healthTheme (MeSH / ICD-10 / SNOMED concept)
              ├─ healthdcatap:minTypicalAge / maxTypicalAge
              ├─ healthdcatap:numberOfRecords / numberOfUniqueIndividuals
              ├─ healthdcatap:populationCoverage (geographic / disease)
              ├─ healthdcatap:publisherType (DataHolder / HDAB / Researcher)
              └─ healthdcatap:legalBasisForAccess (EHDS Article reference)
```

#### Property Mapping: Current → HealthDCAT-AP

The following table maps our current Neo4j `HealthDataset` properties to the formal HealthDCAT-AP/DCAT-AP vocabulary:

| Current Property                   | HealthDCAT-AP Property                   | DCAT-AP Property    | Namespace     | Cardinality | Change                                                              |
| ---------------------------------- | ---------------------------------------- | ------------------- | ------------- | ----------- | ------------------------------------------------------------------- |
| `id` → `datasetId`                 | —                                        | `dct:identifier`    | Dublin Core   | 1..1        | Rename `id` → `dctIdentifier`                                       |
| `title`                            | —                                        | `dct:title`         | Dublin Core   | 1..n        | Keep (already compliant)                                            |
| `description`                      | —                                        | `dct:description`   | Dublin Core   | 1..n        | Keep (already compliant)                                            |
| — (missing)                        | —                                        | `dct:publisher`     | Dublin Core   | 1..1        | Add as relationship `PUBLISHED_BY` → `(:Organization)`              |
| — (missing)                        | —                                        | `dcat:theme`        | DCAT          | 1..n        | Add `themes: String[]` (EuroVoc URIs)                               |
| — (missing)                        | —                                        | `dcat:contactPoint` | DCAT          | 1..n        | Add `contactPoint: String` (vCard URI)                              |
| `issued`                           | —                                        | `dct:issued`        | Dublin Core   | 0..1        | Keep (already compliant)                                            |
| — (missing)                        | —                                        | `dct:modified`      | Dublin Core   | 0..1        | Add `modified: Date`                                                |
| `language`                         | —                                        | `dct:language`      | Dublin Core   | 0..n        | Keep (already compliant)                                            |
| `hdcatapSpatialCoverage`           | —                                        | `dct:spatial`       | Dublin Core   | 0..n        | Rename → `dctSpatial`                                               |
| `hdcatapTemporalCoverageStart/End` | —                                        | `dct:temporal`      | Dublin Core   | 0..1        | Rename → `dctTemporalStart` / `dctTemporalEnd`                      |
| — (missing)                        | —                                        | `dcat:distribution` | DCAT          | 0..n        | Already exists as `HAS_DISTRIBUTION` relationship                   |
| `hdcatapDatasetType`               | `healthdcatap:datasetType`               | —                   | HealthDCAT-AP | 0..1        | Rename → `hdcatapDatasetType` (already correct)                     |
| `hdcatapPersonalData`              | `healthdcatap:personalData`              | —                   | HealthDCAT-AP | 0..1        | Keep                                                                |
| `hdcatapSensitiveData`             | `healthdcatap:sensitiveData`             | —                   | HealthDCAT-AP | 0..1        | Keep                                                                |
| `hdcatapLegalBasis`                | `healthdcatap:legalBasisForAccess`       | —                   | HealthDCAT-AP | 0..n        | Rename → `hdcatapLegalBasisForAccess`                               |
| `hdcatapPurpose`                   | `healthdcatap:purpose`                   | —                   | HealthDCAT-AP | 0..n        | Keep                                                                |
| `hdcatapPopulation`                | `healthdcatap:populationCoverage`        | —                   | HealthDCAT-AP | 0..1        | Rename → `hdcatapPopulationCoverage`                                |
| `hdcatapRecordCount`               | `healthdcatap:numberOfRecords`           | —                   | HealthDCAT-AP | 0..1        | Rename → `hdcatapNumberOfRecords`                                   |
| — (missing)                        | `healthdcatap:numberOfUniqueIndividuals` | —                   | HealthDCAT-AP | 0..1        | Add `hdcatapNumberOfUniqueIndividuals: Long`                        |
| — (missing)                        | `healthdcatap:healthCategory`            | —                   | HealthDCAT-AP | 0..n        | Add `hdcatapHealthCategory: String[]` (EEHRxF categories)           |
| — (missing)                        | `healthdcatap:healthTheme`               | —                   | HealthDCAT-AP | 0..n        | Add `hdcatapHealthTheme: String[]` (MeSH / ICD-10 / SNOMED URIs)    |
| — (missing)                        | `healthdcatap:minTypicalAge`             | —                   | HealthDCAT-AP | 0..1        | Add `hdcatapMinTypicalAge: Integer`                                 |
| — (missing)                        | `healthdcatap:maxTypicalAge`             | —                   | HealthDCAT-AP | 0..1        | Add `hdcatapMaxTypicalAge: Integer`                                 |
| — (missing)                        | `healthdcatap:publisherType`             | —                   | HealthDCAT-AP | 0..1        | Add `hdcatapPublisherType: String` (DataHolder / HDAB / Researcher) |

#### Node Label Changes

| Current Label      | New Label       | Rationale                                                              |
| ------------------ | --------------- | ---------------------------------------------------------------------- |
| `HealthDataset`    | `HealthDataset` | Keep — consistent with HealthDCAT-AP `healthdcatap:Dataset`            |
| `DataDistribution` | `Distribution`  | Rename — DCAT standard uses `dcat:Distribution` not `DataDistribution` |
| `Organization`     | `Organization`  | Keep — DCAT uses `foaf:Organization`                                   |
| `DataCatalog`      | `Catalog`       | Rename — DCAT standard uses `dcat:Catalog`                             |
| — (missing)        | `ContactPoint`  | Add — DCAT requires `vcard:ContactPoint` for dataset contact info      |
| `EhdsPurpose`      | `EhdsPurpose`   | Keep — EHDS-specific, not part of DCAT                                 |

#### Relationship Changes

| Current                                                     | New                                                      | Rationale                                                    |
| ----------------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------ |
| `(:DataCatalog)-[:HAS_DATASET]->(:HealthDataset)`           | `(:Catalog)-[:HAS_DATASET]->(:HealthDataset)`            | Align label                                                  |
| `(:HealthDataset)-[:HAS_DISTRIBUTION]->(:DataDistribution)` | `(:HealthDataset)-[:HAS_DISTRIBUTION]->(:Distribution)`  | Align label                                                  |
| `(:Organization)-[:PUBLISHES]->(:DataCatalog)`              | `(:Organization)-[:PUBLISHES]->(:Catalog)`               | Align label                                                  |
| — (missing)                                                 | `(:HealthDataset)-[:HAS_CONTACT_POINT]->(:ContactPoint)` | DCAT recommended property                                    |
| — (missing)                                                 | `(:HealthDataset)-[:HAS_THEME]->(:EEHRxFCategory)`       | Link HealthDCAT-AP `healthCategory` to existing EEHRxF nodes |

#### JSON-LD Serialization (for Federated Catalog)

The Neo4j Query Proxy (from ADR-2) must serialize `HealthDataset` nodes as valid HealthDCAT-AP JSON-LD for the DSP Federated Catalog protocol:

```json
{
  "@context": {
    "dcat": "http://www.w3.org/ns/dcat#",
    "dct": "http://purl.org/dc/terms/",
    "healthdcatap": "http://healthdcat-ap.eu/ns#",
    "foaf": "http://xmlns.com/foaf/0.1/",
    "vcard": "http://www.w3.org/2006/vcard/ns#"
  },
  "@type": "dcat:Dataset",
  "dct:identifier": "dataset:synthea-fhir-r4-mvd",
  "dct:title": "Synthea Synthetic FHIR R4 Patient Cohort",
  "dct:description": "Synthetic longitudinal patient records...",
  "dct:publisher": {
    "@type": "foaf:Organization",
    "foaf:name": "Health MVD Operator"
  },
  "dcat:theme": ["http://eurovoc.europa.eu/4810"],
  "dct:spatial": "http://publications.europa.eu/resource/authority/country/USA",
  "dct:temporal": {
    "dcat:startDate": "1920-01-01",
    "dcat:endDate": "2025-12-31"
  },
  "healthdcatap:datasetType": "SyntheticData",
  "healthdcatap:personalData": false,
  "healthdcatap:healthCategory": ["patient-summary", "laboratory-results"],
  "healthdcatap:numberOfRecords": 167,
  "healthdcatap:numberOfUniqueIndividuals": 167,
  "healthdcatap:minTypicalAge": 0,
  "healthdcatap:maxTypicalAge": 105,
  "healthdcatap:legalBasisForAccess": "EHDS Article 53 Secondary Use",
  "dcat:distribution": [
    {
      "@type": "dcat:Distribution",
      "dct:title": "Neo4j Bolt Protocol",
      "dcat:accessURL": "bolt://localhost:7687",
      "dcat:mediaType": "application/x-neo4j-bolt",
      "dct:conformsTo": "http://hl7.org/fhir/R4"
    }
  ]
}
```

#### Migration Steps

1. **Graph schema update:** Rename `DataDistribution` → `Distribution`, `DataCatalog` → `Catalog` in `init-schema.cypher` and `health-dataspace-graph-schema.md`
2. **Property migration:** Update `register-fhir-dataset-hdcatap.cypher` to use formal HealthDCAT-AP property names and add missing mandatory properties
3. **Add `ContactPoint` node** to schema with `name`, `email`, `url` properties
4. **Add `HAS_THEME` relationship** from `HealthDataset` to `EEHRxFCategory` nodes (reusing existing Phase 3h nodes)
5. **Neo4j proxy:** Implement JSON-LD serialization in the `/catalog/datasets` endpoint
6. **UI update:** Update the `/catalog` view to display new HealthDCAT-AP properties

#### Consequences

- HealthDCAT-AP compliance enables federated catalog interoperability with other EHDS pilot datasets
- The JSON-LD serialization is required by the DSP Catalog Protocol for cross-HDAB discovery
- Existing Cypher queries referencing `DataDistribution` or `DataCatalog` must be updated
- Phase 7c EHDS compliance tests (HealthDCAT-AP Schema Compliance) will validate the new vocabulary

---

### ADR-4: Next.js 14 as Unified Frontend (Consolidating Angular Reference UIs)

**Status:** Accepted
**Date:** 2025-07-25
**Context:** The Eclipse Dataspace ecosystem provides three separate reference frontend implementations, each built with different Angular versions: [Aruba Participant Portal](https://github.com/Aruba-it-S-p-A/edc-public-participant-portal) (Angular 20, self-registration and credential management), [Fraunhofer End-User API / Data Dashboard](https://github.com/FraunhoferISST/End-User-API) (Angular + daisyUI, data sharing and catalog browsing), and [Dataspace Builder Redline](https://dataspacebuilder.github.io/website/docs/components/redline) (operator dashboard and policy editor). Running all three alongside the existing Next.js UI would mean four frontend stacks — four build pipelines, four dependency trees, four sets of styling conventions, and four runtime processes.

Meanwhile, this project already has a **Next.js 14 application** with 6 working views (Graph Explorer, HealthDCAT-AP Catalogue, Compliance Chain, Patient Journey, OMOP Analytics, EEHRxF Profiles), 8 API routes querying Neo4j over Bolt, Tailwind CSS styling, static export to GitHub Pages, and OpenAPI-generated TypeScript clients for all JAD services (Phase 1d).

#### Decision

Use **Next.js 14 (App Router)** as the single frontend framework for the entire Health Dataspace v2. Port the Aruba, Fraunhofer, and Redline Angular UIs into Next.js pages rather than running them as separate applications.

#### Alternatives Considered

| Option                                | Description                                                                | Pros                                                                                                        | Cons                                                                                             |
| ------------------------------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| **A: Next.js 14 (chosen)**            | Single unified app, port Angular UIs into Next.js pages                    | One build, one deployment, consistent DX, existing 6 views reusable, SSR/ISR support, NextAuth.js ecosystem | Must rewrite Angular component logic in React                                                    |
| **B: Angular 20 monorepo**            | Migrate existing Next.js views to Angular, adopt Aruba/Fraunhofer directly | Reuse reference code as-is, strong typing with Angular forms                                                | Throw away 6 working views + 8 API routes, no SSR (SPA only), lose static export to GitHub Pages |
| **C: Micro-frontends**                | Keep all four apps, compose via Module Federation or iframe embedding      | No rewrite needed, each team owns their stack                                                               | 4 build pipelines, inconsistent UX, complex routing and auth sharing, Docker Compose bloat       |
| **D: Angular + Next.js side-by-side** | Run Angular for EDC-V admin, Next.js for knowledge graph views             | Clear domain separation                                                                                     | Two auth setups, two styling systems, confusing navigation, doubled static hosting config        |

#### Rationale

1. **Existing investment:** 6 views + 8 API routes + Tailwind CSS + mock data layer already work. Rewriting them in Angular means discarding tested code.
2. **Static export:** Next.js `output: "export"` produces a static site deployable to GitHub Pages — the live demo at `ma3u.github.io/MinimumViableHealthDataspacev2` depends on this. Angular can also build static, but the existing `next.config.js` with `basePath` handling is already wired into the GitHub Actions deployment.
3. **API route co-location:** Next.js API routes (`/api/catalog`, `/api/graph`, etc.) run server-side alongside the pages. Adding `/api/participants`, `/api/negotiations`, `/api/transfers` for EDC-V means the frontend and backend share one TypeScript codebase with the same typed EDC clients.
4. **SSR and ISR:** Next.js App Router supports server components and incremental static regeneration. The catalogue view can render server-side with fresh Neo4j data; the compliance chain can cache and revalidate. Angular SPAs require a separate API proxy for this.
5. **Authentication:** NextAuth.js provides a mature Keycloak provider with session management, JWT handling, and role-based middleware. The Angular portals each implement their own PKCE flows. Centralising on NextAuth.js means one auth configuration for all 16 routes.
6. **Portable styling:** All three Angular reference UIs use Tailwind CSS. Porting Tailwind markup from Angular templates to JSX is a mechanical translation — the design tokens, colour scales, and layout classes carry over directly.

#### Technology Stack

| Concern             | Choice                                | Version    | Notes                                                            |
| ------------------- | ------------------------------------- | ---------- | ---------------------------------------------------------------- |
| **Framework**       | Next.js (App Router)                  | 14.2.x     | React 18 server + client components                              |
| **Language**        | TypeScript                            | 5.x        | Strict mode, path aliases `@/`                                   |
| **Styling**         | Tailwind CSS                          | 3.3.x      | Same as Aruba/Fraunhofer, utility-first                          |
| **Icons**           | Lucide React                          | 0.378.x    | Tree-shakeable SVG icons                                         |
| **Graph rendering** | react-force-graph-2d                  | 1.25.x     | Phase 6a interactive graph explorer                              |
| **Neo4j driver**    | neo4j-driver                          | 5.18.x     | Bolt protocol, `disableLosslessIntegers: true`                   |
| **Authentication**  | NextAuth.js + Keycloak                | Phase 2c   | PKCE, JWT sessions, role-based middleware                        |
| **EDC API clients** | OpenAPI-generated TS-fetch            | Phase 1d   | Type-safe clients for all JAD services                           |
| **Linting**         | ESLint + eslint-config-next           | 8.x / 14.x | Next.js recommended rules                                        |
| **Formatting**      | Prettier (pre-commit hook)            | —          | Auto-formats on commit                                           |
| **Static export**   | `output: "export"`                    | —          | GitHub Pages deployment, API routes disabled in export           |
| **Deployment**      | GitHub Pages (static) + Docker (full) | —          | Static demo at GH Pages; full stack via `docker-compose.jad.yml` |

#### Application Structure

```
ui/src/app/
├── layout.tsx              # Root layout with navigation
├── page.tsx                # Home / landing
│
│  Phase 6a (existing — knowledge graph views)
├── graph/page.tsx          # Force-directed 5-layer graph explorer
├── catalog/page.tsx        # HealthDCAT-AP dataset catalogue
├── compliance/page.tsx     # DSP compliance chain inspector
├── patient/page.tsx        # FHIR R4 patient journey timeline
├── analytics/page.tsx      # OMOP CDM research analytics dashboard
├── eehrxf/page.tsx         # EEHRxF profile alignment + gap analysis
│
│  Phase 6b ✅ (dataspace participant portal)
├── onboarding/page.tsx     # Self-registration (from Aruba)
├── onboarding/status/      # Registration status tracker
├── credentials/page.tsx    # VC management (from Aruba)
├── settings/page.tsx       # Participant profile + API keys
├── data/share/page.tsx     # Publish assets with policies (from Fraunhofer)
├── data/discover/page.tsx  # Federated catalog browser (from Fraunhofer)
├── data/transfer/page.tsx  # Transfer monitoring (from Fraunhofer)
├── negotiate/page.tsx      # Contract negotiation wizard (from Fraunhofer)
├── admin/page.tsx          # Operator dashboard (from Redline)
├── admin/tenants/page.tsx  # Tenant management
├── admin/policies/page.tsx # ODRL policy editor
└── admin/audit/page.tsx    # Contract + transfer audit log
│
│  API routes (server-side, not available in static export)
└── api/
    ├── graph/route.ts      # Neo4j Bolt → graph JSON
    ├── catalog/route.ts    # Neo4j Bolt → HealthDCAT-AP JSON
    ├── compliance/route.ts # Neo4j Bolt → compliance chain
    ├── patient/route.ts    # Neo4j Bolt → FHIR timeline
    ├── analytics/route.ts  # Neo4j Bolt → OMOP stats
    ├── eehrxf/route.ts     # Neo4j Bolt → EEHRxF coverage
    ├── participants/       # CFM Tenant Manager API (Phase 6b) ✅
    │   └── me/             # Current participant profile
    ├── credentials/        # IdentityHub + IssuerService (Phase 6b) ✅
    │   └── request/        # VC issuance request
    ├── assets/             # EDC-V v5alpha Admin API (Phase 6b) ✅
    ├── negotiations/       # EDC-V v5alpha DSP API (Phase 6b) ✅
    │   └── [id]/           # Single negotiation status
    ├── transfers/          # EDC-V v5alpha DSP API (Phase 6b) ✅
    │   └── [id]/           # Single transfer status
    └── admin/              # Operator APIs (Phase 6b) ✅
        ├── tenants/        # Tenant list with profiles
        ├── policies/       # Policy definitions CRUD
        └── audit/          # Neo4j provenance graph
```

#### Consequences

- **Positive:** Single build pipeline, single deployment artefact, shared Tailwind design system, unified Keycloak auth, server-side rendering for catalogue/compliance views, consistent TypeScript codebase from Neo4j queries to React components
- **Trade-off:** Must rewrite ~15 Angular components into React. This is a mechanical translation (Tailwind classes port 1:1, REST fetch patterns are identical), but adds Phase 6b implementation effort. Estimated at 2–3 days of porting per sub-phase (6b-1, 6b-2, 6b-3).
- **Risk:** Next.js 14 App Router is stable but newer than Angular's mature ecosystem. Edge cases with `"use client"` directives and server component boundaries may require workarounds for interactive EDC-V admin views. Mitigated by using client components for all form-heavy pages.
- **Static export limitation:** The GitHub Pages static demo cannot serve API routes. Phase 6b views that require live EDC-V/CFM connections will show a "demo mode" banner with mock data when running as a static export, matching the existing pattern used by the 6a views.

---

### ADR-5: JAD + CFM Source Builds (EDC-V 0.16.0-SNAPSHOT + CFM Go Stack)

**Status:** Accepted (revised)
**Date:** 2026-03-09 (revised 2026-03-10)
**Context:** The `docker-compose.jad.yml` references container images from `ghcr.io/metaform/jad/*` and `ghcr.io/eclipse-cfm/cfm/*`. These pre-built images require GHCR authentication (`denied: denied`). However, **both source repositories are public**:

- **JAD** ([github.com/Metaform/jad](https://github.com/Metaform/jad)) — Java/Gradle project using EDC 0.16.0-SNAPSHOT with Virtual Connector BOMs. Produces 4 Docker images via `./gradlew dockerize`.
- **CFM** ([github.com/eclipse-cfm/cfm](https://github.com/eclipse-cfm/cfm)) — Go project using Makefile-based builds. Produces 7 Docker images via `make docker-build`.

Both repos are cloned to `vendor/` (gitignored) and built locally. The locally-built images use the same GHCR-style tags that `docker-compose.jad.yml` expects, so **no compose file image changes were needed**.

#### Decision

Build all connector and management images from source by cloning JAD and CFM repos to `vendor/`. Use `pull_policy: never` in compose to prevent accidental GHCR pull attempts. The custom `connector/` build (EDC 0.13.0) is retained as a simpler fallback but is not the primary deployment path.

**CFM is included in the initial deployment** (not deferred) — Tenant Manager, Provision Manager, and all 4 agents run alongside the EDC-V stack.

#### Alternatives Considered

| Option                                       | Description                                                        | Pros                                                                                    | Cons                                                                          |
| -------------------------------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| **A: Source builds from JAD + CFM (chosen)** | Clone repos, build locally with Gradle/Make                        | Full Virtual Connector features, multi-tenant SaaS, uses reference architecture exactly | Must rebuild on EDC version changes, 0.16.0-SNAPSHOT may have API instability |
| **B: Custom minimal connector (fallback)**   | Our `connector/` Gradle project with EDC 0.13.0 from Maven Central | Stable released version, full extension control, no upstream dependency                 | Lacks Virtual Connector BOMs, no CFM integration, more manual wiring          |
| **C: Tractus-X EDC images**                  | Use `tractusx/edc-*` images                                        | Public, tested                                                                          | Catena-X automotive policies, BPNL validation — irrelevant for health         |
| **D: Wait for public GHCR images**           | Wait for Metaform/Eclipse to publish publicly                      | Zero build effort                                                                       | Blocked indefinitely                                                          |

#### Build Instructions

**Prerequisites:** JDK 17 (Temurin), Docker, Go 1.25+

```bash
# Clone source repos (one-time)
git clone --depth 1 https://github.com/eclipse-cfm/cfm.git vendor/cfm
git clone --depth 1 https://github.com/Metaform/jad.git vendor/jad

# Build CFM images (7 Go images, ~2 min)
cd vendor/cfm && make docker-build

# Build JAD images (4 Java images, ~8 min)
cd vendor/jad
export JAVA_HOME=$(/usr/libexec/java_home -v 17)
unset JAVA_TOOL_OPTIONS
./gradlew dockerize
```

#### Images Produced

| Image (local build tag)                     | Published as (ADR-6)                                     | Source     | Size    | Service                        |
| ------------------------------------------- | -------------------------------------------------------- | ---------- | ------- | ------------------------------ |
| `ghcr.io/metaform/jad/controlplane:latest`  | `ghcr.io/ma3u/health-dataspace/jad-controlplane:latest`  | JAD (Java) | ~283 MB | EDC-V control plane            |
| `ghcr.io/metaform/jad/dataplane:latest`     | `ghcr.io/ma3u/health-dataspace/jad-dataplane:latest`     | JAD (Java) | ~274 MB | DCore data plane (FHIR + OMOP) |
| `ghcr.io/metaform/jad/identity-hub:latest`  | `ghcr.io/ma3u/health-dataspace/jad-identity-hub:latest`  | JAD (Java) | ~275 MB | DCP v1.0 identity hub          |
| `ghcr.io/metaform/jad/issuerservice:latest` | `ghcr.io/ma3u/health-dataspace/jad-issuerservice:latest` | JAD (Java) | ~231 MB | VC issuance service            |
| `ghcr.io/eclipse-cfm/cfm/tmanager:latest`   | `ghcr.io/ma3u/health-dataspace/cfm-tmanager:latest`      | CFM (Go)   | ~18 MB  | Tenant lifecycle manager       |
| `ghcr.io/eclipse-cfm/cfm/pmanager:latest`   | `ghcr.io/ma3u/health-dataspace/cfm-pmanager:latest`      | CFM (Go)   | ~19 MB  | Provision manager              |
| `ghcr.io/eclipse-cfm/cfm/kcagent:latest`    | `ghcr.io/ma3u/health-dataspace/cfm-kcagent:latest`       | CFM (Go)   | ~25 MB  | Keycloak provisioning agent    |
| `ghcr.io/eclipse-cfm/cfm/edcvagent:latest`  | `ghcr.io/ma3u/health-dataspace/cfm-edcvagent:latest`     | CFM (Go)   | ~25 MB  | EDC-V provisioning agent       |
| `ghcr.io/eclipse-cfm/cfm/regagent:latest`   | `ghcr.io/ma3u/health-dataspace/cfm-regagent:latest`      | CFM (Go)   | ~20 MB  | Registration agent             |
| `ghcr.io/eclipse-cfm/cfm/obagent:latest`    | `ghcr.io/ma3u/health-dataspace/cfm-obagent:latest`       | CFM (Go)   | ~20 MB  | Onboarding agent               |

#### Configuration Alignment

All environment variables and config files were aligned with the JAD K8s reference manifests (`vendor/jad/k8s/apps/`):

- **EDC-V services** (controlplane, dataplane, identityhub, issuerservice): Java `-D` style env vars (e.g., `edc.hostname`, `web.http.port`). Validated against K8s ConfigMaps.
- **CFM Go services** (tmanager, pmanager, agents): Flat key-value Viper config files mounted at `/etc/appname/<name>.env`. Config files rewritten from incorrect Spring Boot YAML to correct flat format.
- **Seed jobs**: Three K8s batch Jobs (issuerservice-seed, tenant-manager-seed, provision-manager-seed) translated into a single `jad/seed-jad.sh` script run as a Docker Compose `jad-seed` service (profile: `seed`).

#### Consequences

- **Positive:** Full JAD reference architecture running locally — EDC-V Virtual Connector with multi-tenant CFM management plane, exactly as designed by the JAD project. All 11 services replicate the K8s deployment without KinD.
- **Trade-off:** JAD uses EDC 0.16.0-SNAPSHOT from Sonatype snapshots — not a released version. API may change. Mitigated by pinning to the cloned commit hash.
- **Fallback:** The `connector/` directory contains a simpler EDC 0.13.0 build from Maven Central releases. It can be used if JAD upstream breaks, but lacks Virtual Connector capabilities.
- **Image naming:** Source builds produce upstream GHCR-style tags locally. ADR-6 re-tags and publishes them to `ghcr.io/ma3u/health-dataspace/*` for public pull access.

---

### ADR-6: GHCR Image Publishing (Public Container Registry)

**Status:** Accepted
**Date:** 2026-03-10
**Context:** ADR-5 builds all 11 images from source, but the resulting images are only available on the builder's machine. Other contributors and CI pipelines must either repeat the ~10-minute build or have images published to a shared registry. The upstream GHCR repos (`ghcr.io/metaform/jad/*` and `ghcr.io/eclipse-cfm/cfm/*`) require authentication and are not publicly pullable.

#### Decision

Publish all source-built images to the project's own GHCR namespace at `ghcr.io/ma3u/health-dataspace/*`. Each package is linked to the `MinimumViableHealthDataspacev2` repository so visibility inherits from the repo (public). The `docker-compose.jad.yml` references the published images directly — no `pull_policy: never` needed.

Source builds (ADR-5) remain the authoritative way to produce new images. After building, images are re-tagged and pushed:

```bash
# Re-tag (after source build per ADR-5)
for svc in controlplane dataplane identity-hub issuerservice; do
  docker tag "ghcr.io/metaform/jad/${svc}:latest" "ghcr.io/ma3u/health-dataspace/jad-${svc}:latest"
done
for svc in tmanager pmanager kcagent edcvagent regagent obagent; do
  docker tag "ghcr.io/eclipse-cfm/cfm/${svc}:latest" "ghcr.io/ma3u/health-dataspace/cfm-${svc}:latest"
done
docker tag "health-dataspace/neo4j-proxy:latest" "ghcr.io/ma3u/health-dataspace/neo4j-proxy:latest"

# Push (requires gh auth refresh -s write:packages)
gh auth token | docker login ghcr.io -u ma3u --password-stdin
for img in $(docker images --format '{{.Repository}}:{{.Tag}}' | grep 'ma3u/health-dataspace' | sort); do
  docker push "$img"
done
```

#### Image Registry

| Published Image                                          | Source Image                                | Size    |
| -------------------------------------------------------- | ------------------------------------------- | ------- |
| `ghcr.io/ma3u/health-dataspace/jad-controlplane:latest`  | `ghcr.io/metaform/jad/controlplane:latest`  | ~283 MB |
| `ghcr.io/ma3u/health-dataspace/jad-dataplane:latest`     | `ghcr.io/metaform/jad/dataplane:latest`     | ~274 MB |
| `ghcr.io/ma3u/health-dataspace/jad-identity-hub:latest`  | `ghcr.io/metaform/jad/identity-hub:latest`  | ~275 MB |
| `ghcr.io/ma3u/health-dataspace/jad-issuerservice:latest` | `ghcr.io/metaform/jad/issuerservice:latest` | ~231 MB |
| `ghcr.io/ma3u/health-dataspace/cfm-tmanager:latest`      | `ghcr.io/eclipse-cfm/cfm/tmanager:latest`   | ~18 MB  |
| `ghcr.io/ma3u/health-dataspace/cfm-pmanager:latest`      | `ghcr.io/eclipse-cfm/cfm/pmanager:latest`   | ~19 MB  |
| `ghcr.io/ma3u/health-dataspace/cfm-kcagent:latest`       | `ghcr.io/eclipse-cfm/cfm/kcagent:latest`    | ~25 MB  |
| `ghcr.io/ma3u/health-dataspace/cfm-edcvagent:latest`     | `ghcr.io/eclipse-cfm/cfm/edcvagent:latest`  | ~25 MB  |
| `ghcr.io/ma3u/health-dataspace/cfm-regagent:latest`      | `ghcr.io/eclipse-cfm/cfm/regagent:latest`   | ~20 MB  |
| `ghcr.io/ma3u/health-dataspace/cfm-obagent:latest`       | `ghcr.io/eclipse-cfm/cfm/obagent:latest`    | ~20 MB  |
| `ghcr.io/ma3u/health-dataspace/neo4j-proxy:latest`       | `health-dataspace/neo4j-proxy:latest`       | ~149 MB |

#### Naming Convention

`ghcr.io/ma3u/health-dataspace/{origin}-{service}:latest`

- **`jad-*`** — Java images built from `vendor/jad/` (EDC-V 0.16.0-SNAPSHOT)
- **`cfm-*`** — Go images built from `vendor/cfm/` (CFM management plane)
- **`neo4j-proxy`** — Node.js image built from `services/neo4j-proxy/`

#### Consequences

- **Positive:** Contributors and CI can `docker compose -f docker-compose.jad.yml pull` without building from source. Total pull size ~1.1 GB.
- **Positive:** No more `pull_policy: never` — standard Docker Compose workflow works out of the box.
- **Trade-off:** Images must be re-pushed after each source rebuild. No automated CI pipeline yet (future work).
- **Trade-off:** Images are re-distributions of Eclipse/Metaform open source builds. License compliance maintained via source attribution in ADR-5.
- **Dependency:** Packages must be linked to the `MinimumViableHealthDataspacev2` repository and visibility set to "inherit from repo" (public) via GitHub UI.

---

### ADR-7: DID:web Resolution Architecture and DSP Contract Negotiation

**Status:** Accepted
**Date:** 2026-07-08
**Context:** Phase 4b required a working end-to-end DSP contract negotiation flow between three EHDS participants (Clinic, CRO, HDAB). This demanded functional DID:web resolution, correct DSP 2025-1 protocol usage, and participant activation — none of which were documented as a coherent architecture. This ADR captures the proven, working DID resolution and contract negotiation architecture.

#### DID:web Method and IdentityHub

Each participant in the dataspace has a **W3C DID:web** identifier served by the shared IdentityHub service. The CFM Provision Manager generates Ed25519 key pairs and DID documents during tenant onboarding.

**DID Format:**

```
did:web:identityhub%3A7083:{participant-path}
```

The `%3A7083` is the URL-encoded port (`:7083`) of the IdentityHub DID serving endpoint within the Docker network. The `{participant-path}` maps to the slug chosen during tenant creation.

**Registered Participants:**

| Participant    | DID                                         | Context ID                         | Role                               |
| -------------- | ------------------------------------------- | ---------------------------------- | ---------------------------------- |
| Clinic Charité | `did:web:identityhub%3A7083:clinic-charite` | `d0b1e14e6faa47aca9c2932a5e22885b` | Data Holder (provider)             |
| CRO Bayer      | `did:web:identityhub%3A7083:cro-bayer`      | `4e300dff7d62415e9c409351bb2fe17a` | Data User (consumer)               |
| HDAB BfArM     | `did:web:identityhub%3A7083:hdab-bfarm`     | `9ce6ec7ea12a4c6f957774c3783a988c` | Health Data Access Body (operator) |

#### DID Document Structure

Each DID document follows the [W3C DID Core v1](https://www.w3.org/TR/did-core/) specification:

```json
{
  "id": "did:web:identityhub%3A7083:clinic-charite",
  "@context": ["https://www.w3.org/ns/did/v1"],
  "service": [
    {
      "id": "d0b1e14e...-credentialservice",
      "type": "CredentialService",
      "serviceEndpoint": "http://identityhub:7082/api/credentials/v1/participants/{ctxId}"
    },
    {
      "id": "d0b1e14e...-dsp",
      "type": "ProtocolEndpoint",
      "serviceEndpoint": "http://controlplane:8082/api/dsp/{ctxId}/2025-1"
    }
  ],
  "verificationMethod": [
    {
      "id": "did:web:identityhub%3A7083:clinic-charite#key1",
      "type": "JsonWebKey2020",
      "controller": "did:web:identityhub%3A7083:clinic-charite",
      "publicKeyJwk": {
        "kty": "OKP",
        "crv": "Ed25519",
        "x": "mUG0ISkU50pQW3tWGh5pjz4LjU-29VzDGMH3RIsoBEE"
      }
    }
  ]
}
```

**Service Endpoints:**

- **CredentialService** — DCP credential presentation endpoint at IdentityHub port 7082
- **ProtocolEndpoint** — DSP 2025-1 protocol endpoint at Control Plane port 8082, scoped by participant context ID and protocol version

**Verification Method:**

- Algorithm: **Ed25519** (Curve25519 Edwards form)
- Key format: **JsonWebKey2020** with JWK `kty: OKP, crv: Ed25519`
- Each participant receives a unique Ed25519 key pair generated by CFM during provisioning

#### DID Resolution Architecture

```
┌─────────────────────────────────────────────────────────┐
│              DID Resolution (Docker Network)            │
│                                                         │
│  Consumer (CRO)                                         │
│    │                                                    │
│    │ 1. Parse DID: did:web:identityhub%3A7083:clinic-charite
│    │    → host=identityhub:7083, path=/clinic-charite   │
│    │                                                    │
│    ▼                                                    │
│  IdentityHub :7083  ──── GET /clinic-charite/did.json   │
│    │                                                    │
│    │ 2. Returns DID Document with:                      │
│    │    - ProtocolEndpoint → controlplane:8082/api/dsp/ │
│    │    - CredentialService → identityhub:7082/api/cred/│
│    │    - Ed25519 verification key                      │
│    │                                                    │
│    ▼                                                    │
│  Control Plane :8082  ──── DSP 2025-1 Protocol          │
│    (catalog, negotiation, transfer)                     │
└─────────────────────────────────────────────────────────┘
```

**IdentityHub Port Map:**

| Port | Purpose                                   | Host Mapping    |
| ---- | ----------------------------------------- | --------------- |
| 7080 | Readiness probe                           | —               |
| 7081 | Identity API (participant management)     | localhost:11005 |
| 7082 | Credential Service (DCP presentations)    | —               |
| 7083 | DID Document Serving (`/{path}/did.json`) | Internal only   |
| 7084 | Secure Token Service (STS)                | —               |

> **Important:** Port 7083 (DID serving) is Docker-internal only. External DID resolution uses Traefik routing: `Host('ih.localhost') && PathPrefix('/.well-known')` → port 7083.

#### Participant Activation Requirement

CFM creates participant contexts in **CREATED** state (200). DID documents are only served and DSP endpoints only function when participants are in **ACTIVATED** state (300).

```
CREATED (200)  ──── activation ────▶  ACTIVATED (300)
  │                                       │
  │ DID doc: ✗ not served                 │ DID doc: ✓ served
  │ DSP:     ✗ no protocol endpoint       │ DSP:     ✓ full protocol support
  │ Catalog: ✗ cannot discover assets     │ Catalog: ✓ assets discoverable
```

**Activation method:** The EDC-V Management API `PUT /api/mgmt/v1alpha/participants/{ctxId}/activate` endpoint is the intended mechanism, but currently returns HTTP 403 in the JAD deployment. Workaround: direct PostgreSQL update on the `participant_context` table.

#### Contract Negotiation Flow: CRO → Clinic

The complete DSP contract negotiation follows the [DSP 2025-1](https://docs.internationaldataspaces.org/ids-knowledgebase/dataspace-protocol) specification:

```
CRO (Consumer)                    Clinic (Provider)
     │                                  │
     │  Step 1: Catalog Discovery       │
     │  POST /catalog (v1alpha)         │
     │  {counterPartyDid: clinic DID}   │
     │ ────────────────────────────────▶│
     │                                  │
     │  ◀─── DCAT Catalog response ─── │
     │  (datasets + offers + policies)  │
     │                                  │
     │  Step 2: Contract Negotiation    │
     │  POST /contractnegotiations      │
     │  (v5alpha)                       │
     │  {                               │
     │    protocol: "dataspace-protocol- │
     │      http:2025-1",               │
     │    counterPartyAddress:          │
     │      controlplane:8082/api/dsp/  │
     │      {clinicCtxId}/2025-1,       │
     │    offer: {offerId, assetId,     │
     │            policy from catalog}  │
     │  }                               │
     │ ────────────────────────────────▶│
     │                                  │
     │  ◀─── FINALIZED ────────────── │
     │  (contractAgreementId assigned)  │
     │                                  │
     │  Step 3: Transfer Process        │
     │  POST /transferprocesses         │
     │  (v5alpha)                       │
     │  {                               │
     │    contractId: agreementId,      │
     │    assetId: "fhir-patient-       │
     │      everything",                │
     │    transferType: "HttpData-PULL" │
     │  }                               │
     │ ────────────────────────────────▶│
     │                                  │
     │  ◀─── STARTED ─────────────── │
     │  (data plane endpoint available) │
```

**Proven Working State (as of Phase 4b):**

| Metric                                             | Count                                   |
| -------------------------------------------------- | --------------------------------------- |
| FINALIZED negotiations (CRO→Clinic)                | 3                                       |
| FINALIZED negotiations (HDAB→Clinic)               | 1 (healthdcatap-catalog)                |
| TERMINATED negotiations (protocol errors, pre-fix) | 2                                       |
| Transfer processes STARTED                         | 2 (fhir-patient + healthdcatap-catalog) |
| Transfer processes REQUESTED                       | 2                                       |
| Clinic provider-side negotiations                  | 4 (all FINALIZED)                       |

**API Endpoints Used:**

| Step      | API            | Version | Path                                                               |
| --------- | -------------- | ------- | ------------------------------------------------------------------ |
| Catalog   | Management API | v1alpha | `POST /api/mgmt/v1alpha/participants/{ctxId}/catalog`              |
| Negotiate | Management API | v5alpha | `POST /api/mgmt/v5alpha/participants/{ctxId}/contractnegotiations` |
| Transfer  | Management API | v5alpha | `POST /api/mgmt/v5alpha/participants/{ctxId}/transferprocesses`    |

**Required `@context`:**

```json
["https://w3id.org/edc/connector/management/v2"]
```

#### HDAB Operator Oversight

The HDAB (BfArM) has visibility into the dataspace as an operator. In future phases, the HDAB will:

1. **Federated Catalog** — Aggregate dataset descriptions from all data holders (Phase 4c)
2. **Policy Enforcement** — Validate EHDS Article 53 compliance before contract agreements
3. **Audit Trail** — Monitor all contract negotiations and transfers across the dataspace

Currently, the HDAB participant context is provisioned and activated (`did:web:identityhub%3A7083:hdab-bfarm`, state=300) and has successfully negotiated a contract for the `healthdcatap-catalog` asset (Phase 4c). HDAB can discover all 4 datasets from Clinic via DSP catalog request and has an active HttpData-PULL transfer for catalog metadata. Further HDAB oversight functionality is planned for Phase 6b (Operator Dashboard).

#### Consequences

- **Positive:** Full end-to-end DSP 2025-1 contract negotiation proven working between CRO and Clinic with 3 FINALIZED agreements
- **Positive:** DID:web resolution architecture documented with exact port mappings, DID document structure, and service endpoints
- **Positive:** Four root causes identified and resolved (see Phase 4 notes): URI format, activation state, protocol version suffix, data plane hostname
- **Trade-off:** DID documents use Docker-internal hostnames (`identityhub:7083`), limiting resolution to within the Docker network. Production deployments would use proper domain names
- **Trade-off:** Participant activation requires direct PostgreSQL workaround due to Management API returning 403
- **Dependency:** Transfer completion (STARTED → COMPLETED) depends on Phase 4d (DCore data plane transfer configuration)

---

### ADR-8: Comprehensive Testing Strategy (Vitest + Playwright + Supertest)

**Status:** Accepted
**Date:** 2026-03-11
**Context:** The Health Dataspace v2 has grown to 22 Next.js pages, 15+ API routes, a Neo4j Query Proxy (Express/Node.js) service, and multiple integration points (Neo4j, Keycloak, EDC-V/CFM). Through Phases 1–7, all validation was manual (curl scripts, browser testing, seed scripts). As the project approaches production readiness, automated testing is essential for regression prevention, CI/CD confidence, and contributor onboarding.

The testing landscape for Next.js 14 (App Router) with TypeScript has several mature options. This ADR evaluates alternatives and selects the optimal combination for this project's architecture.

#### Decision {#decision-8}

Adopt a **three-tier testing strategy** using:

1. **Vitest** — Unit and integration tests for API routes, library modules, and React components
2. **Playwright** — End-to-end browser tests for critical user journeys
3. **Supertest** — HTTP integration tests for the Neo4j Query Proxy (Express)

#### Alternatives Considered {#alternatives-considered-8}

| Framework                     | Category           | Pros                                                                                                     | Cons                                                                                                              | Verdict                                                          |
| ----------------------------- | ------------------ | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| **Vitest**                    | Unit / Integration | Native ESM + TypeScript, Vite-based (fast), Jest-compatible API, first-class mocking, workspace support  | Newer ecosystem than Jest                                                                                         | **Selected** — best DX for modern TypeScript                     |
| **Jest**                      | Unit / Integration | Largest ecosystem, widely documented, mature                                                             | Slow ESM support, requires `ts-jest` or SWC transform, CJS-first architecture                                     | Rejected — Vitest is faster and natively supports ESM/TypeScript |
| **Playwright**                | E2E Browser        | Microsoft-backed, multi-browser (Chromium/Firefox/WebKit), auto-wait, trace viewer, built-in test runner | Heavier than Cypress for simple tests                                                                             | **Selected** — superior multi-browser support and reliability    |
| **Cypress**                   | E2E Browser        | Beautiful GUI, time-travel debugging, large community                                                    | Single-browser execution, no native multi-tab, slower CI runs, limited network interception for server components | Rejected — Playwright is faster in CI and supports all browsers  |
| **Supertest**                 | HTTP API           | Lightweight, Express-native, chain assertions, no server boot needed                                     | Only for Express/HTTP, no browser                                                                                 | **Selected** — perfect fit for Neo4j Query Proxy                 |
| **Testing Library**           | Component          | Framework-agnostic, accessibility-first queries, works with Vitest                                       | —                                                                                                                 | **Selected** — used with Vitest for React component tests        |
| **MSW (Mock Service Worker)** | Mocking            | Network-level request interception, works in both Node and browser                                       | Additional dependency                                                                                             | **Selected** — used for mocking Neo4j and EDC-V in tests         |

#### Rationale {#rationale-8}

1. **Vitest over Jest:** The project uses TypeScript with ESM (`"module": "esnext"` in tsconfig). Vitest runs TypeScript natively without transpilation config. Jest requires `ts-jest` or `@swc/jest` and struggles with ESM imports. Vitest's watch mode is 10-20× faster due to Vite's module graph.

2. **Playwright over Cypress:** The UI runs in Docker containers and CI environments. Playwright's headless multi-browser testing is faster in CI (parallel browser contexts vs. Cypress's serial execution). Playwright's `@playwright/test` runner includes built-in fixtures, auto-retries, and trace recording. Cypress's commercial dashboard features are not needed.

3. **Supertest for Express:** The `neo4j-proxy` is a standalone Express service with 12+ endpoints. Supertest allows testing Express apps without starting an HTTP server, ideal for unit-testing route handlers with mocked Neo4j drivers.

4. **Testing Library + MSW:** React Testing Library with `@testing-library/react` provides accessibility-first component queries. MSW intercepts fetch calls at the network level, enabling realistic API mocking without modifying application code.

#### Test Architecture {#test-architecture}

```
ui/
├── vitest.config.ts              # Vitest configuration
├── __tests__/
│   ├── unit/                     # Pure function + component tests
│   │   ├── lib/
│   │   │   ├── neo4j.test.ts     # Neo4j driver wrapper
│   │   │   └── edc-client.test.ts # EDC API client
│   │   └── components/
│   │       ├── Navigation.test.tsx
│   │       └── UserMenu.test.tsx
│   ├── api/                      # API route integration tests
│   │   ├── catalog.test.ts       # GET /api/catalog
│   │   ├── graph.test.ts         # GET /api/graph
│   │   ├── negotiations.test.ts  # GET/POST /api/negotiations
│   │   └── transfers.test.ts     # GET/POST /api/transfers
│   └── e2e/                      # Playwright browser tests
│       ├── home.spec.ts          # Landing page navigation
│       ├── catalog.spec.ts       # Dataset catalog browsing
│       ├── graph.spec.ts         # Graph explorer interaction
│       └── patient.spec.ts       # Patient journey timeline
│
services/neo4j-proxy/
├── vitest.config.ts              # Separate Vitest config
└── __tests__/
    ├── health.test.ts            # GET /health
    ├── fhir-patient.test.ts      # GET /fhir/Patient
    ├── omop-cohort.test.ts       # POST /omop/cohort
    └── catalog.test.ts           # GET /catalog/datasets
```

**Coverage targets:**

| Layer            | Target           | Rationale                                      |
| ---------------- | ---------------- | ---------------------------------------------- |
| API routes       | 90%+             | Critical data paths between UI and Neo4j/EDC-V |
| Library modules  | 85%+             | Shared utilities (neo4j.ts, edc/client.ts)     |
| React components | 70%+             | Key interaction patterns (navigation, filters) |
| E2E journeys     | 5 critical paths | Smoke tests for deployment validation          |
| Neo4j proxy      | 90%+             | Standalone service, full route coverage        |

**CI Integration:**

```yaml
# .github/workflows/test.yml
name: Test Suite
on: [push, pull_request]
jobs:
  unit-integration:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: cd ui && npm ci && npx vitest run --coverage
      - run: cd services/neo4j-proxy && npm ci && npx vitest run --coverage
  e2e:
    runs-on: ubuntu-latest
    needs: unit-integration
    steps:
      - uses: actions/checkout@v4
      - run: docker compose up -d neo4j
      - run: cd ui && npm ci && npx playwright install && npx playwright test
```

#### Consequences {#consequences-7}

- **Positive:** Fast feedback loop — Vitest runs in <2s for unit tests, enabling TDD workflow
- **Positive:** Comprehensive coverage across all three tiers (unit → integration → E2E)
- **Positive:** CI-friendly — all tools support headless execution and JUnit/JSON reporters
- **Positive:** MSW mocking enables testing API routes without live Neo4j/EDC-V dependencies
- **Trade-off:** Three test frameworks to maintain (Vitest + Playwright + Supertest) vs. a single-framework approach. Mitigated by clear separation: Vitest for fast tests, Playwright for browser tests, Supertest for Express routes.
- **Trade-off:** Playwright E2E tests are slower (~30s per test) and require Docker services. Run only in CI and manually, not in watch mode.
- **Dependency:** MSW v2 requires ESM-compatible test setup (satisfied by Vitest)

---

## Target Architecture

```
┌─────────────────────────────────────────────────────────────┐
│             TCK & Compliance Verification (Phase 7)         │
│  DSP 2025-1 TCK (140+ tests) · DCP v1.0 Suite · EHDS Tests│
└────────────┬──────────────────────────────┬─────────────────┘
             │                              │
┌────────────┴──────────────────────────────┴─────────────────┐
│          Unified Next.js 14 Portal (Phase 6a + 6b)         │
│  Graph Explorer · Catalog · Compliance · Patient · OMOP    │
│  Onboarding · Credentials · Data Sharing · Operator Admin  │
│  (Keycloak SSO via NextAuth.js · OpenAPI TypeScript clients)│
└────────────┬──────────────────────────────┬─────────────────┘
             │                              │
┌────────────┴──────────────────────────────┴─────────────────┐
│                    CFM (Management Plane)                   │
│  Tenant Manager · Provision Manager · Operator API          │
│  Credential Issuance · Lifecycle Management                 │
└────────────┬──────────────────────────────┬─────────────────┘
             │                              │
    ┌────────┴────────┐           ┌────────┴────────┐
    │   EDC-V Clinic  │           │   EDC-V CRO     │
    │  Control Plane  │           │  Control Plane  │
    │  (DSP + DCP)    │           │  (DSP + DCP)    │
    └───┬────────┬────┘           └────────┬────────┘
        │        │                         │
 ┌──────┴──┐ ┌──┴─────────┐    ┌──────────┴─────────┐
 │ DCore   │ │ DCore      │    │  DCore Rust        │
 │ fhir-   │ │ omop-      │    │  Data Plane (CRO)  │
 │ http    │ │ http       │    │  (Query HTTP)      │
 │ (PUSH)  │ │ (PULL)     │    └────────────────────┘
 └────┬────┘ └─────┬──────┘
      │            │
 ┌────┴────────────┴──────┐     ┌─────────────────────────┐
 │  Neo4j Query Proxy     │     │  PostgreSQL 17           │
 │  (Node.js/Express)     │     │  ─────────────────       │
 │  /fhir/* → Cypher      │     │  controlplane (EDC-V)    │
 │  /omop/* → Cypher      │     │  identityhub (DCP)       │
 │  /catalog/* → JSON-LD  │     │  issuerservice (VC)      │
 │  Port: 9090            │     │  dataplane (DCore state)  │
 └──────────┬─────────────┘     │  keycloak (OAuth2)       │
            │ Bolt              │  cfm (Tenant/Provision)  │
 ┌──────────┴─────────────┐     └─────────────────────────┘
 │     Neo4j 5 Community  │
 │  L1: Marketplace (DSP Contract Projections)       │
 │  L2: HealthDCAT-AP Catalog (W3C vocabulary)       │
 │  L3: FHIR Clinical Graph (Patient Data)           │
 │  L4: OMOP Research (Secondary Use Analytics)      │
 │  L5: Ontology Backbone (SNOMED/LOINC/ICD/RxNorm)  │
 └────────────────────────────────────────────────────┘
```

---

## What This Proves

When complete, the Health MVD v2 will demonstrate:

1. **End-to-end EHDS compliance** — From participant onboarding (DCP credentials) through contract negotiation (DSP policies) to data access (SPE-enforced queries)
2. **Cloud-native multi-tenancy** — CFM managing multiple EDC-V instances for clinics, CROs, and HDABs on shared infrastructure
3. **Disaggregated data planes** — Purpose-built DCore Rust HTTP planes: FHIR PUSH for clinical bundles, OMOP PULL for analytics queries, routed via DPS
4. **Dual-store architecture** — PostgreSQL for EDC-V/CFM transactional state, Neo4j for relationship-rich health knowledge graph, with NATS event projection bridging Layer 1
5. **HealthDCAT-AP compliance** — Formal W3C HealthDCAT-AP vocabulary for dataset metadata, enabling federated catalog interoperability across HDABs via JSON-LD serialization
6. **Federated knowledge graphs** — Cross-HDAB analytics without centralizing patient data
7. **Production-grade schema** — The 5-layer Neo4j health graph model working with real FHIR/OMOP data
8. **Protocol conformance** — DSP 2025-1 TCK passing (140+ test cases), DCP v1.0 compliance verified, EHDS-specific tests validating Article 53 enforcement
9. **Unified portal experience** — Single Next.js 14 app serving participant onboarding (Aruba pattern), data sharing (Fraunhofer pattern), operator admin (Redline pattern), and health knowledge graph exploration

The [JAD demo](https://github.com/Metaform/jad) provides the cloud-provider reference for EDC-V + CFM. The Health MVD v2 extends this with the **domain-specific health knowledge layer** — the piece that makes a generic dataspace into a health dataspace.

---

## Implementation Dependencies

```mermaid
graph TD
    P3[Phase 3: Health Knowledge Graph ✅] --> P4[Phase 4: Dataspace Integration]
    P1[Phase 1: JAD Infrastructure] --> P2[Phase 2: DCP Identity & Trust]
    P1 --> P4
    P2 --> P4
    P2 --> P7[Phase 7: TCK Compliance]
    P1 --> P7
    P4 --> P5[Phase 5: Federated Queries & GraphRAG]
    P1 --> P6b[Phase 6b: Unified Portal]
    P2 --> P6b
    P4 --> P6b
    P3 --> P6a[Phase 6a: Graph Explorer UI ✅]

    style P3 fill:#22c55e,color:#fff
    style P6a fill:#22c55e,color:#fff
    style P1 fill:#f59e0b,color:#fff
    style P2 fill:#f59e0b,color:#fff
    style P4 fill:#64748b,color:#fff
    style P5 fill:#64748b,color:#fff
    style P6b fill:#64748b,color:#fff
    style P7 fill:#8b5cf6,color:#fff
```

**Critical path:** Phase 1 (JAD infrastructure) → Phase 2 (DCP identity) → Phase 4 (dataspace integration) → Phase 6b (unified portal)

**Parallel track:** Phase 7 (TCK compliance) can begin as soon as Phases 1–2 complete, running in parallel with Phase 4.

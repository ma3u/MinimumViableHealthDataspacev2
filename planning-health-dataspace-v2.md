# Planning: Health Dataspace v2

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

| Phase  | Title                                                  | Status         | Notes                                                                                            |
| ------ | ------------------------------------------------------ | -------------- | ------------------------------------------------------------------------------------------------ |
| **1**  | Infrastructure Migration (EDC-V + DCore + CFM)         | 🔲 Not started | Highest priority for full dataspace functionality                                                |
| **2**  | Identity and Trust (DCP v1.0 + Verifiable Credentials) | 🔲 Not started | Depends on Phase 1                                                                               |
| **3**  | Health Knowledge Graph Layer — Schema & Synthetic Data | ✅ Complete    | 5-layer Neo4j schema, EHDS HDAB chain, style sheet                                               |
| **3b** | Real FHIR Data Pipeline (Synthea → Neo4j → OMOP)       | ✅ Complete    | 127 patients · 3,031 encounters · 1,045 conditions · 19,195 observations · 2,232 drug Rxes       |
| **3c** | HealthDCAT-AP Metadata Registration for FHIR Dataset   | ✅ Complete    | Synthea cohort registered as HealthDCAT-AP catalog entry; 2 distributions + EHDS Art 53 purpose  |
| **3d** | README + UI completeness hardening                     | ✅ Complete    | README step order fixed; catalog UI shows datasetType/legalBasis/recordCount                     |
| **3e** | DSP Marketplace Registration + Compliance Chain        | ✅ Complete    | Layer 1 DataProduct/Contract/HDABApproval wired to Synthea dataset; compliance UI live dropdowns |
| **3f** | OMOP Research Analytics View                           | ✅ Complete    | Layer 4 cohort dashboard: top conditions/drugs/measurements, gender breakdown, stat cards        |
| **4**  | Dataspace Integration (EDC-V ↔ Neo4j data assets)     | 🔲 Not started | Depends on Phases 1, 2, 3c                                                                       |
| **5**  | Federated Queries & GraphRAG                           | 🔲 Not started | Depends on Phase 4                                                                               |
| **6a** | Graph Explorer UI (Next.js → Neo4j Bolt)               | ✅ Complete    | Four views; runs at localhost:3000                                                               |
| **6b** | Full Participant Portal (Aruba + Fraunhofer + Redline) | 🔲 Not started | Depends on Phases 1–4                                                                            |

---

## Implementation Roadmap

### Phase 1: Infrastructure Migration

1. Replace the monolithic EDC Connector with **EDC-V** as the virtualized control plane
2. Deploy **DCore** Rust-based HTTP data plane for FHIR Bundle transfers
3. Set up **CFM** with Tenant Manager and Provision Manager for multi-participant orchestration
4. Configure three tenant profiles:
   - **Clinic** (data provider — FHIR R4 patient data)
   - **CRO** (data consumer — OMOP research queries)
   - **HDAB** (intermediary — HealthDCAT-AP catalog + SPE operator)

### Phase 2: Identity and Trust

5. Implement DCP v1.0 credential flows using EDC-V's built-in IdentityHub:
   - Generate DID:web identifiers for each participant
   - Issue Verifiable Credentials via CFM's IssuerService integration
   - Configure credential presentation during DSP contract negotiation
6. Set up a Credential Issuer Service representing a trust anchor (simulated EHDS authority)
7. Define EHDS-specific credential types:
   - `EHDSParticipantCredential` (proof of HDAB registration)
   - `DataProcessingPurposeCredential` (EHDS Article 53 permitted purpose attestation)

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

**Current graph state (50-patient Synthea cohort, Massachusetts):**

| Layer 3 FHIR      | Count  | Layer 4 OMOP            | Count |
| ----------------- | ------ | ----------------------- | ----- |
| Patient           | 127\*  | OMOPPerson              | 127   |
| Encounter         | 3,031  | OMOPVisitOccurrence     | 3,031 |
| Condition         | 1,045  | OMOPConditionOccurrence | 1,045 |
| Observation       | 19,195 | OMOPMeasurement         | 737   |
| MedicationRequest | 2,232  | OMOPDrugExposure        | 2,232 |

_\* 127 includes deceased patients generated by Synthea alongside the 50 living target patients._

The Graph Explorer UI (`/graph` and `/patient`) immediately reflects the real patient data.

### Phase 3c: HealthDCAT-AP Metadata Registration ✅

The Synthea cohort loaded in Phase 3b needs a corresponding **Layer 2** catalog entry so EDC-V can expose it as a discoverable data asset. This is implemented as an idempotent Cypher script:

- `neo4j/register-fhir-dataset-hdcatap.cypher` — creates/updates the `HealthDataset` node with full HealthDCAT-AP properties (title, description, publisher, temporal coverage, spatial coverage, themes, access conditions)
- Links the dataset to all 127 `Patient` nodes via `FROM_DATASET`
- Registers a `DataDistribution` node (Bolt + REST endpoints) so EDC-V can reference the access URL
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

- MERGEs three Participants: `Charité Berlin` (CLINIC), `Bayer Research` (CRO), `BfArM` (HDAB)
- Creates `DataProduct {productId: 'product-synthea-fhir-r4-2026'}` → `[:DESCRIBED_BY]` → `HealthDataset {id: 'dataset:synthea-fhir-r4-mvd'}`
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

### Phase 4: Dataspace Integration

12. Wire the Neo4j health graph into the EDC-V data plane:
    - Register Neo4j Cypher query endpoint as a DSP Data Asset
    - Define usage policies (EHDS purpose restriction, temporal limits, anonymization requirements)
    - Implement contract negotiation: CRO requests access → HDAB validates credentials → contract agreed → query endpoint provisioned
13. Implement **Federated Catalog** with HealthDCAT-AP:
    - Clinic publishes dataset descriptions to HDAB catalog
    - CRO discovers available cohorts via federated catalog search
    - CFM orchestrates catalog federation across multiple HDAB instances
14. Implement **Data Plane Signaling** for FHIR transfer:
    - DCore Rust data plane handles FHIR Bundle HTTP transfers
    - Control plane (EDC-V) signals start/suspend/terminate via DPS
    - Transfer audit log captured in Neo4j provenance graph

### Phase 5: Federated Queries and GraphRAG

15. Deploy two separate Neo4j instances (simulating two HDAB SPEs)
16. Configure **Neo4j Composite Database** for federated Cypher queries across both instances
17. Implement **Privacy-Preserving Multiparty Query** layer using SMPC protocols
18. Add **GraphRAG interface** for natural language querying of patient journeys:
    - Neo4j Text2Cypher for natural language → Cypher translation
    - Vector embeddings for semantic search across clinical narratives
    - Structured + unstructured retrieval for comprehensive patient context

### Phase 6a: Graph Explorer UI ✅

Deployed as a standalone Next.js 14 web app connecting directly to Neo4j Bolt — no EDC-V dependency, immediately useful for demos and stakeholder review.

| View            | Path          | Description                                        |
| --------------- | ------------- | -------------------------------------------------- |
| Graph Explorer  | `/graph`      | Force-directed graph of all 5 architecture layers  |
| Dataset Catalog | `/catalog`    | HealthDCAT-AP metadata browser                     |
| EHDS Compliance | `/compliance` | HDAB approval chain validator (Articles 45–52)     |
| Patient Journey | `/patient`    | FHIR R4 → OMOP CDM event timeline                  |
| OMOP Analytics  | `/analytics`  | Cohort-level OMOP CDM research analytics dashboard |

### Phase 6b: Full Participant Portal

19. Deploy **Participant & Operator Dashboards** using [Dataspace Builder Redline](https://dataspacebuilder.github.io/website/docs/components/redline)
20. Implement **Ecosystem Onboarding Portals**:
    - [Aruba EDC Public Participant Portal](https://github.com/Aruba-it-S-p-A/edc-public-participant-portal) — self-registration for Clinics and CROs
    - [Fraunhofer ISST End-User API](https://github.com/FraunhoferISST/End-User-API/tree/feat/ecosystem-registration) — automated credential provisioning via Keycloak/CFM

---

## Target Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                 Ecosystem & End-User Portals                │
│  (Aruba Participant Portal / Fraunhofer End-User API / Redline) │
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
    └────────┬────────┘           └────────┬────────┘
             │                              │
    ┌────────┴────────┐           ┌────────┴─────────┐
    │  DCore Rust     │           │  DCore Rust      │
    │  Data Plane     │           │  Data Plane      │
    │  (FHIR HTTP)    │           │  (Query HTTP)    │
    └────────┬────────┘           └────────┴─────────┘
             │                              │
    ┌────────┴──────────────────────────────┴─────────┐
    │              HDAB (Intermediary)                  │
    │  EDC-V Control Plane + Federated Catalog         │
    │  HealthDCAT-AP Metadata · Contract Enforcement   │
    └────────────────────┬────────────────────────────┘
                         │
    ┌────────────────────┴────────────────────────────┐
    │           Neo4j Health Knowledge Graph            │
    │  Layer 1: Marketplace (DSP Contracts)            │
    │  Layer 2: HealthDCAT-AP (Metadata)               │
    │  Layer 3: FHIR Clinical Graph (Patient Data)     │
    │  Layer 4: OMOP Research (Secondary Use)           │
    │  Layer 5: Ontology Backbone (SNOMED/LOINC/ICD)   │
    └──────────────────────────────────────────────────┘
```

---

## What This Proves

When complete, the Health MVD v2 will demonstrate:

1. **End-to-end EHDS compliance** — From participant onboarding (DCP credentials) through contract negotiation (DSP policies) to data access (SPE-enforced queries)
2. **Cloud-native multi-tenancy** — CFM managing multiple EDC-V instances for clinics, CROs, and HDABs on shared infrastructure
3. **Disaggregated data planes** — DCore Rust HTTP planes independently handling FHIR transfers and query results
4. **Federated knowledge graphs** — Cross-HDAB analytics without centralizing patient data
5. **Production-grade schema** — The 5-layer Neo4j health graph model working with real FHIR/OMOP data

The [JAD demo](https://github.com/Metaform/jad) provides the cloud-provider reference for EDC-V + CFM. The Health MVD v2 extends this with the **domain-specific health knowledge layer** — the piece that makes a generic dataspace into a health dataspace.

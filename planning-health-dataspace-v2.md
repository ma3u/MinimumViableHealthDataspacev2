# Planning: Health Dataspace v2

## Background & Inspiration

This phase of the project is contextualized and inspired by:
[European Health Dataspaces, Digital Twins: A Journey from FHIR Basics to Intelligent Patient Models](https://www.linkedin.com/pulse/european-health-dataspaces-digital-twins-journey-fhir-buchhorn-roth-8t51c/)

---

## What I'm Building Next: Extending the MVD with Next-Gen EDC Components

The Eclipse Dataspace ecosystem has undergone a fundamental architectural evolution since my first health demo. Three new projects change how dataspaces are built and operated — and my [MinimumViableDataspace health demo](https://github.com/ma3u/MinimumViableDataspace/tree/health-demo) needs to evolve with them.

### The New EDC Component Architecture

The original MVD used a monolithic EDC Connector with an embedded data plane. The new architecture disaggregates this into purpose-built components:

| Component                          | Project                                                                                    | Purpose                                                           | Key Change                                                                                                                                                                       |
| ---------------------------------- | ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **EDC-V** (Virtual Connector)      | [eclipse-edc/Virtual-Connector](https://github.com/eclipse-edc/Virtual-Connector)          | Virtualized control plane optimized for cloud service providers   | Multi-tenant isolation, participant-scoped APIs, provisioning system integration [github](https://github.com/eclipse-edc/Virtual-Connector/blob/main/docs/administration_api.md) |
| **DCore** (Data Plane Core)        | [Eclipse Data Plane Core](https://projects.eclipse.org/projects/technology.dataplane-core) | Multi-language data plane SDKs (Go, Java, .NET, Rust, TypeScript) | Rust-based HTTP data plane, Data Plane Signaling spec compliance [projects.eclipse](https://projects.eclipse.org/proposals/eclipse-data-plane-core)                              |
| **CFM** (Connector Fabric Manager) | [Eclipse CFM](https://projects.eclipse.org/proposals/eclipse-cfm)                          | Management plane for multi-tenant connector orchestration         | Tenant Manager + Provision Manager, multi-role UI (operator, reseller, end user) [projects.eclipse](https://projects.eclipse.org/proposals/eclipse-connector-fabric-manager)     |
| **JAD** (Joint Architecture Demo)  | [Metaform/jad](https://github.com/Metaform/jad)                                            | Reference demonstrator combining EDC-V + CFM + DCore + onboarding | Replaces old MVD as the canonical demo for cloud provider deployments [linkedin](https://www.linkedin.com/posts/mbuchhorn_fulcrum-daas-edc-activity-7427340949279809536-OaG6)    |

EDC-V is not a monolith — it consists of multiple services and subsystems with separate administration APIs, strictly enforcing isolation boundaries between participants to prevent data leakage. The CFM sits above EDC-V as an automated provisioning system that handles keypair generation, DID document creation, and Verifiable Credential issuance when new participants onboard into the dataspace. [projects.eclipse](https://projects.eclipse.org/proposals/eclipse-connector-fabric-manager)

### The Protocol Foundation: DSP + DCP + DPS

All three core specifications are now final or near-final:

- **DSP 2025-1** (Dataspace Protocol) — Defines catalog access, contract negotiation, and transfer management over RESTful HTTPS. Normative JSON schemas for all message payloads. Multi-tenant deployment support built in. Technology Compatibility Kit with 140+ test cases passed by both EDC and TNO connectors. [internationaldataspaces](https://internationaldataspaces.org/dataspace-protocol-nears-first-official-release/)

- **DCP v1.0** (Decentralized Claims Protocol) — Defines self-issued identity tokens, Verifiable Credential storage/presentation, and credential issuance protocols. Released July 2025 with 119 merged PRs from 12 organizations. [projects.eclipse](https://projects.eclipse.org/projects/technology.dataspace-dcp/releases/1.0.0)

- **DPS** (Data Plane Signaling) — Defines the signaling interface between control plane and data plane, enabling the disaggregated architecture where DCore data planes can be independently deployed and scaled. DCore implements this specification natively. [projects.eclipse](https://projects.eclipse.org/proposals/eclipse-data-plane-core)

### Implementation Roadmap: Health MVD v2

Here is the concrete implementation plan, organized in phases:

**Phase 1: Infrastructure Migration (Weeks 1–3)**

1. Replace the monolithic EDC Connector with **EDC-V** as the virtualized control plane
2. Deploy **DCore** Rust-based HTTP data plane for FHIR Bundle transfers
3. Set up **CFM** with Tenant Manager and Provision Manager for multi-participant orchestration
4. Configure three tenant profiles:
   - **Clinic** (data provider — FHIR R4 patient data)
   - **CRO** (data consumer — OMOP research queries)
   - **HDAB** (intermediary — HealthDCAT-AP catalog + SPE operator)

**Phase 2: Identity and Trust (Weeks 3–5)**

5. Implement DCP v1.0 credential flows using EDC-V's built-in IdentityHub:
   - Generate DID:web identifiers for each participant
   - Issue Verifiable Credentials via CFM's IssuerService integration
   - Configure credential presentation during DSP contract negotiation
6. Set up a Credential Issuer Service representing a trust anchor (simulated EHDS authority)
7. Define EHDS-specific credential types:
   - `EHDSParticipantCredential` (proof of HDAB registration)
   - `DataProcessingPurposeCredential` (EHDS Article 53 permitted purpose attestation)

**Phase 3: Health Knowledge Graph Layer (Weeks 5–8)**

8. Deploy Neo4j with the [5-layer health graph schema](health-dataspace-graph-schema.md) defined earlier
9. Implement **FHIR-to-Graph ingestion** pipeline:
   - Generate synthetic patient data with [Synthea](https://github.com/synthetichealth/synthea)
   - Load FHIR Bundles via CyFHIR into Neo4j
   - Create `CODED_BY` relationships to SNOMED CT / LOINC ontology nodes via neosemantics
10. Implement **HealthDCAT-AP metadata** layer:
    - Register datasets as HealthDCAT-AP RDF triples using rdflib-neo4j
    - Expose metadata via the EDC-V Federated Catalog extension
11. Implement **FHIR → OMOP transformation** pipeline for secondary use analytics

**Phase 4: Dataspace Integration (Weeks 8–11)**

12. Wire the Neo4j health graph into the EDC-V data plane:
    - Register Neo4j Cypher query endpoint as a DSP Data Asset
    - Define usage policies (EHDS purpose restriction, temporal limits, anonymization requirements)
    - Implement contract negotiation flow: CRO requests access → HDAB validates credentials → contract agreed → query endpoint provisioned
13. Implement **Federated Catalog** with HealthDCAT-AP:
    - Clinic publishes dataset descriptions to HDAB catalog
    - CRO discovers available cohorts via federated catalog search
    - CFM orchestrates the catalog federation across multiple HDAB instances
14. Implement **Data Plane Signaling** for FHIR transfer:
    - DCore Rust data plane handles FHIR Bundle HTTP transfers
    - Control plane (EDC-V) signals start/suspend/terminate via DPS
    - Transfer audit log captured in Neo4j provenance graph

**Phase 5: Federated Queries and GraphRAG (Weeks 11–14)**

15. Deploy two separate Neo4j instances (simulating two HDAB SPEs)
16. Configure **Neo4j Composite Database** for federated Cypher queries across both instances
17. Implement **Privacy-Preserving Multiparty Query** layer using SMPC protocols
18. Add **GraphRAG interface** for natural language querying of patient journeys:
    - Neo4j Text2Cypher for natural language → Cypher translation
    - Vector embeddings for semantic search across clinical narratives
    - Structured + unstructured retrieval for comprehensive patient context

**Phase 6: User Interfaces & Ecosystem Portals (Weeks 14–16)**

To make the health dataspace tangible for business and clinical users, the final phase integrates web-based graphical user interfaces (GUIs) over the core control and management planes:

19. Deploy **Participant & Operator Dashboards**:
    - Evaluate and integrate [Dataspace Builder Redline](https://dataspacebuilder.github.io/website/docs/components/redline), providing a visual dashboard for connector operators to manage data assets, usage policies, and dataspace contracts easily.
20. Implement **Ecosystem Onboarding Portals**:
    - Deploy self-service UIs using components from the [Aruba EDC Public Participant Portal](https://github.com/Aruba-it-S-p-A/edc-public-participant-portal) and the [Fraunhofer ISST End-User API (Ecosystem Registration)](https://github.com/FraunhoferISST/End-User-API/tree/feat/ecosystem-registration).
    - Enable Clinics and CROs to self-register, undergo automated credential provisioning via Keycloak/CFM, and discover synthetic health datasets through an intuitive catalog browser rather than raw APIs.

### Target Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                 Ecosystem & End-User Portals                │
│  (Aruba Participant Portal / Fraunhofer End-User API / Redline UI) │
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
    └────────┬────────┘           └────────┬─────────┘
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

### What This Proves

When complete, the Health MVD v2 will demonstrate:

1. **End-to-end EHDS compliance** — From participant onboarding (DCP credentials) through contract negotiation (DSP policies) to data access (SPE-enforced queries)
2. **Cloud-native multi-tenancy** — CFM managing multiple EDC-V instances for clinics, CROs, and HDABs on shared infrastructure
3. **Disaggregated data planes** — DCore Rust HTTP planes independently handling FHIR transfers and query results
4. **Federated knowledge graphs** — Cross-HDAB analytics without centralizing patient data
5. **Production-grade schema** — The 5-layer Neo4j health graph model working with real FHIR/OMOP data

The [JAD demo](https://github.com/Metaform/jad) provides the cloud-provider reference for EDC-V + CFM. The Health MVD v2 extends this with the **domain-specific health knowledge layer** — the piece that makes a generic dataspace into a health dataspace. [linkedin](https://www.linkedin.com/posts/mbuchhorn_fulcrum-daas-edc-activity-7427340949279809536-OaG6)

---

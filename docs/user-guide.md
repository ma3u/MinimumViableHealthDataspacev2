# User Guide

A practical guide for business users, researchers, and data stewards working with the Health Dataspace platform.

> **Rendered version:** [/docs/user-guide](https://ma3u.github.io/MinimumViableHealthDataspacev2/docs/user-guide) > **Full user journey:** [FULL_USER_JOURNEY.md](./FULL_USER_JOURNEY.md)

## Purpose

The Health Dataspace v2 is an **EHDS regulation reference implementation** demonstrating sovereign health data exchange. It combines:

- **DSP** (Dataspace Protocol) for contract negotiation and transfer
- **FHIR R4** for clinical data exchange
- **OMOP CDM** for research analytics
- **Neo4j** knowledge graph (5 layers, 27 node labels, 5,300+ nodes)
- **127 synthetic patients** across 5 fictional organisations

The platform demonstrates how European Health Data Space regulations translate into working software.

## Static Demo vs Full Stack

The [GitHub Pages demo](https://ma3u.github.io/MinimumViableHealthDataspacev2) runs as a static export with mock data. Features requiring the full JAD stack (19 services):

- **Keycloak SSO login** — static demo uses persona switcher
- **Live Neo4j graph queries** — graph explorer uses pre-loaded mock data
- **Contract negotiation & transfers** — require EDC connectors
- **Natural language / federated queries** — require neo4j-proxy
- **ODRL policy enforcement** — requires live dataspace middleware

## Personas & Roles

The platform adapts navigation, graph views, and actions to the signed-in user's EHDS role.

| Username   | Organisation           | Role           | Graph View | EHDS Basis                         |
| ---------- | ---------------------- | -------------- | ---------- | ---------------------------------- |
| edcadmin   | Dataspace Operator     | EDC Admin      | edc-admin  | Art. 52 — infrastructure operation |
| clinicuser | AlphaKlinik Berlin     | Data Holder    | hospital   | Art. 33-34 — data provision        |
| lmcuser    | Limburg Medical Centre | Data Holder    | hospital   | Art. 33-34 — data provision        |
| researcher | PharmaCo Research AG   | Researcher     | researcher | Art. 34(1)/45-46 — secondary use   |
| regulator  | MedReg DE              | HDAB Authority | hdab       | Art. 36-37 — approval body         |

### Why These Roles? (EHDS Regulation)

- **Data Holder** (Art. 33-34): Hospitals and clinics that generate and hold health data. Required to make data available for secondary use.
- **Researcher / Data User** (Art. 34(1), 45-46): Research organisations requesting access to health data for studies.
- **HDAB Authority** (Art. 36-37): Health Data Access Body — national authority approving data access applications.
- **EDC Admin** (Art. 52): Dataspace operator managing infrastructure, participants, and credentials.
- **Trust Center** (Art. 50(1)(e)): Manages pseudonymisation and re-identification protection.

### Graph Explorer — Persona Views

| Persona      | Route                       | Primary Question                        | Focus Nodes                                        |
| ------------ | --------------------------- | --------------------------------------- | -------------------------------------------------- |
| Hospital     | /graph?persona=hospital     | Who has approved access to my datasets? | Participant, HealthDataset, Contract, HDABApproval |
| Researcher   | /graph?persona=researcher   | What datasets match my study?           | HealthDataset, OMOPPerson, SnomedConcept           |
| HDAB         | /graph?persona=hdab         | What approvals are pending?             | HDABApproval, VerifiableCredential, TrustCenter    |
| Trust Center | /graph?persona=trust-center | Which pseudonym flows am I managing?    | TrustCenter, SPESession, ResearchPseudonym         |
| EDC Admin    | /graph?persona=edc-admin    | What contracts and transfers are live?  | Participant, DataProduct, Contract, TransferEvent  |

## Getting Started

After authenticating through Keycloak SSO, you land on a graph view personalised for your role.

### Features

| Feature                | Route             | Description                                      | JAD Required? |
| ---------------------- | ----------------- | ------------------------------------------------ | ------------- |
| Home Dashboard         | /                 | Participant overview, statistics, quick actions  | No            |
| Graph Explorer         | /graph            | 5-layer force-directed knowledge graph           | No            |
| Dataset Catalog        | /catalog          | HealthDCAT-AP metadata browser (EHDS Art. 8)     | No            |
| Patient Journey        | /patient          | FHIR R4 clinical timeline with OMOP mapping      | No            |
| OMOP Analytics         | /analytics        | Cohort analytics dashboards                      | No            |
| EEHRxF Profiles        | /eehrxf           | European EHR Exchange Format alignment           | No            |
| NL / Federated Query   | /query            | Natural language graph queries                   | Yes           |
| EHDS Approval          | /compliance       | HDAB permit workflow (Art. 45-49)                | Yes           |
| Protocol TCK           | /compliance/tck   | DSP 2025-1 validation suite                      | Yes           |
| Verifiable Credentials | /credentials      | DCP v1.0 credential management                   | No            |
| Share Data             | /data/share       | Publish datasets with ODRL policies (Art. 33-34) | Yes           |
| Discover               | /data/discover    | Federated catalog search                         | Yes           |
| Negotiate              | /negotiate        | DSP contract negotiation lifecycle               | Yes           |
| Tasks                  | /tasks            | Transfer task queue                              | Yes           |
| Transfer               | /data/transfer    | Transfer history with audit trail                | Yes           |
| Admin Dashboard        | /admin            | Operator overview                                | Yes           |
| EDC Components         | /admin/components | EDC-V runtime component status                   | Yes           |
| Participant Onboarding | /onboarding       | DID registration wizard                          | Yes           |
| Participant Settings   | /settings         | Profile and credential management                | Yes           |

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
| edcadmin   | Dataspace Operator     | EDC Admin      | edc-admin  | Art. 75 — infrastructure operation |
| clinicuser | AlphaKlinik Berlin     | Data Holder    | hospital   | Art. 51, 60 — data provision       |
| lmcuser    | Limburg Medical Centre | Data Holder    | hospital   | Art. 51, 60 — data provision       |
| researcher | PharmaCo Research AG   | Researcher     | researcher | Art. 53, 67-68 — secondary use     |
| regulator  | MedReg DE              | HDAB Authority | hdab       | Art. 55, 57 — approval body        |

### Why These Roles? (EHDS Regulation)

- **Data Holder** (Art. 51, 60): Hospitals and clinics that generate and hold health data. Required to make data available for secondary use.
- **Researcher / Data User** (Art. 53, 61, 67-68): Research organisations requesting access to health data for studies.
- **HDAB Authority** (Art. 55, 57): Health Data Access Body — national authority approving data access applications.
- **EDC Admin** (Art. 75, HealthData@EU): Dataspace operator managing infrastructure, participants, and credentials.
- **Trust Center** (Art. 66, 73): Manages pseudonymisation and re-identification protection.

Article numbers follow the adopted Regulation (EU) 2025/327; the mapping from
the 2022 proposal is in [ehds-article-numbering.md](ehds-article-numbering.md),
and what the hub implements of each article is in
[the EHDS implementation page](ehds/regulation-implementation.md).

### Patients: opting out of secondary use (Art. 71)

Under the EHDS, a person's health data may be used for research, innovation,
policy and statistics, but only under a permit from a health data access body,
pseudonymised, inside a secure processing environment. A patient can opt out
of that at any time, without giving a reason, and opt back in: on
**/patient/research**, the panel _Secondary use of your health data_. From that
moment every new research query leaves the person out (the researcher's
counts drop by one); the opt-out and its reversal are kept with their dates.
Joining a single study below that panel is a separate choice, a consent under
GDPR Art. 9(2)(a) that can be withdrawn at any time. How it works:
[ADR-062](ADRs/ADR-062-the-art-71-opt-out-is-a-record-and-a-label.md).

### Persona Overview: one view per role

After sign-in every persona lands on `/overview`, opened at the tab for its role. The graph
explorer at `/graph` is retired.

| Tab         | Route                        | Primary question                                                                            | Regulation (EU) 2025/327    |
| ----------- | ---------------------------- | ------------------------------------------------------------------------------------------- | --------------------------- |
| Patient     | /overview?persona=patient    | Which parameters put me at risk, what should I do about them, and who is using my data?     | Art. 3, 8, 14, 71, 73       |
| Researcher  | /overview?persona=researcher | What am I allowed to use today, what is pending or blocked, and what am I missing?          | Art. 53, 61, 67–69, 73      |
| Access body | /overview?persona=hdab       | Which operations are non-compliant right now, and are my own decisions on time?             | Art. 57, 61, 63, 68, 73, 78 |
| Data holder | /overview?persona=hospital   | Which consumers are trusted, what is flowing without cover, and are my own duties in order? | Art. 60, 61, 73, 77, 78     |

The operator and the trust centre open on the access body's tab.

## Getting Started

After authenticating through Keycloak SSO, you land on the persona overview for your role.
The [user guide on the demo site](https://ma3u.github.io/MinimumViableHealthDataspacev2/docs/user-guide)
describes every page below and shows a screenshot of each on mouse-over.

### Features

| Feature                   | Route               | Description                                                     | JAD Required? |
| ------------------------- | ------------------- | --------------------------------------------------------------- | ------------- |
| Home Dashboard            | /                   | Participant overview, statistics, quick actions                 | No            |
| Persona Overview          | /overview           | One view per role: what needs attention, with its article       | No            |
| Dataset Catalog           | /catalog            | HealthDCAT-AP metadata browser (EHDS Art. 77)                   | No            |
| HealthDCAT-AP Editor      | /catalog/editor     | Data holders write their dataset descriptions (Release 8)       | No            |
| Patient Journey           | /patient            | FHIR R4 clinical timeline with OMOP mapping                     | No            |
| OMOP Analytics            | /analytics          | Cohort analytics dashboards                                     | No            |
| EEHRxF Profiles           | /eehrxf             | European EHR Exchange Format alignment                          | No            |
| NL / Federated Query      | /query              | Natural language graph queries                                  | Yes           |
| Personal Research         | /patient/query      | A patient asks questions about their own record (Art. 3)        | No            |
| Health Profile & Risks    | /patient/profile    | Own health profile, risk scores, connected phones               | No            |
| Research Programs         | /patient/research   | Art. 71 opt-out and consent to single studies                   | No            |
| Research Insights         | /patient/insights   | Aggregate findings from studies the patient's data joined       | No            |
| EHDS Approval             | /compliance         | HDAB permit workflow (Art. 67-69)                               | Yes           |
| Protocol TCK              | /compliance/tck     | DSP 2025-1 validation suite                                     | Yes           |
| Verifiable Credentials    | /credentials        | DCP v1.0 credential management                                  | No            |
| Apply for a Permit        | /applications       | The eleven items of Art. 67(2), then the decision and its clock | No            |
| Statistical Requests      | /requests           | Art. 69 health data requests answered with a statistic          | No            |
| Supervision               | /supervision        | Findings, measures and requests for information (Art. 63)       | No            |
| Permits Register          | /permits            | The access body's public register of decisions (Art. 57, 58)    | No            |
| Activity Report           | /activity-report    | The access body's biennial report (Art. 59)                     | No            |
| Secondary Use Information | /information        | What a person should know about secondary use (Art. 58)         | No            |
| Share Data                | /data/share         | Publish datasets with ODRL policies (Art. 51, 60)               | Yes           |
| Discover                  | /data/discover      | Federated catalog search                                        | Yes           |
| Negotiate                 | /negotiate          | DSP contract negotiation lifecycle                              | Yes           |
| Tasks                     | /tasks              | Transfer task queue                                             | Yes           |
| Transfer                  | /data/transfer      | Transfer history with audit trail                               | Yes           |
| Admin Dashboard           | /admin              | Operator overview                                               | Yes           |
| EDC Components            | /admin/components   | EDC-V runtime component status                                  | Yes           |
| Tenant Management         | /admin/tenants      | Organisations, their roles and access levels                    | No            |
| Participant Directory     | /admin/participants | Wallets and catalogs the crawler discovers datasets from        | No            |
| Policy Definitions        | /admin/policies     | ODRL policies per participant, from Art. 53 purpose templates   | No            |
| Audit & Provenance        | /admin/audit        | Audit log and provenance trail, shared with the access body     | No            |
| Participant Onboarding    | /onboarding         | DID registration wizard                                         | Yes           |
| Participant Settings      | /settings           | Profile and credential management                               | Yes           |

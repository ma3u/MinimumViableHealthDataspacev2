# Simpl-Open vs EHDS Reference Implementation: Gap Analysis

**Date:** 2026-04-11
**Context:** The EU Simpl programme provides generic smart middleware for data spaces. This analysis maps where the EHDS Minimum Viable Health Dataspace demonstrates capabilities that Simpl-Open needs to develop further to meet European Health Data Space requirements.

---

## 1. How This EHDS Demo Fits the Simpl Roadmap

The [Simpl-Open Roadmap (May 2025)](https://simpl-programme.ec.europa.eu/system/files/2025-05/Simpl-Open%20Roadmap%20May%20Update%20and%20June%20Release%20Details%202025.pdf) positions Simpl as generic middleware for EU data spaces. The EHDS Regulation (EU 2025/327) is the first sector-specific data space regulation to enter force, making health the lead domain for Simpl deployment.

This EHDS reference implementation demonstrates what a **production-grade health data space** actually requires beyond Simpl's current generic middleware:

| Simpl Roadmap Area   | This Demo Shows                                                                                  |
| -------------------- | ------------------------------------------------------------------------------------------------ |
| Data Space Connector | DSP 2025-1 full contract lifecycle (negotiate, transfer, terminate) with ODRL policy enforcement |
| Identity & Trust     | DID:web + Verifiable Credentials + DCP v1.0 instead of centralized X.509 PKI                     |
| Catalogue Services   | HealthDCAT-AP 2.1 with FHIR R4 + OMOP CDM clinical metadata (5-layer knowledge graph)            |
| Policy Enforcement   | Runtime ODRL engine with Neo4j-backed policy resolution, temporal limits, k-anonymity            |
| Cross-Border         | Federated NLQ across Secure Processing Environments (EHDS Art. 50)                               |
| Patient Rights       | GDPR Art. 15-22 + EHDS Art. 3-12 primary use portal with consent management                      |
| Secondary Use        | EHDS Art. 33-49 research data donation with pseudonymisation and aggregate-only results          |

### Alignment with Simpl June 2025 Release

The Simpl June 2025 release focuses on core building blocks (connector, identity, catalogue). This demo extends each:

- **Connector**: Simpl provides generic DSP message exchange; this demo adds health-specific ODRL policies, HDAB approval chains, and Secure Processing Environment routing
- **Identity**: Simpl uses X.509 certificates in a central registry; this demo implements DID:web with Verifiable Credentials (see Section 4)
- **Catalogue**: Simpl provides DCAT-AP basic; this demo implements HealthDCAT-AP 2.1 with clinical ontology linkage (SNOMED CT, ICD-10, LOINC, RxNorm)

---

## 2. Architecture Comparison Matrix

| Capability                     | Simpl-Open Architecture                                                     | EHDS Reference Implementation                                                                                             | Gap                                                   |
| ------------------------------ | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| **Identity Model**             | X.509 certificates in central DAPS (Dynamic Attribute Provisioning Service) | DID:web + W3C Verifiable Credentials + DCP v1.0                                                                           | **Critical** - Simpl needs decentralized identity     |
| **Trust Framework**            | Centralized Certificate Authority (CA) hierarchy                            | Decentralized trust via VC attestation chains (Gaia-X aligned)                                                            | **Critical** - Single CA is a cross-border bottleneck |
| **Participant Authentication** | mTLS with X.509 client certificates                                         | OIDC (Keycloak) + DID resolution + VC verification                                                                        | **Major** - Simpl needs OIDC + DID support            |
| **Policy Language**            | Basic ODRL in contract offers                                               | Full ODRL 2.2 with runtime enforcement, temporal limits, k-anonymity, aggregate-only constraints                          | **Major** - Simpl ODRL is declarative, not enforced   |
| **Policy Enforcement**         | Contract-time only                                                          | Runtime query-time enforcement with ODRL scope resolution per request                                                     | **Critical** for EHDS Art. 50                         |
| **Catalogue Standard**         | DCAT-AP 2.x                                                                 | HealthDCAT-AP 2.1 + FHIR R4 conformsTo + ontology linkage                                                                 | **Major** - Health needs domain-specific metadata     |
| **Clinical Data Model**        | None (generic)                                                              | FHIR R4 (Patient, Condition, Observation, MedicationRequest) + OMOP CDM v5.4                                              | **Critical** - EHDS mandates EHR exchange format      |
| **Ontology Support**           | None                                                                        | SNOMED CT, ICD-10, LOINC, RxNorm with CODED_BY relationships                                                              | **Critical** - Semantic interoperability required     |
| **Patient Rights**             | None (B2B focus)                                                            | GDPR Art. 15-22 portal, EHDS Art. 3 EHR access, Art. 7 opt-out                                                            | **Critical** - EHDS primary use is patient-facing     |
| **Consent Management**         | Basic contract consent                                                      | Study-specific revocable consent (GDPR Art. 17), EHDS Art. 10                                                             | **Major** - Health needs granular consent             |
| **Secondary Use**              | Generic data sharing                                                        | EHDS Art. 33-49: HDAB approval, pseudonymisation, SPE routing, k-anonymity                                                | **Critical** - Full secondary use pipeline            |
| **Cross-Border**               | Connector-to-connector                                                      | Federated NLQ across SPEs with policy scoping per jurisdiction                                                            | **Major** - Health data crosses EU borders            |
| **Audit Trail**                | Basic logging                                                               | QueryAuditEvent nodes in knowledge graph with Cypher, ODRL scope, participant DID                                         | **Major** - EHDS requires comprehensive audit         |
| **Knowledge Representation**   | Relational/document store                                                   | 5-layer Neo4j knowledge graph (Marketplace, DCAT-AP, FHIR, OMOP, Ontology)                                                | **Architectural** - Graph enables cross-layer queries |
| **Query Language**             | SQL/REST                                                                    | Natural Language Query (NLQ) with template matching, GraphRAG, LLM fallback                                               | **Innovation** - Lowers barrier for researchers       |
| **Role-Based Access**          | Admin/User binary                                                           | 7 persona roles (EDC_ADMIN, DATA_HOLDER, DATA_USER, HDAB_AUTHORITY, TRUST_CENTER_OPERATOR, PATIENT, EDC_USER_PARTICIPANT) | **Major** - EHDS has complex role hierarchy           |
| **Data Transfer**              | HTTP/S3 push/pull                                                           | DSP transfer with EDR (Endpoint Data Reference) + contract verification                                                   | **Minor** - Simpl has basic transfer                  |
| **Accessibility**              | Not specified                                                               | WCAG 2.2 AA zero violations (67 authenticated tests, 26 public tests)                                                     | **Compliance** - EU accessibility directive           |

---

## 3. Where Simpl Needs to Develop Further for EHDS

### 3.1 Critical Gaps (Must Address Before EHDS Deployment)

#### Identity: From X.509 Central Registry to DID/SSI

Simpl's current X.509 PKI model is fundamentally incompatible with EHDS cross-border requirements (see Section 4 for detailed analysis).

#### Patient-Facing Primary Use (EHDS Art. 3-12)

Simpl is designed for B2B data exchange. EHDS mandates patient-facing services:

- Art. 3: Right to access EHR through any EU national contact point
- Art. 7: Right to opt out of secondary use
- Art. 10: Study-specific consent management
- Art. 12: Right to data portability in EHR exchange format

Simpl has no patient portal, no consent management UI, no EHR viewer.

#### Clinical Data Interoperability

EHDS mandates the European Electronic Health Record Exchange Format (eEHRxF) based on FHIR R4. Simpl has no clinical data model awareness — it treats all data as opaque payloads.

#### Secondary Use Pipeline (EHDS Art. 33-49)

EHDS requires:

- Health Data Access Body (HDAB) approval workflow
- Secure Processing Environment (SPE) routing
- Pseudonymisation before researcher access
- k-anonymity enforcement (k >= 5 for public health, k >= 10 for research)
- Aggregate-only query results (no individual-level data export)

Simpl provides none of these.

### 3.2 Major Gaps (Should Address in Next Release Cycle)

#### Runtime ODRL Policy Enforcement

Simpl includes ODRL in contract offers but enforces policies only at contract negotiation time. EHDS requires runtime enforcement:

- Temporal limits (data access expires after study period)
- Purpose limitation (re-identification prohibition)
- Aggregate-only constraints
- Dataset scope restriction per participant

#### HealthDCAT-AP Metadata

Generic DCAT-AP lacks health-specific metadata fields:

- `conformsTo` for FHIR profiles
- Clinical ontology linkage (SNOMED CT, ICD-10)
- Privacy classification levels
- Jurisdiction-specific access rules

#### Comprehensive Audit Trail

EHDS Art. 50-51 requires detailed audit of all data access within SPEs, including query content, results returned, participant identity, and policy applied. Simpl's basic logging is insufficient.

### 3.3 Architectural Gaps (Long-Term Development)

#### Knowledge Graph vs Relational Model

This demo uses a 5-layer Neo4j knowledge graph that enables:

- Cross-layer queries (e.g., "find all patients with diabetes who are in a dataset offered by AlphaKlinik")
- Ontology-driven semantic search
- GraphRAG for natural language queries

Simpl's relational/document architecture cannot efficiently represent these relationships.

#### Federated Query Across SPEs

EHDS envisions multiple SPEs across EU member states. This demo implements federated NLQ that:

- Routes queries to relevant SPEs based on dataset scope
- Merges results with provenance tracking
- Enforces per-SPE policy constraints
- Degrades gracefully when SPEs are offline

---

## 4. Why DID/SSI Should Replace X.509 Central Registry

### 4.1 The Problem with Simpl's X.509 Approach

Simpl-Open uses a **Dynamic Attribute Provisioning Service (DAPS)** — a centralized X.509 certificate registry where every data space participant must obtain certificates from an approved Certificate Authority.

This creates fundamental problems for health data spaces:

| X.509 Limitation                        | Impact on EHDS                                                                                                                                                            |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Single point of failure**             | If the central CA or DAPS goes down, the entire health data space stops. Unacceptable for healthcare.                                                                     |
| **Cross-border certificate management** | 27 EU member states would need to either (a) share a single CA (sovereignty concern) or (b) cross-certify 27 CAs (O(n^2) complexity).                                     |
| **Certificate revocation latency**      | CRL/OCSP propagation takes hours to days. A compromised hospital certificate continues to grant access until revocation propagates.                                       |
| **No patient identity**                 | X.509 is designed for organizations and servers, not citizens. EHDS Art. 3 requires patient-facing identity.                                                              |
| **No selective disclosure**             | X.509 certificates expose all attributes to all verifiers. A researcher doesn't need to know a hospital's full legal identity — just that it's an authorized DATA_HOLDER. |
| **Vendor lock-in**                      | Dependence on specific CAs creates commercial lock-in and political tensions between member states.                                                                       |
| **No consent binding**                  | X.509 cannot represent or verify patient consent. Consent is a separate system with no cryptographic binding to access credentials.                                       |
| **Static attributes**                   | X.509 attributes are fixed at issuance. Role changes require re-issuance, a slow process for dynamic health data space membership.                                        |

### 4.2 DID/SSI as the Solution

**Decentralized Identifiers (DIDs)** and **Self-Sovereign Identity (SSI)** solve every X.509 limitation:

#### Decentralized Trust Without Single Authority

```
DID:web method:
  did:web:alpha-klinik.de:participant  →  resolves to DID Document at
  https://alpha-klinik.de/.well-known/did.json

Each participant hosts their own DID Document.
No central registry. No single point of failure.
```

Each EU member state's participants self-host their DID Documents. Trust is established through **Verifiable Credentials (VCs)** issued by recognized authorities (HDABs, national health agencies), not through a central CA.

#### Cross-Border Interoperability

| Approach                           | Cross-Border Complexity          | Sovereignty                                 |
| ---------------------------------- | -------------------------------- | ------------------------------------------- |
| Central CA (Simpl)                 | O(1) setup, but sovereignty loss | Low — one authority controls all            |
| Cross-certification (X.509 bridge) | O(n^2) bilateral agreements      | Medium — complex to manage                  |
| **DID:web + VCs**                  | **O(n) — each state issues VCs** | **High — each state controls own issuance** |

With DID:web, Germany's HDAB issues a VC to AlphaKlinik Berlin attesting it as an authorized DATA_HOLDER. France's Institut de Recherche Sante verifies this VC by resolving the HDAB's DID — no bilateral certificate exchange needed.

#### Patient-Controlled Consent (GDPR Art. 7, 17)

```
Patient DID: did:web:patient-wallet.eu:p:12345

VC #1: ConsentCredential
  - studyId: "STUDY-2026-042"
  - scope: "pseudonymised-ehr"
  - granted: "2026-03-15"
  - revocable: true (GDPR Art. 17)

VC #2: HealthDataAccessRight
  - issuer: did:web:medreg.de:hdab
  - scope: "primary-use-ehr-access"
  - ehdsArticle: "Art. 3"
```

Patients hold their consent as Verifiable Credentials in a digital wallet (aligned with **eIDAS 2.0 EU Digital Identity Wallet**). Consent can be:

- Cryptographically verified by researchers
- Revoked by the patient at any time
- Scoped to specific studies
- Audited without centralized logging

#### Verifiable Credentials for Participant Attestation

The **Decentralised Claims Protocol (DCP) v1.0** defines how data space participants present credentials:

```
Participant: AlphaKlinik Berlin
  DID: did:web:alpha-klinik.de:participant

  Holds VCs:
  1. MembershipCredential (issuer: DataspaceAuthority)
     - role: DATA_HOLDER
     - validFrom: 2026-01-01
     - validUntil: 2027-01-01

  2. HDABApprovalCredential (issuer: did:web:medreg.de:hdab)
     - approvedDatasets: ["DS-001", "DS-002"]
     - purpose: "SCIENTIFIC_RESEARCH"
     - conditions: "aggregate-only, k>=5"

  3. ComplianceCredential (issuer: did:web:audit.eu:compliance)
     - standard: "EHDS Art. 50"
     - speId: "SPE-DE-001"
     - lastAudit: "2026-02-28"
```

Each VC is independently verifiable. No central registry query needed.

#### Zero-Knowledge Proofs for Privacy

With SSI, a hospital can prove "I am an authorized DATA_HOLDER in Germany" without revealing its name, address, or any other identifying information. This is impossible with X.509 where the full certificate is transmitted.

#### Alignment with EU Standards

| Standard                   | X.509 (Simpl)                    | DID/SSI (This Demo)                          |
| -------------------------- | -------------------------------- | -------------------------------------------- |
| **eIDAS 2.0**              | Partial — qualified certificates | Full — EU Digital Identity Wallet compatible |
| **Gaia-X Trust Framework** | Not aligned                      | DID:web is the Gaia-X default                |
| **DSP 2025-1**             | X.509 mTLS option                | DID + VC presentation protocol               |
| **EBSI (EU Blockchain)**   | Not compatible                   | did:ebsi supported                           |
| **W3C DID**                | Not a W3C standard               | W3C Recommendation (2022)                    |
| **W3C VC Data Model**      | N/A                              | W3C Recommendation (2022)                    |

### 4.3 Migration Path: X.509 to DID/SSI

Simpl doesn't need to abandon X.509 overnight. A pragmatic migration:

1. **Phase 1**: Support DID:web alongside X.509 — participants can present either
2. **Phase 2**: Issue VCs to existing X.509 holders — bridge the two worlds
3. **Phase 3**: New participants onboard with DID only — X.509 for legacy
4. **Phase 4**: Deprecate X.509 DAPS — full DID/SSI

This demo implements Phase 3-4 architecture, showing the target state.

---

## 5. Comparison: Simpl Components vs EHDS Requirements

| EHDS Requirement              | EHDS Article | Simpl Component   | Status       | This Demo                                  |
| ----------------------------- | ------------ | ----------------- | ------------ | ------------------------------------------ |
| Patient EHR access            | Art. 3       | None              | Missing      | FHIR R4 patient portal with risk scores    |
| EHR exchange format           | Art. 5       | None              | Missing      | eEHRxF viewer with FHIR R4 rendering       |
| Patient opt-out               | Art. 7       | None              | Missing      | Per-study consent with revocation          |
| Health data categories        | Art. 5       | None              | Missing      | 6 FHIR resource types mapped               |
| Cross-border access           | Art. 12      | Connector (basic) | Partial      | Federated NLQ across SPEs                  |
| Secondary use access          | Art. 33      | Catalogue (basic) | Partial      | HealthDCAT-AP 2.1 with clinical metadata   |
| HDAB approval                 | Art. 37      | None              | Missing      | HDABApproval nodes in knowledge graph      |
| Data permit                   | Art. 46      | Contract (basic)  | Partial      | ODRL policy with runtime enforcement       |
| Secure Processing Environment | Art. 50      | None              | Missing      | SPE routing with k-anonymity               |
| Pseudonymisation              | Art. 50      | None              | Missing      | Trust Center pseudonymisation              |
| Audit trail                   | Art. 50-51   | Basic logging     | Insufficient | QueryAuditEvent with full context          |
| Participant identity          | Art. 52      | X.509 DAPS        | Incompatible | DID:web + VC attestation                   |
| Interoperability              | Art. 55      | DCAT-AP           | Partial      | HealthDCAT-AP + SNOMED/ICD-10/LOINC/RxNorm |

---

## 6. Recommendations for Simpl Programme

1. **Adopt DID:web as primary identity mechanism** — X.509 can remain as fallback but DID must be first-class
2. **Implement runtime ODRL enforcement** — contract-time-only policy checking is insufficient for EHDS
3. **Add health-specific catalogue extension** — HealthDCAT-AP 2.1 profile for EHDS domain
4. **Build patient-facing components** — EHDS is not B2B-only; citizen access is mandated
5. **Support FHIR R4 as first-class data model** — generic payload handling doesn't meet eEHRxF requirements
6. **Implement SPE routing and pseudonymisation** — core EHDS Art. 50 infrastructure
7. **Adopt DCP v1.0 for credential presentation** — aligns with Gaia-X and W3C standards
8. **Add comprehensive audit trail** — graph-based audit with full query context

---

## 7. This Demo as a Simpl Extension Pattern

This EHDS reference implementation can serve as a **Simpl domain extension template**:

```
Simpl-Open Core (Generic)
  └── EHDS Domain Extension (This Demo)
       ├── HealthDCAT-AP 2.1 Catalogue Profile
       ├── FHIR R4 / OMOP CDM Clinical Data Layer
       ├── EHDS-Specific ODRL Constraints
       ├── HDAB Approval Workflow
       ├── Patient Rights Portal (Art. 3-12)
       ├── SPE Routing & Pseudonymisation (Art. 50)
       └── DID:web + DCP v1.0 Identity (replacing X.509 DAPS)
```

Other data spaces (energy, mobility, agriculture) would build similar domain extensions, but health — as the first regulated data space — sets the standard for what Simpl must support.

---

## References

- [EHDS Regulation (EU) 2025/327](https://eur-lex.europa.eu/eli/reg/2025/327)
- [Simpl-Open Architecture Specifications](https://code.europa.eu/simpl/simpl-open/architecture)
- [DSP 2025-1 (Dataspace Protocol)](https://docs.internationaldataspaces.org/ids-knowledgebase/dataspace-protocol)
- [DCP v1.0 (Decentralised Claims Protocol)](https://github.com/eclipse-tractusx/identity-trust)
- [W3C DID Core 1.0](https://www.w3.org/TR/did-core/)
- [W3C Verifiable Credentials Data Model](https://www.w3.org/TR/vc-data-model/)
- [eIDAS 2.0 Regulation](https://eur-lex.europa.eu/eli/reg/2024/1183)
- [Gaia-X Trust Framework](https://gaia-x.eu/trust-framework/)
- [HealthDCAT-AP 2.1](https://healthdcat-ap.github.io/)
- [FHIR R4](https://hl7.org/fhir/R4/)
- [OMOP CDM v5.4](https://ohdsi.github.io/CommonDataModel/)

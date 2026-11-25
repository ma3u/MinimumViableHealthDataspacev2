# Neo4j Health Dataspace Graph Schema

## A Unified Data Model for Clinical Data Exchange, Research Analytics, and Marketplace Operations

**Version:** 1.0
**Author:** Matthias Buchhorn-Roth
**Date:** March 2026
**License:** MIT

---

## Executive Summary

This document defines a **production-ready, layered Neo4j graph schema** for health dataspaces that integrates:

- **HL7 FHIR R4** (clinical data exchange and primary use)
- **OMOP CDM** (research analytics and secondary use)
- **SNOMED CT / LOINC / ICD-10** (clinical terminology backbone)
- **HealthDCAT-AP** (metadata discovery and catalog layer)
- **Dataspace Protocol** (DSP) metadata for marketplace operations

The schema is designed for **EHDS-compliant Health Data Access Bodies (HDABs)**, **Contract Research Organizations (CROs)**, **data preparation agencies**, and **clinical data marketplaces** where data providers, consumers, and intermediaries exchange clinical and research data under sovereignty contracts.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Layer 1: Dataspace Marketplace Metadata](#2-layer-1-dataspace-marketplace-metadata)
3. [Layer 2: HealthDCAT-AP Metadata](#3-layer-2-healthdcat-ap-metadata)
4. [Layer 3: FHIR Clinical Knowledge Graph](#4-layer-3-fhir-clinical-knowledge-graph)
5. [Layer 4: OMOP Research Analytics](#5-layer-4-omop-research-analytics)
6. [Layer 5: Clinical Ontology Backbone](#6-layer-5-clinical-ontology-backbone)
7. [Cross-Layer Integration Patterns](#7-cross-layer-integration-patterns)
8. [Implementation Guide](#8-implementation-guide)
9. [Query Patterns](#9-query-patterns)
10. [Validation Rules](#10-validation-rules)
11. [Migration from Existing Systems](#11-migration-from-existing-systems)

---

## 1. Architecture Overview

### 1.1 Design Principles

The schema follows these Neo4j best practices:

1. **Node Labels as Entity Types** — Singular nouns in PascalCase: `Patient`, `Condition`, `Dataset`
2. **Relationships as Verbs** — Action-oriented in UPPER_SNAKE_CASE: `HAS_CONDITION`, `PART_OF_COHORT`
3. **Properties as Attributes** — camelCase for property names: `birthDate`, `resourceType`
4. **Layered Model** — Semantic separation between dataspace, metadata, clinical, research, and ontology
5. **Bidirectional Traceability** — Every clinical node traces back to dataset and catalog metadata
6. **FHIR ↔ OMOP Mappings** — Explicit transformation relationships preserve provenance

### 1.2 Layer Stack

```
┌────────────────────────────────────────────────────┐
│ Layer 1: Dataspace Marketplace Metadata           │
│ (DSP Catalog, DataProduct, Contract, Participant) │
└────────────────────┬───────────────────────────────┘
                     │ DESCRIBED_BY
┌────────────────────┴───────────────────────────────┐
│ Layer 2: HealthDCAT-AP Metadata                    │
│ (Dataset, Distribution, HealthDataset)             │
└────────────────────┬───────────────────────────────┘
                     │ CONTAINS_RESOURCE
┌────────────────────┴───────────────────────────────┐
│ Layer 3: FHIR Clinical Knowledge Graph             │
│ (Patient, Condition, Observation, Medication...)   │
└────────────────────┬───────────────────────────────┘
                     │ MAPPED_TO
┌────────────────────┴───────────────────────────────┐
│ Layer 4: OMOP Research Analytics                   │
│ (Person, ConditionOccurrence, Measurement...)      │
└────────────────────┬───────────────────────────────┘
                     │ CODED_BY
┌────────────────────┴───────────────────────────────┐
│ Layer 5: Clinical Ontology Backbone                │
│ (SnomedConcept, LoincCode, ICD10Code)              │
└────────────────────────────────────────────────────┘
```

---

## 2. Layer 1: Dataspace Marketplace Metadata

### 2.1 Node Labels

#### `Participant`

Represents a dataspace participant (clinic, CRO, HDAB, data preparation agency).

**Properties:**

- `participantId: String!` — Unique identifier (DID or X.509 DN)
- `legalName: String!` — Official organization name
- `participantType: String!` — One of: `CLINIC`, `CRO`, `HDAB`, `DATA_AGENCY`, `RESEARCHER`
- `jurisdiction: String` — ISO 3166-1 alpha-2 country code (e.g., `DE`, `FR`)
- `vcUrl: String` — Verifiable Credential endpoint for DCP attestation
- `catalogUrl: String` — DSP catalog endpoint

**Indexes:**

```cypher
CREATE CONSTRAINT participant_id IF NOT EXISTS FOR (p:Participant) REQUIRE p.participantId IS UNIQUE;
CREATE INDEX participant_type IF NOT EXISTS FOR (p:Participant) ON (p.participantType);
```

---

#### `DataProduct`

A data product offered in the dataspace marketplace.

**Properties:**

- `productId: String!` — Unique product identifier
- `title: String!` — Human-readable product name
- `description: String` — Product description
- `version: String` — Semantic version (e.g., `1.2.0`)
- `productType: String!` — One of: `COHORT`, `REGISTRY`, `SYNTHETIC`, `REALWORLD`
- `sensitivity: String!` — One of: `ANONYMOUS`, `PSEUDONYMIZED`, `IDENTIFIED`
- `createdAt: DateTime!`
- `updatedAt: DateTime`

**Indexes:**

```cypher
CREATE CONSTRAINT product_id IF NOT EXISTS FOR (dp:DataProduct) REQUIRE dp.productId IS UNIQUE;
CREATE INDEX product_type IF NOT EXISTS FOR (dp:DataProduct) ON (dp.productType);
```

---

#### `Contract`

Represents a dataspace usage contract negotiated via DSP.

**Properties:**

- `contractId: String!` — DSP contract agreement ID
- `providerId: String!` — Participant ID of data provider
- `consumerId: String!` — Participant ID of data consumer
- `agreementDate: DateTime!`
- `validUntil: DateTime`
- `usagePurpose: String!` — EHDS Article 53 permitted purpose
- `accessType: String!` — One of: `QUERY`, `EXTRACT`, `FEDERATED`

**Indexes:**

```cypher
CREATE CONSTRAINT contract_id IF NOT EXISTS FOR (c:Contract) REQUIRE c.contractId IS UNIQUE;
```

---

#### `AccessApplication`

Represents a health data access application submitted to a health data access body by a data user, **Regulation (EU) 2025/327 Art. 67**. The body decides on it within three months (Art. 68(4)); without an approved permit no transfer starts (Art. 61(1)), which `POST /api/transfers` enforces.

**Properties:**

- `applicationId: String!` — Unique application reference number
- `applicantId: String!` — Participant ID of the data consumer
- `datasetId: String!` — URI of the requested `HealthDataset`
- `requestedPurpose: String!` — EHDS Article 53 permitted purpose (e.g., `SCIENTIFIC_RESEARCH`)
- `submittedAt: DateTime!` — Submission timestamp
- `status: String!` — One of: `PENDING`, `UNDER_REVIEW`, `APPROVED`, `REJECTED`, `REVOKED`
- `justification: String` — Scientific or public-interest justification text
- `ethicsCommitteeRef: String` — Reference to ethics committee approval
- `dataMinimisationStatement: String` — GDPR Art. 5(1)(c) justification
- `decisionDue: DateTime` — Three months after submission (Art. 68(4))
- `processingPeriodMonths: Integer` — Period the data are needed for (Art. 67(2)(h))
- `decidedAt: DateTime` — Set by the decision
- The other items of Art. 67(2) (issue #206, M1): `namedPersons` (a), `intendedUse` (c), `requestedData`, `dataTimeRange`, `dataFormats` (d), `identifiability` (`PSEUDONYMISED` or `ANONYMISED`) and `pseudonymisationJustification` (e), `datasetsBroughtIn` (f), `safeguards` (g), `speTools` (i), `art71Exception: Boolean` and `art71ExceptionJustification` (k); `complete: Boolean` says whether all eleven are present
- `applicantCategory: String` — `PUBLIC_SECTOR`, `ACADEMIC`, `MICRO_ENTERPRISE` or `COMMERCIAL`, for the reduced fees of Art. 62(3)
- The Art. 68(4) clock (M2): `incompleteNoticeAt`, `incompleteReason`, `completeBy` (four weeks) when the body sends the applicant back, then `completedAt` when the complete application arrives and the three months run again; `extendedAt`, `extensionReason` for the one extension by three months. `status` is `INCOMPLETE` while the clock is stopped.

**Indexes:**

```cypher
CREATE CONSTRAINT access_application_id IF NOT EXISTS FOR (aa:AccessApplication) REQUIRE aa.applicationId IS UNIQUE;
CREATE INDEX access_application_status IF NOT EXISTS FOR (aa:AccessApplication) ON (aa.status);
```

---

#### `HDABApproval`

The data permit (or the refusal) a health data access body issues on an application, **Regulation (EU) 2025/327 Art. 68**. It is the only lawful basis for a data user to access data for secondary use (Art. 61(1)); the body can revoke it (Art. 63(3)); permits, refusals and revocations are published on `/permits` (Art. 57(1)(j)).

**Properties:**

- `approvalId: String!` — Unique approval decision identifier
- `applicationId: String!` — Reference back to the `AccessApplication`
- `approvedAt: DateTime!` — Date of formal HDAB decision
- `validUntil: DateTime!` — Approval expiry date
- `permittedPurpose: String!` — Granted Art. 53(1) purpose (must match `AccessApplication.requestedPurpose`)
- `conditions: String[]` — Any conditions or restrictions attached to the approval
- `hdabOfficer: String` — Name or ID of the issuing HDAB officer
- `legalBasisArticle: String` — EHDS legal basis (e.g., `Art. 68`, `GDPR_Art_9_2_j`)
- `status: String!` — `APPROVED`, `REJECTED` or `REVOKED`
- `decidedAt: DateTime`, `validFrom: DateTime` — Set by the decision (Art. 68(3))
- `criteria: String` — JSON of the Art. 68(1)(a) to (h) criteria as assessed
- `justification: String` — Written justification, required for a refusal (Art. 57(1)(j)(iii))
- `decidedBy: String` — DID of the access body
- `publishBy: Date` — 30 working days after the decision (Art. 57(1)(j)(iii))
- `revokedAt: DateTime`, `revocationReason: String`, `revokedBy: String` — Set by a revocation (Art. 63(3)); `revokedByFinding: String` when a closed `NonComplianceFinding` took the measure
- `statisticalAlternativeOffered: Boolean` — With a refusal, the body offers an anonymised statistical answer instead (Art. 68(3))
- `feeEur: Integer`, `feeBodyEur`, `feeHolderEur`, `feeCategory`, `feeReduction` — The fee on an issued permit (Art. 62), from `ui/src/lib/fees.ts`

**Indexes:**

```cypher
CREATE CONSTRAINT hdab_approval_id IF NOT EXISTS FOR (ha:HDABApproval) REQUIRE ha.approvalId IS UNIQUE;
CREATE INDEX hdab_approval_status IF NOT EXISTS FOR (ha:HDABApproval) ON (ha.status);
```

---

#### `HealthDataRequest`

A request for a statistic instead of the data, **Regulation (EU) 2025/327 Art. 69**. The access body decides within three months (Art. 69(4)); on approval the question runs once in the applicant's name and only an anonymised statistical result is kept (aggregate templates only, identifier columns refused, counts below five suppressed). The applicant never sees the data behind it (Art. 69(1)).

**Properties:**

- `requestId: String!` — Unique request reference
- `applicantId: String!` — DID of the data user
- `question: String!` — The question, answered through the NLQ path
- `purpose: String!` — Art. 53(1) purpose
- `datasetId: String` — Dataset the statistic is about, if named
- `statisticalContent: String!` — Description of the statistical content (Art. 69(2)(d))
- `safeguards: String`, `legalBasis: String` — Art. 69(2)(e) and (f)
- `status: String!` — `PENDING`, `APPROVED` (no statistic could be produced), `ANSWERED`, `REJECTED`
- `submittedAt: DateTime!`, `decisionDue: DateTime!`, `decidedAt: DateTime`, `decidedBy: String`, `justification: String`, `publishBy: Date`
- `answer: String` — JSON rows of the anonymised statistic; `answerTemplate: String`; `answerError: String`; `answeredAt: DateTime`; `suppressedCells: Integer`; `kAnonymity: Integer`

**Indexes:**

```cypher
CREATE CONSTRAINT health_data_request_id IF NOT EXISTS FOR (r:HealthDataRequest) REQUIRE r.requestId IS UNIQUE;
CREATE INDEX health_data_request_status IF NOT EXISTS FOR (r:HealthDataRequest) ON (r.status);
```

---

#### `NonComplianceFinding`

A finding that a data user or holder failed to comply, **Regulation (EU) 2025/327 Art. 63** (issue #206, M4). The party states its views within four weeks (Art. 63(2)); the body closes the finding with a measure (Art. 63(3), fines under Art. 64), which the public register publishes (Art. 57(1)(j)(iv)).

**Properties:**

- `findingId: String!`, `partyId: String!`, `permitId: String` — The party and, if any, the permit concerned
- `description: String!`, `gdprBreach: Boolean`, `supervisoryAuthorityInformed: Boolean`
- `status: String!` — `OPEN`, `VIEWS_RECEIVED`, `CLOSED`
- `notifiedAt: DateTime!`, `respondBy: DateTime!` (four weeks), `views: String`, `respondedAt: DateTime`
- `measure: String` — `NONE`, `WARNING`, `REVOCATION`, `EXCLUSION` (with `exclusionMonths`, up to 60), `FINE` (with `fineEur`); `measureNote`, `closedAt`, `closedBy`, `foundBy`

**Relationships:** `(hdab:Participant)-[:FOUND]->(f)`, `(f)-[:AGAINST]->(party:Participant)`, `(f)-[:CONCERNS]->(permit:HDABApproval)`, `(f)-[:LED_TO]->(permit)` when the measure revoked it.

#### `InformationRequest`

The access body's request for information to a data user or holder, **Art. 63(1)**, and the answer on record (issue #206, M4).

**Properties:** `requestId: String!`, `partyId: String!`, `permitId`, `findingId`, `question: String!`, `status` (`OPEN`, `ANSWERED`), `requestedAt`, `answerBy` (four weeks), `answer`, `answeredAt`, `requestedBy`.

**Relationships:** `(hdab)-[:ASKED]->(i)`, `(i)-[:ASKED_OF]->(party)`, `(i)-[:ABOUT]->(f:NonComplianceFinding)`.

#### `ResultCommunication`

What a data user communicates about the results of its use, **Art. 61(4)**, within 18 months of the end of the processing under the permit (issue #206, M6). Published on the register (Art. 57(1)(j)(v)) and reported in the activity report (Art. 59(1)(j) and (k)).

**Properties:** `resultId: String!`, `permitId: String!`, `applicantId`, `kind` (`PUBLICATION`, `POLICY_DOCUMENT`, `REGULATORY_PROCEDURE`, `IT_PRODUCT`, `OTHER`), `title: String!`, `summary`, `url`, `communicatedAt`, `deadline` (the permit's `validUntil` plus 18 months), `onTime: Boolean`.

**Relationships:** `(rc)-[:RESULT_OF]->(permit:HDABApproval)`, `(user:Participant)-[:COMMUNICATED]->(rc)`.

**Indexes:**

```cypher
CREATE CONSTRAINT non_compliance_finding_id IF NOT EXISTS FOR (f:NonComplianceFinding) REQUIRE f.findingId IS UNIQUE;
CREATE INDEX non_compliance_finding_status IF NOT EXISTS FOR (f:NonComplianceFinding) ON (f.status);
CREATE CONSTRAINT information_request_id IF NOT EXISTS FOR (i:InformationRequest) REQUIRE i.requestId IS UNIQUE;
CREATE CONSTRAINT result_communication_id IF NOT EXISTS FOR (rc:ResultCommunication) REQUIRE rc.resultId IS UNIQUE;
CREATE INDEX transfer_event_retain_until IF NOT EXISTS FOR (te:TransferEvent) ON (te.retainUntil);
```

Two properties elsewhere belong to the same work: `TransferEvent.retainUntil` and `DataTransfer.retainUntil` (Art. 73(1)(e), one year after the record; nothing is deleted before it, nothing without it, `POST /api/admin/audit/retention`), and `Participant.trustedHolder: Boolean` with `trustedHolderSince` (Art. 72: the holder answers health data requests on the datasets it offers, `decidedUnder = 'Art. 72'` on the `HealthDataRequest`).

#### `Jurisdiction`, `NationalLaw`, `JurisdictionMilestone`

How a member state implements the secondary use of Regulation (EU) 2025/327 (issue #782): the legal role of its health data access body, the national law it acts under, how a person objects (Art. 71), whether access is charged for (Art. 62) and the dates. A jurisdiction, not a translation. The laws and roles are real; the participants under them stay fictional. Seeded for DE, AT, BE, FR, NL and ES by `neo4j/seed-jurisdictions.cypher`; served by `GET /api/jurisdictions` and shown on `/jurisdictions`.

**`Jurisdiction` properties:** `code: String!` (ISO 3166-1 alpha-2), `name`, `nameNative`, `languages: String[]` (ISO 639-1), `accessBodyRole` (national language), `accessBodyRoleEn`, `designationStatus`, `optOutModel`, `fees`, `summary`, `sources: String[]`, `reviewedOn` (ISO date the profile was last checked against its sources), `sortOrder`.

**`NationalLaw` properties:** `lawId: String!`, `title` (official, national language), `titleEn`, `citation`, `year`, `url`, `status` (`IN_FORCE`, `BILL`, `DRAFT`).

**`JurisdictionMilestone` properties:** `milestoneId: String!`, `date` (ISO date, or year or year-month), `label`, `scope` (`EU` for a date of the Regulation, shared by every jurisdiction; `NATIONAL`), `status` (`DONE`, `PLANNED`).

**Relationships:** `(j)-[:HAS_LEGAL_BASIS]->(law:NationalLaw)`, `(j)-[:HAS_MILESTONE]->(m:JurisdictionMilestone)`, `(p:Participant)-[:UNDER_JURISDICTION]->(j)` for every participant whose `country` is the code.

**Indexes:**

```cypher
CREATE CONSTRAINT jurisdiction_code IF NOT EXISTS FOR (j:Jurisdiction) REQUIRE j.code IS UNIQUE;
CREATE CONSTRAINT national_law_id IF NOT EXISTS FOR (l:NationalLaw) REQUIRE l.lawId IS UNIQUE;
CREATE CONSTRAINT jurisdiction_milestone_id IF NOT EXISTS FOR (m:JurisdictionMilestone) REQUIRE m.milestoneId IS UNIQUE;
```

### 2.2 Relationships

```cypher
(:Participant)-[:OFFERS]->(:DataProduct)
(:Participant)-[:CONSUMES]->(:DataProduct)
(:Contract)-[:GOVERNS]->(:DataProduct)
(:Contract)-[:PROVIDER {participantId}]->(:Participant)
(:Contract)-[:CONSUMER {participantId}]->(:Participant)

// EHDS access body chain (Regulation (EU) 2025/327, Art. 67 to 69, 61, 63)
(:Participant)-[:SUBMITTED]->(:AccessApplication)
(:AccessApplication)-[:REQUESTS_ACCESS_TO]->(:DataProduct)
(:AccessApplication)-[:REQUESTS]->(:HealthDataset)
(:Participant {participantType: 'HDAB'})-[:REVIEWED]->(:AccessApplication)
(:HDABApproval)-[:APPROVES]->(:AccessApplication)
(:HDABApproval)-[:GRANTS_ACCESS_TO]->(:HealthDataset)
(:HDABApproval)-[:ISSUED_BY]->(:Participant {participantType: 'HDAB'})
(:HDABApproval)-[:APPROVED {approvalId, permittedPurpose}]->(:Contract)
(:Participant)-[:SUBMITTED]->(:HealthDataRequest)
(:HealthDataRequest)-[:REQUESTS]->(:HealthDataset)
(:Participant {participantType: 'HDAB'})-[:DECIDED]->(:HealthDataRequest)

// Audit trail under the permit (Art. 73(1)(e))
(:DataTransfer)-[:UNDER_PERMIT]->(:HDABApproval)
(:DataTransfer)-[:TRANSFERRED_BY]->(:Participant)
(:TransferEvent)-[:UNDER_PERMIT]->(:HDABApproval)
(:TransferEvent)-[:REQUESTED_BY]->(:Participant)
(:TransferEvent)-[:PROVIDED_BY]->(:Participant)
(:TransferEvent)-[:ACCESSED]->(:HealthDataset)

// National implementation (#782)
(:Jurisdiction)-[:HAS_LEGAL_BASIS]->(:NationalLaw)
(:Jurisdiction)-[:HAS_MILESTONE]->(:JurisdictionMilestone)
(:Participant)-[:UNDER_JURISDICTION]->(:Jurisdiction)
```

### 2.3 Operational Node Labels

The labels below run the hub around the marketplace: credentials, connector tenants, pseudonyms and secure processing, the audit trail, studies, and the patient's app. Each table names the key the constraint in `neo4j/init-schema.cypher` is on and the file that writes the node.

#### Credentials, tenants and policies

| Label                  | Key            | Properties                                                                                                            | Written by                                                                         |
| ---------------------- | -------------- | --------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `VerifiableCredential` | `credentialId` | `credentialType`, `format`, `issuerDid`, `subjectDid`, `issuedAt`, `expiresAt`, `status`                              | DCP v1.0 credentials; `(vc)-[:ISSUED_TO]->(:Participant)`                          |
| `ParticipantProfile`   | `profileId`    | `tenantId`, `identifier`, `displayName`, `role`, `version`, `createdAt`                                               | CFM tenant, one per participant and dataspace; `(pp)-[:OF_TENANT]->(:Participant)` |
| `VPA`                  | `vpaId`        | `vpaType` (`cfm.connector`, `cfm.credentialservice`, `cfm.dataplane`), `state`, `stateTimestamp`, `cellId`, `version` | CFM virtual participant agent; `(vpa)-[:OF_PROFILE]->(:ParticipantProfile)`        |
| `OdrlPolicy`           | `policyId`     | `name`, `odrlAction`, `ehdsPermissions`, `ehdsProhibitions`, `temporalLimit`, `createdAt`                             | `neo4j/register-dsp-marketplace.cypher`; `(:DataProduct)-[:GOVERNED_BY]->(pol)`    |

`ui/src/app/api/admin/policies/route.ts` registers policies while the control plane is offline, keyed by `policyId` with `id` set to the same value, and with `participantId`, `policyJson`, `source: 'local-registry'` and `(pol)-[:BELONGS_TO]->(:Participant)`. Before #1222 it merged on `id` alone; `neo4j/migrate-clinical-keys.cypher` keys those.

#### Trust Center, pseudonyms and secure processing (Art. 66, 73, 75)

| Label               | Key         | Properties                                                                                                                                                                                                       | Notes                                                                                                                                                                        |
| ------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TrustCenter`       | `name`      | `did`, `country`, `operatedBy`, `protocol`, `endpoint`, `status`, `description`, `createdAt`                                                                                                                     | `(tc)-[:GOVERNED_BY]->(:HDABApproval)`, `(tc)-[:RESOLVES_PSEUDONYMS_FOR]->(:HealthDataset)`, `(tc)-[:MANAGES]->(:SPESession)`, `(tc)-[:MUTUALLY_RECOGNISES]->(:TrustCenter)` |
| `ProviderPseudonym` | `psnId`     | `providerId`, `studyId`, `createdAt`                                                                                                                                                                             | Per provider; never shared with researchers                                                                                                                                  |
| `ResearchPseudonym` | `rpsnId`    | `studyId`, `mode`, `issuedBy`, `issuedAt`, `revoked`                                                                                                                                                             | Issued by the Trust Center, visible only inside the SPE; `(rp)-[:LINKED_FROM]->(:ProviderPseudonym)`, `(rp)-[:USED_IN]->(:SPESession)`                                       |
| `SPESession`        | `sessionId` | `studyId`, `status`, `teeType`, `attestation`, `attestedAt`, `verifiedBy`, `policyHash`, `approvedCodeHash`, `outputPolicy`, `kAnonymityThreshold`, `coordinatorEndpoint`, `createdBy`, `createdAt`, `simulated` | Created by the access body, not the researcher                                                                                                                               |
| `ImportedDataset`   | `datasetId` | `transferId`, `agreementId`, `assetId`, `provider`, `consumer`, `speId`, `name`, `records`, `pseudonymised`, `complete`, `refused`, `importedBy`, `importedAt`, `updatedAt`, `closedAt`                          | A transfer imported into an SPE workspace (#876, `services/neo4j-proxy/src/spe-import.ts`); `(d)-[:LOADED_INTO]->(:SpeWorkspace)`                                            |
| `ImportedRecord`    | `recordKey` | `datasetId`, `resourceType`, `resourceId`, `name`, `resource`                                                                                                                                                    | `(:ImportedDataset)-[:CONTAINS]->(r)`                                                                                                                                        |
| `ImportedFile`      | `fileKey`   | `datasetId`, `name`, `mediaType`, `bytes`, `sha256`, `content`                                                                                                                                                   | One per HttpFile-PUSH flow (ADR-095); `(:ImportedDataset)-[:CONTAINS]->(f)`                                                                                                  |

#### Transfers and the audit trail (Art. 73(1)(e))

| Label             | Key       | Properties                                                                                                                                                                                                                                                                 | Notes                                                               |
| ----------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `DataTransfer`    | `id`      | `transferId`, `contractId`, `permitId`, `assetId`, `status`, `protocol`, `providerDid`, `consumerDid`, `providerCountry`, `consumerCountry`, `crossBorder`, `byteSize`, `transferDate`, `timestamp`, `retainUntil`, `errorMessage`, `demo`                                 | Contract-level transfer; relationships in 2.2                       |
| `TransferEvent`   | `eventId` | `timestamp`, `endpoint`, `method`, `protocol`, `participant`, `providerDid`, `consumerDid`, `contractId`, `permitId`, `datasetId`, `purpose`, `statusCode`, `resultCount`, `responseBytes`, `contentType`, `duration`, `patientIds`, `retainUntil`, `errorMessage`, `demo` | One data access event; relationships in 2.2                         |
| `QueryAuditEvent` | `eventId` | `timestamp`, `participantId`, `question`, `cypher`, `method`, `resultCount`, `odrlEnforced`, `aggregateSuppressed`, `federated`, `contributors`                                                                                                                            | Superseded for new records by `AuditEvent` (#418); kept for history |
| `AuditEvent`      | `id`      | `chain`, `seq`, `prevHash`, `hash`, `recorded`, `eventType`, `outcome`, `participantId`, `resource`, `dedupeKey`                                                                                                                                                           | FHIR AuditEvent, hash-chained per chain (ADR-045 plane 2)           |
| `AuditChain`      | `id`      | `head`, `seq`, `lockedAt`                                                                                                                                                                                                                                                  | One head node per chain, which serialises writes                    |

#### Studies, quality and the patient's research view

| Label               | Key            | Properties                                                                                                                                              | Notes                                                                                                                      |
| ------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `ResearchStudy`     | `studyId`      | `name`, `studyName`, `institutionDid`, `status`, `purpose`, `dataNeeded`, `countries`, `participantCount`, `ethicsApproval`, `ehdsArticle`, `fictional` | `(:Participant)-[:CONDUCTS]->(rs)`, `(:PatientConsent)-[:FOR_STUDY]->(rs)`; seeded by `neo4j/seed-persona-overview.cypher` |
| `StudyEnrolment`    | `enrolmentId`  | `studyId`, `asOf`, `participants`                                                                                                                       | `(:ResearchStudy)-[:HAS_ENROLMENT]->(se)`                                                                                  |
| `QualityAssessment` | `assessmentId` | `period`, `assessedAt`, `assessor`, `completeness`, `conformance`, `timeliness`, `renewalBandLow`, `renewalBandHigh`, `ehdsArticle`, `fictional`        | Data quality label per quarter (Art. 78)                                                                                   |
| `PatientConsent`    | `consentId`    | `patientId`, `studyId`, `revoked`                                                                                                                       | Consent to join a study (GDPR Art. 9(2)(a)), withdrawable (Art. 7(3))                                                      |
| `ResearchInsight`   | `insightId`    | `studyId`, `finding`, `relevantConditions`, `recommendation`, `evidenceLevel`                                                                           | Read by `/api/patient/insights`; no seed writes one yet                                                                    |
| `OptOutRecord`      | `optOutId`     | `patientId`, `optedOutAt`, `source`, `reversedAt`, `reversalSource`                                                                                     | Art. 71 opt-out (ADR-062), never deleted; `(:Patient)-[:OPTED_OUT]->(o)`                                                   |

#### The patient's app (Klarbefund)

| Label           | Key        | Properties                                                      | Notes                                                                                                                                                           |
| --------------- | ---------- | --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AppConnection` | `deviceId` | `username`, `deviceName`, `client`, `connectedAt`, `lastSeenAt` | A connected phone (#473, ADR-049); `(:Patient)-[:HAS_APP_CONNECTION]->(a)`                                                                                      |
| `AppPairing`    | `id`       | `username`, `expiresAt`, `deviceId`, `deviceName`               | The pairing QR code, two minutes plus five of grace; in Neo4j because the UI runs more than one replica                                                         |
| `AppAttestKey`  | `keyId`    | `username`, `createdBy`, `environment`, `createdAt`             | The App Attest key an app-created account was attested with (ADR-054); one key, one account, and the record outlives the account (`ui/src/lib/app-accounts.ts`) |

---

## 3. Layer 2: HealthDCAT-AP Metadata

Layer 2 implements the [W3C HealthDCAT-AP](https://healthdcat-ap.github.io/) vocabulary — an application profile of [DCAT-AP 3.0](https://semiceu.github.io/DCAT-AP/releases/3.0.0/) extending [W3C DCAT 3](https://www.w3.org/TR/vocab-dcat-3/) with health-domain extensions required by the EHDS Regulation.

### 3.1 Node Labels

#### `Catalog`

A catalog of datasets, following `dcat:Catalog`.

**Properties:**

- `catalogId: String!` — URI identifier (`dct:identifier`)
- `title: String!` — Catalog name (`dct:title`)
- `description: String` — Catalog description (`dct:description`)
- `license: String` — License URI (`dct:license`)
- `homepage: String` — Homepage URL (`foaf:homepage`)
- `createdAt: DateTime`
- `modifiedAt: DateTime`

**Indexes:**

```cypher
CREATE CONSTRAINT catalog_id IF NOT EXISTS FOR (cat:Catalog) REQUIRE cat.catalogId IS UNIQUE;
```

---

#### `HealthDataset`

A dataset described using HealthDCAT-AP (`healthdcatap:Dataset` extending `dcat:Dataset`).

**Properties (DCAT-AP mandatory):**

- `datasetId: String!` — URI identifier (`dct:identifier`)
- `title: String!` — Dataset name (`dct:title`)
- `description: String` — Dataset description (`dct:description`)
- `issued: Date` — Publication date (`dct:issued`)
- `modified: Date` — Last modification (`dct:modified`)
- `language: String[]` — ISO 639-1 language codes (`dct:language`)
- `themes: String[]` — EuroVoc theme URIs (`dcat:theme`)

**Properties (translations, #782):** English is the source language of `title`, `description` and `hdcatapKeywords`. A translation is the same property with the language as suffix: `titleDe`, `descriptionDe`, `hdcatapKeywordsDe`, and likewise `Fr`, `Nl`, `Es`. The serialiser writes each value tagged with its language (`{"@value": ..., "@language": "de"}`); `GET /api/catalog` hands them over as `translations: {de: {title, description, keywords}}`. Set by `neo4j/seed-catalog-translations.cypher`.

**Properties (DCAT-AP recommended):**

- `dctSpatial: String` — Geographic coverage ISO 3166 (`dct:spatial`)
- `dctTemporalStart: Date` — Temporal coverage start (`dcat:startDate` within `dct:temporal`)
- `dctTemporalEnd: Date` — Temporal coverage end (`dcat:endDate` within `dct:temporal`)
- `conformsTo: String` — Standard URI (`dct:conformsTo`, e.g., `http://hl7.org/fhir/R4`)
- `landingPage: String` — Landing page URL (`dcat:landingPage`)

**Properties (HealthDCAT-AP health extensions):**

- `hdcatapDatasetType: String` — Dataset type (`healthdcatap:datasetType`, e.g., `SyntheticData`, `ClinicalTrial`, `Registry`)
- `hdcatapPersonalData: Boolean` — Contains personal data (`healthdcatap:personalData`)
- `hdcatapSensitiveData: Boolean` — Contains sensitive data (`healthdcatap:sensitiveData`)
- `hdcatapLegalBasisForAccess: String` — EHDS article reference (`healthdcatap:legalBasisForAccess`)
- `hdcatapPurpose: String` — Permitted purpose description (`healthdcatap:purpose`)
- `hdcatapPopulationCoverage: String` — Population description (`healthdcatap:populationCoverage`)
- `hdcatapNumberOfRecords: Long` — Total record count (`healthdcatap:numberOfRecords`)
- `hdcatapNumberOfUniqueIndividuals: Long` — Unique individual count (`healthdcatap:numberOfUniqueIndividuals`)
- `hdcatapHealthCategory: String[]` — EEHRxF priority categories (`healthdcatap:healthCategory`)
- `hdcatapHealthTheme: String[]` — MeSH / ICD-10 / SNOMED URIs (`healthdcatap:healthTheme`)
- `hdcatapMinTypicalAge: Integer` — Minimum typical age (`healthdcatap:minTypicalAge`)
- `hdcatapMaxTypicalAge: Integer` — Maximum typical age (`healthdcatap:maxTypicalAge`)
- `hdcatapPublisherType: String` — Publisher role (`healthdcatap:publisherType`, e.g., `DataHolder`, `HDAB`, `Researcher`)

**Properties (provenance):**

- `source: String` — Source URL
- `generator: String` — Data generator tool
- `fhirVersion: String` — FHIR version (e.g., `R4`)
- `omopCdmVersion: String` — OMOP CDM version (e.g., `5.4`)
- `createdAt: DateTime`
- `modifiedAt: DateTime`

**Indexes:**

```cypher
CREATE CONSTRAINT dataset_id IF NOT EXISTS FOR (hd:HealthDataset) REQUIRE hd.datasetId IS UNIQUE;
```

#### `VariablesTableGroup`, `VariablesTable`, `VariablesColumn`

The variables a dataset holds, HealthDCAT-AP Release 8 `healthdcatap:hasVariables` as a CSVW table group (#700, `neo4j/register-healthdcat-ap-r8.cypher`):

- `VariablesTableGroup`: `groupId` (key), `title`
- `VariablesTable`: `tableId` (key), `name`, `title`
- `VariablesColumn`: `columnId` (key), `name`, `title`, `description`, `datatype`

```cypher
(:HealthDataset)-[:HAS_VARIABLES]->(:VariablesTableGroup)-[:HAS_TABLE]->(:VariablesTable)-[:HAS_COLUMN]->(:VariablesColumn)
CREATE CONSTRAINT variables_table_group_id IF NOT EXISTS FOR (tg:VariablesTableGroup) REQUIRE tg.groupId IS UNIQUE;
CREATE CONSTRAINT variables_table_id IF NOT EXISTS FOR (tb:VariablesTable) REQUIRE tb.tableId IS UNIQUE;
CREATE CONSTRAINT variables_column_id IF NOT EXISTS FOR (c:VariablesColumn) REQUIRE c.columnId IS UNIQUE;
```

---

#### `Distribution`

A specific representation/format of a dataset (`dcat:Distribution`).

**Properties:**

- `distributionId: String!` — URI identifier (`dct:identifier`)
- `title: String` — Distribution name (`dct:title`)
- `format: String!` — MIME type (`dcat:mediaType`, e.g., `application/fhir+json`, `text/csv`)
- `accessUrl: String` — DSP access endpoint (`dcat:accessURL`)
- `accessService: String` — Service description (`dcat:accessService`)
- `byteSize: Long` — Size in bytes (`dcat:byteSize`)
- `checksum: String` — SHA-256 hash (`spdx:checksum`)
- `conformsTo: String` — Standard URI (`dct:conformsTo`, e.g., `http://hl7.org/fhir/R4`)
- `description: String` — Distribution description (`dct:description`)
- `createdAt: DateTime`

**Indexes:**

```cypher
CREATE CONSTRAINT distribution_id IF NOT EXISTS FOR (d:Distribution) REQUIRE d.distributionId IS UNIQUE;
```

---

#### `ContactPoint`

Contact information for a dataset (`vcard:ContactPoint`).

**Properties:**

- `contactId: String!` — URI identifier
- `name: String` — Contact name (`vcard:fn`)
- `email: String` — Contact email (`vcard:hasEmail`)
- `url: String` — Contact URL (`vcard:hasURL`)
- `role: String` — Contact role (e.g., `DataSteward`, `DPO`)

**Indexes:**

```cypher
CREATE CONSTRAINT contact_point_id IF NOT EXISTS FOR (cp:ContactPoint) REQUIRE cp.contactId IS UNIQUE;
```

---

#### `Organization`

An organization that publishes or owns datasets (`foaf:Organization`).

**Properties:**

- `organizationId: String!` — URI identifier
- `name: String!` — Organization name (`foaf:name`)
- `jurisdiction: String` — ISO 3166 country code
- `ehdsRole: String` — EHDS role (`DataHolder`, `HDAB`, `Researcher`)
- `createdAt: DateTime`

**Indexes:**

```cypher
CREATE CONSTRAINT organization_id IF NOT EXISTS FOR (org:Organization) REQUIRE org.organizationId IS UNIQUE;
```

---

#### `DataService` (`BonusProgramme`)

An offer of another data space that is not a health dataset, a DCAT-AP 3.0.1
`dcat:DataService` from the crawl (#934). The catalog enricher writes it; a
service typed `ehds:BonusProgramme` also carries the label `BonusProgramme`
(AlphaKasse DE's programme, ADR-080). Its rule is the versioned
`dct:Standard` it conforms to.

**Properties:**

- `serviceId: String!` — IRI of the service (`@id`)
- `title: String!`, `description: String` — English text (`dct:title`, `dct:description`)
- `publisherDid: String!`, `publisherName: String` — the crawled participant and its `foaf:name`
- `endpointUrl: String` — `dcat:endpointURL`
- `themes: [String]`, `keywords: [String]`, `accessRights: String` — vocabulary codes and English keywords
- `applicableLegislation: [String]`, `conformsTo: [String]` — ELI and standard IRIs
- `ruleId`, `ruleTitle`, `ruleDescription`, `ruleVersion: String` — the rule (`owl:versionInfo`)
- `source: 'federated'`, `lastSeenAt: DateTime`

**Indexes:**

```cypher
CREATE CONSTRAINT data_service_id IF NOT EXISTS FOR (ds:DataService) REQUIRE ds.serviceId IS UNIQUE;
```

---

#### `ProgrammeConsent`, `ProgrammeTransfer`

A person's consent to one bonus program (#934 step 4, ADR-080 decision 6):
joined, seen and withdrawn in the patient portal, separate from study consent
(`PatientConsent`) and from the Art. 71 opt-out (`OptOutRecord`). A
`ProgrammeTransfer` is the person's instruction to send a year's answer; it is
recorded only under an open consent (`withdrawnAt` null), otherwise the route
answers 403.

**Properties:**

- `ProgrammeConsent`: `consentId: String!`, `patientId`, `programmeId`, `joinedAt: DateTime`, `withdrawnAt: DateTime` (null while open)
- `ProgrammeTransfer`: `transferId: String!`, `patientId`, `programmeId`, `year: Integer`, `goalMet: Boolean` (worked out by the hub for an ended year, #934 step 6, ADR-087; null on transfers recorded before it), `status` (`evaluated`, then `delivered` once the insurer has collected it, #934 step 8, ADR-091; `awaiting-evaluation` before step 6), `requestedAt: DateTime`, `deliveredAt: DateTime` and `deliveredTo` (the collecting connector's DID; both null until collected)

**Indexes:**

```cypher
CREATE CONSTRAINT programme_consent_id IF NOT EXISTS FOR (c:ProgrammeConsent) REQUIRE c.consentId IS UNIQUE;
CREATE INDEX programme_consent_patient IF NOT EXISTS FOR (c:ProgrammeConsent) ON (c.patientId, c.programmeId);
CREATE CONSTRAINT programme_transfer_id IF NOT EXISTS FOR (t:ProgrammeTransfer) REQUIRE t.transferId IS UNIQUE;
```

---

#### `PublishedAggregate`

A figure a national source released for publication (ADR-094, #1123):
anonymised by the source, with its source, licence, release date and the
source's small-count rule. The hub may hold it; the rows behind it stay at
the source. `neo4j/seed-national-sources.cypher` seeds one fictional example,
linked to MedReg DE's fictional national claims and ePA dataset.

**Properties:**

- `aggregateId: String!`: identifier
- `title: String!`, `description: String`: what the figure is
- `value: Float`, `unit: String`: the figure (e.g. `8.9`, `%`)
- `population: String`, `period: String`: whom and when it covers
- `sourceUrl: String!`: where the source published it
- `licence: String!`: the licence it was published under (e.g. `CC-BY-4.0`)
- `releaseDate: Date!`: when the source released it
- `smallCountRule: String!`: the source's own suppression rule
- `fictional: Boolean`: `true` in every demo seed

**Indexes:**

```cypher
CREATE CONSTRAINT published_aggregate_id IF NOT EXISTS FOR (pa:PublishedAggregate) REQUIRE pa.aggregateId IS UNIQUE;
```

---

### 3.2 Relationships

```cypher
// Catalog structure
(:Organization)-[:PUBLISHES]->(:Catalog)
(:Catalog)-[:HAS_DATASET]->(:HealthDataset)
(:Organization)-[:OWNS_DATASET]->(:HealthDataset)

// Dataset metadata
(:DataProduct)-[:DESCRIBED_BY]->(:HealthDataset)
(:HealthDataset)-[:HAS_DISTRIBUTION]->(:Distribution)
(:HealthDataset)-[:PUBLISHED_BY]->(:Participant)
(:DataService)-[:PUBLISHED_BY]->(:Participant)
(:Patient)-[:GAVE_PROGRAMME_CONSENT]->(:ProgrammeConsent)-[:FOR_PROGRAMME]->(:BonusProgramme)
(:ProgrammeTransfer)-[:UNDER_CONSENT]->(:ProgrammeConsent)
(:HealthDataset)-[:HAS_CONTACT_POINT]->(:ContactPoint)
(:HealthDataset)-[:HAS_THEME]->(:EEHRxFCategory)
(:HealthDataset)-[:SUBJECT_TO_PURPOSE]->(:EhdsPurpose)
(:HealthDataset)-[:HAS_PUBLISHED_AGGREGATE]->(:PublishedAggregate)
```

---

### 3.3 EEHRxF Profile Metadata

The [EHDS Regulation, Art. 14(1)](https://eur-lex.europa.eu/eli/reg/2025/327/oj/eng#art_14) names six priority categories for the European electronic health record exchange format (EEHRxF). [HL7 Europe](https://hl7.eu/fhir/) publishes the FHIR R4 Implementation Guides for them.

All three node types below are generated: `scripts/eehrxf/build.py` writes `neo4j/register-eehrxf-profiles.cypher` from `scripts/eehrxf/profiles.json` and the HL7 FHIR Validator's report `scripts/eehrxf/validation-report.json` (#1144). Do not edit the Cypher by hand.

#### `EEHRxFCategory`

An EHDS priority category for electronic health data exchange.

**Properties:**

- `categoryId: String!`: Kebab-case identifier (e.g., `patient-summary`)
- `name: String!`: Human-readable name
- `description: String`: Category scope
- `ehdsDeadline: String`: EHDS implementation deadline (e.g., `2029-03`)
- `article: String`: The point of Art. 14(1) (e.g., `Art. 14(1)(a)`)
- `ehdsGroup: Integer`: Rollout group (1 = 2029, 2 = 2031)
- `status: String`: From the profile results: `available` (every profile `full`), `partial`, `none`, `untested`
- `tested: Integer`, `passed: Integer`: Resources validated and passing, summed over the category's profiles
- `profileCount: Integer`, `totalResources: Integer`: Profiles linked; graph nodes of their base types

**Indexes:**

```cypher
CREATE CONSTRAINT eehrxf_category_id IF NOT EXISTS FOR (c:EEHRxFCategory) REQUIRE c.categoryId IS UNIQUE;
```

#### `EEHRxFProfile`

An HL7 Europe FHIR profile implementing part of the EEHRxF specification.

**Properties:**

- `profileId: String!`: Kebab-case identifier (e.g., `patient-eu-core`)
- `name: String!`: Profile display name (e.g., `Patient (EU core)`)
- `igName: String!`: Parent IG name (e.g., `HL7 Europe Base and Core`)
- `igPackage: String`: FHIR package ID and version (e.g., `hl7.fhir.eu.base#2.0.1`)
- `fhirVersion: String`: Target FHIR version (`R4`)
- `status: String`: Maturity of the IG (`STU 2`, `Ballot`)
- `canonical: String`: Canonical URL of the StructureDefinition
- `url: String`: The profile's page in the published IG
- `baseResource: String`: FHIR resource type this profile constrains (e.g., `Patient`)
- `tested: Integer`, `passed: Integer`, `failed: Integer`: Resources the validator checked against this profile, and the outcome
- `topIssues: [String]`: The most frequent validator errors, with how many resources each affects
- `coverage: String`: `full` (all tested pass), `partial`, `none`, `untested` (the hub ingests nothing of that type)
- `resourceCount: Integer`: Graph nodes of the base type, for context; not coverage

#### `EEHRxFValidationRun`

The validator run the profile results come from, one node with `runId: 'current'`: `validatorVersion`, `terminology` (not checked), `passRule`, `maxPerSource`, `igs`, `sources`, `inputsDigest`.

#### `EEHRxFPlannedGuide`

An HL7 Europe draft the hub plans to track but does not validate yet, such as the Common Cancer Model (#1145): `guideId`, `name`, `igPackage`, `status`, `url`, `issue`, `scope`. Not linked to a category: the Cancer Model is not an Art. 14 priority category.

#### `EEHRxFImplementingAct`

The implementing act that lays down the EEHRxF (Art. 15(1)), whose annexes define the categories (#1205). One node, keyed by its Commission `reference` (`Ares(2026)10884928`, the draft): `title`, `status`, `legalBasis`, `fhirVersion`, `url`, `actUrl`, `annexUrl`, `feedbackFrom`, `feedbackUntil`, `implementationGuideDue`. Each `EEHRxFCategory` names its annex in `annex` and links to the act with `DEFINED_IN`.

#### `NationalProfileGuide`

A German implementation guide the validator checks the same resources against, kept apart from the EEHRxF coverage (#1172, #1261). Only guides marked `onPage` in `scripts/eehrxf/profiles.json` reach the graph, today the three MII Kerndatensatz modules (Basis, Laborbefund, Medikation): `guideId`, `name`, `publisher`, `country` (`DE`), `igPackage`, `status`, `home`, `gate` (whether a new failure fails CI), `checkedOn`. Written by `neo4j/register-national-profiles.cypher`, which `scripts/eehrxf/build.py` generates.

#### `NationalProfile`

One profile of a `NationalProfileGuide` with its validation result: `profileId`, `name`, `country`, `canonical`, `baseResource`, `fhirVersion`, `tested`, `passed`, `failed`, `topIssues`, `coverage`. Never counted as EEHRxF coverage.

**Indexes:**

```cypher
CREATE CONSTRAINT eehrxf_profile_id IF NOT EXISTS FOR (p:EEHRxFProfile) REQUIRE p.profileId IS UNIQUE;
CREATE INDEX eehrxf_profile_base IF NOT EXISTS FOR (p:EEHRxFProfile) ON (p.baseResource);
CREATE CONSTRAINT eehrxf_validation_run_id IF NOT EXISTS FOR (v:EEHRxFValidationRun) REQUIRE v.runId IS UNIQUE;
CREATE CONSTRAINT eehrxf_planned_guide_id IF NOT EXISTS FOR (g:EEHRxFPlannedGuide) REQUIRE g.guideId IS UNIQUE;
CREATE CONSTRAINT eehrxf_implementing_act_ref IF NOT EXISTS FOR (a:EEHRxFImplementingAct) REQUIRE a.reference IS UNIQUE;
CREATE CONSTRAINT national_profile_id IF NOT EXISTS FOR (p:NationalProfile) REQUIRE p.profileId IS UNIQUE;
CREATE CONSTRAINT national_profile_guide_id IF NOT EXISTS FOR (g:NationalProfileGuide) REQUIRE g.guideId IS UNIQUE;
```

#### EEHRxF Relationships

```cypher
(:EEHRxFProfile)-[:PART_OF_CATEGORY]->(:EEHRxFCategory)
(:EEHRxFProfile)-[:DEPENDS_ON]->(:EEHRxFProfile)
(:EEHRxFCategory)-[:DEFINED_IN]->(:EEHRxFImplementingAct)
(:NationalProfile)-[:PUBLISHED_IN]->(:NationalProfileGuide)
(:NationalProfile)-[:CORRESPONDS_TO]->(:EEHRxFProfile)
```

- `PART_OF_CATEGORY`: Links a profile to its EHDS priority category
- `DEPENDS_ON`: Every profile except Bundles builds on the EU core Patient
- `PUBLISHED_IN`: Links a German profile to its guide
- `CORRESPONDS_TO`: Links a German profile to the EEHRxF profile that covers the same ground

No relationship links a profile to FHIR nodes: the `PROFILES_RESOURCE` this section used to describe was never created. Coverage comes from validation (#1144).

---

## 4. Layer 3: FHIR Clinical Knowledge Graph

### 4.1 Core FHIR Node Labels

Based on HL7 FHIR R4 resource types. Node labels match FHIR resource names.

#### `Patient`

**Properties:**

- `resourceId: String!` — FHIR `id`
- `identifier: String[]` — FHIR `identifier` array (e.g., MRN, national ID)
- `birthDate: Date`
- `gender: String` — FHIR `gender` (male, female, other, unknown)
- `deceasedBoolean: Boolean`
- `deceasedDateTime: DateTime`
- `active: Boolean`

**Indexes:**

```cypher
CREATE CONSTRAINT patient_id IF NOT EXISTS FOR (p:Patient) REQUIRE p.resourceId IS UNIQUE;
CREATE INDEX patient_identifier IF NOT EXISTS FOR (p:Patient) ON (p.identifier);
```

---

#### `Condition`

**Properties:**

- `resourceId: String!`
- `clinicalStatus: String` — FHIR ValueSet (active, recurrence, relapse, inactive, remission, resolved)
- `verificationStatus: String` — (unconfirmed, provisional, differential, confirmed, refuted, entered-in-error)
- `category: String[]` — FHIR condition-category (problem-list-item, encounter-diagnosis)
- `code: String!` — SNOMED CT / ICD-10 code
- `codeSystem: String!` — e.g., `http://snomed.info/sct`
- `codeDisplay: String` — Human-readable term
- `onsetDateTime: DateTime`
- `abatementDateTime: DateTime`
- `recordedDate: DateTime`

**Indexes:**

```cypher
CREATE CONSTRAINT condition_id IF NOT EXISTS FOR (c:Condition) REQUIRE c.resourceId IS UNIQUE;
CREATE INDEX condition_code IF NOT EXISTS FOR (c:Condition) ON (c.code);
```

---

#### `Observation`

**Properties:**

- `resourceId: String!`
- `status: String!` — (registered, preliminary, final, amended, corrected, cancelled, entered-in-error, unknown)
- `category: String[]` — (vital-signs, laboratory, imaging, survey, social-history)
- `code: String!` — LOINC / SNOMED CT code
- `codeSystem: String!`
- `codeDisplay: String`
- `valueQuantity: Float`
- `unit: String`: the unit of the value. Every writer sets it: the Synthea loader (`scripts/load_fhir_neo4j.py`, with the value in `value`), the study-result and persona seeds, and the synthetic schema data
- `valueUnit: String`: the same unit under an older name. The seeds still write it beside `unit`; read `coalesce(o.unit, o.valueUnit)` as `neo4j/fhir-to-omop-transform.cypher` does, and never write `valueUnit` alone
- `valueCodeableConcept: String` — Coded result
- `effectiveDateTime: DateTime`
- `issued: DateTime`
- `interpretation: String[]` — (normal, abnormal, critical, high, low)

Every writer sets `resourceId`, the key of the constraint. The Synthea loader and `scripts/generate-graph-seed.py` merge on `id` and set `resourceId` to the same value, on Patient, Encounter, Condition, MedicationRequest and Procedure too; `neo4j/migrate-clinical-keys.cypher` keys nodes they wrote before #1222 and gives the graph seed's laboratory values (`obs-<patient>-<loinc>`) their unit and a value in the test's range. The date is still `dateTime` or `date` there rather than `effectiveDate`; readers coalesce the variants.

**Indexes:**

```cypher
CREATE CONSTRAINT observation_id IF NOT EXISTS FOR (o:Observation) REQUIRE o.resourceId IS UNIQUE;
CREATE INDEX observation_code IF NOT EXISTS FOR (o:Observation) ON (o.code);
CREATE INDEX observation_category IF NOT EXISTS FOR (o:Observation) ON (o.category);
```

---

#### `MedicationRequest`

**Properties:**

- `resourceId: String!`
- `status: String!` — (active, on-hold, cancelled, completed, entered-in-error, stopped, draft, unknown)
- `intent: String!` — (proposal, plan, order, original-order, reflex-order, filler-order, instance-order, option)
- `medicationCode: String!` — RxNorm / ATC code
- `medicationCodeSystem: String!`
- `medicationDisplay: String`
- `authoredOn: DateTime`
- `dosageText: String`
- `dosageQuantity: Float`
- `dosageUnit: String`

**Indexes:**

```cypher
CREATE CONSTRAINT medication_request_id IF NOT EXISTS FOR (mr:MedicationRequest) REQUIRE mr.resourceId IS UNIQUE;
CREATE INDEX medication_code IF NOT EXISTS FOR (mr:MedicationRequest) ON (mr.medicationCode);
```

---

#### `Encounter`

**Properties:**

- `resourceId: String!`
- `status: String!` — (planned, arrived, triaged, in-progress, onleave, finished, cancelled, entered-in-error, unknown)
- `class: String!` — (ambulatory, emergency, field, home health, inpatient, observation, virtual)
- `type: String[]` — Encounter type codes
- `period_start: DateTime`
- `period_end: DateTime`
- `serviceProvider: String` — Organization reference

**Indexes:**

```cypher
CREATE CONSTRAINT encounter_id IF NOT EXISTS FOR (e:Encounter) REQUIRE e.resourceId IS UNIQUE;
```

---

#### `Procedure`

**Properties:**

- `resourceId: String!`
- `status: String!`
- `code: String!` — CPT / SNOMED CT / ICD-10-PCS
- `codeSystem: String!`
- `codeDisplay: String`
- `performedDateTime: DateTime`
- `performedPeriod_start: DateTime`
- `performedPeriod_end: DateTime`

---

#### `DiagnosticReport`

A study result beyond a single laboratory value (ADR-059), and the report a FHIR document import groups its Observations under (#1173). Seeded by `neo4j/seed-study-results.cypher`; written on import by `ui/src/lib/fhir-documents/store.ts`.

**Properties:** `resourceId` (key), `status`, `code`, `codeSystem`, `display`, `name`, `category`, `categoryDisplay`, `modality`, `effectiveDate`, `issued`, `performer`, `conclusion`, `fictional`.

#### `Immunization`

A vaccination (ADR-059): `resourceId` (key), `status`, `vaccineCode`, `codeSystem`, `display`, `name`, `occurrenceDate`, `lotNumber`, `performer`, `fictional`.

#### `MedicationStatement`

A line of the medication plan (ADR-059), or a statement a Patient Summary carries: `resourceId` (key), `status`, `medicationCode`, `codeSystem`, `display`, `name`, `dose`, `doseUnit`, `dosageText`, `effectiveStart`, `reason`, `planId`, `planPrinted`, `source`, `fictional`.

#### `AllergyIntolerance`

An allergy an imported Patient Summary carries (#1173): `resourceId` (key), `code`, `codeSystem`, `display`, `name`, `clinicalStatus`, `verificationStatus`, `type`, `category`, `criticality`, `onsetDate`.

#### `DocumentReference`

A FHIR document read back into the record (#1173). It holds the document's metadata and its SHA-256, never its content: `documentId` (key), `identifierSystem`, `identifierValue`, `timestamp`, `typeCode`, `title`, `name`, `authors`, `custodian`, `profile`, `contentSha256`, `size`, `importCount`, `createdAt`, `lastImportedAt`.

The `Provenance` of each import (`provenanceId`, `recorded`, `activity`, `agentRole`, `agentId`, `documentId`) points to the document with `SOURCE` and to every node the import touched.

**Indexes:**

```cypher
CREATE CONSTRAINT diagnostic_report_id IF NOT EXISTS FOR (dr:DiagnosticReport) REQUIRE dr.resourceId IS UNIQUE;
CREATE INDEX diagnostic_report_category IF NOT EXISTS FOR (dr:DiagnosticReport) ON (dr.category);
CREATE CONSTRAINT immunization_id IF NOT EXISTS FOR (im:Immunization) REQUIRE im.resourceId IS UNIQUE;
CREATE CONSTRAINT medication_statement_id IF NOT EXISTS FOR (ms:MedicationStatement) REQUIRE ms.resourceId IS UNIQUE;
CREATE INDEX medication_statement_plan IF NOT EXISTS FOR (ms:MedicationStatement) ON (ms.planId);
CREATE CONSTRAINT allergy_intolerance_id IF NOT EXISTS FOR (a:AllergyIntolerance) REQUIRE a.resourceId IS UNIQUE;
CREATE CONSTRAINT document_reference_id IF NOT EXISTS FOR (d:DocumentReference) REQUIRE d.documentId IS UNIQUE;
CREATE CONSTRAINT provenance_id IF NOT EXISTS FOR (pv:Provenance) REQUIRE pv.provenanceId IS UNIQUE;
```

---

### 4.2 FHIR Relationships

```cypher
(:Patient)-[:HAS_CONDITION]->(:Condition)
(:Patient)-[:HAS_OBSERVATION]->(:Observation)
(:Patient)-[:HAS_MEDICATION_REQUEST]->(:MedicationRequest)
(:Patient)-[:HAS_ENCOUNTER]->(:Encounter)
(:Patient)-[:HAS_PROCEDURE]->(:Procedure)
(:Patient)-[:HAS_DIAGNOSTIC_REPORT]->(:DiagnosticReport)
(:DiagnosticReport)-[:HAS_RESULT]->(:Observation)
(:Patient)-[:HAS_IMMUNIZATION]->(:Immunization)
(:Patient)-[:HAS_MEDICATION_STATEMENT]->(:MedicationStatement)
(:Patient)-[:HAS_ALLERGY_INTOLERANCE]->(:AllergyIntolerance)
(:Patient)-[:HAS_DOCUMENT_REFERENCE]->(:DocumentReference)
(:Provenance)-[:SOURCE]->(:DocumentReference)

(:Condition)-[:RECORDED_DURING]->(:Encounter)
(:Observation)-[:PART_OF]->(:Encounter)
(:Procedure)-[:PERFORMED_DURING]->(:Encounter)

(:Observation)-[:RELATES_TO]->(:Observation)  // hasMember, derivedFrom
(:Condition)-[:CAUSED_BY]->(:Condition)  // dueTo extension
```

---

### 4.3 Dataset Provenance

```cypher
(:Patient)-[:FROM_DATASET]->(:HealthDataset)
(:Condition)-[:FROM_DATASET]->(:HealthDataset)
(:Observation)-[:FROM_DATASET]->(:HealthDataset)
```

---

## 5. Layer 4: OMOP Research Analytics

### 5.1 OMOP Node Labels

Based on OMOP CDM v5.4. Prefixed with `OMOP` to avoid collision with FHIR nodes where names overlap.

#### `OMOPPerson`

Maps to OMOP `person` table.

**Properties:**

- `personId: Long!` — OMOP person_id
- `genderConceptId: Long!` — OMOP Concept ID for gender
- `yearOfBirth: Int!`
- `monthOfBirth: Int`
- `dayOfBirth: Int`
- `birthDatetime: DateTime`
- `raceConceptId: Long`
- `ethnicityConceptId: Long`
- `locationId: Long`
- `providerIdPrimary: Long`
- `careSiteIdPrimary: Long`

**Indexes:**

```cypher
CREATE CONSTRAINT omop_person_id IF NOT EXISTS FOR (op:OMOPPerson) REQUIRE op.personId IS UNIQUE;
```

---

#### `OMOPConditionOccurrence`

Maps to OMOP `condition_occurrence` table.

**Properties:**

- `conditionOccurrenceId: Long!`
- `personId: Long!`
- `conditionConceptId: Long!` — Standard SNOMED concept
- `conditionStartDate: Date!`
- `conditionStartDatetime: DateTime`
- `conditionEndDate: Date`
- `conditionEndDatetime: DateTime`
- `conditionTypeConceptId: Long!` — Provenance (EHR, claim, registry)
- `conditionStatusConceptId: Long`
- `stopReason: String`
- `visitOccurrenceId: Long`
- `conditionSourceValue: String` — Original code
- `conditionSourceConceptId: Long` — Source vocabulary concept

**Indexes:**

```cypher
CREATE CONSTRAINT omop_condition_occurrence_id IF NOT EXISTS FOR (oco:OMOPConditionOccurrence) REQUIRE oco.conditionOccurrenceId IS UNIQUE;
CREATE INDEX omop_condition_concept IF NOT EXISTS FOR (oco:OMOPConditionOccurrence) ON (oco.conditionConceptId);
```

---

#### `OMOPMeasurement`

Maps to OMOP `measurement` table (lab results, vital signs).

**Properties:**

- `measurementId: Long!`
- `personId: Long!`
- `measurementConceptId: Long!` — Standard LOINC concept
- `measurementDate: Date!`
- `measurementDatetime: DateTime`
- `measurementTime: String`
- `measurementTypeConceptId: Long!`
- `operatorConceptId: Long` — =, >=, <=, <, >
- `valueAsNumber: Float`
- `valueAsConceptId: Long`
- `unitConceptId: Long`
- `rangeHigh: Float`
- `rangeLow: Float`
- `visitOccurrenceId: Long`
- `measurementSourceValue: String`
- `measurementSourceConceptId: Long`
- `unitSourceValue: String`
- `unitSourceConceptId: Long`
- `valueSourceValue: String`

**Indexes:**

```cypher
CREATE CONSTRAINT omop_measurement_id IF NOT EXISTS FOR (om:OMOPMeasurement) REQUIRE om.measurementId IS UNIQUE;
CREATE INDEX omop_measurement_concept IF NOT EXISTS FOR (om:OMOPMeasurement) ON (om.measurementConceptId);
```

---

#### `OMOPDrugExposure`

Maps to OMOP `drug_exposure` table.

**Properties:**

- `drugExposureId: Long!`
- `personId: Long!`
- `drugConceptId: Long!` — Standard RxNorm ingredient
- `drugExposureStartDate: Date!`
- `drugExposureStartDatetime: DateTime`
- `drugExposureEndDate: Date`
- `drugExposureEndDatetime: DateTime`
- `verbatimEndDate: Date`
- `drugTypeConceptId: Long!`
- `stopReason: String`
- `refills: Int`
- `quantity: Float`
- `daysSupply: Int`
- `sig: String` — Dosage instructions
- `routeConceptId: Long`
- `lotNumber: String`
- `visitOccurrenceId: Long`
- `drugSourceValue: String`
- `drugSourceConceptId: Long`
- `routeSourceValue: String`
- `doseUnitSourceValue: String`

---

#### `OMOPProcedureOccurrence`

Maps to OMOP `procedure_occurrence` table.

**Properties:**

- `id: String!`
- `name: String` — Display name of the procedure
- `procedureDate: String` — Date the procedure was performed (YYYY-MM-DD)
- `procedureSourceValue: String` — Source code (SNOMED CT or ADA CDT)
- `procedureConceptId: Long` — OMOP standard concept ID (0 = unmapped)
- `personId: String` — Reference to OMOPPerson

---

#### `OMOPVisitOccurrence`

Maps to OMOP `visit_occurrence` table.

**Properties:**

- `visitOccurrenceId: Long!`
- `personId: Long!`
- `visitConceptId: Long!` — Inpatient, Outpatient, ER, etc.
- `visitStartDate: Date!`
- `visitStartDatetime: DateTime`
- `visitEndDate: Date`
- `visitEndDatetime: DateTime`
- `visitTypeConceptId: Long!`
- `providerId: Long`
- `careSiteId: Long`
- `visitSourceValue: String`
- `visitSourceConceptId: Long`
- `admittingSourceConceptId: Long`
- `admittingSourceValue: String`
- `dischargeToConceptId: Long`
- `dischargeToSourceValue: String`
- `precedingVisitOccurrenceId: Long`

---

### 5.2 OMOP Relationships

```cypher
(:OMOPPerson)-[:HAS_CONDITION_OCCURRENCE]->(:OMOPConditionOccurrence)
(:OMOPPerson)-[:HAS_MEASUREMENT]->(:OMOPMeasurement)
(:OMOPPerson)-[:HAS_DRUG_EXPOSURE]->(:OMOPDrugExposure)
(:OMOPPerson)-[:HAS_PROCEDURE_OCCURRENCE]->(:OMOPProcedureOccurrence)
(:OMOPPerson)-[:HAS_VISIT_OCCURRENCE]->(:OMOPVisitOccurrence)

(:OMOPConditionOccurrence)-[:DURING_VISIT]->(:OMOPVisitOccurrence)
(:OMOPMeasurement)-[:DURING_VISIT]->(:OMOPVisitOccurrence)
(:OMOPDrugExposure)-[:DURING_VISIT]->(:OMOPVisitOccurrence)
```

---

### 5.3 FHIR ↔ OMOP Mapping Relationships

These relationships preserve bidirectional traceability and transformation provenance.

```cypher
(:Patient)-[:MAPPED_TO]->(:OMOPPerson)
(:Condition)-[:MAPPED_TO]->(:OMOPConditionOccurrence)
(:Observation)-[:MAPPED_TO {observationType}]->(:OMOPMeasurement)
(:MedicationRequest)-[:MAPPED_TO]->(:OMOPDrugExposure)
(:Procedure)-[:MAPPED_TO]->(:OMOPProcedureOccurrence)
(:Encounter)-[:MAPPED_TO]->(:OMOPVisitOccurrence)

// Properties on MAPPED_TO relationship:
// - transformationRule: String (FML rule ID)
// - transformedAt: DateTime
// - lossOfDetail: String[] (list of FHIR elements not mappable to OMOP)
```

---

## 6. Layer 5: Clinical Ontology Backbone

### 6.1 Terminology Node Labels

#### `SnomedConcept`

**Properties:**

- `conceptId: String!` — SNOMED CT concept ID, a string like every terminology key (#1231): a uniqueness constraint treats 38341003 and "38341003" as two values
- `fsn: String!` — Fully Specified Name
- `preferredTerm: String!`
- `active: Boolean!`
- `effectiveTime: Date`
- `moduleId: Long`

**Indexes:**

```cypher
CREATE CONSTRAINT snomed_concept_id IF NOT EXISTS FOR (sc:SnomedConcept) REQUIRE sc.conceptId IS UNIQUE;
```

---

#### `LoincCode`

**Properties:**

- `loincNumber: String!` — LOINC code (e.g., `85354-9`)
- `longCommonName: String!`
- `shortName: String`
- `component: String`
- `property: String`
- `timeAspect: String`
- `system: String`
- `scaleType: String`
- `methodType: String`
- `class: String`
- `versionLastChanged: String`

**Indexes:**

```cypher
CREATE CONSTRAINT loinc_code IF NOT EXISTS FOR (lc:LoincCode) REQUIRE lc.loincNumber IS UNIQUE;
```

---

#### `ICD10Code`

**Properties:**

- `code: String!` — ICD-10 code (e.g., `E11.9`)
- `description: String!`
- `category: String`
- `subcategory: String`
- `version: String` — ICD-10-CM, ICD-10-WHO

**Indexes:**

```cypher
CREATE CONSTRAINT icd10_code IF NOT EXISTS FOR (icd:ICD10Code) REQUIRE icd.code IS UNIQUE;
```

---

#### `RxNormConcept`

**Properties:**

- `rxcui: String!` — RxNorm Concept Unique Identifier
- `name: String!`
- `tty: String` — Term Type (IN = ingredient, SCD = semantic clinical drug)
- `active: Boolean`

**Indexes:**

```cypher
CREATE CONSTRAINT rxnorm_rxcui IF NOT EXISTS FOR (rx:RxNormConcept) REQUIRE rx.rxcui IS UNIQUE;
```

---

### 6.2 Ontology Relationships

#### SNOMED CT Hierarchy

```cypher
(:SnomedConcept)-[:IS_A]->(:SnomedConcept)
(:SnomedConcept)-[:FINDING_SITE]->(:SnomedConcept)
(:SnomedConcept)-[:CAUSATIVE_AGENT]->(:SnomedConcept)
(:SnomedConcept)-[:ASSOCIATED_MORPHOLOGY]->(:SnomedConcept)
```

#### LOINC Relationships

```cypher
(:LoincCode)-[:HAS_COMPONENT]->(:LoincCode)
(:LoincCode)-[:HAS_METHOD]->(:LoincCode)
```

#### RxNorm Ingredient Hierarchy

```cypher
(:RxNormConcept)-[:HAS_INGREDIENT]->(:RxNormConcept)
(:RxNormConcept)-[:HAS_DOSE_FORM]->(:RxNormConcept)
```

---

### 6.3 Clinical Data → Ontology Relationships

```cypher
(:Condition)-[:CODED_BY]->(:SnomedConcept)
(:Condition)-[:CODED_BY]->(:ICD10Code)

(:Observation)-[:CODED_BY]->(:LoincCode)
(:Observation)-[:CODED_BY]->(:SnomedConcept)

(:MedicationRequest)-[:CODED_BY]->(:RxNormConcept)

(:OMOPConditionOccurrence)-[:STANDARD_CONCEPT]->(:SnomedConcept)
(:OMOPMeasurement)-[:STANDARD_CONCEPT]->(:LoincCode)
(:OMOPDrugExposure)-[:STANDARD_CONCEPT]->(:RxNormConcept)
```

---

## 7. Cross-Layer Integration Patterns

### 7.1 Full Patient Journey Query Pattern

Traverse from marketplace → metadata → clinical → research → ontology in a single query.

```cypher
MATCH (dp:DataProduct {productId: 'cardio-cohort-2024'})-[:DESCRIBED_BY]->(hd:HealthDataset)
MATCH (p:Patient)-[:FROM_DATASET]->(hd)
MATCH (p)-[:HAS_CONDITION]->(c:Condition)-[:CODED_BY]->(sc:SnomedConcept)
WHERE sc.conceptId = '38341003'  // Hypertensive disorder
MATCH (c)-[:MAPPED_TO]->(oco:OMOPConditionOccurrence)
RETURN p.resourceId, c.onsetDateTime, sc.preferredTerm, oco.conditionOccurrenceId
```

### 7.2 Contract Validation Pattern

Verify a data consumer has active contract before returning data.

```cypher
MATCH (consumer:Participant {participantId: $consumerId})
MATCH (provider:Participant)-[:OFFERS]->(dp:DataProduct {productId: $productId})
MATCH (contract:Contract)-[:GOVERNS]->(dp)
WHERE contract.consumerId = $consumerId
  AND contract.validUntil > datetime()
  AND contract.accessType IN ['QUERY', 'EXTRACT']
RETURN contract.contractId, contract.usagePurpose
```

### 7.3 Federated Cohort Discovery

Find patients across multiple datasets matching research criteria.

```cypher
MATCH (hd:HealthDataset)
WHERE hd.permittedPurpose CONTAINS 'SCIENTIFIC_RESEARCH'
MATCH (p:Patient)-[:FROM_DATASET]->(hd)
MATCH (p)-[:HAS_CONDITION]->(c:Condition)-[:CODED_BY]->(sc:SnomedConcept)
WHERE sc.conceptId IN ['73211009', '44054006']  // Type 2 diabetes
MATCH (p)-[:HAS_OBSERVATION]->(o:Observation)-[:CODED_BY]->(lc:LoincCode)
WHERE lc.loincNumber = '4548-4'  // HbA1c
  AND o.valueQuantity >= 6.5
WITH hd.datasetId AS datasetId, count(DISTINCT p) AS patientCount
RETURN datasetId, patientCount
```

---

## 8. Implementation Guide

### 8.1 Loading Order

1. **Layer 5: Ontologies** — SNOMED CT, LOINC, ICD-10, RxNorm (via neosemantics or batch CSV)
2. **Layer 1: Participants & Contracts** — Bootstrap dataspace marketplace structure
3. **Layer 2: HealthDCAT-AP** — Register datasets and distributions
4. **Layer 3: FHIR Data** — Load via CyFHIR plugin or custom ETL
5. **Layer 4: OMOP Transform** — Run FHIR → OMOP mapping logic (TermX FML or custom)
6. **Cross-Layer Links** — Create `MAPPED_TO`, `CODED_BY`, `FROM_DATASET` relationships

### 8.2 Tooling Recommendations

| Layer               | Tool                                 | Purpose                      |
| ------------------- | ------------------------------------ | ---------------------------- |
| Layer 5 Ontology    | **Neosemantics (n10s)**              | Import SNOMED CT / LOINC RDF |
| Layer 3 FHIR        | **CyFHIR**                           | Native FHIR Bundle → Neo4j   |
| Layer 4 OMOP        | **TermX + FML** or **Custom Cypher** | FHIR → OMOP transformation   |
| Layer 2 Metadata    | **rdflib-neo4j**                     | HealthDCAT-AP RDF → Neo4j    |
| Layer 1 Marketplace | **Custom API + Cypher**              | DSP catalog ingestion        |

### 8.3 Initial Cypher Scripts

**Create all constraints and indexes:**

```cypher
// Layer 1
CREATE CONSTRAINT participant_id IF NOT EXISTS FOR (p:Participant) REQUIRE p.participantId IS UNIQUE;
CREATE CONSTRAINT product_id IF NOT EXISTS FOR (dp:DataProduct) REQUIRE dp.productId IS UNIQUE;
CREATE CONSTRAINT contract_id IF NOT EXISTS FOR (c:Contract) REQUIRE c.contractId IS UNIQUE;

// Layer 2 (HealthDCAT-AP)
CREATE CONSTRAINT catalog_id IF NOT EXISTS FOR (cat:Catalog) REQUIRE cat.catalogId IS UNIQUE;
CREATE CONSTRAINT dataset_id IF NOT EXISTS FOR (hd:HealthDataset) REQUIRE hd.datasetId IS UNIQUE;
CREATE CONSTRAINT distribution_id IF NOT EXISTS FOR (d:Distribution) REQUIRE d.distributionId IS UNIQUE;
CREATE CONSTRAINT contact_point_id IF NOT EXISTS FOR (cp:ContactPoint) REQUIRE cp.contactId IS UNIQUE;
CREATE CONSTRAINT organization_id IF NOT EXISTS FOR (org:Organization) REQUIRE org.organizationId IS UNIQUE;

// Layer 3 FHIR
CREATE CONSTRAINT patient_id IF NOT EXISTS FOR (p:Patient) REQUIRE p.resourceId IS UNIQUE;
CREATE CONSTRAINT condition_id IF NOT EXISTS FOR (c:Condition) REQUIRE c.resourceId IS UNIQUE;
CREATE CONSTRAINT observation_id IF NOT EXISTS FOR (o:Observation) REQUIRE o.resourceId IS UNIQUE;
CREATE CONSTRAINT medication_request_id IF NOT EXISTS FOR (mr:MedicationRequest) REQUIRE mr.resourceId IS UNIQUE;
CREATE CONSTRAINT encounter_id IF NOT EXISTS FOR (e:Encounter) REQUIRE e.resourceId IS UNIQUE;
CREATE INDEX condition_code IF NOT EXISTS FOR (c:Condition) ON (c.code);
CREATE INDEX observation_code IF NOT EXISTS FOR (o:Observation) ON (o.code);

// Layer 4 OMOP
CREATE CONSTRAINT omop_person_id IF NOT EXISTS FOR (op:OMOPPerson) REQUIRE op.personId IS UNIQUE;
CREATE CONSTRAINT omop_condition_occurrence_id IF NOT EXISTS FOR (oco:OMOPConditionOccurrence) REQUIRE oco.conditionOccurrenceId IS UNIQUE;
CREATE CONSTRAINT omop_measurement_id IF NOT EXISTS FOR (om:OMOPMeasurement) REQUIRE om.measurementId IS UNIQUE;
CREATE INDEX omop_condition_concept IF NOT EXISTS FOR (oco:OMOPConditionOccurrence) ON (oco.conditionConceptId);
CREATE INDEX omop_measurement_concept IF NOT EXISTS FOR (om:OMOPMeasurement) ON (om.measurementConceptId);

// Layer 5 Ontology
CREATE CONSTRAINT snomed_concept_id IF NOT EXISTS FOR (sc:SnomedConcept) REQUIRE sc.conceptId IS UNIQUE;
CREATE CONSTRAINT loinc_code IF NOT EXISTS FOR (lc:LoincCode) REQUIRE lc.loincNumber IS UNIQUE;
CREATE CONSTRAINT icd10_code IF NOT EXISTS FOR (icd:ICD10Code) REQUIRE icd.code IS UNIQUE;
CREATE CONSTRAINT rxnorm_rxcui IF NOT EXISTS FOR (rx:RxNormConcept) REQUIRE rx.rxcui IS UNIQUE;
```

---

## 9. Query Patterns

### 9.1 Marketplace: Find Available Datasets for Research Purpose

```cypher
MATCH (dp:DataProduct)-[:DESCRIBED_BY]->(hd:HealthDataset)
WHERE 'SCIENTIFIC_RESEARCH' IN hd.permittedPurpose
  AND hd.healthSensitivity IN ['ANONYMOUS', 'PSEUDONYMIZED']
MATCH (provider:Participant)-[:OFFERS]->(dp)
RETURN dp.productId, dp.title, hd.temporalCoverage, provider.legalName
ORDER BY hd.issued DESC
```

### 9.2 Clinical: Patient Comorbidity Network

```cypher
MATCH (p:Patient {resourceId: 'patient-12345'})
MATCH (p)-[:HAS_CONDITION]->(c:Condition)
MATCH (c)-[:CODED_BY]->(sc:SnomedConcept)
MATCH (sc)-[:IS_A*1..3]->(parent:SnomedConcept)
RETURN p, c, sc, parent
```

### 9.3 Research: Cohort Inclusion Criteria (OMOP)

```cypher
// Find all persons with Type 2 Diabetes + HbA1c >= 7.0 in past year
MATCH (op:OMOPPerson)-[:HAS_CONDITION_OCCURRENCE]->(oco:OMOPConditionOccurrence)
WHERE oco.conditionConceptId = 201826  // Type 2 Diabetes OMOP Standard Concept
  AND oco.conditionStartDate >= date('2025-01-01')
MATCH (op)-[:HAS_MEASUREMENT]->(om:OMOPMeasurement)
WHERE om.measurementConceptId = 4184637  // HbA1c OMOP Standard Concept
  AND om.valueAsNumber >= 7.0
  AND om.measurementDate >= date('2025-01-01')
RETURN op.personId, oco.conditionStartDate, om.valueAsNumber, om.measurementDate
```

### 9.4 Federated: Cross-Dataset Patient Count by Diagnosis

```cypher
MATCH (hd:HealthDataset)<-[:FROM_DATASET]-(p:Patient)-[:HAS_CONDITION]->(c:Condition)
MATCH (c)-[:CODED_BY]->(sc:SnomedConcept)
WHERE sc.conceptId = '13645005'  // Chronic obstructive pulmonary disease
WITH hd.title AS dataset, count(DISTINCT p) AS patientCount
RETURN dataset, patientCount
ORDER BY patientCount DESC
```

### 9.5 Ontology: Find All Descendants of a SNOMED Concept

```cypher
MATCH (parent:SnomedConcept {conceptId: '64572001'})  // Disease (disorder)
MATCH (descendant:SnomedConcept)-[:IS_A*1..]->(parent)
RETURN descendant.conceptId, descendant.preferredTerm
LIMIT 100
```

### 9.6 EHDS Governance: Validate Full HDAB Approval Chain

Verify a data consumer has a valid, non-expired HDAB approval before executing a contract-governed query. This is the canonical pre-flight check for EHDS Articles 45–52 compliance.

```cypher
// Full approval chain: Consumer → Application → HDABApproval → Contract → DataProduct
MATCH (consumer:Participant {participantId: $consumerId})
MATCH (consumer)-[:SUBMITTED]->(app:AccessApplication {status: 'APPROVED'})
MATCH (app)-[:REQUESTS_ACCESS_TO]->(hd:HealthDataset {datasetId: $datasetId})
MATCH (approval:HDABApproval)-[:APPROVES]->(app)
WHERE approval.validUntil > datetime()
  AND approval.permittedPurpose = $requestedPurpose
MATCH (approval)-[:APPROVED]->(contract:Contract)-[:GOVERNS]->(dp:DataProduct)-[:DESCRIBED_BY]->(hd)
WHERE contract.validUntil > datetime()
RETURN
  consumer.legalName AS consumer,
  approval.approvalId AS hdabApproval,
  approval.permittedPurpose AS grantedPurpose,
  contract.contractId AS contract,
  dp.productId AS dataProduct
```

---

## 10. Validation Rules

### 10.1 Data Quality Constraints

**Enforce mandatory FHIR → OMOP mappings:**

```cypher
// Every FHIR Patient MUST have corresponding OMOPPerson
MATCH (p:Patient)
WHERE NOT EXISTS((p)-[:MAPPED_TO]->(:OMOPPerson))
RETURN p.resourceId AS unmappedPatient
```

**Verify all Conditions are coded:**

```cypher
MATCH (c:Condition)
WHERE NOT EXISTS((c)-[:CODED_BY]->(:SnomedConcept))
  AND NOT EXISTS((c)-[:CODED_BY]->(:ICD10Code))
RETURN c.resourceId AS uncodedCondition, c.code
```

### 10.2 Contract Compliance

**Identify data access without valid contract:**

```cypher
MATCH (consumer:Participant)-[:CONSUMES]->(dp:DataProduct)
WHERE NOT EXISTS((consumer)<-[:CONSUMER]-(contract:Contract)-[:GOVERNS]->(dp))
   OR NOT EXISTS {
     MATCH (contract:Contract)-[:CONSUMER]->(consumer)
     WHERE contract.validUntil > datetime()
   }
RETURN consumer.participantId, dp.productId
```

### 10.3 EHDS HDAB Compliance (Articles 45–52)

**Find contracts missing a valid HDAB approval — EHDS non-compliant access:**

```cypher
MATCH (contract:Contract)-[:GOVERNS]->(dp:DataProduct)
WHERE NOT EXISTS {
  MATCH (approval:HDABApproval)-[:APPROVED]->(contract)
  WHERE approval.validUntil > datetime()
}
RETURN contract.contractId AS nonCompliantContract,
       contract.consumerId AS consumer,
       dp.productId AS dataProduct
```

**Detect approved applications whose contracts have since expired:**

```cypher
MATCH (app:AccessApplication {status: 'APPROVED'})
MATCH (approval:HDABApproval)-[:APPROVES]->(app)
MATCH (approval)-[:APPROVED]->(contract:Contract)
WHERE contract.validUntil < datetime()
  AND approval.validUntil > datetime()
RETURN app.applicationId, contract.contractId,
       contract.validUntil AS contractExpired,
       approval.validUntil AS approvalStillValid
```

**List all active HDAB approvals for audit:**

```cypher
MATCH (hdab:Participant {participantType: 'HDAB'})-[:REVIEWED]->(app:AccessApplication)
MATCH (approval:HDABApproval)-[:APPROVES]->(app)
MATCH (consumer:Participant)-[:SUBMITTED]->(app)
WHERE approval.validUntil > datetime()
RETURN
  hdab.legalName AS hdab,
  consumer.legalName AS consumer,
  approval.approvalId AS approvalId,
  approval.permittedPurpose AS purpose,
  approval.validUntil AS expiresAt
ORDER BY approval.validUntil ASC
```

---

## 11. Migration from Existing Systems

### 11.1 From Relational EHR Database

1. Export FHIR Bundles via HAPI FHIR JPA Server or custom ETL
2. Load Bundles into Neo4j via CyFHIR
3. Run terminology mapping scripts to create `CODED_BY` relationships
4. Generate OMOP transform via TermX FML rules

### 11.2 From Existing OMOP CDM Database

1. Export OMOP tables as CSV (person, condition_occurrence, measurement, drug_exposure, visit_occurrence)
2. Load as `OMOPPerson`, `OMOPConditionOccurrence`, etc. nodes
3. Import OMOP vocabulary tables as ontology nodes
4. Create `STANDARD_CONCEPT` relationships
5. Optionally back-transform to FHIR using reverse FML rules

### 11.3 From FHIR Server (HAPI FHIR, Azure FHIR, etc.)

1. Query FHIR server via REST API for Patient, Condition, Observation, MedicationRequest, Encounter bundles
2. POST bundles to CyFHIR `/load` endpoint
3. Run post-load script to create `FROM_DATASET` provenance relationships
4. Trigger FHIR → OMOP transformation pipeline

---

## Conclusion

This schema provides a **production-ready, layered Neo4j data model** for health dataspaces that:

✅ Integrates **FHIR clinical exchange** and **OMOP research analytics**
✅ Supports **HealthDCAT-AP metadata discovery** across HDABs (formal W3C vocabulary)
✅ Enables **dataspace marketplace operations** with DSP contracts
✅ Preserves **bidirectional traceability** between all layers
✅ Leverages **SNOMED CT / LOINC / ICD-10 / RxNorm** as semantic backbone
✅ Follows **Neo4j best practices** for labels, relationships, and indexes
✅ Supports **JSON-LD serialization** for DSP Federated Catalog interoperability

**Next Steps:**

1. **Implement reference code** in [MinimumViableDataspace health demo](https://github.com/ma3u/MinimumViableDataspace/tree/health-demo)
2. **Publish as open-source schema** for EHDS ecosystem
3. **Validate with real clinical datasets** (Synthea, MIMIC-IV)
4. **Submit to HL7 FHIR-OMOP IG** as graph-based transformation reference

---

**Contact:**
Matthias Buchhorn-Roth
Solutions Architect, Sopra Steria
LinkedIn: [linkedin.com/in/ma3u](https://www.linkedin.com/in/ma3u)
GitHub: [github.com/ma3u](https://github.com/ma3u)

**License:** MIT
**Repository:** [github.com/ma3u/MinimumViableHealthDataspacev2](https://github.com/ma3u/MinimumViableHealthDataspacev2)

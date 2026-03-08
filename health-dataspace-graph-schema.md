# Neo4j Health Dataspace Graph Schema

## A Unified Data Model for Clinical Data Exchange, Research Analytics, and Marketplace Operations

**Version:** 1.0
**Author:** Matthias Buchhorn-Roth
**Date:** March 2026
**License:** Apache 2.0

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

### 2.2 Relationships

```cypher
(:Participant)-[:OFFERS]->(:DataProduct)
(:Participant)-[:CONSUMES]->(:DataProduct)
(:Contract)-[:GOVERNS]->(:DataProduct)
(:Contract)-[:PROVIDER {participantId}]->(:Participant)
(:Contract)-[:CONSUMER {participantId}]->(:Participant)
```

---

## 3. Layer 2: HealthDCAT-AP Metadata

### 3.1 Node Labels

#### `HealthDataset`

A dataset described using HealthDCAT-AP (W3C DCAT + health extensions).

**Properties:**

- `datasetId: String!` — URI identifier
- `title: String!`
- `description: String`
- `publisher: String` — Organization URI
- `issued: Date` — Publication date
- `modified: Date` — Last modification
- `temporalCoverage: String` — ISO 8601 period (e.g., `2020-01/2023-12`)
- `spatialCoverage: String` — Geographic coverage (ISO 3166)
- `language: String[]` — ISO 639-1 language codes
- `healthSensitivity: String` — HealthDCAT-AP sensitivity classification
- `permittedPurpose: String[]` — EHDS Article 53 purposes
- `legalBasis: String` — GDPR legal basis

**Indexes:**

```cypher
CREATE CONSTRAINT dataset_id IF NOT EXISTS FOR (hd:HealthDataset) REQUIRE hd.datasetId IS UNIQUE;
```

---

#### `Distribution`

A specific representation/format of a dataset (FHIR Bundle, OMOP export, etc.).

**Properties:**

- `distributionId: String!`
- `format: String!` — MIME type (e.g., `application/fhir+json`, `text/csv`)
- `accessUrl: String` — DSP access endpoint
- `byteSize: Long`
- `checksum: String` — SHA-256 hash
- `conformsTo: String` — Standard URI (e.g., `http://hl7.org/fhir/R4`)

---

### 3.2 Relationships

```cypher
(:DataProduct)-[:DESCRIBED_BY]->(:HealthDataset)
(:HealthDataset)-[:HAS_DISTRIBUTION]->(:Distribution)
(:HealthDataset)-[:PUBLISHED_BY]->(:Participant)
```

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
- `valueUnit: String`
- `valueCodeableConcept: String` — Coded result
- `effectiveDateTime: DateTime`
- `issued: DateTime`
- `interpretation: String[]` — (normal, abnormal, critical, high, low)

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

### 4.2 FHIR Relationships

```cypher
(:Patient)-[:HAS_CONDITION]->(:Condition)
(:Patient)-[:HAS_OBSERVATION]->(:Observation)
(:Patient)-[:HAS_MEDICATION_REQUEST]->(:MedicationRequest)
(:Patient)-[:HAS_ENCOUNTER]->(:Encounter)
(:Patient)-[:HAS_PROCEDURE]->(:Procedure)

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

- `conceptId: Long!` — SNOMED CT concept ID
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
WHERE sc.conceptId = 38341003  // Hypertensive disorder
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
WHERE sc.conceptId IN [73211009, 44054006]  // Type 2 diabetes
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

// Layer 2
CREATE CONSTRAINT dataset_id IF NOT EXISTS FOR (hd:HealthDataset) REQUIRE hd.datasetId IS UNIQUE;

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
WHERE sc.conceptId = 13645005  // Chronic obstructive pulmonary disease
WITH hd.title AS dataset, count(DISTINCT p) AS patientCount
RETURN dataset, patientCount
ORDER BY patientCount DESC
```

### 9.5 Ontology: Find All Descendants of a SNOMED Concept

```cypher
MATCH (parent:SnomedConcept {conceptId: 64572001})  // Disease (disorder)
MATCH (descendant:SnomedConcept)-[:IS_A*1..]->(parent)
RETURN descendant.conceptId, descendant.preferredTerm
LIMIT 100
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
✅ Supports **HealthDCAT-AP metadata discovery** across HDABs
✅ Enables **dataspace marketplace operations** with DSP contracts
✅ Preserves **bidirectional traceability** between all layers
✅ Leverages **SNOMED CT / LOINC / ICD-10 / RxNorm** as semantic backbone
✅ Follows **Neo4j best practices** for labels, relationships, and indexes

**Next Steps:**

1. **Implement reference code** in [MinimumViableDataspace health demo](https://github.com/ma3u/MinimumViableDataspace/tree/health-demo)
2. **Publish as open-source schema** for EHDS ecosystem
3. **Validate with real clinical datasets** (Synthea, MIMIC-IV)
4. **Submit to HL7 FHIR-OMOP IG** as graph-based transformation reference

---

**Contact:**
Matthias Buchhorn-Roth
Solutions Architect, Sopra Steria
LinkedIn: [linkedin.com/in/ma3u](https://linkedin.com/in/ma3u)
GitHub: [github.com/ma3u](https://github.com/ma3u)

**License:** Apache 2.0
**Repository:** [github.com/ma3u/MinimumViableDataspace](https://github.com/ma3u/MinimumViableDataspace)

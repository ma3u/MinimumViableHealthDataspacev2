// ==============================================================================
// Synthetic Data Insertion Script for Health Dataspace Graph
// Demonstrates a complex layer-crossing query scenario:
// Marketplace -> DCAT Metadata -> FHIR Clinical Data -> OMOP Analytics -> Ontology
//
// Run this after init-schema.cypher to populate the graph for visualization.
// ==============================================================================

// Ensure clean slate for demo (Optional: uncomment to wipe database first)
// MATCH (n) DETACH DELETE n;

// ==============================================================================
// LAYER 5: CLINICAL ONTOLOGY BACKBONE
// ==============================================================================
// SNOMED CT Concepts
MERGE (scDM:SnomedConcept {conceptId: 73211009})
  SET scDM.fsn = 'Diabetes mellitus type 2 (disorder)', scDM.preferredTerm = 'Type 2 diabetes', scDM.active = true
MERGE (scDisease:SnomedConcept {conceptId: 64572001})
  SET scDisease.fsn = 'Disease (disorder)', scDisease.preferredTerm = 'Disease', scDisease.active = true
MERGE (scDM)-[:IS_A]->(scDisease)

// ICD-10 Concepts
MERGE (icdDM:ICD10Code {code: 'E11.9'})
  SET icdDM.description = 'Type 2 diabetes mellitus without complications', icdDM.version = 'ICD-10-WHO'

// LOINC Concepts
MERGE (loincHbA1c:LoincCode {loincNumber: '4548-4'})
  SET loincHbA1c.longCommonName = 'Hemoglobin A1c/Hemoglobin.total in Blood', loincHbA1c.system = 'Bld'

// RxNorm Concepts
MERGE (rxMetformin:RxNormConcept {rxcui: '860975'})
  SET rxMetformin.name = 'Metformin hydrochloride 500 MG Oral Tablet', rxMetformin.tty = 'SCD'

// ==============================================================================
// LAYER 1: DATASPACE MARKETPLACE METADATA
// ==============================================================================
// Dataspace Participants
MERGE (clinic:Participant {participantId: 'did:web:charite.de:participant'})
  SET clinic.legalName = 'Charité Universitätsmedizin Berlin', clinic.participantType = 'CLINIC', clinic.jurisdiction = 'DE'

MERGE (cro:Participant {participantId: 'did:web:bayer.com:research'})
  SET cro.legalName = 'Bayer AG Clinical Research', cro.participantType = 'CRO', cro.jurisdiction = 'DE'

MERGE (hdab:Participant {participantId: 'did:web:bfarm.de:hdab'})
  SET hdab.legalName = 'BfArM Health Data Access Body', hdab.participantType = 'HDAB', hdab.jurisdiction = 'DE'

// Data Product available in Marketplace
MERGE (dp:DataProduct {productId: 'product-diab-cohort-2025'})
  SET dp.title = 'Type 2 Diabetes Synthetic Cohort (2020-2025)', dp.productType = 'SYNTHETIC', dp.sensitivity = 'PSEUDONYMIZED'
MERGE (clinic)-[:OFFERS]->(dp)

// Contract enforcing usage
MERGE (contract:Contract {contractId: 'contract-ehds-53-bayer-charite-001'})
  SET contract.agreementDate = datetime(), contract.validUntil = datetime() + duration({years: 1}), contract.usagePurpose = 'SCIENTIFIC_RESEARCH', contract.accessType = 'QUERY'
MERGE (contract)-[:GOVERNS]->(dp)
MERGE (contract)-[:PROVIDER {participantId: clinic.participantId}]->(clinic)
MERGE (contract)-[:CONSUMER {participantId: cro.participantId}]->(cro)
MERGE (cro)-[:CONSUMES]->(dp)

// ==============================================================================
// LAYER 2: HEALTHDCAT-AP METADATA
// ==============================================================================
// HealthDCAT Dataset Definition
MERGE (dataset:HealthDataset {datasetId: 'urn:uuid:charite:dataset:diab-001'})
  SET dataset.title = 'Synthetic Type 2 Diabetes Patient Journey', dataset.healthSensitivity = 'PSEUDONYMIZED', dataset.permittedPurpose = ['SCIENTIFIC_RESEARCH', 'ALGORITHM_TRAINING']
MERGE (dp)-[:DESCRIBED_BY]->(dataset)
MERGE (dataset)-[:PUBLISHED_BY]->(clinic)

// Distributions
MERGE (distFhir:Distribution {distributionId: 'urn:uuid:dist:fhir:001'})
  SET distFhir.format = 'application/fhir+json', distFhir.conformsTo = 'http://hl7.org/fhir/R4'
MERGE (distOmop:Distribution {distributionId: 'urn:uuid:dist:omop:001'})
  SET distOmop.format = 'application/parquet', distOmop.conformsTo = 'OMOP_CDM_v5.4'

MERGE (dataset)-[:HAS_DISTRIBUTION]->(distFhir)
MERGE (dataset)-[:HAS_DISTRIBUTION]->(distOmop)

// ==============================================================================
// LAYER 3: FHIR CLINICAL KNOWLEDGE GRAPH
// ==============================================================================
MERGE (patient:Patient {resourceId: 'fhir-pat-1001'})
  SET patient.gender = 'female', patient.birthDate = date('1965-04-12')
MERGE (patient)-[:FROM_DATASET]->(dataset)

MERGE (encounter:Encounter {resourceId: 'fhir-enc-2001'})
  SET encounter.class = 'ambulatory', encounter.status = 'finished'
MERGE (patient)-[:HAS_ENCOUNTER]->(encounter)

MERGE (condition:Condition {resourceId: 'fhir-cond-3001'})
  SET condition.clinicalStatus = 'active', condition.code = '73211009', condition.codeSystem = 'http://snomed.info/sct'
MERGE (patient)-[:HAS_CONDITION]->(condition)
MERGE (condition)-[:RECORDED_DURING]->(encounter)
MERGE (condition)-[:CODED_BY]->(scDM)
MERGE (condition)-[:CODED_BY]->(icdDM)
MERGE (condition)-[:FROM_DATASET]->(dataset)

MERGE (obs:Observation {resourceId: 'fhir-obs-4001'})
  SET obs.status = 'final', obs.code = '4548-4', obs.valueQuantity = 8.1, obs.valueUnit = '%'
MERGE (patient)-[:HAS_OBSERVATION]->(obs)
MERGE (obs)-[:PART_OF]->(encounter)
MERGE (obs)-[:CODED_BY]->(loincHbA1c)
MERGE (obs)-[:FROM_DATASET]->(dataset)

MERGE (medReq:MedicationRequest {resourceId: 'fhir-med-5001'})
  SET medReq.status = 'active', medReq.intent = 'order', medReq.medicationCode = '860975'
MERGE (patient)-[:HAS_MEDICATION_REQUEST]->(medReq)
MERGE (medReq)-[:CODED_BY]->(rxMetformin)

// ==============================================================================
// LAYER 4: OMOP RESEARCH ANALYTICS (and Mappings from Layer 3)
// ==============================================================================
MERGE (omopPerson:OMOPPerson {personId: 99001})
  SET omopPerson.yearOfBirth = 1965, omopPerson.genderConceptId = 8532
MERGE (patient)-[:MAPPED_TO {transformationRule: 'FHIR_PATIENT_TO_OMOP_PERSON'}]->(omopPerson)

MERGE (omopVisit:OMOPVisitOccurrence {visitOccurrenceId: 88001})
  SET omopVisit.personId = 99001, omopVisit.visitConceptId = 9202 // Outpatient
MERGE (omopPerson)-[:HAS_VISIT_OCCURRENCE]->(omopVisit)
MERGE (encounter)-[:MAPPED_TO]->(omopVisit)

MERGE (omopCond:OMOPConditionOccurrence {conditionOccurrenceId: 77001})
  SET omopCond.personId = 99001, omopCond.conditionConceptId = 201826 // OMOP internal concept for Type 2 DM
MERGE (omopPerson)-[:HAS_CONDITION_OCCURRENCE]->(omopCond)
MERGE (omopCond)-[:DURING_VISIT]->(omopVisit)
MERGE (omopCond)-[:STANDARD_CONCEPT]->(scDM)
MERGE (condition)-[:MAPPED_TO]->(omopCond)

MERGE (omopMeas:OMOPMeasurement {measurementId: 66001})
  SET omopMeas.personId = 99001, omopMeas.measurementConceptId = 4184637, omopMeas.valueAsNumber = 8.1
MERGE (omopPerson)-[:HAS_MEASUREMENT]->(omopMeas)
MERGE (omopMeas)-[:DURING_VISIT]->(omopVisit)
MERGE (omopMeas)-[:STANDARD_CONCEPT]->(loincHbA1c)
MERGE (obs)-[:MAPPED_TO {observationType: 'Laboratory'}]->(omopMeas)

MERGE (omopDrug:OMOPDrugExposure {drugExposureId: 55001})
  SET omopDrug.personId = 99001, omopDrug.drugConceptId = 1503297 // Metformin ingredient concept
MERGE (omopPerson)-[:HAS_DRUG_EXPOSURE]->(omopDrug)
MERGE (omopDrug)-[:DURING_VISIT]->(omopVisit)
MERGE (omopDrug)-[:STANDARD_CONCEPT]->(rxMetformin)
MERGE (medReq)-[:MAPPED_TO]->(omopDrug)

// ==============================================================================
// End of synthetic data insertion
// You can now run: CALL db.schema.visualization()
// To see the fully populated cross-layer graph model.
// ==============================================================================

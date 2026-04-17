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
  SET scDM.name = 'Type 2 Diabetes (SNOMED)',
      scDM.fsn = 'Diabetes mellitus type 2 (disorder)',
      scDM.preferredTerm = 'Type 2 diabetes',
      scDM.active = true
MERGE (scDisease:SnomedConcept {conceptId: 64572001})
  SET scDisease.name = 'Disease (SNOMED)',
      scDisease.fsn = 'Disease (disorder)',
      scDisease.preferredTerm = 'Disease',
      scDisease.active = true
MERGE (scDM)-[:IS_A]->(scDisease)

// ICD-10 Concepts
MERGE (icdDM:ICD10Code {code: 'E11.9'})
  SET icdDM.name = 'E11.9 T2DM (ICD-10)',
      icdDM.description = 'Type 2 diabetes mellitus without complications',
      icdDM.version = 'ICD-10-WHO'

// LOINC Concepts
MERGE (loincHbA1c:LoincCode {loincNumber: '4548-4'})
  SET loincHbA1c.name = 'HbA1c (LOINC 4548-4)',
      loincHbA1c.longCommonName = 'Hemoglobin A1c/Hemoglobin.total in Blood',
      loincHbA1c.system = 'Bld'

// RxNorm Concepts
MERGE (rxMetformin:RxNormConcept {rxcui: '860975'})
  SET rxMetformin.name = 'Metformin 500mg (RxNorm)',
      rxMetformin.tty = 'SCD'

// ==============================================================================
// LAYER 1: DATASPACE MARKETPLACE METADATA
// ==============================================================================
// Dataspace Participants
MERGE (clinic:Participant {participantId: 'did:web:riverside.example:participant'})
  SET clinic.name = 'Riverside General (CLINIC)',
      clinic.legalName = 'Riverside General Hospital',
      clinic.participantType = 'CLINIC',
      clinic.jurisdiction = 'DE'

MERGE (cro:Participant {participantId: 'did:web:trialcorp.example:research'})
  SET cro.name = 'TrialCorp Research (CRO)',
      cro.legalName = 'TrialCorp AG Clinical Research',
      cro.participantType = 'CRO',
      cro.jurisdiction = 'DE'

MERGE (hdab:Participant {participantId: 'did:web:healthgov.example:hdab'})
  SET hdab.name = 'HealthGov (HDAB)',
      hdab.legalName = 'HealthGov Data Access Authority',
      hdab.participantType = 'HDAB',
      hdab.jurisdiction = 'DE'

// Data Product available in Marketplace
MERGE (dp:DataProduct {productId: 'product-diab-cohort-2025'})
  SET dp.name = 'T2D Cohort 2020-2025',
      dp.title = 'Type 2 Diabetes Synthetic Cohort (2020-2025)',
      dp.productType = 'SYNTHETIC',
      dp.sensitivity = 'PSEUDONYMIZED'
MERGE (clinic)-[:OFFERS]->(dp)

// Contract enforcing usage
MERGE (contract:Contract {contractId: 'contract-ehds-53-trialcorp-riverside-001'})
  SET contract.name = 'EHDS Contract (TrialCorp↔Riverside)',
      contract.agreementDate = datetime(),
      contract.validUntil = datetime() + duration({years: 1}),
      contract.usagePurpose = 'SCIENTIFIC_RESEARCH',
      contract.accessType = 'QUERY'
MERGE (contract)-[:GOVERNS]->(dp)
MERGE (contract)-[:PROVIDER {participantId: clinic.participantId}]->(clinic)
MERGE (contract)-[:CONSUMER {participantId: cro.participantId}]->(cro)
MERGE (cro)-[:CONSUMES]->(dp)

// EHDS Governance: HDAB Access Application and Approval Chain (Articles 45-52)
// Step 1: CRO submits an access application to HealthGov HDAB
MERGE (app:AccessApplication {applicationId: 'app-healthgov-2025-001'})
  SET app.name = 'Access App healthgov-2025-001',
      app.applicantId = cro.participantId,
      app.datasetId = 'urn:uuid:riverside:dataset:diab-001',
      app.requestedPurpose = 'SCIENTIFIC_RESEARCH',
      app.submittedAt = datetime('2025-01-10T09:00:00'),
      app.status = 'APPROVED',
      app.justification = 'Phase II clinical trial for novel antidiabetic compound. Requires historical HbA1c and comorbidity data for study arm stratification.',
      app.ethicsCommitteeRef = 'EC-HealthGov-2024-1138',
      app.dataMinimisationStatement = 'Only pseudonymized cohort-level data required; no individual re-identification attempted.'
MERGE (cro)-[:SUBMITTED]->(app)
MERGE (app)-[:REQUESTS_ACCESS_TO]->(dp)
MERGE (hdab)-[:REVIEWED]->(app)

// Step 2: HealthGov HDAB issues formal approval decision
MERGE (approval:HDABApproval {approvalId: 'hdab-decision-healthgov-2025-001'})
  SET approval.name = 'HDAB Approval healthgov-2025-001',
      approval.applicationId = app.applicationId,
      approval.approvedAt = datetime('2025-02-03T14:30:00'),
      approval.validUntil = datetime('2026-02-03T23:59:59'),
      approval.permittedPurpose = 'SCIENTIFIC_RESEARCH',
      approval.conditions = ['No re-identification', 'Results must be aggregated before export', 'Quarterly usage reports to HealthGov'],
      approval.hdabOfficer = 'Dr. Anna Müller (HealthGov Data Access Board)',
      approval.legalBasisArticle = 'EHDS_Art_46'
MERGE (approval)-[:APPROVES]->(app)
MERGE (approval)-[:APPROVED {permittedPurpose: 'SCIENTIFIC_RESEARCH'}]->(contract)

// ==============================================================================
// LAYER 2: HEALTHDCAT-AP METADATA
// ==============================================================================
// HealthDCAT Dataset Definition
MERGE (dataset:HealthDataset {datasetId: 'urn:uuid:riverside:dataset:diab-001'})
  SET dataset.name = 'T2D Patient Journey Dataset',
      dataset.title = 'Synthetic Type 2 Diabetes Patient Journey',
      dataset.healthSensitivity = 'PSEUDONYMIZED',
      dataset.permittedPurpose = ['SCIENTIFIC_RESEARCH', 'ALGORITHM_TRAINING']
MERGE (dp)-[:DESCRIBED_BY]->(dataset)
MERGE (dataset)-[:PUBLISHED_BY]->(clinic)

// Distributions
MERGE (distFhir:Distribution {distributionId: 'urn:uuid:dist:fhir:001'})
  SET distFhir.name = 'FHIR R4 Distribution',
      distFhir.format = 'application/fhir+json',
      distFhir.conformsTo = 'http://hl7.org/fhir/R4'
MERGE (distOmop:Distribution {distributionId: 'urn:uuid:dist:omop:001'})
  SET distOmop.name = 'OMOP CDM Distribution',
      distOmop.format = 'application/parquet',
      distOmop.conformsTo = 'OMOP_CDM_v5.4'

MERGE (dataset)-[:HAS_DISTRIBUTION]->(distFhir)
MERGE (dataset)-[:HAS_DISTRIBUTION]->(distOmop)

// ==============================================================================
// LAYER 3: FHIR CLINICAL KNOWLEDGE GRAPH
// ==============================================================================
MERGE (patient:Patient {resourceId: 'fhir-pat-1001'})
  SET patient.name = 'Patient fhir-pat-1001',
      patient.gender = 'female',
      patient.birthDate = date('1965-04-12')
MERGE (patient)-[:FROM_DATASET]->(dataset)

MERGE (encounter:Encounter {resourceId: 'fhir-enc-2001'})
  SET encounter.name = 'Ambulatory Encounter',
      encounter.class = 'ambulatory',
      encounter.status = 'finished',
      encounter.date = '2023-06-15T09:30:00Z',
      encounter.display = 'Initial diabetes screening'
MERGE (patient)-[:HAS_ENCOUNTER]->(encounter)

MERGE (condition:Condition {resourceId: 'fhir-cond-3001'})
  SET condition.name = 'Type 2 Diabetes (FHIR)',
      condition.clinicalStatus = 'active',
      condition.code = '73211009',
      condition.codeSystem = 'http://snomed.info/sct',
      condition.onsetDate = '2023-06-15T10:00:00Z',
      condition.display = 'Type 2 diabetes mellitus'
MERGE (patient)-[:HAS_CONDITION]->(condition)
MERGE (condition)-[:RECORDED_DURING]->(encounter)
MERGE (condition)-[:CODED_BY]->(scDM)
MERGE (condition)-[:CODED_BY]->(icdDM)
MERGE (condition)-[:FROM_DATASET]->(dataset)

MERGE (obs:Observation {resourceId: 'fhir-obs-4001'})
  SET obs.name = 'HbA1c 8.1% (FHIR)',
      obs.status = 'final',
      obs.code = '4548-4',
      obs.valueQuantity = 8.1,
      obs.valueUnit = '%',
      obs.dateTime = '2023-06-15T10:15:00Z',
      obs.display = 'HbA1c 8.1%'
MERGE (patient)-[:HAS_OBSERVATION]->(obs)
MERGE (obs)-[:PART_OF]->(encounter)
MERGE (obs)-[:CODED_BY]->(loincHbA1c)
MERGE (obs)-[:FROM_DATASET]->(dataset)

MERGE (medReq:MedicationRequest {resourceId: 'fhir-med-5001'})
  SET medReq.name = 'Metformin 500mg (FHIR)',
      medReq.status = 'active',
      medReq.intent = 'order',
      medReq.medicationCode = '860975',
      medReq.date = '2023-07-10T14:20:00Z',
      medReq.display = 'Metformin 500mg'
MERGE (patient)-[:HAS_MEDICATION_REQUEST]->(medReq)
MERGE (medReq)-[:CODED_BY]->(rxMetformin)

// ==============================================================================
// LAYER 4: OMOP RESEARCH ANALYTICS (and Mappings from Layer 3)
// ==============================================================================
MERGE (omopPerson:OMOPPerson {personId: 99001})
  SET omopPerson.name = 'OMOP Person 99001',
      omopPerson.yearOfBirth = 1965,
      omopPerson.genderConceptId = 8532
MERGE (patient)-[:MAPPED_TO {transformationRule: 'FHIR_PATIENT_TO_OMOP_PERSON'}]->(omopPerson)

MERGE (omopVisit:OMOPVisitOccurrence {visitOccurrenceId: 88001})
  SET omopVisit.name = 'Outpatient Visit (OMOP)',
      omopVisit.personId = 99001,
      omopVisit.visitConceptId = 9202 // Outpatient
MERGE (omopPerson)-[:HAS_VISIT_OCCURRENCE]->(omopVisit)
MERGE (encounter)-[:MAPPED_TO]->(omopVisit)

MERGE (omopCond:OMOPConditionOccurrence {conditionOccurrenceId: 77001})
  SET omopCond.name = 'T2D Occurrence (OMOP)',
      omopCond.personId = 99001,
      omopCond.conditionConceptId = 201826 // OMOP internal concept for Type 2 DM
MERGE (omopPerson)-[:HAS_CONDITION_OCCURRENCE]->(omopCond)
MERGE (omopCond)-[:DURING_VISIT]->(omopVisit)
MERGE (omopCond)-[:STANDARD_CONCEPT]->(scDM)
MERGE (condition)-[:MAPPED_TO]->(omopCond)

MERGE (omopMeas:OMOPMeasurement {measurementId: 66001})
  SET omopMeas.name = 'HbA1c Measurement (OMOP)',
      omopMeas.personId = 99001,
      omopMeas.measurementConceptId = 4184637,
      omopMeas.valueAsNumber = 8.1
MERGE (omopPerson)-[:HAS_MEASUREMENT]->(omopMeas)
MERGE (omopMeas)-[:DURING_VISIT]->(omopVisit)
MERGE (omopMeas)-[:STANDARD_CONCEPT]->(loincHbA1c)
MERGE (obs)-[:MAPPED_TO {observationType: 'Laboratory'}]->(omopMeas)

MERGE (omopDrug:OMOPDrugExposure {drugExposureId: 55001})
  SET omopDrug.name = 'Metformin Exposure (OMOP)',
      omopDrug.personId = 99001,
      omopDrug.drugConceptId = 1503297 // Metformin ingredient concept
MERGE (omopPerson)-[:HAS_DRUG_EXPOSURE]->(omopDrug)
MERGE (omopDrug)-[:DURING_VISIT]->(omopVisit)
MERGE (omopDrug)-[:STANDARD_CONCEPT]->(rxMetformin)
MERGE (medReq)-[:MAPPED_TO]->(omopDrug)

// ==============================================================================
// End of original synthetic data insertion
// ==============================================================================
;
// ==============================================================================
// ADDITIONAL SYNTHETIC PATIENTS (7 more for a richer graph visualization)
// Each patient has: Encounter → Condition + Observation + MedicationRequest
//                   → OMOP mappings → Ontology codes
// ==============================================================================

// ── Re-bind existing ontology nodes from first statement ──
MERGE (scDisease:SnomedConcept {conceptId: 64572001})
MERGE (scDM:SnomedConcept {conceptId: 73211009})
MERGE (icdDM:ICD10Code {code: 'E11.9'})
MERGE (loincHbA1c:LoincCode {loincNumber: '4548-4'})
MERGE (rxMetformin:RxNormConcept {rxcui: '860975'})
MERGE (ds:HealthDataset {datasetId: 'urn:uuid:riverside:dataset:diab-001'})

// ── Additional Ontology Backbone ──
MERGE (scHTN:SnomedConcept {conceptId: 38341003})
  SET scHTN.name = 'Hypertension (SNOMED)',
      scHTN.fsn = 'Hypertensive disorder (disorder)',
      scHTN.active = true
MERGE (scHTN)-[:IS_A]->(scDisease)

MERGE (scAsthma:SnomedConcept {conceptId: 195967001})
  SET scAsthma.name = 'Asthma (SNOMED)',
      scAsthma.fsn = 'Asthma (disorder)',
      scAsthma.active = true
MERGE (scAsthma)-[:IS_A]->(scDisease)

MERGE (scCKD:SnomedConcept {conceptId: 709044004})
  SET scCKD.name = 'CKD Stage 3 (SNOMED)',
      scCKD.fsn = 'Chronic kidney disease stage 3 (disorder)',
      scCKD.active = true
MERGE (scCKD)-[:IS_A]->(scDisease)

MERGE (icdHTN:ICD10Code {code: 'I10'})
  SET icdHTN.name = 'I10 Hypertension (ICD-10)',
      icdHTN.description = 'Essential (primary) hypertension'

MERGE (icdAsthma:ICD10Code {code: 'J45.9'})
  SET icdAsthma.name = 'J45.9 Asthma (ICD-10)',
      icdAsthma.description = 'Asthma, unspecified'

MERGE (loincBP:LoincCode {loincNumber: '55284-4'})
  SET loincBP.name = 'Blood Pressure (LOINC)',
      loincBP.longCommonName = 'Blood pressure systolic and diastolic'

MERGE (loincFEV1:LoincCode {loincNumber: '20150-9'})
  SET loincFEV1.name = 'FEV1 (LOINC)',
      loincFEV1.longCommonName = 'FEV1'

MERGE (loincCreat:LoincCode {loincNumber: '2160-0'})
  SET loincCreat.name = 'Creatinine (LOINC)',
      loincCreat.longCommonName = 'Creatinine [Mass/volume] in Serum or Plasma'

MERGE (rxLisinopril:RxNormConcept {rxcui: '104377'})
  SET rxLisinopril.name = 'Lisinopril 10mg (RxNorm)', rxLisinopril.tty = 'SCD'

MERGE (rxAlbuterol:RxNormConcept {rxcui: '245314'})
  SET rxAlbuterol.name = 'Albuterol Inhaler (RxNorm)', rxAlbuterol.tty = 'SCD'

// ── Patient 2: Hypertension ──
MERGE (p2:Patient {resourceId: 'fhir-pat-1002'})
  SET p2.name = 'Patient fhir-pat-1002', p2.gender = 'male', p2.birthDate = date('1958-11-03')
MERGE (p2)-[:FROM_DATASET]->(ds)
MERGE (enc2:Encounter {resourceId: 'fhir-enc-2002'})
  SET enc2.name = 'Cardiology Visit', enc2.class = 'ambulatory', enc2.status = 'finished',
      enc2.date = '2023-09-12T11:00:00Z', enc2.display = 'Cardiology consultation'
MERGE (p2)-[:HAS_ENCOUNTER]->(enc2)
MERGE (cond2:Condition {resourceId: 'fhir-cond-3002'})
  SET cond2.name = 'Essential Hypertension (FHIR)', cond2.clinicalStatus = 'active', cond2.code = '38341003',
      cond2.onsetDate = '2023-09-12T11:30:00Z', cond2.display = 'Essential hypertension'
MERGE (p2)-[:HAS_CONDITION]->(cond2)
MERGE (cond2)-[:RECORDED_DURING]->(enc2)
MERGE (cond2)-[:CODED_BY]->(scHTN)
MERGE (cond2)-[:CODED_BY]->(icdHTN)
MERGE (obs2:Observation {resourceId: 'fhir-obs-4002'})
  SET obs2.name = 'BP 145/92 (FHIR)', obs2.status = 'final', obs2.code = '55284-4', obs2.valueQuantity = 145, obs2.valueUnit = 'mmHg',
      obs2.dateTime = '2023-09-12T11:45:00Z', obs2.display = 'Blood pressure 145/92 mmHg'
MERGE (p2)-[:HAS_OBSERVATION]->(obs2)
MERGE (obs2)-[:PART_OF]->(enc2)
MERGE (obs2)-[:CODED_BY]->(loincBP)
MERGE (med2:MedicationRequest {resourceId: 'fhir-med-5002'})
  SET med2.name = 'Lisinopril 10mg (FHIR)', med2.status = 'active', med2.intent = 'order',
      med2.date = '2023-10-01T09:00:00Z', med2.display = 'Lisinopril 10mg'
MERGE (p2)-[:HAS_MEDICATION_REQUEST]->(med2)
MERGE (med2)-[:CODED_BY]->(rxLisinopril)
// OMOP mappings
MERGE (op2:OMOPPerson {personId: 99002})
  SET op2.name = 'OMOP Person 99002', op2.yearOfBirth = 1958
MERGE (p2)-[:MAPPED_TO]->(op2)
MERGE (ov2:OMOPVisitOccurrence {visitOccurrenceId: 88002})
  SET ov2.name = 'Outpatient Visit (OMOP)', ov2.visitConceptId = 9202
MERGE (op2)-[:HAS_VISIT_OCCURRENCE]->(ov2)
MERGE (enc2)-[:MAPPED_TO]->(ov2)
MERGE (oc2:OMOPConditionOccurrence {conditionOccurrenceId: 77002})
  SET oc2.name = 'Hypertension (OMOP)', oc2.conditionConceptId = 320128
MERGE (op2)-[:HAS_CONDITION_OCCURRENCE]->(oc2)
MERGE (oc2)-[:STANDARD_CONCEPT]->(scHTN)
MERGE (cond2)-[:MAPPED_TO]->(oc2)
MERGE (om2:OMOPMeasurement {measurementId: 66002})
  SET om2.name = 'BP Measurement (OMOP)', om2.valueAsNumber = 145
MERGE (op2)-[:HAS_MEASUREMENT]->(om2)
MERGE (obs2)-[:MAPPED_TO]->(om2)

// ── Patient 3: Asthma ──
MERGE (p3:Patient {resourceId: 'fhir-pat-1003'})
  SET p3.name = 'Patient fhir-pat-1003', p3.gender = 'female', p3.birthDate = date('1990-07-22')
MERGE (p3)-[:FROM_DATASET]->(ds)
MERGE (enc3:Encounter {resourceId: 'fhir-enc-2003'})
  SET enc3.name = 'Pulmonology Visit', enc3.class = 'ambulatory', enc3.status = 'finished',
      enc3.date = '2024-02-05T14:00:00Z', enc3.display = 'Pulmonology consultation'
MERGE (p3)-[:HAS_ENCOUNTER]->(enc3)
MERGE (cond3:Condition {resourceId: 'fhir-cond-3003'})
  SET cond3.name = 'Asthma (FHIR)', cond3.clinicalStatus = 'active', cond3.code = '195967001',
      cond3.onsetDate = '2024-02-05T14:30:00Z', cond3.display = 'Asthma'
MERGE (p3)-[:HAS_CONDITION]->(cond3)
MERGE (cond3)-[:CODED_BY]->(scAsthma)
MERGE (cond3)-[:CODED_BY]->(icdAsthma)
MERGE (obs3:Observation {resourceId: 'fhir-obs-4003'})
  SET obs3.name = 'FEV1 72% (FHIR)', obs3.status = 'final', obs3.code = '20150-9', obs3.valueQuantity = 72, obs3.valueUnit = '%',
      obs3.dateTime = '2024-02-05T14:45:00Z', obs3.display = 'FEV1 72%'
MERGE (p3)-[:HAS_OBSERVATION]->(obs3)
MERGE (obs3)-[:CODED_BY]->(loincFEV1)
MERGE (med3:MedicationRequest {resourceId: 'fhir-med-5003'})
  SET med3.name = 'Albuterol Inhaler (FHIR)', med3.status = 'active', med3.intent = 'order',
      med3.date = '2024-02-20T10:00:00Z', med3.display = 'Albuterol inhaler'
MERGE (p3)-[:HAS_MEDICATION_REQUEST]->(med3)
MERGE (med3)-[:CODED_BY]->(rxAlbuterol)
MERGE (op3:OMOPPerson {personId: 99003})
  SET op3.name = 'OMOP Person 99003', op3.yearOfBirth = 1990
MERGE (p3)-[:MAPPED_TO]->(op3)
MERGE (ov3:OMOPVisitOccurrence {visitOccurrenceId: 88003})
  SET ov3.name = 'Outpatient Visit (OMOP)', ov3.visitConceptId = 9202
MERGE (op3)-[:HAS_VISIT_OCCURRENCE]->(ov3)
MERGE (enc3)-[:MAPPED_TO]->(ov3)
MERGE (oc3:OMOPConditionOccurrence {conditionOccurrenceId: 77003})
  SET oc3.name = 'Asthma (OMOP)', oc3.conditionConceptId = 317009
MERGE (op3)-[:HAS_CONDITION_OCCURRENCE]->(oc3)
MERGE (oc3)-[:STANDARD_CONCEPT]->(scAsthma)
MERGE (cond3)-[:MAPPED_TO]->(oc3)
MERGE (om3:OMOPMeasurement {measurementId: 66003})
  SET om3.name = 'FEV1 Measurement (OMOP)', om3.valueAsNumber = 72
MERGE (op3)-[:HAS_MEASUREMENT]->(om3)
MERGE (obs3)-[:MAPPED_TO]->(om3)

// ── Patient 4: T2D + Hypertension comorbidity ──
MERGE (p4:Patient {resourceId: 'fhir-pat-1004'})
  SET p4.name = 'Patient fhir-pat-1004', p4.gender = 'male', p4.birthDate = date('1972-01-15')
MERGE (p4)-[:FROM_DATASET]->(ds)
MERGE (enc4:Encounter {resourceId: 'fhir-enc-2004'})
  SET enc4.name = 'Annual Check-up', enc4.class = 'ambulatory', enc4.status = 'finished',
      enc4.date = '2024-04-18T08:30:00Z', enc4.display = 'Annual check-up'
MERGE (p4)-[:HAS_ENCOUNTER]->(enc4)
MERGE (cond4a:Condition {resourceId: 'fhir-cond-3004a'})
  SET cond4a.name = 'Type 2 Diabetes (FHIR)', cond4a.clinicalStatus = 'active', cond4a.code = '73211009',
      cond4a.onsetDate = '2023-11-22T09:15:00Z', cond4a.display = 'Type 2 diabetes mellitus'
MERGE (p4)-[:HAS_CONDITION]->(cond4a)
MERGE (cond4a)-[:CODED_BY]->(scDM)
MERGE (cond4b:Condition {resourceId: 'fhir-cond-3004b'})
  SET cond4b.name = 'Essential Hypertension (FHIR)', cond4b.clinicalStatus = 'active', cond4b.code = '38341003',
      cond4b.onsetDate = '2024-01-10T10:00:00Z', cond4b.display = 'Essential hypertension'
MERGE (p4)-[:HAS_CONDITION]->(cond4b)
MERGE (cond4b)-[:CODED_BY]->(scHTN)
MERGE (obs4:Observation {resourceId: 'fhir-obs-4004'})
  SET obs4.name = 'HbA1c 7.2% (FHIR)', obs4.status = 'final', obs4.code = '4548-4', obs4.valueQuantity = 7.2, obs4.valueUnit = '%',
      obs4.dateTime = '2024-04-18T09:00:00Z', obs4.display = 'HbA1c 7.2%'
MERGE (p4)-[:HAS_OBSERVATION]->(obs4)
MERGE (obs4)-[:CODED_BY]->(loincHbA1c)
MERGE (op4:OMOPPerson {personId: 99004})
  SET op4.name = 'OMOP Person 99004', op4.yearOfBirth = 1972
MERGE (p4)-[:MAPPED_TO]->(op4)
MERGE (ov4:OMOPVisitOccurrence {visitOccurrenceId: 88004})
  SET ov4.name = 'Annual Check-up (OMOP)', ov4.visitConceptId = 9202
MERGE (op4)-[:HAS_VISIT_OCCURRENCE]->(ov4)
MERGE (enc4)-[:MAPPED_TO]->(ov4)
MERGE (oc4a:OMOPConditionOccurrence {conditionOccurrenceId: 77004})
  SET oc4a.name = 'T2D (OMOP)', oc4a.conditionConceptId = 201826
MERGE (op4)-[:HAS_CONDITION_OCCURRENCE]->(oc4a)
MERGE (oc4a)-[:STANDARD_CONCEPT]->(scDM)
MERGE (cond4a)-[:MAPPED_TO]->(oc4a)
MERGE (oc4b:OMOPConditionOccurrence {conditionOccurrenceId: 77104})
  SET oc4b.name = 'Hypertension (OMOP)', oc4b.conditionConceptId = 320128
MERGE (op4)-[:HAS_CONDITION_OCCURRENCE]->(oc4b)
MERGE (oc4b)-[:STANDARD_CONCEPT]->(scHTN)
MERGE (cond4b)-[:MAPPED_TO]->(oc4b)
MERGE (om4:OMOPMeasurement {measurementId: 66004})
  SET om4.name = 'HbA1c Measurement (OMOP)', om4.valueAsNumber = 7.2
MERGE (op4)-[:HAS_MEASUREMENT]->(om4)
MERGE (obs4)-[:MAPPED_TO]->(om4)

// ── Patient 5: CKD Stage 3 ──
MERGE (p5:Patient {resourceId: 'fhir-pat-1005'})
  SET p5.name = 'Patient fhir-pat-1005', p5.gender = 'female', p5.birthDate = date('1950-09-30')
MERGE (p5)-[:FROM_DATASET]->(ds)
MERGE (enc5:Encounter {resourceId: 'fhir-enc-2005'})
  SET enc5.name = 'Nephrology Consult', enc5.class = 'ambulatory', enc5.status = 'finished',
      enc5.date = '2024-05-10T13:15:00Z', enc5.display = 'Nephrology consultation'
MERGE (p5)-[:HAS_ENCOUNTER]->(enc5)
MERGE (cond5:Condition {resourceId: 'fhir-cond-3005'})
  SET cond5.name = 'CKD Stage 3 (FHIR)', cond5.clinicalStatus = 'active', cond5.code = '709044004',
      cond5.onsetDate = '2023-12-05T10:30:00Z', cond5.display = 'Chronic kidney disease stage 3'
MERGE (p5)-[:HAS_CONDITION]->(cond5)
MERGE (cond5)-[:CODED_BY]->(scCKD)
MERGE (obs5:Observation {resourceId: 'fhir-obs-4005'})
  SET obs5.name = 'Creatinine 1.8 (FHIR)', obs5.status = 'final', obs5.code = '2160-0', obs5.valueQuantity = 1.8, obs5.valueUnit = 'mg/dL',
      obs5.dateTime = '2024-05-10T14:00:00Z', obs5.display = 'Serum creatinine 1.8 mg/dL'
MERGE (p5)-[:HAS_OBSERVATION]->(obs5)
MERGE (obs5)-[:CODED_BY]->(loincCreat)
MERGE (op5:OMOPPerson {personId: 99005})
  SET op5.name = 'OMOP Person 99005', op5.yearOfBirth = 1950
MERGE (p5)-[:MAPPED_TO]->(op5)
MERGE (ov5:OMOPVisitOccurrence {visitOccurrenceId: 88005})
  SET ov5.name = 'Outpatient Visit (OMOP)', ov5.visitConceptId = 9202
MERGE (op5)-[:HAS_VISIT_OCCURRENCE]->(ov5)
MERGE (enc5)-[:MAPPED_TO]->(ov5)
MERGE (oc5:OMOPConditionOccurrence {conditionOccurrenceId: 77005})
  SET oc5.name = 'CKD Stage 3 (OMOP)', oc5.conditionConceptId = 443611
MERGE (op5)-[:HAS_CONDITION_OCCURRENCE]->(oc5)
MERGE (oc5)-[:STANDARD_CONCEPT]->(scCKD)
MERGE (cond5)-[:MAPPED_TO]->(oc5)
MERGE (om5:OMOPMeasurement {measurementId: 66005})
  SET om5.name = 'Creatinine Measurement (OMOP)', om5.valueAsNumber = 1.8
MERGE (op5)-[:HAS_MEASUREMENT]->(om5)
MERGE (obs5)-[:MAPPED_TO]->(om5)

// ── Patient 6: T2D (second clinic) ──
MERGE (p6:Patient {resourceId: 'fhir-pat-1006'})
  SET p6.name = 'Patient fhir-pat-1006', p6.gender = 'male', p6.birthDate = date('1980-03-18')
MERGE (p6)-[:FROM_DATASET]->(ds)
MERGE (enc6:Encounter {resourceId: 'fhir-enc-2006'})
  SET enc6.name = 'Diabetology Follow-up', enc6.class = 'ambulatory', enc6.status = 'finished',
      enc6.date = '2024-08-22T15:00:00Z', enc6.display = 'Diabetology follow-up'
MERGE (p6)-[:HAS_ENCOUNTER]->(enc6)
MERGE (cond6:Condition {resourceId: 'fhir-cond-3006'})
  SET cond6.name = 'Type 2 Diabetes (FHIR)', cond6.clinicalStatus = 'active', cond6.code = '73211009',
      cond6.onsetDate = '2022-03-14T11:00:00Z', cond6.display = 'Type 2 diabetes mellitus'
MERGE (p6)-[:HAS_CONDITION]->(cond6)
MERGE (cond6)-[:CODED_BY]->(scDM)
MERGE (cond6)-[:CODED_BY]->(icdDM)
MERGE (obs6:Observation {resourceId: 'fhir-obs-4006'})
  SET obs6.name = 'HbA1c 9.3% (FHIR)', obs6.status = 'final', obs6.code = '4548-4', obs6.valueQuantity = 9.3, obs6.valueUnit = '%',
      obs6.dateTime = '2024-08-22T15:30:00Z', obs6.display = 'HbA1c 9.3%'
MERGE (p6)-[:HAS_OBSERVATION]->(obs6)
MERGE (obs6)-[:CODED_BY]->(loincHbA1c)
MERGE (med6:MedicationRequest {resourceId: 'fhir-med-5006'})
  SET med6.name = 'Metformin 500mg (FHIR)', med6.status = 'active', med6.intent = 'order',
      med6.date = '2022-03-20T09:00:00Z', med6.display = 'Metformin 500mg'
MERGE (p6)-[:HAS_MEDICATION_REQUEST]->(med6)
MERGE (med6)-[:CODED_BY]->(rxMetformin)
MERGE (op6:OMOPPerson {personId: 99006})
  SET op6.name = 'OMOP Person 99006', op6.yearOfBirth = 1980
MERGE (p6)-[:MAPPED_TO]->(op6)
MERGE (ov6:OMOPVisitOccurrence {visitOccurrenceId: 88006})
  SET ov6.name = 'Diabetology Follow-up (OMOP)', ov6.visitConceptId = 9202
MERGE (op6)-[:HAS_VISIT_OCCURRENCE]->(ov6)
MERGE (enc6)-[:MAPPED_TO]->(ov6)
MERGE (oc6:OMOPConditionOccurrence {conditionOccurrenceId: 77006})
  SET oc6.name = 'T2D (OMOP)', oc6.conditionConceptId = 201826
MERGE (op6)-[:HAS_CONDITION_OCCURRENCE]->(oc6)
MERGE (oc6)-[:STANDARD_CONCEPT]->(scDM)
MERGE (cond6)-[:MAPPED_TO]->(oc6)
MERGE (om6:OMOPMeasurement {measurementId: 66006})
  SET om6.name = 'HbA1c Measurement (OMOP)', om6.valueAsNumber = 9.3
MERGE (op6)-[:HAS_MEASUREMENT]->(om6)
MERGE (obs6)-[:MAPPED_TO]->(om6)
MERGE (od6:OMOPDrugExposure {drugExposureId: 55006})
  SET od6.name = 'Metformin Exposure (OMOP)', od6.drugConceptId = 1503297
MERGE (op6)-[:HAS_DRUG_EXPOSURE]->(od6)
MERGE (med6)-[:MAPPED_TO]->(od6)

// ── Patient 7: Hypertension + CKD comorbidity ──
MERGE (p7:Patient {resourceId: 'fhir-pat-1007'})
  SET p7.name = 'Patient fhir-pat-1007', p7.gender = 'female', p7.birthDate = date('1945-12-05')
MERGE (p7)-[:FROM_DATASET]->(ds)
MERGE (enc7:Encounter {resourceId: 'fhir-enc-2007'})
  SET enc7.name = 'Internal Medicine Visit', enc7.class = 'ambulatory', enc7.status = 'finished',
      enc7.date = '2024-10-05T10:00:00Z', enc7.display = 'Internal medicine visit'
MERGE (p7)-[:HAS_ENCOUNTER]->(enc7)
MERGE (cond7a:Condition {resourceId: 'fhir-cond-3007a'})
  SET cond7a.name = 'Hypertension (FHIR)', cond7a.clinicalStatus = 'active', cond7a.code = '38341003',
      cond7a.onsetDate = '2019-07-20T09:00:00Z', cond7a.display = 'Essential hypertension'
MERGE (p7)-[:HAS_CONDITION]->(cond7a)
MERGE (cond7a)-[:CODED_BY]->(scHTN)
MERGE (cond7b:Condition {resourceId: 'fhir-cond-3007b'})
  SET cond7b.name = 'CKD Stage 3 (FHIR)', cond7b.clinicalStatus = 'active', cond7b.code = '709044004',
      cond7b.onsetDate = '2022-11-15T10:30:00Z', cond7b.display = 'Chronic kidney disease stage 3'
MERGE (p7)-[:HAS_CONDITION]->(cond7b)
MERGE (cond7b)-[:CODED_BY]->(scCKD)
MERGE (obs7:Observation {resourceId: 'fhir-obs-4007'})
  SET obs7.name = 'BP 160/98 (FHIR)', obs7.status = 'final', obs7.code = '55284-4', obs7.valueQuantity = 160, obs7.valueUnit = 'mmHg',
      obs7.dateTime = '2024-10-05T10:30:00Z', obs7.display = 'Blood pressure 160/98 mmHg'
MERGE (p7)-[:HAS_OBSERVATION]->(obs7)
MERGE (obs7)-[:CODED_BY]->(loincBP)
MERGE (med7:MedicationRequest {resourceId: 'fhir-med-5007'})
  SET med7.name = 'Lisinopril 10mg (FHIR)', med7.status = 'active', med7.intent = 'order',
      med7.date = '2019-08-01T14:00:00Z', med7.display = 'Lisinopril 10mg'
MERGE (p7)-[:HAS_MEDICATION_REQUEST]->(med7)
MERGE (med7)-[:CODED_BY]->(rxLisinopril)
MERGE (op7:OMOPPerson {personId: 99007})
  SET op7.name = 'OMOP Person 99007', op7.yearOfBirth = 1945
MERGE (p7)-[:MAPPED_TO]->(op7)
MERGE (ov7:OMOPVisitOccurrence {visitOccurrenceId: 88007})
  SET ov7.name = 'Internal Medicine Visit (OMOP)', ov7.visitConceptId = 9202
MERGE (op7)-[:HAS_VISIT_OCCURRENCE]->(ov7)
MERGE (enc7)-[:MAPPED_TO]->(ov7)
MERGE (oc7a:OMOPConditionOccurrence {conditionOccurrenceId: 77007})
  SET oc7a.name = 'Hypertension (OMOP)', oc7a.conditionConceptId = 320128
MERGE (op7)-[:HAS_CONDITION_OCCURRENCE]->(oc7a)
MERGE (oc7a)-[:STANDARD_CONCEPT]->(scHTN)
MERGE (cond7a)-[:MAPPED_TO]->(oc7a)
MERGE (oc7b:OMOPConditionOccurrence {conditionOccurrenceId: 77107})
  SET oc7b.name = 'CKD Stage 3 (OMOP)', oc7b.conditionConceptId = 443611
MERGE (op7)-[:HAS_CONDITION_OCCURRENCE]->(oc7b)
MERGE (oc7b)-[:STANDARD_CONCEPT]->(scCKD)
MERGE (cond7b)-[:MAPPED_TO]->(oc7b)
MERGE (om7:OMOPMeasurement {measurementId: 66007})
  SET om7.name = 'BP Measurement (OMOP)', om7.valueAsNumber = 160
MERGE (op7)-[:HAS_MEASUREMENT]->(om7)
MERGE (obs7)-[:MAPPED_TO]->(om7)
MERGE (od7:OMOPDrugExposure {drugExposureId: 55007})
  SET od7.name = 'Lisinopril Exposure (OMOP)', od7.drugConceptId = 1308216
MERGE (op7)-[:HAS_DRUG_EXPOSURE]->(od7)
MERGE (med7)-[:MAPPED_TO]->(od7)

// ── Patient 8: Asthma (paediatric) ──
MERGE (p8:Patient {resourceId: 'fhir-pat-1008'})
  SET p8.name = 'Patient fhir-pat-1008', p8.gender = 'male', p8.birthDate = date('2012-06-14')
MERGE (p8)-[:FROM_DATASET]->(ds)
MERGE (enc8:Encounter {resourceId: 'fhir-enc-2008'})
  SET enc8.name = 'Paediatric Asthma Review', enc8.class = 'ambulatory', enc8.status = 'finished',
      enc8.date = '2024-11-12T09:30:00Z', enc8.display = 'Paediatric asthma review'
MERGE (p8)-[:HAS_ENCOUNTER]->(enc8)
MERGE (cond8:Condition {resourceId: 'fhir-cond-3008'})
  SET cond8.name = 'Asthma (FHIR)', cond8.clinicalStatus = 'active', cond8.code = '195967001',
      cond8.onsetDate = '2020-05-18T11:00:00Z', cond8.display = 'Asthma'
MERGE (p8)-[:HAS_CONDITION]->(cond8)
MERGE (cond8)-[:CODED_BY]->(scAsthma)
MERGE (obs8:Observation {resourceId: 'fhir-obs-4008'})
  SET obs8.name = 'FEV1 85% (FHIR)', obs8.status = 'final', obs8.code = '20150-9', obs8.valueQuantity = 85, obs8.valueUnit = '%',
      obs8.dateTime = '2024-11-12T10:00:00Z', obs8.display = 'FEV1 85%'
MERGE (p8)-[:HAS_OBSERVATION]->(obs8)
MERGE (obs8)-[:CODED_BY]->(loincFEV1)
MERGE (med8:MedicationRequest {resourceId: 'fhir-med-5008'})
  SET med8.name = 'Albuterol Inhaler (FHIR)', med8.status = 'active', med8.intent = 'order',
      med8.date = '2020-05-25T15:00:00Z', med8.display = 'Albuterol inhaler'
MERGE (p8)-[:HAS_MEDICATION_REQUEST]->(med8)
MERGE (med8)-[:CODED_BY]->(rxAlbuterol)
MERGE (op8:OMOPPerson {personId: 99008})
  SET op8.name = 'OMOP Person 99008', op8.yearOfBirth = 2012
MERGE (p8)-[:MAPPED_TO]->(op8)
MERGE (ov8:OMOPVisitOccurrence {visitOccurrenceId: 88008})
  SET ov8.name = 'Paediatric Asthma Review (OMOP)', ov8.visitConceptId = 9202
MERGE (op8)-[:HAS_VISIT_OCCURRENCE]->(ov8)
MERGE (enc8)-[:MAPPED_TO]->(ov8)
MERGE (oc8:OMOPConditionOccurrence {conditionOccurrenceId: 77008})
  SET oc8.name = 'Asthma (OMOP)', oc8.conditionConceptId = 317009
MERGE (op8)-[:HAS_CONDITION_OCCURRENCE]->(oc8)
MERGE (oc8)-[:STANDARD_CONCEPT]->(scAsthma)
MERGE (cond8)-[:MAPPED_TO]->(oc8)
MERGE (om8:OMOPMeasurement {measurementId: 66008})
  SET om8.name = 'FEV1 Measurement (OMOP)', om8.valueAsNumber = 85
MERGE (op8)-[:HAS_MEASUREMENT]->(om8)
MERGE (obs8)-[:MAPPED_TO]->(om8)
MERGE (od8:OMOPDrugExposure {drugExposureId: 55008})
  SET od8.name = 'Albuterol Exposure (OMOP)', od8.drugConceptId = 1154343
MERGE (op8)-[:HAS_DRUG_EXPOSURE]->(od8)
MERGE (med8)-[:MAPPED_TO]->(od8)

// ==============================================================================
// End of all synthetic data
// ==============================================================================
;
// ==============================================================================
// PARTICIPANT ↔ DATA RELATIONSHIPS (who provides / uses data)
// Links JAD-registered participants to data products and datasets so the
// graph clearly shows providers, consumers, and governance roles.
// ==============================================================================

// ── Re-bind JAD participants ──
MERGE (alpha:Participant {participantId: 'did:web:alpha-klinik.de:participant'})
  SET alpha.name = 'AlphaKlinik Berlin'
WITH alpha
MERGE (pharmaco:Participant {participantId: 'did:web:pharmaco.de:research'})
  SET pharmaco.name = 'PharmaCo Research AG'
WITH alpha, pharmaco
MERGE (medreg:Participant {participantId: 'did:web:medreg.de:hdab'})
  SET medreg.name = 'MedReg DE'
WITH alpha, pharmaco, medreg
MERGE (lmc:Participant {participantId: 'did:web:lmc.nl:clinic'})
  SET lmc.name = 'Limburg Medical Centre'
WITH alpha, pharmaco, medreg, lmc
MERGE (irs:Participant {participantId: 'did:web:irs.fr:hdab'})
  SET irs.name = 'Institut de Recherche Santé'
WITH alpha, pharmaco, medreg, lmc, irs
MERGE (t2dProduct:DataProduct {productId: 'product-diab-cohort-2025'})
WITH alpha, pharmaco, medreg, lmc, irs, t2dProduct
MERGE (syntheaProduct:DataProduct {productId: 'product-synthea-fhir-r4-2026'})
WITH alpha, pharmaco, medreg, lmc, irs, t2dProduct, syntheaProduct
MERGE (dsFhir:HealthDataset {datasetId: 'dataset:synthea-fhir-r4-mvd'})
WITH alpha, pharmaco, medreg, lmc, irs, t2dProduct, syntheaProduct, dsFhir
MERGE (dsOmop:HealthDataset {datasetId: 'dataset:omop-cdm-v54-analytics'})
WITH alpha, pharmaco, medreg, lmc, irs, t2dProduct, syntheaProduct, dsFhir, dsOmop
MERGE (dsPca:HealthDataset {datasetId: 'dataset:prostate-cancer-registry'})
WITH alpha, pharmaco, medreg, lmc, irs, t2dProduct, syntheaProduct, dsFhir, dsOmop, dsPca
MERGE (dsT2d:HealthDataset {datasetId: 'urn:uuid:riverside:dataset:diab-001'})
WITH alpha, pharmaco, medreg, lmc, irs, t2dProduct, syntheaProduct, dsFhir, dsOmop, dsPca, dsT2d
MERGE (alpha)-[:OFFERS]->(syntheaProduct)
MERGE (alpha)-[:OFFERS]->(t2dProduct)
MERGE (lmc)-[:OFFERS]->(syntheaProduct)
MERGE (dsFhir)-[:PUBLISHED_BY]->(alpha)
MERGE (dsOmop)-[:PUBLISHED_BY]->(alpha)
MERGE (dsPca)-[:PUBLISHED_BY]->(lmc)
MERGE (pharmaco)-[:CONSUMES]->(t2dProduct)
MERGE (pharmaco)-[:CONSUMES]->(syntheaProduct)
MERGE (irs)-[:CONSUMES]->(syntheaProduct)
MERGE (medreg)-[:GOVERNS]->(dsPca)
MERGE (medreg)-[:GOVERNS]->(dsOmop);

// ── Create ContractNegotiation nodes (idempotent for JAD + standalone use) ──
;
MERGE (cn:ContractNegotiation {id: 'neg-001'})
  SET cn.name = 'AlphaKlinik → PharmaCo (FHIR)', cn.status = 'FINALIZED';
MERGE (cn:ContractNegotiation {id: 'neg-002'})
  SET cn.name = 'AlphaKlinik → PharmaCo (OMOP)', cn.status = 'FINALIZED';
MERGE (cn:ContractNegotiation {id: 'neg-003'})
  SET cn.name = 'LMC → MedReg (Prostate)', cn.status = 'AGREED';
MERGE (cn:ContractNegotiation {id: 'neg-004'})
  SET cn.name = 'PharmaCo → IRS (Terminated)', cn.status = 'TERMINATED';
MERGE (cn:ContractNegotiation {id: 'neg-005'})
  SET cn.name = 'AlphaKlinik → LMC (In Progress)', cn.status = 'REQUESTED';

// ── FOR_ASSET: link negotiations to datasets ──
MATCH (cn:ContractNegotiation {id: 'neg-001'})
MATCH (d:HealthDataset {datasetId: 'dataset:synthea-fhir-r4-mvd'})
MERGE (cn)-[:FOR_ASSET]->(d);
MATCH (cn:ContractNegotiation {id: 'neg-002'})
MATCH (d:HealthDataset {datasetId: 'dataset:omop-cdm-v54-analytics'})
MERGE (cn)-[:FOR_ASSET]->(d);
MATCH (cn:ContractNegotiation {id: 'neg-003'})
MATCH (d:HealthDataset {datasetId: 'dataset:prostate-cancer-registry'})
MERGE (cn)-[:FOR_ASSET]->(d);
MATCH (cn:ContractNegotiation {id: 'neg-004'})
MATCH (d:HealthDataset {datasetId: 'dataset:omop-cdm-v54-analytics'})
MERGE (cn)-[:FOR_ASSET]->(d);
MATCH (cn:ContractNegotiation {id: 'neg-005'})
MATCH (d:HealthDataset {datasetId: 'dataset:synthea-fhir-r4-mvd'})
MERGE (cn)-[:FOR_ASSET]->(d);

// ── Connect original ContractNegotiations to Provider + Consumer ──
// neg-001: AlphaKlinik → PharmaCo (FHIR)
MATCH (cn:ContractNegotiation {id: 'neg-001'})
MATCH (prov:Participant {participantId: 'did:web:alpha-klinik.de:participant'})
MATCH (cons:Participant {participantId: 'did:web:pharmaco.de:research'})
MERGE (cn)-[:NEGOTIATED_BY]->(prov)
MERGE (cn)-[:INITIATED_BY]->(cons);
// neg-002: AlphaKlinik → PharmaCo (OMOP)
MATCH (cn:ContractNegotiation {id: 'neg-002'})
MATCH (prov:Participant {participantId: 'did:web:alpha-klinik.de:participant'})
MATCH (cons:Participant {participantId: 'did:web:pharmaco.de:research'})
MERGE (cn)-[:NEGOTIATED_BY]->(prov)
MERGE (cn)-[:INITIATED_BY]->(cons);
// neg-003: LMC → MedReg (Prostate)
MATCH (cn:ContractNegotiation {id: 'neg-003'})
MATCH (prov:Participant {participantId: 'did:web:lmc.nl:clinic'})
MATCH (cons:Participant {participantId: 'did:web:medreg.de:hdab'})
MERGE (cn)-[:NEGOTIATED_BY]->(prov)
MERGE (cn)-[:INITIATED_BY]->(cons);
// neg-004: PharmaCo → IRS (Terminated)
MATCH (cn:ContractNegotiation {id: 'neg-004'})
MATCH (prov:Participant {participantId: 'did:web:pharmaco.de:research'})
MATCH (cons:Participant {participantId: 'did:web:irs.fr:hdab'})
MERGE (cn)-[:NEGOTIATED_BY]->(prov)
MERGE (cn)-[:INITIATED_BY]->(cons);
// neg-005: AlphaKlinik → LMC (In Progress)
MATCH (cn:ContractNegotiation {id: 'neg-005'})
MATCH (prov:Participant {participantId: 'did:web:alpha-klinik.de:participant'})
MATCH (cons:Participant {participantId: 'did:web:lmc.nl:clinic'})
MERGE (cn)-[:NEGOTIATED_BY]->(prov)
MERGE (cn)-[:INITIATED_BY]->(cons);

// ── Create DataTransfer nodes (idempotent for JAD + standalone use) ──
MERGE (dt:DataTransfer {id: 'trn-001'})
  SET dt.name = 'FHIR Push → PharmaCo ✓', dt.status = 'COMPLETED';
MERGE (dt:DataTransfer {id: 'trn-002'})
  SET dt.name = 'OMOP Pull → PharmaCo ✓', dt.status = 'COMPLETED';
MERGE (dt:DataTransfer {id: 'trn-003'})
  SET dt.name = 'PCA Push → MedReg ✓', dt.status = 'COMPLETED';
MERGE (dt:DataTransfer {id: 'trn-004'})
  SET dt.name = 'FHIR Pull → LMC (Active)', dt.status = 'STARTED';
MERGE (dt:DataTransfer {id: 'trn-005'})
  SET dt.name = 'FHIR Push → IRS (Error)', dt.status = 'ERROR';

// ── TRANSFERS: link transfers to datasets ──
MATCH (dt:DataTransfer {id: 'trn-001'})
MATCH (d:HealthDataset {datasetId: 'dataset:synthea-fhir-r4-mvd'})
MERGE (dt)-[:TRANSFERS]->(d);
MATCH (dt:DataTransfer {id: 'trn-002'})
MATCH (d:HealthDataset {datasetId: 'dataset:omop-cdm-v54-analytics'})
MERGE (dt)-[:TRANSFERS]->(d);
MATCH (dt:DataTransfer {id: 'trn-003'})
MATCH (d:HealthDataset {datasetId: 'dataset:prostate-cancer-registry'})
MERGE (dt)-[:TRANSFERS]->(d);
MATCH (dt:DataTransfer {id: 'trn-004'})
MATCH (d:HealthDataset {datasetId: 'dataset:synthea-fhir-r4-mvd'})
MERGE (dt)-[:TRANSFERS]->(d);
MATCH (dt:DataTransfer {id: 'trn-005'})
MATCH (d:HealthDataset {datasetId: 'dataset:synthea-fhir-r4-mvd'})
MERGE (dt)-[:TRANSFERS]->(d);

// ── Connect original DataTransfers to Providers + Consumers ──
// trn-001: FHIR Push → PharmaCo (AlphaKlinik → PharmaCo)
MATCH (dt:DataTransfer {id: 'trn-001'})
MATCH (prov:Participant {participantId: 'did:web:alpha-klinik.de:participant'})
MATCH (cons:Participant {participantId: 'did:web:pharmaco.de:research'})
MERGE (dt)-[:FROM_PROVIDER]->(prov)
MERGE (dt)-[:TO_CONSUMER]->(cons);
// trn-002: OMOP Pull → PharmaCo (AlphaKlinik → PharmaCo)
MATCH (dt:DataTransfer {id: 'trn-002'})
MATCH (prov:Participant {participantId: 'did:web:alpha-klinik.de:participant'})
MATCH (cons:Participant {participantId: 'did:web:pharmaco.de:research'})
MERGE (dt)-[:FROM_PROVIDER]->(prov)
MERGE (dt)-[:TO_CONSUMER]->(cons);
// trn-003: PCA Push → MedReg (LMC → MedReg)
MATCH (dt:DataTransfer {id: 'trn-003'})
MATCH (prov:Participant {participantId: 'did:web:lmc.nl:clinic'})
MATCH (cons:Participant {participantId: 'did:web:medreg.de:hdab'})
MERGE (dt)-[:FROM_PROVIDER]->(prov)
MERGE (dt)-[:TO_CONSUMER]->(cons);
// trn-004: FHIR Pull → LMC (AlphaKlinik → LMC)
MATCH (dt:DataTransfer {id: 'trn-004'})
MATCH (prov:Participant {participantId: 'did:web:alpha-klinik.de:participant'})
MATCH (cons:Participant {participantId: 'did:web:lmc.nl:clinic'})
MERGE (dt)-[:FROM_PROVIDER]->(prov)
MERGE (dt)-[:TO_CONSUMER]->(cons);
// trn-005: FHIR Push → IRS (AlphaKlinik → IRS)
MATCH (dt:DataTransfer {id: 'trn-005'})
MATCH (prov:Participant {participantId: 'did:web:alpha-klinik.de:participant'})
MATCH (cons:Participant {participantId: 'did:web:irs.fr:hdab'})
MERGE (dt)-[:FROM_PROVIDER]->(prov)
MERGE (dt)-[:TO_CONSUMER]->(cons);

// ── Link patients to provider participants (data provenance) ──
MERGE (riverside:Participant {participantId: 'did:web:riverside.example:participant'})
  SET riverside.name = 'Riverside General (CLINIC)', riverside.role = 'DATA_HOLDER'
MERGE (dsT2d:HealthDataset {datasetId: 'urn:uuid:riverside:dataset:diab-001'})
MERGE (alpha2:Participant {participantId: 'did:web:alpha-klinik.de:participant'})
MERGE (dsT2d)-[:PUBLISHED_BY]->(riverside)
MERGE (dsT2d)-[:PROVIDED_BY]->(alpha2);

// ── Governance for remaining datasets ──
MATCH (d:HealthDataset {datasetId: 'urn:uuid:riverside:dataset:diab-001'})
MATCH (h:Participant {participantId: 'did:web:medreg.de:hdab'})
MERGE (h)-[:GOVERNS]->(d);
MATCH (d:HealthDataset {datasetId: 'dataset:synthea-fhir-r4-mvd'})
MATCH (h:Participant {participantId: 'did:web:medreg.de:hdab'})
MERGE (h)-[:GOVERNS]->(d);

// ── Set Synthea dataset title ──
MATCH (d:HealthDataset {datasetId: 'dataset:synthea-fhir-r4-mvd'})
SET d.title = 'Synthea Synthetic FHIR R4 Patient Cohort'
WITH d WHERE d.title IS NOT NULL RETURN count(d);

// ── Fix dataset metadata for OMOP + Prostate ──
MATCH (d:HealthDataset {datasetId: 'dataset:omop-cdm-v54-analytics'})
SET d.title = 'OMOP CDM v5.4 Analytics Warehouse',
    d.description = 'OMOP CDM v5.4 analytics warehouse with standardized clinical data from FHIR R4.',
    d.license = 'CC-BY-SA-4.0',
    d.conformsTo = 'https://ohdsi.github.io/CommonDataModel/cdm54.html',
    d.theme = 'Clinical Research',
    d.hdcatapDatasetType = 'AnalyticsData',
    d.hdcatapLegalBasisForAccess = 'EHDS Article 53 Secondary Use',
    d.hdcatapNumberOfRecords = 49657;
MATCH (d:HealthDataset {datasetId: 'dataset:prostate-cancer-registry'})
SET d.title = 'Prostate Cancer Multi-Centre Registry',
    d.description = 'Federated registry of prostate cancer outcomes with TNM staging and Gleason scores in FHIR R4.',
    d.license = 'CC-BY-NC-4.0',
    d.conformsTo = 'http://hl7.org/fhir/R4',
    d.theme = 'Oncology',
    d.hdcatapDatasetType = 'RegistryData',
    d.hdcatapLegalBasisForAccess = 'EHDS Article 53 Secondary Use',
    d.hdcatapNumberOfRecords = 8234;

// ── Link Synthea dataset to its DataProduct ──
MATCH (dp:DataProduct {productId: 'product-synthea-fhir-r4-2026'})
MATCH (ds:HealthDataset {datasetId: 'dataset:synthea-fhir-r4-mvd'})
MERGE (ds)-[:DESCRIBED_BY]->(dp);

// ==============================================================================
// CROSS-LAYER RELATIONSHIP FIX: connect disconnected nodes
// ==============================================================================

// ── Delete orphan unlabeled nodes (empty artifact from broken MERGEs) ──
MATCH (n) WHERE labels(n) = [] DETACH DELETE n;

// ── Connect VerifiableCredentials to their subject Participants ──
MATCH (vc:VerifiableCredential), (p:Participant)
WHERE (vc.subjectDid CONTAINS 'clinic-alphaklinik' AND p.name = 'AlphaKlinik Berlin')
   OR (vc.subjectDid CONTAINS 'cro-pharmaco' AND p.name = 'PharmaCo Research AG')
   OR (vc.subjectDid CONTAINS 'hdab-medreg' AND p.name = 'MedReg DE')
   OR (vc.subjectDid CONTAINS 'clinic-lmc' AND p.name = 'Limburg Medical Centre')
   OR (vc.subjectDid CONTAINS 'hdab-irs' AND p.name = 'Institut de Recherche Santé')
MERGE (vc)-[:ISSUED_TO]->(p);

// ── Connect Catalog to HealthDatasets ──
MATCH (cat:Catalog), (d:HealthDataset)
MERGE (cat)-[:LISTS]->(d);

// ── Connect Organization → Catalog ──
MATCH (org:Organization {name: 'Health MVD Operator'}), (cat:Catalog)
MERGE (org)-[:OPERATES]->(cat);

// ── Connect ContactPoint to T2D dataset ──
MATCH (cp:ContactPoint {name: 'Health MVD Data Steward'})
MATCH (d:HealthDataset {datasetId: 'urn:uuid:riverside:dataset:diab-001'})
MERGE (d)-[:HAS_CONTACT_POINT]->(cp);

// ── Connect EhdsPurpose to all datasets ──
MATCH (ep:EhdsPurpose), (d:HealthDataset)
MERGE (d)-[:SUBJECT_TO_PURPOSE]->(ep);

// ── Connect PractitionerRole profile to Patient Summaries category ──
MATCH (p:EEHRxFProfile {name: 'PractitionerRole (EU core)'})
MATCH (c:EEHRxFCategory {name: 'Patient Summaries'})
MERGE (p)-[:PART_OF_CATEGORY]->(c);

// ── Connect Rare Disease Registration to Prostate Cancer dataset ──
MATCH (c:EEHRxFCategory {name: 'Rare Disease Registration'})
MATCH (d:HealthDataset {datasetId: 'dataset:prostate-cancer-registry'})
MERGE (d)-[:HAS_THEME]->(c);

// ── Connect datasets → EEHRxF profiles via CONFORMS_TO ──
MATCH (d:HealthDataset)
WHERE d.datasetId IN ['urn:uuid:riverside:dataset:diab-001', 'dataset:synthea-fhir-r4-mvd']
MATCH (p:EEHRxFProfile)
WHERE p.baseResource IN ['Patient', 'Encounter', 'Observation', 'MedicationRequest']
MERGE (d)-[:CONFORMS_TO]->(p);

// ==============================================================================
// End of participant/data relationship enrichment
// ==============================================================================

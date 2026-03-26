// Neo4j schema initialization for the Health Dataspace Graph
// Run against a fresh Neo4j instance after startup
// See: health-dataspace-graph-schema.md for full documentation

// ============================================================
// Layer 1: Dataspace Marketplace Metadata
// ============================================================
CREATE CONSTRAINT participant_id IF NOT EXISTS FOR (p:Participant) REQUIRE p.participantId IS UNIQUE;
CREATE INDEX participant_type IF NOT EXISTS FOR (p:Participant) ON (p.participantType);
CREATE CONSTRAINT product_id IF NOT EXISTS FOR (dp:DataProduct) REQUIRE dp.productId IS UNIQUE;
CREATE INDEX product_type IF NOT EXISTS FOR (dp:DataProduct) ON (dp.productType);
CREATE CONSTRAINT contract_id IF NOT EXISTS FOR (c:Contract) REQUIRE c.contractId IS UNIQUE;
CREATE CONSTRAINT access_application_id IF NOT EXISTS FOR (aa:AccessApplication) REQUIRE aa.applicationId IS UNIQUE;
CREATE INDEX access_application_status IF NOT EXISTS FOR (aa:AccessApplication) ON (aa.status);
CREATE CONSTRAINT hdab_approval_id IF NOT EXISTS FOR (ha:HDABApproval) REQUIRE ha.approvalId IS UNIQUE;

// ============================================================
// Layer 2: HealthDCAT-AP Metadata (W3C HealthDCAT-AP vocabulary)
// See: https://healthdcat-ap.github.io/
// ============================================================
CREATE CONSTRAINT catalog_id IF NOT EXISTS FOR (cat:Catalog) REQUIRE cat.catalogId IS UNIQUE;
CREATE CONSTRAINT dataset_id IF NOT EXISTS FOR (hd:HealthDataset) REQUIRE hd.datasetId IS UNIQUE;
CREATE CONSTRAINT distribution_id IF NOT EXISTS FOR (d:Distribution) REQUIRE d.distributionId IS UNIQUE;
CREATE CONSTRAINT contact_point_id IF NOT EXISTS FOR (cp:ContactPoint) REQUIRE cp.contactId IS UNIQUE;
CREATE CONSTRAINT organization_id IF NOT EXISTS FOR (org:Organization) REQUIRE org.organizationId IS UNIQUE;

// ============================================================
// Layer 2b: EEHRxF Profile Metadata
// ============================================================
CREATE CONSTRAINT eehrxf_category_id IF NOT EXISTS FOR (c:EEHRxFCategory) REQUIRE c.categoryId IS UNIQUE;
CREATE CONSTRAINT eehrxf_profile_id IF NOT EXISTS FOR (p:EEHRxFProfile) REQUIRE p.profileId IS UNIQUE;
CREATE INDEX eehrxf_profile_base IF NOT EXISTS FOR (p:EEHRxFProfile) ON (p.baseResource);

// ============================================================
// Layer 3: FHIR Clinical Knowledge Graph
// ============================================================
CREATE CONSTRAINT patient_id IF NOT EXISTS FOR (p:Patient) REQUIRE p.resourceId IS UNIQUE;
CREATE INDEX patient_identifier IF NOT EXISTS FOR (p:Patient) ON (p.identifier);
CREATE CONSTRAINT condition_id IF NOT EXISTS FOR (c:Condition) REQUIRE c.resourceId IS UNIQUE;
CREATE INDEX condition_code IF NOT EXISTS FOR (c:Condition) ON (c.code);
CREATE CONSTRAINT observation_id IF NOT EXISTS FOR (o:Observation) REQUIRE o.resourceId IS UNIQUE;
CREATE INDEX observation_code IF NOT EXISTS FOR (o:Observation) ON (o.code);
CREATE INDEX observation_category IF NOT EXISTS FOR (o:Observation) ON (o.category);
CREATE CONSTRAINT medication_request_id IF NOT EXISTS FOR (mr:MedicationRequest) REQUIRE mr.resourceId IS UNIQUE;
CREATE INDEX medication_code IF NOT EXISTS FOR (mr:MedicationRequest) ON (mr.medicationCode);
CREATE CONSTRAINT encounter_id IF NOT EXISTS FOR (e:Encounter) REQUIRE e.resourceId IS UNIQUE;
CREATE CONSTRAINT procedure_id IF NOT EXISTS FOR (pr:Procedure) REQUIRE pr.resourceId IS UNIQUE;
CREATE INDEX procedure_code IF NOT EXISTS FOR (pr:Procedure) ON (pr.code);

// ============================================================
// Layer 4: OMOP Research Analytics
// ============================================================
CREATE CONSTRAINT omop_person_id IF NOT EXISTS FOR (op:OMOPPerson) REQUIRE op.personId IS UNIQUE;
CREATE CONSTRAINT omop_condition_occurrence_id IF NOT EXISTS FOR (oco:OMOPConditionOccurrence) REQUIRE oco.conditionOccurrenceId IS UNIQUE;
CREATE INDEX omop_condition_concept IF NOT EXISTS FOR (oco:OMOPConditionOccurrence) ON (oco.conditionConceptId);
CREATE CONSTRAINT omop_measurement_id IF NOT EXISTS FOR (om:OMOPMeasurement) REQUIRE om.measurementId IS UNIQUE;
CREATE INDEX omop_measurement_concept IF NOT EXISTS FOR (om:OMOPMeasurement) ON (om.measurementConceptId);
CREATE CONSTRAINT omop_procedure_occurrence_id IF NOT EXISTS FOR (opo:OMOPProcedureOccurrence) REQUIRE opo.procedureOccurrenceId IS UNIQUE;
CREATE INDEX omop_procedure_concept IF NOT EXISTS FOR (opo:OMOPProcedureOccurrence) ON (opo.procedureConceptId);

// ============================================================
// Layer 5: Clinical Ontology Backbone
// ============================================================
CREATE CONSTRAINT snomed_concept_id IF NOT EXISTS FOR (sc:SnomedConcept) REQUIRE sc.conceptId IS UNIQUE;
CREATE CONSTRAINT loinc_code IF NOT EXISTS FOR (lc:LoincCode) REQUIRE lc.loincNumber IS UNIQUE;
CREATE CONSTRAINT icd10_code IF NOT EXISTS FOR (icd:ICD10Code) REQUIRE icd.code IS UNIQUE;
CREATE CONSTRAINT rxnorm_rxcui IF NOT EXISTS FOR (rx:RxNormConcept) REQUIRE rx.rxcui IS UNIQUE;

// ============================================================
// Layer 1b: Verifiable Credentials (DCP v1.0 + EHDS)
// ============================================================
CREATE CONSTRAINT vc_id IF NOT EXISTS FOR (vc:VerifiableCredential) REQUIRE vc.credentialId IS UNIQUE;
CREATE INDEX vc_type IF NOT EXISTS FOR (vc:VerifiableCredential) ON (vc.credentialType);
CREATE INDEX vc_subject IF NOT EXISTS FOR (vc:VerifiableCredential) ON (vc.subjectDid);
CREATE INDEX vc_status IF NOT EXISTS FOR (vc:VerifiableCredential) ON (vc.status);

// ============================================================
// Phase 18: Trust Center & Federated Pseudonym Resolution
// EHDS Art. 50 (Secure Processing Environment) + Art. 51 (Cross-Border)
// ============================================================

// Trust Center nodes — operated by national HDAB-designated authorities
CREATE CONSTRAINT trust_center_name IF NOT EXISTS FOR (tc:TrustCenter) REQUIRE tc.name IS UNIQUE;
CREATE INDEX trust_center_country IF NOT EXISTS FOR (tc:TrustCenter) ON (tc.country);
CREATE INDEX trust_center_status IF NOT EXISTS FOR (tc:TrustCenter) ON (tc.status);

// Provider Pseudonyms — per-provider opaque patient identifiers
// Never shared with researchers; only the Trust Center maps them
CREATE CONSTRAINT provider_psn_id IF NOT EXISTS FOR (pp:ProviderPseudonym) REQUIRE pp.psnId IS UNIQUE;
CREATE INDEX provider_psn_provider IF NOT EXISTS FOR (pp:ProviderPseudonym) ON (pp.providerId);

// Research Pseudonyms — cross-provider research identifiers issued by Trust Center
// Only visible within the SPE; never returned to the data user
CREATE CONSTRAINT research_psn_id IF NOT EXISTS FOR (rp:ResearchPseudonym) REQUIRE rp.rpsnId IS UNIQUE;
CREATE INDEX research_psn_study IF NOT EXISTS FOR (rp:ResearchPseudonym) ON (rp.studyId);
CREATE INDEX research_psn_revoked IF NOT EXISTS FOR (rp:ResearchPseudonym) ON (rp.revoked);

// SPE Sessions — TEE-attested Secure Processing Environment sessions
// Sessions are created by the HDAB, not the researcher
CREATE CONSTRAINT spe_session_id IF NOT EXISTS FOR (ss:SPESession) REQUIRE ss.sessionId IS UNIQUE;
CREATE INDEX spe_session_status IF NOT EXISTS FOR (ss:SPESession) ON (ss.status);
CREATE INDEX spe_session_study IF NOT EXISTS FOR (ss:SPESession) ON (ss.studyId);

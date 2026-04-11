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
// Phase 20: Patient Portal — GDPR Art. 15-22 / EHDS Chapter II
// Patient consent for research (EHDS Art. 10), insights
// ============================================================
CREATE CONSTRAINT patient_consent_id IF NOT EXISTS FOR (pc:PatientConsent) REQUIRE pc.consentId IS UNIQUE;
CREATE INDEX patient_consent_patient IF NOT EXISTS FOR (pc:PatientConsent) ON (pc.patientId);
CREATE INDEX patient_consent_study IF NOT EXISTS FOR (pc:PatientConsent) ON (pc.studyId);
CREATE INDEX patient_consent_revoked IF NOT EXISTS FOR (pc:PatientConsent) ON (pc.revoked);

CREATE CONSTRAINT research_insight_id IF NOT EXISTS FOR (ri:ResearchInsight) REQUIRE ri.insightId IS UNIQUE;
CREATE INDEX research_insight_study IF NOT EXISTS FOR (ri:ResearchInsight) ON (ri.studyId);

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

// ============================================================
// Data Transfers & Transfer Events (DSP audit trail)
// ============================================================

// DataTransfer — contract-level bulk data transfer process
CREATE CONSTRAINT data_transfer_id IF NOT EXISTS FOR (dt:DataTransfer) REQUIRE dt.id IS UNIQUE;
CREATE INDEX data_transfer_status IF NOT EXISTS FOR (dt:DataTransfer) ON (dt.status);

// TransferEvent — individual data access event (EHDS audit trail)
CREATE CONSTRAINT transfer_event_id IF NOT EXISTS FOR (te:TransferEvent) REQUIRE te.eventId IS UNIQUE;
CREATE INDEX transfer_event_timestamp IF NOT EXISTS FOR (te:TransferEvent) ON (te.timestamp);
CREATE INDEX transfer_event_endpoint IF NOT EXISTS FOR (te:TransferEvent) ON (te.endpoint);
CREATE INDEX transfer_event_participant IF NOT EXISTS FOR (te:TransferEvent) ON (te.participant);

// ============================================================
// Phase 24: ODRL Policy Enforcement & GraphRAG
// ============================================================

// ODRL Policy — runtime-enforced access control policies
CREATE CONSTRAINT odrl_policy_id IF NOT EXISTS FOR (pol:OdrlPolicy) REQUIRE pol.policyId IS UNIQUE;

// Query Audit Events — EHDS Art. 53 compliance logging
CREATE CONSTRAINT query_audit_event_id IF NOT EXISTS FOR (qa:QueryAuditEvent) REQUIRE qa.eventId IS UNIQUE;
CREATE INDEX query_audit_timestamp IF NOT EXISTS FOR (qa:QueryAuditEvent) ON (qa.timestamp);
CREATE INDEX query_audit_participant IF NOT EXISTS FOR (qa:QueryAuditEvent) ON (qa.participantId);

// Fulltext indexes for natural language search (Phase 24f)
// Used by Tier 2 (fulltextSearch) in the NLQ resolution chain
CREATE FULLTEXT INDEX clinical_search IF NOT EXISTS
  FOR (n:Condition|Observation|MedicationRequest|Procedure)
  ON EACH [n.display, n.name, n.code];

CREATE FULLTEXT INDEX catalog_search IF NOT EXISTS
  FOR (n:HealthDataset|DataProduct)
  ON EACH [n.title, n.description, n.name];

CREATE FULLTEXT INDEX ontology_search IF NOT EXISTS
  FOR (n:SnomedConcept|LoincCode|ICD10Code|RxNormConcept)
  ON EACH [n.display, n.name];

// Vector indexes for GraphRAG (Neo4j 5.13+ Community)
// Embeddings generated via scripts/generate-embeddings.sh
CREATE VECTOR INDEX healthdataset_embedding IF NOT EXISTS
  FOR (d:HealthDataset) ON (d.embedding)
  OPTIONS {indexConfig: {`vector.dimensions`: 384, `vector.similarity_function`: 'cosine'}};

CREATE VECTOR INDEX condition_embedding IF NOT EXISTS
  FOR (c:Condition) ON (c.embedding)
  OPTIONS {indexConfig: {`vector.dimensions`: 384, `vector.similarity_function`: 'cosine'}};

CREATE VECTOR INDEX snomed_embedding IF NOT EXISTS
  FOR (s:SnomedConcept) ON (s.embedding)
  OPTIONS {indexConfig: {`vector.dimensions`: 384, `vector.similarity_function`: 'cosine'}};

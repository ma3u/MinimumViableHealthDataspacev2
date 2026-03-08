// =============================================================================
// Phase 3e: DSP Marketplace Registration for the Synthea FHIR Dataset
//
// Wires the real Synthea cohort (from Phase 3b/3c) into Layer 1 so the EHDS
// compliance chain is connected end-to-end:
//
//   Participant (CRO) -> AccessApplication -> HDABApproval
//                                          -> GRANTS_ACCESS_TO -> HealthDataset
//                        Contract -> GOVERNS -> DataProduct -> DESCRIBED_BY -> HealthDataset
//
// Idempotent (MERGE everywhere). Run after register-fhir-dataset-hdcatap.cypher:
//
//   cat neo4j/register-dsp-marketplace.cypher | \
//     docker exec -i health-dataspace-neo4j \
//     cypher-shell -u neo4j -p healthdataspace
// =============================================================================

// ---------------------------------------------------------------------------
// 1. Ensure the three core participants exist (reuse from synthetic data or create)
// ---------------------------------------------------------------------------
MERGE (clinic:Participant {participantId: 'did:web:charite.de:participant'})
  ON CREATE SET clinic.name           = 'Charité Berlin (CLINIC)',
               clinic.legalName       = 'Charité Universitätsmedizin Berlin',
               clinic.participantType = 'CLINIC',
               clinic.jurisdiction    = 'DE',
               clinic.createdAt       = datetime()
  ON MATCH  SET clinic.lastSeenAt     = datetime();

MERGE (cro:Participant {participantId: 'did:web:bayer.com:research'})
  ON CREATE SET cro.name           = 'Bayer Research (CRO)',
               cro.legalName       = 'Bayer AG Clinical Research',
               cro.participantType = 'CRO',
               cro.jurisdiction    = 'DE',
               cro.createdAt       = datetime()
  ON MATCH  SET cro.lastSeenAt     = datetime();

MERGE (hdab:Participant {participantId: 'did:web:bfarm.de:hdab'})
  ON CREATE SET hdab.name           = 'BfArM (HDAB)',
               hdab.legalName       = 'BfArM Health Data Access Body',
               hdab.participantType = 'HDAB',
               hdab.jurisdiction    = 'DE',
               hdab.createdAt       = datetime()
  ON MATCH  SET hdab.lastSeenAt     = datetime();

// ---------------------------------------------------------------------------
// 2. DataProduct pointing at the real Synthea HealthDataset
// ---------------------------------------------------------------------------
MERGE (dp:DataProduct {productId: 'product-synthea-fhir-r4-2026'})
  ON CREATE SET dp.name        = 'Synthea FHIR R4 Patient Cohort (2026)',
               dp.title        = 'Synthetic Massachusetts Cohort — FHIR R4 + OMOP CDM',
               dp.productType  = 'SYNTHETIC',
               dp.sensitivity  = 'NOT_PERSONAL',
               dp.createdAt    = datetime()
  ON MATCH  SET dp.modifiedAt  = datetime();

MERGE (clinic)-[:OFFERS]->(dp);

MATCH (ds:HealthDataset {id: 'dataset:synthea-fhir-r4-mvd'})
MATCH (dp:DataProduct {productId: 'product-synthea-fhir-r4-2026'})
MERGE (dp)-[:DESCRIBED_BY]->(ds);

// ---------------------------------------------------------------------------
// 3. ODRL Usage Policy (EHDS Art. 53 — Secondary Use)
// ---------------------------------------------------------------------------
MERGE (policy:OdrlPolicy {policyId: 'policy-ehds-art53-synthetic-2026'})
  ON CREATE SET
    policy.name             = 'EHDS Art. 53 Secondary Use — Synthetic Data',
    policy.odrlAction       = 'odrl:use',
    policy.ehdsPermissions  = ['scientific_research', 'statistics', 'policy_support',
                               'education', 'ai_training'],
    policy.ehdsProhibitions = ['re_identification', 'commercial_exploitation_without_approval'],
    policy.temporalLimit    = datetime('2027-12-31T23:59:59'),
    policy.createdAt        = datetime();

MATCH (dp:DataProduct {productId: 'product-synthea-fhir-r4-2026'})
MATCH (policy:OdrlPolicy {policyId: 'policy-ehds-art53-synthetic-2026'})
MERGE (dp)-[:GOVERNED_BY]->(policy);

// ---------------------------------------------------------------------------
// 4. Contract between Clinic and CRO
// ---------------------------------------------------------------------------
MERGE (contract:Contract {contractId: 'contract-ehds-53-synthea-2026'})
  ON CREATE SET
    contract.name          = 'EHDS Art. 53 Synthetic Cohort Contract',
    contract.agreementDate = datetime('2026-01-15T10:00:00'),
    contract.validUntil    = datetime('2027-01-15T23:59:59'),
    contract.usagePurpose  = 'SCIENTIFIC_RESEARCH',
    contract.accessType    = 'QUERY',
    contract.status        = 'ACTIVE',
    contract.createdAt     = datetime()
  ON MATCH  SET contract.lastSeenAt = datetime();

MATCH (dp:DataProduct {productId: 'product-synthea-fhir-r4-2026'})
MATCH (contract:Contract {contractId: 'contract-ehds-53-synthea-2026'})
MATCH (clinic:Participant {participantId: 'did:web:charite.de:participant'})
MATCH (cro:Participant {participantId: 'did:web:bayer.com:research'})
MERGE (contract)-[:GOVERNS]->(dp)
MERGE (contract)-[:PROVIDER]->(clinic)
MERGE (contract)-[:CONSUMER]->(cro)
MERGE (cro)-[:CONSUMES]->(dp);

// ---------------------------------------------------------------------------
// 5. Access Application (CRO → HDAB)
// ---------------------------------------------------------------------------
MERGE (app:AccessApplication {applicationId: 'app-synthea-bfarm-2026-001'})
  ON CREATE SET
    app.name                     = 'Synthea Cohort Access Request 2026-001',
    app.requestedPurpose         = 'SCIENTIFIC_RESEARCH',
    app.submittedAt              = datetime('2026-01-05T09:00:00'),
    app.status                   = 'APPROVED',
    app.justification            = 'Secondary use of synthetic FHIR R4 cohort for ML model training and epidemiological analysis. No PHI involved.',
    app.ethicsCommitteeRef       = 'EC-BfArM-2025-0042',
    app.dataMinimisationStatement= 'Synthetic data only; no re-identification risk.',
    app.createdAt                = datetime()
  ON MATCH  SET app.lastSeenAt   = datetime();

MATCH (cro:Participant {participantId: 'did:web:bayer.com:research'})
MATCH (hdab:Participant {participantId: 'did:web:bfarm.de:hdab'})
MATCH (dp:DataProduct {productId: 'product-synthea-fhir-r4-2026'})
MATCH (app:AccessApplication {applicationId: 'app-synthea-bfarm-2026-001'})
MERGE (cro)-[:SUBMITTED]->(app)
MERGE (app)-[:REQUESTS_ACCESS_TO]->(dp)
MERGE (hdab)-[:REVIEWED]->(app);

// ---------------------------------------------------------------------------
// 6. HDAB Approval — with GRANTS_ACCESS_TO pointing at the HealthDataset
//    (this is the relationship that the compliance checker traverses)
// ---------------------------------------------------------------------------
MERGE (approval:HDABApproval {approvalId: 'hdab-synthea-bfarm-2026-001'})
  ON CREATE SET
    approval.name             = 'BfArM HDAB Approval — Synthea Cohort 2026',
    approval.approvedAt       = datetime('2026-01-20T14:30:00'),
    approval.validUntil       = datetime('2027-01-20T23:59:59'),
    approval.permittedPurpose = 'SCIENTIFIC_RESEARCH',
    approval.status           = 'APPROVED',
    approval.ehdsArticle      = 'EHDS_Art_53',
    approval.conditions       = ['Synthetic data only — no re-identification possible',
                                 'Results must be aggregated before export',
                                 'Quarterly usage reports to BfArM'],
    approval.hdabOfficer      = 'Dr. Anna Müller (BfArM Data Access Board)',
    approval.createdAt        = datetime()
  ON MATCH  SET approval.lastSeenAt = datetime();

MATCH (app:AccessApplication {applicationId: 'app-synthea-bfarm-2026-001'})
MATCH (approval:HDABApproval {approvalId: 'hdab-synthea-bfarm-2026-001'})
MATCH (contract:Contract {contractId: 'contract-ehds-53-synthea-2026'})
MATCH (ds:HealthDataset {id: 'dataset:synthea-fhir-r4-mvd'})
MERGE (approval)-[:APPROVES]->(app)
MERGE (approval)-[:APPROVED]->(contract)
MERGE (approval)-[:GRANTS_ACCESS_TO]->(ds);

// ---------------------------------------------------------------------------
// 7. Report
// ---------------------------------------------------------------------------
MATCH (cro:Participant {participantId: 'did:web:bayer.com:research'})
MATCH (cro)-[:SUBMITTED]->(app:AccessApplication)
MATCH (approval:HDABApproval)-[:APPROVES]->(app)
MATCH (approval)-[:GRANTS_ACCESS_TO]->(ds:HealthDataset)
MATCH (dp:DataProduct)-[:DESCRIBED_BY]->(ds)
MATCH (contract:Contract)-[:GOVERNS]->(dp)
RETURN
  cro.name                 AS consumer,
  app.applicationId        AS applicationId,
  app.status               AS applicationStatus,
  approval.approvalId      AS approvalId,
  approval.ehdsArticle     AS ehdsArticle,
  approval.status          AS approvalStatus,
  ds.id                    AS dataset,
  contract.contractId      AS contract;

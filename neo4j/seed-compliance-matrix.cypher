// ==============================================================================
// EHDS Compliance Matrix — diverse approval chain states for all participants
//
// Demonstrates the full range of EHDS Art. 45-53 compliance levels:
//   FULL    — Application → HDAB Approval → Dataset grant → Contract
//   PARTIAL — Some chain elements present but incomplete
//   NONE    — No access application submitted
//
// Run AFTER insert-synthetic-schema-data.cypher:
//   cat neo4j/seed-compliance-matrix.cypher | docker exec -i health-dataspace-neo4j \
//     cypher-shell -u neo4j -p healthdataspace
// ==============================================================================

// ── 1. Fix existing data: add missing status and GRANTS_ACCESS_TO ─────────

// TrialCorp's approval is missing GRANTS_ACCESS_TO and status
MATCH (approval:HDABApproval {approvalId: 'hdab-decision-healthgov-2025-001'})
MATCH (ds:HealthDataset {datasetId: 'urn:uuid:riverside:dataset:diab-001'})
SET approval.status = 'APPROVED',
    approval.ehdsArticle = 'EHDS Art. 46'
MERGE (approval)-[:GRANTS_ACCESS_TO]->(ds);

// PharmaCo's original approval is also missing status
MATCH (approval:HDABApproval {approvalId: 'hdab-decision-medreg-2025-001'})
MATCH (ds:HealthDataset {datasetId: 'urn:uuid:alphaklinik:dataset:diab-001'})
SET approval.status = 'APPROVED',
    approval.ehdsArticle = 'EHDS Art. 46'
MERGE (approval)-[:GRANTS_ACCESS_TO]->(ds);

// ── 2. PharmaCo Research AG — FULL compliance (second dataset) ────────────
// PharmaCo already has app-medreg-2025-001 + hdab-decision-medreg-2025-001
// Add the SUBMITTED relationship that was missing
MATCH (pharmaco:Participant {participantId: 'did:web:pharmaco.de:research'})
MATCH (app:AccessApplication {applicationId: 'app-medreg-2025-001'})
MERGE (pharmaco)-[:SUBMITTED]->(app);

// ── 3. AlphaKlinik Berlin — PARTIAL (application submitted, pending) ──────
MATCH (alpha:Participant {participantId: 'did:web:alpha-klinik.de:participant'})
MATCH (medreg:Participant {participantId: 'did:web:medreg.de:hdab'})

MERGE (appAlpha:AccessApplication {applicationId: 'app-alpha-medreg-2026-001'})
  SET appAlpha.name = 'AlphaKlinik Data Sharing Application',
      appAlpha.applicantId = alpha.participantId,
      appAlpha.datasetId = 'dataset:synthea-fhir-r4-mvd',
      appAlpha.requestedPurpose = 'PUBLIC_HEALTH',
      appAlpha.submittedAt = datetime('2026-03-15T10:00:00'),
      appAlpha.status = 'PENDING',
      appAlpha.justification = 'Cross-border hospital benchmarking study for post-pandemic readmission rates under EHDS Art. 34.',
      appAlpha.ethicsCommitteeRef = 'EC-AlphaKlinik-2026-042',
      appAlpha.dataMinimisationStatement = 'Aggregate cohort statistics only; no patient-level export.'
MERGE (alpha)-[:SUBMITTED]->(appAlpha)
MERGE (medreg)-[:REVIEWED]->(appAlpha);

// ── 4. Limburg Medical Centre — PARTIAL (approved but no contract yet) ────
MATCH (lmc:Participant {participantId: 'did:web:lmc.nl:clinic'})
MATCH (irs:Participant {participantId: 'did:web:irs.fr:hdab'})
MATCH (synthea:HealthDataset {datasetId: 'dataset:synthea-fhir-r4-mvd'})

MERGE (appLmc:AccessApplication {applicationId: 'app-lmc-irs-2026-001'})
  SET appLmc.name = 'LMC Cross-Border Research Application',
      appLmc.applicantId = lmc.participantId,
      appLmc.datasetId = synthea.datasetId,
      appLmc.requestedPurpose = 'SCIENTIFIC_RESEARCH',
      appLmc.submittedAt = datetime('2026-02-01T08:30:00'),
      appLmc.status = 'APPROVED',
      appLmc.justification = 'Multi-centre diabetes outcomes study under EHDS Art. 51 mutual recognition (NL↔FR).',
      appLmc.ethicsCommitteeRef = 'EC-METC-Limburg-2026-007',
      appLmc.dataMinimisationStatement = 'Pseudonymized cohort data via Trust Center resolution.'
MERGE (lmc)-[:SUBMITTED]->(appLmc)
MERGE (irs)-[:REVIEWED]->(appLmc)

MERGE (approvalLmc:HDABApproval {approvalId: 'hdab-irs-lmc-2026-001'})
  SET approvalLmc.name = 'IRS Approval — LMC Cross-Border Study',
      approvalLmc.status = 'APPROVED',
      approvalLmc.applicationId = appLmc.applicationId,
      approvalLmc.approvedAt = datetime('2026-02-20T11:00:00'),
      approvalLmc.validUntil = datetime('2027-02-20T23:59:59'),
      approvalLmc.permittedPurpose = 'SCIENTIFIC_RESEARCH',
      approvalLmc.conditions = ['Trust Center pseudonym resolution required', 'SPE aggregate-only output', 'Annual renewal review'],
      approvalLmc.hdabOfficer = 'Dr. Marie Dubois (Institut de Recherche Santé)',
      approvalLmc.ehdsArticle = 'EHDS Art. 51'
MERGE (approvalLmc)-[:APPROVES]->(appLmc)
MERGE (approvalLmc)-[:GRANTS_ACCESS_TO]->(synthea);

// ── 5. Institut de Recherche Santé — PARTIAL (application rejected) ───────
MATCH (irs:Participant {participantId: 'did:web:irs.fr:hdab'})
MATCH (medreg:Participant {participantId: 'did:web:medreg.de:hdab'})

MERGE (appIrs:AccessApplication {applicationId: 'app-irs-medreg-2026-001'})
  SET appIrs.name = 'IRS Registry Linkage Request',
      appIrs.applicantId = irs.participantId,
      appIrs.datasetId = 'dataset:prostate-cancer-registry',
      appIrs.requestedPurpose = 'PUBLIC_HEALTH',
      appIrs.submittedAt = datetime('2026-01-20T14:00:00'),
      appIrs.status = 'REJECTED',
      appIrs.justification = 'Cross-border cancer registry linkage for EU-wide incidence analysis.',
      appIrs.ethicsCommitteeRef = 'EC-IRS-2025-189',
      appIrs.dataMinimisationStatement = 'Aggregated incidence rates only.'
MERGE (irs)-[:SUBMITTED]->(appIrs)
MERGE (medreg)-[:REVIEWED]->(appIrs)

MERGE (rejectedApproval:HDABApproval {approvalId: 'hdab-medreg-irs-2026-001'})
  SET rejectedApproval.name = 'MedReg Decision — IRS Registry Linkage (Denied)',
      rejectedApproval.status = 'REJECTED',
      rejectedApproval.applicationId = appIrs.applicationId,
      rejectedApproval.approvedAt = datetime('2026-02-10T16:30:00'),
      rejectedApproval.permittedPurpose = 'NONE',
      rejectedApproval.conditions = ['Insufficient data minimisation plan', 'Ethics committee approval expired'],
      rejectedApproval.hdabOfficer = 'Dr. Klaus Weber (MedReg DE)',
      rejectedApproval.ehdsArticle = 'EHDS Art. 46'
MERGE (rejectedApproval)-[:APPROVES]->(appIrs);

// ── 6. MedReg DE — not an applicant (HDAB role, reviews others) ───────────
// MedReg is an HDAB authority — they review applications, not submit them.
// No chain needed, but we can note their governance role explicitly.

// ── 7. HealthGov — not an applicant (HDAB role) ──────────────────────────
// Same as MedReg — governance authority, not a data consumer.

// ── 8. Riverside General — PARTIAL (application under review) ─────────────
MATCH (riverside:Participant {participantId: 'did:web:riverside.example:participant'})
MATCH (medreg:Participant {participantId: 'did:web:medreg.de:hdab'})

MERGE (appRiverside:AccessApplication {applicationId: 'app-riverside-medreg-2026-001'})
  SET appRiverside.name = 'Riverside OMOP Analytics Access Request',
      appRiverside.applicantId = riverside.participantId,
      appRiverside.datasetId = 'dataset:omop-cdm-v54-analytics',
      appRiverside.requestedPurpose = 'SCIENTIFIC_RESEARCH',
      appRiverside.submittedAt = datetime('2026-04-01T09:00:00'),
      appRiverside.status = 'UNDER_REVIEW',
      appRiverside.justification = 'Retrospective observational study on cardiovascular outcomes in diabetic patients using OMOP CDM analytics.',
      appRiverside.ethicsCommitteeRef = 'EC-Riverside-2026-033',
      appRiverside.dataMinimisationStatement = 'Aggregate cohort-level statistics only; k-anonymity ≥ 5 enforced.'
MERGE (riverside)-[:SUBMITTED]->(appRiverside)
MERGE (medreg)-[:REVIEWED]->(appRiverside);

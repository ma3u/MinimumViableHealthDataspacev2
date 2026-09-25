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

// ── PharmaCo's pending application (issue #206, M2) ──────────────────────────
// The researcher persona is PharmaCo. Journey step 4b needs an undecided
// application for the HDAB to decide on; on stacks where the older
// app-medreg-2025-001 never seeded (Azure), PharmaCo had none at all.
// Adopted numbering: Art. 67 application, Art. 68 permit, Art. 68(4) clock.
MATCH (pharmaco:Participant {participantId: 'did:web:pharmaco.de:research'})
MATCH (medreg:Participant {participantId: 'did:web:medreg.de:hdab'})
MERGE (appPharma:AccessApplication {applicationId: 'app-pharmaco-medreg-2026-002'})
  SET appPharma.name = 'PharmaCo T2D Outcomes Study',
      appPharma.applicantId = pharmaco.participantId,
      appPharma.datasetId = 'dataset:synthea-fhir-r4-mvd',
      appPharma.requestedPurpose = 'SCIENTIFIC_RESEARCH',
      appPharma.submittedAt = datetime('2026-09-01T09:00:00'),
      appPharma.decisionDue = datetime('2026-12-01T09:00:00'),
      appPharma.status = 'PENDING',
      appPharma.justification = 'Real-world outcomes of second-line type 2 diabetes therapies; pseudonymised cohort analysis in the SPE, aggregate output only.',
      appPharma.ethicsCommitteeRef = 'EC-PharmaCo-2026-011',
      appPharma.dataMinimisationStatement = 'Cohort restricted to adults with a T2D diagnosis; no direct identifiers leave the SPE.',
      appPharma.processingPeriodMonths = 12,
      // The eleven items of Art. 67(2) (issue #206, M1)
      appPharma.applicantCategory = 'COMMERCIAL',
      appPharma.namedPersons = 'PharmaCo Research AG (did:web:pharmaco.de:research); Dr A. Weber, principal investigator; M. Costa, data scientist',
      appPharma.intendedUse = 'Compare HbA1c trajectories and cardiovascular events between second-line therapies; expected benefit: evidence for treatment guidelines and post-marketing safety.',
      appPharma.requestedData = 'Adults with a type 2 diabetes diagnosis: encounters, conditions, HbA1c and lipid observations, medication requests; sources AlphaKlinik Berlin and Limburg Medical Centre; coverage: the full synthetic cohort.',
      appPharma.dataTimeRange = '2019-01-01 to 2026-08-31',
      appPharma.dataFormats = 'FHIR R4 (EEHRxF laboratory results), OMOP CDM 5.4',
      appPharma.identifiability = 'PSEUDONYMISED',
      appPharma.pseudonymisationJustification = 'Longitudinal linkage of the same person across encounters is needed for trajectories; anonymised snapshots would break it.',
      appPharma.datasetsBroughtIn = 'None',
      appPharma.safeguards = 'Analysis only in the secure processing environment; no record leaves it; aggregate output with counts below five suppressed; no re-identification attempt (Art. 61(2)).',
      appPharma.speTools = 'R 4.4 with the OHDSI HADES packages, 4 vCPU, 16 GB RAM',
      appPharma.art71Exception = false,
      appPharma.complete = true,
      appPharma.ehdsArticle = 'Art. 67'
MERGE (pharmaco)-[:SUBMITTED]->(appPharma)
MERGE (medreg)-[:REVIEWED]->(appPharma)
WITH appPharma
MATCH (synthea:HealthDataset {datasetId: 'dataset:synthea-fhir-r4-mvd'})
MERGE (appPharma)-[:REQUESTS]->(synthea);

// ── PharmaCo's incomplete application (issue #206, M2, Art. 68(4)) ───────────
// Filed without the named persons and the SPE tools; MedReg DE sent it back
// on 15 September 2026 with four weeks to complete. The three-month clock is
// stopped until the complete application arrives.
MATCH (pharmaco:Participant {participantId: 'did:web:pharmaco.de:research'})
MATCH (medreg:Participant {participantId: 'did:web:medreg.de:hdab'})
MERGE (appInc:AccessApplication {applicationId: 'app-pharmaco-medreg-2026-003'})
  SET appInc.name = 'PharmaCo statin adherence and LDL outcomes',
      appInc.applicantId = pharmaco.participantId,
      appInc.applicantCategory = 'COMMERCIAL',
      appInc.datasetId = 'dataset:omop-cdm-v54-analytics',
      appInc.requestedPurpose = 'SCIENTIFIC_RESEARCH',
      appInc.submittedAt = datetime('2026-09-10T10:00:00'),
      appInc.decisionDue = datetime('2026-12-10T10:00:00'),
      appInc.status = CASE WHEN appInc.status IS NULL OR appInc.status = 'PENDING' THEN 'INCOMPLETE' ELSE appInc.status END,
      appInc.justification = 'Adherence to statin therapy and LDL cholesterol outcomes over three years; pseudonymised OMOP cohort in the SPE.',
      appInc.ethicsCommitteeRef = 'EC-PharmaCo-2026-014',
      appInc.processingPeriodMonths = 18,
      appInc.intendedUse = 'Quantify the LDL reduction achieved under real-world adherence; expected benefit: adherence support programmes.',
      appInc.requestedData = 'Adults with a statin drug exposure: drug exposures, LDL measurements, conditions; source AlphaKlinik Berlin; coverage: the OMOP warehouse.',
      appInc.dataTimeRange = '2021-01-01 to 2026-06-30',
      appInc.dataFormats = 'OMOP CDM 5.4',
      appInc.identifiability = 'PSEUDONYMISED',
      appInc.pseudonymisationJustification = 'Adherence is a per-person series of drug exposures over time.',
      appInc.datasetsBroughtIn = 'None',
      appInc.safeguards = 'Analysis only in the SPE; aggregate output with counts below five suppressed.',
      appInc.art71Exception = false,
      appInc.incompleteNoticeAt = datetime('2026-09-15T09:00:00'),
      appInc.incompleteReason = 'Missing: (a) the natural persons who will access the data; (i) the tools and computing resources in the secure processing environment (Art. 67(2))',
      appInc.incompleteNoticeBy = medreg.participantId,
      appInc.completeBy = datetime('2026-10-13T09:00:00'),
      appInc.complete = false,
      appInc.ehdsArticle = 'Art. 67'
MERGE (pharmaco)-[:SUBMITTED]->(appInc)
MERGE (medreg)-[:REVIEWED]->(appInc)
WITH appInc
MATCH (omop:HealthDataset {datasetId: 'dataset:omop-cdm-v54-analytics'})
MERGE (appInc)-[:REQUESTS]->(omop);

// ── PharmaCo's pending statistical request (issue #206, M5, Art. 69) ─────────
MATCH (pharmaco:Participant {participantId: 'did:web:pharmaco.de:research'})
MERGE (req:HealthDataRequest {requestId: 'req-pharmaco-20260901-demo'})
  SET req.applicantId = pharmaco.participantId,
      req.question = 'How many patients are there?',
      req.purpose = 'SCIENTIFIC_RESEARCH',
      req.datasetId = 'dataset:synthea-fhir-r4-mvd',
      req.statisticalContent = 'One count of the cohort, no breakdown.',
      req.safeguards = 'No record leaves the environment; counts below 5 are suppressed.',
      req.legalBasis = 'GDPR Art. 6(1)(e), Regulation (EU) 2025/327 Art. 53(1)',
      req.status = CASE WHEN req.status IS NULL THEN 'PENDING' ELSE req.status END,
      req.submittedAt = datetime('2026-09-01T09:30:00'),
      req.decisionDue = datetime('2026-12-01T09:30:00'),
      req.ehdsArticle = 'Art. 69'
MERGE (pharmaco)-[:SUBMITTED]->(req)
WITH req
MATCH (synthea:HealthDataset {datasetId: 'dataset:synthea-fhir-r4-mvd'})
MERGE (req)-[:REQUESTS]->(synthea);

// ── Art. 72: AlphaKlinik Berlin is a trusted data holder (issue #206, M7) ──
// It answers health data requests (Art. 69) on the datasets it offers under
// the access body's supervision; the decision is published like any other.
MATCH (alpha:Participant {participantId: 'did:web:alpha-klinik.de:participant'})
SET alpha.trustedHolder = true,
    alpha.trustedHolderSince = date('2026-09-01'),
    alpha.trustedHolderArticle = 'Art. 72',
    alpha.trustedHolderBy = 'did:web:medreg.de:hdab';

// ── Art. 62: the fee on the LMC permit; Art. 61(4): its results (M6, M7) ──
MATCH (lmcPermit:HDABApproval {approvalId: 'hdab-irs-lmc-2026-001'})
SET lmcPermit.feeEur = coalesce(lmcPermit.feeEur, 2410),
    lmcPermit.feeBodyEur = coalesce(lmcPermit.feeBodyEur, 1175),
    lmcPermit.feeHolderEur = coalesce(lmcPermit.feeHolderEur, 1235),
    lmcPermit.feeCategory = coalesce(lmcPermit.feeCategory, 'PUBLIC_SECTOR'),
    lmcPermit.feeReduction = coalesce(lmcPermit.feeReduction, 0.75)
WITH lmcPermit
MATCH (lmc:Participant {participantId: 'did:web:lmc.nl:clinic'})
MERGE (rc:ResultCommunication {resultId: 'result-lmc-irs-2026-001-20260901'})
  SET rc.permitId = lmcPermit.approvalId,
      rc.applicantId = lmc.participantId,
      rc.kind = 'PUBLICATION',
      rc.title = 'Readmission after cardiac surgery in a cross-border cohort: a synthetic-data feasibility study',
      rc.summary = 'Aggregate readmission rates by procedure and age band; no record left the secure processing environment.',
      rc.url = 'https://example.org/lmc/readmission-feasibility-2026',
      rc.communicatedAt = datetime('2026-09-01T10:00:00'),
      rc.deadline = lmcPermit.validUntil + duration({months: 18}),
      rc.onTime = true,
      rc.ehdsArticle = 'Art. 61(4)'
MERGE (rc)-[:RESULT_OF]->(lmcPermit)
MERGE (lmc)-[:COMMUNICATED]->(rc);

// =============================================================================
// Phase 2b: Register EHDS Verifiable Credentials in Neo4j Knowledge Graph
// =============================================================================
// Registers the EHDS credential metadata as VerifiableCredential nodes in
// the knowledge graph (Layer 1b), linked to Participant nodes via HOLDS_CREDENTIAL
// and to HealthDataset via ATTESTS_QUALITY.
//
// All 5 participants receive:
//   - MembershipCredential (dataspace membership)
//   - EHDSParticipantCredential (EHDS role attestation)
// Role-specific credentials:
//   - DataProcessingPurposeCredential (PharmaCo — DATA_USER)
//   - DataQualityLabelCredential (AlphaKlinik, LMC — DATA_HOLDERs)
//
// Idempotent (MERGE everywhere). Run after seed-ehds-credentials.sh:
//
//   cat neo4j/register-ehds-credentials.cypher | \
//     docker exec -i health-dataspace-neo4j \
//     cypher-shell -u neo4j -p healthdataspace
// =============================================================================

// ── 1. Schema constraints ────────────────────────────────────────────────────
CREATE CONSTRAINT vc_id IF NOT EXISTS FOR (vc:VerifiableCredential) REQUIRE vc.credentialId IS UNIQUE;
CREATE INDEX vc_type IF NOT EXISTS FOR (vc:VerifiableCredential) ON (vc.credentialType);

// ── 2. MembershipCredentials — all 5 participants ────────────────────────────

MERGE (vc:VerifiableCredential {credentialId: 'vc:membership:clinic-alphaklinik'})
SET vc.credentialType    = 'MembershipCredential',
    vc.issuerDid         = 'did:web:issuerservice%3A10016:issuer',
    vc.subjectDid        = 'did:web:identityhub%3A7083:clinic-alphaklinik',
    vc.format            = 'VC1_0_JWT',
    vc.status            = 'active',
    vc.membership        = 'health-dataspace-v2',
    vc.membershipType    = 'full',
    vc.membershipStartDate = date('2025-01-15'),
    vc.issuedAt          = datetime(),
    vc.expiresAt         = datetime() + duration('P365D');

MERGE (vc:VerifiableCredential {credentialId: 'vc:membership:cro-pharmaco'})
SET vc.credentialType    = 'MembershipCredential',
    vc.issuerDid         = 'did:web:issuerservice%3A10016:issuer',
    vc.subjectDid        = 'did:web:identityhub%3A7083:cro-pharmaco',
    vc.format            = 'VC1_0_JWT',
    vc.status            = 'active',
    vc.membership        = 'health-dataspace-v2',
    vc.membershipType    = 'full',
    vc.membershipStartDate = date('2025-02-01'),
    vc.issuedAt          = datetime(),
    vc.expiresAt         = datetime() + duration('P365D');

MERGE (vc:VerifiableCredential {credentialId: 'vc:membership:hdab-medreg'})
SET vc.credentialType    = 'MembershipCredential',
    vc.issuerDid         = 'did:web:issuerservice%3A10016:issuer',
    vc.subjectDid        = 'did:web:identityhub%3A7083:hdab-medreg',
    vc.format            = 'VC1_0_JWT',
    vc.status            = 'active',
    vc.membership        = 'health-dataspace-v2',
    vc.membershipType    = 'full',
    vc.membershipStartDate = date('2024-06-01'),
    vc.issuedAt          = datetime(),
    vc.expiresAt         = datetime() + duration('P365D');

MERGE (vc:VerifiableCredential {credentialId: 'vc:membership:clinic-lmc'})
SET vc.credentialType    = 'MembershipCredential',
    vc.issuerDid         = 'did:web:issuerservice%3A10016:issuer',
    vc.subjectDid        = 'did:web:identityhub%3A7083:clinic-lmc',
    vc.format            = 'VC1_0_JWT',
    vc.status            = 'active',
    vc.membership        = 'health-dataspace-v2',
    vc.membershipType    = 'full',
    vc.membershipStartDate = date('2025-03-01'),
    vc.issuedAt          = datetime(),
    vc.expiresAt         = datetime() + duration('P365D');

MERGE (vc:VerifiableCredential {credentialId: 'vc:membership:hdab-irs'})
SET vc.credentialType    = 'MembershipCredential',
    vc.issuerDid         = 'did:web:issuerservice%3A10016:issuer',
    vc.subjectDid        = 'did:web:identityhub%3A7083:hdab-irs',
    vc.format            = 'VC1_0_JWT',
    vc.status            = 'active',
    vc.membership        = 'health-dataspace-v2',
    vc.membershipType    = 'full',
    vc.membershipStartDate = date('2025-03-15'),
    vc.issuedAt          = datetime(),
    vc.expiresAt         = datetime() + duration('P365D');

// ── 3. EHDSParticipantCredentials — all 5 participants ───────────────────────

MERGE (vc:VerifiableCredential {credentialId: 'vc:ehds-participant:clinic-alphaklinik'})
SET vc.credentialType    = 'EHDSParticipantCredential',
    vc.issuerDid         = 'did:web:issuerservice%3A10016:issuer',
    vc.subjectDid        = 'did:web:identityhub%3A7083:clinic-alphaklinik',
    vc.format            = 'VC1_0_JWT',
    vc.status            = 'active',
    vc.hdabId            = 'hdab:medreg-de',
    vc.hdabName          = 'National Medicines Regulatory Authority (MedReg DE)',
    vc.participantRole   = 'DataHolder',
    vc.registrationDate  = date('2025-01-15'),
    vc.jurisdiction      = 'DE',
    vc.ehdsArticle       = 'Article 49',
    vc.issuedAt          = datetime(),
    vc.expiresAt         = datetime() + duration('P365D');

MERGE (vc:VerifiableCredential {credentialId: 'vc:ehds-participant:cro-pharmaco'})
SET vc.credentialType    = 'EHDSParticipantCredential',
    vc.issuerDid         = 'did:web:issuerservice%3A10016:issuer',
    vc.subjectDid        = 'did:web:identityhub%3A7083:cro-pharmaco',
    vc.format            = 'VC1_0_JWT',
    vc.status            = 'active',
    vc.hdabId            = 'hdab:medreg-de',
    vc.hdabName          = 'National Medicines Regulatory Authority (MedReg DE)',
    vc.participantRole   = 'DataUser',
    vc.registrationDate  = date('2025-02-01'),
    vc.jurisdiction      = 'DE',
    vc.ehdsArticle       = 'Article 46',
    vc.issuedAt          = datetime(),
    vc.expiresAt         = datetime() + duration('P365D');

MERGE (vc:VerifiableCredential {credentialId: 'vc:ehds-participant:hdab-medreg'})
SET vc.credentialType    = 'EHDSParticipantCredential',
    vc.issuerDid         = 'did:web:issuerservice%3A10016:issuer',
    vc.subjectDid        = 'did:web:identityhub%3A7083:hdab-medreg',
    vc.format            = 'VC1_0_JWT',
    vc.status            = 'active',
    vc.hdabId            = 'hdab:medreg-de',
    vc.hdabName          = 'National Medicines Regulatory Authority (MedReg DE)',
    vc.participantRole   = 'HealthDataAccessBody',
    vc.registrationDate  = date('2024-06-01'),
    vc.jurisdiction      = 'DE',
    vc.ehdsArticle       = 'Article 36',
    vc.issuedAt          = datetime(),
    vc.expiresAt         = datetime() + duration('P365D');

MERGE (vc:VerifiableCredential {credentialId: 'vc:ehds-participant:clinic-lmc'})
SET vc.credentialType    = 'EHDSParticipantCredential',
    vc.issuerDid         = 'did:web:issuerservice%3A10016:issuer',
    vc.subjectDid        = 'did:web:identityhub%3A7083:clinic-lmc',
    vc.format            = 'VC1_0_JWT',
    vc.status            = 'active',
    vc.hdabId            = 'hdab:medreg-de',
    vc.hdabName          = 'National Medicines Regulatory Authority (MedReg DE)',
    vc.participantRole   = 'DataHolder',
    vc.registrationDate  = date('2025-03-01'),
    vc.jurisdiction      = 'NL',
    vc.ehdsArticle       = 'Article 49',
    vc.issuedAt          = datetime(),
    vc.expiresAt         = datetime() + duration('P365D');

MERGE (vc:VerifiableCredential {credentialId: 'vc:ehds-participant:hdab-irs'})
SET vc.credentialType    = 'EHDSParticipantCredential',
    vc.issuerDid         = 'did:web:issuerservice%3A10016:issuer',
    vc.subjectDid        = 'did:web:identityhub%3A7083:hdab-irs',
    vc.format            = 'VC1_0_JWT',
    vc.status            = 'active',
    vc.hdabId            = 'hdab:irs-fr',
    vc.hdabName          = 'Institut de Recherche Santé (IRS FR)',
    vc.participantRole   = 'HealthDataAccessBody',
    vc.registrationDate  = date('2025-03-15'),
    vc.jurisdiction      = 'FR',
    vc.ehdsArticle       = 'Article 36',
    vc.issuedAt          = datetime(),
    vc.expiresAt         = datetime() + duration('P365D');

// ── 4. DataProcessingPurposeCredential — PharmaCo Research AG (DATA_USER) ────
MERGE (vc:VerifiableCredential {credentialId: 'vc:data-processing-purpose:cro-pharmaco'})
SET vc.credentialType    = 'DataProcessingPurposeCredential',
    vc.issuerDid         = 'did:web:issuerservice%3A10016:issuer',
    vc.subjectDid        = 'did:web:identityhub%3A7083:cro-pharmaco',
    vc.format            = 'VC1_0_JWT',
    vc.status            = 'active',
    vc.purpose           = 'Scientific research on therapeutic outcomes',
    vc.ehdsArticle       = 'Article 53',
    vc.permittedUses     = 'scientific-research,statistics,public-health-monitoring,education,ai-training',
    vc.prohibitedUses    = 're-identification,commercial-exploitation,insurance-decisions,advertising',
    vc.approvalId        = 'hdab-approval-alpha-klinik-diab',
    vc.validUntil        = date('2026-06-30'),
    vc.issuedAt          = datetime(),
    vc.expiresAt         = datetime() + duration('P90D');

// ── 5. DataQualityLabelCredentials — DATA_HOLDER clinics ─────────────────────

MERGE (vc:VerifiableCredential {credentialId: 'vc:data-quality-label:clinic-alphaklinik'})
SET vc.credentialType    = 'DataQualityLabelCredential',
    vc.issuerDid         = 'did:web:issuerservice%3A10016:issuer',
    vc.subjectDid        = 'did:web:identityhub%3A7083:clinic-alphaklinik',
    vc.format            = 'VC1_0_JWT',
    vc.status            = 'active',
    vc.datasetId         = 'dataset:synthea-fhir-r4-mvd',
    vc.completeness      = 0.95,
    vc.conformance       = 0.92,
    vc.timeliness        = 0.98,
    vc.eehrxfCoverage    = 'partial',
    vc.assessmentDate    = date('2025-07-24'),
    vc.assessor          = 'MedReg DE Quality Assessment Unit',
    vc.issuedAt          = datetime(),
    vc.expiresAt         = datetime() + duration('P180D');

MERGE (vc:VerifiableCredential {credentialId: 'vc:data-quality-label:clinic-lmc'})
SET vc.credentialType    = 'DataQualityLabelCredential',
    vc.issuerDid         = 'did:web:issuerservice%3A10016:issuer',
    vc.subjectDid        = 'did:web:identityhub%3A7083:clinic-lmc',
    vc.format            = 'VC1_0_JWT',
    vc.status            = 'active',
    vc.datasetId         = 'dataset:prostate-cancer-registry',
    vc.completeness      = 0.88,
    vc.conformance       = 0.90,
    vc.timeliness        = 0.94,
    vc.eehrxfCoverage    = 'full',
    vc.assessmentDate    = date('2025-08-10'),
    vc.assessor          = 'MedReg DE Quality Assessment Unit',
    vc.issuedAt          = datetime(),
    vc.expiresAt         = datetime() + duration('P180D');

// ── 6. Link credentials to Participants via HOLDS_CREDENTIAL ─────────────────
// Match by participant name (unique) to avoid ambiguity with shared types

MATCH (p:Participant {name: 'AlphaKlinik Berlin'})
MATCH (vc:VerifiableCredential)
WHERE vc.subjectDid CONTAINS 'clinic-alphaklinik'
MERGE (p)-[:HOLDS_CREDENTIAL]->(vc);

MATCH (p:Participant {name: 'PharmaCo Research AG'})
MATCH (vc:VerifiableCredential)
WHERE vc.subjectDid CONTAINS 'cro-pharmaco'
MERGE (p)-[:HOLDS_CREDENTIAL]->(vc);

MATCH (p:Participant {name: 'MedReg DE'})
MATCH (vc:VerifiableCredential)
WHERE vc.subjectDid CONTAINS 'hdab-medreg'
MERGE (p)-[:HOLDS_CREDENTIAL]->(vc);

MATCH (p:Participant {name: 'Limburg Medical Centre'})
MATCH (vc:VerifiableCredential)
WHERE vc.subjectDid CONTAINS 'clinic-lmc'
MERGE (p)-[:HOLDS_CREDENTIAL]->(vc);

MATCH (p:Participant {name: 'Institut de Recherche Santé'})
MATCH (vc:VerifiableCredential)
WHERE vc.subjectDid CONTAINS 'hdab-irs'
MERGE (p)-[:HOLDS_CREDENTIAL]->(vc);

// ── 7. Link DataQualityLabelCredentials to HealthDatasets ────────────────────
MATCH (vc:VerifiableCredential {credentialId: 'vc:data-quality-label:clinic-alphaklinik'})
MATCH (ds:HealthDataset {datasetId: 'dataset:synthea-fhir-r4-mvd'})
MERGE (vc)-[:ATTESTS_QUALITY]->(ds);

MATCH (vc:VerifiableCredential {credentialId: 'vc:data-quality-label:clinic-lmc'})
MATCH (ds:HealthDataset)
WHERE ds.id = 'dataset:prostate-cancer-registry'
MERGE (vc)-[:ATTESTS_QUALITY]->(ds);

// ── 8. Link DataProcessingPurposeCredential to HDABApproval ──────────────────
MATCH (vc:VerifiableCredential {credentialId: 'vc:data-processing-purpose:cro-pharmaco'})
OPTIONAL MATCH (ha:HDABApproval)
WHERE ha.approvalId CONTAINS 'alpha-klinik'
WITH vc, ha WHERE ha IS NOT NULL
MERGE (vc)-[:AUTHORIZED_BY]->(ha);

// ── 9. Report ────────────────────────────────────────────────────────────────
MATCH (vc:VerifiableCredential)
OPTIONAL MATCH (p)-[:HOLDS_CREDENTIAL]->(vc)
RETURN vc.credentialType AS type,
       vc.subjectDid AS subject,
       vc.status AS status,
       vc.participantRole AS role,
       p.name AS holderName
ORDER BY vc.credentialType, vc.subjectDid;

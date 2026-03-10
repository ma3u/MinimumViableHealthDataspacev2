// =============================================================================
// Phase 2b: Register EHDS Verifiable Credentials in Neo4j Knowledge Graph
// =============================================================================
// Registers the EHDS credential metadata as VerifiableCredential nodes in
// the knowledge graph (Layer 1b), linked to Participant nodes via HOLDS_CREDENTIAL
// and to HealthDataset via ATTESTS_QUALITY.
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

// ── 2. EHDSParticipantCredential — Clinic Charité (DataHolder) ───────────────
MERGE (vc:VerifiableCredential {credentialId: 'vc:ehds-participant:clinic-charite'})
SET vc.credentialType    = 'EHDSParticipantCredential',
    vc.issuerDid         = 'did:web:issuerservice%3A10016:issuer',
    vc.subjectDid        = 'did:web:identityhub%3A7083:clinic-charite',
    vc.format            = 'VC1_0_JWT',
    vc.status            = 'active',
    vc.hdabId            = 'hdab:bfarm-de',
    vc.hdabName          = 'Bundesinstitut für Arzneimittel und Medizinprodukte (BfArM)',
    vc.participantRole   = 'DataHolder',
    vc.registrationDate  = date('2025-01-15'),
    vc.jurisdiction      = 'DE',
    vc.ehdsArticle       = 'Article 49',
    vc.issuedAt          = datetime(),
    vc.expiresAt         = datetime() + duration('P365D');

// ── 3. EHDSParticipantCredential — CRO Bayer (DataUser) ─────────────────────
MERGE (vc:VerifiableCredential {credentialId: 'vc:ehds-participant:cro-bayer'})
SET vc.credentialType    = 'EHDSParticipantCredential',
    vc.issuerDid         = 'did:web:issuerservice%3A10016:issuer',
    vc.subjectDid        = 'did:web:identityhub%3A7083:cro-bayer',
    vc.format            = 'VC1_0_JWT',
    vc.status            = 'active',
    vc.hdabId            = 'hdab:bfarm-de',
    vc.hdabName          = 'Bundesinstitut für Arzneimittel und Medizinprodukte (BfArM)',
    vc.participantRole   = 'DataUser',
    vc.registrationDate  = date('2025-02-01'),
    vc.jurisdiction      = 'DE',
    vc.ehdsArticle       = 'Article 46',
    vc.issuedAt          = datetime(),
    vc.expiresAt         = datetime() + duration('P365D');

// ── 4. EHDSParticipantCredential — HDAB BfArM (Authority) ───────────────────
MERGE (vc:VerifiableCredential {credentialId: 'vc:ehds-participant:hdab-bfarm'})
SET vc.credentialType    = 'EHDSParticipantCredential',
    vc.issuerDid         = 'did:web:issuerservice%3A10016:issuer',
    vc.subjectDid        = 'did:web:identityhub%3A7083:hdab-bfarm',
    vc.format            = 'VC1_0_JWT',
    vc.status            = 'active',
    vc.hdabId            = 'hdab:bfarm-de',
    vc.hdabName          = 'Bundesinstitut für Arzneimittel und Medizinprodukte (BfArM)',
    vc.participantRole   = 'HealthDataAccessBody',
    vc.registrationDate  = date('2024-06-01'),
    vc.jurisdiction      = 'DE',
    vc.ehdsArticle       = 'Article 36',
    vc.issuedAt          = datetime(),
    vc.expiresAt         = datetime() + duration('P365D');

// ── 5. DataProcessingPurposeCredential — CRO Bayer ──────────────────────────
MERGE (vc:VerifiableCredential {credentialId: 'vc:data-processing-purpose:cro-bayer'})
SET vc.credentialType    = 'DataProcessingPurposeCredential',
    vc.issuerDid         = 'did:web:issuerservice%3A10016:issuer',
    vc.subjectDid        = 'did:web:identityhub%3A7083:cro-bayer',
    vc.format            = 'VC1_0_JWT',
    vc.status            = 'active',
    vc.purpose           = 'Scientific research on therapeutic outcomes',
    vc.ehdsArticle       = 'Article 53',
    vc.permittedUses     = 'scientific-research,statistics,public-health-monitoring,education,ai-training',
    vc.prohibitedUses    = 're-identification,commercial-exploitation,insurance-decisions,advertising',
    vc.approvalId        = 'hdab-approval-charite-diab',
    vc.validUntil        = date('2026-06-30'),
    vc.issuedAt          = datetime(),
    vc.expiresAt         = datetime() + duration('P90D');

// ── 6. DataQualityLabelCredential — Clinic Charité ──────────────────────────
MERGE (vc:VerifiableCredential {credentialId: 'vc:data-quality-label:clinic-charite'})
SET vc.credentialType    = 'DataQualityLabelCredential',
    vc.issuerDid         = 'did:web:issuerservice%3A10016:issuer',
    vc.subjectDid        = 'did:web:identityhub%3A7083:clinic-charite',
    vc.format            = 'VC1_0_JWT',
    vc.status            = 'active',
    vc.datasetId         = 'dataset:synthea-fhir-r4-mvd',
    vc.completeness      = 0.95,
    vc.conformance       = 0.92,
    vc.timeliness        = 0.98,
    vc.eehrxfCoverage    = 'partial',
    vc.assessmentDate    = date('2025-07-24'),
    vc.assessor          = 'BfArM Quality Assessment Unit',
    vc.issuedAt          = datetime(),
    vc.expiresAt         = datetime() + duration('P180D');

// ── 7. Link credentials to Participants via HOLDS_CREDENTIAL ─────────────────

// Find marketplace Participants and link them to their credentials
MATCH (p:Participant)
WHERE p.participantType = 'CLINIC'
MATCH (vc:VerifiableCredential)
WHERE vc.subjectDid CONTAINS 'clinic-charite'
MERGE (p)-[:HOLDS_CREDENTIAL]->(vc);

MATCH (p:Participant)
WHERE p.participantType = 'CRO'
MATCH (vc:VerifiableCredential)
WHERE vc.subjectDid CONTAINS 'cro-bayer'
MERGE (p)-[:HOLDS_CREDENTIAL]->(vc);

MATCH (p:Participant)
WHERE p.participantType = 'HDAB'
MATCH (vc:VerifiableCredential)
WHERE vc.subjectDid CONTAINS 'hdab-bfarm'
MERGE (p)-[:HOLDS_CREDENTIAL]->(vc);

// ── 8. Link DataQualityLabelCredential to HealthDataset ──────────────────────
MATCH (vc:VerifiableCredential {credentialId: 'vc:data-quality-label:clinic-charite'})
MATCH (ds:HealthDataset {datasetId: 'dataset:synthea-fhir-r4-mvd'})
MERGE (vc)-[:ATTESTS_QUALITY]->(ds);

// ── 9. Link DataProcessingPurposeCredential to HDABApproval ──────────────────
MATCH (vc:VerifiableCredential {credentialId: 'vc:data-processing-purpose:cro-bayer'})
OPTIONAL MATCH (ha:HDABApproval)
WHERE ha.approvalId CONTAINS 'charite'
WITH vc, ha WHERE ha IS NOT NULL
MERGE (vc)-[:AUTHORIZED_BY]->(ha);

// ── 10. Report ───────────────────────────────────────────────────────────────
MATCH (vc:VerifiableCredential)
OPTIONAL MATCH (p)-[:HOLDS_CREDENTIAL]->(vc)
RETURN vc.credentialType AS type,
       vc.subjectDid AS subject,
       vc.status AS status,
       vc.participantRole AS role,
       labels(p)[0] AS holderLabel
ORDER BY vc.credentialType, vc.subjectDid;

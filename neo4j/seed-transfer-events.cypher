// ============================================================
// Seed enriched TransferEvent nodes with relationships
// Links: consumer, provider, contract, dataset
// Run AFTER insert-synthetic-schema-data.cypher and seed-audit-provenance.cypher
// ============================================================

// ── Step 1: Delete bare TransferEvent nodes (proxy-generated HTTP logs) ──
// These have no business context — replace with enriched demo data
MATCH (te:TransferEvent)
WHERE te.participant = 'unknown' OR te.participant IS NULL
DETACH DELETE te;

// ── Step 2: Seed enriched TransferEvent nodes with full audit trail ──────

// Transfer Event 1: PharmaCo queries FHIR patients under T2D contract
MERGE (te:TransferEvent {eventId: 'te-001'})
ON CREATE SET
  te.name = 'PharmaCo queries T2D patients',
  te.endpoint = '/fhir/Patient',
  te.method = 'GET',
  te.timestamp = datetime('2026-02-15T09:30:00Z'),
  te.statusCode = 200,
  te.resultCount = 42,
  te.protocol = 'HTTP-PULL',
  te.contentType = 'application/fhir+json',
  te.responseBytes = 125000,
  te.duration = 340,
  te.consumerDid = 'did:web:pharmaco.de:research',
  te.providerDid = 'did:web:alpha-klinik.de:participant',
  te.contractId = 'contract-ehds-53-pharmaco-alphaklinik-001',
  te.datasetId = 'urn:uuid:alphaklinik:dataset:diab-001',
  te.purpose = 'SCIENTIFIC_RESEARCH';

// Transfer Event 2: PharmaCo queries OMOP cohort statistics
MERGE (te:TransferEvent {eventId: 'te-002'})
ON CREATE SET
  te.name = 'PharmaCo queries OMOP cohort',
  te.endpoint = '/omop/cohort',
  te.method = 'GET',
  te.timestamp = datetime('2026-02-15T09:32:00Z'),
  te.statusCode = 200,
  te.resultCount = 127,
  te.protocol = 'HTTP-PULL',
  te.contentType = 'application/json',
  te.responseBytes = 45000,
  te.duration = 210,
  te.consumerDid = 'did:web:pharmaco.de:research',
  te.providerDid = 'did:web:alpha-klinik.de:participant',
  te.contractId = 'contract-ehds-53-pharmaco-alphaklinik-001',
  te.datasetId = 'urn:uuid:alphaklinik:dataset:diab-001',
  te.purpose = 'SCIENTIFIC_RESEARCH';

// Transfer Event 3: IRS queries federated stats (cross-border)
MERGE (te:TransferEvent {eventId: 'te-003'})
ON CREATE SET
  te.name = 'IRS federated stats query',
  te.endpoint = '/federated/stats',
  te.method = 'GET',
  te.timestamp = datetime('2026-02-20T14:10:00Z'),
  te.statusCode = 200,
  te.resultCount = 3,
  te.protocol = 'HTTP-PULL',
  te.contentType = 'application/json',
  te.responseBytes = 8200,
  te.duration = 1200,
  te.consumerDid = 'did:web:irs.fr:hdab',
  te.providerDid = 'did:web:alpha-klinik.de:participant',
  te.contractId = 'contract-ehds-53-synthea-2026',
  te.datasetId = 'urn:uuid:alphaklinik:dataset:diab-001',
  te.purpose = 'PUBLIC_HEALTH_MONITORING';

// Transfer Event 4: LMC pulls FHIR patient bundle
MERGE (te:TransferEvent {eventId: 'te-004'})
ON CREATE SET
  te.name = 'LMC pulls patient bundle',
  te.endpoint = '/fhir/Patient/P001/$everything',
  te.method = 'GET',
  te.timestamp = datetime('2026-03-01T11:45:00Z'),
  te.statusCode = 200,
  te.resultCount = 1,
  te.protocol = 'HTTP-PULL',
  te.contentType = 'application/fhir+json',
  te.responseBytes = 340000,
  te.duration = 890,
  te.consumerDid = 'did:web:lmc.nl:clinic',
  te.providerDid = 'did:web:alpha-klinik.de:participant',
  te.contractId = 'contract-ehds-53-pharmaco-alphaklinik-001',
  te.datasetId = 'dataset:synthea-fhir-r4-mvd',
  te.purpose = 'CONTINUITY_OF_CARE';

// Transfer Event 5: PharmaCo pushes results back (SPE output)
MERGE (te:TransferEvent {eventId: 'te-005'})
ON CREATE SET
  te.name = 'PharmaCo SPE result push',
  te.endpoint = '/spe/results',
  te.method = 'POST',
  te.timestamp = datetime('2026-03-05T16:20:00Z'),
  te.statusCode = 201,
  te.resultCount = 1,
  te.protocol = 'HTTP-PUSH',
  te.contentType = 'application/json',
  te.responseBytes = 2100,
  te.duration = 150,
  te.consumerDid = 'did:web:alpha-klinik.de:participant',
  te.providerDid = 'did:web:pharmaco.de:research',
  te.contractId = 'contract-ehds-53-pharmaco-alphaklinik-001',
  te.datasetId = 'urn:uuid:alphaklinik:dataset:diab-001',
  te.purpose = 'SCIENTIFIC_RESEARCH';

// Transfer Event 6: Failed query — unauthorized access attempt
MERGE (te:TransferEvent {eventId: 'te-006'})
ON CREATE SET
  te.name = 'Unauthorized access attempt',
  te.endpoint = '/fhir/Patient',
  te.method = 'GET',
  te.timestamp = datetime('2026-03-10T08:05:00Z'),
  te.statusCode = 403,
  te.resultCount = 0,
  te.protocol = 'HTTP-PULL',
  te.contentType = 'application/json',
  te.responseBytes = 120,
  te.duration = 15,
  te.consumerDid = 'did:web:unknown-org.com:research',
  te.providerDid = 'did:web:alpha-klinik.de:participant',
  te.errorMessage = 'No valid contract for requested dataset',
  te.purpose = 'UNKNOWN';

// Transfer Event 7: PharmaCo NLQ query
MERGE (te:TransferEvent {eventId: 'te-007'})
ON CREATE SET
  te.name = 'PharmaCo NLQ diabetes query',
  te.endpoint = '/nlq',
  te.method = 'POST',
  te.timestamp = datetime('2026-03-10T20:16:00Z'),
  te.statusCode = 200,
  te.resultCount = 10,
  te.protocol = 'HTTP-PUSH',
  te.contentType = 'application/json',
  te.responseBytes = 15600,
  te.duration = 3200,
  te.consumerDid = 'did:web:pharmaco.de:research',
  te.providerDid = 'did:web:alpha-klinik.de:participant',
  te.contractId = 'contract-t2d-pharmaco',
  te.datasetId = 'ds-t2d-cohort',
  te.purpose = 'SCIENTIFIC_RESEARCH';

// Transfer Event 8: LMC catalog browse
MERGE (te:TransferEvent {eventId: 'te-008'})
ON CREATE SET
  te.name = 'LMC browses dataset catalog',
  te.endpoint = '/catalog/datasets',
  te.method = 'GET',
  te.timestamp = datetime('2026-03-12T10:00:00Z'),
  te.statusCode = 200,
  te.resultCount = 5,
  te.protocol = 'HTTP-PULL',
  te.contentType = 'application/json',
  te.responseBytes = 22000,
  te.duration = 180,
  te.consumerDid = 'did:web:lmc.nl:clinic',
  te.providerDid = 'did:web:alpha-klinik.de:participant',
  te.purpose = 'DATA_DISCOVERY';

// ── Step 3: Create relationships from TransferEvent to Participants ──────

// Link to consumer (who accessed the data)
MATCH (te:TransferEvent), (p:Participant)
WHERE te.consumerDid IS NOT NULL
  AND p.participantId = te.consumerDid
MERGE (te)-[:REQUESTED_BY]->(p);

// Link to provider (who provided the data)
MATCH (te:TransferEvent), (p:Participant)
WHERE te.providerDid IS NOT NULL
  AND p.participantId = te.providerDid
MERGE (te)-[:PROVIDED_BY]->(p);

// ── Step 4: Link to contracts ───────────────────────────────────────────

MATCH (te:TransferEvent), (c:Contract)
WHERE te.contractId IS NOT NULL
  AND c.contractId = te.contractId
MERGE (te)-[:UNDER]->(c);

// ── Step 5: Link to datasets ────────────────────────────────────────────

MATCH (te:TransferEvent), (ds:HealthDataset)
WHERE te.datasetId IS NOT NULL
  AND ds.datasetId = te.datasetId
MERGE (te)-[:ACCESSED]->(ds);

// ── Step 6: Link to DataTransfer (parent bulk transfer) ─────────────────

MATCH (te:TransferEvent), (dt:DataTransfer)
WHERE te.consumerDid = dt.consumerDid
  AND te.providerDid = dt.providerDid
MERGE (te)-[:PART_OF]->(dt);

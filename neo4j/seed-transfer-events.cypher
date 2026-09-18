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

// ── Step 3: Recent, fully detailed access events for the demo (issue #206) ──
// The proxy records every request it serves, but until 2026-09-18 the record
// carried the endpoint and the caller only, so /admin/audit showed no
// provider, dataset, bytes or permit. These events carry everything the
// Art. 73(1)(e) log should, are dated relative to the seed run so they stay
// on top of the list, and are refreshed on every seed (SET, not ON CREATE).
UNWIND [
  {id: 'te-demo-001', d: 0, h: 3,  ep: '/nlq',              m: 'POST', sc: 200, n: 1,    b: 412,     dur: 180, ct: 'application/json',      c: 'did:web:pharmaco.de:research',    p: 'did:web:alpha-klinik.de:participant', ds: 'dataset:synthea-fhir-r4-mvd',     permit: 'hdab-decision-medreg-2025-001', contract: 'contract-fhir-t2d-001', purpose: 'SCIENTIFIC_RESEARCH', name: 'PharmaCo counts the T2D cohort'},
  {id: 'te-demo-002', d: 0, h: 6,  ep: '/fhir/Patient',     m: 'GET',  sc: 200, n: 42,   b: 125000,  dur: 340, ct: 'application/fhir+json', c: 'did:web:pharmaco.de:research',    p: 'did:web:alpha-klinik.de:participant', ds: 'dataset:synthea-fhir-r4-mvd',     permit: 'hdab-decision-medreg-2025-001', contract: 'contract-fhir-t2d-001', purpose: 'SCIENTIFIC_RESEARCH', name: 'PharmaCo pulls the T2D patient bundle'},
  {id: 'te-demo-003', d: 1, h: 2,  ep: '/omop/cohort',      m: 'GET',  sc: 200, n: 127,  b: 45000,   dur: 210, ct: 'application/json',      c: 'did:web:pharmaco.de:research',    p: 'did:web:alpha-klinik.de:participant', ds: 'dataset:omop-cdm-v54-analytics',  permit: 'hdab-decision-medreg-2025-001', contract: 'contract-fhir-t2d-001', purpose: 'SCIENTIFIC_RESEARCH', name: 'PharmaCo reads OMOP cohort statistics'},
  {id: 'te-demo-004', d: 1, h: 9,  ep: '/federated/stats',  m: 'GET',  sc: 200, n: 2,    b: 3100,    dur: 620, ct: 'application/json',      c: 'did:web:lmc.nl:clinic',           p: 'did:web:alpha-klinik.de:participant', ds: 'dataset:synthea-fhir-r4-mvd',     permit: 'hdab-irs-lmc-2026-001',        contract: 'contract-fhir-t2d-002', purpose: 'SCIENTIFIC_RESEARCH', name: 'Limburg runs a federated count across two SPEs'},
  {id: 'te-demo-005', d: 2, h: 4,  ep: '/fhir/Patient/p-0117/$everything', m: 'GET', sc: 200, n: 1, b: 88600, dur: 410, ct: 'application/fhir+json', c: 'did:web:lmc.nl:clinic',    p: 'did:web:alpha-klinik.de:participant', ds: 'dataset:synthea-fhir-r4-mvd',     permit: 'hdab-irs-lmc-2026-001',        contract: 'contract-fhir-t2d-002', purpose: 'SCIENTIFIC_RESEARCH', name: 'Limburg reads one pseudonymised record'},
  {id: 'te-demo-006', d: 3, h: 1,  ep: '/nlq',              m: 'POST', sc: 200, n: 12,   b: 5200,    dur: 260, ct: 'application/json',      c: 'did:web:pharmaco.de:research',    p: 'did:web:alpha-klinik.de:participant', ds: 'dataset:omop-cdm-v54-analytics',  permit: 'hdab-decision-medreg-2025-001', contract: 'contract-fhir-t2d-001', purpose: 'SCIENTIFIC_RESEARCH', name: 'PharmaCo asks for medication counts by age band'},
  {id: 'te-demo-007', d: 4, h: 7,  ep: '/catalog/datasets', m: 'GET',  sc: 200, n: 10,   b: 24000,   dur: 90,  ct: 'application/json',      c: 'did:web:pharmaco.de:research',    p: 'did:web:alpha-klinik.de:participant', ds: 'dataset:synthea-fhir-r4-mvd',     permit: 'hdab-decision-medreg-2025-001', contract: null,                     purpose: 'SCIENTIFIC_RESEARCH', name: 'PharmaCo browses the national dataset catalogue'},
  {id: 'te-demo-008', d: 5, h: 5,  ep: '/fhir/Patient',     m: 'GET',  sc: 403, n: 0,    b: 180,     dur: 30,  ct: 'application/json',      c: 'did:web:irs.fr:hdab',             p: 'did:web:alpha-klinik.de:participant', ds: 'dataset:prostate-cancer-registry', permit: null,                             contract: null,                     purpose: 'PUBLIC_HEALTH',       name: 'IRS is refused: no permit for the registry'}
] AS e
MERGE (te:TransferEvent {eventId: e.id})
SET te.name = e.name,
    te.endpoint = e.ep,
    te.method = e.m,
    te.timestamp = datetime() - duration({days: e.d, hours: e.h}),
    te.statusCode = e.sc,
    te.resultCount = e.n,
    te.responseBytes = e.b,
    te.duration = e.dur,
    te.contentType = e.ct,
    te.protocol = 'HTTP-PULL',
    te.participant = e.c,
    te.consumerDid = e.c,
    te.providerDid = e.p,
    te.datasetId = e.ds,
    te.permitId = e.permit,
    te.contractId = e.contract,
    te.purpose = e.purpose,
    te.errorMessage = CASE WHEN e.sc = 403 THEN 'No data permit covers this access (Art. 61(1))' ELSE null END,
    te.demo = true
WITH te, e
OPTIONAL MATCH (c:Participant {participantId: e.c})
FOREACH (_ IN CASE WHEN c IS NOT NULL THEN [1] ELSE [] END | MERGE (te)-[:REQUESTED_BY]->(c))
WITH te, e
OPTIONAL MATCH (p:Participant {participantId: e.p})
FOREACH (_ IN CASE WHEN p IS NOT NULL THEN [1] ELSE [] END | MERGE (te)-[:PROVIDED_BY]->(p))
WITH te, e
OPTIONAL MATCH (ds:HealthDataset {datasetId: e.ds})
FOREACH (_ IN CASE WHEN ds IS NOT NULL THEN [1] ELSE [] END | MERGE (te)-[:ACCESSED]->(ds))
WITH te, e
OPTIONAL MATCH (permit:HDABApproval) WHERE e.permit IS NOT NULL AND permit.approvalId = e.permit
FOREACH (_ IN CASE WHEN permit IS NOT NULL THEN [1] ELSE [] END | MERGE (te)-[:UNDER_PERMIT]->(permit))
WITH te, e
OPTIONAL MATCH (ctr:Contract) WHERE e.contract IS NOT NULL AND ctr.contractId = e.contract
FOREACH (_ IN CASE WHEN ctr IS NOT NULL THEN [1] ELSE [] END | MERGE (te)-[:UNDER]->(ctr));

// ── Step 4: Name the callers the realm's usernames left as "unknown" ─────────
// Before 2026-09-18 the UI mapped only the demo usernames to DIDs, so events
// from the deployed realm (regulator@..., clinic@...) carry
// "did:web:unknown:<email>". The mapping now lives in ui/src/lib/odrl-engine.ts;
// this repairs the events recorded before it.
MATCH (te:TransferEvent)
WHERE te.participant STARTS WITH 'did:web:unknown:'
WITH te, CASE
  WHEN te.participant CONTAINS 'regulator-es@' THEN 'did:web:medreg.es:hdab'
  WHEN te.participant CONTAINS 'regulator@'    THEN 'did:web:medreg.de:hdab'
  WHEN te.participant CONTAINS 'lmc@'          THEN 'did:web:lmc.nl:clinic'
  WHEN te.participant CONTAINS 'admin@'
    OR te.participant CONTAINS 'clinic@'       THEN 'did:web:alpha-klinik.de:participant'
  ELSE te.participant END AS fixed
WHERE fixed <> te.participant
SET te.participant = fixed, te.consumerDid = fixed
WITH te, fixed
MATCH (c:Participant {participantId: fixed})
MERGE (te)-[:REQUESTED_BY]->(c);

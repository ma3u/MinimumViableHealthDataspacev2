// ==============================================================================
// Remove what the API collection's journeys leave on the live hub
// ==============================================================================
// Demo Smoke runs the Bruno collection against https://ehds.mabu.red after every
// push to main and each morning. Two of its folders walk a whole procedure and
// add to the graph each time:
//
//   07 Journey - Data permit   an application (named "Bruno: ..."), its permit,
//                              the results communicated under it, a finding
//                              with an information request, and the revocation
//   08 Journey - Data request  a data request (its question "Bruno: ...")
//
// Nothing removed them, so /compliance filled with identical PharmaCo rows,
// one revoked permit per run (2026-10-28: 165 applications, 152 requests).
// Demo Smoke now runs this after the collection, through the seed job
// (SEED_PHASE=api-cleanup); the first run also clears the backlog.
//
// What it removes is found from the run's own application and request, so
// seeded procedures stay. The audit trail is not touched: its entries are
// hash-chained (ADR-045) and keep recording that the runs happened.
// Idempotent: a second run finds nothing.
// ==============================================================================

// 1. The permit journey: the application and what hangs off its permit.
MATCH (app:AccessApplication)
WHERE app.name STARTS WITH 'Bruno:'
OPTIONAL MATCH (permit:HDABApproval)-[:APPROVES]->(app)
OPTIONAL MATCH (rc:ResultCommunication)-[:RESULT_OF]->(permit)
OPTIONAL MATCH (f:NonComplianceFinding)-[:CONCERNS|LED_TO]->(permit)
OPTIONAL MATCH (i:InformationRequest)-[:ABOUT]->(f)
WITH collect(DISTINCT app) + collect(DISTINCT permit) + collect(DISTINCT rc)
     + collect(DISTINCT f) + collect(DISTINCT i) AS nodes
UNWIND nodes AS n
DETACH DELETE n;

// 2. The request journey. Requests filed before 2026-10-28 carry the question
// without the "Bruno:" marker; the exact wording identifies them, and no seed
// uses it.
MATCH (r:HealthDataRequest)
WHERE r.question STARTS WITH 'Bruno:'
   OR r.question = 'How many patients with type 2 diabetes had an HbA1c above 9 percent in 2024?'
DETACH DELETE r;

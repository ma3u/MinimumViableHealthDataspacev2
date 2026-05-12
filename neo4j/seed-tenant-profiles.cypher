// =============================================================================
// Seed file: CFM Tenant Profiles + VPAs
// =============================================================================
// Backfills the :ParticipantProfile and :VPA nodes that the operator
// dashboard (ui/src/app/admin/tenants/page.tsx) expects when the CFM
// TenantManager is unreachable (e.g. Azure Container Apps, where there is no
// CFM running). In the JAD stack these come from the CFM REST API; here we
// materialise them in Neo4j so the Neo4j fallback in
// /api/admin/tenants returns realistic profile + VPA data.
//
// Per :Participant we MERGE one :ParticipantProfile and three :VPA nodes —
// the conventional CFM trio: cfm.connector, cfm.credentialservice,
// cfm.dataplane.
//
// Idempotent: safe to re-run after a Docker restart or demo reset.
// =============================================================================

// ── 1. Ensure all 8 tenant Participants exist with the fields the API reads ──
// (insert-synthetic-schema-data.cypher + seed-audit-provenance.cypher already
//  set name + participantType; we re-MERGE here so the file is self-contained
//  and can be run via SEED_PHASE=tenant-profiles-only on Azure without first
//  rebuilding the entire pipeline.)
MERGE (alpha:Participant {participantId: "did:web:alpha-klinik.de:participant"})
  ON CREATE SET alpha.name            = "AlphaKlinik Berlin",
                alpha.participantType = "CLINIC",
                alpha.country         = "DE";

MERGE (pharmaco:Participant {participantId: "did:web:pharmaco.de:research"})
  ON CREATE SET pharmaco.name            = "PharmaCo Research AG",
                pharmaco.participantType = "CRO",
                pharmaco.country         = "DE";

MERGE (medreg:Participant {participantId: "did:web:medreg.de:hdab"})
  ON CREATE SET medreg.name            = "MedReg DE",
                medreg.participantType = "HDAB",
                medreg.country         = "DE";

MERGE (lmc:Participant {participantId: "did:web:lmc.nl:clinic"})
  ON CREATE SET lmc.name            = "Limburg Medical Centre",
                lmc.participantType = "CLINIC",
                lmc.country         = "NL";

MERGE (irs:Participant {participantId: "did:web:irs.fr:hdab"})
  ON CREATE SET irs.name            = "Institut de Recherche Santé",
                irs.participantType = "HDAB",
                irs.country         = "FR";

MERGE (riverside:Participant {participantId: "did:web:riverside.example:participant"})
  ON CREATE SET riverside.name            = "Riverside General (CLINIC)",
                riverside.participantType = "CLINIC",
                riverside.country         = "DE";

MERGE (trialcorp:Participant {participantId: "did:web:trialcorp.example:research"})
  ON CREATE SET trialcorp.name            = "TrialCorp Research (CRO)",
                trialcorp.participantType = "CRO",
                trialcorp.country         = "DE";

MERGE (healthgov:Participant {participantId: "did:web:healthgov.example:hdab"})
  ON CREATE SET healthgov.name            = "HealthGov (HDAB)",
                healthgov.participantType = "HDAB",
                healthgov.country         = "DE";

// Dataspace operator — owns the EDC_ADMIN role in CFM_TO_EDC_ROLE (page.tsx).
// Without this 9th tenant the RBAC Summary "Administrators" tile reads 0 even
// though edcadmin Keycloak users exist (that tile counts orgs, not users).
MERGE (operations:Participant {participantId: "did:web:operations.ehds.example:dataspace"})
  ON CREATE SET operations.name            = "Health Dataspace Operations",
                operations.legalName       = "Health Dataspace Operations (Reference Implementation)",
                operations.participantType = "OPERATOR",
                operations.country         = "BE";

// ── 2. Helper data: per-participant profile + VPA seed via UNWIND ────────────
// One row per (participant, vpa-type). State is set per-row so we can mix
// "active" / "provisioning" / "disposed" across the fleet to exercise the
// dashboard's "Disposed VPAs" counter and the per-VPA badge logic.
//
// Convention:
//   profileId = "profile-" + slug
//   vpaId     = "vpa-" + slug + "-" + shortType   (shortType strips "cfm.")
//   role: provider (DATA_HOLDER), consumer (DATA_USER), operator (HDAB)
WITH [
  // ── Healthy / fully active fleet (5 tenants) ────────────────────────────
  {participantId: "did:web:alpha-klinik.de:participant",
   slug: "alpha-klinik", role: "provider",
   states: ["active", "active", "active"]},
  {participantId: "did:web:pharmaco.de:research",
   slug: "pharmaco",     role: "consumer",
   states: ["active", "active", "active"]},
  {participantId: "did:web:medreg.de:hdab",
   slug: "medreg",       role: "operator",
   states: ["active", "active", "active"]},
  {participantId: "did:web:lmc.nl:clinic",
   slug: "lmc",          role: "provider",
   states: ["active", "active", "active"]},
  {participantId: "did:web:irs.fr:hdab",
   slug: "irs",          role: "operator",
   states: ["active", "active", "active"]},
  // ── New Phase-26 tenants — one disposed pair to show non-zero in the UI ──
  {participantId: "did:web:healthgov.example:hdab",
   slug: "healthgov",    role: "operator",
   states: ["active", "active", "active"]},
  {participantId: "did:web:riverside.example:participant",
   slug: "riverside",    role: "provider",
   states: ["active", "provisioning", "active"]},
  {participantId: "did:web:trialcorp.example:research",
   slug: "trialcorp",    role: "consumer",
   states: ["disposed", "disposed", "disposed"]},
  // ── Dataspace operator — fills the EDC_ADMIN slot in RBAC Summary ───────
  {participantId: "did:web:operations.ehds.example:dataspace",
   slug: "operations",   role: "operator",
   states: ["active", "active", "active"]}
] AS tenants

UNWIND tenants AS t
MATCH (p:Participant {participantId: t.participantId})
MERGE (pp:ParticipantProfile {profileId: "profile-" + t.slug})
  ON CREATE SET pp.version          = 1,
                pp.tenantId         = t.participantId,
                pp.identifier       = t.participantId,
                pp.role             = t.role,
                pp.displayName      = p.name,
                pp.createdAt        = datetime()
  ON MATCH SET  pp.tenantId         = t.participantId,
                pp.identifier       = t.participantId,
                pp.role             = t.role,
                pp.displayName      = p.name
MERGE (pp)-[:OF_TENANT]->(p)

// Fan out to the three CFM VPA types using a per-row list so we can pin
// state[i] to type[i] deterministically.
WITH t, pp,
     ["cfm.connector", "cfm.credentialservice", "cfm.dataplane"] AS vpaTypes,
     ["connector", "credentialservice", "dataplane"] AS shortTypes
UNWIND range(0, size(vpaTypes) - 1) AS i
WITH t, pp, vpaTypes[i] AS vpaType, shortTypes[i] AS shortType, t.states[i] AS state
MERGE (v:VPA {vpaId: "vpa-" + t.slug + "-" + shortType})
  ON CREATE SET v.version         = 1,
                v.vpaType         = vpaType,
                v.state           = state,
                v.stateTimestamp  = datetime(),
                v.cellId          = "cell-mvhd-dev"
  ON MATCH SET  v.vpaType         = vpaType,
                v.state           = state,
                v.cellId          = "cell-mvhd-dev"
MERGE (v)-[:OF_PROFILE]->(pp);

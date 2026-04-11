import { runQuery } from "@/lib/neo4j";

const IS_STATIC = process.env.NEXT_PUBLIC_STATIC_EXPORT === "true";

/* ── Types ─────────────────────────────────────────────────────── */

export interface OdrlScope {
  participantId: string;
  participantName: string;
  permissions: string[];
  prohibitions: string[];
  accessibleDatasets: string[];
  temporalLimit: string | null;
  policyIds: string[];
  hasActiveContract: boolean;
  hdabApproved: boolean;
}

/* ── Participant mapping ───────────────────────────────────────── */

const USERNAME_TO_DID: Record<string, string> = {
  "admin@edc.demo": "did:web:alpha-klinik.de:participant",
  "dr.schmidt@alphaklinik.de": "did:web:alpha-klinik.de:participant",
  "nurse.weber@alphaklinik.de": "did:web:alpha-klinik.de:participant",
  "researcher@pharmaco.de": "did:web:pharmaco.de:research",
  "hdab.officer@medreg.de": "did:web:medreg.de:hdab",
  "dr.janssen@lmc.nl": "did:web:lmc.nl:clinic",
  "patient.mueller@demo.ehds": "did:web:alpha-klinik.de:participant",
  "tc.operator@medreg.de": "did:web:medreg.de:hdab",
};

/**
 * Map a session username + roles to the corresponding participant DID.
 * Falls back to a generic participant DID if no mapping exists.
 */
export function userToParticipantId(
  username: string,
  _roles: string[],
): string {
  return USERNAME_TO_DID[username] ?? `did:web:unknown:${username}`;
}

/* ── Static fallback ───────────────────────────────────────────── */

const STATIC_SCOPE: OdrlScope = {
  participantId: "did:web:pharmaco.de:research",
  participantName: "PharmaCo Research AG",
  permissions: [
    "scientific_research",
    "statistics",
    "policy_support",
    "education",
    "ai_training",
  ],
  prohibitions: [
    "re_identification",
    "commercial_exploitation_without_approval",
  ],
  accessibleDatasets: [
    "dataset-synthea-fhir-r4-2026",
    "dataset-synthea-omop-2026",
  ],
  temporalLimit: "2027-12-31T23:59:59",
  policyIds: ["policy-ehds-art53-synthetic-2026"],
  hasActiveContract: true,
  hdabApproved: true,
};

/* ── Core resolver ─────────────────────────────────────────────── */

/**
 * Resolve the effective ODRL scope for a participant.
 *
 * Walks the Neo4j graph:
 *   Participant → Contract → DataProduct → GOVERNED_BY → OdrlPolicy
 *   HDABApproval → GRANTS_ACCESS_TO → HealthDataset
 *
 * Returns the union of all permissions, prohibitions, and accessible
 * datasets for the caller's active contracts.
 */
export async function resolveOdrlScope(
  participantId: string,
): Promise<OdrlScope> {
  if (IS_STATIC) {
    return STATIC_SCOPE;
  }

  try {
    // Query the ODRL policy chain for this participant
    const rows = await runQuery<{
      participantName: string;
      policyId: string;
      permissions: string[];
      prohibitions: string[];
      temporalLimit: string | null;
      datasetId: string | null;
      contractStatus: string | null;
      approvalStatus: string | null;
    }>(
      `MATCH (p:Participant)
       WHERE p.participantId = $participantId
          OR p.did = $participantId
       OPTIONAL MATCH (p)-[:OFFERS|CONSUMES]->(:DataProduct)-[:GOVERNED_BY]->(pol:OdrlPolicy)
       OPTIONAL MATCH (p)-[:HAS_CONTRACT]->(c:Contract)-[:COVERS|GOVERNS]->(:DataProduct)-[:DESCRIBED_BY]->(ds:HealthDataset)
       OPTIONAL MATCH (approval:HDABApproval)-[:GRANTS_ACCESS_TO]->(ds)
       RETURN p.name AS participantName,
              pol.policyId AS policyId,
              coalesce(pol.ehdsPermissions, []) AS permissions,
              coalesce(pol.ehdsProhibitions, []) AS prohibitions,
              toString(pol.temporalLimit) AS temporalLimit,
              coalesce(ds.datasetId, ds.id) AS datasetId,
              c.status AS contractStatus,
              approval.status AS approvalStatus`,
      { participantId },
    );

    if (rows.length === 0) {
      return {
        participantId,
        participantName: participantId,
        permissions: [],
        prohibitions: [],
        accessibleDatasets: [],
        temporalLimit: null,
        policyIds: [],
        hasActiveContract: false,
        hdabApproved: false,
      };
    }

    // Aggregate across all matching rows
    const permissionSet = new Set<string>();
    const prohibitionSet = new Set<string>();
    const datasetSet = new Set<string>();
    const policySet = new Set<string>();
    let temporalLimit: string | null = null;
    let hasActiveContract = false;
    let hdabApproved = false;
    let participantName = participantId;

    for (const row of rows) {
      if (row.participantName) participantName = row.participantName;
      if (row.policyId) policySet.add(row.policyId);
      for (const p of row.permissions) permissionSet.add(p);
      for (const p of row.prohibitions) prohibitionSet.add(p);
      if (row.datasetId) datasetSet.add(row.datasetId);
      if (row.temporalLimit) temporalLimit = row.temporalLimit;
      if (row.contractStatus === "ACTIVE") hasActiveContract = true;
      if (row.approvalStatus === "approved") hdabApproved = true;
    }

    return {
      participantId,
      participantName,
      permissions: [...permissionSet],
      prohibitions: [...prohibitionSet],
      accessibleDatasets: [...datasetSet],
      temporalLimit,
      policyIds: [...policySet],
      hasActiveContract,
      hdabApproved,
    };
  } catch (err) {
    console.error("resolveOdrlScope error:", err);
    return {
      participantId,
      participantName: participantId,
      permissions: [],
      prohibitions: [],
      accessibleDatasets: [],
      temporalLimit: null,
      policyIds: [],
      hasActiveContract: false,
      hdabApproved: false,
    };
  }
}

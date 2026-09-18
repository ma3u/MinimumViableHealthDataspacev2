import { runQuery } from "@/lib/neo4j";
import { findPermits, type PermitRow } from "@/lib/permit-gate";
import { parseGraphTime } from "@/lib/permits";

const IS_STATIC = process.env.NEXT_PUBLIC_STATIC_EXPORT === "true";

/* ── Types ─────────────────────────────────────────────────────── */

/** A data permit the scope was derived from (Art. 68); only valid ones. */
export interface ScopePermit {
  permitId: string;
  datasetId: string | null;
  datasetTitle: string | null;
  purpose: string | null;
  validUntil: string | null;
}

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
  /**
   * The approved, unexpired data permits of the participant. Their datasets
   * are in accessibleDatasets, their purposes in permissions, the latest
   * validity end in temporalLimit (issue #206, M3). Empty for a participant
   * that never applied, for instance a data holder querying its own data.
   */
  permits: ScopePermit[];
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
  // The realm the deployments import (jad/keycloak-realm.json). Without these
  // the access log named the HDAB "did:web:unknown:regulator@..." (issue #205).
  "admin@health-dataspace.local": "did:web:alpha-klinik.de:participant",
  "clinic@health-dataspace.local": "did:web:alpha-klinik.de:participant",
  "lmc@limburg-mc.nl": "did:web:lmc.nl:clinic",
  "regulator@health-dataspace.local": "did:web:medreg.de:hdab",
  "regulator-es@health-dataspace.local": "did:web:medreg.es:hdab",
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
  permits: [
    {
      permitId: "hdab-decision-medreg-2025-001",
      datasetId: "dataset:synthea-fhir-r4-mvd",
      datasetTitle: "Synthea FHIR R4 cohort",
      purpose: "SCIENTIFIC_RESEARCH",
      validUntil: "2027-12-31T23:59:59",
    },
  ],
};

/** Neo4j's toString(datetime) has nine fractional digits; keep an ISO value. */
function isoOrNull(value: string | null | undefined): string | null {
  const t = parseGraphTime(value);
  return t === null ? null : new Date(t).toISOString();
}

/** The permits that still count: status APPROVED and not past validUntil. */
function validPermits(rows: PermitRow[], now: number): ScopePermit[] {
  return rows
    .filter((r) => r.status === "APPROVED")
    .filter((r) => {
      const t = parseGraphTime(r.validUntil);
      return t === null || t >= now;
    })
    .map((r) => ({
      permitId: r.permitId,
      datasetId: r.datasetId,
      datasetTitle: r.datasetTitle,
      purpose: r.purpose,
      validUntil: isoOrNull(r.validUntil),
    }));
}

function emptyScope(participantId: string): OdrlScope {
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
    permits: [],
  };
}

/* ── Core resolver ─────────────────────────────────────────────── */

/**
 * Resolve the effective ODRL scope for a participant.
 *
 * Walks the Neo4j graph:
 *   Participant → Contract → DataProduct → GOVERNED_BY → OdrlPolicy
 *   HDABApproval → GRANTS_ACCESS_TO → HealthDataset
 * and, since issue #206, the participant's own data permits:
 *   Participant → SUBMITTED → AccessApplication ← APPROVES ← HDABApproval
 *
 * Returns the union of all permissions, prohibitions, and accessible
 * datasets for the caller's active contracts and valid permits. A permit
 * the access body revoked or that has run out contributes nothing, so the
 * scope shrinks the moment the body acts (Art. 63(3), Art. 68(3)).
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

    const permits = validPermits(await findPermits(participantId), Date.now());

    if (rows.length === 0 && permits.length === 0) {
      return emptyScope(participantId);
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
      if ((row.approvalStatus ?? "").toUpperCase() === "APPROVED") {
        hdabApproved = true;
      }
    }

    // The permits decide what the data user may touch and until when. The
    // latest validity end of a valid permit is the period; a permit without
    // an end date leaves the policy's limit in place.
    if (permits.length > 0) {
      hdabApproved = true;
      for (const permit of permits) {
        if (permit.datasetId) datasetSet.add(permit.datasetId);
        if (permit.purpose) permissionSet.add(permit.purpose.toLowerCase());
      }
      const ends = permits
        .map((p) => p.validUntil)
        .filter((v): v is string => Boolean(v))
        .sort();
      if (ends.length > 0) temporalLimit = ends[ends.length - 1];
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
      permits,
    };
  } catch (err) {
    console.error("resolveOdrlScope error:", err);
    return emptyScope(participantId);
  }
}

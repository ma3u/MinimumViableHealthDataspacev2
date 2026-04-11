import { NextResponse } from "next/server";
import { runQuery } from "@/lib/neo4j";
import { requireAuth, isAuthError } from "@/lib/auth-guard";
import { Roles } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/trust-center
 *
 * Returns all active trust centers with governance chain and statistics.
 * Used by the compliance dashboard Trust Center section (Phase 18d).
 */
export async function GET() {
  const auth = await requireAuth([
    Roles.TRUST_CENTER_OPERATOR,
    Roles.EDC_ADMIN,
  ]);
  if (isAuthError(auth)) return auth;

  const trustCenters = await runQuery<{
    name: string;
    operatedBy: string;
    country: string;
    status: string;
    protocol: string;
    did: string;
    hdabApprovalId: string | null;
    hdabApprovalStatus: string | null;
    datasetCount: number;
    recognisedCountries: string[];
    activeRpsnCount: number;
  }>(
    `MATCH (tc:TrustCenter)
     OPTIONAL MATCH (tc)-[:GOVERNED_BY]->(ha:HDABApproval)
     OPTIONAL MATCH (tc)-[:RESOLVES_PSEUDONYMS_FOR]->(ds:HealthDataset)
     OPTIONAL MATCH (tc)-[:MUTUALLY_RECOGNISES]->(peer:TrustCenter)
     WITH tc, ha,
          count(DISTINCT ds)             AS datasetCount,
          collect(DISTINCT peer.country) AS recognisedCountries
     OPTIONAL MATCH (rp:ResearchPseudonym {revoked: false})
       WHERE rp.issuedBy = tc.did
     RETURN tc.name             AS name,
            tc.operatedBy      AS operatedBy,
            tc.country         AS country,
            tc.status          AS status,
            tc.protocol        AS protocol,
            tc.did             AS did,
            ha.approvalId      AS hdabApprovalId,
            ha.status          AS hdabApprovalStatus,
            datasetCount,
            recognisedCountries,
            count(rp)          AS activeRpsnCount
     ORDER BY tc.country`,
  );

  const speSessions = await runQuery<{
    sessionId: string;
    studyId: string;
    status: string;
    createdBy: string;
    createdAt: string;
    kAnonymityThreshold: number;
    outputPolicy: string;
  }>(
    `MATCH (ss:SPESession)
     RETURN ss.sessionId            AS sessionId,
            ss.studyId             AS studyId,
            ss.status              AS status,
            ss.createdBy           AS createdBy,
            ss.createdAt           AS createdAt,
            ss.kAnonymityThreshold AS kAnonymityThreshold,
            ss.outputPolicy        AS outputPolicy
     ORDER BY ss.createdAt DESC
     LIMIT 10`,
  );

  return NextResponse.json({ trustCenters, speSessions });
}

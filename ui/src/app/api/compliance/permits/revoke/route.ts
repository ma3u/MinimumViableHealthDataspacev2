import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthError } from "@/lib/auth-guard";
import { runQuery } from "@/lib/neo4j";
import { userToParticipantId } from "@/lib/odrl-engine";

export const dynamic = "force-dynamic";

/**
 * POST /api/compliance/permits/revoke: the access body revokes a data permit
 * (Regulation (EU) 2025/327, Art. 63(3)).
 *
 * A refusal of a later application changes nothing for a permit already
 * issued; only this does. The permit keeps its history (dataset grant,
 * criteria, conditions) and gets the revocation date, the reason and who
 * took the measure; the gate stops honouring it at once, and the public
 * register lists the measure (Art. 57(1)(j)(iv)). Issue #206, M4.
 */
export async function POST(req: NextRequest) {
  const auth = await requireAuth(["HDAB_AUTHORITY"]);
  if (isAuthError(auth)) return auth;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Body must be JSON" }, { status: 400 });
  }
  const permitId =
    typeof body.permitId === "string" ? body.permitId.trim() : "";
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  if (!permitId || !reason) {
    return NextResponse.json(
      {
        error:
          "permitId and a written reason are required: the measure is published with its justification (Art. 57(1)(j)(iv))",
      },
      { status: 400 },
    );
  }

  const { session } = auth;
  const revokedBy = userToParticipantId(
    session.user.email ?? session.user.name ?? session.user.id,
    session.roles,
  );
  const officer = session.user.name ?? session.user.email ?? session.user.id;
  const revokedAt = new Date();

  const rows = await runQuery<{
    permitId: string;
    applicationId: string | null;
    applicant: string | null;
    applicantName: string | null;
  }>(
    `MATCH (permit:HDABApproval {approvalId: $permitId})
     WHERE toUpper(coalesce(permit.status, '')) = 'APPROVED'
     OPTIONAL MATCH (permit)-[:APPROVES]->(app:AccessApplication)
     OPTIONAL MATCH (applicant:Participant)-[:SUBMITTED]->(app)
     SET permit.status            = 'REVOKED',
         permit.revokedAt         = datetime($revokedAt),
         permit.revocationReason  = $reason,
         permit.revokedBy         = $revokedBy,
         permit.revocationOfficer = $officer,
         permit.revocationArticle = 'Art. 63(3)',
         app.status               = 'REVOKED'
     RETURN permit.approvalId                              AS permitId,
            app.applicationId                              AS applicationId,
            coalesce(applicant.participantId, applicant.id) AS applicant,
            applicant.name                                 AS applicantName
     LIMIT 1`,
    {
      permitId,
      reason,
      revokedBy,
      officer,
      revokedAt: revokedAt.toISOString(),
    },
  );

  if (rows.length === 0) {
    return NextResponse.json(
      { error: `No approved data permit ${permitId} to revoke` },
      { status: 404 },
    );
  }
  const row = rows[0];
  return NextResponse.json({
    permitId,
    applicationId: row.applicationId,
    applicant: row.applicant,
    applicantName: row.applicantName,
    decision: "REVOKED",
    revokedAt: revokedAt.toISOString(),
    revokedBy,
    officer,
    reason,
    article: "Regulation (EU) 2025/327, Art. 63(3): data permit revoked",
  });
}

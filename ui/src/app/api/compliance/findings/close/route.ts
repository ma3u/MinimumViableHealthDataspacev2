import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthError } from "@/lib/auth-guard";
import { runQuery } from "@/lib/neo4j";
import { userToParticipantId } from "@/lib/odrl-engine";
import { MEASURES, type Measure } from "@/lib/supervision";

export const dynamic = "force-dynamic";

/**
 * POST /api/compliance/findings/close: the access body closes a finding
 * with the measure it takes (Regulation (EU) 2025/327, Art. 63(3)): none,
 * a warning, revocation of the permit the finding concerns, exclusion from
 * access for a period, or an administrative fine (Art. 64). A revocation
 * takes effect here, on the permit, exactly as /permits/revoke does, so the
 * next transfer and query fail at once. The measure is published under
 * Art. 57(1)(j)(iv). Issue #206, M4.
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
  const findingId =
    typeof body.findingId === "string" ? body.findingId.trim() : "";
  const measure = String(body.measure ?? "").toUpperCase() as Measure;
  const note = typeof body.note === "string" ? body.note.trim() : "";
  if (!findingId || !MEASURES.includes(measure)) {
    return NextResponse.json(
      {
        error: `findingId and measure (${MEASURES.join(", ")}) are required`,
      },
      { status: 400 },
    );
  }
  if (measure !== "NONE" && !note) {
    return NextResponse.json(
      {
        error:
          "A measure needs a written reason: it is published (Art. 57(1)(j)(iv))",
      },
      { status: 400 },
    );
  }
  const exclusionMonths =
    measure === "EXCLUSION"
      ? Math.min(
          60,
          Math.max(1, Math.round(Number(body.exclusionMonths)) || 12),
        )
      : null;
  const fineEur =
    measure === "FINE"
      ? Math.max(0, Math.round(Number(body.fineEur)) || 0)
      : null;

  const { session } = auth;
  const officerDid = userToParticipantId(
    session.user.email ?? session.user.name ?? session.user.id,
    session.roles,
  );
  const officer = session.user.name ?? session.user.email ?? session.user.id;
  const closedAt = new Date();

  const rows = await runQuery<{
    findingId: string;
    permitId: string | null;
    permitStatus: string | null;
    partyName: string | null;
    wasOpen: boolean;
  }>(
    `MATCH (f:NonComplianceFinding {findingId: $findingId})
     OPTIONAL MATCH (f)-[:AGAINST]->(party:Participant)
     OPTIONAL MATCH (permit:HDABApproval {approvalId: f.permitId})
     WITH f, party, permit, toUpper(coalesce(f.status, '')) <> 'CLOSED' AS wasOpen
     SET f.status          = 'CLOSED',
         f.measure         = $measure,
         f.measureNote     = $note,
         f.exclusionMonths = $exclusionMonths,
         f.fineEur         = $fineEur,
         f.closedAt        = datetime($closedAt),
         f.closedBy        = $officerDid,
         f.measureArticle  = CASE $measure WHEN 'FINE' THEN 'Art. 64' WHEN 'NONE' THEN null ELSE 'Art. 63(3)' END
     WITH f, party, permit, wasOpen
     FOREACH (_ IN CASE WHEN $measure = 'REVOCATION' AND permit IS NOT NULL
                          AND toUpper(coalesce(permit.status, '')) = 'APPROVED' THEN [1] ELSE [] END |
       SET permit.status            = 'REVOKED',
           permit.revokedAt         = datetime($closedAt),
           permit.revocationReason  = $note,
           permit.revokedBy         = $officerDid,
           permit.revocationOfficer = $officer,
           permit.revocationArticle = 'Art. 63(3)',
           permit.revokedByFinding  = f.findingId
       MERGE (f)-[:LED_TO]->(permit))
     WITH f, party, permit, wasOpen
     OPTIONAL MATCH (permit)-[:APPROVES]->(app:AccessApplication)
     FOREACH (_ IN CASE WHEN $measure = 'REVOCATION' AND app IS NOT NULL
                          AND toUpper(coalesce(permit.status, '')) = 'REVOKED' THEN [1] ELSE [] END |
       SET app.status = 'REVOKED')
     RETURN f.findingId    AS findingId,
            permit.approvalId AS permitId,
            permit.status  AS permitStatus,
            party.name     AS partyName,
            wasOpen        AS wasOpen
     LIMIT 1`,
    {
      findingId,
      measure,
      note,
      exclusionMonths,
      fineEur,
      closedAt: closedAt.toISOString(),
      officerDid,
      officer,
    },
  );
  if (rows.length === 0) {
    return NextResponse.json(
      { error: `Finding ${findingId} is not in the graph` },
      { status: 404 },
    );
  }
  const row = rows[0];
  return NextResponse.json({
    findingId,
    partyName: row.partyName,
    status: "CLOSED",
    measure,
    note,
    exclusionMonths,
    fineEur,
    permitId: row.permitId,
    permitRevoked: measure === "REVOCATION" && row.permitStatus === "REVOKED",
    closedAt: closedAt.toISOString(),
    article:
      measure === "NONE"
        ? "Regulation (EU) 2025/327, Art. 63: finding closed without a measure"
        : measure === "FINE"
          ? "Regulation (EU) 2025/327, Art. 64: administrative fine; published under Art. 57(1)(j)(iv)"
          : "Regulation (EU) 2025/327, Art. 63(3): measure taken; published under Art. 57(1)(j)(iv)",
  });
}

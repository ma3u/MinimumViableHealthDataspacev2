import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthError } from "@/lib/auth-guard";
import { runQuery } from "@/lib/neo4j";
import { userToParticipantId } from "@/lib/odrl-engine";
import {
  RESPONSE_WEEKS,
  daysLeft,
  slugOf,
  weeksFrom,
  type Finding,
} from "@/lib/supervision";

export const dynamic = "force-dynamic";

/**
 * Non-compliance findings, Regulation (EU) 2025/327 Art. 63.
 *
 * POST: the access body records that a data user or holder failed to comply
 * (with the permit it concerns, if any), notifies the party and gives it
 * four weeks to state its views (Art. 63(2)). Where a breach of the GDPR is
 * suspected the supervisory authority is informed, and the record says so.
 * GET: the body sees every finding; a party sees the findings against it.
 * Issue #206, M4.
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
  const partyDid =
    typeof body.partyDid === "string" ? body.partyDid.trim() : "";
  const description =
    typeof body.description === "string" ? body.description.trim() : "";
  const permitId =
    typeof body.permitId === "string" && body.permitId.trim()
      ? body.permitId.trim()
      : null;
  const gdprBreach = body.gdprBreach === true;
  if (!partyDid || !description) {
    return NextResponse.json(
      {
        error:
          "partyDid and a description of the non-compliance are required (Art. 63(1))",
      },
      { status: 400 },
    );
  }

  const { session } = auth;
  const foundBy = userToParticipantId(
    session.user.email ?? session.user.name ?? session.user.id,
    session.roles,
  );
  const notifiedAt = new Date();
  const respondBy = weeksFrom(notifiedAt, RESPONSE_WEEKS);
  const stamp = notifiedAt.toISOString().slice(0, 10).replace(/-/g, "");
  const findingId = `finding-${slugOf(partyDid)}-${stamp}-${Math.random()
    .toString(36)
    .slice(2, 6)}`;

  const rows = await runQuery<{ partyName: string | null }>(
    `MATCH (party:Participant)
     WHERE coalesce(party.participantId, party.id) = $partyDid
     MERGE (f:NonComplianceFinding {findingId: $findingId})
     SET f.partyId                      = $partyDid,
         f.permitId                     = $permitId,
         f.description                  = $description,
         f.gdprBreach                   = $gdprBreach,
         f.supervisoryAuthorityInformed = $gdprBreach,
         f.status                       = 'OPEN',
         f.notifiedAt                   = datetime($notifiedAt),
         f.respondBy                    = datetime($respondBy),
         f.foundBy                      = $foundBy,
         f.ehdsArticle                  = 'Art. 63'
     MERGE (f)-[:AGAINST]->(party)
     WITH f, party
     OPTIONAL MATCH (hdab:Participant)
       WHERE coalesce(hdab.participantId, hdab.id) = $foundBy
     FOREACH (_ IN CASE WHEN hdab IS NOT NULL THEN [1] ELSE [] END |
       MERGE (hdab)-[:FOUND]->(f))
     WITH f, party
     OPTIONAL MATCH (permit:HDABApproval {approvalId: $permitId})
     FOREACH (_ IN CASE WHEN permit IS NOT NULL THEN [1] ELSE [] END |
       MERGE (f)-[:CONCERNS]->(permit))
     RETURN party.name AS partyName
     LIMIT 1`,
    {
      partyDid,
      findingId,
      permitId,
      description,
      gdprBreach,
      notifiedAt: notifiedAt.toISOString(),
      respondBy: respondBy.toISOString(),
      foundBy,
    },
  );
  if (rows.length === 0) {
    return NextResponse.json(
      { error: `${partyDid} is not a participant in the graph` },
      { status: 404 },
    );
  }
  return NextResponse.json(
    {
      findingId,
      party: partyDid,
      partyName: rows[0].partyName,
      permitId,
      gdprBreach,
      supervisoryAuthorityInformed: gdprBreach,
      status: "OPEN",
      notifiedAt: notifiedAt.toISOString(),
      respondBy: respondBy.toISOString(),
      article: gdprBreach
        ? "Regulation (EU) 2025/327, Art. 63(2): the party states its views within four weeks; the supervisory authority is informed of the suspected GDPR breach"
        : "Regulation (EU) 2025/327, Art. 63(2): the party states its views within four weeks",
    },
    { status: 201 },
  );
}

export async function GET() {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;
  const { session } = auth;
  const isBody =
    session.roles.includes("HDAB_AUTHORITY") ||
    session.roles.includes("EDC_ADMIN");
  const callerDid = userToParticipantId(
    session.user.email ?? session.user.name ?? session.user.id,
    session.roles,
  );
  const rows = await runQuery<Finding>(
    `MATCH (f:NonComplianceFinding)
     WHERE $all OR f.partyId = $callerDid
     OPTIONAL MATCH (f)-[:AGAINST]->(party:Participant)
     OPTIONAL MATCH (hdab:Participant)-[:FOUND]->(f)
     RETURN f.findingId                     AS findingId,
            f.partyId                       AS party,
            party.name                      AS partyName,
            party.participantType           AS partyType,
            f.permitId                      AS permitId,
            f.description                   AS description,
            coalesce(f.gdprBreach, false)   AS gdprBreach,
            coalesce(f.supervisoryAuthorityInformed, false) AS supervisoryAuthorityInformed,
            toUpper(coalesce(f.status, '')) AS status,
            toString(f.notifiedAt)          AS notifiedAt,
            toString(f.respondBy)           AS respondBy,
            f.views                         AS views,
            toString(f.respondedAt)         AS respondedAt,
            f.measure                       AS measure,
            f.measureNote                   AS measureNote,
            f.exclusionMonths               AS exclusionMonths,
            f.fineEur                       AS fineEur,
            toString(f.closedAt)            AS closedAt,
            f.foundBy                       AS foundBy,
            hdab.name                       AS accessBody
     ORDER BY f.notifiedAt DESC`,
    { all: isBody, callerDid },
  );
  const now = Date.now();
  return NextResponse.json({
    findings: rows.map((f) => ({
      ...f,
      daysToRespond: f.status === "OPEN" ? daysLeft(f.respondBy, now) : null,
    })),
    scope: isBody ? "all" : "own",
    article:
      "Regulation (EU) 2025/327, Art. 63: findings, four weeks to state views (63(2)), measures (63(3))",
  });
}

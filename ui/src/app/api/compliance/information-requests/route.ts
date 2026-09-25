import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthError } from "@/lib/auth-guard";
import { runQuery } from "@/lib/neo4j";
import { userToParticipantId } from "@/lib/odrl-engine";
import {
  RESPONSE_WEEKS,
  daysLeft,
  slugOf,
  weeksFrom,
  type InformationRequest,
} from "@/lib/supervision";

export const dynamic = "force-dynamic";

/**
 * Requests for information, Regulation (EU) 2025/327 Art. 57(1)(a)(ii) and
 * Art. 63(1): the access body asks a data user or holder for information
 * on its use of the data; the request and the answer are on record.
 * POST: the body asks (four weeks to answer, as for views under 63(2)).
 * GET: the body sees all; a party sees what was asked of it. Issue #206, M4.
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
  const question =
    typeof body.question === "string" ? body.question.trim() : "";
  const permitId =
    typeof body.permitId === "string" && body.permitId.trim()
      ? body.permitId.trim()
      : null;
  const findingId =
    typeof body.findingId === "string" && body.findingId.trim()
      ? body.findingId.trim()
      : null;
  if (!partyDid || !question) {
    return NextResponse.json(
      { error: "partyDid and a question are required (Art. 63(1))" },
      { status: 400 },
    );
  }
  const { session } = auth;
  const requestedBy = userToParticipantId(
    session.user.email ?? session.user.name ?? session.user.id,
    session.roles,
  );
  const requestedAt = new Date();
  const answerBy = weeksFrom(requestedAt, RESPONSE_WEEKS);
  const stamp = requestedAt.toISOString().slice(0, 10).replace(/-/g, "");
  const requestId = `info-${slugOf(partyDid)}-${stamp}-${Math.random()
    .toString(36)
    .slice(2, 6)}`;

  const rows = await runQuery<{ partyName: string | null }>(
    `MATCH (party:Participant)
     WHERE coalesce(party.participantId, party.id) = $partyDid
     MERGE (i:InformationRequest {requestId: $requestId})
     SET i.partyId     = $partyDid,
         i.permitId    = $permitId,
         i.findingId   = $findingId,
         i.question    = $question,
         i.status      = 'OPEN',
         i.requestedAt = datetime($requestedAt),
         i.answerBy    = datetime($answerBy),
         i.requestedBy = $requestedBy,
         i.ehdsArticle = 'Art. 63(1)'
     MERGE (i)-[:ASKED_OF]->(party)
     WITH i, party
     OPTIONAL MATCH (hdab:Participant)
       WHERE coalesce(hdab.participantId, hdab.id) = $requestedBy
     FOREACH (_ IN CASE WHEN hdab IS NOT NULL THEN [1] ELSE [] END |
       MERGE (hdab)-[:ASKED]->(i))
     WITH i, party
     OPTIONAL MATCH (f:NonComplianceFinding {findingId: $findingId})
     FOREACH (_ IN CASE WHEN f IS NOT NULL THEN [1] ELSE [] END |
       MERGE (i)-[:ABOUT]->(f))
     RETURN party.name AS partyName
     LIMIT 1`,
    {
      partyDid,
      requestId,
      permitId,
      findingId,
      question,
      requestedAt: requestedAt.toISOString(),
      answerBy: answerBy.toISOString(),
      requestedBy,
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
      requestId,
      party: partyDid,
      partyName: rows[0].partyName,
      permitId,
      findingId,
      status: "OPEN",
      requestedAt: requestedAt.toISOString(),
      answerBy: answerBy.toISOString(),
      article:
        "Regulation (EU) 2025/327, Art. 63(1): request for information; four weeks to answer",
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
  const rows = await runQuery<InformationRequest>(
    `MATCH (i:InformationRequest)
     WHERE $all OR i.partyId = $callerDid
     OPTIONAL MATCH (i)-[:ASKED_OF]->(party:Participant)
     OPTIONAL MATCH (hdab:Participant)-[:ASKED]->(i)
     RETURN i.requestId                     AS requestId,
            i.partyId                       AS party,
            party.name                      AS partyName,
            i.permitId                      AS permitId,
            i.findingId                     AS findingId,
            i.question                      AS question,
            toUpper(coalesce(i.status, '')) AS status,
            toString(i.requestedAt)         AS requestedAt,
            toString(i.answerBy)            AS answerBy,
            i.answer                        AS answer,
            toString(i.answeredAt)          AS answeredAt,
            i.requestedBy                   AS requestedBy,
            hdab.name                       AS accessBody
     ORDER BY i.requestedAt DESC`,
    { all: isBody, callerDid },
  );
  const now = Date.now();
  return NextResponse.json({
    requests: rows.map((r) => ({
      ...r,
      daysToAnswer: r.status === "OPEN" ? daysLeft(r.answerBy, now) : null,
    })),
    scope: isBody ? "all" : "own",
    article: "Regulation (EU) 2025/327, Art. 63(1)",
  });
}

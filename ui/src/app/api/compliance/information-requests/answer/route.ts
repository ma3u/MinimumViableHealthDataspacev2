import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthError } from "@/lib/auth-guard";
import { runQuery } from "@/lib/neo4j";
import { userToParticipantId } from "@/lib/odrl-engine";

export const dynamic = "force-dynamic";

/**
 * POST /api/compliance/information-requests/answer: the party answers the
 * access body's request for information (Regulation (EU) 2025/327, Art.
 * 63(1)). Only that party; the answer is on record. Issue #206, M4.
 */
export async function POST(req: NextRequest) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Body must be JSON" }, { status: 400 });
  }
  const requestId =
    typeof body.requestId === "string" ? body.requestId.trim() : "";
  const answer = typeof body.answer === "string" ? body.answer.trim() : "";
  if (!requestId || !answer) {
    return NextResponse.json(
      { error: "requestId and an answer are required" },
      { status: 400 },
    );
  }
  const { session } = auth;
  const callerDid = userToParticipantId(
    session.user.email ?? session.user.name ?? session.user.id,
    session.roles,
  );
  const found = await runQuery<{ partyId: string | null; status: string }>(
    `MATCH (i:InformationRequest {requestId: $requestId})
     RETURN i.partyId AS partyId, toUpper(coalesce(i.status, '')) AS status
     LIMIT 1`,
    { requestId },
  );
  if (found.length === 0) {
    return NextResponse.json(
      { error: `Information request ${requestId} is not in the graph` },
      { status: 404 },
    );
  }
  if (found[0].partyId !== callerDid && !session.roles.includes("EDC_ADMIN")) {
    return NextResponse.json(
      { error: "Only the party asked answers" },
      { status: 403 },
    );
  }
  const answeredAt = new Date();
  await runQuery(
    `MATCH (i:InformationRequest {requestId: $requestId})
     SET i.answer     = $answer,
         i.answeredAt = datetime($answeredAt),
         i.status     = 'ANSWERED'`,
    { requestId, answer, answeredAt: answeredAt.toISOString() },
  );
  return NextResponse.json({
    requestId,
    status: "ANSWERED",
    answeredAt: answeredAt.toISOString(),
    article: "Regulation (EU) 2025/327, Art. 63(1): answer on record",
  });
}

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthError } from "@/lib/auth-guard";
import { runQuery } from "@/lib/neo4j";
import { userToParticipantId } from "@/lib/odrl-engine";

export const dynamic = "force-dynamic";

/**
 * POST /api/compliance/findings/respond: the party a finding is against
 * states its views (Regulation (EU) 2025/327, Art. 63(2)). Only that party;
 * only while the finding is open. Issue #206, M4.
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
  const findingId =
    typeof body.findingId === "string" ? body.findingId.trim() : "";
  const views = typeof body.views === "string" ? body.views.trim() : "";
  if (!findingId || !views) {
    return NextResponse.json(
      { error: "findingId and the party's views are required (Art. 63(2))" },
      { status: 400 },
    );
  }
  const { session } = auth;
  const callerDid = userToParticipantId(
    session.user.email ?? session.user.name ?? session.user.id,
    session.roles,
  );
  const found = await runQuery<{ partyId: string | null; status: string }>(
    `MATCH (f:NonComplianceFinding {findingId: $findingId})
     RETURN f.partyId AS partyId, toUpper(coalesce(f.status, '')) AS status
     LIMIT 1`,
    { findingId },
  );
  if (found.length === 0) {
    return NextResponse.json(
      { error: `Finding ${findingId} is not in the graph` },
      { status: 404 },
    );
  }
  if (found[0].partyId !== callerDid && !session.roles.includes("EDC_ADMIN")) {
    return NextResponse.json(
      { error: "Only the party the finding is against states its views" },
      { status: 403 },
    );
  }
  if (found[0].status === "CLOSED") {
    return NextResponse.json(
      { error: "The finding is closed" },
      { status: 409 },
    );
  }
  const respondedAt = new Date();
  await runQuery(
    `MATCH (f:NonComplianceFinding {findingId: $findingId})
     SET f.views       = $views,
         f.respondedAt = datetime($respondedAt),
         f.status      = 'VIEWS_RECEIVED'`,
    { findingId, views, respondedAt: respondedAt.toISOString() },
  );
  return NextResponse.json({
    findingId,
    status: "VIEWS_RECEIVED",
    respondedAt: respondedAt.toISOString(),
    article:
      "Regulation (EU) 2025/327, Art. 63(2): the party's views are on record",
  });
}

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthError } from "@/lib/auth-guard";
import { runQuery } from "@/lib/neo4j";
import { resolveOdrlScope, userToParticipantId } from "@/lib/odrl-engine";
import { PUBLISH_WORKING_DAYS, addWorkingDays } from "@/lib/permits";
import { toStatisticalAnswer, type NlqAnswer } from "@/lib/statistics";

export const dynamic = "force-dynamic";

const PROXY_URL = process.env.NEO4J_PROXY_URL ?? "http://localhost:9090";

/**
 * POST /api/compliance/requests/decide: the access body decides on a health
 * data request (Regulation (EU) 2025/327, Art. 69(3) and (4)).
 *
 * On approval the question is run once, here, in the applicant's name
 * against the graph, and only the anonymised statistical result is kept on
 * the request. The applicant never receives the query, the records or any
 * count below the k-anonymity threshold (Art. 69(1)). The run is recorded by
 * the proxy as an access event under the request id. Issue #206, M5.
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
  const requestId =
    typeof body.requestId === "string" ? body.requestId.trim() : "";
  const decision = String(body.decision ?? "").toUpperCase();
  const justification =
    typeof body.justification === "string" ? body.justification.trim() : "";
  if (!requestId || !["APPROVED", "REJECTED"].includes(decision)) {
    return NextResponse.json(
      { error: "requestId and decision (APPROVED or REJECTED) are required" },
      { status: 400 },
    );
  }
  if (decision === "REJECTED" && !justification) {
    return NextResponse.json(
      { error: "A refusal needs a written justification (Art. 57(1)(j)(iii))" },
      { status: 400 },
    );
  }

  const { session } = auth;
  const decidedBy = userToParticipantId(
    session.user.email ?? session.user.name ?? session.user.id,
    session.roles,
  );
  const officer = session.user.name ?? session.user.email ?? session.user.id;
  const decidedAt = new Date();
  const publishBy = addWorkingDays(decidedAt, PUBLISH_WORKING_DAYS)
    .toISOString()
    .slice(0, 10);

  const found = await runQuery<{
    requestId: string;
    applicantId: string | null;
    question: string | null;
    purpose: string | null;
    datasetId: string | null;
  }>(
    `MATCH (r:HealthDataRequest {requestId: $requestId})
     SET r.status        = $decision,
         r.decidedAt     = datetime($decidedAt),
         r.decidedBy     = $decidedBy,
         r.officer       = $officer,
         r.justification = $justification,
         r.publishBy     = date($publishBy)
     WITH r
     OPTIONAL MATCH (hdab:Participant)
       WHERE coalesce(hdab.participantId, hdab.id) = $decidedBy
     FOREACH (_ IN CASE WHEN hdab IS NOT NULL THEN [1] ELSE [] END |
       MERGE (hdab)-[:DECIDED]->(r))
     RETURN r.requestId AS requestId, r.applicantId AS applicantId,
            r.question AS question, r.purpose AS purpose, r.datasetId AS datasetId
     LIMIT 1`,
    {
      requestId,
      decision,
      decidedAt: decidedAt.toISOString(),
      decidedBy,
      officer,
      justification,
      publishBy,
    },
  );
  if (found.length === 0) {
    return NextResponse.json(
      { error: `Health data request ${requestId} is not in the graph` },
      { status: 404 },
    );
  }
  const request = found[0];

  if (decision === "REJECTED") {
    return NextResponse.json({
      requestId,
      decision,
      decidedAt: decidedAt.toISOString(),
      decidedBy,
      justification,
      publishBy,
      article: "Regulation (EU) 2025/327, Art. 69(3): request refused",
    });
  }

  // Approved: produce the statistic in the applicant's name, once, here.
  const applicantId = request.applicantId ?? "";
  let nlq: NlqAnswer;
  try {
    const odrlScope = await resolveOdrlScope(applicantId);
    const resp = await fetch(`${PROXY_URL}/nlq`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Participant": applicantId,
        "X-Request": requestId,
        "X-Purpose": request.purpose ?? "",
        ...(request.datasetId ? { "X-Dataset": request.datasetId } : {}),
      },
      body: JSON.stringify({ question: request.question, odrlScope }),
    });
    nlq = (await resp.json()) as NlqAnswer;
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    await runQuery(
      `MATCH (r:HealthDataRequest {requestId: $requestId})
       SET r.answerError = $answerError`,
      {
        requestId,
        answerError: `The statistical service was unreachable: ${detail}`,
      },
    );
    return NextResponse.json({
      requestId,
      decision,
      decidedAt: decidedAt.toISOString(),
      decidedBy,
      publishBy,
      answered: false,
      answerError: `The statistical service was unreachable: ${detail}`,
      article:
        "Regulation (EU) 2025/327, Art. 69(3): request approved, answer pending",
    });
  }

  const stat = toStatisticalAnswer(nlq);
  const answeredAt = new Date();
  await runQuery(
    `MATCH (r:HealthDataRequest {requestId: $requestId})
     SET r.status         = $status,
         r.answer         = $answer,
         r.answerTemplate = $answerTemplate,
         r.answerError    = $answerError,
         r.answeredAt     = CASE WHEN $answer IS NULL THEN null ELSE datetime($answeredAt) END,
         r.suppressedCells = $suppressedCells,
         r.kAnonymity     = $kAnonymity`,
    {
      requestId,
      status: stat.ok ? "ANSWERED" : "APPROVED",
      answer: stat.ok ? JSON.stringify(stat.rows) : null,
      answerTemplate: stat.templateName,
      answerError: stat.ok ? null : stat.reason,
      answeredAt: answeredAt.toISOString(),
      suppressedCells: stat.suppressedCells,
      kAnonymity: stat.kAnonymity,
    },
  );

  return NextResponse.json({
    requestId,
    decision,
    decidedAt: decidedAt.toISOString(),
    decidedBy,
    publishBy,
    answered: stat.ok,
    answer: stat.ok ? stat.rows : null,
    answerTemplate: stat.templateName,
    answerError: stat.ok ? null : stat.reason,
    suppressedCells: stat.suppressedCells,
    kAnonymity: stat.kAnonymity,
    article: stat.ok
      ? "Regulation (EU) 2025/327, Art. 69(1): answered in anonymised statistical format"
      : "Regulation (EU) 2025/327, Art. 69(1): approved, but the question yields no statistical answer",
  });
}

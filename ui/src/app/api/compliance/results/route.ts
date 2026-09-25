import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthError } from "@/lib/auth-guard";
import { runQuery } from "@/lib/neo4j";
import { userToParticipantId } from "@/lib/odrl-engine";
import { parseGraphTime } from "@/lib/permits";
import {
  RESULT_KINDS,
  resultsDeadline,
  type ResultKind,
  type ResultRow,
} from "@/lib/results";

export const dynamic = "force-dynamic";

/**
 * Results communicated by data users, Regulation (EU) 2025/327 Art. 61(4).
 *
 * POST: the holder of a data permit reports what came of the use: a
 * publication, a policy document, a regulatory procedure, an IT product. The
 * deadline is 18 months after the end of the processing (the permit's
 * validity end); the record says whether it was met. GET: public, every
 * result, because the access body publishes them (Art. 57(1)(j)(v)) and
 * reports them (Art. 59(1)(j), (k)). Issue #206, M6.
 */

export async function POST(req: NextRequest) {
  const auth = await requireAuth([
    "DATA_USER",
    "EDC_USER_PARTICIPANT",
    "EDC_ADMIN",
  ]);
  if (isAuthError(auth)) return auth;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Body must be JSON" }, { status: 400 });
  }
  const permitId =
    typeof body.permitId === "string" ? body.permitId.trim() : "";
  const kind = String(body.kind ?? "").toUpperCase() as ResultKind;
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const summary = typeof body.summary === "string" ? body.summary.trim() : "";
  const url =
    typeof body.url === "string" && /^https?:\/\//.test(body.url.trim())
      ? body.url.trim()
      : null;
  if (!permitId || !RESULT_KINDS.includes(kind) || !title) {
    return NextResponse.json(
      {
        error: `permitId, kind (${RESULT_KINDS.join(
          ", ",
        )}) and title are required (Art. 61(4))`,
      },
      { status: 400 },
    );
  }

  const { session } = auth;
  const callerDid = userToParticipantId(
    session.user.email ?? session.user.name ?? session.user.id,
    session.roles,
  );
  const found = await runQuery<{
    permitId: string;
    status: string;
    applicantId: string | null;
    validUntil: string | null;
  }>(
    `MATCH (permit:HDABApproval {approvalId: $permitId})
     OPTIONAL MATCH (permit)-[:APPROVES]->(app:AccessApplication)
     OPTIONAL MATCH (p:Participant)-[:SUBMITTED]->(app)
     RETURN permit.approvalId AS permitId,
            toUpper(coalesce(permit.status, '')) AS status,
            coalesce(app.applicantId, p.participantId, p.id) AS applicantId,
            toString(permit.validUntil) AS validUntil
     LIMIT 1`,
    { permitId },
  );
  if (found.length === 0) {
    return NextResponse.json(
      { error: `Data permit ${permitId} is not in the graph` },
      { status: 404 },
    );
  }
  const permit = found[0];
  if (
    permit.applicantId !== callerDid &&
    !session.roles.includes("EDC_ADMIN")
  ) {
    return NextResponse.json(
      { error: "Only the holder of the permit communicates its results" },
      { status: 403 },
    );
  }
  if (!["APPROVED", "REVOKED"].includes(permit.status)) {
    return NextResponse.json(
      { error: "No data permit was issued on this application" },
      { status: 409 },
    );
  }

  const communicatedAt = new Date();
  const deadline = resultsDeadline(permit.validUntil);
  const onTime =
    deadline !== null
      ? communicatedAt.getTime() <= (parseGraphTime(deadline) ?? 0)
      : null;
  const stamp = communicatedAt.toISOString().slice(0, 10).replace(/-/g, "");
  const resultId = `result-${permitId.replace(
    /^permit-/,
    "",
  )}-${stamp}-${Math.random().toString(36).slice(2, 6)}`;
  await runQuery(
    `MATCH (permit:HDABApproval {approvalId: $permitId})
     MERGE (rc:ResultCommunication {resultId: $resultId})
     SET rc.permitId       = $permitId,
         rc.applicantId    = $applicantId,
         rc.kind           = $kind,
         rc.title          = $title,
         rc.summary        = $summary,
         rc.url            = $url,
         rc.communicatedAt = datetime($communicatedAt),
         rc.deadline       = CASE WHEN $deadline IS NULL THEN null ELSE datetime($deadline) END,
         rc.onTime         = $onTime,
         rc.ehdsArticle    = 'Art. 61(4)'
     MERGE (rc)-[:RESULT_OF]->(permit)
     WITH rc
     OPTIONAL MATCH (p:Participant)
       WHERE coalesce(p.participantId, p.id) = $applicantId
     FOREACH (_ IN CASE WHEN p IS NOT NULL THEN [1] ELSE [] END |
       MERGE (p)-[:COMMUNICATED]->(rc))`,
    {
      permitId,
      resultId,
      applicantId: permit.applicantId,
      kind,
      title,
      summary,
      url,
      communicatedAt: communicatedAt.toISOString(),
      deadline,
      onTime,
    },
  );
  return NextResponse.json(
    {
      resultId,
      permitId,
      kind,
      title,
      communicatedAt: communicatedAt.toISOString(),
      deadline,
      onTime,
      article:
        onTime === false
          ? "Regulation (EU) 2025/327, Art. 61(4): results communicated after the 18 months"
          : "Regulation (EU) 2025/327, Art. 61(4): results communicated within the 18 months; published under Art. 57(1)(j)(v)",
    },
    { status: 201 },
  );
}

export async function GET() {
  try {
    const rows = await runQuery<ResultRow>(
      `MATCH (rc:ResultCommunication)
       OPTIONAL MATCH (rc)-[:RESULT_OF]->(permit:HDABApproval)
       OPTIONAL MATCH (permit)-[:GRANTS_ACCESS_TO]->(ds:HealthDataset)
       OPTIONAL MATCH (p:Participant)
         WHERE coalesce(p.participantId, p.id) = rc.applicantId
       RETURN rc.resultId                   AS resultId,
              rc.permitId                   AS permitId,
              rc.applicantId                AS applicant,
              p.name                        AS applicantName,
              coalesce(ds.datasetId, ds.id) AS datasetId,
              coalesce(ds.title, ds.name)   AS datasetTitle,
              rc.kind                       AS kind,
              rc.title                      AS title,
              rc.summary                    AS summary,
              rc.url                        AS url,
              toString(rc.communicatedAt)   AS communicatedAt,
              toString(rc.deadline)         AS deadline,
              rc.onTime                     AS onTime
       ORDER BY rc.communicatedAt DESC`,
    );
    return NextResponse.json({
      results: rows,
      article:
        "Regulation (EU) 2025/327, Art. 61(4); published under Art. 57(1)(j)(v)",
    });
  } catch (err) {
    return NextResponse.json(
      { error: "Neo4j unavailable", detail: String(err) },
      { status: 502 },
    );
  }
}

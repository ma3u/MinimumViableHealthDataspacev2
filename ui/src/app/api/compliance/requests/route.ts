import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthError } from "@/lib/auth-guard";
import { runQuery } from "@/lib/neo4j";
import { userToParticipantId } from "@/lib/odrl-engine";
import {
  DECISION_MONTHS,
  PURPOSES,
  addMonths,
  decisionClock,
} from "@/lib/permits";

export const dynamic = "force-dynamic";

/**
 * Health data requests, Regulation (EU) 2025/327 Art. 69: access to a
 * statistic, never to the data.
 *
 * POST: a data user asks a question and describes the statistical content,
 * the safeguards and the legal basis (Art. 69(2)). GET: the access body's
 * inbox with the Art. 69(4) three-month clock; a data user sees only its own
 * requests and, once the body has decided, the anonymised answer. Issue
 * #206, M5.
 */

function slugOf(did: string): string {
  return (
    did
      .replace(/^did:web:/, "")
      .split(":")[0]
      .split(".")[0]
      .replace(/[^a-z0-9-]/gi, "")
      .toLowerCase() || "applicant"
  );
}

export interface HealthDataRequestRow {
  requestId: string;
  applicant: string | null;
  applicantName: string | null;
  question: string | null;
  purpose: string | null;
  datasetId: string | null;
  datasetTitle: string | null;
  statisticalContent: string | null;
  safeguards: string | null;
  legalBasis: string | null;
  status: string;
  submittedAt: string | null;
  decidedAt: string | null;
  decidedBy: string | null;
  justification: string | null;
  answer: string | null;
  answerTemplate: string | null;
  answerError: string | null;
  answeredAt: string | null;
  suppressedCells: number | null;
  decidedUnder?: string | null;
  feeEur?: number | null;
}

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
  const question =
    typeof body.question === "string" ? body.question.trim() : "";
  const purpose = typeof body.purpose === "string" ? body.purpose.trim() : "";
  const statisticalContent =
    typeof body.statisticalContent === "string"
      ? body.statisticalContent.trim()
      : "";
  if (!question || !purpose || !statisticalContent) {
    return NextResponse.json(
      {
        error:
          "question, purpose and statisticalContent are required (Art. 69(2)(b) and (d))",
        purposes: PURPOSES,
      },
      { status: 400 },
    );
  }
  if (!(PURPOSES as readonly string[]).includes(purpose)) {
    return NextResponse.json(
      {
        error: "purpose must be one of the Art. 53(1) purposes",
        purposes: PURPOSES,
      },
      { status: 400 },
    );
  }
  const datasetId =
    typeof body.datasetId === "string" && body.datasetId.trim()
      ? body.datasetId.trim()
      : null;
  const safeguards =
    typeof body.safeguards === "string" ? body.safeguards.trim() : "";
  const legalBasis =
    typeof body.legalBasis === "string" && body.legalBasis.trim()
      ? body.legalBasis.trim()
      : "GDPR Art. 6(1)(e), Regulation (EU) 2025/327 Art. 53(1)";

  const { session } = auth;
  const applicantDid = userToParticipantId(
    session.user.email ?? session.user.name ?? session.user.id,
    session.roles,
  );
  const submittedAt = new Date();
  const decisionDue = addMonths(submittedAt, DECISION_MONTHS);
  const stamp = submittedAt.toISOString().slice(0, 10).replace(/-/g, "");
  const requestId = `req-${slugOf(applicantDid)}-${stamp}-${Math.random()
    .toString(36)
    .slice(2, 6)}`;

  const rows = await runQuery<{
    requestId: string;
    applicantName: string | null;
  }>(
    `MATCH (p:Participant)
     WHERE coalesce(p.participantId, p.id) = $applicantDid
     MERGE (r:HealthDataRequest {requestId: $requestId})
     SET r.applicantId        = $applicantDid,
         r.question           = $question,
         r.purpose            = $purpose,
         r.datasetId          = $datasetId,
         r.statisticalContent = $statisticalContent,
         r.safeguards         = $safeguards,
         r.legalBasis         = $legalBasis,
         r.status             = 'PENDING',
         r.submittedAt        = datetime($submittedAt),
         r.decisionDue        = datetime($decisionDue),
         r.ehdsArticle        = 'Art. 69'
     MERGE (p)-[:SUBMITTED]->(r)
     WITH r, p
     OPTIONAL MATCH (ds:HealthDataset)
       WHERE $datasetId IS NOT NULL AND coalesce(ds.datasetId, ds.id) = $datasetId
     FOREACH (_ IN CASE WHEN ds IS NOT NULL THEN [1] ELSE [] END |
       MERGE (r)-[:REQUESTS]->(ds))
     RETURN r.requestId AS requestId, p.name AS applicantName
     LIMIT 1`,
    {
      applicantDid,
      requestId,
      question,
      purpose,
      datasetId,
      statisticalContent,
      safeguards,
      legalBasis,
      submittedAt: submittedAt.toISOString(),
      decisionDue: decisionDue.toISOString(),
    },
  );
  if (rows.length === 0) {
    return NextResponse.json(
      { error: `${applicantDid} is not a participant in the graph` },
      { status: 404 },
    );
  }
  return NextResponse.json(
    {
      requestId,
      applicant: applicantDid,
      applicantName: rows[0].applicantName,
      question,
      purpose,
      datasetId,
      status: "PENDING",
      submittedAt: submittedAt.toISOString(),
      decisionDue: decisionDue.toISOString(),
      article:
        "Regulation (EU) 2025/327, Art. 69(2); the access body decides within three months (Art. 69(4))",
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

  // Art. 72: a trusted data holder also sees, and decides, the requests on
  // the datasets it offers.
  const holder = await runQuery<{ trusted: boolean }>(
    `OPTIONAL MATCH (h:Participant)
       WHERE coalesce(h.participantId, h.id) = $callerDid
     RETURN coalesce(h.trustedHolder, false) AS trusted`,
    { callerDid },
  );
  const trustedHolder =
    session.roles.includes("DATA_HOLDER") && holder[0]?.trusted === true;

  const rows = await runQuery<HealthDataRequestRow & { holder: string | null }>(
    `MATCH (r:HealthDataRequest)
     OPTIONAL MATCH (p:Participant)-[:SUBMITTED]->(r)
     OPTIONAL MATCH (ds:HealthDataset)
       WHERE coalesce(ds.datasetId, ds.id) = r.datasetId
     OPTIONAL MATCH (offers:Participant)-[:OFFERS]->(:DataProduct)-[:DESCRIBED_BY]->(ds)
     WITH r, p, ds, collect(DISTINCT coalesce(offers.participantId, offers.id)) AS holders
     WHERE $all OR r.applicantId = $callerDid OR ($trustedHolder AND $callerDid IN holders)
     RETURN r.requestId                     AS requestId,
            head(holders)                   AS holder,
            r.decidedUnder                  AS decidedUnder,
            r.feeEur                        AS feeEur,
            coalesce(p.participantId, p.id) AS applicant,
            p.name                          AS applicantName,
            r.question                      AS question,
            r.purpose                       AS purpose,
            r.datasetId                     AS datasetId,
            coalesce(ds.title, ds.name)     AS datasetTitle,
            r.statisticalContent            AS statisticalContent,
            r.safeguards                    AS safeguards,
            r.legalBasis                    AS legalBasis,
            toUpper(coalesce(r.status, '')) AS status,
            toString(r.submittedAt)         AS submittedAt,
            toString(r.decidedAt)           AS decidedAt,
            r.decidedBy                     AS decidedBy,
            r.justification                 AS justification,
            r.answer                        AS answer,
            r.answerTemplate                AS answerTemplate,
            r.answerError                   AS answerError,
            toString(r.answeredAt)          AS answeredAt,
            r.suppressedCells               AS suppressedCells
     ORDER BY r.submittedAt DESC`,
    { all: isBody, callerDid, trustedHolder },
  );

  const now = Date.now();
  const requests = rows.map((r) => {
    const undecided = r.status === "PENDING";
    let answer: unknown = null;
    if (r.answer) {
      try {
        answer = JSON.parse(r.answer);
      } catch {
        answer = null;
      }
    }
    return {
      ...r,
      answer,
      ...decisionClock(r.submittedAt, undecided, now),
      undecided,
    };
  });
  requests.sort((a, b) => {
    if (a.undecided !== b.undecided) return a.undecided ? -1 : 1;
    return (b.submittedAt ?? "").localeCompare(a.submittedAt ?? "");
  });

  return NextResponse.json({
    requests: requests.map((r) => ({
      ...r,
      // whether this caller may decide it: the body always, a trusted holder
      // for its own datasets (Art. 72)
      canDecide:
        session.roles.includes("HDAB_AUTHORITY") ||
        (trustedHolder && r.holder === callerDid),
    })),
    scope: isBody ? "all" : trustedHolder ? "holder" : "own",
    trustedHolder,
    article:
      "Regulation (EU) 2025/327, Art. 69: statistical answers only; Art. 69(4): three months to decide; Art. 72: trusted holders answer for their own datasets",
  });
}

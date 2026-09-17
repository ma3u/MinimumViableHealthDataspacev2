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
 * Health data access applications (Regulation (EU) 2025/327, Art. 67).
 *
 * POST: a data user applies for access. This is the minimal application of
 * issue #206 M1: applicant, purpose, dataset, period and justification, the
 * four items the Art. 68 decision needs, plus the ethics reference and the
 * minimisation statement the seed already carries. The remaining Art. 67(2)
 * items follow with the researcher's form.
 *
 * GET: the access body's inbox, every application with its decision and the
 * Art. 68(4) clock (three months from submission to decide).
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

  const datasetId =
    typeof body.datasetId === "string" ? body.datasetId.trim() : "";
  const purpose = typeof body.purpose === "string" ? body.purpose.trim() : "";
  const justification =
    typeof body.justification === "string" ? body.justification.trim() : "";
  if (!datasetId || !purpose || !justification) {
    return NextResponse.json(
      {
        error:
          "datasetId, purpose and justification are required (Art. 67(2)(b) to (d))",
        purposes: PURPOSES,
      },
      { status: 400 },
    );
  }
  if (!(PURPOSES as readonly string[]).includes(purpose)) {
    return NextResponse.json(
      {
        error: `purpose must be one of the Art. 53(1) purposes`,
        purposes: PURPOSES,
      },
      { status: 400 },
    );
  }
  const periodMonths = Math.min(
    60,
    Math.max(1, Math.round(Number(body.periodMonths ?? 12)) || 12),
  );
  const ethicsCommitteeRef =
    typeof body.ethicsCommitteeRef === "string"
      ? body.ethicsCommitteeRef.trim()
      : "";
  const dataMinimisationStatement =
    typeof body.dataMinimisationStatement === "string"
      ? body.dataMinimisationStatement.trim()
      : "";

  const { session } = auth;
  const applicantDid = userToParticipantId(
    session.user.email ?? session.user.name ?? session.user.id,
    session.roles,
  );
  const submittedAt = new Date();
  const decisionDue = addMonths(submittedAt, DECISION_MONTHS);
  const stamp = submittedAt.toISOString().slice(0, 10).replace(/-/g, "");
  const applicationId = `app-${slugOf(applicantDid)}-${stamp}-${Math.random()
    .toString(36)
    .slice(2, 6)}`;
  const name =
    typeof body.name === "string" && body.name.trim()
      ? body.name.trim()
      : `${purpose.toLowerCase().replace(/_/g, " ")} on ${datasetId}`;

  const rows = await runQuery<{
    applicationId: string;
    applicantName: string | null;
    datasetKnown: boolean;
  }>(
    `MATCH (p:Participant)
     WHERE coalesce(p.participantId, p.id) = $applicantDid
     MERGE (app:AccessApplication {applicationId: $applicationId})
     SET app.name                      = $name,
         app.applicantId               = $applicantDid,
         app.datasetId                 = $datasetId,
         app.requestedPurpose          = $purpose,
         app.submittedAt               = datetime($submittedAt),
         app.decisionDue               = datetime($decisionDue),
         app.status                    = 'PENDING',
         app.justification             = $justification,
         app.processingPeriodMonths    = $periodMonths,
         app.ethicsCommitteeRef        = $ethicsCommitteeRef,
         app.dataMinimisationStatement = $dataMinimisationStatement,
         app.ehdsArticle               = 'Art. 67'
     MERGE (p)-[:SUBMITTED]->(app)
     WITH app, p
     OPTIONAL MATCH (ds:HealthDataset)
       WHERE coalesce(ds.datasetId, ds.id) = $datasetId
     FOREACH (_ IN CASE WHEN ds IS NOT NULL THEN [1] ELSE [] END |
       MERGE (app)-[:REQUESTS]->(ds))
     RETURN app.applicationId AS applicationId,
            p.name            AS applicantName,
            ds IS NOT NULL    AS datasetKnown
     LIMIT 1`,
    {
      applicantDid,
      applicationId,
      name,
      datasetId,
      purpose,
      submittedAt: submittedAt.toISOString(),
      decisionDue: decisionDue.toISOString(),
      justification,
      periodMonths,
      ethicsCommitteeRef,
      dataMinimisationStatement,
    },
  );

  if (rows.length === 0) {
    return NextResponse.json(
      {
        error: `${applicantDid} is not a participant in the graph; onboard the participant first`,
      },
      { status: 404 },
    );
  }

  return NextResponse.json(
    {
      applicationId,
      applicant: applicantDid,
      applicantName: rows[0].applicantName,
      datasetId,
      datasetKnown: rows[0].datasetKnown,
      purpose,
      periodMonths,
      status: "PENDING",
      submittedAt: submittedAt.toISOString(),
      decisionDue: decisionDue.toISOString(),
      article:
        "Regulation (EU) 2025/327, Art. 67(2); the access body decides within three months (Art. 68(4))",
    },
    { status: 201 },
  );
}

export async function GET() {
  const auth = await requireAuth(["HDAB_AUTHORITY", "EDC_ADMIN"]);
  if (isAuthError(auth)) return auth;

  const rows = await runQuery<{
    applicationId: string;
    name: string | null;
    applicant: string | null;
    applicantName: string | null;
    datasetId: string | null;
    datasetTitle: string | null;
    purpose: string | null;
    status: string | null;
    submittedAt: string | null;
    justification: string | null;
    ethicsCommitteeRef: string | null;
    periodMonths: number | null;
    permitId: string | null;
    decision: string | null;
    decidedAt: string | null;
    validUntil: string | null;
    decisionJustification: string | null;
  }>(
    `MATCH (app:AccessApplication)
     OPTIONAL MATCH (p:Participant)-[:SUBMITTED]->(app)
     OPTIONAL MATCH (permit:HDABApproval)-[:APPROVES]->(app)
     OPTIONAL MATCH (permit)-[:GRANTS_ACCESS_TO]->(granted:HealthDataset)
     OPTIONAL MATCH (requested:HealthDataset)
       WHERE coalesce(requested.datasetId, requested.id) = app.datasetId
     RETURN app.applicationId                                   AS applicationId,
            app.name                                            AS name,
            coalesce(p.participantId, p.id)                     AS applicant,
            p.name                                              AS applicantName,
            coalesce(granted.datasetId, granted.id, app.datasetId) AS datasetId,
            coalesce(granted.title, requested.title)            AS datasetTitle,
            app.requestedPurpose                                AS purpose,
            toUpper(coalesce(app.status, ''))                   AS status,
            toString(app.submittedAt)                           AS submittedAt,
            app.justification                                   AS justification,
            app.ethicsCommitteeRef                              AS ethicsCommitteeRef,
            app.processingPeriodMonths                          AS periodMonths,
            permit.approvalId                                   AS permitId,
            toUpper(coalesce(permit.status, ''))                AS decision,
            toString(coalesce(permit.decidedAt, permit.approvedAt)) AS decidedAt,
            toString(permit.validUntil)                         AS validUntil,
            permit.justification                                AS decisionJustification
     ORDER BY app.submittedAt ASC`,
  );

  const now = Date.now();
  const applications = rows.map((r) => {
    const undecided =
      !r.permitId && !["APPROVED", "REJECTED"].includes(r.status ?? "");
    return { ...r, ...decisionClock(r.submittedAt, undecided, now), undecided };
  });
  applications.sort((a, b) => {
    if (a.undecided !== b.undecided) return a.undecided ? -1 : 1;
    return (a.decisionDue ?? "").localeCompare(b.decisionDue ?? "");
  });

  return NextResponse.json({
    applications,
    article:
      "Regulation (EU) 2025/327, Art. 57(1)(e) register; Art. 68(4) three months to decide",
  });
}

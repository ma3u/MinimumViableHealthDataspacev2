import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthError } from "@/lib/auth-guard";
import { runQuery } from "@/lib/neo4j";
import { userToParticipantId } from "@/lib/odrl-engine";
import {
  COMPLETION_WEEKS,
  EXTENSION_MONTHS,
  addMonths,
  applicationClock,
  applicationCompleteness,
  type ApplicationItems,
  type ClockInput,
} from "@/lib/permits";

export const dynamic = "force-dynamic";

/**
 * POST /api/compliance/applications/clock: the access body acts on the
 * Art. 68(4) clock of an application.
 *
 *   INCOMPLETE  the application lacks items of Art. 67(2); the applicant is
 *               told what is missing and has four weeks to complete it. The
 *               three months stop and run again from the complete application.
 *   EXTEND      the three months are extended once, by three, with reasons.
 *
 * Both are recorded on the application and shown to the applicant. Issue
 * #206, M2.
 */

const ACTIONS = ["INCOMPLETE", "EXTEND"] as const;
type Action = (typeof ACTIONS)[number];

interface AppRow extends ClockInput, ApplicationItems {
  applicationId: string;
  status: string;
  decided: boolean;
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth(["HDAB_AUTHORITY"]);
  if (isAuthError(auth)) return auth;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Body must be JSON" }, { status: 400 });
  }
  const applicationId =
    typeof body.applicationId === "string" ? body.applicationId.trim() : "";
  const action = String(body.action ?? "").toUpperCase() as Action;
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  if (!applicationId || !ACTIONS.includes(action)) {
    return NextResponse.json(
      { error: "applicationId and action (INCOMPLETE or EXTEND) are required" },
      { status: 400 },
    );
  }
  if (!reason) {
    return NextResponse.json(
      {
        error:
          action === "EXTEND"
            ? "An extension needs reasons (Art. 68(4))"
            : "Say which Art. 67(2) items are missing (Art. 68(4))",
      },
      { status: 400 },
    );
  }

  const found = await runQuery<AppRow>(
    `MATCH (app:AccessApplication {applicationId: $applicationId})
     OPTIONAL MATCH (permit:HDABApproval)-[:APPROVES]->(app)
     RETURN app.applicationId                 AS applicationId,
            toUpper(coalesce(app.status, '')) AS status,
            permit IS NOT NULL
              OR toUpper(coalesce(app.status, '')) IN ['APPROVED', 'REJECTED', 'REVOKED'] AS decided,
            toString(app.submittedAt)         AS submittedAt,
            toString(app.completedAt)         AS completedAt,
            toString(app.extendedAt)          AS extendedAt,
            toString(app.incompleteNoticeAt)  AS incompleteNoticeAt,
            toString(app.completeBy)          AS completeBy,
            app.namedPersons                  AS namedPersons,
            app.requestedPurpose              AS requestedPurpose,
            app.intendedUse                   AS intendedUse,
            app.requestedData                 AS requestedData,
            app.dataTimeRange                 AS dataTimeRange,
            app.dataFormats                   AS dataFormats,
            app.identifiability               AS identifiability,
            app.pseudonymisationJustification AS pseudonymisationJustification,
            app.datasetsBroughtIn             AS datasetsBroughtIn,
            app.safeguards                    AS safeguards,
            app.processingPeriodMonths        AS processingPeriodMonths,
            app.speTools                      AS speTools,
            app.ethicsCommitteeRef            AS ethicsCommitteeRef,
            app.art71Exception                AS art71Exception,
            app.art71ExceptionJustification   AS art71ExceptionJustification
     LIMIT 1`,
    { applicationId },
  );
  if (found.length === 0) {
    return NextResponse.json(
      { error: `Application ${applicationId} is not in the graph` },
      { status: 404 },
    );
  }
  const app = found[0];
  if (app.decided) {
    return NextResponse.json(
      { error: "The application is decided; the clock has stopped" },
      { status: 409 },
    );
  }
  const before = applicationClock(app, true);

  const { session } = auth;
  const officerDid = userToParticipantId(
    session.user.email ?? session.user.name ?? session.user.id,
    session.roles,
  );
  const at = new Date();

  if (action === "EXTEND") {
    if (before.extended) {
      return NextResponse.json(
        {
          error:
            "The three months were already extended once; Art. 68(4) allows one extension",
        },
        { status: 409 },
      );
    }
    if (before.clockState === "paused") {
      return NextResponse.json(
        {
          error:
            "The clock is stopped until the applicant completes the application; nothing to extend",
        },
        { status: 409 },
      );
    }
    const decisionDue = addMonths(
      new Date(before.decisionDue ?? at.toISOString()),
      EXTENSION_MONTHS,
    );
    await runQuery(
      `MATCH (app:AccessApplication {applicationId: $applicationId})
       SET app.extendedAt      = datetime($at),
           app.extensionReason = $reason,
           app.extendedBy      = $officerDid,
           app.decisionDue     = datetime($decisionDue)`,
      {
        applicationId,
        at: at.toISOString(),
        reason,
        officerDid,
        decisionDue: decisionDue.toISOString(),
      },
    );
    return NextResponse.json({
      applicationId,
      action,
      ...applicationClock({ ...app, extendedAt: at.toISOString() }, true),
      reason,
      article:
        "Regulation (EU) 2025/327, Art. 68(4): the period is extended once by three months, with reasons",
    });
  }

  // INCOMPLETE
  const completeness = applicationCompleteness(app);
  const completeBy = new Date(at.getTime() + COMPLETION_WEEKS * 7 * 86_400_000);
  await runQuery(
    `MATCH (app:AccessApplication {applicationId: $applicationId})
     SET app.incompleteNoticeAt = datetime($at),
         app.incompleteReason   = $reason,
         app.incompleteNoticeBy = $officerDid,
         app.completeBy         = datetime($completeBy),
         app.complete           = false,
         app.status             = 'INCOMPLETE'`,
    {
      applicationId,
      at: at.toISOString(),
      reason,
      officerDid,
      completeBy: completeBy.toISOString(),
    },
  );
  return NextResponse.json({
    applicationId,
    action,
    ...applicationClock(
      {
        ...app,
        incompleteNoticeAt: at.toISOString(),
        completeBy: completeBy.toISOString(),
      },
      true,
    ),
    reason,
    missing: completeness.missing,
    article:
      "Regulation (EU) 2025/327, Art. 68(4): the applicant completes the application within four weeks; the three months run from the complete application",
  });
}

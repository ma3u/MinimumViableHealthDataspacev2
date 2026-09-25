import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthError } from "@/lib/auth-guard";
import { runQuery } from "@/lib/neo4j";
import { userToParticipantId } from "@/lib/odrl-engine";
import {
  DECISION_MONTHS,
  EXTENSION_MONTHS,
  addMonths,
  applicationClock,
  applicationCompleteness,
  type ApplicationItems,
  type ClockInput,
} from "@/lib/permits";
import { itemsFromBody } from "@/lib/applications";

export const dynamic = "force-dynamic";

/**
 * POST /api/compliance/applications/complete: the applicant supplies the
 * Art. 67(2) items the access body asked for. Fields sent replace what was
 * there; fields left out stay. Once every item is present the application
 * counts as complete and the three months of Art. 68(4) run from now. Only
 * the applicant (or the operator) may do this. Issue #206, M1 and M2.
 */

interface AppRow extends ClockInput, ApplicationItems {
  applicationId: string;
  applicantId: string | null;
  status: string;
  decided: boolean;
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
  const applicationId =
    typeof body.applicationId === "string" ? body.applicationId.trim() : "";
  if (!applicationId) {
    return NextResponse.json(
      { error: "applicationId is required" },
      { status: 400 },
    );
  }

  const { session } = auth;
  const callerDid = userToParticipantId(
    session.user.email ?? session.user.name ?? session.user.id,
    session.roles,
  );

  const found = await runQuery<AppRow>(
    `MATCH (app:AccessApplication {applicationId: $applicationId})
     OPTIONAL MATCH (p:Participant)-[:SUBMITTED]->(app)
     OPTIONAL MATCH (permit:HDABApproval)-[:APPROVES]->(app)
     RETURN app.applicationId                 AS applicationId,
            coalesce(app.applicantId, p.participantId, p.id) AS applicantId,
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
  if (app.applicantId !== callerDid && !session.roles.includes("EDC_ADMIN")) {
    return NextResponse.json(
      { error: "Only the applicant completes its own application" },
      { status: 403 },
    );
  }
  if (app.decided) {
    return NextResponse.json(
      { error: "The application is decided" },
      { status: 409 },
    );
  }

  // What was sent replaces what was there; what was left out stays.
  const sent = itemsFromBody(body);
  const merged: ApplicationItems = { ...app };
  for (const [k, v] of Object.entries(sent)) {
    if (v !== null && v !== undefined) {
      (merged as Record<string, unknown>)[k] = v;
    }
  }
  const completeness = applicationCompleteness(merged);
  const at = new Date();
  const wasPaused = applicationClock(app, true).clockState === "paused";
  const restart = completeness.complete && (wasPaused || !app.completedAt);
  const decisionDue = restart
    ? addMonths(at, DECISION_MONTHS + (app.extendedAt ? EXTENSION_MONTHS : 0))
    : null;

  await runQuery(
    `MATCH (app:AccessApplication {applicationId: $applicationId})
     SET app.namedPersons                  = $namedPersons,
         app.intendedUse                   = $intendedUse,
         app.requestedData                 = $requestedData,
         app.dataTimeRange                 = $dataTimeRange,
         app.dataFormats                   = $dataFormats,
         app.identifiability               = $identifiability,
         app.pseudonymisationJustification = $pseudonymisationJustification,
         app.datasetsBroughtIn             = $datasetsBroughtIn,
         app.safeguards                    = $safeguards,
         app.processingPeriodMonths        = $processingPeriodMonths,
         app.speTools                      = $speTools,
         app.ethicsCommitteeRef            = $ethicsCommitteeRef,
         app.art71Exception                = $art71Exception,
         app.art71ExceptionJustification   = $art71ExceptionJustification,
         app.complete                      = $complete,
         app.lastCompletionAt              = datetime($at)
     WITH app
     FOREACH (_ IN CASE WHEN $restart THEN [1] ELSE [] END |
       SET app.completedAt = datetime($at),
           app.decisionDue = datetime($decisionDue),
           app.status      = 'PENDING')`,
    {
      applicationId,
      namedPersons: merged.namedPersons ?? null,
      intendedUse: merged.intendedUse ?? null,
      requestedData: merged.requestedData ?? null,
      dataTimeRange: merged.dataTimeRange ?? null,
      dataFormats: merged.dataFormats ?? null,
      identifiability: merged.identifiability ?? null,
      pseudonymisationJustification:
        merged.pseudonymisationJustification ?? null,
      datasetsBroughtIn: merged.datasetsBroughtIn ?? null,
      safeguards: merged.safeguards ?? null,
      processingPeriodMonths: merged.processingPeriodMonths ?? null,
      speTools: merged.speTools ?? null,
      ethicsCommitteeRef: merged.ethicsCommitteeRef ?? null,
      art71Exception: merged.art71Exception ?? null,
      art71ExceptionJustification: merged.art71ExceptionJustification ?? null,
      complete: completeness.complete,
      at: at.toISOString(),
      restart,
      decisionDue: decisionDue ? decisionDue.toISOString() : null,
    },
  );

  const clock = applicationClock(
    restart ? { ...app, completedAt: at.toISOString() } : app,
    true,
  );
  return NextResponse.json({
    applicationId,
    completeness,
    ...clock,
    restarted: restart,
    article: completeness.complete
      ? "Regulation (EU) 2025/327, Art. 68(4): complete application received; the access body decides within three months"
      : `Regulation (EU) 2025/327, Art. 67(2): ${completeness.missing.length} item(s) still missing`,
  });
}

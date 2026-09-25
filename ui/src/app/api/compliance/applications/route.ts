import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthError } from "@/lib/auth-guard";
import { runQuery } from "@/lib/neo4j";
import { userToParticipantId } from "@/lib/odrl-engine";
import {
  APPLICANT_CATEGORIES,
  DECISION_MONTHS,
  PURPOSES,
  addMonths,
  applicationClock,
  applicationCompleteness,
} from "@/lib/permits";
import {
  APPLICATION_FIELDS,
  itemsFromBody,
  text,
  type InboxRow,
} from "@/lib/applications";

export const dynamic = "force-dynamic";

/**
 * Health data access applications (Regulation (EU) 2025/327, Art. 67).
 *
 * POST: a data user applies for access with the eleven items of Art. 67(2):
 * the applicant and the persons who will access the data, the purpose, the
 * intended use, the requested data, pseudonymised or anonymised, datasets
 * brought in, safeguards, the processing period, the SPE tools, the ethics
 * assessment and any Art. 71(4) exception. Dataset, purpose and
 * justification are the minimum the route accepts; what is missing is
 * reported as such, and the access body can send the applicant back for it
 * (Art. 68(4), the four-week completion window).
 *
 * GET: the access body's inbox, every application with its decision, the
 * Art. 68(4) clock and its completeness; an applicant sees its own.
 * Issue #206, M1 and M2.
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

  const datasetId = text(body, "datasetId") ?? "";
  const purpose = text(body, "purpose") ?? "";
  const justification = text(body, "justification") ?? "";
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
  const items = itemsFromBody(body);
  const periodMonths = items.processingPeriodMonths ?? 12;
  const category = text(body, "applicantCategory")?.toUpperCase() ?? null;
  const applicantCategory =
    category && (APPLICANT_CATEGORIES as readonly string[]).includes(category)
      ? category
      : "COMMERCIAL";
  const dataMinimisationStatement =
    text(body, "dataMinimisationStatement") ?? "";

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
    text(body, "name") ??
    `${purpose.toLowerCase().replace(/_/g, " ")} on ${datasetId}`;
  const completeness = applicationCompleteness({
    ...items,
    requestedPurpose: purpose,
    processingPeriodMonths: periodMonths,
  });

  const rows = await runQuery<{
    applicationId: string;
    applicantName: string | null;
    datasetKnown: boolean;
  }>(
    `MATCH (p:Participant)
     WHERE coalesce(p.participantId, p.id) = $applicantDid
     MERGE (app:AccessApplication {applicationId: $applicationId})
     SET app.name                          = $name,
         app.applicantId                   = $applicantDid,
         app.applicantCategory             = $applicantCategory,
         app.datasetId                     = $datasetId,
         app.requestedPurpose              = $purpose,
         app.submittedAt                   = datetime($submittedAt),
         app.decisionDue                   = datetime($decisionDue),
         app.status                        = 'PENDING',
         app.justification                 = $justification,
         app.processingPeriodMonths        = $periodMonths,
         app.ethicsCommitteeRef            = $ethicsCommitteeRef,
         app.dataMinimisationStatement     = $dataMinimisationStatement,
         app.namedPersons                  = $namedPersons,
         app.intendedUse                   = $intendedUse,
         app.requestedData                 = $requestedData,
         app.dataTimeRange                 = $dataTimeRange,
         app.dataFormats                   = $dataFormats,
         app.identifiability               = $identifiability,
         app.pseudonymisationJustification = $pseudonymisationJustification,
         app.datasetsBroughtIn             = $datasetsBroughtIn,
         app.safeguards                    = $safeguards,
         app.speTools                      = $speTools,
         app.art71Exception                = $art71Exception,
         app.art71ExceptionJustification   = $art71ExceptionJustification,
         app.complete                      = $complete,
         app.ehdsArticle                   = 'Art. 67'
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
      applicantCategory,
      applicationId,
      name,
      datasetId,
      purpose,
      submittedAt: submittedAt.toISOString(),
      decisionDue: decisionDue.toISOString(),
      justification,
      periodMonths,
      ethicsCommitteeRef: items.ethicsCommitteeRef ?? "",
      dataMinimisationStatement,
      namedPersons: items.namedPersons,
      intendedUse: items.intendedUse,
      requestedData: items.requestedData,
      dataTimeRange: items.dataTimeRange,
      dataFormats: items.dataFormats,
      identifiability: items.identifiability,
      pseudonymisationJustification: items.pseudonymisationJustification,
      datasetsBroughtIn: items.datasetsBroughtIn,
      safeguards: items.safeguards,
      speTools: items.speTools,
      art71Exception: items.art71Exception,
      art71ExceptionJustification: items.art71ExceptionJustification,
      complete: completeness.complete,
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
      applicantCategory,
      datasetId,
      datasetKnown: rows[0].datasetKnown,
      purpose,
      periodMonths,
      status: "PENDING",
      submittedAt: submittedAt.toISOString(),
      decisionDue: decisionDue.toISOString(),
      completeness,
      article: completeness.complete
        ? "Regulation (EU) 2025/327, Art. 67(2): complete application; the access body decides within three months (Art. 68(4))"
        : `Regulation (EU) 2025/327, Art. 67(2): ${completeness.missing.length} of the eleven items missing; the access body may ask for them and the three months run from the complete application (Art. 68(4))`,
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

  const rows = await runQuery<InboxRow>(
    `MATCH (app:AccessApplication)
     OPTIONAL MATCH (p:Participant)-[:SUBMITTED]->(app)
     WITH app, p
     WHERE $all OR coalesce(app.applicantId, p.participantId, p.id) = $callerDid
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
            app.requestedPurpose                                AS requestedPurpose,
            toUpper(coalesce(app.status, ''))                   AS status,
            toString(app.submittedAt)                           AS submittedAt,
            app.justification                                   AS justification,
            app.ethicsCommitteeRef                              AS ethicsCommitteeRef,
            app.processingPeriodMonths                          AS periodMonths,
            app.processingPeriodMonths                          AS processingPeriodMonths,
            ${APPLICATION_FIELDS},
            permit.approvalId                                   AS permitId,
            toUpper(coalesce(permit.status, ''))                AS decision,
            toString(coalesce(permit.decidedAt, permit.approvedAt)) AS decidedAt,
            toString(permit.validUntil)                         AS validUntil,
            permit.justification                                AS decisionJustification,
            permit.statisticalAlternativeOffered                AS statisticalAlternativeOffered
     ORDER BY app.submittedAt ASC`,
    { all: isBody, callerDid },
  );

  const now = Date.now();
  const applications = rows.map((r) => {
    const undecided =
      !r.permitId &&
      !["APPROVED", "REJECTED", "REVOKED"].includes(r.status ?? "");
    return {
      ...r,
      ...applicationClock(r, undecided, now),
      completeness: applicationCompleteness(r),
      undecided,
    };
  });
  applications.sort((a, b) => {
    if (a.undecided !== b.undecided) return a.undecided ? -1 : 1;
    return (a.decisionDue ?? "").localeCompare(b.decisionDue ?? "");
  });

  return NextResponse.json({
    applications,
    scope: isBody ? "all" : "own",
    article:
      "Regulation (EU) 2025/327, Art. 57(1)(e) register; Art. 67(2) eleven items; Art. 68(4) three months to decide from a complete application",
  });
}

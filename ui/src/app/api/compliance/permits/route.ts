import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthError } from "@/lib/auth-guard";
import { runQuery } from "@/lib/neo4j";
import { userToParticipantId } from "@/lib/odrl-engine";
import {
  CRITERIA,
  PURPOSES,
  PUBLISH_WORKING_DAYS,
  addMonths,
  addWorkingDays,
} from "@/lib/permits";
import { estimateFee, type FeeEstimate } from "@/lib/fees";

export const dynamic = "force-dynamic";

/**
 * POST /api/compliance/permits: the health data access body decides on an
 * access application (Regulation (EU) 2025/327, Art. 68).
 *
 * Approve, and a data permit is issued: the HDABApproval carries the decision
 * date, the Art. 53(1) purpose, the validity period, the conditions and the
 * Art. 68(1)(a) to (h) criteria as assessed, and GRANTS_ACCESS_TO the dataset.
 * Refuse, and the justification is recorded, because Art. 57(1)(j)(iii)
 * publishes refusals with their justification within 30 working days.
 *
 * One decision per application (permit-<applicationId>); deciding again
 * replaces it, which is what a demo needs when the same application is
 * refused and then approved in front of an audience. Issue #206, M2.
 */

const DECISIONS = ["APPROVED", "REJECTED"] as const;
type Decision = (typeof DECISIONS)[number];

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
  const decision = String(body.decision ?? "").toUpperCase() as Decision;
  if (!applicationId || !DECISIONS.includes(decision)) {
    return NextResponse.json(
      {
        error: "applicationId and decision (APPROVED or REJECTED) are required",
      },
      { status: 400 },
    );
  }

  const justification =
    typeof body.justification === "string" ? body.justification.trim() : "";
  if (decision === "REJECTED" && !justification) {
    return NextResponse.json(
      {
        error:
          "A refusal needs a written justification: Art. 57(1)(j)(iii) publishes it with the decision",
      },
      { status: 400 },
    );
  }

  const purpose =
    typeof body.purpose === "string" &&
    (PURPOSES as readonly string[]).includes(body.purpose)
      ? body.purpose
      : null;

  const decidedAt = new Date();
  let validUntil: Date | null = null;
  if (decision === "APPROVED") {
    validUntil =
      typeof body.validUntil === "string" &&
      !Number.isNaN(Date.parse(body.validUntil))
        ? new Date(body.validUntil)
        : addMonths(decidedAt, 12);
    if (validUntil.getTime() <= decidedAt.getTime()) {
      return NextResponse.json(
        { error: "validUntil must lie in the future" },
        { status: 400 },
      );
    }
  }

  const conditions: string[] = Array.isArray(body.conditions)
    ? body.conditions
        .map(String)
        .map((s) => s.trim())
        .filter(Boolean)
    : typeof body.conditions === "string"
      ? body.conditions
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean)
      : [];

  const criteria =
    body.criteria && typeof body.criteria === "object"
      ? Object.fromEntries(
          CRITERIA.map((k) => [
            k,
            Boolean((body.criteria as Record<string, unknown>)[k]),
          ]),
        )
      : null;

  const riskNote =
    typeof body.riskNote === "string" ? body.riskNote.trim() : "";
  // Art. 68(3): with a refusal the body may offer an anonymised statistical
  // answer instead of the data (a health data request under Art. 69).
  const statisticalAlternative =
    decision === "REJECTED" && body.statisticalAlternative === true;
  const datasetId =
    typeof body.datasetId === "string" && body.datasetId.trim()
      ? body.datasetId.trim()
      : null;

  const { session } = auth;
  const deciderDid = userToParticipantId(
    session.user.email ?? session.user.name ?? session.user.id,
    session.roles,
  );
  const officer = session.user.name ?? session.user.email ?? session.user.id;
  const permitId = `permit-${applicationId}`;
  const publishBy = addWorkingDays(decidedAt, PUBLISH_WORKING_DAYS);

  // Art. 62: the fee on an issued permit, from what the application says
  // about the applicant, the period and the form of the data; reduced for
  // the categories of Art. 62(3).
  let fee: FeeEstimate | null = null;
  if (decision === "APPROVED") {
    const app = await runQuery<{
      applicantCategory: string | null;
      processingPeriodMonths: number | null;
      identifiability: string | null;
    }>(
      `MATCH (app:AccessApplication {applicationId: $applicationId})
       RETURN app.applicantCategory AS applicantCategory,
              app.processingPeriodMonths AS processingPeriodMonths,
              app.identifiability AS identifiability
       LIMIT 1`,
      { applicationId },
    );
    if (app.length > 0) {
      fee = estimateFee({
        applicantCategory: app[0].applicantCategory,
        processingPeriodMonths: app[0].processingPeriodMonths,
        identifiability: app[0].identifiability,
      });
    }
  }

  const rows = await runQuery<{
    applicant: string | null;
    applicantName: string | null;
    datasetId: string | null;
    purpose: string | null;
  }>(
    `MATCH (app:AccessApplication {applicationId: $applicationId})
     OPTIONAL MATCH (applicant:Participant)-[:SUBMITTED]->(app)
     MERGE (permit:HDABApproval {approvalId: $permitId})
     SET permit.status           = $decision,
         permit.name             = $name,
         permit.applicationId    = app.applicationId,
         permit.decidedAt        = datetime($decidedAt),
         permit.approvedAt       = CASE WHEN $decision = 'APPROVED' THEN datetime($decidedAt) ELSE null END,
         permit.validFrom        = CASE WHEN $decision = 'APPROVED' THEN datetime($decidedAt) ELSE null END,
         permit.validUntil       = CASE WHEN $validUntil IS NULL THEN null ELSE datetime($validUntil) END,
         permit.permittedPurpose = CASE WHEN $decision = 'APPROVED' THEN coalesce($purpose, app.requestedPurpose) ELSE 'NONE' END,
         permit.conditions       = $conditions,
         permit.justification    = $justification,
         permit.criteria         = $criteria,
         permit.riskNote         = $riskNote,
         permit.statisticalAlternativeOffered = $statisticalAlternative,
         permit.feeEur           = $feeEur,
         permit.feeBodyEur       = $feeBodyEur,
         permit.feeHolderEur     = $feeHolderEur,
         permit.feeCategory      = $feeCategory,
         permit.feeReduction     = $feeReduction,
         permit.hdabOfficer      = $officer,
         permit.decidedBy        = $deciderDid,
         permit.ehdsArticle      = 'Art. 68',
         permit.publishBy        = date($publishBy),
         app.status              = $decision,
         app.decidedAt           = datetime($decidedAt)
     MERGE (permit)-[:APPROVES]->(app)
     WITH permit, app, applicant
     OPTIONAL MATCH (permit)-[old:GRANTS_ACCESS_TO]->()
     WITH permit, app, applicant, collect(old) AS olds
     FOREACH (o IN olds | DELETE o)
     WITH permit, app, applicant
     OPTIONAL MATCH (hdab:Participant)
       WHERE coalesce(hdab.participantId, hdab.id) = $deciderDid
     FOREACH (_ IN CASE WHEN hdab IS NOT NULL THEN [1] ELSE [] END |
       MERGE (permit)-[:ISSUED_BY]->(hdab)
       MERGE (hdab)-[:REVIEWED]->(app))
     WITH permit, app, applicant
     OPTIONAL MATCH (ds:HealthDataset)
       WHERE coalesce(ds.datasetId, ds.id) = coalesce($datasetId, app.datasetId)
     FOREACH (_ IN CASE WHEN ds IS NOT NULL AND $decision = 'APPROVED' THEN [1] ELSE [] END |
       MERGE (permit)-[:GRANTS_ACCESS_TO]->(ds))
     RETURN coalesce(applicant.participantId, applicant.id) AS applicant,
            applicant.name                                  AS applicantName,
            coalesce(ds.datasetId, ds.id, app.datasetId)    AS datasetId,
            permit.permittedPurpose                         AS purpose
     LIMIT 1`,
    {
      applicationId,
      permitId,
      decision,
      name:
        decision === "APPROVED"
          ? `Data permit for ${applicationId}`
          : `Refusal of ${applicationId}`,
      decidedAt: decidedAt.toISOString(),
      validUntil: validUntil ? validUntil.toISOString() : null,
      purpose,
      conditions,
      justification,
      criteria: criteria ? JSON.stringify(criteria) : null,
      riskNote,
      statisticalAlternative,
      feeEur: fee ? fee.totalEur : null,
      feeBodyEur: fee ? fee.bodyEur : null,
      feeHolderEur: fee ? fee.holderEur : null,
      feeCategory: fee ? fee.category : null,
      feeReduction: fee ? fee.reduction : null,
      officer,
      deciderDid,
      datasetId,
      publishBy: publishBy.toISOString().slice(0, 10),
    },
  );

  if (rows.length === 0) {
    return NextResponse.json(
      { error: `Application ${applicationId} is not in the graph` },
      { status: 404 },
    );
  }
  const row = rows[0];
  return NextResponse.json({
    permitId,
    applicationId,
    decision,
    applicant: row.applicant,
    applicantName: row.applicantName,
    datasetId: row.datasetId,
    purpose: row.purpose,
    validUntil: validUntil ? validUntil.toISOString() : null,
    decidedAt: decidedAt.toISOString(),
    decidedBy: deciderDid,
    officer,
    conditions,
    justification,
    criteria,
    statisticalAlternative,
    fee,
    publishBy: publishBy.toISOString().slice(0, 10),
    article:
      decision === "APPROVED"
        ? "Regulation (EU) 2025/327, Art. 68(3): data permit issued"
        : statisticalAlternative
          ? "Regulation (EU) 2025/327, Art. 68(3): application refused; an anonymised statistical answer is offered instead (Art. 69)"
          : "Regulation (EU) 2025/327, Art. 68(3): application refused",
  });
}

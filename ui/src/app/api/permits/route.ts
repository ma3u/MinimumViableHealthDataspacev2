import { NextResponse } from "next/server";
import { runQuery } from "@/lib/neo4j";
import {
  PUBLISH_WORKING_DAYS,
  addWorkingDays,
  decisionClock,
  parseGraphTime,
} from "@/lib/permits";

export const dynamic = "force-dynamic";

/**
 * GET /api/permits: the public register of the health data access body.
 * No session: Regulation (EU) 2025/327 wants this public.
 *
 *   Art. 57(1)(j)(ii)  every application received, without undue delay
 *   Art. 57(1)(j)(iii) permits issued and refusals with their justification,
 *                      within 30 working days of the decision
 *   Art. 57(1)(j)(iv)  measures related to non-compliance (Art. 63), so a
 *                      revoked permit stays listed with the reason
 *   Art. 58(1)(f)      who has been granted access to which datasets, and
 *                      the purposes of the permit
 *
 * Only what those provisions need leaves this route: the applicant
 * organisation, purpose, dataset, dates, decision, conditions and the written
 * justification. No officer names and no ethics references. Issue #206, M2.
 */

interface RegisterRow {
  applicationId: string;
  applicant: string | null;
  applicantDid: string | null;
  applicantCountry: string | null;
  accessBody: string | null;
  purpose: string | null;
  datasetId: string | null;
  datasetTitle: string | null;
  submittedAt: string | null;
  applicationStatus: string;
  permitId: string | null;
  decision: string;
  decidedAt: string | null;
  validUntil: string | null;
  conditions: unknown;
  justification: string | null;
  publishBy: string | null;
  revokedAt: string | null;
  revocationReason: string | null;
}

export async function GET() {
  try {
    const rows = await runQuery<RegisterRow>(
      `MATCH (app:AccessApplication)
       OPTIONAL MATCH (p:Participant)-[:SUBMITTED]->(app)
       OPTIONAL MATCH (permit:HDABApproval)-[:APPROVES]->(app)
       OPTIONAL MATCH (permit)-[:GRANTS_ACCESS_TO]->(granted:HealthDataset)
       OPTIONAL MATCH (requested:HealthDataset)
         WHERE coalesce(requested.datasetId, requested.id) = app.datasetId
       OPTIONAL MATCH (permit)-[:ISSUED_BY]->(hdab:Participant)
       RETURN app.applicationId                                   AS applicationId,
              p.name                                              AS applicant,
              coalesce(p.participantId, p.id)                     AS applicantDid,
              p.country                                           AS applicantCountry,
              hdab.name                                           AS accessBody,
              coalesce(permit.permittedPurpose, app.requestedPurpose) AS purpose,
              coalesce(granted.datasetId, granted.id, app.datasetId) AS datasetId,
              coalesce(granted.title, requested.title, granted.name, requested.name) AS datasetTitle,
              toString(app.submittedAt)                           AS submittedAt,
              toUpper(coalesce(app.status, ''))                   AS applicationStatus,
              permit.approvalId                                   AS permitId,
              toUpper(coalesce(permit.status, ''))                AS decision,
              toString(coalesce(permit.decidedAt, permit.approvedAt)) AS decidedAt,
              toString(permit.validUntil)                         AS validUntil,
              permit.conditions                                   AS conditions,
              permit.justification                                AS justification,
              toString(permit.publishBy)                          AS publishBy,
              toString(permit.revokedAt)                          AS revokedAt,
              permit.revocationReason                             AS revocationReason
       ORDER BY coalesce(permit.decidedAt, permit.approvedAt, app.submittedAt) DESC`,
    );

    const now = Date.now();
    const entries = rows.map((r) => {
      const decided = ["APPROVED", "REJECTED", "REVOKED"].includes(r.decision);
      const undecided =
        !decided &&
        !["APPROVED", "REJECTED", "REVOKED"].includes(r.applicationStatus);
      const decidedAt = parseGraphTime(r.decidedAt);
      const publishByMs = r.publishBy
        ? Date.parse(r.publishBy.slice(0, 10))
        : decidedAt !== null
          ? addWorkingDays(new Date(decidedAt), PUBLISH_WORKING_DAYS).getTime()
          : null;
      const outcome =
        r.decision === "APPROVED"
          ? "permit issued"
          : r.decision === "REJECTED"
            ? "refused"
            : r.decision === "REVOKED"
              ? "permit revoked"
              : "pending";
      return {
        applicationId: r.applicationId,
        applicant: r.applicant,
        applicantDid: r.applicantDid,
        applicantCountry: r.applicantCountry,
        accessBody: r.accessBody,
        purpose: r.purpose,
        datasetId: r.datasetId,
        datasetTitle: r.datasetTitle,
        submittedAt: r.submittedAt,
        outcome,
        permitId: r.permitId,
        decidedAt: r.decidedAt,
        validUntil: r.validUntil,
        conditions: Array.isArray(r.conditions)
          ? r.conditions.map(String)
          : r.conditions
            ? [String(r.conditions)]
            : [],
        justification: r.justification,
        publishBy:
          publishByMs !== null
            ? new Date(publishByMs).toISOString().slice(0, 10)
            : null,
        revokedAt: r.revokedAt,
        revocationReason: r.revocationReason,
        ...decisionClock(r.submittedAt, undecided, now),
      };
    });

    return NextResponse.json({
      generatedAt: new Date(now).toISOString(),
      entries,
      articles: {
        applications: "Art. 57(1)(j)(ii)",
        decisions: "Art. 57(1)(j)(iii), within 30 working days",
        revocations: "Art. 57(1)(j)(iv), Art. 63(3)",
        naturalPersons: "Art. 58(1)(f)",
      },
    });
  } catch (err) {
    console.error("Failed to read the permits register:", err);
    return NextResponse.json(
      {
        error: "The register is unavailable",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 502 },
    );
  }
}

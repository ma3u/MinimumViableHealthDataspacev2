import { NextResponse } from "next/server";
import { runQuery } from "@/lib/neo4j";
import {
  PUBLISH_WORKING_DAYS,
  addWorkingDays,
  applicationClock,
  decisionClock,
  parseGraphTime,
} from "@/lib/permits";
import { resultsDeadline, type ResultRow } from "@/lib/results";

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
  statisticalAlternativeOffered: boolean | null;
  complete: boolean | null;
  completedAt: string | null;
  extendedAt: string | null;
  incompleteNoticeAt: string | null;
  completeBy: string | null;
  feeEur: number | null;
  resultsCommunicatedAt: string | null;
  resultsCount: number | null;
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
       OPTIONAL MATCH (rc:ResultCommunication)-[:RESULT_OF]->(permit)
       WITH app, p, permit, granted, requested, hdab,
            count(rc) AS resultsCount, min(toString(rc.communicatedAt)) AS resultsCommunicatedAt
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
              permit.revocationReason                             AS revocationReason,
              permit.statisticalAlternativeOffered                AS statisticalAlternativeOffered,
              app.complete                                        AS complete,
              toString(app.completedAt)                           AS completedAt,
              toString(app.extendedAt)                            AS extendedAt,
              toString(app.incompleteNoticeAt)                    AS incompleteNoticeAt,
              toString(app.completeBy)                            AS completeBy,
              permit.feeEur                                       AS feeEur,
              resultsCommunicatedAt                               AS resultsCommunicatedAt,
              resultsCount                                        AS resultsCount
       ORDER BY coalesce(permit.decidedAt, permit.approvedAt, app.submittedAt) DESC`,
    );

    // Health data requests (Art. 69) are published alongside applications.
    const requestRows = await runQuery<{
      requestId: string;
      applicant: string | null;
      applicantDid: string | null;
      applicantCountry: string | null;
      accessBody: string | null;
      purpose: string | null;
      datasetId: string | null;
      datasetTitle: string | null;
      submittedAt: string | null;
      status: string;
      decidedAt: string | null;
      justification: string | null;
      publishBy: string | null;
      statisticalContent: string | null;
      decidedUnder: string | null;
      feeEur: number | null;
    }>(
      `MATCH (r:HealthDataRequest)
       OPTIONAL MATCH (p:Participant)-[:SUBMITTED]->(r)
       OPTIONAL MATCH (ds:HealthDataset)
         WHERE coalesce(ds.datasetId, ds.id) = r.datasetId
       OPTIONAL MATCH (hdab:Participant)
         WHERE r.decidedBy IS NOT NULL AND coalesce(hdab.participantId, hdab.id) = r.decidedBy
       RETURN r.requestId                     AS requestId,
              p.name                          AS applicant,
              coalesce(p.participantId, p.id) AS applicantDid,
              p.country                       AS applicantCountry,
              hdab.name                       AS accessBody,
              r.purpose                       AS purpose,
              r.datasetId                     AS datasetId,
              coalesce(ds.title, ds.name)     AS datasetTitle,
              toString(r.submittedAt)         AS submittedAt,
              toUpper(coalesce(r.status, '')) AS status,
              toString(r.decidedAt)           AS decidedAt,
              r.justification                 AS justification,
              toString(r.publishBy)           AS publishBy,
              r.statisticalContent            AS statisticalContent,
              r.decidedUnder                  AS decidedUnder,
              r.feeEur                        AS feeEur
       ORDER BY coalesce(r.decidedAt, r.submittedAt) DESC`,
    );

    const now = Date.now();
    const requestEntries = requestRows.map((r) => {
      const undecided = r.status === "PENDING";
      const outcome =
        r.status === "ANSWERED" || r.status === "APPROVED"
          ? "request approved"
          : r.status === "REJECTED"
            ? "refused"
            : "pending";
      return {
        kind: "request" as const,
        applicationId: r.requestId,
        applicant: r.applicant,
        applicantDid: r.applicantDid,
        applicantCountry: r.applicantCountry,
        accessBody: r.accessBody,
        purpose: r.purpose,
        datasetId: r.datasetId,
        datasetTitle: r.datasetTitle,
        submittedAt: r.submittedAt,
        outcome,
        permitId: null,
        decidedAt: r.decidedAt,
        validUntil: null,
        conditions: r.statisticalContent
          ? [`Statistic: ${r.statisticalContent}`]
          : [],
        justification: r.justification,
        publishBy: r.publishBy ? r.publishBy.slice(0, 10) : null,
        revokedAt: null,
        revocationReason: null,
        statisticalAlternativeOffered: false,
        complete: null,
        decidedUnder: r.decidedUnder,
        feeEur: r.feeEur,
        results: null,
        ...decisionClock(r.submittedAt, undecided, now),
        clockState: undecided ? "running" : "decided",
        completeBy: null,
        daysToComplete: null,
        extended: false,
      };
    });

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
        kind: "application" as const,
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
        statisticalAlternativeOffered: r.statisticalAlternativeOffered === true,
        complete: r.complete,
        decidedUnder: r.decision ? "Art. 68" : null,
        feeEur: r.feeEur,
        // Art. 61(4): results due 18 months after the end of the processing
        results:
          r.decision === "APPROVED" || r.decision === "REVOKED"
            ? {
                deadline: resultsDeadline(r.validUntil),
                communicatedAt: r.resultsCommunicatedAt,
                count: Number(r.resultsCount ?? 0),
                onTime:
                  r.resultsCommunicatedAt && resultsDeadline(r.validUntil)
                    ? (parseGraphTime(r.resultsCommunicatedAt) ?? 0) <=
                      (parseGraphTime(resultsDeadline(r.validUntil)) ?? 0)
                    : null,
              }
            : null,
        ...applicationClock(r, undecided, now),
      };
    });

    // Measures taken in relation to non-compliance (Art. 57(1)(j)(iv), Art.
    // 63(3)): every closed finding with a measure, the party, the date and
    // the written reason. Open findings are not published; the party is
    // still stating its views (Art. 63(2)).
    const measures = await runQuery<{
      findingId: string;
      party: string | null;
      partyDid: string | null;
      permitId: string | null;
      measure: string;
      note: string | null;
      exclusionMonths: number | null;
      fineEur: number | null;
      notifiedAt: string | null;
      closedAt: string | null;
      accessBody: string | null;
    }>(
      `MATCH (f:NonComplianceFinding)
       WHERE toUpper(coalesce(f.status, '')) = 'CLOSED'
         AND f.measure IS NOT NULL AND f.measure <> 'NONE'
       OPTIONAL MATCH (f)-[:AGAINST]->(party:Participant)
       OPTIONAL MATCH (hdab:Participant)-[:FOUND]->(f)
       RETURN f.findingId            AS findingId,
              party.name             AS party,
              f.partyId              AS partyDid,
              f.permitId             AS permitId,
              f.measure              AS measure,
              f.measureNote          AS note,
              f.exclusionMonths      AS exclusionMonths,
              f.fineEur              AS fineEur,
              toString(f.notifiedAt) AS notifiedAt,
              toString(f.closedAt)   AS closedAt,
              hdab.name              AS accessBody
       ORDER BY f.closedAt DESC`,
    );

    // Results communicated by data users (Art. 61(4), Art. 57(1)(j)(v)).
    const results = await runQuery<ResultRow>(
      `MATCH (rc:ResultCommunication)
       OPTIONAL MATCH (rc)-[:RESULT_OF]->(permit:HDABApproval)
       OPTIONAL MATCH (permit)-[:GRANTS_ACCESS_TO]->(ds:HealthDataset)
       OPTIONAL MATCH (p:Participant)
         WHERE coalesce(p.participantId, p.id) = rc.applicantId
       RETURN rc.resultId AS resultId, rc.permitId AS permitId,
              rc.applicantId AS applicant, p.name AS applicantName,
              coalesce(ds.datasetId, ds.id) AS datasetId,
              coalesce(ds.title, ds.name) AS datasetTitle,
              rc.kind AS kind, rc.title AS title, rc.summary AS summary,
              rc.url AS url, toString(rc.communicatedAt) AS communicatedAt,
              toString(rc.deadline) AS deadline, rc.onTime AS onTime
       ORDER BY rc.communicatedAt DESC`,
    );

    const all = [...entries, ...requestEntries].sort((a, b) =>
      (b.decidedAt ?? b.submittedAt ?? "").localeCompare(
        a.decidedAt ?? a.submittedAt ?? "",
      ),
    );

    return NextResponse.json({
      generatedAt: new Date(now).toISOString(),
      entries: all,
      measures,
      results,
      articles: {
        requests: "Art. 69, published under Art. 57(1)(j)(ii) and (iii)",
        applications: "Art. 57(1)(j)(ii)",
        decisions: "Art. 57(1)(j)(iii), within 30 working days",
        revocations: "Art. 57(1)(j)(iv), Art. 63(3)",
        measures: "Art. 57(1)(j)(iv), Art. 63(3), Art. 64",
        results:
          "Art. 57(1)(j)(v), Art. 61(4), within 18 months of the end of processing",
        fees: "Art. 62",
        trustedHolders: "Art. 72",
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

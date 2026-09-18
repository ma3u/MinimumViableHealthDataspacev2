import { NextRequest, NextResponse } from "next/server";
import { runQuery } from "@/lib/neo4j";
import {
  buildActivityReport,
  reportPeriod,
  toMarkdown,
  type AccessRow,
  type ApplicationRow,
  type BodyRow,
  type LabelRow,
  type RequestRow,
} from "@/lib/activity-report";

export const dynamic = "force-dynamic";

/**
 * GET /api/activity-report[?from=YYYY-MM-DD&to=YYYY-MM-DD&format=md]
 *
 * The activity report of the health data access body, Regulation (EU)
 * 2025/327 Art. 59(1)(a) to (k), generated from the graph for the period
 * (default: the last 24 months). No session: the regulation wants the
 * report published on the body's website. Nothing personal leaves this
 * route: organisations, counts, dates and reasons. Issue #206, M6.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const { from, to } = reportPeriod(params.get("from"), params.get("to"));
  const window = { from: from.toISOString(), to: to.toISOString() };

  try {
    const [bodies, applications, requests, access, labels] = await Promise.all([
      runQuery<BodyRow>(
        `MATCH (h:Participant)
           WHERE toUpper(coalesce(h.participantType, '')) = 'HDAB'
           RETURN h.name AS name,
                  coalesce(h.participantId, h.id) AS did,
                  h.country AS country
           ORDER BY h.name`,
      ),
      runQuery<ApplicationRow>(
        `MATCH (app:AccessApplication)
           OPTIONAL MATCH (p:Participant)-[:SUBMITTED]->(app)
           OPTIONAL MATCH (permit:HDABApproval)-[:APPROVES]->(app)
           OPTIONAL MATCH (permit)-[:GRANTS_ACCESS_TO]->(granted:HealthDataset)
           OPTIONAL MATCH (requested:HealthDataset)
             WHERE coalesce(requested.datasetId, requested.id) = app.datasetId
           OPTIONAL MATCH (t:DataTransfer)-[:UNDER_PERMIT]->(permit)
           OPTIONAL MATCH (te:TransferEvent)-[:UNDER_PERMIT]->(permit)
           WITH app, p, permit, granted, requested,
                collect(DISTINCT toString(t.timestamp)) + collect(DISTINCT toString(te.timestamp)) AS accessTimes
           RETURN app.applicationId AS applicationId,
                  p.name AS applicant,
                  p.participantType AS applicantType,
                  coalesce(permit.permittedPurpose, app.requestedPurpose) AS purpose,
                  toString(app.submittedAt) AS submittedAt,
                  permit.approvalId AS permitId,
                  permit.status AS permitStatus,
                  toString(coalesce(permit.decidedAt, permit.approvedAt)) AS decidedAt,
                  toString(permit.revokedAt) AS revokedAt,
                  permit.revocationReason AS revocationReason,
                  coalesce(granted.datasetId, granted.id, app.datasetId) AS datasetId,
                  coalesce(granted.title, requested.title, granted.name, requested.name) AS datasetTitle,
                  reduce(m = null, x IN accessTimes |
                    CASE WHEN x IS NULL OR x = 'null' THEN m
                         WHEN m IS NULL OR x < m THEN x ELSE m END) AS firstAccessAt
           ORDER BY app.submittedAt`,
      ),
      runQuery<RequestRow>(
        `MATCH (r:HealthDataRequest)
           RETURN r.requestId AS requestId,
                  r.status AS status,
                  r.purpose AS purpose,
                  toString(r.submittedAt) AS submittedAt`,
      ),
      runQuery<AccessRow>(
        `MATCH (te:TransferEvent)
           WHERE te.timestamp IS NULL
              OR (datetime(toString(te.timestamp)) >= datetime($from)
                  AND datetime(toString(te.timestamp)) <= datetime($to))
           WITH coalesce(te.consumerDid, te.participant, 'unknown') AS consumer, te
           OPTIONAL MATCH (c:Participant)
             WHERE coalesce(c.participantId, c.id) = consumer
           RETURN consumer,
                  head(collect(DISTINCT c.name)) AS consumerName,
                  count(te) AS events,
                  count(te.permitId) AS underPermit,
                  count(CASE WHEN toInteger(te.statusCode) = 403 THEN 1 END) AS refused,
                  count(DISTINCT te.permitId) AS permits
           ORDER BY events DESC`,
        window,
      ),
      runQuery<LabelRow>(
        `MATCH (vc:VerifiableCredential {credentialType: 'DataQualityLabelCredential'})
           OPTIONAL MATCH (holder:Participant)-[:HOLDS_CREDENTIAL]->(vc)
           RETURN vc.credentialId AS credentialId,
                  vc.datasetId AS datasetId,
                  head(collect(DISTINCT holder.name)) AS holder,
                  vc.completeness AS completeness,
                  vc.conformance AS conformance,
                  vc.timeliness AS timeliness,
                  vc.eehrxfCoverage AS coverage,
                  toString(vc.assessmentDate) AS assessmentDate,
                  vc.status AS status
           ORDER BY vc.credentialId`,
      ),
    ]);

    const report = buildActivityReport({
      bodies,
      applications,
      requests,
      access,
      labels,
      from,
      to,
    });

    if (params.get("format") === "md") {
      return new NextResponse(toMarkdown(report), {
        status: 200,
        headers: {
          "Content-Type": "text/markdown; charset=utf-8",
          "Content-Disposition": `inline; filename="activity-report-${report.period.to.slice(
            0,
            10,
          )}.md"`,
        },
      });
    }
    return NextResponse.json(report);
  } catch (err) {
    console.error("GET /api/activity-report error:", err);
    return NextResponse.json(
      {
        error: "Neo4j unavailable",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 502 },
    );
  }
}

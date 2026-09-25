import { NextResponse } from "next/server";
import { runQuery } from "@/lib/neo4j";
import {
  BODY_FEES,
  CATEGORY_REDUCTION,
  HOLDER_FEES,
  REQUEST_FEE_EUR,
} from "@/lib/fees";
import { RETENTION_MONTHS } from "@/lib/retention";
import { resultsDeadline, type ResultRow } from "@/lib/results";

export const dynamic = "force-dynamic";

/**
 * GET /api/information: what the access body tells the public about
 * secondary use, Regulation (EU) 2025/327 Art. 58(1). No session. The
 * fixed parts (legal basis, safeguards, rights, how to exercise them) are on
 * the page; this route serves what comes from the graph: the access bodies
 * and their contact (e), who has been granted access to which datasets and
 * for what purpose (f), the results of the projects (g), the fee schedule
 * (Art. 62) and the number of persons who opted out (Art. 71). Issue #206, M6.
 */
export async function GET() {
  try {
    const [bodies, access, results, optOuts] = await Promise.all([
      runQuery<{
        name: string;
        did: string;
        country: string | null;
        contactName: string | null;
        contactEmail: string | null;
      }>(
        `MATCH (h:Participant)
         WHERE toUpper(coalesce(h.participantType, '')) = 'HDAB'
            OR coalesce(h.participantId, h.id) ENDS WITH ':hdab'
         RETURN h.name AS name,
                coalesce(h.participantId, h.id) AS did,
                h.country AS country,
                h.complianceOfficerName AS contactName,
                h.complianceOfficerEmail AS contactEmail
         ORDER BY h.name`,
      ),
      runQuery<{
        permitId: string;
        applicant: string | null;
        applicantCountry: string | null;
        datasetId: string | null;
        datasetTitle: string | null;
        holder: string | null;
        purpose: string | null;
        validFrom: string | null;
        validUntil: string | null;
        status: string;
      }>(
        `MATCH (permit:HDABApproval)
         WHERE toUpper(coalesce(permit.status, '')) IN ['APPROVED', 'REVOKED']
         OPTIONAL MATCH (permit)-[:APPROVES]->(app:AccessApplication)
         OPTIONAL MATCH (p:Participant)-[:SUBMITTED]->(app)
         OPTIONAL MATCH (permit)-[:GRANTS_ACCESS_TO]->(ds:HealthDataset)
         OPTIONAL MATCH (holder:Participant)-[:OFFERS]->(:DataProduct)-[:DESCRIBED_BY]->(ds)
         RETURN permit.approvalId AS permitId,
                p.name AS applicant,
                p.country AS applicantCountry,
                coalesce(ds.datasetId, ds.id, app.datasetId) AS datasetId,
                coalesce(ds.title, ds.name) AS datasetTitle,
                head(collect(DISTINCT holder.name)) AS holder,
                coalesce(permit.permittedPurpose, app.requestedPurpose) AS purpose,
                toString(coalesce(permit.validFrom, permit.approvedAt, permit.decidedAt)) AS validFrom,
                toString(permit.validUntil) AS validUntil,
                toUpper(permit.status) AS status
         ORDER BY validFrom DESC`,
      ),
      runQuery<ResultRow>(
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
      ),
      runQuery<{ optedOut: number; patients: number }>(
        `OPTIONAL MATCH (c:PatientConsent)
           WHERE toLower(coalesce(c.consentType, c.type, '')) CONTAINS 'secondary'
             AND toLower(coalesce(c.status, '')) IN ['withdrawn', 'denied', 'opted_out', 'opt-out', 'refused']
         WITH count(c) AS optedOut
         OPTIONAL MATCH (p:Patient)
         RETURN optedOut, count(p) AS patients`,
      ),
    ]);
    return NextResponse.json({
      article: "Regulation (EU) 2025/327, Art. 58(1)",
      generatedAt: new Date().toISOString(),
      bodies,
      access: access.map((a) => ({
        ...a,
        resultsDue: resultsDeadline(a.validUntil),
      })),
      results,
      optOut: {
        article: "Art. 71",
        optedOut: Number(optOuts[0]?.optedOut ?? 0),
        patients: Number(optOuts[0]?.patients ?? 0),
      },
      retention: { months: RETENTION_MONTHS, article: "Art. 73(1)(e)" },
      fees: {
        article: "Art. 62",
        currency: "EUR",
        body: BODY_FEES,
        holder: HOLDER_FEES,
        requestEur: REQUEST_FEE_EUR,
        reductions: CATEGORY_REDUCTION,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: "Neo4j unavailable", detail: String(err) },
      { status: 502 },
    );
  }
}

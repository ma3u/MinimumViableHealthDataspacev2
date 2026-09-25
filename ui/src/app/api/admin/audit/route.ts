import neo4j from "neo4j-driver";
import { getServerSession } from "next-auth/next";
import { NextRequest, NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { runQuery } from "@/lib/neo4j";

export const dynamic = "force-dynamic";

/**
 * Audit & Provenance is the regulator's supervision toolkit (Regulation (EU)
 * 2025/327: Art. 57 tasks of the health data access body, Art. 63 and 64
 * enforcement and fines, Art. 65 cooperation with the GDPR supervisory
 * authorities), not just a dataspace-operator dashboard. Allow EDC_ADMIN and
 * HDAB_AUTHORITY (BSI C5 IAM-01 / OWASP A01).
 */
async function requireAuditAccess(): Promise<NextResponse | null> {
  const session = await getServerSession(authOptions);
  const roles = (session as { roles?: string[] } | null)?.roles ?? [];
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!roles.includes("EDC_ADMIN") && !roles.includes("HDAB_AUTHORITY")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}

/**
 * Every query goes over Bolt through the shared driver in lib/neo4j.ts, the
 * same path the graph and catalog routes use. Until 2026-09-17 this route
 * called Neo4j's transactional HTTP API on port 7474 instead. The compose
 * stack publishes that port, Azure Container Apps does not (mvhd-neo4j has
 * TCP ingress on 7687 only), so on the live site every request failed with
 * "fetch failed" and the page stayed blank. See docs/gotchas.md.
 *
 * LIMIT wants a Neo4j integer: the driver sends a plain JS number as a float,
 * which Cypher rejects.
 */
type Row = Record<string, unknown>;

interface AuditFilters {
  status: string;
  dateFrom: string;
  dateTo: string;
  consumerDid: string;
  providerDid: string;
  crossBorder: string; // "true" | "false" | ""
}

/**
 * Build a parameterised Cypher WHERE clause from the active filters.
 * All user-supplied values are passed as $params — never interpolated into
 * the query string — to prevent Cypher injection (OWASP A03 / BSI C5 DEV-07).
 */
function buildWhere(
  alias: string,
  f: AuditFilters,
): { clause: string; params: Record<string, unknown> } {
  const conditions: string[] = [];
  const params: Record<string, unknown> = {};

  if (f.status) {
    conditions.push(`${alias}.status = $filterStatus`);
    params.filterStatus = f.status;
  }
  if (f.dateFrom) {
    conditions.push(`${alias}.timestamp >= $filterDateFrom`);
    params.filterDateFrom = f.dateFrom;
  }
  if (f.dateTo) {
    conditions.push(`${alias}.timestamp <= $filterDateTo`);
    params.filterDateTo = f.dateTo + "T23:59:59Z";
  }
  if (f.consumerDid) {
    conditions.push(`${alias}.consumerDid = $filterConsumerDid`);
    params.filterConsumerDid = f.consumerDid;
  }
  if (f.providerDid) {
    conditions.push(`${alias}.providerDid = $filterProviderDid`);
    params.filterProviderDid = f.providerDid;
  }
  if (f.crossBorder === "true") conditions.push(`${alias}.crossBorder = true`);
  if (f.crossBorder === "false") {
    conditions.push(`${alias}.crossBorder = false`);
  }

  const clause =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  return { clause, params };
}

/**
 * GET /api/admin/audit — Query the provenance & audit graph from Neo4j.
 *
 * Query params:
 *   type         – "all" | "transfers" | "negotiations" | "credentials" | "accesslogs" | "participants"
 *   limit        – max rows (default 50, max 200)
 *   status       – filter by status string
 *   dateFrom     – ISO date lower bound on timestamp  (YYYY-MM-DD)
 *   dateTo       – ISO date upper bound on timestamp  (YYYY-MM-DD)
 *   consumerDid  – exact DID of consumer participant
 *   providerDid  – exact DID of provider participant
 *   crossBorder  – "true" | "false" | "" (all)
 *   contractId   – (accesslogs only) filter by contract ID
 *
 * accesslogs honours consumerDid, providerDid, dateFrom, dateTo and
 * contractId; status and crossBorder do not apply to access events.
 */
export async function GET(request: NextRequest) {
  const authError = await requireAuditAccess();
  if (authError) return authError;

  const sp = request.nextUrl.searchParams;
  const type = sp.get("type") || "all";
  const limit = Math.min(parseInt(sp.get("limit") || "50", 10), 200);
  const limitParam = neo4j.int(limit);
  const filters: AuditFilters = {
    status: sp.get("status") || "",
    dateFrom: sp.get("dateFrom") || "",
    dateTo: sp.get("dateTo") || "",
    consumerDid: sp.get("consumerDid") || "",
    providerDid: sp.get("providerDid") || "",
    crossBorder: sp.get("crossBorder") || "",
  };

  try {
    // ── Participants list (includes compliance officer + EDC endpoint) ────
    if (type === "participants") {
      const participants = await runQuery<Row>(
        `MATCH (p:Participant)
         RETURN p.participantId           AS did,
                p.name                    AS name,
                p.country                 AS country,
                p.complianceOfficerName   AS complianceOfficerName,
                p.complianceOfficerEmail  AS complianceOfficerEmail,
                p.complianceOfficerPhone  AS complianceOfficerPhone,
                p.edcEndpoint             AS edcEndpoint
         ORDER BY p.name ASC`,
      );
      return NextResponse.json({ participants });
    }

    const results: Record<string, unknown> = {};

    // ── Data Transfers ────────────────────────────────────────────────────
    if (type === "all" || type === "transfers") {
      const { clause: where, params: filterParams } = buildWhere("t", filters);
      const transfers = await runQuery<{ transfer: Row }>(
        `MATCH (t:DataTransfer)
         ${where}
         OPTIONAL MATCH (consumer:Participant {participantId: t.consumerDid})
         OPTIONAL MATCH (provider:Participant {participantId: t.providerDid})
         OPTIONAL MATCH (t)-[:TRANSFERS]->(a)
         OPTIONAL MATCH (te:TransferEvent {contractId: t.contractId})
         WITH t, consumer, provider, a, count(te) AS logCount
         RETURN t {
           .*,
           consumerName:             consumer.name,
           consumerCountryCode:      consumer.country,
           consumerComplianceName:   consumer.complianceOfficerName,
           consumerComplianceEmail:  consumer.complianceOfficerEmail,
           providerName:             provider.name,
           providerCountryCode:      provider.country,
           providerComplianceName:   provider.complianceOfficerName,
           providerComplianceEmail:  provider.complianceOfficerEmail,
           asset:                    coalesce(a.name, a.title),
           accessLogCount:           logCount
         } AS transfer
         ORDER BY transfer.timestamp DESC
         LIMIT $limit`,
        { limit: limitParam, ...filterParams },
      );
      results.transfers = transfers.map((r) => r.transfer);
    }

    // ── Contract Negotiations ─────────────────────────────────────────────
    if (type === "all" || type === "negotiations") {
      const { clause: where, params: filterParams } = buildWhere("n", filters);
      const negotiations = await runQuery<{ negotiation: Row }>(
        `MATCH (n:ContractNegotiation)
         ${where}
         OPTIONAL MATCH (consumer:Participant {participantId: n.consumerDid})
         OPTIONAL MATCH (provider:Participant {participantId: n.providerDid})
         OPTIONAL MATCH (n)-[:FOR_ASSET]->(a)
         OPTIONAL MATCH (te:TransferEvent {contractId: n.contractId})
         WITH n, consumer, provider, a, count(te) AS logCount
         RETURN n {
           .*,
           consumerName:             consumer.name,
           consumerCountryCode:      consumer.country,
           consumerComplianceName:   consumer.complianceOfficerName,
           consumerComplianceEmail:  consumer.complianceOfficerEmail,
           consumerEdcEndpoint:      consumer.edcEndpoint,
           providerName:             provider.name,
           providerCountryCode:      provider.country,
           providerComplianceName:   provider.complianceOfficerName,
           providerComplianceEmail:  provider.complianceOfficerEmail,
           providerEdcEndpoint:      provider.edcEndpoint,
           asset:                    coalesce(a.name, a.title),
           accessLogCount:           logCount
         } AS negotiation
         ORDER BY negotiation.timestamp DESC
         LIMIT $limit`,
        { limit: limitParam, ...filterParams },
      );
      results.negotiations = negotiations.map((r) => r.negotiation);
    }

    // ── Access Logs ───────────────────────────────────────────────────────
    // The recorder is the neo4j-proxy: every FHIR, OMOP, catalog, NLQ and
    // federated request it serves becomes a TransferEvent ("individual data
    // access event" in init-schema.cypher), with the caller's DID from the
    // X-Participant header. Until 2026-09-17 this tab read a DataAccessLog
    // label that nothing has ever written, so it was empty on every stack
    // (issue #205). Seeded events carry consumerDid, providerDid, contractId,
    // datasetId, purpose and responseBytes; proxy-written ones carry
    // participant, endpoint, method, statusCode and resultCount. The map
    // below serves both shapes.
    if (type === "accesslogs") {
      const logParams: Record<string, unknown> = { limit: limitParam };
      const logConditions: string[] = [];
      if (filters.consumerDid) {
        logConditions.push(
          "coalesce(te.consumerDid, te.participant) = $filterConsumerDid",
        );
        logParams.filterConsumerDid = filters.consumerDid;
      }
      if (filters.providerDid) {
        logConditions.push("te.providerDid = $filterProviderDid");
        logParams.filterProviderDid = filters.providerDid;
      }
      if (filters.dateFrom) {
        logConditions.push("toString(te.timestamp) >= $filterDateFrom");
        logParams.filterDateFrom = filters.dateFrom;
      }
      if (filters.dateTo) {
        logConditions.push("toString(te.timestamp) <= $filterDateTo");
        logParams.filterDateTo = filters.dateTo + "T23:59:59Z";
      }
      const contractId = sp.get("contractId");
      if (contractId) {
        logConditions.push("te.contractId = $filterContractId");
        logParams.filterContractId = contractId;
      }
      const logWhere =
        logConditions.length > 0 ? `WHERE ${logConditions.join(" AND ")}` : "";
      // Provider and dataset come from the event when the recorder knew them
      // (seeded events, and proxy events since the UI sends X-Permit and
      // X-Dataset), else from the ACCESSED dataset and whoever OFFERS it.
      const logs = await runQuery<{ log: Row }>(
        `MATCH (te:TransferEvent)
         ${logWhere}
         WITH te, coalesce(te.consumerDid, te.participant) AS consumerDid
         OPTIONAL MATCH (consumer:Participant {participantId: consumerDid})
         OPTIONAL MATCH (te)-[:ACCESSED]->(ds0:HealthDataset)
         WITH te, consumerDid, consumer, collect(ds0)[0] AS ds
         OPTIONAL MATCH (holder0:Participant)-[:OFFERS]->(:DataProduct)-[:DESCRIBED_BY]->(ds)
         WITH te, consumerDid, consumer, ds, collect(holder0)[0] AS holder
         WITH te, consumerDid, consumer, ds,
              coalesce(te.providerDid, holder.participantId, holder.id) AS providerDid
         OPTIONAL MATCH (provider:Participant)
           WHERE providerDid IS NOT NULL
             AND coalesce(provider.participantId, provider.id) = providerDid
         OPTIONAL MATCH (permit:HDABApproval)
           WHERE te.permitId IS NOT NULL AND permit.approvalId = te.permitId
         RETURN {
           id:              te.eventId,
           accessedAt:      toString(te.timestamp),
           consumerDid:     consumerDid,
           consumerName:    consumer.name,
           consumerCountry: consumer.country,
           providerDid:     providerDid,
           providerName:    coalesce(provider.name, ds.publisher),
           providerCountry: provider.country,
           assetId:         coalesce(te.datasetId, ds.datasetId, ds.id),
           assetTitle:      coalesce(ds.title, ds.name),
           contractId:      coalesce(te.contractId, te.permitId),
           permitId:        te.permitId,
           permitStatus:    permit.status,
           permitValidUntil: toString(permit.validUntil),
           accessType:      CASE
                              WHEN te.accessType IS NOT NULL THEN te.accessType
                              WHEN te.endpoint STARTS WITH '/nlq'
                                OR te.endpoint STARTS WITH '/federated'
                                OR te.endpoint STARTS WITH '/catalog'
                                OR te.endpoint = '/omop/cohort' THEN 'QUERY'
                              ELSE 'DATA_READ'
                            END,
           purpose:         coalesce(te.purpose, te.name,
                                     te.method + ' ' + te.endpoint),
           bytesAccessed:   te.responseBytes,
           name:            te.name,
           endpoint:        te.endpoint,
           method:          te.method,
           statusCode:      te.statusCode,
           resultCount:     te.resultCount,
           durationMs:      te.duration,
           contentType:     te.contentType,
           protocol:        te.protocol,
           errorMessage:    te.errorMessage,
           demo:            te.demo
         } AS log
         ORDER BY te.timestamp DESC
         LIMIT $limit`,
        logParams,
      );
      results.accesslogs = logs.map((r) => r.log);
      return NextResponse.json({ type, limit, filters, ...results });
    }

    // ── Supervision: findings and information requests (Art. 63) ──────────
    if (type === "supervision") {
      const [findings, informationRequests] = await Promise.all([
        runQuery<{ finding: Row }>(
          `MATCH (f:NonComplianceFinding)
           OPTIONAL MATCH (f)-[:AGAINST]->(party:Participant)
           OPTIONAL MATCH (f)-[:LED_TO]->(permit:HDABApproval)
           RETURN f {
             .findingId, .partyId, .permitId, .description, .gdprBreach,
             .supervisoryAuthorityInformed, .status, .views, .measure,
             .measureNote, .exclusionMonths, .fineEur, .foundBy,
             partyName:   party.name,
             notifiedAt:  toString(f.notifiedAt),
             respondBy:   toString(f.respondBy),
             respondedAt: toString(f.respondedAt),
             closedAt:    toString(f.closedAt),
             revokedPermit: permit.approvalId
           } AS finding
           ORDER BY f.notifiedAt DESC
           LIMIT $limit`,
          { limit: limitParam },
        ),
        runQuery<{ request: Row }>(
          `MATCH (i:InformationRequest)
           OPTIONAL MATCH (i)-[:ASKED_OF]->(party:Participant)
           RETURN i {
             .requestId, .partyId, .permitId, .findingId, .question, .status,
             .answer, .requestedBy,
             partyName:   party.name,
             requestedAt: toString(i.requestedAt),
             answerBy:    toString(i.answerBy),
             answeredAt:  toString(i.answeredAt)
           } AS request
           ORDER BY i.requestedAt DESC
           LIMIT $limit`,
          { limit: limitParam },
        ),
      ]);
      results.findings = findings.map((r) => r.finding);
      results.informationRequests = informationRequests.map((r) => r.request);
      return NextResponse.json({ type, limit, filters, ...results });
    }

    // ── Verifiable Credentials ────────────────────────────────────────────
    if (type === "all" || type === "credentials") {
      const credentials = await runQuery<{ credential: Row }>(
        `MATCH (vc:VerifiableCredential)
         OPTIONAL MATCH (p:Participant)-[:HOLDS_CREDENTIAL]->(vc)
         RETURN vc { .*, participant: p.name } AS credential
         ORDER BY vc.issuedAt DESC
         LIMIT $limit`,
        { limit: limitParam },
      );
      results.credentials = credentials.map((r) => r.credential);
    }

    // ── Summary statistics ────────────────────────────────────────────────
    if (type === "all") {
      const stats = await runQuery<{ label: string; count: number }>(
        `MATCH (n)
         WHERE n:DataTransfer OR n:ContractNegotiation OR n:VerifiableCredential
           OR n:Participant OR n:DataAsset OR n:HealthDataset OR n:TransferEvent
         RETURN labels(n)[0] AS label, count(n) AS count
         ORDER BY count DESC`,
      );
      const accessByConsumer = await runQuery<{
        consumerName: string | null;
        totalAccesses: number;
        totalBytes: number | null;
        lastAccess: string | null;
      }>(
        `MATCH (te:TransferEvent)
         WITH te, coalesce(te.consumerDid, te.participant) AS consumerDid
         OPTIONAL MATCH (consumer:Participant {participantId: consumerDid})
         RETURN coalesce(consumer.name, consumerDid) AS consumerName,
                count(te)                            AS totalAccesses,
                sum(te.responseBytes)                AS totalBytes,
                max(toString(te.timestamp))          AS lastAccess
         ORDER BY totalAccesses DESC`,
      );
      results.summary = {
        nodeCounts: stats.reduce(
          (acc: Record<string, number>, r) => {
            acc[r.label] = r.count;
            return acc;
          },
          {} as Record<string, number>,
        ),
        accessByConsumer,
      };
    }

    return NextResponse.json({ type, limit, filters, ...results });
  } catch (err) {
    console.error("Failed to query audit log:", err);
    return NextResponse.json(
      {
        error: "Failed to query audit log",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 502 },
    );
  }
}

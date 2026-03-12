import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const NEO4J_URL =
  process.env.NEO4J_BOLT_URL || "bolt://health-dataspace-neo4j:7687";
const NEO4J_USER = process.env.NEO4J_USER || "neo4j";
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD || "healthdataspace";

interface AuditFilters {
  status: string;
  dateFrom: string;
  dateTo: string;
  consumerDid: string;
  providerDid: string;
  crossBorder: string; // "true" | "false" | ""
}

/**
 * Build a Cypher WHERE clause from the active filters.
 */
function buildWhere(alias: string, f: AuditFilters): string {
  const safe = (v: string) => v.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  const conditions: string[] = [];
  if (f.status) conditions.push(`${alias}.status = '${safe(f.status)}'`);
  if (f.dateFrom)
    conditions.push(`${alias}.timestamp >= '${safe(f.dateFrom)}'`);
  if (f.dateTo)
    conditions.push(`${alias}.timestamp <= '${safe(f.dateTo)}T23:59:59Z'`);
  if (f.consumerDid)
    conditions.push(`${alias}.consumerDid = '${safe(f.consumerDid)}'`);
  if (f.providerDid)
    conditions.push(`${alias}.providerDid = '${safe(f.providerDid)}'`);
  if (f.crossBorder === "true") conditions.push(`${alias}.crossBorder = true`);
  if (f.crossBorder === "false")
    conditions.push(`${alias}.crossBorder = false`);
  return conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
}

/**
 * Helper: execute Cypher via Neo4j HTTP API (transactional endpoint).
 */
async function runCypher(
  query: string,
  parameters: Record<string, unknown> = {},
) {
  const httpUrl = NEO4J_URL.replace("bolt://", "http://").replace(
    ":7687",
    ":7474",
  );
  const txUrl = `${httpUrl}/db/neo4j/tx/commit`;

  const res = await fetch(txUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization:
        "Basic " +
        Buffer.from(`${NEO4J_USER}:${NEO4J_PASSWORD}`).toString("base64"),
    },
    body: JSON.stringify({ statements: [{ statement: query, parameters }] }),
  });

  if (!res.ok) {
    throw new Error(`Neo4j HTTP API error: ${res.status} ${res.statusText}`);
  }
  const data = await res.json();
  if (data.errors?.length > 0) {
    throw new Error(`Cypher error: ${JSON.stringify(data.errors)}`);
  }
  return data.results;
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
 */
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const type = sp.get("type") || "all";
  const limit = Math.min(parseInt(sp.get("limit") || "50", 10), 200);
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
      const rows = await runCypher(
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
      const participants =
        rows[0]?.data?.map(
          (r: { row: [string, string, string, string, string, string, string] }) => ({
            did: r.row[0],
            name: r.row[1],
            country: r.row[2],
            complianceOfficerName: r.row[3],
            complianceOfficerEmail: r.row[4],
            complianceOfficerPhone: r.row[5],
            edcEndpoint: r.row[6],
          }),
        ) || [];
      return NextResponse.json({ participants });
    }

    const results: Record<string, unknown> = {};

    // ── Data Transfers ────────────────────────────────────────────────────
    if (type === "all" || type === "transfers") {
      const where = buildWhere("t", filters);
      const transfers = await runCypher(
        `MATCH (t:DataTransfer)
         ${where}
         OPTIONAL MATCH (consumer:Participant {participantId: t.consumerDid})
         OPTIONAL MATCH (provider:Participant {participantId: t.providerDid})
         OPTIONAL MATCH (t)-[:TRANSFERS]->(a)
         OPTIONAL MATCH (al:DataAccessLog)-[:VIA_TRANSFER]->(t)
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
           accessLogCount:           count(al)
         } AS transfer
         ORDER BY t.timestamp DESC
         LIMIT $limit`,
        { limit },
      );
      results.transfers =
        transfers[0]?.data?.map((r: { row: unknown[] }) => r.row[0]) || [];
    }

    // ── Contract Negotiations ─────────────────────────────────────────────
    if (type === "all" || type === "negotiations") {
      const where = buildWhere("n", filters);
      const negotiations = await runCypher(
        `MATCH (n:ContractNegotiation)
         ${where}
         OPTIONAL MATCH (consumer:Participant {participantId: n.consumerDid})
         OPTIONAL MATCH (provider:Participant {participantId: n.providerDid})
         OPTIONAL MATCH (n)-[:FOR_ASSET]->(a)
         OPTIONAL MATCH (al:DataAccessLog)-[:UNDER_CONTRACT]->(n)
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
           accessLogCount:           count(al)
         } AS negotiation
         ORDER BY n.timestamp DESC
         LIMIT $limit`,
        { limit },
      );
      results.negotiations =
        negotiations[0]?.data?.map((r: { row: unknown[] }) => r.row[0]) || [];
    }

    // ── Access Logs ───────────────────────────────────────────────────────
    if (type === "accesslogs") {
      const safe = (v: string) => v.replace(/'/g, "\\'");
      const consumerFilter = filters.consumerDid
        ? `AND a.consumerDid = '${safe(filters.consumerDid)}'` : "";
      const contractFilter = sp.get("contractId")
        ? `AND a.contractId = '${safe(sp.get("contractId")!)}'` : "";
      const logs = await runCypher(
        `MATCH (a:DataAccessLog)
         WHERE 1=1 ${consumerFilter} ${contractFilter}
         OPTIONAL MATCH (consumer:Participant {participantId: a.consumerDid})
         OPTIONAL MATCH (provider:Participant {participantId: a.providerDid})
         RETURN a {
           .*,
           consumerName:    consumer.name,
           consumerCountry: consumer.country,
           providerName:    provider.name,
           providerCountry: provider.country
         } AS log
         ORDER BY a.accessedAt DESC
         LIMIT $limit`,
        { limit },
      );
      results.accesslogs =
        logs[0]?.data?.map((r: { row: unknown[] }) => r.row[0]) || [];
      return NextResponse.json({ type, limit, ...results });
    }

    // ── Verifiable Credentials ────────────────────────────────────────────
    if (type === "all" || type === "credentials") {
      const credentials = await runCypher(
        `MATCH (vc:VerifiableCredential)
         OPTIONAL MATCH (p:Participant)-[:HOLDS_CREDENTIAL]->(vc)
         RETURN vc { .*, participant: p.name } AS credential
         ORDER BY vc.issuedAt DESC
         LIMIT $limit`,
        { limit },
      );
      results.credentials =
        credentials[0]?.data?.map((r: { row: unknown[] }) => r.row[0]) || [];
    }

    // ── Summary statistics ────────────────────────────────────────────────
    if (type === "all") {
      const stats = await runCypher(
        `MATCH (n)
         WHERE n:DataTransfer OR n:ContractNegotiation OR n:VerifiableCredential
           OR n:Participant OR n:DataAsset OR n:HealthDataset OR n:DataAccessLog
         RETURN labels(n)[0] AS label, count(n) AS count
         ORDER BY count DESC`,
      );
      const accessStats = await runCypher(
        `MATCH (a:DataAccessLog)
         OPTIONAL MATCH (consumer:Participant {participantId: a.consumerDid})
         RETURN consumer.name          AS consumerName,
                count(a)               AS totalAccesses,
                sum(a.bytesAccessed)   AS totalBytes,
                max(a.accessedAt)      AS lastAccess
         ORDER BY totalAccesses DESC`,
      );
      results.summary = {
        nodeCounts:
          stats[0]?.data?.reduce(
            (acc: Record<string, number>, r: { row: [string, number] }) => {
              acc[r.row[0]] = r.row[1];
              return acc;
            },
            {} as Record<string, number>,
          ) || {},
        accessByConsumer:
          accessStats[0]?.data?.map(
            (r: { row: [string, number, number, string] }) => ({
              consumerName: r.row[0],
              totalAccesses: r.row[1],
              totalBytes: r.row[2],
              lastAccess: r.row[3],
            }),
          ) || [],
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

import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const NEO4J_URL =
  process.env.NEO4J_BOLT_URL || "bolt://health-dataspace-neo4j:7687";
const NEO4J_USER = process.env.NEO4J_USER || "neo4j";
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD || "healthdataspace";

/**
 * Helper: execute Cypher via Neo4j HTTP API (transactional endpoint).
 * Uses the HTTP transaction API so we don't need the neo4j JS driver.
 */
async function runCypher(
  query: string,
  parameters: Record<string, unknown> = {},
) {
  // Convert bolt:// URL to http:// for the HTTP API
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
    body: JSON.stringify({
      statements: [{ statement: query, parameters }],
    }),
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
 * Supports ?type= filter:
 *   - "transfers"     — recent DataTransfer provenance nodes
 *   - "negotiations"  — recent ContractNegotiation provenance
 *   - "credentials"   — recent VerifiableCredential issuance
 *   - "all" (default) — combined summary
 *
 * Also supports ?limit= (default 50)
 */
export async function GET(request: NextRequest) {
  const type = request.nextUrl.searchParams.get("type") || "all";
  const limit = Math.min(
    parseInt(request.nextUrl.searchParams.get("limit") || "50", 10),
    200,
  );

  try {
    const results: Record<string, unknown> = {};

    if (type === "all" || type === "transfers") {
      const transfers = await runCypher(
        `MATCH (t:DataTransfer)
         OPTIONAL MATCH (t)-[:TRANSFERRED_BY]->(p:Participant)
         OPTIONAL MATCH (t)-[:TRANSFERS]->(a:DataAsset)
         RETURN t { .*, participant: p.name, asset: a.name } AS transfer
         ORDER BY t.timestamp DESC
         LIMIT $limit`,
        { limit },
      );
      results.transfers =
        transfers[0]?.data?.map((r: { row: unknown[] }) => r.row[0]) || [];
    }

    if (type === "all" || type === "negotiations") {
      const negotiations = await runCypher(
        `MATCH (n:ContractNegotiation)
         OPTIONAL MATCH (n)-[:NEGOTIATED_BY]->(p:Participant)
         OPTIONAL MATCH (n)-[:FOR_ASSET]->(a:DataAsset)
         RETURN n { .*, participant: p.name, asset: a.name } AS negotiation
         ORDER BY n.timestamp DESC
         LIMIT $limit`,
        { limit },
      );
      results.negotiations =
        negotiations[0]?.data?.map((r: { row: unknown[] }) => r.row[0]) || [];
    }

    if (type === "all" || type === "credentials") {
      const credentials = await runCypher(
        `MATCH (vc:VerifiableCredential)
         OPTIONAL MATCH (vc)-[:ISSUED_TO]->(p:Participant)
         RETURN vc { .*, participant: p.name } AS credential
         ORDER BY vc.issuanceDate DESC
         LIMIT $limit`,
        { limit },
      );
      results.credentials =
        credentials[0]?.data?.map((r: { row: unknown[] }) => r.row[0]) || [];
    }

    // Summary statistics
    if (type === "all") {
      const stats = await runCypher(
        `MATCH (n)
         WHERE n:DataTransfer OR n:ContractNegotiation OR n:VerifiableCredential
           OR n:Participant OR n:DataAsset
         RETURN labels(n)[0] AS label, count(n) AS count
         ORDER BY count DESC`,
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
      };
    }

    return NextResponse.json({ type, limit, ...results });
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

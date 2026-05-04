import { getServerSession } from "next-auth/next";
import { NextRequest, NextResponse } from "next/server";
import { edcClient, EDC_CONTEXT } from "@/lib/edc";
import { promises as fs } from "fs";
import path from "path";

import { authOptions } from "@/lib/auth";

/**
 * Policies are visible to both EDC_ADMIN (dataspace operator) and
 * HDAB_AUTHORITY (regulator inspecting EHDS Art. 46 ODRL terms attached to
 * data permits). Mutations are kept admin-only via the per-method guard
 * below.
 */
async function requirePoliciesRead(): Promise<NextResponse | null> {
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

async function requirePoliciesWrite(): Promise<NextResponse | null> {
  const session = await getServerSession(authOptions);
  const roles = (session as { roles?: string[] } | null)?.roles ?? [];
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!roles.includes("EDC_ADMIN")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}

export const dynamic = "force-dynamic";

// ── Neo4j fallback helpers ─────────────────────────────────────────────────

const NEO4J_URL =
  process.env.NEO4J_BOLT_URL || "bolt://health-dataspace-neo4j:7687";
const NEO4J_USER = process.env.NEO4J_USER || "neo4j";
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD || "healthdataspace";

async function neo4jCypher(
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
  if (!res.ok) throw new Error(`Neo4j HTTP API error: ${res.status}`);
  const data = await res.json();
  if (data.errors?.length > 0) {
    throw new Error(`Cypher error: ${JSON.stringify(data.errors)}`);
  }
  return data.results;
}

/**
 * GET /api/admin/policies?participantId=xxx — List policy definitions.
 * Attempts EDC-V management API first; falls back to Neo4j if offline.
 */
export async function GET(request: NextRequest) {
  const authError = await requirePoliciesRead();
  if (authError) return authError;

  const participantId = request.nextUrl.searchParams.get("participantId");

  try {
    if (participantId) {
      const policies = await edcClient.management(
        `/v5alpha/participants/${participantId}/policydefinitions/request`,
        "POST",
        {
          "@context": [EDC_CONTEXT],
          "@type": "QuerySpec",
          filterExpression: [],
        },
      );
      return NextResponse.json({ participantId, policies, source: "edc" });
    }

    const participants = await edcClient.management<
      { "@id": string; identity: string }[]
    >("/v5alpha/participants");

    const allPolicies = await Promise.all(
      participants.map(async (p) => {
        try {
          const policies = await edcClient.management(
            `/v5alpha/participants/${p["@id"]}/policydefinitions/request`,
            "POST",
            {
              "@context": [EDC_CONTEXT],
              "@type": "QuerySpec",
              filterExpression: [],
            },
          );
          return {
            participantId: p["@id"],
            identity: p.identity,
            policies,
            source: "edc",
          };
        } catch {
          return {
            participantId: p["@id"],
            identity: p.identity,
            policies: [],
            error: "Failed to fetch policies",
          };
        }
      }),
    );
    return NextResponse.json({ participants: allPolicies });
  } catch {
    // EDC-V is offline — read from Neo4j local registry
    console.warn("EDC-V offline, reading policies from Neo4j");
    try {
      const rows = await neo4jCypher(
        `MATCH (pol:OdrlPolicy)
         ${participantId ? "WHERE pol.participantId = $participantId" : ""}
         OPTIONAL MATCH (pol)-[:BELONGS_TO]->(p:Participant)
         RETURN pol { .*, participantName: p.name } AS policy
         ORDER BY pol.createdAt DESC`,
        participantId ? { participantId } : {},
      );
      const policies =
        rows[0]?.data?.map((r: { row: unknown[] }) => r.row[0]) || [];
      return NextResponse.json({ policies, source: "neo4j", offline: true });
    } catch (neo4jErr) {
      // Fall back to bundled mock data so the UI works offline
      try {
        const mockPath = path.join(
          process.cwd(),
          "public",
          "mock",
          "admin_policies.json",
        );
        const raw = await fs.readFile(mockPath, "utf-8");
        const mock = JSON.parse(raw);
        console.warn("EDC-V + Neo4j offline — serving mock policies");
        return NextResponse.json(mock);
      } catch {
        // Mock file not available either
      }

      return NextResponse.json(
        { error: "Failed to list policies", detail: String(neo4jErr) },
        { status: 502 },
      );
    }
  }
}

/**
 * POST /api/admin/policies — Create a policy definition.
 * Body: { participantId, policy: { ... } }
 * Attempts EDC-V first; on failure stores the policy in Neo4j as OdrlPolicy node.
 */
export async function POST(request: NextRequest) {
  const authError = await requirePoliciesWrite();
  if (authError) return authError;

  try {
    const body = await request.json();
    const { participantId, policy } = body;

    if (!participantId || !policy) {
      return NextResponse.json(
        { error: "participantId and policy are required" },
        { status: 400 },
      );
    }

    try {
      // Attempt EDC-V management API
      const result = await edcClient.management(
        `/v5alpha/participants/${participantId}/policydefinitions`,
        "POST",
        { "@context": [EDC_CONTEXT], ...policy },
      );
      return NextResponse.json(result, { status: 201 });
    } catch (edcErr) {
      // EDC-V offline — persist policy in Neo4j local registry
      console.warn(
        "EDC-V offline, persisting policy in Neo4j local registry:",
        edcErr,
      );
      const policyId =
        (policy["@id"] as string) ||
        (policy.id as string) ||
        `policy:local:${Date.now()}`;
      const now = new Date().toISOString();

      await neo4jCypher(
        `MERGE (pol:OdrlPolicy {id: $policyId})
         SET pol.participantId = $participantId,
             pol.policyJson    = $policyJson,
             pol.createdAt     = $createdAt,
             pol.source        = 'local-registry'
         WITH pol
         OPTIONAL MATCH (p:Participant {participantId: $participantId})
         FOREACH (_ IN CASE WHEN p IS NOT NULL THEN [1] ELSE [] END |
           MERGE (pol)-[:BELONGS_TO]->(p)
         )`,
        {
          policyId,
          participantId,
          policyJson: JSON.stringify(policy),
          createdAt: now,
        },
      );

      return NextResponse.json(
        {
          "@id": policyId,
          source: "neo4j",
          offline: true,
          message:
            "Policy saved to local Neo4j registry (EDC-V management API is offline)",
        },
        { status: 201 },
      );
    }
  } catch (err) {
    console.error("Failed to create policy:", err);
    return NextResponse.json(
      { error: "Failed to create policy" },
      { status: 502 },
    );
  }
}

/**
 * PUT /api/admin/policies — Update an existing policy definition.
 * Body: { participantId, policyId, policy: { ... } }
 */
export async function PUT(request: NextRequest) {
  const authError = await requirePoliciesWrite();
  if (authError) return authError;

  try {
    const body = await request.json();
    const { participantId, policyId, policy } = body;

    if (!participantId || !policy) {
      return NextResponse.json(
        { error: "participantId and policy are required" },
        { status: 400 },
      );
    }

    try {
      // EDC-V: delete old + create new (no PATCH in EDC-V Management API)
      if (policyId) {
        await edcClient.management(
          `/v5alpha/participants/${participantId}/policydefinitions/${policyId}`,
          "DELETE",
        );
      }
      const result = await edcClient.management(
        `/v5alpha/participants/${participantId}/policydefinitions`,
        "POST",
        { "@context": [EDC_CONTEXT], ...policy },
      );
      return NextResponse.json(result);
    } catch {
      // EDC-V offline — update in Neo4j
      console.warn("EDC-V offline, updating policy in Neo4j local registry");
      const newPolicyId =
        (policy["@id"] as string) || policyId || `policy:local:${Date.now()}`;
      const now = new Date().toISOString();

      await neo4jCypher(
        `MERGE (pol:OdrlPolicy {id: $policyId})
         SET pol.participantId = $participantId,
             pol.policyJson    = $policyJson,
             pol.updatedAt     = $updatedAt,
             pol.source        = 'local-registry'`,
        {
          policyId: newPolicyId,
          participantId,
          policyJson: JSON.stringify(policy),
          updatedAt: now,
        },
      );

      return NextResponse.json({
        "@id": newPolicyId,
        source: "neo4j",
        offline: true,
      });
    }
  } catch (err) {
    console.error("Failed to update policy:", err);
    return NextResponse.json(
      { error: "Failed to update policy" },
      { status: 502 },
    );
  }
}

/**
 * DELETE /api/admin/policies — Remove a policy definition.
 * Body: { participantId, policyId }
 */
export async function DELETE(request: NextRequest) {
  const authError = await requirePoliciesWrite();
  if (authError) return authError;

  try {
    const body = await request.json();
    const { participantId, policyId } = body;

    if (!participantId || !policyId) {
      return NextResponse.json(
        { error: "participantId and policyId are required" },
        { status: 400 },
      );
    }

    try {
      await edcClient.management(
        `/v5alpha/participants/${participantId}/policydefinitions/${policyId}`,
        "DELETE",
      );
      return NextResponse.json({ deleted: policyId });
    } catch {
      // EDC-V offline — delete from Neo4j
      console.warn("EDC-V offline, deleting policy from Neo4j local registry");
      await neo4jCypher(
        `MATCH (pol:OdrlPolicy {id: $policyId})
         DETACH DELETE pol`,
        { policyId },
      );
      return NextResponse.json({
        deleted: policyId,
        source: "neo4j",
        offline: true,
      });
    }
  } catch (err) {
    console.error("Failed to delete policy:", err);
    return NextResponse.json(
      { error: "Failed to delete policy" },
      { status: 502 },
    );
  }
}

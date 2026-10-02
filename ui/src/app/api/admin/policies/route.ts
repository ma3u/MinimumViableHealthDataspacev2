import { NextRequest, NextResponse } from "next/server";
import { edcClient, EDC_CONTEXT } from "@/lib/edc";
import { promises as fs } from "fs";
import path from "path";

import { runQuery } from "@/lib/neo4j";
import { requireAuth, isAuthError } from "@/lib/auth-guard";

/**
 * Policies are visible to both EDC_ADMIN (dataspace operator) and
 * HDAB_AUTHORITY (regulator inspecting EHDS Art. 46 ODRL terms attached to
 * data permits). Mutations are kept admin-only via the per-method guard
 * below.
 */
async function requirePoliciesRead(): Promise<NextResponse | null> {
  const auth = await requireAuth(["EDC_ADMIN", "HDAB_AUTHORITY"]);
  if (isAuthError(auth)) return auth;
  return null;
}

async function requirePoliciesWrite(): Promise<NextResponse | null> {
  const auth = await requireAuth(["EDC_ADMIN"]);
  if (isAuthError(auth)) return auth;
  return null;
}

export const dynamic = "force-dynamic";

// ── Neo4j fallback ──────────────────────────────────────────────────────────
// Bolt through the shared driver in lib/neo4j.ts, like every other route. The
// transactional HTTP API on port 7474 that used to live here is not reachable
// on Azure Container Apps (mvhd-neo4j exposes 7687 only), so this fallback
// never worked on the live site. See docs/gotchas.md, 2026-09-17.

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
      const rows = await runQuery<{ policy: Record<string, unknown> }>(
        `MATCH (pol:OdrlPolicy)
         ${participantId ? "WHERE pol.participantId = $participantId" : ""}
         OPTIONAL MATCH (pol)-[:BELONGS_TO]->(p:Participant)
         RETURN pol { .*, participantName: p.name } AS policy
         ORDER BY pol.createdAt DESC`,
        participantId ? { participantId } : {},
      );
      // Group by participant, so this answers in the same shape as the EDC
      // path above. It used to return a bare `policies` array, and the two
      // shapes cost twice: /admin/policies reads `participants` only, so the
      // page was empty whenever the control plane was the thing that was down,
      // which is exactly when an operator opens it; and a partner integrating
      // against the endpoint could not write one parser. The bundled fixture
      // ui/public/mock/admin_policies.json has always used `participants`.
      const groups = new Map<
        string,
        { participantId: string; identity: string; policies: unknown[] }
      >();
      for (const { policy } of rows) {
        const participantId = String(policy.participantId ?? "unknown");
        const identity = String(policy.participantName ?? participantId);
        const group = groups.get(participantId) ?? {
          participantId,
          identity,
          policies: [],
        };
        group.policies.push(policy);
        groups.set(participantId, group);
      }
      return NextResponse.json({
        participants: [...groups.values()],
        source: "neo4j",
        offline: true,
      });
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

      await runQuery(
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

      await runQuery(
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
      await runQuery(
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

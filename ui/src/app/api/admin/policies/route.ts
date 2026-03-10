import { NextRequest, NextResponse } from "next/server";
import { edcClient, EDC_CONTEXT } from "@/lib/edc";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/policies?participantId=xxx — List policy definitions.
 * Queries all participant contexts if no participantId specified.
 */
export async function GET(request: NextRequest) {
  const participantId = request.nextUrl.searchParams.get("participantId");

  try {
    if (participantId) {
      const policies = await edcClient.management(
        `/v5alpha/participants/${participantId}/policydefinitions/request`,
        "POST",
        {
          "@context": [EDC_CONTEXT],
          "@type": "QuerySpec",
        },
      );
      return NextResponse.json({ participantId, policies });
    }

    // Aggregate across all participants
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
            },
          );
          return {
            participantId: p["@id"],
            identity: p.identity,
            policies,
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
  } catch (err) {
    console.error("Failed to list policies:", err);
    return NextResponse.json(
      { error: "Failed to list policies" },
      { status: 502 },
    );
  }
}

/**
 * POST /api/admin/policies — Create a policy definition.
 * Body: { participantId, policy: { ... } }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { participantId, policy } = body;

    if (!participantId || !policy) {
      return NextResponse.json(
        { error: "participantId and policy are required" },
        { status: 400 },
      );
    }

    const result = await edcClient.management(
      `/v5alpha/participants/${participantId}/policydefinitions`,
      "POST",
      {
        "@context": [EDC_CONTEXT],
        ...policy,
      },
    );

    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    console.error("Failed to create policy:", err);
    return NextResponse.json(
      { error: "Failed to create policy" },
      { status: 502 },
    );
  }
}

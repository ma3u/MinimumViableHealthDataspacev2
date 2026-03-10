import { NextRequest, NextResponse } from "next/server";
import { edcClient, EDC_CONTEXT } from "@/lib/edc";

export const dynamic = "force-dynamic";

/**
 * POST /api/negotiations — Initiate a contract negotiation.
 * Body: { participantId, counterPartyAddress, offerId, assetId, policyId }
 *
 * GET /api/negotiations?participantId=<id> — List negotiations for participant.
 */

export async function GET(req: NextRequest) {
  const participantId = req.nextUrl.searchParams.get("participantId");

  if (!participantId) {
    return NextResponse.json(
      { error: "participantId query parameter is required" },
      { status: 400 },
    );
  }

  try {
    const negotiations = await edcClient.management<unknown[]>(
      `/v5alpha/participants/${participantId}/contractnegotiations/request`,
      "POST",
      { "@context": [EDC_CONTEXT], "@type": "QuerySpec" },
    );
    return NextResponse.json(negotiations);
  } catch (err) {
    console.error("Failed to list negotiations:", err);
    return NextResponse.json(
      { error: "Failed to list negotiations" },
      { status: 502 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      participantId,
      counterPartyAddress,
      counterPartyId,
      offerId,
      assetId,
      policyId,
    } = body;

    if (!participantId || !counterPartyAddress || !assetId) {
      return NextResponse.json(
        {
          error: "participantId, counterPartyAddress, and assetId are required",
        },
        { status: 400 },
      );
    }

    const negotiationPayload = {
      "@context": [EDC_CONTEXT],
      "@type": "ContractRequest",
      counterPartyAddress,
      counterPartyId: counterPartyId || "",
      protocol: "dataspace-protocol-http",
      policy: {
        "@context": "http://www.w3.org/ns/odrl.jsonld",
        "@id": offerId || policyId || "default-policy",
        "@type": "Offer",
        assigner: counterPartyId || "",
        target: assetId,
      },
    };

    const result = await edcClient.management(
      `/v5alpha/participants/${participantId}/contractnegotiations`,
      "POST",
      negotiationPayload,
    );

    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    console.error("Failed to initiate negotiation:", err);
    return NextResponse.json(
      { error: "Failed to initiate contract negotiation" },
      { status: 502 },
    );
  }
}

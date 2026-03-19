import { NextRequest, NextResponse } from "next/server";
import { edcClient, EDC_CONTEXT } from "@/lib/edc";

export const dynamic = "force-dynamic";

/**
 * GET /api/transfers?participantId=<id> — List transfers for participant.
 * POST /api/transfers — Initiate a data transfer.
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
    const transfers = await edcClient.management<unknown[]>(
      `/v5alpha/participants/${participantId}/transferprocesses/request`,
      "POST",
      { "@context": [EDC_CONTEXT], "@type": "QuerySpec", "filterExpression": [] },
    );
    return NextResponse.json(transfers);
  } catch (err) {
    console.error("Failed to list transfers:", err);
    return NextResponse.json(
      { error: "Failed to list transfers" },
      { status: 502 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      participantId,
      contractId,
      counterPartyAddress,
      assetId,
      transferType,
    } = body;

    if (!participantId || !contractId || !counterPartyAddress) {
      return NextResponse.json(
        {
          error:
            "participantId, contractId, and counterPartyAddress are required",
        },
        { status: 400 },
      );
    }

    const transferPayload = {
      "@context": [EDC_CONTEXT],
      "@type": "TransferRequest",
      counterPartyAddress,
      protocol: "dataspace-protocol-http:2025-1",
      contractId,
      assetId: assetId || "",
      transferType: transferType || "HttpData-PULL",
      dataDestination: {
        "@type": "DataAddress",
        type: "HttpProxy",
      },
    };

    const result = await edcClient.management(
      `/v5alpha/participants/${participantId}/transferprocesses`,
      "POST",
      transferPayload,
    );

    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    console.error("Failed to initiate transfer:", err);
    return NextResponse.json(
      { error: "Failed to initiate data transfer" },
      { status: 502 },
    );
  }
}

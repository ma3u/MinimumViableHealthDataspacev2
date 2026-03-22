import { NextRequest, NextResponse } from "next/server";
import { edcClient, EDC_CONTEXT } from "@/lib/edc";
import { promises as fs } from "fs";
import path from "path";

export const dynamic = "force-dynamic";

/** Load demo transfers from the bundled mock JSON file. */
async function loadMockTransfers(): Promise<unknown[]> {
  try {
    const mockPath = path.join(
      process.cwd(),
      "public",
      "mock",
      "transfers.json",
    );
    const raw = await fs.readFile(mockPath, "utf-8");
    return JSON.parse(raw) as unknown[];
  } catch {
    return [];
  }
}

/**
 * GET /api/transfers?participantId=<id> — List transfers for participant.
 * Returns real transfers from the controlplane merged with demo data.
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

  let realTransfers: unknown[] = [];
  try {
    realTransfers = await edcClient.management<unknown[]>(
      `/v5alpha/participants/${participantId}/transferprocesses/request`,
      "POST",
      { "@context": [EDC_CONTEXT], "@type": "QuerySpec", filterExpression: [] },
    );
    if (!Array.isArray(realTransfers)) {
      realTransfers = [];
    }
  } catch (err) {
    console.warn(
      "Controlplane transfer list unavailable, using demo data:",
      err,
    );
  }

  // Merge with demo transfers so the FHIR viewer is always demonstrable
  const mockTransfers = await loadMockTransfers();
  const realIds = new Set(
    realTransfers.map((t) => (t as Record<string, unknown>)["@id"]),
  );
  const deduped = mockTransfers.filter(
    (m) => !realIds.has((m as Record<string, unknown>)["@id"]),
  );
  const merged = [...realTransfers, ...deduped];

  return NextResponse.json(merged);
}

/** Mock agreement IDs follow pattern: agreement-fhir-<type>-<NNN> */
const MOCK_AGREEMENT_RE = /^agreement-fhir-[\w-]+-\d{3}$/;

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

    // Demo-mode: if the contractId is a mock agreement, simulate a
    // successful transfer instead of hitting the real controlplane.
    if (MOCK_AGREEMENT_RE.test(contractId)) {
      return NextResponse.json(
        {
          "@type": "TransferProcess",
          "@id": `transfer-demo-${Date.now()}`,
          state: "REQUESTED",
          stateTimestamp: Date.now(),
          type: "CONSUMER",
          contractId,
          assetId: assetId || "",
          transferType: transferType || "HttpData-PULL",
          counterPartyAddress,
          _demo: true,
        },
        { status: 201 },
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
    const detail =
      err instanceof Error ? err.message : "Failed to initiate data transfer";
    return NextResponse.json({ error: detail }, { status: 502 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { edcClient, EDC_CONTEXT } from "@/lib/edc";

export const dynamic = "force-dynamic";

/**
 * GET /api/assets — List data assets for a participant context.
 * Query param: ?participantId=<ctx_id>
 *
 * POST /api/assets — Create a new data asset.
 * Body: { participantId, assetId, name, description, contentType, dataAddress }
 */

export async function GET(req: NextRequest) {
  const participantId = req.nextUrl.searchParams.get("participantId");

  try {
    if (participantId) {
      // List assets for a specific participant
      const assets = await edcClient.management<unknown[]>(
        `/v5alpha/participants/${participantId}/assets/request`,
        "POST",
        { "@context": [EDC_CONTEXT], "@type": "QuerySpec" },
      );
      return NextResponse.json(assets);
    }

    // List all participant contexts, then aggregate assets
    const participants = await edcClient.management<
      { "@id": string; identity: string }[]
    >("/v5alpha/participants");

    const allAssets: {
      participantId: string;
      identity: string;
      assets: unknown[];
    }[] = [];
    for (const p of participants) {
      try {
        const assets = await edcClient.management<unknown[]>(
          `/v5alpha/participants/${p["@id"]}/assets/request`,
          "POST",
          { "@context": [EDC_CONTEXT], "@type": "QuerySpec" },
        );
        allAssets.push({
          participantId: p["@id"],
          identity: p.identity,
          assets: assets || [],
        });
      } catch {
        allAssets.push({
          participantId: p["@id"],
          identity: p.identity,
          assets: [],
        });
      }
    }

    return NextResponse.json(allAssets);
  } catch (err) {
    console.error("Failed to list assets:", err);
    return NextResponse.json(
      { error: "Failed to list assets" },
      { status: 502 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      participantId,
      assetId,
      name,
      description,
      contentType,
      dataAddress,
    } = body;

    if (!participantId || !assetId || !name) {
      return NextResponse.json(
        { error: "participantId, assetId, and name are required" },
        { status: 400 },
      );
    }

    const assetPayload = {
      "@context": [EDC_CONTEXT],
      "@type": "Asset",
      "@id": assetId,
      properties: {
        name,
        description: description || "",
        contenttype: contentType || "application/json",
        version: "1.0.0",
      },
      dataAddress: dataAddress || {
        "@type": "DataAddress",
        type: "HttpData",
        baseUrl: "http://neo4j-proxy:9090",
      },
    };

    const result = await edcClient.management(
      `/v5alpha/participants/${participantId}/assets`,
      "POST",
      assetPayload,
    );

    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    console.error("Failed to create asset:", err);
    return NextResponse.json(
      { error: "Failed to create asset" },
      { status: 502 },
    );
  }
}

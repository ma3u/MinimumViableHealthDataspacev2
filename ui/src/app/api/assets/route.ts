import { NextRequest, NextResponse } from "next/server";
import { edcClient, EDC_CONTEXT } from "@/lib/edc";
import { requireAuth, isAuthError } from "@/lib/auth-guard";
import { promises as fs } from "fs";
import path from "path";

export const dynamic = "force-dynamic";

interface ParticipantAssets {
  participantId: string;
  identity: string;
  assets: Record<string, unknown>[];
}

/**
 * Normalise an asset object returned by the EDC-V v5alpha Management API.
 *
 * v5alpha nests properties under a `properties` sub-object:
 *   { properties: { name, description, contenttype, ... } }
 *
 * Older EDC versions (v3) used `edc:name`, `edc:description`, etc. at the top
 * level.  Many UI components still read the `edc:*` form, so we promote both
 * plain *and* `edc:*` fields for maximum compatibility.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normaliseAsset(raw: any): Record<string, unknown> {
  const props = raw?.properties ?? {};
  return {
    ...raw,
    // Plain names (preferred going forward)
    name: props.name ?? raw["edc:name"] ?? raw["@id"],
    description: props.description ?? raw["edc:description"] ?? "",
    contenttype: props.contenttype ?? raw["edc:contenttype"] ?? "",
    // Legacy edc:* names (consumed by existing pages)
    "edc:name": props.name ?? raw["edc:name"] ?? raw["@id"],
    "edc:description": props.description ?? raw["edc:description"] ?? "",
    "edc:contenttype": props.contenttype ?? raw["edc:contenttype"] ?? "",
  };
}

/** Load demo assets from the bundled mock JSON file. */
async function loadMockAssets(): Promise<ParticipantAssets[]> {
  try {
    const mockPath = path.join(process.cwd(), "public", "mock", "assets.json");
    const raw = await fs.readFile(mockPath, "utf-8");
    return JSON.parse(raw) as ParticipantAssets[];
  } catch {
    return [];
  }
}

/**
 * GET /api/assets — List data assets for a participant context.
 * Query param: ?participantId=<ctx_id>
 *
 * POST /api/assets — Create a new data asset.
 * Body: { participantId, assetId, name, description, contentType, dataAddress }
 */

export async function GET(req: NextRequest) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  const participantId = req.nextUrl.searchParams.get("participantId");

  try {
    if (participantId) {
      // List assets for a specific participant
      const assets = await edcClient.management<Record<string, unknown>[]>(
        `/v5alpha/participants/${participantId}/assets/request`,
        "POST",
        {
          "@context": [EDC_CONTEXT],
          "@type": "QuerySpec",
          filterExpression: [],
        },
      );
      return NextResponse.json((assets ?? []).map(normaliseAsset));
    }

    // List all participant contexts, then aggregate assets
    const participants = await edcClient.management<
      { "@id": string; identity: string; state?: string }[]
    >("/v5alpha/participants");

    // Only include ACTIVATED participants — skip stale CREATED contexts
    const active = (Array.isArray(participants) ? participants : []).filter(
      (p) => (p.state ?? "ACTIVATED") === "ACTIVATED",
    );

    const allAssets: ParticipantAssets[] = [];
    for (const p of active) {
      try {
        const assets = await edcClient.management<Record<string, unknown>[]>(
          `/v5alpha/participants/${p["@id"]}/assets/request`,
          "POST",
          {
            "@context": [EDC_CONTEXT],
            "@type": "QuerySpec",
            filterExpression: [],
          },
        );
        allAssets.push({
          participantId: p["@id"],
          identity: p.identity,
          assets: (assets ?? []).map(normaliseAsset),
        });
      } catch {
        allAssets.push({
          participantId: p["@id"],
          identity: p.identity,
          assets: [],
        });
      }
    }

    // Merge with demo assets so the discover page is always demonstrable
    const mockAssets = await loadMockAssets();
    const realIdentities = new Set(allAssets.map((a) => a.identity));
    for (const mock of mockAssets) {
      if (realIdentities.has(mock.identity)) {
        // Merge mock assets into existing participant, dedup by @id
        const real = allAssets.find((a) => a.identity === mock.identity)!;
        const existingIds = new Set(real.assets.map((a) => a["@id"] as string));
        for (const ma of mock.assets) {
          if (!existingIds.has(ma["@id"] as string)) {
            real.assets.push(ma);
          }
        }
      } else {
        allAssets.push(mock);
      }
    }

    return NextResponse.json(allAssets);
  } catch (err) {
    console.warn("Controlplane assets unavailable, using demo data:", err);
    // Fall back to mock data entirely
    const mockAssets = await loadMockAssets();
    return NextResponse.json(mockAssets);
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

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

import { NextRequest, NextResponse } from "next/server";
import { edcClient, EDC_CONTEXT } from "@/lib/edc";
import { promises as fs } from "fs";
import path from "path";

export const dynamic = "force-dynamic";

/** Load demo negotiations from the bundled mock JSON file. */
async function loadMockNegotiations(): Promise<unknown[]> {
  try {
    const mockPath = path.join(
      process.cwd(),
      "public",
      "mock",
      "negotiations.json",
    );
    const raw = await fs.readFile(mockPath, "utf-8");
    return JSON.parse(raw) as unknown[];
  } catch {
    return [];
  }
}

/**
 * DSP protocol version required by EDC-V (must include version suffix)
 * @see seed-contract-negotiation.sh DSP_PROTOCOL variable
 */
const DSP_PROTOCOL = "dataspace-protocol-http:2025-1";

/**
 * Build the full per-participant DSP endpoint from a base URL + ctx ID.
 * EDC-V DSP format: {dspBase}/{providerCtxId}/2025-1
 *
 * Examples:
 *   buildDspEndpoint("http://controlplane:8082/api/dsp", "abc123")
 *   → "http://controlplane:8082/api/dsp/abc123/2025-1"
 */
function buildDspEndpoint(base: string, ctxId: string): string {
  const clean = base.replace(/\/+$/, ""); // strip trailing slash
  // If already looks like a full DSP endpoint (contains /2025-1), use as-is
  if (clean.endsWith("/2025-1")) return clean;
  // If ctxId already embedded, just add version
  if (clean.includes(ctxId)) return `${clean}/2025-1`;
  return `${clean}/${ctxId}/2025-1`;
}

/**
 * POST /api/negotiations — Initiate a DSP-compliant contract negotiation.
 *
 * Body: {
 *   participantId:       consumer participant context @id
 *   counterPartyAddress: provider DSP base URL (e.g. http://controlplane:8082/api/dsp)
 *   counterPartyId:      provider participant context @id (their UUID)
 *   providerDid:         provider DID (used as ODRL assigner — required for DCP)
 *   offerId:             ODRL offer @id obtained from catalog (required for valid DSP flow)
 *   assetId:             target asset @id
 *   policyId:            alias for offerId (legacy)
 * }
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

  // Catalog pre-fetch mode: ?catalog=true&providerDid=<did>
  const catalog = req.nextUrl.searchParams.get("catalog");
  if (catalog === "true") {
    const providerDid = req.nextUrl.searchParams.get("providerDid");
    if (!providerDid) {
      return NextResponse.json(
        { error: "providerDid is required for catalog fetch" },
        { status: 400 },
      );
    }
    try {
      // v1alpha catalog endpoint — DCP-compliant catalog discovery by DID
      const catalogData = await edcClient.management(
        `/v1alpha/participants/${participantId}/catalog`,
        "POST",
        { counterPartyDid: providerDid },
      );
      return NextResponse.json(catalogData);
    } catch (err) {
      console.error("Failed to fetch provider catalog:", err);
      const msg = err instanceof Error ? err.message : String(err);
      return NextResponse.json(
        { error: "Failed to fetch provider catalog", detail: msg },
        { status: 502 },
      );
    }
  }

  let realNegotiations: unknown[] = [];
  try {
    realNegotiations = await edcClient.management<unknown[]>(
      `/v5alpha/participants/${participantId}/contractnegotiations/request`,
      "POST",
      { "@context": [EDC_CONTEXT], "@type": "QuerySpec", filterExpression: [] },
    );
    if (!Array.isArray(realNegotiations)) {
      realNegotiations = [];
    }
  } catch (err) {
    console.warn(
      "Controlplane negotiation list unavailable, using demo data:",
      err,
    );
  }

  // Merge with demo negotiations so the full workflow is always demonstrable
  const mockNegotiations = await loadMockNegotiations();
  const realIds = new Set(
    realNegotiations.map((n) => (n as Record<string, unknown>)["@id"]),
  );
  const deduped = mockNegotiations.filter(
    (m) => !realIds.has((m as Record<string, unknown>)["@id"]),
  );
  const merged = [...realNegotiations, ...deduped];

  return NextResponse.json(merged);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      participantId,
      counterPartyAddress,
      counterPartyId,
      providerDid,
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

    if (!offerId && !policyId) {
      return NextResponse.json(
        {
          error:
            "offerId is required — fetch the provider catalog first to get a valid ODRL offer @id",
        },
        { status: 400 },
      );
    }

    // Construct the full DSP endpoint with participant context ID and version suffix
    // DSP format: {dspBase}/{providerCtxId}/2025-1
    const dspEndpoint = buildDspEndpoint(counterPartyAddress, counterPartyId);

    // The ODRL assigner must be the provider's DID (for DCP credential verification)
    // Fall back to counterPartyId UUID if no DID provided (will fail DCP auth)
    const assigner = providerDid || counterPartyId || "";

    const negotiationPayload = {
      "@context": [EDC_CONTEXT],
      "@type": "ContractRequest",
      counterPartyAddress: dspEndpoint,
      counterPartyId: counterPartyId || "",
      protocol: DSP_PROTOCOL,
      policy: {
        "@context": "http://www.w3.org/ns/odrl.jsonld",
        "@id": offerId || policyId,
        "@type": "Offer",
        assigner,
        target: assetId,
        // EDC-V requires non-empty permission array; omit prohibition/obligation
        // (empty arrays fail validation; non-empty ones cause policy mismatch)
        permission: [{ action: "use" }],
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
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: "Failed to initiate contract negotiation", detail: msg },
      { status: 502 },
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { DSP_PROTOCOL } from "@/lib/dsp-protocol";
import { edcClient, EDC_CONTEXT } from "@/lib/edc";
import { requireAuth, isAuthError } from "@/lib/auth-guard";
import {
  auditCallbackAddresses,
  auditUnavailableResponse,
  recordDspEvent,
  recordDspEventAfter,
} from "@/lib/dsp-audit";
import { recordDemo, listDemo } from "@/lib/demo-records";
import { loadTestId } from "@/lib/proxy";
import { tagRows } from "@/lib/row-provenance";
import { promises as fs } from "fs";
import path from "path";

export const dynamic = "force-dynamic";

/** The connector's DSP base, as the containers next to it reach it. */
const DSP_BASE =
  process.env.EDC_PROTOCOL_URL || "http://controlplane:8082/api/dsp";

/** Before EDC 0.18 a participant's DSP address ended in the DSP version. */
const LEGACY_VERSION_SUFFIX = "/2025-1";

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
 * Build a DSP catalog from the bundled demo assets.
 *
 * Why this exists: `/api/participants` falls back to `public/mock/participants.json`
 * whenever the connector reports no ACTIVATED participant contexts, which is the
 * state of the Azure deployment today (issue #25, a deliberate scope split under
 * ADR-022). The negotiate page then took one of those demo context ids and sent
 * it to the live connector, which answered `404 Not Found` because no such
 * context exists there. The id was never real, so the request could not have
 * succeeded.
 *
 * Serving the matching demo catalog keeps the walkthrough usable and, because the
 * response carries `demo: true`, the page says plainly where the data came from
 * rather than presenting it as a live catalog.
 */
async function loadDemoCatalog(
  providerDid: string,
): Promise<Record<string, unknown> | null> {
  try {
    const raw = await fs.readFile(
      path.join(process.cwd(), "public", "mock", "assets.json"),
      "utf-8",
    );
    const entries = JSON.parse(raw) as {
      participantId?: string;
      identity?: string;
      assets?: Record<string, unknown>[];
    }[];

    const wanted = decodeURIComponent(providerDid).toLowerCase();
    const entry = entries.find(
      (e) =>
        decodeURIComponent(e.identity ?? "").toLowerCase() === wanted ||
        e.participantId === providerDid,
    );
    if (!entry || !(entry.assets ?? []).length) return null;

    const dataset = (entry.assets ?? []).map((asset) => {
      const props = (asset.properties ?? {}) as Record<string, unknown>;
      const assetId = (asset["@id"] ?? props.id ?? "") as string;
      return {
        "@id": assetId,
        "@type": "dcat:Dataset",
        name: props.name ?? assetId,
        description: props.description ?? "",
        contenttype: props.contenttype ?? "",
        hasPolicy: [
          {
            "@id": `demo-offer:${assetId}`,
            "@type": "odrl:Offer",
            assigner: entry.identity ?? providerDid,
            target: assetId,
            permission: [{ action: "use" }],
          },
        ],
      };
    });

    return {
      "@context": [EDC_CONTEXT],
      "@type": "dcat:Catalog",
      participantId: entry.identity ?? providerDid,
      dataset,
      demo: true,
    };
  } catch {
    return null;
  }
}

/**
 * Build the full per-participant DSP endpoint from a base URL + ctx ID.
 * EDC 0.18 format: {dspBase}/{providerCtxId}/{profileId}. The connector routes
 * /{participantContextId}/{profileId}/catalog|negotiations|transfers, so the
 * last segment is the profile id; /{ctx}/2025-1 answers 404 (#542). An address
 * still ending in /2025-1 has that segment replaced.
 *
 * Examples:
 *   buildDspEndpoint("http://controlplane:8082/api/dsp", "abc123")
 *   → "http://controlplane:8082/api/dsp/abc123/http-dsp-profile-2025-1"
 */
function buildDspEndpoint(base: string, ctxId: string): string {
  let clean = base; // strip trailing slashes; a loop, as /\/+$/ backtracks
  while (clean.endsWith("/")) clean = clean.slice(0, -1);
  if (clean.endsWith(`/${DSP_PROTOCOL}`)) return clean;
  if (clean.endsWith(LEGACY_VERSION_SUFFIX)) {
    return `${clean.slice(0, -LEGACY_VERSION_SUFFIX.length)}/${DSP_PROTOCOL}`;
  }
  // If ctxId already embedded, just add the profile id
  if (clean.includes(ctxId)) return `${clean}/${DSP_PROTOCOL}`;
  return `${clean}/${ctxId}/${DSP_PROTOCOL}`;
}

/**
 * The participant context whose identity is this DID. The catalog request
 * takes the provider's DSP address, which carries its context id, while the
 * page only knows the provider's DID.
 */
async function providerContextId(did: string): Promise<string> {
  const participants = await edcClient.management<
    { "@id"?: string; identity?: string }[]
  >("/v5alpha/participants");
  const match = Array.isArray(participants)
    ? participants.find((p) => p.identity === did)
    : undefined;
  if (!match?.["@id"]) {
    throw new Error(`No participant context has the identity ${did}`);
  }
  return match["@id"];
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
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

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
      // The v1alpha catalog-by-DID endpoint is gone in EDC 0.18 (404, #542);
      // catalog/request takes the provider's DSP address instead.
      const providerCtx = await providerContextId(providerDid);
      const catalogData = await edcClient.management(
        `/v5alpha/participants/${participantId}/catalog/request`,
        "POST",
        {
          "@context": [EDC_CONTEXT],
          "@type": "CatalogRequest",
          counterPartyAddress: buildDspEndpoint(DSP_BASE, providerCtx),
          counterPartyId: providerDid,
          protocol: DSP_PROTOCOL,
        },
      );
      return NextResponse.json(catalogData);
    } catch (err) {
      console.error("Failed to fetch provider catalog:", err);
      const msg = err instanceof Error ? err.message : String(err);

      // The connector has no participant context for this id. That is expected
      // while the Azure EDC stack is unseeded, because the id came from the demo
      // participant list in the first place. Serve the demo catalog and label it.
      const demo = await loadDemoCatalog(providerDid);
      if (demo) {
        return NextResponse.json({
          ...demo,
          demoReason:
            "The connector has no participant context for this id, so these offers " +
            "come from the demonstrator's own catalogue rather than from a live DSP " +
            "request. Tracked in issue #25.",
          upstreamError: msg,
        });
      }

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

  // Negotiations this process recorded because the connector could not take
  // them (see lib/demo-records.ts). They come first: the newest is the one the
  // user just made, and the transfer page reads its agreements from this list.
  const demoNegotiations = listDemo("negotiation", participantId);

  // Merge with demo negotiations so the full workflow is always demonstrable
  const mockNegotiations = await loadMockNegotiations();
  const realIds = new Set(
    realNegotiations.map((n) => (n as Record<string, unknown>)["@id"]),
  );
  const taken = new Set([...realIds, ...demoNegotiations.map((d) => d["@id"])]);
  const deduped = mockNegotiations.filter(
    (m) => !taken.has((m as Record<string, unknown>)["@id"]),
  );
  // Each row says where it came from and whether the detail route can serve
  // it: the list merges three sources, the detail route asks only the control
  // plane, and without this a person cannot tell which rows 502 (#358).
  const merged = [
    ...tagRows(demoNegotiations, "demo"),
    ...tagRows(realNegotiations, "controlplane"),
    ...tagRows(deduped, "mock"),
  ];

  return NextResponse.json(merged);
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

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

    // Construct the full DSP endpoint: {dspBase}/{providerCtxId}/{profileId}
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
      // Every state the connector moves this negotiation through reaches the
      // audit trail (ADR-045, #418).
      ...(auditCallbackAddresses("contract.negotiation").length > 0
        ? { callbackAddresses: auditCallbackAddresses("contract.negotiation") }
        : {}),
    };

    // On the audit trail before the connector is asked, or not at all.
    const audited = {
      process: "contract-negotiation" as const,
      loadTest: loadTestId(req),
      participantContext: participantId,
      consumerId: participantId,
      counterPartyId: counterPartyId || undefined,
      providerId: providerDid || undefined,
      assetId,
    };
    try {
      await recordDspEvent({
        ...audited,
        event: "requested",
        outcome: "success",
      });
    } catch (err) {
      return auditUnavailableResponse(err);
    }

    try {
      const result = await edcClient.management<Record<string, unknown>>(
        `/v5alpha/participants/${participantId}/contractnegotiations`,
        "POST",
        negotiationPayload,
      );
      await recordDspEventAfter({
        ...audited,
        event: "initiated",
        outcome: "success",
        processId:
          result && typeof result["@id"] === "string"
            ? result["@id"]
            : undefined,
      });
      return NextResponse.json(result, { status: 201 });
    } catch (err) {
      // An offer that came from the demo catalogue cannot be negotiated against
      // the connector: neither the participant context nor the offer exists
      // there. Record it as a demo negotiation and label it, rather than ending
      // the walkthrough on a 502 the audience cannot act on. A real offer that
      // fails still fails, because that is a genuine fault worth seeing.
      const offer = String(offerId || policyId || "");
      if (!offer.startsWith("demo-offer:")) {
        await recordDspEventAfter({
          ...audited,
          event: "failed",
          outcome: "failure",
          reason: err instanceof Error ? err.message : String(err),
        });
        throw err;
      }

      const msg = err instanceof Error ? err.message : String(err);
      console.warn("Demo offer negotiated without a connector:", msg);

      const negotiation = {
        "@id": `demo-negotiation:${assetId}`,
        "@type": "ContractNegotiation",
        // Finalized, and carrying an agreement, because the next step of the
        // walkthrough builds its list from finalized negotiations that have one.
        // A demo negotiation left at REQUESTED is a dead end: nothing exists that
        // could ever advance it, so the transfer page never sees it and the flow
        // dies one click later. Both ids keep the demo- prefix so no later step
        // mistakes them for something a connector issued.
        state: "FINALIZED",
        contractAgreementId: `demo-agreement:${assetId}`,
        counterPartyId: counterPartyId || "",
        counterPartyAddress: dspEndpoint,
        protocol: DSP_PROTOCOL,
        assetId,
        offerId: offer,
        createdAt: Date.now(),
        demo: true,
        demoReason:
          "This offer came from the demonstrator's catalogue, so the request was " +
          "recorded here rather than sent to the connector, which has no participant " +
          "context for it. No DSP agreement was signed with anyone: the record is " +
          "finalized so that the transfer step has a contract to work with. " +
          "Tracked in issue #25.",
        upstreamError: msg,
      };

      // Nothing was written to the connector, so this process is the only place
      // the record can live until the next read (lib/demo-records.ts).
      recordDemo("negotiation", participantId, negotiation);
      await recordDspEventAfter({
        ...audited,
        event: "finalized",
        outcome: "success",
        processId: negotiation["@id"],
        agreementId: negotiation.contractAgreementId,
        demo: true,
      });

      return NextResponse.json(negotiation, { status: 201 });
    }
  } catch (err) {
    console.error("Failed to initiate negotiation:", err);
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: "Failed to initiate contract negotiation", detail: msg },
      { status: 502 },
    );
  }
}

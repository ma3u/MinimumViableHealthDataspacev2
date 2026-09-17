import { NextRequest, NextResponse } from "next/server";
import { edcClient, EDC_CONTEXT } from "@/lib/edc";
import { requireAuth, isAuthError } from "@/lib/auth-guard";
import { recordDemo, listDemo, DemoRecord } from "@/lib/demo-records";
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
 * Load the bundled demo negotiations, whose agreements the transfer page offers.
 */
async function loadMockNegotiations(): Promise<unknown[]> {
  try {
    const raw = await fs.readFile(
      path.join(process.cwd(), "public", "mock", "negotiations.json"),
      "utf-8",
    );
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
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

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

  // Transfers this process recorded because the connector could not take them
  // (see lib/demo-records.ts). They come first: the page refetches this list
  // right after starting a transfer, and a row that vanishes on the refetch
  // looks like a failure.
  const demoTransfers = listDemo("transfer", participantId);

  // Merge with demo transfers so the FHIR viewer is always demonstrable
  const mockTransfers = await loadMockTransfers();
  const realIds = new Set(
    realTransfers.map((t) => (t as Record<string, unknown>)["@id"]),
  );
  const taken = new Set([...realIds, ...demoTransfers.map((d) => d["@id"])]);
  const deduped = mockTransfers.filter(
    (m) => !taken.has((m as Record<string, unknown>)["@id"]),
  );
  const merged = [...demoTransfers, ...realTransfers, ...deduped];

  return NextResponse.json(merged);
}

/** Mock agreement IDs follow pattern: agreement-fhir-<type>-<NNN> */
const MOCK_AGREEMENT_RE = /^agreement-fhir-[\w-]+-\d{3}$/;

/**
 * True for a contract id the demonstrator minted itself, which therefore cannot
 * exist in any connector: the synthetic agreements of the bundled fixtures, and
 * the `demo-agreement:` ids that `POST /api/negotiations` records when the offer
 * came from the demo catalogue rather than from a live DSP request (issue #25).
 */
function isInventedContractId(contractId: string): boolean {
  return (
    contractId.startsWith("demo-agreement:") ||
    MOCK_AGREEMENT_RE.test(contractId)
  );
}

/**
 * True for an agreement that is only known from `public/mock/negotiations.json`.
 *
 * Two of those agreements are plain UUIDs left over from a seeded run, so their
 * shape tells us nothing, and they are the first two rows the transfer page
 * shows. "Start Transfer" on either of them sent a contract the connector has
 * never heard of and printed the raw 502, which is the same dead end one step
 * further down the walkthrough. Checked only after the connector has refused
 * the transfer, so a genuinely live agreement is never diverted.
 */
async function isFixtureAgreement(contractId: string): Promise<boolean> {
  const negotiations = await loadMockNegotiations();
  return negotiations.some((n) => {
    const r = n as Record<string, unknown>;
    return (
      r.contractAgreementId === contractId ||
      r["edc:contractAgreementId"] === contractId
    );
  });
}

/** The transfer process recorded for a contract no connector can act on. */
function buildDemoTransfer(
  contractId: string,
  assetId: string,
  transferType: string,
  counterPartyAddress: string,
  demoReason: string,
  upstreamError?: string,
): DemoRecord {
  return {
    "@type": "TransferProcess",
    // One id per contract, so starting the same transfer twice replaces the row
    // instead of stacking duplicates. The contract's own demo- prefix is dropped
    // rather than nested, which would read as demo-transfer:demo-agreement:x.
    "@id": `demo-transfer:${contractId.replace(/^demo-agreement:/, "")}`,
    state: "STARTED",
    stateTimestamp: Date.now(),
    type: "CONSUMER",
    contractId,
    assetId,
    transferType,
    counterPartyAddress,
    demo: true,
    demoReason,
    ...(upstreamError ? { upstreamError } : {}),
  };
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

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

    const asset = assetId || "";
    const resolvedType = transferType || "HttpData-PULL";

    // Demo-mode: a contract this demonstrator minted itself cannot exist in any
    // connector, so there is nothing to ask. Record the transfer and label it.
    if (isInventedContractId(contractId)) {
      const demo = buildDemoTransfer(
        contractId,
        asset,
        resolvedType,
        counterPartyAddress,
        "This contract was recorded by the demonstrator rather than agreed over DSP, " +
          "so the transfer was recorded here too instead of being sent to the " +
          "connector, which has never seen the contract. The FHIR payload below is " +
          "the demonstrator's own. Tracked in issue #25.",
      );
      recordDemo("transfer", participantId, demo);
      return NextResponse.json(demo, { status: 201 });
    }

    const transferPayload = {
      "@context": [EDC_CONTEXT],
      "@type": "TransferRequest",
      counterPartyAddress,
      protocol: "dataspace-protocol-http:2025-1",
      contractId,
      assetId: asset,
      transferType: resolvedType,
      dataDestination: {
        "@type": "DataAddress",
        type: "HttpProxy",
      },
    };

    try {
      const result = await edcClient.management(
        `/v5alpha/participants/${participantId}/transferprocesses`,
        "POST",
        transferPayload,
      );
      return NextResponse.json(result, { status: 201 });
    } catch (err) {
      // An agreement that only exists in the bundled fixtures looks real (two of
      // them are UUIDs from an old seeded run), so it is tried against the
      // connector first and only diverted once the connector has refused it. A
      // genuinely live agreement that fails still returns the 502 below, because
      // that is a real fault and hiding it would be worse than the original bug.
      if (!(await isFixtureAgreement(contractId))) throw err;

      const msg = err instanceof Error ? err.message : String(err);
      console.warn("Demo agreement transferred without a connector:", msg);

      const demo = buildDemoTransfer(
        contractId,
        asset,
        resolvedType,
        counterPartyAddress,
        "This agreement comes from the demonstrator's own negotiation history, so " +
          "the connector has no contract to transfer under. The transfer was " +
          "recorded here and the FHIR payload below is the demonstrator's own. " +
          "Tracked in issue #25.",
        msg,
      );
      recordDemo("transfer", participantId, demo);
      return NextResponse.json(demo, { status: 201 });
    }
  } catch (err) {
    console.error("Failed to initiate transfer:", err);
    const detail =
      err instanceof Error ? err.message : "Failed to initiate data transfer";
    return NextResponse.json({ error: detail }, { status: 502 });
  }
}

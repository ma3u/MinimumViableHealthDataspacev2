import { NextRequest, NextResponse } from "next/server";
import { edcClient } from "@/lib/edc";
import { requireAuth, isAuthError } from "@/lib/auth-guard";
import { seesPatientIdentity } from "@/lib/patient-identity";
import { NEO4J_PROXY_URL, callerHeaders } from "@/lib/proxy";
import {
  DEFAULT_IMPORT_SPE,
  importGraphUrl,
  importSpeId,
  type SpeImportResult,
} from "@/lib/spe-import";
import {
  isPlainId,
  pseudonymiseFhir,
  pullTransferData,
  TransferDataError,
} from "@/lib/transfer-data";

export const dynamic = "force-dynamic";

const PROXY_TIMEOUT_MS = 60_000;

/**
 * The provider of an agreement. An EDC 1.0 transfer process names no
 * counterparty, the agreement does; without one the import has no provider.
 */
async function providerOfAgreement(
  participantId: string,
  agreementId: string,
): Promise<string> {
  if (!isPlainId(agreementId)) return "";
  try {
    const agreement = await edcClient.management<Record<string, unknown>>(
      `/v5/participants/${participantId}/contractagreements/${agreementId}`,
    );
    return String(agreement.providerId ?? "");
  } catch {
    return "";
  }
}

/**
 * POST /api/transfers/[id]/import — body {participantId, speId?}.
 *
 * Ends a transfer where EHDS Art. 73 puts it, in a secure processing
 * environment (#876): pulls the data of the STARTED transfer as
 * GET /api/transfers/[id]/data does, pseudonymised for the roles that do not
 * see identity (#475), and has the neo4j-proxy write it into the chosen SPE's
 * Neo4j, SPE-1 unless the user picks another. Answers what was imported and
 * the graph viewer's link to it.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as {
    participantId?: unknown;
    speId?: unknown;
  };
  const participantId = String(body.participantId ?? "");
  const requestedSpe = String(body.speId || DEFAULT_IMPORT_SPE);
  const speId = importSpeId(requestedSpe);
  if (!isPlainId(participantId) || !isPlainId(id)) {
    return NextResponse.json(
      { error: "participantId and a transfer id are required" },
      { status: 400 },
    );
  }
  if (!speId) {
    return NextResponse.json(
      { error: `Unknown SPE '${requestedSpe}' (SPE-1 or SPE-2)` },
      { status: 400 },
    );
  }

  let transfer: Record<string, unknown>;
  try {
    transfer = await edcClient.management<Record<string, unknown>>(
      `/v5/participants/${participantId}/transferprocesses/${id}`,
    );
  } catch (err) {
    console.error("Transfer not readable:", { id }, err);
    return NextResponse.json(
      { error: "Not found", detail: "The connector has no such transfer" },
      { status: 404 },
    );
  }
  const state = String(transfer.state ?? "");
  if (state !== "STARTED") {
    return NextResponse.json(
      {
        error: `The transfer is ${state || "in no known state"}, not STARTED`,
        state,
      },
      { status: 409 },
    );
  }

  let bundle: unknown;
  const pseudonymised = !seesPatientIdentity(auth.session.roles);
  try {
    const pulled = await pullTransferData(participantId, id, transfer);
    if (pulled.truncated) {
      return NextResponse.json(
        { error: "The transfer's data is too large to import at once" },
        { status: 413 },
      );
    }
    bundle = pseudonymised ? pseudonymiseFhir(pulled.data) : pulled.data;
  } catch (err) {
    const step = err instanceof TransferDataError ? err.step : "data";
    const detail = err instanceof Error ? err.message : String(err);
    console.error("Pulling a transfer for import failed:", { id, step }, err);
    return NextResponse.json(
      { error: "Failed to fetch the transfer's data", step, detail },
      { status: 502 },
    );
  }

  const agreementId = String(transfer.contractId ?? "");
  const provider =
    String(transfer.counterPartyId ?? "") ||
    (await providerOfAgreement(participantId, agreementId));

  let res: Response;
  try {
    res = await fetch(
      `${NEO4J_PROXY_URL}/spe/${encodeURIComponent(speId)}/import`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...callerHeaders(auth.session),
        },
        body: JSON.stringify({
          datasetId: id,
          transferId: id,
          agreementId,
          assetId: String(transfer.assetId ?? ""),
          provider,
          consumer: participantId,
          importedBy: auth.session.user.name ?? "",
          pseudonymised,
          bundle,
        }),
        signal: AbortSignal.timeout(PROXY_TIMEOUT_MS),
        cache: "no-store",
      },
    );
  } catch (err) {
    console.error("Importing a transfer failed:", { id, speId }, err);
    return NextResponse.json(
      {
        error: `${speId} did not answer`,
        step: "import",
        detail: String(err),
      },
      { status: 502 },
    );
  }
  const answer = (await res.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  if (!res.ok) {
    return NextResponse.json(
      {
        error: String(answer.error ?? `${speId} refused the import`),
        step: "import",
      },
      { status: res.status === 422 ? 422 : res.status === 503 ? 503 : 502 },
    );
  }
  const result: SpeImportResult = {
    datasetId: String(answer.datasetId ?? id),
    speId,
    records: Number(answer.records ?? 0),
    relationships: Number(answer.relationships ?? 0),
    byType: (answer.byType as Record<string, number>) ?? {},
    importedAt: String(answer.importedAt ?? ""),
    pseudonymised,
    graphUrl: importGraphUrl(id, speId),
  };
  return NextResponse.json(result);
}

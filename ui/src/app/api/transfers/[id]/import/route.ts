import { NextRequest, NextResponse } from "next/server";
import { edcClient } from "@/lib/edc";
import { EDC_CONTEXT } from "@/lib/edc/client";
import { requireAuth, isAuthError } from "@/lib/auth-guard";
import { seesPatientIdentity } from "@/lib/patient-identity";
import { NEO4J_PROXY_URL, callerHeaders } from "@/lib/proxy";
import {
  speColdStartGate,
  spePowerAvailable,
  type SpeId,
} from "@/lib/spe-power";
import {
  DEFAULT_IMPORT_SPE,
  closedAfterImportReason,
  importViewUrl,
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
 * POST /api/transfers/[id]/import — body {participantId, speId?, overwrite?}.
 *
 * Ends a transfer where EHDS Art. 73 puts it, in a secure processing
 * environment (#876): pulls the data of the STARTED transfer as
 * GET /api/transfers/[id]/data does, pseudonymised for the roles that do not
 * see identity (#475), and has the neo4j-proxy write it into the chosen SPE's
 * Neo4j, SPE-1 unless the user picks another. A transfer the SPE holds
 * already answers 409 with that import, unless `overwrite` is true. Answers
 * what was imported and the link to its 3D overview. Then it terminates the
 * transfer, so the access to the provider's data ends with the import.
 *
 * On Azure the workspaces are confidential ACI groups that start on demand
 * (ADR-072): a stopped one is started and the import answers 503 with how
 * long, as a federated query does. Their store is in memory, so the answer
 * says the import lasts until the workspace stops; loading it as a sealed
 * extract through the Trustee (ADR-068) is #915.
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
    overwrite?: unknown;
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

  const coldStart = await speColdStartGate(auth.session.roles, Date.now(), [
    speId as SpeId,
  ]);
  if (coldStart) return coldStart;

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
    const expired = err instanceof TransferDataError && err.expired;
    const detail = err instanceof Error ? err.message : String(err);
    console.error("Pulling a transfer for import failed:", { id, step }, err);
    return NextResponse.json(
      { error: "Failed to fetch the transfer's data", step, detail, expired },
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
          // The SPE refuses a transfer it holds already unless told to replace it.
          overwrite: body.overwrite === true,
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
  if (res.status === 409) {
    return NextResponse.json(
      {
        error: String(answer.error ?? `${speId} holds this transfer already`),
        step: "import",
        existing: answer.existing,
      },
      { status: 409 },
    );
  }
  if (!res.ok) {
    return NextResponse.json(
      {
        error: String(answer.error ?? `${speId} refused the import`),
        step: "import",
      },
      { status: res.status === 422 ? 422 : res.status === 503 ? 503 : 502 },
    );
  }
  // The data is where Art. 73 wants it: close the access to the provider's
  // data. EDC lets the consumer terminate a transfer, not complete it. An
  // import that could not close the transfer still stands.
  let closed = false;
  try {
    await edcClient.management(
      `/v5/participants/${participantId}/transferprocesses/${id}/terminate`,
      "POST",
      {
        "@context": [EDC_CONTEXT],
        "@type": "TerminateTransfer",
        reason: closedAfterImportReason(speId),
      },
    );
    closed = true;
  } catch (err) {
    console.error("Closing a transfer after its import failed:", { id }, err);
  }

  const result: SpeImportResult = {
    datasetId: String(answer.datasetId ?? id),
    speId,
    records: Number(answer.records ?? 0),
    relationships: Number(answer.relationships ?? 0),
    byType: (answer.byType as Record<string, number>) ?? {},
    importedAt: String(answer.importedAt ?? ""),
    pseudonymised,
    untilStopped: spePowerAvailable(),
    closed,
    graphUrl: importViewUrl(id, speId),
  };
  return NextResponse.json(result);
}

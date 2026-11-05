import { NextRequest, NextResponse } from "next/server";
import { edcClient } from "@/lib/edc";
import { requireAuth, isAuthError } from "@/lib/auth-guard";
import { seesPatientIdentity } from "@/lib/patient-identity";
import {
  flowToken,
  isPlainId,
  pseudonymiseFhir,
  pullData,
  TransferDataError,
} from "@/lib/transfer-data";

export const dynamic = "force-dynamic";

/**
 * GET /api/transfers/[id]/data?participantId=<consumer ctx> — the data a
 * STARTED HttpData-PULL transfer gives access to (#876).
 *
 * A transfer stays STARTED while its access is open; nothing on the transfer
 * page read the data, so every real transfer showed "in progress" for good.
 * This asks the consumer's siglet for the flow's token and calls the
 * provider's data plane with it (lib/transfer-data.ts). The token stays on the
 * server. Patient resources come back pseudonymised for roles that do not see
 * identity (#475).
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  const { id } = await params;
  const participantId = req.nextUrl.searchParams.get("participantId") || "";
  if (!isPlainId(participantId) || !isPlainId(id)) {
    return NextResponse.json(
      { error: "participantId and a transfer id are required" },
      { status: 400 },
    );
  }

  let transfer: Record<string, unknown>;
  try {
    transfer = await edcClient.management<Record<string, unknown>>(
      `/v5alpha/participants/${participantId}/transferprocesses/${id}`,
    );
  } catch (err) {
    console.error(`Transfer ${id} not readable:`, err);
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

  try {
    const token = await flowToken(participantId, [
      id,
      String(transfer.correlationId ?? ""),
    ]);
    const pulled = await pullData(token);
    const data = seesPatientIdentity(auth.session.roles)
      ? pulled.data
      : pseudonymiseFhir(pulled.data);
    return NextResponse.json({
      transferId: id,
      assetId: transfer.assetId ?? "",
      contractId: transfer.contractId ?? "",
      contentType: pulled.contentType,
      bytes: pulled.bytes,
      truncated: pulled.truncated,
      fetchedAt: new Date().toISOString(),
      data,
    });
  } catch (err) {
    const step = err instanceof TransferDataError ? err.step : "data";
    const detail = err instanceof Error ? err.message : String(err);
    console.error(`Pulling the data of transfer ${id} failed at ${step}:`, err);
    return NextResponse.json(
      { error: "Failed to fetch the transfer's data", step, detail },
      { status: 502 },
    );
  }
}

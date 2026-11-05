import { NextRequest, NextResponse } from "next/server";
import { edcClient } from "@/lib/edc";
import { requireAuth, isAuthError } from "@/lib/auth-guard";
import { isPlainId } from "@/lib/transfer-data";
import { toAgreementView } from "@/lib/agreement";

export const dynamic = "force-dynamic";

/**
 * GET /api/agreements/[id]?participantId=<ctx> — one contract agreement from
 * the connector: when it was signed, until when it allows use, and the policy
 * both parties agreed to (#876). The transfer page shows it beside the data.
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
      { error: "participantId and an agreement id are required" },
      { status: 400 },
    );
  }

  try {
    const raw = await edcClient.management<Record<string, unknown>>(
      `/v5/participants/${participantId}/contractagreements/${id}`,
    );
    return NextResponse.json(toAgreementView(raw));
  } catch (err) {
    console.error(`Agreement ${id} not readable:`, err);
    return NextResponse.json(
      { error: "Not found", detail: "The connector has no such agreement" },
      { status: 404 },
    );
  }
}

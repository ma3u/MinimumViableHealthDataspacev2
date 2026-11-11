import { NextRequest, NextResponse } from "next/server";
import { edcClient } from "@/lib/edc";
import { isEdcNotFound } from "@/lib/edc/client";
import { requireAuth, isAuthError } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";

/**
 * GET /api/transfers/[id]?participantId=<id> — Get transfer by ID.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  const { id } = await params;
  const participantId = req.nextUrl.searchParams.get("participantId");

  if (!participantId) {
    return NextResponse.json(
      { error: "participantId query parameter is required" },
      { status: 400 },
    );
  }

  try {
    const transfer = await edcClient.management(
      `/v5/participants/${participantId}/transferprocesses/${id}`,
    );
    return NextResponse.json(transfer);
  } catch (err) {
    // The connector answered, and it has no such transfer: that is a 404 of
    // ours too, not a bad gateway (the spec has promised 404 all along).
    if (isEdcNotFound(err)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    console.error(`Failed to get transfer ${id}:`, err);
    return NextResponse.json(
      { error: "Failed to get transfer" },
      { status: 502 },
    );
  }
}

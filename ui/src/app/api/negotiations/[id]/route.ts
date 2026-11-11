import { NextRequest, NextResponse } from "next/server";
import { edcClient } from "@/lib/edc";
import { isEdcNotFound } from "@/lib/edc/client";
import { requireAuth, isAuthError } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";

/**
 * GET /api/negotiations/[id]?participantId=<id> — Get negotiation by ID.
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
    const negotiation = await edcClient.management(
      `/v5/participants/${participantId}/contractnegotiations/${id}`,
    );
    return NextResponse.json(negotiation);
  } catch (err) {
    // The connector answered, and it has no such negotiation: that is a 404 of
    // ours too, not a bad gateway (the spec has promised 404 all along).
    if (isEdcNotFound(err)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    console.error(`Failed to get negotiation ${id}:`, err);
    return NextResponse.json(
      { error: "Failed to get negotiation" },
      { status: 502 },
    );
  }
}

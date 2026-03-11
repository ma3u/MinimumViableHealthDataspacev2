import { NextRequest, NextResponse } from "next/server";
import { edcClient } from "@/lib/edc";

export const dynamic = "force-dynamic";

/**
 * GET /api/transfers/[id]?participantId=<id> — Get transfer by ID.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
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
      `/v5alpha/participants/${participantId}/transferprocesses/${id}`,
    );
    return NextResponse.json(transfer);
  } catch (err) {
    console.error(`Failed to get transfer ${id}:`, err);
    return NextResponse.json(
      { error: "Failed to get transfer" },
      { status: 502 },
    );
  }
}

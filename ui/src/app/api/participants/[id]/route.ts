import { NextRequest, NextResponse } from "next/server";
import { updateContextProperties } from "@/lib/edc/participants";
import { requireAuth, isAuthError } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/participants/[id] — Update a participant's properties (display
 * name, contact details, etc.), kept on its control plane context (ADR-078).
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  try {
    const { id } = await params;
    const body = await req.json();
    const { properties } = body as { properties: Record<string, string> };

    if (!properties || typeof properties !== "object") {
      return NextResponse.json(
        { error: "Missing properties" },
        { status: 400 },
      );
    }

    await updateContextProperties(id, properties);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Failed to PATCH participant:", err);
    return NextResponse.json(
      { error: "Failed to update participant" },
      { status: 502 },
    );
  }
}

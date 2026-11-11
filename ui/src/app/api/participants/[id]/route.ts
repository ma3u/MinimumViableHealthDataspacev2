import { NextRequest, NextResponse } from "next/server";
import { updateContextProperties } from "@/lib/edc/participants";
import {
  removeParticipant,
  ParticipantNotFound,
  RemovalRefused,
} from "@/lib/edc/remove-participant";
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

/**
 * DELETE /api/participants/[id] — Remove a participant registered through
 * /onboarding: issuer holder, siglet mapping, IdentityHub participant, control
 * plane context, and with CFM_TENANT_URL set its CFM tenant (ADR-085 step 3).
 * EDC_ADMIN only. A seeded participant is refused (409), nothing touched.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth(["EDC_ADMIN"]);
  if (isAuthError(auth)) return auth;

  const { id } = await params;
  try {
    const { contextId, did, steps } = await removeParticipant(id);
    const complete = steps.every((s) => s.ok);
    return NextResponse.json(
      { removed: contextId, did, complete, steps },
      { status: 200 },
    );
  } catch (err) {
    if (err instanceof ParticipantNotFound) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (err instanceof RemovalRefused) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    console.error("Failed to remove participant:", err);
    return NextResponse.json(
      {
        error: "Failed to remove participant",
        detail: err instanceof Error ? err.message.split("\n")[0] : String(err),
      },
      { status: 502 },
    );
  }
}

import { NextResponse } from "next/server";
import { requireAuth, isAuthError } from "@/lib/auth-guard";
import { getPairing, pairingStatus } from "@/lib/app-pairing";
import { sessionUsername } from "@/lib/patient/session-username";

export const dynamic = "force-dynamic";

/**
 * GET /api/patient/app-pairing/{pairingId}
 *
 * Polled by the patient screen while the QR code is showing: `pending` until
 * the phone registers, then `connected` with its name, or `expired` when the
 * two minutes ran out. A pairing is visible only to the login that started it;
 * anyone else gets the same 404 as for one that never existed.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ pairingId: string }> },
) {
  const auth = await requireAuth(["PATIENT"]);
  if (isAuthError(auth)) return auth;
  const username = await sessionUsername();
  const { pairingId } = await params;
  let pairing;
  try {
    pairing = username ? await getPairing(pairingId, username) : null;
  } catch (err) {
    console.error("GET /api/patient/app-pairing/[pairingId]:", err);
    return NextResponse.json({ error: "Neo4j unavailable" }, { status: 502 });
  }
  if (!pairing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({
    pairingId: pairing.id,
    status: pairingStatus(pairing),
    expiresAt: new Date(pairing.expiresAt).toISOString(),
    ...(pairing.deviceName ? { deviceName: pairing.deviceName } : {}),
  });
}

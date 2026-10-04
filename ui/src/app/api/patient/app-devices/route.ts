import { NextResponse } from "next/server";
import { requireAuth, isAuthError } from "@/lib/auth-guard";
import { requireAppToken, isAppAuthError } from "@/lib/app-auth";
import {
  cleanDeviceName,
  DEVICE_ID,
  listConnections,
  registerConnection,
} from "@/lib/app-connections";
import { completePairing, getPairing } from "@/lib/app-pairing";
import { sessionUsername } from "@/lib/patient/session-username";

export const dynamic = "force-dynamic";

/**
 * GET /api/patient/app-devices
 *
 * The phones this patient connected (#473), for the patient screen's list
 * with Disconnect. A PATIENT session, own login only.
 */
export async function GET() {
  const auth = await requireAuth(["PATIENT"]);
  if (isAuthError(auth)) return auth;
  const username = await sessionUsername();
  if (!username) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const devices = await listConnections(username);
    return NextResponse.json({ devices });
  } catch (err) {
    console.error("GET /api/patient/app-devices:", err);
    return NextResponse.json({ error: "Neo4j unavailable" }, { status: 502 });
  }
}

/**
 * POST /api/patient/app-devices
 *
 * Called by the Klarbefund app once it holds a token (ADR-049): registers the
 * phone under the pairing it scanned. The token must be the app's, and the
 * pairing must have been started by the same login the token names, so a QR
 * code from someone else's screen cannot bind your phone to their record, or
 * theirs to yours.
 *
 * Body: `{ pairingId, deviceId, deviceName }`, deviceId a UUID v4 the app
 * generated once.
 */
export async function POST(request: Request) {
  const auth = await requireAppToken(request, { device: false });
  if (isAppAuthError(auth)) return auth;
  const { username } = auth.app;

  let body: { pairingId?: unknown; deviceId?: unknown; deviceName?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON" }, { status: 400 });
  }
  const pairingId = typeof body.pairingId === "string" ? body.pairingId : "";
  const deviceId = typeof body.deviceId === "string" ? body.deviceId : "";
  if (!DEVICE_ID.test(deviceId)) {
    return NextResponse.json(
      { error: "deviceId must be a UUID v4" },
      { status: 400 },
    );
  }
  let pairing;
  try {
    pairing = await getPairing(pairingId, username);
  } catch (err) {
    console.error("POST /api/patient/app-devices:", err);
    return NextResponse.json({ error: "Neo4j unavailable" }, { status: 502 });
  }
  if (!pairing) {
    return NextResponse.json(
      {
        error: "Forbidden",
        reason: "no pairing of this login matches; scan a new QR code",
      },
      { status: 403 },
    );
  }
  if (pairing.deviceId && pairing.deviceId !== deviceId) {
    return NextResponse.json(
      { error: "Conflict", reason: "this QR code already connected a phone" },
      { status: 409 },
    );
  }
  const deviceName = cleanDeviceName(body.deviceName);
  try {
    const connection = await registerConnection({
      deviceId,
      deviceName,
      username,
    });
    if (!connection) {
      return NextResponse.json(
        {
          error: "Conflict",
          reason: "this device id belongs to another login",
        },
        { status: 409 },
      );
    }
    await completePairing(pairing.id, username, deviceId, deviceName);
    return NextResponse.json({ connection }, { status: 201 });
  } catch (err) {
    console.error("POST /api/patient/app-devices:", err);
    return NextResponse.json({ error: "Neo4j unavailable" }, { status: 502 });
  }
}

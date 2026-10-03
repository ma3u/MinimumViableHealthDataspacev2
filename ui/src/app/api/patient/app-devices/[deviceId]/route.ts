import { NextResponse } from "next/server";
import { requireAuth, isAuthError } from "@/lib/auth-guard";
import { requireAppToken, isAppAuthError } from "@/lib/app-auth";
import { deleteConnection } from "@/lib/app-connections";
import { sessionUsername } from "@/lib/patient/session-username";

export const dynamic = "force-dynamic";

/**
 * DELETE /api/patient/app-devices/{deviceId}
 *
 * Disconnects a phone (#473, ADR-049). Two callers, two gates:
 *
 * - the patient screen, with a PATIENT session, for any of their phones;
 * - the app itself, with its bearer token, for its own device only.
 *
 * The phone's next call is refused, because every app route checks that its
 * device is still connected. 404 when there was nothing to disconnect.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ deviceId: string }> },
) {
  const { deviceId } = await params;
  let username: string | null;
  if (request.headers.get("authorization")?.startsWith("Bearer ")) {
    const app = await requireAppToken(request, { device: true });
    if (isAppAuthError(app)) return app;
    if (app.app.deviceId !== deviceId) {
      return NextResponse.json(
        { error: "Forbidden", reason: "the app disconnects only itself" },
        { status: 403 },
      );
    }
    username = app.app.username;
  } else {
    const auth = await requireAuth(["PATIENT"]);
    if (isAuthError(auth)) return auth;
    username = await sessionUsername();
  }
  if (!username) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const deleted = await deleteConnection(deviceId, username);
    if (!deleted) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ disconnected: deviceId });
  } catch (err) {
    console.error("DELETE /api/patient/app-devices:", err);
    return NextResponse.json({ error: "Neo4j unavailable" }, { status: 502 });
  }
}

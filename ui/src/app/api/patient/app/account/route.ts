import { NextResponse } from "next/server";
import { requireAppToken, isAppAuthError } from "@/lib/app-auth";
import {
  AccountError,
  deleteKeycloakUser,
  deleteSandboxRecord,
  isSandboxUsername,
} from "@/lib/app-accounts";

export const dynamic = "force-dynamic";

/**
 * DELETE /api/patient/app/account
 *
 * Deletes the account the Klarbefund app created (ADR-054; App Store
 * guideline 5.1.1(v)): the Keycloak login, its record and its phones. App
 * token and a connected device. A demo persona such as `patient1` is not the
 * app's to delete and is refused.
 */
export async function DELETE(request: Request) {
  const auth = await requireAppToken(request, { device: true });
  if (isAppAuthError(auth)) return auth;
  const { username } = auth.app;
  if (!isSandboxUsername(username)) {
    return NextResponse.json(
      {
        error: "Forbidden",
        reason: "only an account the app created can be deleted here",
      },
      { status: 403 },
    );
  }
  try {
    await deleteKeycloakUser(username);
    await deleteSandboxRecord(username);
  } catch (err) {
    console.error("DELETE /api/patient/app/account:", err);
    const status = err instanceof AccountError ? err.status : 502;
    return NextResponse.json(
      {
        error: "Account not deleted",
        reason: err instanceof Error ? err.message : "",
      },
      { status },
    );
  }
  return NextResponse.json({ deleted: username });
}

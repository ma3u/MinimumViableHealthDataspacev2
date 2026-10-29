import { NextResponse } from "next/server";
import { requireAuth, isAuthError } from "@/lib/auth-guard";
import { sessionUsername } from "@/lib/patient/session-username";
import { isSandboxUsername } from "@/lib/sandbox-account";
import { AccountError } from "@/lib/app-accounts";
import {
  clearFingerprint,
  hasFingerprint,
  pidAccountsAvailable,
} from "@/lib/pid-link";

export const dynamic = "force-dynamic";

/**
 * The link between the signed-in patient's account and their EUDI Wallet's
 * PID (ADR-067). The link itself is made by presenting the PID
 * (`POST /api/auth/eudi/start` with `{ purpose: "link" }`); this route says
 * whether there is one and removes it.
 *
 * Only a sandbox account (`kb-`, ADR-054) can carry a link; a demo persona
 * signs in with a wallet by name and is answered `eligible: false`. Neither
 * answer carries the secure hash.
 */
export async function GET(): Promise<NextResponse> {
  const auth = await requireAuth(["PATIENT"]);
  if (isAuthError(auth)) return auth;
  const username = await sessionUsername();
  const available = pidAccountsAvailable();
  if (!username || !isSandboxUsername(username)) {
    return NextResponse.json({ eligible: false, available, linked: false });
  }
  if (!available) {
    return NextResponse.json({ eligible: true, available, linked: false });
  }
  try {
    const linked = await hasFingerprint(username);
    return NextResponse.json({ eligible: true, available, linked });
  } catch (err) {
    return failed("GET", err);
  }
}

/**
 * DELETE: disconnects the wallet (ADR-067 decision 7, GDPR Art. 7(3) and
 * Art. 17): the attribute goes, the account stays.
 */
export async function DELETE(): Promise<NextResponse> {
  const auth = await requireAuth(["PATIENT"]);
  if (isAuthError(auth)) return auth;
  const username = await sessionUsername();
  if (!username || !isSandboxUsername(username)) {
    return NextResponse.json(
      {
        error: "Forbidden",
        reason: "only an account the app or a wallet created carries a link",
      },
      { status: 403 },
    );
  }
  try {
    if (!(await clearFingerprint(username))) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ linked: false });
  } catch (err) {
    return failed("DELETE", err);
  }
}

function failed(method: string, err: unknown): NextResponse {
  console.error(
    `${method} /api/patient/wallet-link:`,
    err instanceof Error ? err.message : "unknown",
  );
  const status = err instanceof AccountError ? err.status : 502;
  return NextResponse.json(
    { error: "Keycloak could not be asked about the wallet link" },
    { status },
  );
}

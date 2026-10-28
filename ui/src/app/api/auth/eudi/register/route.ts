import { NextResponse } from "next/server";
import { getTransaction, updateTransaction } from "@/lib/eudi-store";
import {
  AccountError,
  createKeycloakUser,
  createPidSandboxRecord,
  deleteKeycloakUser,
  deleteSandboxRecord,
  newCredentials,
} from "@/lib/app-accounts";
import {
  findUsernameByFingerprint,
  PID_ATTRIBUTE,
  sandboxPatient,
} from "@/lib/pid-link";
import { accountLimiter, clientAddress } from "@/lib/account-rate-limit";

export const dynamic = "force-dynamic";

/**
 * Fingerprints an account is being made for right now, on this replica. A
 * person who scans twice gets two sids for one PID; the second waits for no
 * one and is refused, so a PID never makes two accounts.
 */
const g = globalThis as unknown as { __pidRegistering?: Set<string> };
const registering: Set<string> =
  g.__pidRegistering ?? (g.__pidRegistering = new Set());

const NOT_OFFERED = "This wallet sign-in cannot create an account.";

/**
 * POST /api/auth/eudi/register
 *
 * Creates a sandbox account from a verified PID (ADR-067 decision 5): a
 * Keycloak login `kb-…` with a generated password and the PID's secure hash,
 * and an empty record of its own, as ADR-054 makes them for the app. Then the
 * `sid` signs in to it, through the `eudi-wallet` provider, at assurance high.
 *
 * Answers without a session: it is part of signing in. The verified PID
 * takes the place of App Attest as the guard, so it answers only for a `sid`
 * whose sign-in was refused with `canRegister`, that holds the PID's hash,
 * has not signed in and has not expired. One account per hash: the hub
 * checks again that no account holds it. The same rate limit as the app's
 * account creation applies.
 *
 * Body: `{ sid }`. The password is in the answer once and nowhere else.
 */
export async function POST(request: Request): Promise<NextResponse> {
  let sid = "";
  try {
    const body = (await request.json()) as { sid?: unknown };
    sid = typeof body.sid === "string" ? body.sid : "";
  } catch {
    return NextResponse.json({ error: "Body must be JSON" }, { status: 400 });
  }
  const tx = sid ? getTransaction(sid) : undefined;
  if (!tx) {
    return NextResponse.json(
      { error: "unknown or expired session" },
      { status: 404 },
    );
  }
  const fingerprint = tx.fingerprint;
  if (
    tx.purpose !== "signin" ||
    tx.status !== "error" ||
    !tx.canRegister ||
    !fingerprint ||
    tx.consumed
  ) {
    return NextResponse.json({ error: NOT_OFFERED }, { status: 403 });
  }
  if (registering.has(fingerprint)) {
    return NextResponse.json(
      { error: "An account is being created for this PID already" },
      { status: 409 },
    );
  }
  if (!accountLimiter.allow(clientAddress(request))) {
    return NextResponse.json(
      { error: "Too many accounts, try again later" },
      { status: 429 },
    );
  }

  // Claimed before the first await, so a second request for this sid or this
  // PID on this replica is refused above.
  registering.add(fingerprint);
  updateTransaction(sid, { canRegister: false });
  const credentials = newCredentials();
  let created = false;
  try {
    if (await findUsernameByFingerprint(fingerprint)) {
      updateTransaction(sid, { fingerprint: undefined });
      return NextResponse.json(
        { error: "This PID already has an account on this hub" },
        { status: 409 },
      );
    }
    await createPidSandboxRecord(credentials.username);
    await createKeycloakUser(credentials, fetch, {
      [PID_ATTRIBUTE]: [fingerprint],
    });
    created = true;
    // Another replica may have made one in the meantime: then neither stays
    // ambiguous, ours goes.
    if (
      (await findUsernameByFingerprint(fingerprint)) !== credentials.username
    ) {
      throw new AccountError("this PID already has an account", 409);
    }
  } catch (err) {
    // No half-made account. The person may try again with the same sid.
    if (created) {
      await deleteKeycloakUser(credentials.username).catch(() => undefined);
    }
    await deleteSandboxRecord(credentials.username).catch(() => undefined);
    const status = err instanceof AccountError ? err.status : 502;
    if (status !== 409) updateTransaction(sid, { canRegister: true });
    console.error(
      "POST /api/auth/eudi/register:",
      err instanceof Error ? err.message : "unknown",
    );
    return NextResponse.json(
      {
        error: "Account not created",
        reason:
          err instanceof AccountError
            ? err.message
            : "the hub could not create the account",
      },
      { status },
    );
  } finally {
    registering.delete(fingerprint);
  }

  // The sid now signs in to the new account, once, and forgets the hash.
  updateTransaction(sid, {
    status: "completed",
    error: undefined,
    fingerprint: undefined,
    verifiedPatient: sandboxPatient(credentials.username),
  });
  return NextResponse.json(
    {
      status: "completed",
      username: credentials.username,
      password: credentials.password,
    },
    { status: 201, headers: { "Cache-Control": "no-store" } },
  );
}

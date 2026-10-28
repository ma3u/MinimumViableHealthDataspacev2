import { NextResponse } from "next/server";
import {
  getPresentationResult,
  walletFetchedRequest,
} from "@/lib/eudi-verifier";
import {
  getTransaction,
  updateTransaction,
  type EudiTransaction,
} from "@/lib/eudi-store";
import { mapPidToPatient, type VerifiedPid } from "@/lib/eudi-patient-map";
import { pidFingerprint } from "@/lib/pid-fingerprint";
import {
  findUsernameByFingerprint,
  pidAccountsAvailable,
  sandboxPatient,
  setFingerprint,
} from "@/lib/pid-link";
import { isSandboxUsername } from "@/lib/sandbox-account";

export const dynamic = "force-dynamic";

/** What the page tells the person when a presentation does not sign them in. */
const NO_RECORD = "No record on this hub belongs to the PID in this wallet.";
const DECLINED = "The wallet did not share a PID this hub can read.";
/** ADR-067: one PID, one account. Two people may share name and birth date. */
const TAKEN =
  "This PID is already connected to another account on this hub. Disconnect it there first, or, if that account is not yours, two people may share a name and birth date: the hub cannot tell you apart.";
const DEMO_PID =
  "This PID opens one of the hub's demo patients, so it cannot be connected to an account.";
const NOT_LINKABLE =
  "This PID cannot be connected: the wallet did not share a birth date, or this hub does not link wallets.";
const LINK_FAILED = "The hub could not connect the wallet. Try again.";

/**
 * Poll the status of an in-flight EUDI Wallet presentation by `sid`.
 *
 * Returns only a coarse status, never the PID claims, and, while pending,
 * whether the wallet has fetched the request yet.
 *
 * Sign-in (ADR-065, ADR-067): a PID in the name of a demo persona opens that
 * persona's record; any other PID is looked up by its secure hash, and the
 * account that holds it is pinned to the `sid` at assurance high. A PID on no
 * account is refused with `canRegister: true` when it could create one; the
 * hash then waits on the transaction for `POST /api/auth/eudi/register`.
 *
 * Link (ADR-067): the hash is written to the signed-in sandbox account,
 * unless another account holds it (409). The answer is `{ status: "linked" }`.
 *
 * The name and birth date stop here: they are read to compute the hash and
 * are neither stored, logged nor answered.
 */
export async function GET(req: Request): Promise<NextResponse> {
  const { searchParams } = new URL(req.url);
  const sid = searchParams.get("sid") ?? "";
  const tx = getTransaction(sid);
  if (!tx) {
    return NextResponse.json(
      { status: "error", error: "unknown or expired session" },
      { status: 404 },
    );
  }
  if (tx.status === "completed") {
    return NextResponse.json({
      status: tx.purpose === "link" ? "linked" : "completed",
    });
  }
  if (tx.status === "error") return refusedAgain(tx);
  try {
    const result = await getPresentationResult(tx.transactionId);
    if (result.status === "pending") {
      // Whether the wallet has opened the request, so the page can tell a
      // wallet that has not scanned yet from one that scanned and went quiet.
      if (!tx.walletOpenedAt && (await walletOpened(tx.transactionId))) {
        updateTransaction(sid, { walletOpenedAt: Date.now() });
        return NextResponse.json({ status: "pending", walletOpened: true });
      }
      return NextResponse.json({
        status: "pending",
        walletOpened: Boolean(tx.walletOpenedAt),
      });
    }
    if (result.status === "failed") {
      console.warn("EUDI presentation not usable:", result.reason);
      return refuse(sid, DECLINED);
    }
    return tx.purpose === "link"
      ? await link(tx, result.pid)
      : await signIn(tx, result.pid);
  } catch (err) {
    // Transient verifier or Keycloak hiccup: keep the client polling. Only
    // the error's message is logged, never a claim of the PID.
    console.error(
      "GET /api/auth/eudi/status error:",
      err instanceof Error ? err.message : "unknown",
    );
    return NextResponse.json({ status: "pending" });
  }
}

async function signIn(
  tx: EudiTransaction,
  pid: VerifiedPid,
): Promise<NextResponse> {
  // The demo personas keep their name match (ADR-067 decision 6).
  const persona = mapPidToPatient(pid);
  if (persona) {
    updateTransaction(tx.sid, {
      status: "completed",
      verifiedPatient: persona,
    });
    return NextResponse.json({ status: "completed" });
  }
  const fingerprint = pidAccountsAvailable() ? pidFingerprint(pid) : null;
  if (!fingerprint) return refuse(tx.sid, NO_RECORD);
  const username = await findUsernameByFingerprint(fingerprint);
  if (username && isSandboxUsername(username)) {
    updateTransaction(tx.sid, {
      status: "completed",
      verifiedPatient: sandboxPatient(username),
    });
    return NextResponse.json({ status: "completed" });
  }
  if (username) return refuse(tx.sid, NO_RECORD);
  // On no account: this PID may create one (ADR-067 decision 5).
  updateTransaction(tx.sid, { fingerprint, canRegister: true });
  return refuse(tx.sid, NO_RECORD);
}

async function link(
  tx: EudiTransaction,
  pid: VerifiedPid,
): Promise<NextResponse> {
  if (!tx.linkUsername) return refuse(tx.sid, NOT_LINKABLE);
  // Sign-in matches a demo persona by name first, so a link would never be used.
  if (mapPidToPatient(pid)) return refuse(tx.sid, DEMO_PID);
  const fingerprint = pidAccountsAvailable() ? pidFingerprint(pid) : null;
  if (!fingerprint) return refuse(tx.sid, NOT_LINKABLE);
  const holder = await findUsernameByFingerprint(fingerprint);
  if (holder && holder !== tx.linkUsername) {
    return refuse(tx.sid, TAKEN, 409);
  }
  if (!holder && !(await setFingerprint(tx.linkUsername, fingerprint))) {
    return refuse(tx.sid, LINK_FAILED);
  }
  updateTransaction(tx.sid, { status: "completed" });
  return NextResponse.json({ status: "linked" });
}

async function walletOpened(transactionId: string): Promise<boolean> {
  try {
    return await walletFetchedRequest(transactionId);
  } catch {
    return false;
  }
}

/** Marks the transaction refused, so it never signs in, and answers why. */
function refuse(sid: string, error: string, status = 403): NextResponse {
  const tx = updateTransaction(sid, { status: "error", error });
  return refused(tx ?? { error, canRegister: false }, status);
}

/** A transaction refused before: the same answer, without asking again. */
function refusedAgain(tx: EudiTransaction): NextResponse {
  return refused(tx, tx.error === TAKEN ? 409 : 403);
}

function refused(
  tx: Pick<EudiTransaction, "error" | "canRegister">,
  status: number,
): NextResponse {
  return NextResponse.json(
    {
      status: "refused",
      error: tx.error ?? DECLINED,
      ...(tx.canRegister ? { canRegister: true } : {}),
    },
    { status },
  );
}

import { NextResponse } from "next/server";
import { getPresentationResult } from "@/lib/eudi-verifier";
import { getTransaction, updateTransaction } from "@/lib/eudi-store";
import { mapPidToPatient } from "@/lib/eudi-patient-map";

export const dynamic = "force-dynamic";

/** What the page tells the person when a presentation does not sign them in. */
const NO_RECORD = "No record on this hub belongs to the PID in this wallet.";
const DECLINED = "The wallet did not share a PID this hub can read.";

/**
 * Poll the status of an in-flight EUDI Wallet login by `sid`.
 *
 * Returns only a coarse status — never the PID claims. On completion it pins
 * the patient the PID belongs to (#708) to the `sid`; the NextAuth
 * "eudi-wallet" Credentials provider then mints the session from that pinned
 * result. A PID that belongs to nobody, or a wallet that declined, is
 * refused with 403 and the sid can no longer sign in.
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
    return NextResponse.json({ status: "completed" });
  }
  if (tx.status === "error") return refused(tx.error ?? DECLINED);
  try {
    const result = await getPresentationResult(tx.transactionId);
    if (result.status === "pending") {
      return NextResponse.json({ status: "pending" });
    }
    if (result.status === "failed") {
      console.warn("EUDI presentation not usable:", result.reason);
      updateTransaction(sid, { status: "error", error: DECLINED });
      return refused(DECLINED);
    }
    const patient = mapPidToPatient(result.pid);
    if (!patient) {
      updateTransaction(sid, { status: "error", error: NO_RECORD });
      return refused(NO_RECORD);
    }
    updateTransaction(sid, { status: "completed", verifiedPatient: patient });
    return NextResponse.json({ status: "completed" });
  } catch (err) {
    // Transient verifier hiccup — keep the client polling rather than failing.
    console.error("GET /api/auth/eudi/status error:", err);
    return NextResponse.json({ status: "pending" });
  }
}

function refused(error: string): NextResponse {
  return NextResponse.json({ status: "refused", error }, { status: 403 });
}

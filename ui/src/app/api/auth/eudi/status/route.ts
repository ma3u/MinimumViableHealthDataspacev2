import { NextResponse } from "next/server";
import { getPresentationResult } from "@/lib/eudi-verifier";
import { getTransaction, updateTransaction } from "@/lib/eudi-store";
import { mapPidToPatient } from "@/lib/eudi-patient-map";

export const dynamic = "force-dynamic";

/**
 * Poll the status of an in-flight EUDI Wallet login by `sid`.
 *
 * Returns only a coarse status — never the PID claims. On completion it pins
 * the resolved (demo) patient to the `sid`; the NextAuth "eudi-wallet"
 * Credentials provider then mints the session from that pinned result.
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
  try {
    const result = await getPresentationResult(tx.transactionId);
    if (result.status === "pending") {
      return NextResponse.json({ status: "pending" });
    }
    const patient = mapPidToPatient(result.pid);
    updateTransaction(sid, { status: "completed", verifiedPatient: patient });
    return NextResponse.json({ status: "completed" });
  } catch (err) {
    // Transient verifier hiccup — keep the client polling rather than failing.
    console.error("GET /api/auth/eudi/status error:", err);
    return NextResponse.json({ status: "pending" });
  }
}

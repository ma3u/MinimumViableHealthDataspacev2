import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { startPresentation } from "@/lib/eudi-verifier";
import { newSid, newNonce, putTransaction } from "@/lib/eudi-store";

export const dynamic = "force-dynamic";

/**
 * Start an EUDI Wallet (OpenID4VP cross-device) login.
 *
 * Server-side only: initialises a presentation at the verifier, stores the
 * transaction under an opaque `sid`, and returns the wallet deep link plus a
 * pre-rendered QR data-URI. The verifier-side transaction id and nonce never
 * reach the browser.
 */
export async function POST(): Promise<NextResponse> {
  try {
    const nonce = newNonce();
    const started = await startPresentation(nonce);
    const sid = newSid();
    putTransaction({ sid, transactionId: started.transactionId, nonce });
    const qrDataUri = await QRCode.toDataURL(started.walletLink, {
      margin: 1,
      width: 320,
      errorCorrectionLevel: "M",
    });
    return NextResponse.json({
      sid,
      walletLink: started.walletLink,
      qrDataUri,
    });
  } catch (err) {
    console.error("POST /api/auth/eudi/start error:", err);
    return NextResponse.json(
      { error: "Could not start EUDI Wallet sign-in" },
      { status: 502 },
    );
  }
}

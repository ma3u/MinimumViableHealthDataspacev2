import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { startPresentation } from "@/lib/eudi-verifier";
import { newSid, newNonce, putTransaction } from "@/lib/eudi-store";
import { demoPatient } from "@/lib/eudi-patient-map";

export const dynamic = "force-dynamic";

/**
 * Start an EUDI Wallet (OpenID4VP cross-device) login.
 *
 * Server-side only: initialises a presentation at the verifier, stores the
 * transaction under an opaque `sid`, and returns the wallet deep link plus a
 * pre-rendered QR data-URI. The verifier-side transaction id and nonce never
 * reach the browser.
 *
 * With a JSON body `{ "demo": true }` it instead completes a transaction for
 * the demo patient without any wallet, so the simulated phone on the sign-in
 * page can sign the visitor in. Only when the deployment says so
 * (`EUDI_DEMO_WALLET=true`, set on compose and on the Azure demo); anywhere
 * else the simulated approval gets a 404 and stays a picture.
 */
export async function POST(req: Request): Promise<NextResponse> {
  if ((await readBody(req)).demo === true) return startDemo();
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

/** The body is optional: a plain POST (no body, or not JSON) is a normal start. */
async function readBody(req: Request): Promise<{ demo?: unknown }> {
  try {
    return (await req.json()) as { demo?: unknown };
  } catch {
    return {};
  }
}

function startDemo(): NextResponse {
  if (process.env.EUDI_DEMO_WALLET !== "true") {
    return NextResponse.json(
      { error: "The simulated wallet cannot sign in on this deployment" },
      { status: 404 },
    );
  }
  const sid = newSid();
  putTransaction({
    sid,
    transactionId: `demo:${sid}`,
    nonce: newNonce(),
    status: "completed",
    verifiedPatient: demoPatient(),
  });
  return NextResponse.json({ sid, demo: true });
}

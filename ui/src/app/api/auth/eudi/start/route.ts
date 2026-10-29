import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { startPresentation } from "@/lib/eudi-verifier";
import {
  newSid,
  newNonce,
  putTransaction,
  type EudiPurpose,
} from "@/lib/eudi-store";
import { demoPatient } from "@/lib/eudi-patient-map";
import { requireAuth, isAuthError } from "@/lib/auth-guard";
import { sessionUsername } from "@/lib/patient/session-username";
import { isSandboxUsername } from "@/lib/sandbox-account";
import { pidAccountsAvailable } from "@/lib/pid-link";

export const dynamic = "force-dynamic";

/**
 * Start an EUDI Wallet (OpenID4VP cross-device) presentation.
 *
 * Server-side only: initialises a presentation at the verifier, stores the
 * transaction under an opaque `sid`, and returns the wallet deep link plus a
 * pre-rendered QR data-URI. The verifier-side transaction id and nonce never
 * reach the browser.
 *
 * A plain POST starts a sign-in and needs no session: it is how a person
 * signs in.
 *
 * With a JSON body `{ "purpose": "link" }` it starts a link instead (ADR-067):
 * the PID presented will be connected to the signed-in account. That needs a
 * PATIENT session on a sandbox account (`kb-`, ADR-054), the only accounts a
 * PID may be linked to; anything else is refused before the verifier is asked.
 *
 * With a JSON body `{ "demo": true }` it instead completes a transaction for
 * the demo patient without any wallet, so the simulated phone on the sign-in
 * page can sign the visitor in. Only when the deployment says so
 * (`EUDI_DEMO_WALLET=true`, set on compose and on the Azure demo); anywhere
 * else the simulated approval gets a 404 and stays a picture.
 */
export async function POST(req: Request): Promise<NextResponse> {
  const body = await readBody(req);
  if (body.demo === true) return startDemo();
  if (body.purpose === "link") {
    const auth = await requireAuth(["PATIENT"]);
    if (isAuthError(auth)) return auth;
    const username = await sessionUsername();
    if (!username || !isSandboxUsername(username)) {
      return NextResponse.json(
        {
          error:
            "Only an account the Klarbefund app or a wallet created can be connected to a wallet",
        },
        { status: 403 },
      );
    }
    if (!pidAccountsAvailable()) {
      return NextResponse.json(
        { error: "This hub does not connect wallets to accounts" },
        { status: 503 },
      );
    }
    return start("link", username);
  }
  return start("signin");
}

async function start(
  purpose: EudiPurpose,
  linkUsername?: string,
): Promise<NextResponse> {
  try {
    const nonce = newNonce();
    const started = await startPresentation(nonce);
    const sid = newSid();
    putTransaction({
      sid,
      transactionId: started.transactionId,
      nonce,
      purpose,
      ...(linkUsername ? { linkUsername } : {}),
    });
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
async function readBody(
  req: Request,
): Promise<{ demo?: unknown; purpose?: unknown }> {
  try {
    return (await req.json()) as { demo?: unknown; purpose?: unknown };
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

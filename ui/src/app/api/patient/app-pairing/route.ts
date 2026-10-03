import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { requireAuth, isAuthError } from "@/lib/auth-guard";
import {
  appLink,
  ehdsOrigin,
  PairingError,
  startPairing,
} from "@/lib/app-pairing";
import { createRateLimiter } from "@/lib/rate-limit";
import { sessionUsername } from "@/lib/patient/session-username";

export const dynamic = "force-dynamic";

/** A patient starting pairings in a loop is a script, not a person. */
const limiter = createRateLimiter({
  windowMs: 60_000,
  perKey: 6,
  inTotal: 120,
});

/**
 * POST /api/patient/app-pairing
 *
 * Starts connecting the Klarbefund app (#473, ADR-049): asks Keycloak for a
 * device authorization for the client `klarbefund-app` and answers with the
 * QR code the phone scans, the same link for a phone that is already holding
 * this page, and Keycloak's page where the patient approves. The code lives
 * two minutes. Only a PATIENT pairs, and only for their own login.
 */
export async function POST(request: Request) {
  const auth = await requireAuth(["PATIENT"]);
  if (isAuthError(auth)) return auth;
  const username = await sessionUsername();
  if (!username) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!limiter.allow(username)) {
    return NextResponse.json(
      { error: "Too many pairings, try again in a minute" },
      { status: 429 },
    );
  }
  try {
    const pairing = await startPairing(username);
    const link = appLink(pairing, ehdsOrigin(request));
    const qrDataUri = await QRCode.toDataURL(link, {
      margin: 1,
      width: 320,
      errorCorrectionLevel: "M",
    });
    return NextResponse.json({
      pairingId: pairing.id,
      appLink: link,
      qrDataUri,
      userCode: pairing.userCode,
      verificationUri: pairing.verificationUri,
      expiresAt: new Date(pairing.expiresAt).toISOString(),
    });
  } catch (err) {
    const message =
      err instanceof PairingError ? err.message : "Keycloak is unreachable";
    console.error("POST /api/patient/app-pairing:", err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

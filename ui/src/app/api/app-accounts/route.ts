import { NextResponse } from "next/server";
import {
  AttestError,
  checkChallenge,
  clientData,
  verifyAttestation,
} from "@/lib/app-attest";
import {
  ACCOUNT_CLIENT_ID,
  AccountError,
  createKeycloakUser,
  createSandboxRecord,
  deleteSandboxRecord,
  newCredentials,
  sandboxPatientId,
} from "@/lib/app-accounts";
import {
  cleanDeviceName,
  DEVICE_ID,
  registerConnection,
} from "@/lib/app-connections";
import { ehdsOrigin } from "@/lib/app-pairing";
import { createRateLimiter } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/** Behind the attestation, a second line: per address and in all, per hour. */
const limiter = createRateLimiter({
  windowMs: 60 * 60_000,
  perKey: 5,
  inTotal: 100,
});

const keycloakPublicUrl =
  process.env.KEYCLOAK_PUBLIC_URL ?? "http://localhost:8080/realms/edcv";

/**
 * POST /api/app-accounts
 *
 * Creates a sandbox account for the Klarbefund app (ADR-054): a Keycloak
 * login with a generated password, an empty record of its own, and this phone
 * already connected to it. Answers without a session, and only to a request
 * Apple attests comes from the genuine app on a real device.
 *
 * Body: `{ challenge, keyId, attestation, deviceId, deviceName }`, the
 * attestation over SHA-256 of `challenge|deviceId`. The password is in the
 * answer once and nowhere else on the hub.
 */
export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON" }, { status: 400 });
  }
  const text = (key: string) =>
    typeof body[key] === "string" ? (body[key] as string) : "";
  const challenge = text("challenge");
  const keyId = text("keyId");
  const attestation = text("attestation");
  const deviceId = text("deviceId");
  if (!challenge || !keyId || !attestation || !DEVICE_ID.test(deviceId)) {
    return NextResponse.json(
      {
        error: "Bad request",
        reason:
          "challenge, keyId, attestation and a UUID v4 deviceId are required",
      },
      { status: 400 },
    );
  }
  if (!checkChallenge(challenge)) {
    return NextResponse.json(
      {
        error: "Unauthorized",
        reason: "the challenge is not the hub's, or it expired",
      },
      { status: 401 },
    );
  }
  let attested;
  try {
    attested = verifyAttestation({
      keyId,
      attestation,
      clientData: clientData(challenge, deviceId),
    });
  } catch (err) {
    const reason =
      err instanceof AttestError ? err.message : "not an attestation";
    return NextResponse.json(
      { error: "Unauthorized", reason },
      { status: 401 },
    );
  }

  const address = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (!limiter.allow(address || "unknown")) {
    return NextResponse.json(
      { error: "Too many accounts, try again later" },
      { status: 429 },
    );
  }

  const credentials = newCredentials();
  try {
    const fresh = await createSandboxRecord({
      username: credentials.username,
      keyId,
      environment: attested.environment,
    });
    if (!fresh) {
      return NextResponse.json(
        { error: "Conflict", reason: "this key already created an account" },
        { status: 409 },
      );
    }
    try {
      await createKeycloakUser(credentials);
      await registerConnection({
        deviceId,
        deviceName: cleanDeviceName(body.deviceName),
        username: credentials.username,
      });
    } catch (err) {
      // No half-made account: the record goes, the key stays spent.
      await deleteSandboxRecord(credentials.username).catch(() => undefined);
      throw err;
    }
  } catch (err) {
    console.error("POST /api/app-accounts:", err);
    const status = err instanceof AccountError ? err.status : 502;
    const reason =
      err instanceof AccountError
        ? err.message
        : "the hub could not create the account";
    return NextResponse.json(
      { error: "Account not created", reason },
      { status },
    );
  }

  return NextResponse.json(
    {
      username: credentials.username,
      password: credentials.password,
      patientId: sandboxPatientId(credentials.username),
      ehds: ehdsOrigin(request),
      issuer: keycloakPublicUrl,
      client: ACCOUNT_CLIENT_ID,
    },
    { status: 201, headers: { "Cache-Control": "no-store" } },
  );
}

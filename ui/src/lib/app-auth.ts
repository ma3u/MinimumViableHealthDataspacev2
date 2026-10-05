import { NextResponse } from "next/server";
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import { findConnection } from "@/lib/app-connections";

/**
 * The Klarbefund app's credential, for the routes it calls (#473, ADR-049).
 *
 * Every API route needs a session (ADR-044), and a session is a cookie only a
 * browser holds. The app connects by a device grant the patient screen starts,
 * so it holds a Keycloak access token for the public client `klarbefund-app`
 * instead. A route that serves the app gates on requireAppToken(), which the
 * route inventory counts as a gate beside requireAuth().
 *
 * What is checked, and why each one:
 *
 * - **The signature**, against the realm's own keys, fetched from the
 *   container-internal Keycloak URL (the public one does not resolve inside
 *   the compose network).
 * - **The issuer**, which is the public URL: the phone fetched the token from
 *   there, and Keycloak stamps the host it was asked on.
 * - **`azp = klarbefund-app`**, or `klarbefund-account` for an account the
 *   app created (ADR-054). A token from the UI's own client, or any other, is
 *   refused, so a leaked browser token does not open the app routes.
 * - **The `PATIENT` role** and a `preferred_username`. This realm has no
 *   `basic` client scope, so Keycloak puts no `sub` in the token (measured on
 *   26.6.4, #473); the login name is what maps a user to their record, as
 *   ownPatientIdForSession() already does for a session.
 * - **A connected device**, for every route but registration itself. The app
 *   sends its device id in `X-Klarbefund-Device`, and the connection must
 *   exist and belong to the token's user. Disconnect on the patient screen
 *   deletes it, which refuses the phone at once without the hub needing
 *   Keycloak admin rights.
 */

export const APP_CLIENT_ID = "klarbefund-app";
/**
 * The clients whose tokens the app routes accept: the QR code's device grant,
 * and the password grant of an account the app created itself (ADR-054).
 */
const APP_CLIENT_IDS: readonly string[] = [APP_CLIENT_ID, "klarbefund-account"];
const APP_DEVICE_HEADER = "x-klarbefund-device";

const keycloakServerUrl =
  process.env.KEYCLOAK_ISSUER ?? "http://keycloak:8080/realms/edcv";
const keycloakPublicUrl =
  process.env.KEYCLOAK_PUBLIC_URL ?? "http://localhost:8080/realms/edcv";

/** The issuers a token may carry: the public URL first, then the internal. */
function acceptedIssuers(): string[] {
  return [...new Set([keycloakPublicUrl, keycloakServerUrl])];
}

let remoteKeys: JWTVerifyGetKey | null = null;
function realmKeys(): JWTVerifyGetKey {
  remoteKeys ??= createRemoteJWKSet(
    new URL(`${keycloakServerUrl}/protocol/openid-connect/certs`),
  );
  return remoteKeys;
}

export interface AppIdentity {
  /** The Keycloak login name, e.g. `patient1`. */
  username: string;
  roles: string[];
  /** The connected device, when the route required one. */
  deviceId?: string;
  /** The client the token was issued to: the QR code's, or a password sign-in's. */
  client?: string;
}

/**
 * Verifies an access token from the app, or returns null. Never throws: a
 * malformed, expired or foreign token is simply not an identity.
 */
export async function verifyAppToken(
  token: string,
  keys: JWTVerifyGetKey = realmKeys(),
): Promise<AppIdentity | null> {
  try {
    const { payload } = await jwtVerify(token, keys, {
      issuer: acceptedIssuers(),
      algorithms: ["RS256", "ES256", "PS256"],
    });
    if (
      typeof payload.azp !== "string" ||
      !APP_CLIENT_IDS.includes(payload.azp)
    ) {
      return null;
    }
    const username = payload.preferred_username;
    if (typeof username !== "string" || !username) return null;
    const roles =
      (payload.realm_access as { roles?: unknown } | undefined)?.roles ?? [];
    if (!Array.isArray(roles) || !roles.includes("PATIENT")) return null;
    return {
      username,
      roles: roles.filter((r) => typeof r === "string"),
      client: payload.azp,
    };
  } catch {
    return null;
  }
}

/**
 * The app's bearer token, and unless `device: false`, a device the patient
 * connected. 401 with `{ error }` for anything else, never a fallback to a
 * session: a wrong token must not be mistaken for a missing one.
 */
export async function requireAppToken(
  request: Request,
  opts: { device: boolean } = { device: true },
  keys?: JWTVerifyGetKey,
): Promise<{ app: AppIdentity } | NextResponse> {
  const header = request.headers.get("authorization") ?? "";
  if (!header.startsWith("Bearer ")) {
    return NextResponse.json(
      {
        error: "Unauthorized",
        reason: "the Klarbefund app's token is missing",
      },
      { status: 401 },
    );
  }
  const identity = await verifyAppToken(header.slice("Bearer ".length), keys);
  if (!identity) {
    return NextResponse.json(
      { error: "Unauthorized", reason: "the token is not a Klarbefund token" },
      { status: 401 },
    );
  }
  if (!opts.device) return { app: identity };

  const deviceId = request.headers.get(APP_DEVICE_HEADER) ?? "";
  const connection = deviceId
    ? await findConnection(deviceId, identity.username)
    : null;
  if (!connection) {
    return NextResponse.json(
      {
        error: "Unauthorized",
        reason: "this device is not connected, or was disconnected",
      },
      { status: 401 },
    );
  }
  return { app: { ...identity, deviceId } };
}

/** Type guard: true when requireAppToken returned an error response. */
export function isAppAuthError(
  result: { app: AppIdentity } | NextResponse,
): result is NextResponse {
  return result instanceof NextResponse;
}

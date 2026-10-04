import { randomUUID } from "crypto";
import { APP_CLIENT_ID } from "@/lib/app-auth";
import { runQuery } from "@/lib/neo4j";

/**
 * Pairing the Klarbefund app from the patient screen (#473, ADR-049).
 *
 * The website asks Keycloak for a device authorization (RFC 8628) on behalf
 * of the public client `klarbefund-app`, and turns the answer into a
 * `klarbefund://connect` link for the QR code. The phone polls Keycloak for
 * the token itself; the website only learns that it worked when the phone
 * registers, naming the pairing id from the link.
 *
 * Kept in Neo4j, one `(:AppPairing)` per QR code, because three different
 * requests touch a pairing and on Azure each may reach a different replica of
 * `mvhd-ui` (up to three). In memory, the phone's registration and the patient
 * screen's polling found the pairing only when they happened to reach the
 * replica that started it: two scans in three answered "scan a new QR code"
 * (2026-10-04). Only what those requests need is stored: the id, the login,
 * the expiry and the phone. The device code never leaves the start request.
 */

export interface Pairing {
  id: string;
  username: string;
  userCode: string;
  deviceCode: string;
  /** Keycloak's approval page, rewritten to the public URL. */
  verificationUri: string;
  expiresAt: number;
  interval: number;
}

/** What a pairing is after the start request: no codes, and the phone once it registered. */
export interface StoredPairing {
  id: string;
  username: string;
  expiresAt: number;
  deviceId?: string;
  deviceName?: string;
}

/** After the code expires, how long a phone may still register with it. */
const GRACE_MS = 5 * 60_000;

const keycloakServerUrl =
  process.env.KEYCLOAK_ISSUER ?? "http://keycloak:8080/realms/edcv";
const keycloakPublicUrl =
  process.env.KEYCLOAK_PUBLIC_URL ?? "http://localhost:8080/realms/edcv";

/**
 * Keycloak answers with URLs on the host it was asked on, which inside the
 * compose network is `keycloak:8080`, a name no browser resolves. The approval
 * page is the same page on the public host.
 */
export function toPublicUrl(url: string): string {
  return url.startsWith(keycloakServerUrl)
    ? keycloakPublicUrl + url.slice(keycloakServerUrl.length)
    : url;
}

interface DeviceAuthorization {
  device_code: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete?: string;
  expires_in: number;
  interval?: number;
}

export class PairingError extends Error {}

/** Starts a pairing for this login. Throws PairingError when Keycloak refuses. */
export async function startPairing(
  username: string,
  fetcher: typeof fetch = fetch,
  now: number = Date.now(),
): Promise<Pairing> {
  const res = await fetcher(
    `${keycloakServerUrl}/protocol/openid-connect/auth/device`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: APP_CLIENT_ID,
        scope: "openid profile",
      }),
      cache: "no-store",
    },
  );
  if (!res.ok) {
    throw new PairingError(
      `Keycloak refused the device authorization (${res.status})`,
    );
  }
  const d = (await res.json()) as DeviceAuthorization;
  if (!d.device_code || !d.user_code) {
    throw new PairingError("Keycloak answered without a device code");
  }
  const pairing: Pairing = {
    id: randomUUID(),
    username,
    userCode: d.user_code,
    deviceCode: d.device_code,
    verificationUri: toPublicUrl(
      d.verification_uri_complete ??
        `${d.verification_uri}?user_code=${encodeURIComponent(d.user_code)}`,
    ),
    expiresAt: now + d.expires_in * 1000,
    interval: d.interval ?? 5,
  };
  // Sweeps pairings past their grace period on the way, so the label stays
  // as small as the number of QR codes shown in the last few minutes.
  await runQuery(
    `MERGE (p:AppPairing {id: $id})
       ON CREATE SET p.username = $username, p.expiresAt = $expiresAt
     WITH p
     OPTIONAL MATCH (old:AppPairing) WHERE old.expiresAt < $sweepBefore
     DETACH DELETE old`,
    {
      id: pairing.id,
      username,
      expiresAt: pairing.expiresAt,
      sweepBefore: now - GRACE_MS,
    },
  );
  return pairing;
}

/** The pairing, when it exists, this login started it, and its grace period has not run out. */
export async function getPairing(
  id: string,
  username: string,
  now: number = Date.now(),
): Promise<StoredPairing | null> {
  const rows = await runQuery<{
    id: string;
    username: string;
    expiresAt: number;
    deviceId: string | null;
    deviceName: string | null;
  }>(
    `MATCH (p:AppPairing {id: $id, username: $username})
     RETURN p.id AS id, p.username AS username, p.expiresAt AS expiresAt,
            p.deviceId AS deviceId, p.deviceName AS deviceName`,
    { id, username },
  );
  const row = rows[0];
  if (!row || now > row.expiresAt + GRACE_MS) return null;
  return {
    id: row.id,
    username: row.username,
    expiresAt: row.expiresAt,
    ...(row.deviceId ? { deviceId: row.deviceId } : {}),
    ...(row.deviceName ? { deviceName: row.deviceName } : {}),
  };
}

/** Records that the phone registered under this pairing. */
export async function completePairing(
  id: string,
  username: string,
  deviceId: string,
  deviceName: string,
): Promise<void> {
  await runQuery(
    `MATCH (p:AppPairing {id: $id, username: $username})
     SET p.deviceId = $deviceId, p.deviceName = $deviceName`,
    { id, username, deviceId, deviceName },
  );
}

export type PairingStatus = "pending" | "connected" | "expired";

export function pairingStatus(
  p: Pick<StoredPairing, "expiresAt" | "deviceId">,
  now: number = Date.now(),
): PairingStatus {
  if (p.deviceId) return "connected";
  return now > p.expiresAt ? "expired" : "pending";
}

/**
 * The link the QR code carries. Everything the phone needs to finish the
 * grant on its own: which hub, which issuer, which client, the device code,
 * and the pairing id to name when it registers.
 */
export function appLink(p: Pairing, ehdsOrigin: string): string {
  const q = new URLSearchParams({
    ehds: ehdsOrigin,
    issuer: keycloakPublicUrl,
    client: APP_CLIENT_ID,
    pairing: p.id,
    device_code: p.deviceCode,
    user_code: p.userCode,
    interval: String(p.interval),
    expires: String(Math.floor(p.expiresAt / 1000)),
  });
  return `klarbefund://connect?${q.toString()}`;
}

/**
 * The hub's public origin, for the link. NEXTAUTH_URL when set, because behind
 * the Container Apps ingress the request URL can name an internal host.
 */
export function ehdsOrigin(request: Request): string {
  const configured = process.env.NEXTAUTH_URL;
  if (configured) {
    try {
      return new URL(configured).origin;
    } catch {
      // fall through to the request's own origin
    }
  }
  return new URL(request.url).origin;
}

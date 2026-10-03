import { randomUUID } from "crypto";
import { APP_CLIENT_ID } from "@/lib/app-auth";

/**
 * Pairing the Klarbefund app from the patient screen (#473, ADR-049).
 *
 * The website asks Keycloak for a device authorization (RFC 8628) on behalf
 * of the public client `klarbefund-app`, and turns the answer into a
 * `klarbefund://connect` link for the QR code. The phone polls Keycloak for
 * the token itself; the website only learns that it worked when the phone
 * registers, naming the pairing id from the link.
 *
 * Kept in memory for its lifetime plus a grace period, like the EUDI sign-in
 * transaction (single replica, ADR-028). Losing it in a restart costs a patient
 * one new QR code, nothing more.
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
  /** Set when the phone registered. */
  deviceId?: string;
  deviceName?: string;
}

/** After the code expires, how long a phone may still register with it. */
const GRACE_MS = 5 * 60_000;

/**
 * On globalThis rather than in the module: Next.js may load this module once
 * per route bundle, and a pairing started by one route must be found by the
 * other two (measured in `next dev`, #473: the status route answered 404 for
 * a pairing the start route had just made).
 */
const holder = globalThis as unknown as {
  __klarbefundPairings?: Map<string, Pairing>;
};
holder.__klarbefundPairings ??= new Map<string, Pairing>();
const pairings = holder.__klarbefundPairings;

function sweep(now: number): void {
  for (const [id, p] of pairings) {
    if (now > p.expiresAt + GRACE_MS) pairings.delete(id);
  }
}

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
  sweep(now);
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
  pairings.set(pairing.id, pairing);
  return pairing;
}

/** The pairing, when it exists and this login started it. */
export function getPairing(
  id: string,
  username: string,
  now: number = Date.now(),
): Pairing | null {
  sweep(now);
  const p = pairings.get(id);
  return p && p.username === username ? p : null;
}

/** Records that the phone registered under this pairing. */
export function completePairing(
  id: string,
  deviceId: string,
  deviceName: string,
): void {
  const p = pairings.get(id);
  if (p) Object.assign(p, { deviceId, deviceName });
}

export type PairingStatus = "pending" | "connected" | "expired";

export function pairingStatus(
  p: Pairing,
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

/** Test seam: forget every pairing. */
export function resetPairings(): void {
  pairings.clear();
}

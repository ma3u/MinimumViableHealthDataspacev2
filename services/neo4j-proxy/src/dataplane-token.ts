import type { NextFunction, Request, Response } from "express";
import {
  createRemoteJWKSet,
  jwtVerify,
  type JWTPayload,
  type JWTVerifyGetKey,
} from "jose";
import { toGrant, type DataspaceGrant } from "./dataspace-token.js";

// ---------------------------------------------------------------------------
// Tokens the push data plane signs (ADR-095)
// ---------------------------------------------------------------------------
//
// mvhd-dataplane calls this proxy twice in a push: the consumer's side opens
// an SPE inbox (scope inbox:open), the provider's side reads the dataset it
// pushes (scope dataset:read). Both carry a short-lived RS256 JWT the data
// plane signs itself, checked here against its JWKS, never trusted on its
// claims. One module for both routes, so the two cannot drift apart.

export const DATAPLANE_ISSUER =
  process.env.DATAPLANE_ISSUER || "mvhd-dataplane";

/** The longest a data plane token may live (contract: exp at most 5 minutes after iat). */
const MAX_LIFETIME_S = 300;

export type DataplaneScope = "inbox:open" | "dataset:read";

/** The JWKS address, read per call so a test can unset it without reloading. */
export function dataplaneJwksUrl(): string | undefined {
  return process.env.DATAPLANE_JWKS_URL || undefined;
}

/** Thrown when no data plane is configured: the routes answer 503, not 401. */
export class DataplaneNotConfiguredError extends Error {
  constructor() {
    super("no data plane configured");
  }
}

/**
 * First in each data plane route's chain: with DATAPLANE_JWKS_URL unset the
 * caller learns that push is not configured here, before any token is read,
 * rather than that its token is bad.
 */
export function requireDataplane(
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!dataplaneJwksUrl()) {
    res.status(503).json({ error: new DataplaneNotConfiguredError().message });
    return;
  }
  next();
}

// The JWKS is fetched once per URL and kept: jose's remote set caches the
// keys and fetches again only for an unknown kid (as the siglet check does).
let cached: { url: string; keys: JWTVerifyGetKey } | undefined;
function dataplaneJwks(): JWTVerifyGetKey {
  const url = dataplaneJwksUrl();
  if (!url) throw new DataplaneNotConfiguredError();
  if (cached?.url !== url) {
    cached = { url, keys: createRemoteJWKSet(new URL(url)) };
  }
  return cached.keys;
}

/**
 * Verifies a data plane token for one scope and returns its claims. Throws
 * when the signature, algorithm, issuer, expiry, lifetime or scope is wrong,
 * or when it names no flow. `keys` is for tests; in service it is the data
 * plane's JWKS.
 */
export async function verifyDataplaneToken(
  token: string,
  scope: DataplaneScope,
  keys?: JWTVerifyGetKey,
): Promise<JWTPayload & { flowId: string }> {
  const { payload } = await jwtVerify(token, keys ?? dataplaneJwks(), {
    issuer: DATAPLANE_ISSUER,
    algorithms: ["RS256"],
    requiredClaims: ["exp", "iat"],
  });
  // requiredClaims made both present; jose checked they are numbers.
  if ((payload.exp as number) - (payload.iat as number) > MAX_LIFETIME_S) {
    throw new Error(`the token lives longer than ${MAX_LIFETIME_S} s`);
  }
  if (payload.scope !== scope) {
    throw new Error(`the token's scope is not ${scope}`);
  }
  const flowId = payload.flowId;
  if (typeof flowId !== "string" || flowId.length === 0) {
    throw new Error("the token names no flow");
  }
  return { ...payload, flowId };
}

/**
 * A dataset:read token as the pull's grant: the same datasetId, sub and aud
 * a siglet token carries, so /dataspace/push-source serves what
 * /dataspace/data serves (ADR-095 decision 8).
 */
export async function verifyDatasetReadToken(
  token: string,
  keys?: JWTVerifyGetKey,
): Promise<DataspaceGrant & { flowId: string }> {
  const payload = await verifyDataplaneToken(token, "dataset:read", keys);
  return { ...toGrant(payload), flowId: payload.flowId };
}

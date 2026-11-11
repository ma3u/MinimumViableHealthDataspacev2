import { type Request, type Response, type NextFunction } from "express";
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import { logger } from "./logger.js";

// ---------------------------------------------------------------------------
// A caller's realm role, for the proxy routes that act for a person (#1029).
//
// The proxy has no session. Most of its routes serve the hub, the data planes
// and the crawler, and the container network is their boundary. A few act for
// one role only, and those check the caller's Keycloak access token, as the
// UI's requireAuth() checks a session: the trust centre's pseudonym routes
// (EHDS Art. 66 and 73) answer an access body or a trust centre operator only.
//
// What is checked, as ui/src/lib/app-auth.ts does for the Klarbefund app:
//
// - the signature, against the realm's keys, fetched from the
//   container-internal Keycloak URL (KEYCLOAK_ISSUER);
// - the issuer, the public URL or the internal one: Keycloak stamps the host
//   it was asked on;
// - the expiry, by jwtVerify;
// - the realm role, in realm_access.roles.
//
// 401 with { error } for a missing or invalid token, 403 for a valid token
// without the role. Why a token was refused goes to the log, never to the
// caller.
// ---------------------------------------------------------------------------

const keycloakServerUrl =
  process.env.KEYCLOAK_ISSUER ?? "http://keycloak:8080/realms/edcv";
const keycloakPublicUrl =
  process.env.KEYCLOAK_PUBLIC_URL ?? "http://localhost:8080/realms/edcv";

/** The issuers a token may carry: the public URL first, then the internal. */
function acceptedIssuers(): string[] {
  return [...new Set([keycloakPublicUrl, keycloakServerUrl])];
}

let remoteKeys: JWTVerifyGetKey | undefined;
function realmKeys(): JWTVerifyGetKey {
  remoteKeys ??= createRemoteJWKSet(
    new URL(`${keycloakServerUrl}/protocol/openid-connect/certs`),
  );
  return remoteKeys;
}

/** The roles of the trust centre's pseudonym routes (Art. 66, Art. 73). */
export const TRUST_CENTER_ROLES: readonly string[] = [
  "HDAB_AUTHORITY",
  "TRUST_CENTER_OPERATOR",
];

export interface RealmCaller {
  /** The Keycloak login name, e.g. `regulator`. */
  username: string;
  roles: string[];
}

/**
 * Verifies a realm access token, or returns null with the reason logged.
 * `keys` is for tests; in service it is the realm's JWKS.
 */
export async function verifyRealmToken(
  token: string,
  keys: JWTVerifyGetKey = realmKeys(),
): Promise<RealmCaller | null> {
  try {
    const { payload } = await jwtVerify(token, keys, {
      issuer: acceptedIssuers(),
      algorithms: ["RS256", "ES256", "PS256"],
    });
    const roles =
      (payload.realm_access as { roles?: unknown } | undefined)?.roles ?? [];
    const username =
      typeof payload.preferred_username === "string"
        ? payload.preferred_username
        : typeof payload.azp === "string"
          ? `client:${payload.azp}`
          : "unknown";
    return {
      username,
      roles: Array.isArray(roles)
        ? roles.filter((r): r is string => typeof r === "string")
        : [],
    };
  } catch (err) {
    logger.warn({ reason: (err as Error).message }, "realm token refused");
    return null;
  }
}

/**
 * Express middleware: the caller's bearer token must carry one of `roles`.
 * The verified caller is left in `res.locals.caller` for the handler.
 */
export function requireRealmRole(
  roles: readonly string[],
  keys?: () => JWTVerifyGetKey,
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const header = req.header("authorization") ?? "";
    const match = /^Bearer\s+(\S+)$/i.exec(header);
    if (!match) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const caller = await verifyRealmToken(match[1], keys?.());
    if (!caller) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    if (!caller.roles.some((r) => roles.includes(r))) {
      // The roles, not the login name: a patient's login can identify them,
      // and patient identifiers never reach a log line (logger.ts).
      logger.warn(
        { roles: caller.roles, path: req.path },
        "realm role missing",
      );
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    res.locals.caller = caller;
    next();
  };
}

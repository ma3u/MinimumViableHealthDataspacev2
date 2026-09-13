/**
 * Verifies the ID token the iPhone presents.
 *
 * ## Why there is a backend at all
 *
 * Workload Identity Federation exchanges an IdP JWT for a token that acts as a
 * service account in the Anthropic **organization**, with `workspace:developer`
 * scope by default, which the documentation describes as the same access as a
 * workspace API key. Whatever holds the identity JWT can mint that.
 *
 * An iPhone app is a public client. It cannot keep a secret: its binary can be
 * read, its keychain can be reached on a jailbroken device, and its traffic can
 * be intercepted by whoever owns the phone. Putting a credential there that
 * mints org-wide API access would be strictly worse than an API key, because it
 * would also be harder to notice and revoke.
 *
 * So the phone authenticates the **user**, and this service is the only
 * workload with an identity. The phone never holds an Anthropic credential of
 * any kind.
 */
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";

export interface UserAuthConfig {
  /** Exact `iss` of the app's identity provider. */
  issuer: string;
  /** The app's client id, which must be the token's `aud`. */
  audience: string;
  /** Subjects allowed to use this deployment. Empty means any valid user. */
  allowedSubjects?: string[];
}

export function userAuthConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): UserAuthConfig {
  const issuer = env.USER_OIDC_ISSUER;
  const audience = env.USER_OIDC_AUDIENCE;
  if (!issuer || !audience) {
    throw new Error(
      "USER_OIDC_ISSUER and USER_OIDC_AUDIENCE must be set. For Sign in with " +
        "Apple these are https://appleid.apple.com and the app's bundle id.",
    );
  }
  const allowed = (env.USER_OIDC_ALLOWED_SUBJECTS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return { issuer, audience, allowedSubjects: allowed };
}

export class UnauthorizedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnauthorizedError";
  }
}

/**
 * A JWKS cache keyed by issuer.
 *
 * `createRemoteJWKSet` caches keys and re-fetches on an unknown `kid`, so one
 * instance per issuer is both correct across key rotation and far cheaper than
 * fetching per request.
 */
const keySets = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

/**
 * Resolves the JWKS URL by OIDC discovery.
 *
 * This used to guess the path from the issuer hostname: `/auth/keys` for Apple,
 * `/protocol/openid-connect/certs` for everything else. That is the Keycloak
 * path, so the "everything else" branch was wrong for Auth0, Okta, Entra
 * External ID and every other provider, and would have failed at the first
 * sign-in with a JWKS 404 rather than at configuration time.
 *
 * `jwks_uri` is a required field of the discovery document precisely so nobody
 * has to guess. One fetch per issuer, cached for the process lifetime, and
 * `createRemoteJWKSet` handles key rotation from there.
 */
async function keySetFor(
  issuer: string,
): Promise<ReturnType<typeof createRemoteJWKSet>> {
  const existing = keySets.get(issuer);
  if (existing) return existing;

  const discovery = new URL(
    issuer.replace(/\/$/, "") + "/.well-known/openid-configuration",
  );
  const response = await fetch(discovery);
  if (!response.ok) {
    throw new UnauthorizedError(
      `cannot reach OIDC discovery at ${discovery} (HTTP ${response.status}). ` +
        "USER_OIDC_ISSUER must be the exact issuer, with no trailing path.",
    );
  }
  const metadata = (await response.json()) as { jwks_uri?: string };
  if (!metadata.jwks_uri) {
    throw new UnauthorizedError(
      `discovery document at ${discovery} has no jwks_uri`,
    );
  }

  const jwks = createRemoteJWKSet(new URL(metadata.jwks_uri));
  keySets.set(issuer, jwks);
  return jwks;
}

/**
 * Verifies signature, issuer, audience and expiry, and returns the subject.
 *
 * Deliberately returns only the subject. The rest of the token is the user's
 * identity data and this service has no reason to hold it: nothing downstream
 * needs a name or an email, and not extracting them is cheaper than deciding
 * later how to protect them.
 */
export async function verifyUser(
  idToken: string,
  config: UserAuthConfig,
): Promise<{ subject: string }> {
  let payload: JWTPayload;
  try {
    ({ payload } = await jwtVerify(idToken, await keySetFor(config.issuer), {
      issuer: config.issuer,
      audience: config.audience,
      // A little clock tolerance, because a phone's clock is not ours to trust
      // and rejecting a valid user over two seconds of drift is a bad trade.
      clockTolerance: 30,
    }));
  } catch (error) {
    throw new UnauthorizedError(
      `id token rejected: ${
        error instanceof Error ? error.message : "invalid"
      }`,
    );
  }

  const subject = payload.sub;
  if (!subject) throw new UnauthorizedError("id token carries no subject");

  if (config.allowedSubjects && config.allowedSubjects.length > 0) {
    if (!config.allowedSubjects.includes(subject)) {
      // A personal deployment should serve exactly one person. An allowlist is
      // the difference between "my phone can use my Anthropic organization" and
      // "anyone with an Apple ID can bill my organization".
      throw new UnauthorizedError(
        "subject is not permitted on this deployment",
      );
    }
  }

  return { subject };
}

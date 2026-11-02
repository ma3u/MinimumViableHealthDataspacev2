/**
 * The identity an automated test signs in with.
 *
 * The post-deploy smoke (`__tests__/e2e/helpers/forged-session.ts`) and the
 * API collection (`scripts/forge-bruno-session.mjs`) forge NextAuth sessions
 * rather than sign in at Keycloak. Until 2026-11-01 those sessions carried no
 * mail or one no participant maps, so the access log named their reads
 * `did:web:unknown:Demo Participant`: a regulator could not tell a CI run
 * from a stranger. A forged session now carries `<persona>@ci.test`, and
 * every such login maps to `did:web:ci.test:<persona>`.
 *
 * `ci.test` is under `.test`, the top-level domain RFC 2606 reserves for
 * testing: no real organisation can hold it, so the DID cannot name one.
 */

/** The mail domain of a forged test session. */
const TEST_IDENTITY_DOMAIN = "ci.test";

const TEST_DID_PREFIX = `did:web:${TEST_IDENTITY_DOMAIN}:`;

/**
 * The DID of a test login, or null when the login is not a test's.
 * The local part is kept to the characters a did:web segment allows.
 */
export function testIdentityDid(username: string): string | null {
  const at = username.lastIndexOf("@");
  if (at <= 0) return null;
  if (username.slice(at + 1).toLowerCase() !== TEST_IDENTITY_DOMAIN) {
    return null;
  }
  const local = username
    .slice(0, at)
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "-");
  return `${TEST_DID_PREFIX}${local}`;
}

/** Whether a participant DID is an automated test's. */
export function isTestIdentity(did: string | null | undefined): boolean {
  return typeof did === "string" && did.startsWith(TEST_DID_PREFIX);
}

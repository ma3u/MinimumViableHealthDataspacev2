#!/usr/bin/env node
/**
 * Forge a NextAuth session cookie for use in Bruno / curl against the
 * live Azure deployment.
 *
 * Usage:
 *   cd ui && NEXTAUTH_SECRET=... node scripts/forge-bruno-session.mjs <persona>
 *
 * Persona is one of: edcadmin, clinicuser, lmcuser, researcher, regulator,
 * patient1.  Matches the seeded Keycloak users in jad/keycloak-realm.json.
 *
 * The script uses next-auth's own encode() so the cookie is byte-compatible
 * with what /api/auth/session returns after a real OIDC sign-in.  The
 * NEXTAUTH_SECRET must match the one set on the target deployment.
 *
 * NEXTAUTH_SECRET is required and must match the target deployment; COOKIE_NAME
 * defaults to the https cookie name, the compose stack uses next-auth.session-token.
 *
 * Output:
 *   prints two lines —
 *     COOKIE_NAME=__Secure-next-auth.session-token
 *     COOKIE_VALUE=<long jwe>
 *   plus a copy-paste-ready Bruno cookie row.
 */

import { encode } from "next-auth/jwt";

const PERSONAS = {
  edcadmin: {
    name: "EDC Administrator",
    email: "edcadmin@health-dataspace.local",
    preferred_username: "edcadmin",
    roles: ["EDC_ADMIN"],
  },
  clinicuser: {
    name: "Dr. Sophie Richter",
    email: "clinicuser@alpha-klinik.de",
    preferred_username: "clinicuser",
    roles: ["EDC_USER_PARTICIPANT", "DATA_HOLDER"],
  },
  lmcuser: {
    name: "Dr. Pieter van der Berg",
    email: "lmcuser@lmc.nl",
    preferred_username: "lmcuser",
    roles: ["EDC_USER_PARTICIPANT", "DATA_HOLDER"],
  },
  researcher: {
    name: "Dr. Klaus Berger",
    email: "researcher@pharmaco.de",
    preferred_username: "researcher",
    roles: ["EDC_USER_PARTICIPANT", "DATA_USER"],
  },
  regulator: {
    name: "Anke Hoffmann",
    email: "regulator@medreg.de",
    preferred_username: "regulator",
    roles: ["HDAB_AUTHORITY"],
  },
  patient1: {
    name: "Maria García",
    email: "patient1@example.es",
    preferred_username: "patient1",
    roles: ["PATIENT"],
  },
};

const persona = (process.argv[2] || "regulator").toLowerCase();
const profile = PERSONAS[persona];
if (!profile) {
  console.error(`Unknown persona: ${persona}`);
  console.error(`Valid: ${Object.keys(PERSONAS).join(", ")}`);
  process.exit(1);
}

const NEXTAUTH_SECRET = process.env.NEXTAUTH_SECRET;
if (!NEXTAUTH_SECRET) {
  // No default. A default here was the live deployment's secret in plain text
  // (#348); a forged session is only as private as the secret that signs it.
  console.error(
    "NEXTAUTH_SECRET is not set. Local stack: scripts/run-api-tests.sh reads it from the UI container; " +
      "Azure: export the deployment's value first.",
  );
  process.exit(2);
}
const COOKIE_NAME =
  process.env.COOKIE_NAME || "__Secure-next-auth.session-token";
const MAX_AGE_SECONDS = 8 * 60 * 60; // matches ui/src/lib/auth.ts session.maxAge

const now = Math.floor(Date.now() / 1000);

// SESSION_SUFFIX tells sessions forged in the same second apart: the load
// test forges many users per persona, and the proxy counts its rate limit per
// user (#519).
const suffix = process.env.SESSION_SUFFIX
  ? `-${process.env.SESSION_SUFFIX}`
  : "";

const token = {
  name: profile.name,
  email: profile.email,
  sub: `forged-${persona}-${now}${suffix}`,
  preferred_username: profile.preferred_username,
  roles: profile.roles,
  iat: now,
  exp: now + MAX_AGE_SECONDS,
  jti: crypto.randomUUID(),
};

const jwe = await encode({
  token,
  secret: NEXTAUTH_SECRET,
  maxAge: MAX_AGE_SECONDS,
  // NextAuth v4.24.x defaults `salt = ""` for both encode() and decode()
  // (server-side getToken). The HKDF info is "NextAuth.js Generated
  // Encryption Key" with no salt suffix. Pass empty string explicitly.
  salt: "",
});

console.log(`# Forged NextAuth session for persona: ${persona}`);
console.log(`# Roles: ${profile.roles.join(", ")}`);
console.log(
  `# Expires: ${new Date((now + MAX_AGE_SECONDS) * 1000).toISOString()}`,
);
console.log("");
console.log(`COOKIE_NAME=${COOKIE_NAME}`);
console.log(`COOKIE_VALUE=${jwe}`);
console.log("");
console.log("# Bruno → Cookies → Add Cookie:");
console.log(`#   Domain:   ehds.mabu.red`);
console.log(`#   Path:     /`);
console.log(`#   Name:     ${COOKIE_NAME}`);
console.log(`#   Value:    ${jwe}`);
console.log(`#   Secure:   ✓`);
console.log(`#   HttpOnly: ✓`);
console.log(`#   SameSite: Lax`);
console.log("");
console.log("# curl test:");
console.log(`#   curl -sS -H 'Cookie: ${COOKIE_NAME}=${jwe}' \\`);
console.log(`#     https://ehds.mabu.red/api/eehrxf | head -c 200`);

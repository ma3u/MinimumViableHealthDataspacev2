/**
 * An API request context that carries a NextAuth session, without Keycloak.
 *
 * Since #404 every API route needs a session, including the ones specs used
 * to probe anonymously to decide what their environment can run. This
 * signs a session the way scripts/forge-bruno-session.mjs does for the API
 * collection: next-auth's own encode() with the deployment's
 * NEXTAUTH_SECRET, so the cookie is the one a real sign-in would set.
 *
 * Returns null when NEXTAUTH_SECRET is not set. A caller skips with
 * NO_FORGED_SESSION as the reason, so the skip says why; it must never treat
 * a refused session as "this environment lacks the feature".
 */
import type { APIRequestContext, Page } from "@playwright/test";
import { request as playwrightRequest } from "@playwright/test";
import { encode } from "next-auth/jwt";

export const NO_FORGED_SESSION =
  "NEXTAUTH_SECRET is not set, so no session can be forged for the API calls " +
  "(local stack: docker exec health-dataspace-ui printenv NEXTAUTH_SECRET)";

// Every forged session signs in as <persona>@ci.test, which the hub maps to
// did:web:ci.test:<persona> (src/lib/test-identity.ts): the access log then
// marks what a spec read as an automated test, not as an unknown consumer
// (2026-11-01). The roles stay as they are; specs depend on them.
const TEST_MAIL_DOMAIN = "ci.test";

// The Keycloak users of jad/keycloak-realm.json with the realm roles and the
// mail a real sign-in gives them, so loginAs() can stand in for Keycloak where
// there is none (E2E_FORGED_SESSIONS, see journeys/helpers.ts). Only loginAs()
// uses the realm mail: the hub maps it to the user's participant (researcher
// to PharmaCo, regulator to MedReg DE), which a journey that applies for a
// permit or asks the NLQ needs. Every other forged session stays ci.test.
const PERSONAS = {
  // Only the base role: /graph derives the "default" view from it, the view
  // an anonymous visitor got before #404.
  participant: { name: "Demo Participant", roles: ["EDC_USER_PARTICIPANT"] },
  edcadmin: {
    name: "EDC Administrator",
    roles: ["EDC_ADMIN"],
    realmMail: "admin@health-dataspace.local",
  },
  researcher: {
    name: "Dr. Klaus Berger",
    roles: ["EDC_USER_PARTICIPANT", "DATA_USER"],
    realmMail: "researcher@pharmaco.de",
  },
  clinicuser: {
    name: "Dr. Sophie Richter",
    roles: ["EDC_USER_PARTICIPANT", "DATA_HOLDER"],
    realmMail: "clinic@health-dataspace.local",
  },
  lmcuser: {
    name: "Dr. Pieter van der Berg",
    roles: ["EDC_USER_PARTICIPANT", "DATA_HOLDER"],
    realmMail: "lmc@limburg-mc.nl",
  },
  regulator: {
    name: "Anke Hoffmann",
    roles: ["HDAB_AUTHORITY"],
    realmMail: "regulator@health-dataspace.local",
  },
  "regulator-es": {
    name: "Ainhoa Etxeberria",
    roles: ["HDAB_AUTHORITY"],
    realmMail: "regulator-es@health-dataspace.local",
  },
  patient1: {
    name: "Maria García",
    roles: ["PATIENT"],
    realmMail: "patient1@health-dataspace.local",
  },
  patient2: {
    name: "Jan de Vries",
    roles: ["PATIENT"],
    realmMail: "patient2@limburg-mc.nl",
  },
} as const;

const MAX_AGE_SECONDS = 60 * 60;

export type Persona = keyof typeof PERSONAS;

export function isForgeablePersona(username: string): username is Persona {
  return Object.prototype.hasOwnProperty.call(PERSONAS, username);
}

async function forgeCookie(
  baseURL: string,
  persona: Persona,
  { realmMail = false }: { realmMail?: boolean } = {},
) {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) return null;

  const now = Math.floor(Date.now() / 1000);
  const profile: {
    name: string;
    roles: readonly string[];
    realmMail?: string;
  } = PERSONAS[persona];
  const value = await encode({
    token: {
      name: profile.name,
      email:
        realmMail && profile.realmMail
          ? profile.realmMail
          : `${persona}@${TEST_MAIL_DOMAIN}`,
      sub: `e2e-${persona}-${now}`,
      preferred_username: persona,
      // What the jwt callback in src/lib/auth.ts stores for a Keycloak login;
      // a patient's own record is found by it.
      preferredUsername: persona,
      roles: [...profile.roles],
      iat: now,
      exp: now + MAX_AGE_SECONDS,
    },
    secret,
    maxAge: MAX_AGE_SECONDS,
    // NextAuth v4 encodes and decodes with an empty salt.
    salt: "",
  });

  const url = new URL(baseURL);
  const secure = url.protocol === "https:";
  return {
    name: secure
      ? "__Secure-next-auth.session-token"
      : "next-auth.session-token",
    value,
    domain: url.hostname,
    path: "/",
    expires: now + MAX_AGE_SECONDS,
    httpOnly: true,
    secure,
    sameSite: "Lax" as const,
  };
}

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

/** A request context with a session, for API-only specs. */
export async function signedInRequest(
  baseURL: string = BASE_URL,
  persona: Persona = "researcher",
): Promise<APIRequestContext | null> {
  const cookie = await forgeCookie(baseURL, persona);
  if (!cookie) return null;
  return playwrightRequest.newContext({
    baseURL,
    storageState: { cookies: [cookie], origins: [] },
  });
}

/**
 * Puts a session on the page's browser context, so page.goto() and
 * page.request carry it. Returns false when no session can be forged; the
 * caller skips with NO_FORGED_SESSION, or fails when a skip would hide a
 * regression (CI against a deployment).
 */
export async function signInPage(
  page: Page,
  persona: Persona = "participant",
  options: { realmMail?: boolean } = {},
): Promise<boolean> {
  const cookie = await forgeCookie(BASE_URL, persona, options);
  if (!cookie) return false;
  await page.context().addCookies([cookie]);
  return true;
}

/** beforeEach body: sign in, or skip saying why. */
export async function signInOrSkip(
  page: Page,
  skip: (condition: boolean, reason: string) => void,
  persona: Persona = "participant",
): Promise<void> {
  skip(!(await signInPage(page, persona)), NO_FORGED_SESSION);
}

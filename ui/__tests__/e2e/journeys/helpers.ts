/**
 * Shared helpers and constants for user‑journey E2E tests.
 *
 * All five fictional participants and common UI/API helpers
 * are defined here so journey specs stay DRY.
 *
 * Note: Protected pages (/admin, /data/*, /negotiate, /credentials,
 * /compliance) redirect unauthenticated users to /auth/signin.
 *
 * API routes are NOT covered by middleware (its matcher excludes /api), but
 * most of them call `requireAuth()` themselves and answer 401 without a
 * session. The older claim here — that /api/* needs no authentication — is why
 * specs were written to assert on protected routes without logging in, and why
 * the post-reset smoke job failed on every run for two months (issue #115).
 *
 * Public today: /api/graph, /api/patient.
 * Requires a session: /api/graph/validate, /api/catalog, /api/credentials,
 * /api/compliance, /api/analytics, and /api/trust-center (which additionally
 * requires TRUST_CENTER_OPERATOR or EDC_ADMIN).
 *
 * If a spec asserts on any of the latter, call `loginAs()` first — `edcadmin`
 * satisfies all of them.
 */
import { type Page, expect, test } from "@playwright/test";
import { isForgeablePersona, signInPage } from "../helpers/forged-session";

/* ── Participant display names (stable across live & mock) ───── */

export const PARTICIPANT_NAMES = [
  "AlphaKlinik Berlin",
  "PharmaCo Research AG",
  "MedReg DE",
  "Limburg Medical Centre",
  "Institut de Recherche Santé",
] as const;

/* ── Timeouts ────────────────────────────────────────────────── */

/** Default element‑visibility timeout */
export const T = 15_000;

/* ── Navigation helpers ──────────────────────────────────────── */

/** Wait for the main page heading (h1 or h2) to contain the given text. */
export async function expectHeading(page: Page, text: string) {
  await expect(
    page.locator("h1, h2", { hasText: new RegExp(text, "i") }).first(),
  ).toBeVisible({ timeout: T });
}

/** Expect redirect to sign-in for protected pages. */
export async function expectSigninRedirect(page: Page) {
  await expect(page).toHaveURL(/signin/, { timeout: T });
}

/** Wait for page to finish loading data (no spinner visible). */
export async function waitForDataLoad(page: Page) {
  const spinner = page.locator('[class*="animate-spin"]');
  if ((await spinner.count()) > 0) {
    await expect(spinner.first()).not.toBeVisible({ timeout: T });
  }
}

/**
 * GET a JSON API route, failing with the status and body when it does not.
 *
 * The previous implementation asserted `expect(response.ok()).toBe(true)`,
 * which reports "expected true, received false" and nothing else. The smoke
 * job printed that 17 times a run for two months while the actual answer —
 * `401 Unauthorized` — was never shown.
 */
export async function apiGet(page: Page, path: string) {
  const response = await page.request.get(path);
  if (!response.ok()) {
    const body = (await response.text().catch(() => "")).slice(0, 200);
    throw new Error(
      `GET ${path} → ${response.status()} ${response.statusText()}` +
        (body ? ` — ${body}` : "") +
        (response.status() === 401 || response.status() === 403
          ? '\n  This route requires a session. Call loginAs(page, "edcadmin", "edcadmin") first.'
          : ""),
    );
  }
  return response.json();
}

/**
 * GET /api/tasks, or skip the test saying why.
 *
 * The negotiations and transfers come from the EDC connector, else from the
 * task store (Postgres behind the neo4j-proxy). The CI stack has neither, and
 * since #571 the route serves no fixture, so it answers 502 there.
 */
export async function apiGetTasksOrSkip(page: Page) {
  const response = await page.request.get("/api/tasks");
  test.skip(
    response.status() === 502,
    "/api/tasks needs an EDC connector or the task store (Postgres); this stack has neither",
  );
  expect(response.ok(), `GET /api/tasks → ${response.status()}`).toBe(true);
  return response.json();
}

/**
 * GET /api/admin/policies, or skip the test saying why.
 *
 * Policy definitions live in the EDC control plane. Without one the route
 * answers from Neo4j (`offline: true`), where the demo graph holds a single
 * policy on a data product, not the participants' definitions these journeys
 * are about.
 */
export async function apiGetPoliciesOrSkip(page: Page) {
  const data = await apiGet(page, "/api/admin/policies");
  test.skip(
    data.offline === true,
    "Policy definitions live in the EDC control plane; this stack has none",
  );
  return data;
}

/**
 * Whether loginAs() forges the session instead of signing in at Keycloak.
 *
 * The nightly and the pull request E2E run against a seeded Neo4j and no
 * Keycloak. Until 2026-11-07 every spec that signs in skipped there (572
 * tests), so what a signed-in persona sees was never tested in CI. With
 * E2E_FORGED_SESSIONS=1 and NEXTAUTH_SECRET set, loginAs() puts a session
 * with the realm user's roles on the browser context
 * (helpers/forged-session.ts), the cookie a real sign-in sets. The Keycloak
 * flow itself is still tested wherever a Keycloak answers:
 * skipIfKeycloakDown({ realKeycloak: true }).
 */
export function forgedSessions(): boolean {
  return (
    process.env.E2E_FORGED_SESSIONS === "1" && !!process.env.NEXTAUTH_SECRET
  );
}

/**
 * Log in via the Keycloak OIDC flow (browser-based).
 * After this call, `page.request` shares the authenticated session cookies.
 */
export async function loginAs(page: Page, username: string, password: string) {
  if (forgedSessions()) {
    if (!isForgeablePersona(username)) {
      throw new Error(`No forged session for "${username}"`);
    }
    await signInPage(page, username, { realmMail: true });
    await page.goto("/", { waitUntil: "networkidle" });
    return;
  }
  // Wait for networkidle so NextAuth's SessionProvider has finished
  // initializing (fetched /api/auth/session + /api/keycloak-config). Clicking
  // "Sign in with Keycloak" before this is established causes signIn() to
  // fail silently and reload the page instead of redirecting to Keycloak.
  // ?lang=en: the button is found by its English name whatever language the
  // browser or an earlier test picked (#782); it does not store a choice.
  await page.goto("/auth/signin?lang=en", { waitUntil: "networkidle" });
  const keycloakBtn = page.getByRole("button", {
    name: /sign in with keycloak/i,
  });
  await expect(keycloakBtn).toBeVisible({ timeout: T });
  await keycloakBtn.click();

  // Wait for the navigation to Keycloak to complete. NextAuth's signIn() is
  // async (csrf → providers → signin/keycloak → navigate), so the click
  // resolves before the navigation starts. Without an explicit URL wait, the
  // username-field assertion polls /auth/signin and times out.
  await page.waitForURL(/protocol\/openid-connect\/auth/, { timeout: 20_000 });

  await expect(page.getByLabel(/username or email/i)).toBeVisible({
    timeout: 15_000,
  });
  await page.getByLabel(/username or email/i).fill(username);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();

  // Wait to land back on the app (works for both localhost and Azure URLs)
  const baseUrl = process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000";
  const baseHostname = new URL(baseUrl).hostname.replace(/\./g, "\\.");
  await expect(page).toHaveURL(new RegExp(baseHostname), { timeout: 20_000 });

  // Wait for the NextAuth session to be established, then reload.
  // The OIDC redirect sets the session cookie but the server-rendered HTML
  // has no session — useSession() fetches it asynchronously. The React tree
  // sometimes keeps the server-rendered nav groups. Waiting for a valid
  // session response then reloading ensures the server render includes
  // the authenticated state.
  await page.waitForFunction(
    async () => {
      try {
        const res = await fetch("/api/auth/session");
        const data = await res.json();
        return !!data?.roles?.length;
      } catch {
        return false;
      }
    },
    { timeout: 10_000 },
  );
  await page.reload({ waitUntil: "networkidle" });
}

/**
 * Log in as `edcadmin`, the only persona whose roles satisfy every protected
 * API route these journeys touch (EDC_ADMIN covers /api/trust-center's
 * TRUST_CENTER_OPERATOR|EDC_ADMIN check as well).
 *
 * Called per-test rather than in a blanket `beforeEach`: only about a third of
 * the journey tests assert on protected routes, and authenticating the rest
 * would both cost 3x the OIDC round-trips and destroy the signal that the
 * public routes really are public.
 */
export async function loginAsAdmin(page: Page) {
  try {
    await loginAs(page, "edcadmin", "edcadmin");
  } catch (err) {
    // Deliberately not `test.skip` on a Keycloak problem. A login that stops
    // working after a demo reset is the single most important thing the
    // post-reset smoke job can catch; skipping would turn that into a green
    // run, which is how issue #115 stayed invisible for two months.
    const base = process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000";
    throw new Error(
      `loginAs("edcadmin") failed against ${base}.\n` +
        `  Two causes, in the order they are worth checking:\n` +
        `  1. Base URL mismatch. If the error mentions 'OAuthCallback', the ` +
        `base URL above is not the host NEXTAUTH_URL is set to, so the PKCE/` +
        `state cookies are set on one hostname and the callback lands on ` +
        `another. Target the custom domain, not the raw ACA FQDN.\n` +
        `  2. Realm drift. If the error is 'Invalid username or password', the ` +
        `edcadmin user or its EDC_ADMIN role is missing: ` +
        `./scripts/provision-keycloak-sso.sh\n` +
        `  Original error: ${(err as Error).message}`,
    );
  }
}

/**
 * Sign out and land on the start page.
 *
 * A forged session is only a cookie. Signing out through the menu sends the
 * browser on to Keycloak's end-session endpoint, which is not there, and that
 * navigation aborted the page.goto() that followed (ERR_ABORTED in 18, 28 and
 * 29, each of which had its own copy of this function until 2026-11-08).
 */
export async function logout(page: Page) {
  if (forgedSessions()) {
    await page.context().clearCookies();
    await page.goto("/", { waitUntil: "domcontentloaded" });
    return;
  }
  const userMenu = page
    .locator("nav")
    .getByRole("button", { name: /user menu/i });
  if (await userMenu.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await userMenu.click();
    const signOut = page.getByRole("button", { name: /sign out/i });
    if (await signOut.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await signOut.click();
    }
  }
  try {
    await page.goto("/", { waitUntil: "domcontentloaded", timeout: 10_000 });
  } catch {
    // The Keycloak end-session redirect can abort this on the JAD stack.
    await page.waitForTimeout(1_000);
  }
}

/* ── Service-availability checks ─────────────────────────────── */

/**
 * Skip the current test if Neo4j is unreachable.
 *
 * Pass the route the test is about to call. The default, `/api/graph`, is
 * public — probing it while the test then calls a protected route is what made
 * this guard useless: the probe returned 200, the test proceeded, and the real
 * 401 surfaced as an assertion failure (issue #115).
 *
 * A 401/403 is a broken *test*, not a broken *environment*, so it throws rather
 * than skipping. Skipping there would turn a spec that never logs in into a
 * permanently-green no-op, which is the same "no signal" failure in a nicer
 * colour.
 */
export async function skipIfNeo4jDown(page: Page, path = "/api/graph") {
  let res;
  try {
    res = await page.request.get(path, { timeout: 5_000 });
  } catch {
    test.skip(true, `Neo4j unavailable (${path} unreachable)`);
    return;
  }
  if (res.ok()) return;
  if (res.status() === 401 || res.status() === 403) {
    throw new Error(
      `${path} returned ${res.status()} — this test is not authenticated.\n` +
        `  Call loginAs(page, "edcadmin", "edcadmin") before asserting on ` +
        `protected API routes. Not skipping: an auth gap is a test defect, ` +
        `not an outage.`,
    );
  }
  test.skip(true, `Neo4j unavailable (${path} → ${res.status()})`);
}

/**
 * Skip the current test if Keycloak is unreachable.
 *
 * With forged sessions (forgedSessions()) a spec that only needs a signed-in
 * persona runs without Keycloak; pass realKeycloak for one that tests the
 * sign-in or sign-out at Keycloak itself.
 */
export async function skipIfKeycloakDown({
  realKeycloak = false,
}: { realKeycloak?: boolean } = {}) {
  if (!realKeycloak && forgedSessions()) return;
  // Defaults to localhost, which is right for a local stack and a trap against
  // a remote one: point PLAYWRIGHT_BASE_URL at a deployment without also
  // setting KEYCLOAK_PUBLIC_URL and every test here skips while reporting
  // nothing useful. "21 skipped" then reads like a clean run, which is how a
  // broken realm survived a verification. Skipping is legitimate; skipping
  // because the prober was pointed at the wrong host is not, so say so.
  const keycloakUrl =
    process.env.KEYCLOAK_PUBLIC_URL || "http://localhost:8080";
  const baseUrl = process.env.PLAYWRIGHT_BASE_URL ?? "";
  const remoteBase = /^https?:\/\/(?!localhost|127\.0\.0\.1)/.test(baseUrl);
  if (remoteBase && keycloakUrl.includes("localhost")) {
    throw new Error(
      `PLAYWRIGHT_BASE_URL is ${baseUrl} but KEYCLOAK_PUBLIC_URL is ` +
        `${keycloakUrl}. These tests would skip against a local Keycloak that ` +
        `is not the one serving that deployment, and report nothing. Set ` +
        `KEYCLOAK_PUBLIC_URL to the deployment's Keycloak.`,
    );
  }
  try {
    const res = await fetch(
      `${keycloakUrl}/realms/edcv/.well-known/openid-configuration`,
      { signal: AbortSignal.timeout(3_000) },
    );
    if (!res.ok) test.skip(true, "Keycloak unavailable");
  } catch {
    test.skip(true, "Keycloak unavailable");
  }
}

/**
 * Pick the static demo's persona the way the app's setDemoPersona() does
 * (ui/src/lib/use-demo-persona.ts): sessionStorage, which useDemoPersona()
 * and so the navigation and the patient pages read, and localStorage, which
 * lib/api.ts reads to serve a patient their own record's mock. Writing only
 * one of them left the other at its default. Reloads so both apply.
 */
export async function setPersona(page: Page, username: string) {
  await page.evaluate(
    ([key, value]) => {
      sessionStorage.setItem(key, value);
      localStorage.setItem(key, value);
    },
    ["demo-persona", username],
  );
  await page.reload({ waitUntil: "networkidle" });
}

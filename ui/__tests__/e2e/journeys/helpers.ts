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

/** Open a nav dropdown by group name and click a link inside it. */
export async function navigateViaDropdown(
  page: Page,
  group: string,
  linkName: string,
) {
  const nav = page.locator("nav");
  await nav.getByRole("button", { name: new RegExp(group, "i") }).click();
  await nav.getByRole("menuitem", { name: new RegExp(linkName, "i") }).click();
}

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
 * Log in via the Keycloak OIDC flow (browser-based).
 * After this call, `page.request` shares the authenticated session cookies.
 */
export async function loginAs(page: Page, username: string, password: string) {
  // Wait for networkidle so NextAuth's SessionProvider has finished
  // initializing (fetched /api/auth/session + /api/keycloak-config). Clicking
  // "Sign in with Keycloak" before this is established causes signIn() to
  // fail silently and reload the page instead of redirecting to Keycloak.
  await page.goto("/auth/signin", { waitUntil: "networkidle" });
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
    throw new Error(
      `loginAs("edcadmin") failed against ${
        process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000"
      }.\n` +
        `  Check the Keycloak 'edcv' realm has the edcadmin user with the ` +
        `EDC_ADMIN role: ./scripts/provision-keycloak-sso.sh\n` +
        `  Original error: ${(err as Error).message}`,
    );
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

/** Skip the current test if Keycloak is unreachable. */
export async function skipIfKeycloakDown() {
  const keycloakUrl =
    process.env.KEYCLOAK_PUBLIC_URL || "http://localhost:8080";
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

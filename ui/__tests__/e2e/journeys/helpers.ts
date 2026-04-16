/**
 * Shared helpers and constants for user‑journey E2E tests.
 *
 * All five fictional participants and common UI/API helpers
 * are defined here so journey specs stay DRY.
 *
 * Note: Protected pages (/admin, /data/*, /negotiate, /credentials,
 * /compliance) redirect unauthenticated users to /auth/signin.
 * Journey tests use PUBLIC pages for UI assertions and /api/* routes
 * for data-level assertions (API routes have no auth middleware).
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

/** Helper to GET a JSON API route. */
export async function apiGet(page: Page, path: string) {
  const response = await page.request.get(path);
  expect(response.ok()).toBe(true);
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

/* ── Service-availability checks ─────────────────────────────── */

/** Skip the current test if Neo4j is unreachable (API returns non-200). */
export async function skipIfNeo4jDown(page: Page) {
  try {
    const res = await page.request.get("/api/graph", { timeout: 5_000 });
    if (!res.ok()) test.skip(true, "Neo4j unavailable");
  } catch {
    test.skip(true, "Neo4j unavailable");
  }
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

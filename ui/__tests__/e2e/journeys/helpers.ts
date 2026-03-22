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
  await nav.getByRole("link", { name: new RegExp(linkName, "i") }).click();
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

/** Helper to GET a JSON API route (no auth middleware on /api/*). */
export async function apiGet(page: Page, path: string) {
  const response = await page.request.get(path);
  expect(response.ok()).toBe(true);
  return response.json();
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
  try {
    const res = await fetch(
      "http://localhost:8080/realms/edcv/.well-known/openid-configuration",
      { signal: AbortSignal.timeout(3_000) },
    );
    if (!res.ok) test.skip(true, "Keycloak unavailable");
  } catch {
    test.skip(true, "Keycloak unavailable");
  }
}

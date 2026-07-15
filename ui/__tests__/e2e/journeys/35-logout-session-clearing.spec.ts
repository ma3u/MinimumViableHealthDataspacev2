/**
 * Journey Group S — Logout & SSO Session Clearing (J820–J829)
 *
 * Regression coverage for issue #52:
 *   "Logout does not clear the Keycloak SSO session — re-login silently
 *    restores the previous user."
 *
 * The bug: the Sign out button passed Keycloak's cross-origin end-session
 * URL as `signOut({ callbackUrl })`. NextAuth v4 rejects cross-origin
 * callback URLs, so the browser never reached Keycloak and the SSO cookie
 * (KEYCLOAK_IDENTITY / KEYCLOAK_SESSION) survived. The next sign-in then
 * silently re-authenticated the same user with no login form.
 *
 * Expected after the fix: signing out ends the Keycloak SSO session, so a
 * subsequent sign-in shows the Keycloak login form and a *different* user
 * can authenticate — no incognito window needed.
 *
 * Prerequisites: Keycloak running with the EDCV realm users.
 * Skipped automatically when Keycloak is unreachable.
 */
import { test, expect, type Page } from "@playwright/test";
import { T, skipIfKeycloakDown, loginAs } from "./helpers";

/** Sign out through the UserMenu dropdown and wait for the logout to settle. */
async function signOutViaUi(page: Page) {
  await page.goto("/", { waitUntil: "networkidle" });
  // Open the user menu (nav-bar button carries aria-label="User menu").
  await page.getByRole("button", { name: /user menu/i }).click();
  const signOut = page.getByRole("button", { name: /^sign out$/i });
  await expect(signOut).toBeVisible({ timeout: T });
  await signOut.click();
  // The fix performs: signOut({ redirect: false }) → hard-redirect to
  // Keycloak's end-session endpoint → post_logout_redirect_uri back to the
  // app. Wait for the round-trip to land back on the app origin.
  const baseUrl = process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000";
  const baseHost = new URL(baseUrl).hostname.replace(/\./g, "\\.");
  await page.waitForURL(new RegExp(baseHost), { timeout: 20_000 });
}

/** Read the role array from the NextAuth session endpoint. */
async function sessionRoles(page: Page): Promise<string[]> {
  try {
    const res = await page.request.get("/api/auth/session");
    if (!res.ok()) return [];
    const data = (await res.json()) as { roles?: string[] };
    return data.roles ?? [];
  } catch {
    return [];
  }
}

test.describe("Journey S — Logout clears the Keycloak SSO session", () => {
  test.beforeEach(async () => {
    await skipIfKeycloakDown();
  });

  test("J820 — sign out fully clears the NextAuth session", async ({
    page,
  }) => {
    await loginAs(page, "clinicuser", "clinicuser");
    expect(await sessionRoles(page)).toContain("DATA_HOLDER");

    await signOutViaUi(page);

    // No roles → NextAuth session cookie is gone.
    expect(await sessionRoles(page)).toHaveLength(0);
  });

  test("J821 — after logout, a DIFFERENT user can sign in (no stale SSO)", async ({
    page,
  }) => {
    // Sign in as the first user.
    await loginAs(page, "clinicuser", "clinicuser");
    expect(await sessionRoles(page)).toContain("DATA_HOLDER");

    // Sign out — must end the Keycloak SSO session, not only the app cookie.
    await signOutViaUi(page);

    // Sign in again as a DIFFERENT user. loginAs() asserts the Keycloak
    // username field is visible — if the SSO session had survived (the bug),
    // Keycloak would skip the login form and this step would fail or restore
    // clinicuser instead.
    await loginAs(page, "researcher", "researcher");

    const roles = await sessionRoles(page);
    expect(roles).toContain("DATA_USER");
    // The previous user's role must NOT leak into the new session.
    expect(roles).not.toContain("DATA_HOLDER");
  });

  test("J822 — re-login as the SAME user still presents the login form", async ({
    page,
  }) => {
    await loginAs(page, "researcher", "researcher");
    await signOutViaUi(page);

    // loginAs() fails if the Keycloak login form is skipped — so a passing
    // run proves the SSO session was cleared even for same-user re-login.
    await loginAs(page, "researcher", "researcher");
    expect(await sessionRoles(page)).toContain("DATA_USER");
  });
});

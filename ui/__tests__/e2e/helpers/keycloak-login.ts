import type { Page } from "@playwright/test";

export interface KeycloakLoginOptions {
  username: string;
  password: string;
  /** Entry URL that redirects to /auth/signin (e.g. "/onboarding"). */
  protectedPath?: string;
}

/**
 * Performs a full NextAuth → Keycloak OIDC login flow. After this returns, the
 * browser context holds a valid `next-auth.session-token` cookie and is
 * authenticated against the UI.
 */
export async function keycloakLogin(
  page: Page,
  { username, password, protectedPath = "/onboarding" }: KeycloakLoginOptions,
): Promise<void> {
  await page.goto(protectedPath);
  await page.waitForURL(/\/auth\/signin/);
  await page.click('button:has-text("Sign in with Keycloak")');
  await page.waitForURL(/openid-connect\/auth/);
  await page.fill("#username", username);
  await page.fill("#password", password);
  await page.click("#kc-login");
  await page.waitForURL(
    (url) => !/openid-connect|\/auth\/signin/.test(url.href),
  );
}

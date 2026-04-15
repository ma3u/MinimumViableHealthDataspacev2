import type { Page, BrowserContext } from "@playwright/test";

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

/**
 * Extracts the NextAuth session cookie after a login. Returned in the
 * `name=value` form ZAP's replacer rule consumes.
 */
export async function getSessionCookie(
  context: BrowserContext,
  baseUrl: string,
): Promise<string> {
  const cookies = await context.cookies(baseUrl);
  const session = cookies.find(
    (c) =>
      c.name === "next-auth.session-token" ||
      c.name === "__Secure-next-auth.session-token",
  );
  if (!session) throw new Error("session cookie not found after login");
  return `${session.name}=${session.value}`;
}

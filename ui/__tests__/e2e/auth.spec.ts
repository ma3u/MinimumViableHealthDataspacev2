import { test, expect } from "@playwright/test";

async function isKeycloakUp(): Promise<boolean> {
  try {
    const res = await fetch(
      "http://localhost:8080/realms/edcv/.well-known/openid-configuration",
      { signal: AbortSignal.timeout(3_000) },
    );
    return res.ok;
  } catch {
    return false;
  }
}

const users = [
  { username: "edcadmin", password: "edcadmin", role: "EDC_ADMIN" },
  {
    username: "clinicuser",
    password: "clinicuser",
    role: "EDC_USER_PARTICIPANT",
  },
  { username: "regulator", password: "regulator", role: "HDAB_AUTHORITY" },
];

test.describe("Portal Login flow with all users", () => {
  for (const user of users) {
    test(`should successfully login as ${user.username} and reach portal`, async ({
      page,
    }) => {
      test.skip(!(await isKeycloakUp()), "Keycloak unavailable");
      // 1. Go to a protected route directly to trigger NextAuth login flow
      await page.goto("/onboarding");

      // We should be redirected to the custom sign-in page since we are not authenticated
      await expect(page).toHaveURL(/.*\/auth\/signin/);

      // 2. Click the specific sign-in button
      await page.click('button:has-text("Sign in with Keycloak")');

      // 3. We should now be on the Keycloak login page. Wait for it to load.
      await expect(page).toHaveURL(/.*localhost:8080.*openid-connect\/auth/);

      // 4. Fill in the Keycloak login form
      await page.fill("#username", user.username);
      await page.fill("#password", user.password);
      await page.click("#kc-login");

      // 5. Following login, Keycloak redirects back to callback -> /onboarding
      // We expect to arrive at the onboarding page
      // Playwright might take a few seconds here, so we wait.
      await expect(page).toHaveURL(/.*\/onboarding/, { timeout: 15000 });

      // 6. Verify we are authenticated on the dashboard
      // The user menu should display the user's name or a shield icon with text.
      // Easiest is to check that we don't see the "Sign in" button in the UserMenu anymore.
      await expect(page.locator("text=Sign in").first()).not.toBeVisible();

      // We can also check if the role is displayed or if the user's name is displayed
      // But the UserMenu button just says the user name, let's just make sure "Onboarding" title is visible
      await expect(
        page.locator("h1:has-text('Onboarding')").first(),
      ).toBeVisible();
    });
  }
});

/**
 * Every ODRL policy on /admin/policies is explained and checked (J1080).
 * Under each policy title the page says in plain language who may do what,
 * for which purpose, for how long, what is forbidden and what is required
 * (lib/odrl-describe.ts); a badge says Valid, Warnings or Errors, and opens
 * the findings: ODRL 2.2 errors and the EHDS recommendations for secondary
 * use, each with its article (lib/odrl-validate.ts). The same in German.
 *
 *   PLAYWRIGHT_BASE_URL=http://localhost:3003 \
 *     npx playwright test __tests__/e2e/journeys/52-odrl-policy-explained.spec.ts
 */
import { expect, test } from "@playwright/test";
import { loginAs, skipIfKeycloakDown } from "./helpers";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      sessionStorage.setItem("demo-password-banner-dismissed", "true");
    } catch {
      /* ignore */
    }
  });
});

test.describe("ODRL policies explained and checked", () => {
  test.beforeEach(async ({ page }) => {
    await skipIfKeycloakDown();
    await loginAs(page, "edcadmin", "edcadmin");
  });

  test("J1080 each policy has a plain-language description and a checked badge", async ({
    page,
  }) => {
    await page.goto("/admin/policies?lang=en");
    await expect(
      page.getByRole("heading", { level: 1, name: "Policy Definitions" }),
    ).toBeVisible({ timeout: 15_000 });

    // Open the first participant that has policies. Its button is named by
    // what it shows and says whether it is open (aria-expanded), no longer
    // "Expand <name>" (WCAG 2.5.3, 2026-11-08).
    await page
      .getByRole("main")
      .locator('button[aria-expanded="false"]')
      .first()
      .click();
    const description = page.getByTestId("policy-description").first();
    await expect(description).toBeVisible({ timeout: 15_000 });
    await expect(description).toContainText(/may .+, .+, .+\./);

    const badge = page.getByTestId("policy-verdict").first();
    await expect(badge).toHaveText(/^(Valid|Warnings \(\d+\)|Errors \(\d+\))$/);
    await badge.click();
    await expect(badge).toHaveAttribute("aria-expanded", "true");
    const findings = page.getByTestId("policy-findings");
    await expect(findings).toBeVisible();
    await expect(findings).toContainText(
      /ODRL findings make a policy invalid or ambiguous/,
    );

    // The raw JSON stays one click away.
    await expect(page.getByText("View full ODRL JSON").first()).toBeVisible();

    // German: the same description through the picker's dictionary.
    await page.goto("/admin/policies?lang=de");
    await page
      .getByRole("main")
      .locator('button[aria-expanded="false"]')
      .first()
      .click();
    await expect(page.getByTestId("policy-description").first()).toContainText(
      /darf: /,
      { timeout: 15_000 },
    );
  });
});

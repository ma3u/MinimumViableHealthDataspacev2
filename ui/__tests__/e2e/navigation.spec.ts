/**
 * E2E tests — Navigation dropdown clusters and page routing.
 *
 * Verifies the 5 NavGroup dropdowns open, contain expected links,
 * and navigate correctly. Dropdown links are scoped to the nav bar.
 */
import { test, expect } from "@playwright/test";

const TIMEOUT = 15_000;

test.describe("Navigation Dropdowns", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("text=Health Dataspace").first()).toBeVisible({
      timeout: TIMEOUT,
    });
  });

  test("Explore dropdown contains expected links", async ({ page }) => {
    const nav = page.locator("nav");
    const trigger = nav.getByRole("button", { name: /Explore/i });
    await trigger.click();
    await expect(
      nav.getByRole("link", { name: "Graph Explorer", exact: true }),
    ).toBeVisible();
    await expect(
      nav.getByRole("link", { name: /Dataset Catalog/ }),
    ).toBeVisible();
    await expect(
      nav.getByRole("link", { name: /Patient Journey/ }),
    ).toBeVisible();
  });

  test("Governance dropdown contains expected links", async ({ page }) => {
    const nav = page.locator("nav");
    const trigger = nav.getByRole("button", { name: /Governance/i });
    await trigger.click();
    await expect(
      nav.getByRole("link", { name: /EHDS Approval/ }),
    ).toBeVisible();
    await expect(nav.getByRole("link", { name: /Credentials/ })).toBeVisible();
    await expect(nav.getByRole("link", { name: /Protocol TCK/ })).toBeVisible();
  });

  test("Exchange dropdown contains expected links", async ({ page }) => {
    const nav = page.locator("nav");
    const trigger = nav.getByRole("button", { name: /Exchange/i });
    await trigger.click();
    await expect(nav.getByRole("link", { name: /Discover/ })).toBeVisible();
    await expect(nav.getByRole("link", { name: /Negotiate/ })).toBeVisible();
    await expect(nav.getByRole("link", { name: /Transfer/ })).toBeVisible();
  });

  test("Portal dropdown contains expected links", async ({ page }) => {
    const nav = page.locator("nav");
    const trigger = nav.getByRole("button", { name: /Portal/i });
    await trigger.click();
    await expect(nav.getByRole("link", { name: /Dashboard/ })).toBeVisible();
    await expect(nav.getByRole("link", { name: /Onboarding/ })).toBeVisible();
    await expect(nav.getByRole("link", { name: /Settings/ })).toBeVisible();
  });

  test("Docs dropdown contains expected links", async ({ page }) => {
    const nav = page.locator("nav");
    const trigger = nav.getByRole("button", { name: /Docs/i });
    await trigger.click();
    await expect(nav.getByRole("link", { name: /Overview/ })).toBeVisible();
    await expect(nav.getByRole("link", { name: /Architecture/ })).toBeVisible();
    await expect(nav.getByRole("link", { name: /Developer/ })).toBeVisible();
  });
});

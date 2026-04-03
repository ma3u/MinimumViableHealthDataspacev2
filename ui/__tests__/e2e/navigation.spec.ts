/**
 * E2E tests — Navigation for unauthenticated users.
 *
 * With role-aware navigation (Phase 19), unauthenticated users only see
 * public groups: Explore (partial) and Docs.
 * Governance, Exchange, Manage, and Get Started require authentication.
 */
import { test, expect } from "@playwright/test";

const TIMEOUT = 15_000;

test.describe("Navigation — unauthenticated view", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("text=Health Dataspace").first()).toBeVisible({
      timeout: TIMEOUT,
    });
  });

  test("Explore dropdown is visible and contains public links", async ({
    page,
  }) => {
    const nav = page.locator("nav");
    const trigger = nav.getByRole("button", { name: /Explore/i });
    await trigger.click();
    await expect(
      nav.getByRole("menuitem", { name: "Graph Explorer", exact: true }),
    ).toBeVisible();
    await expect(
      nav.getByRole("menuitem", { name: /Dataset Catalog/ }),
    ).toBeVisible();
    await expect(
      nav.getByRole("menuitem", { name: /Patient Journey/ }),
    ).toBeVisible();
  });

  test("Docs dropdown is visible for unauthenticated users", async ({
    page,
  }) => {
    const nav = page.locator("nav");
    const trigger = nav.getByRole("button", { name: /Docs/i });
    await trigger.click();
    await expect(nav.getByRole("menuitem", { name: /Overview/ })).toBeVisible();
    await expect(
      nav.getByRole("menuitem", { name: /Architecture/ }),
    ).toBeVisible();
    await expect(
      nav.getByRole("menuitem", { name: /Developer/ }),
    ).toBeVisible();
  });

  test("Sign in button is visible when not authenticated", async ({ page }) => {
    const nav = page.locator("nav");
    await expect(nav.getByText("Sign in")).toBeVisible({ timeout: TIMEOUT });
  });

  test("Governance group is hidden from unauthenticated users", async ({
    page,
  }) => {
    const nav = page.locator("nav");
    // Governance requires HDAB_AUTHORITY or EDC_ADMIN
    await expect(
      nav.getByRole("button", { name: /Governance/i }),
    ).not.toBeVisible();
  });

  test("Manage group is hidden from unauthenticated users", async ({
    page,
  }) => {
    const nav = page.locator("nav");
    // Manage requires EDC_ADMIN or HDAB_AUTHORITY
    await expect(
      nav.getByRole("button", { name: /Manage/i }),
    ).not.toBeVisible();
  });

  test("Exchange group is hidden from unauthenticated users", async ({
    page,
  }) => {
    const nav = page.locator("nav");
    // Exchange requires AUTH
    await expect(
      nav.getByRole("button", { name: /Exchange/i }),
    ).not.toBeVisible();
  });
});

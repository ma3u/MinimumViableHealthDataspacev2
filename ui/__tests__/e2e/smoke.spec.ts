/**
 * E2E smoke tests — verify key pages load and render critical elements.
 *
 * These tests are designed to work against the running Docker stack
 * OR against `npm run dev` via the webServer config in playwright.config.ts.
 */
import { test, expect } from "@playwright/test";

const isCI = !!process.env.CI;

test.describe("Home Page", () => {
  test("should load and show the brand name", async ({ page }) => {
    await page.goto("/");
    // Either the home page redirects to /graph or shows a nav with the brand
    await expect(page.locator("text=Health Dataspace").first()).toBeVisible({
      timeout: 15_000,
    });
  });
});

test.describe("Graph Explorer", () => {
  test("should load the graph page", async ({ page }) => {
    test.skip(isCI, "Requires live Neo4j");

    await page.goto("/graph");
    await expect(page).toHaveURL(/\/graph/);
    // Graph page has a sidebar with "Layers" heading
    await expect(page.locator("text=Layers").first()).toBeVisible();
  });
});

test.describe("Dataset Catalog", () => {
  test("should load the catalog page", async ({ page }) => {
    await page.goto("/catalog");
    await expect(page).toHaveURL(/\/catalog/);
    await expect(page.locator("text=Dataset Catalog").first()).toBeVisible();
  });
});

test.describe("Patient Journey", () => {
  test("should load the patient page", async ({ page }) => {
    await page.goto("/patient");
    await expect(page).toHaveURL(/\/patient/);
    await expect(page.locator("text=Patient").first()).toBeVisible();
  });
});

test.describe("Navigation", () => {
  test("should navigate between pages", async ({ page }) => {
    test.skip(isCI, "Requires live Neo4j");

    await page.goto("/graph");
    await expect(page.locator("text=Health Dataspace").first()).toBeVisible();

    // Navigate to catalog via nav dropdown
    const nav = page.locator("nav");
    const explore = nav.getByRole("button", { name: /Explore/i });
    await explore.click();
    await nav.getByRole("link", { name: /Dataset Catalog/ }).click();
    await expect(page).toHaveURL(/\/catalog/);

    // Navigate to patient via nav dropdown
    await explore.click();
    await nav.getByRole("link", { name: /Patient Journey/ }).click();
    await expect(page).toHaveURL(/\/patient/);
  });
});

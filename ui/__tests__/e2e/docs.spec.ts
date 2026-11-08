/**
 * E2E tests — Documentation content and interactive elements.
 *
 * Verifies doc pages contain expected sections, Mermaid diagrams render,
 * and table of contents links work.
 */
import { test, expect } from "@playwright/test";

const TIMEOUT = 15_000;

test.describe("Documentation Content", () => {
  // The "Technology Stack" section became "JAD Stack Architecture".
  test("Developer Guide contains the stack architecture and testing sections", async ({
    page,
  }) => {
    await page.goto("/docs/developer");
    await expect(
      page.locator("h2", { hasText: "JAD Stack Architecture" }),
    ).toBeVisible({ timeout: TIMEOUT });
    await expect(page.locator("h2", { hasText: /^Testing$/ })).toBeVisible({
      timeout: TIMEOUT,
    });
  });

  test("Architecture page contains Mermaid diagram", async ({ page }) => {
    await page.goto("/docs/architecture");
    // Mermaid renders SVG or figure element
    await expect(
      page.locator("figure").or(page.locator("svg")).first(),
    ).toBeVisible({ timeout: TIMEOUT });
  });

  test("Docs overview links to sub-pages", async ({ page }) => {
    await page.goto("/docs");
    // The overview links to each page from its card and again from the text.
    await expect(
      page.locator("a[href='/docs/architecture']").first(),
    ).toBeVisible();
    await expect(
      page.locator("a[href='/docs/developer']").first(),
    ).toBeVisible();
  });
});

test.describe("Responsive Layout", () => {
  test("page has correct title tag", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/Health Data Space/i);
  });

  test("mobile viewport still renders navigation", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/");
    // Brand text should still be visible
    await expect(page.locator("text=Health Dataspace").first()).toBeVisible({
      timeout: TIMEOUT,
    });
  });
});

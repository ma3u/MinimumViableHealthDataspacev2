/**
 * E2E tests — Verify all pages load correctly.
 *
 * Public pages: verify heading renders.
 * Protected pages: verify redirect to sign-in (auth middleware).
 */
import { test, expect } from "@playwright/test";

const TIMEOUT = 15_000;

/* ── Public Explore pages ─────────────────────────────────────── */

test.describe("Explore Pages (public)", () => {
  test("Graph Explorer renders layer sidebar", async ({ page }) => {
    await page.goto("/graph");
    await expect(page.locator("text=Layers").first()).toBeVisible({
      timeout: TIMEOUT,
    });
  });

  test("Dataset Catalog renders heading", async ({ page }) => {
    await page.goto("/catalog");
    await expect(
      page.locator("h1", { hasText: "Dataset Catalog" }),
    ).toBeVisible({ timeout: TIMEOUT });
  });

  test("Patient Journey renders heading", async ({ page }) => {
    await page.goto("/patient");
    await expect(
      page.locator("h1", { hasText: "Patient Journey" }),
    ).toBeVisible({ timeout: TIMEOUT });
  });

  test("OMOP Analytics renders heading", async ({ page }) => {
    await page.goto("/analytics");
    await expect(
      page.locator("h1", { hasText: "OMOP Research Analytics" }),
    ).toBeVisible({ timeout: TIMEOUT });
  });

  test("EEHRxF Profile Alignment renders heading", async ({ page }) => {
    await page.goto("/eehrxf");
    await expect(
      page.locator("h1", { hasText: "EEHRxF Profile Alignment" }),
    ).toBeVisible({ timeout: TIMEOUT });
  });
});

/* ── Protected pages redirect to sign-in ──────────────────────── */

test.describe("Protected Pages (redirect to sign-in)", () => {
  test("Compliance redirects unauthenticated users", async ({ page }) => {
    await page.goto("/compliance");
    await expect(page).toHaveURL(/signin/, { timeout: TIMEOUT });
  });

  test("Credentials redirects unauthenticated users", async ({ page }) => {
    await page.goto("/credentials");
    await expect(page).toHaveURL(/signin/, { timeout: TIMEOUT });
  });

  test("Discover Data redirects unauthenticated users", async ({ page }) => {
    await page.goto("/data/discover");
    await expect(page).toHaveURL(/signin/, { timeout: TIMEOUT });
  });

  test("Contract Negotiation redirects unauthenticated users", async ({
    page,
  }) => {
    await page.goto("/negotiate");
    await expect(page).toHaveURL(/signin/, { timeout: TIMEOUT });
  });

  test("Admin Dashboard redirects unauthenticated users", async ({ page }) => {
    await page.goto("/admin");
    await expect(page).toHaveURL(/signin/, { timeout: TIMEOUT });
  });

  test("Onboarding redirects unauthenticated users", async ({ page }) => {
    await page.goto("/onboarding");
    await expect(page).toHaveURL(/signin/, { timeout: TIMEOUT });
  });

  test("Settings redirects unauthenticated users", async ({ page }) => {
    await page.goto("/settings");
    await expect(page).toHaveURL(/signin/, { timeout: TIMEOUT });
  });
});

/* ── Public Documentation pages ───────────────────────────────── */

test.describe("Documentation Pages (public)", () => {
  test("Docs overview renders heading", async ({ page }) => {
    await page.goto("/docs");
    await expect(page.locator("h1", { hasText: "Documentation" })).toBeVisible({
      timeout: TIMEOUT,
    });
  });

  test("Architecture page renders heading", async ({ page }) => {
    await page.goto("/docs/architecture");
    await expect(page.locator("h1", { hasText: "Architecture" })).toBeVisible({
      timeout: TIMEOUT,
    });
  });

  test("Developer Guide renders heading", async ({ page }) => {
    await page.goto("/docs/developer");
    await expect(
      page.locator("h1", { hasText: "Developer Guide" }),
    ).toBeVisible({ timeout: TIMEOUT });
  });

  test("User Guide renders heading", async ({ page }) => {
    await page.goto("/docs/user-guide");
    await expect(page.locator("h1", { hasText: "User Guide" })).toBeVisible({
      timeout: TIMEOUT,
    });
  });
});

import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright E2E test configuration for the Health Dataspace UI.
 *
 * Usage:
 *   npx playwright test                      # default: dev server on :3000
 *   npx playwright test --project=live       # live JAD stack on :3003
 *   PLAYWRIGHT_BASE_URL=http://localhost:3003 npx playwright test
 *
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: "./__tests__/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ["html", { open: "never" }],
    ["./__tests__/e2e/ehds-reporter.ts"],
    ...(process.env.CI ? [["line"] as ["line"]] : []),
  ],
  timeout: 30_000,

  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "on",
    video: "on-first-retry",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "live",
      use: {
        ...devices["Desktop Chrome"],
        baseURL: "http://localhost:3003",
      },
    },
  ],

  /* Start the local dev server before running tests (skipped for 'live' project) */
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: process.env.CI ? "npm run start" : "npm run dev",
        url: "http://localhost:3000",
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});

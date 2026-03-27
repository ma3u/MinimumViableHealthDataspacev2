/**
 * Screenshot capture spec — run against localhost:3003 to update user-guide images.
 *
 * Usage:
 *   PLAYWRIGHT_BASE_URL=http://localhost:3003 npx playwright test capture-screenshots --project=live
 *
 * Saves PNG files to public/images/screenshots/
 */
import { test } from "@playwright/test";
import path from "path";

const SS = path.resolve(__dirname, "../../public/images/screenshots");
const T = 10_000;

async function shot(
  page: Parameters<typeof test>[1] extends (
    f: (page: infer P, ...a: never[]) => unknown,
  ) => unknown
    ? P
    : never,
  filename: string,
) {
  await page.screenshot({
    path: `${SS}/${filename}`,
    fullPage: false,
  });
}

test.describe("Screenshot capture (run against localhost:3003)", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("signin-persona-cards", async ({ page }) => {
    await page.goto("/auth/signin", { waitUntil: "networkidle" });
    await page.waitForTimeout(800);
    await shot(page, "ehds-signin-persona-cards.png");
  });

  test("home-dashboard", async ({ page }) => {
    await page.goto("/", { waitUntil: "networkidle" });
    await page.waitForTimeout(800);
    await shot(page, "ehds-health-dataspace-home-dashboard.png");
  });

  test("graph-explorer-default", async ({ page }) => {
    await page.goto("/graph", { waitUntil: "networkidle" });
    await page.waitForTimeout(2000);
    await shot(page, "neo4j-health-dataspace-graph-explorer.png");
  });

  test("graph-explorer-persona-selector", async ({ page }) => {
    await page.goto("/graph", { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);
    await shot(page, "graph-explorer-persona-selector.png");
  });

  test("graph-hospital-persona", async ({ page }) => {
    await page.goto("/graph?persona=hospital", { waitUntil: "networkidle" });
    await page.waitForTimeout(2000);
    await shot(page, "graph-explorer-hospital-persona.png");
  });

  test("graph-researcher-persona", async ({ page }) => {
    await page.goto("/graph?persona=researcher", { waitUntil: "networkidle" });
    await page.waitForTimeout(2000);
    await shot(page, "graph-explorer-researcher-persona.png");
  });

  test("graph-trust-center-persona", async ({ page }) => {
    await page.goto("/graph?persona=trust-center", {
      waitUntil: "networkidle",
    });
    await page.waitForTimeout(2000);
    await shot(page, "graph-explorer-trust-center-persona.png");
  });

  test("graph-hdab-persona", async ({ page }) => {
    await page.goto("/graph?persona=hdab", { waitUntil: "networkidle" });
    await page.waitForTimeout(2000);
    await shot(page, "graph-explorer-hdab-persona.png");
  });

  test("graph-edc-admin-persona", async ({ page }) => {
    await page.goto("/graph?persona=edc-admin", { waitUntil: "networkidle" });
    await page.waitForTimeout(2000);
    await shot(page, "graph-explorer-edc-admin-persona.png");
  });

  test("catalog-browser", async ({ page }) => {
    await page.goto("/catalog", { waitUntil: "networkidle" });
    await page.waitForTimeout(T);
    await shot(page, "ehds-fhir-dataset-catalog-browser.png");
  });

  test("user-guide-page", async ({ page }) => {
    await page.goto("/docs/user-guide", { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);
    await shot(page, "ehds-user-guide-overview.png");
  });
});

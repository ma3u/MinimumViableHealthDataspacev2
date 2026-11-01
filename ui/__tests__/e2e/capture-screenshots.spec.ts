/**
 * Screenshot capture spec — run against localhost:3003 to update user-guide images.
 *
 * Usage:
 *   PLAYWRIGHT_BASE_URL=http://localhost:3003 npx playwright test capture-screenshots --project=live
 *
 * Saves PNG files to public/images/screenshots/
 *
 * In another language (ADR-071): SCREENSHOT_LANG=de (or fr, nl, es) opens
 * every page with ?lang=de and saves into public/images/screenshots/de/,
 * where scripts/gen-localized-images.py finds the variants for the docs.
 * Unset, it is English into the folder itself, as before.
 */
import { test } from "@playwright/test";
import path from "path";
import { signInOrSkip } from "./helpers/forged-session";
import { screenshotLang, withLang } from "./helpers/screenshot-lang";

const LANG = screenshotLang();
const SS = path.resolve(
  __dirname,
  "../../public/images/screenshots",
  ...(LANG ? [LANG] : []),
);
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

test.describe(`Screenshot capture (run against localhost:3003)${
  LANG ? `, ${LANG}` : ""
}`, () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("signin-persona-cards", async ({ page }) => {
    await page.goto(withLang("/auth/signin", LANG), {
      waitUntil: "networkidle",
    });
    await page.waitForTimeout(800);
    await shot(page, "ehds-signin-persona-cards.png");
  });

  test("home-dashboard", async ({ page }) => {
    await page.goto(withLang("/", LANG), { waitUntil: "networkidle" });
    await page.waitForTimeout(800);
    await shot(page, "ehds-health-dataspace-home-dashboard.png");
  });

  test("graph-explorer-neo4j", async ({ page }) => {
    // Every API route needs a session since #404 (ADR-044).
    await signInOrSkip(page, test.skip);
    await page.goto(withLang("/graph", LANG), { waitUntil: "networkidle" });
    await page.waitForTimeout(2000);
    await shot(page, "neo4j-health-dataspace-graph-explorer.png");
  });

  test("graph-explorer-default", async ({ page }) => {
    // Every API route needs a session since #404 (ADR-044).
    await signInOrSkip(page, test.skip);
    await page.goto(withLang("/graph", LANG), { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);
    await shot(page, "graph-explorer-default.png");
  });

  test("graph-hospital-persona", async ({ page }) => {
    // Every API route needs a session since #404 (ADR-044).
    await signInOrSkip(page, test.skip);
    await page.goto(withLang("/graph?persona=hospital", LANG), {
      waitUntil: "networkidle",
    });
    await page.waitForTimeout(2000);
    await shot(page, "graph-explorer-hospital-persona.png");
  });

  test("graph-researcher-persona", async ({ page }) => {
    // Every API route needs a session since #404 (ADR-044).
    await signInOrSkip(page, test.skip);
    await page.goto(withLang("/graph?persona=researcher", LANG), {
      waitUntil: "networkidle",
    });
    await page.waitForTimeout(2000);
    await shot(page, "graph-explorer-researcher-persona.png");
  });

  test("graph-trust-center-persona", async ({ page }) => {
    // Every API route needs a session since #404 (ADR-044).
    await signInOrSkip(page, test.skip);
    await page.goto(withLang("/graph?persona=trust-center", LANG), {
      waitUntil: "networkidle",
    });
    await page.waitForTimeout(2000);
    await shot(page, "graph-explorer-trust-center-persona.png");
  });

  test("graph-hdab-persona", async ({ page }) => {
    // Every API route needs a session since #404 (ADR-044).
    await signInOrSkip(page, test.skip);
    await page.goto(withLang("/graph?persona=hdab", LANG), {
      waitUntil: "networkidle",
    });
    await page.waitForTimeout(2000);
    await shot(page, "graph-explorer-hdab-persona.png");
  });

  test("graph-edc-admin-persona", async ({ page }) => {
    // Every API route needs a session since #404 (ADR-044).
    await signInOrSkip(page, test.skip);
    await page.goto(withLang("/graph?persona=edc-admin", LANG), {
      waitUntil: "networkidle",
    });
    await page.waitForTimeout(2000);
    await shot(page, "graph-explorer-edc-admin-persona.png");
  });

  test("catalog-browser", async ({ page }) => {
    // /catalog, /analytics, /query, /eehrxf and /tasks need a session since #404.
    await signInOrSkip(page, test.skip);
    await page.goto(withLang("/catalog", LANG), { waitUntil: "networkidle" });
    await page.waitForTimeout(T);
    await shot(page, "ehds-fhir-dataset-catalog-browser.png");
  });

  test("user-guide-page", async ({ page }) => {
    await page.goto(withLang("/docs/user-guide", LANG), {
      waitUntil: "networkidle",
    });
    await page.waitForTimeout(1500);
    await shot(page, "ehds-user-guide-overview.png");
  });
});

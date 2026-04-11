/**
 * Phase 25: Persona Page Journeys — E2E Tests
 *
 * 60 test cases (J420–J479) covering:
 *   A. Public pages — catalog, graph, analytics, query, eehrxf (J420–J429) — 10 tests
 *   B. Graph Explorer personas (J430–J439)                                 — 10 tests
 *   C. NLQ Query Page functionality (J440–J449)                           — 10 tests
 *   D. Protected page redirects — compliance, credentials, patient (J450–J459) — 10 tests
 *   E. Page stability — no client-side errors (J460–J469)                 — 10 tests
 *   F. Content integrity checks (J470–J479)                               — 10 tests
 *
 * Journey maps: docs/persona-journeys.md
 *
 * Tests run against dev server (localhost:3000) without Keycloak auth.
 * Protected pages verify redirect to sign-in.
 * For persona-specific nav group tests, see 19-static-github-pages.spec.ts.
 */
import { test, expect } from "@playwright/test";
import { T, expectHeading, waitForDataLoad } from "./helpers";

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

/* ======================================================================
   A. Public Page Accessibility (J420–J429)
   ====================================================================== */

test.describe("A - Public Page Accessibility", () => {
  test("J420 Catalog page loads with heading", async ({ page }) => {
    await page.goto(`${BASE}/catalog`, { waitUntil: "domcontentloaded" });
    await expectHeading(page, "Catalog");
  });

  test("J421 Catalog displays dataset cards", async ({ page }) => {
    await page.goto(`${BASE}/catalog`, { waitUntil: "domcontentloaded" });
    await waitForDataLoad(page);
    const cards = page.locator("article, [class*='card'], [class*='Card']");
    await expect(cards.first()).toBeVisible({ timeout: T });
  });

  test("J422 Catalog cards have title text", async ({ page }) => {
    await page.goto(`${BASE}/catalog`, { waitUntil: "domcontentloaded" });
    await waitForDataLoad(page);
    const headings = page.locator("h2, h3, [class*='title']");
    const count = await headings.count();
    expect(count).toBeGreaterThan(0);
  });

  test("J423 Graph Explorer page loads", async ({ page }) => {
    await page.goto(`${BASE}/graph`, { waitUntil: "domcontentloaded" });
    await expect(
      page.locator("h1, h2, h3", { hasText: /graph/i }).first(),
    ).toBeVisible({ timeout: T });
  });

  test("J424 Analytics page loads with heading", async ({ page }) => {
    await page.goto(`${BASE}/analytics`, { waitUntil: "domcontentloaded" });
    await expect(
      page.locator("h1, h2", { hasText: /analytics/i }).first(),
    ).toBeVisible({ timeout: T });
  });

  test("J425 Query page loads with heading", async ({ page }) => {
    await page.goto(`${BASE}/query`, { waitUntil: "domcontentloaded" });
    await expect(
      page.locator("h1, h2", { hasText: /query|natural language/i }).first(),
    ).toBeVisible({ timeout: T });
  });

  test("J426 EEHRxF Profiles page loads", async ({ page }) => {
    await page.goto(`${BASE}/eehrxf`, { waitUntil: "domcontentloaded" });
    await expect(
      page.locator("h1, h2", { hasText: /eehrxf|profile/i }).first(),
    ).toBeVisible({ timeout: T });
  });

  test("J427 Patient Journey index page loads (public)", async ({ page }) => {
    await page.goto(`${BASE}/patient`, { waitUntil: "domcontentloaded" });
    await expect(
      page.locator("h1, h2", { hasText: /patient/i }).first(),
    ).toBeVisible({ timeout: T });
  });

  test("J428 Demo page loads with persona selector", async ({ page }) => {
    await page.goto(`${BASE}/demo`, { waitUntil: "domcontentloaded" });
    // Demo page might redirect to sign-in or show persona cards
    const signinOrDemo = page.locator("h1, h2", {
      hasText: /demo|persona|sign.in|login/i,
    });
    await expect(signinOrDemo.first()).toBeVisible({ timeout: T });
  });

  test("J429 Docs page loads", async ({ page }) => {
    await page.goto(`${BASE}/docs`, { waitUntil: "domcontentloaded" });
    await expect(
      page.locator("h1, h2", { hasText: /doc|architecture|overview/i }).first(),
    ).toBeVisible({ timeout: T });
  });
});

/* ======================================================================
   B. Graph Explorer Persona Views (J430–J439)
   ====================================================================== */

test.describe("B - Graph Explorer Persona Views", () => {
  test("J430 Graph Explorer renders canvas or SVG", async ({ page }) => {
    await page.goto(`${BASE}/graph`, { waitUntil: "domcontentloaded" });
    await waitForDataLoad(page);
    const graphEl = page.locator("canvas, svg, [data-testid*='graph']");
    await expect(graphEl.first()).toBeVisible({ timeout: T });
  });

  test("J431 Graph with hospital persona loads graph visualization", async ({
    page,
  }) => {
    await page.goto(`${BASE}/graph?persona=hospital`, {
      waitUntil: "domcontentloaded",
    });
    await waitForDataLoad(page);
    const graphEl = page.locator("canvas, svg, [data-testid*='graph']");
    await expect(graphEl.first()).toBeVisible({ timeout: T });
  });

  test("J432 Graph with researcher persona loads", async ({ page }) => {
    await page.goto(`${BASE}/graph?persona=researcher`, {
      waitUntil: "domcontentloaded",
    });
    await waitForDataLoad(page);
    const graphEl = page.locator("canvas, svg, [data-testid*='graph']");
    await expect(graphEl.first()).toBeVisible({ timeout: T });
  });

  test("J433 Graph with hdab persona loads", async ({ page }) => {
    await page.goto(`${BASE}/graph?persona=hdab`, {
      waitUntil: "domcontentloaded",
    });
    await waitForDataLoad(page);
    const graphEl = page.locator("canvas, svg, [data-testid*='graph']");
    await expect(graphEl.first()).toBeVisible({ timeout: T });
  });

  test("J434 Graph with trust-center persona loads", async ({ page }) => {
    await page.goto(`${BASE}/graph?persona=trust-center`, {
      waitUntil: "domcontentloaded",
    });
    await waitForDataLoad(page);
    const graphEl = page.locator("canvas, svg, [data-testid*='graph']");
    await expect(graphEl.first()).toBeVisible({ timeout: T });
  });

  test("J435 Graph with edc-admin persona loads", async ({ page }) => {
    await page.goto(`${BASE}/graph?persona=edc-admin`, {
      waitUntil: "domcontentloaded",
    });
    await waitForDataLoad(page);
    const graphEl = page.locator("canvas, svg, [data-testid*='graph']");
    await expect(graphEl.first()).toBeVisible({ timeout: T });
  });

  test("J436 Graph with patient persona loads", async ({ page }) => {
    await page.goto(`${BASE}/graph?persona=patient`, {
      waitUntil: "domcontentloaded",
    });
    await waitForDataLoad(page);
    const graphEl = page.locator("canvas, svg, [data-testid*='graph']");
    await expect(graphEl.first()).toBeVisible({ timeout: T });
  });

  test("J437 Graph Explorer has no broken images", async ({ page }) => {
    await page.goto(`${BASE}/graph`, { waitUntil: "domcontentloaded" });
    await waitForDataLoad(page);
    const brokenImages = await page.evaluate(() =>
      [...document.images].filter(
        (img) => !img.complete || img.naturalWidth === 0,
      ),
    );
    expect(brokenImages).toHaveLength(0);
  });

  test("J438 Graph Explorer shows layer legend or sidebar", async ({
    page,
  }) => {
    await page.goto(`${BASE}/graph`, { waitUntil: "domcontentloaded" });
    await waitForDataLoad(page);
    // Graph should have sidebar or legend with layer information
    const sidebarOrLegend = page.locator(
      "[class*='sidebar'], [class*='legend'], [class*='panel'], [class*='filter']",
    );
    const count = await sidebarOrLegend.count();
    expect(count).toBeGreaterThan(0);
  });

  test("J439 Graph Explorer default view loads nodes", async ({ page }) => {
    await page.goto(`${BASE}/graph`, { waitUntil: "domcontentloaded" });
    await waitForDataLoad(page);
    // Should show node count or have visible graph content
    const graphContent = page.locator("canvas, svg");
    await expect(graphContent.first()).toBeVisible({ timeout: T });
  });
});

/* ======================================================================
   C. NLQ Query Page Functionality (J440–J449)
   ====================================================================== */

test.describe("C - NLQ Query Page", () => {
  test("J440 Query page has search input field", async ({ page }) => {
    await page.goto(`${BASE}/query`, { waitUntil: "domcontentloaded" });
    const input = page.locator(
      "input[type='text'], input[type='search'], textarea",
    );
    await expect(input.first()).toBeVisible({ timeout: T });
  });

  test("J441 Query page shows example query buttons", async ({ page }) => {
    await page.goto(`${BASE}/query`, { waitUntil: "domcontentloaded" });
    await waitForDataLoad(page);
    const examples = page.locator("button", {
      hasText: /patient|condition|diabetes|hypertension|sinusitis/i,
    });
    const count = await examples.count();
    expect(count).toBeGreaterThan(0);
  });

  test("J442 Clicking example query fills search input", async ({ page }) => {
    await page.goto(`${BASE}/query`, { waitUntil: "domcontentloaded" });
    await waitForDataLoad(page);
    const exampleBtn = page.locator("button", { hasText: /patient/i }).first();
    if ((await exampleBtn.count()) > 0) {
      await exampleBtn.click();
      const input = page
        .locator("input[type='text'], input[type='search'], textarea")
        .first();
      const value = await input.inputValue();
      expect(value.length).toBeGreaterThan(0);
    }
  });

  test("J443 Query page has send/submit button", async ({ page }) => {
    await page.goto(`${BASE}/query`, { waitUntil: "domcontentloaded" });
    const submitBtn = page.locator("button[type='submit'], button:has(svg)");
    const count = await submitBtn.count();
    expect(count).toBeGreaterThan(0);
  });

  test("J444 Query page shows available templates section", async ({
    page,
  }) => {
    await page.goto(`${BASE}/query`, { waitUntil: "domcontentloaded" });
    await waitForDataLoad(page);
    const templateContent = page.locator(
      "text=/template|patient count|conditions|gender/i",
    );
    const count = await templateContent.count();
    expect(count).toBeGreaterThan(0);
  });

  test("J445 Query page has no broken images", async ({ page }) => {
    await page.goto(`${BASE}/query`, { waitUntil: "domcontentloaded" });
    await waitForDataLoad(page);
    const brokenImages = await page.evaluate(() =>
      [...document.images].filter(
        (img) => !img.complete || img.naturalWidth === 0,
      ),
    );
    expect(brokenImages).toHaveLength(0);
  });

  test("J446 Query page loads without page errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    await page.goto(`${BASE}/query`, { waitUntil: "domcontentloaded" });
    await waitForDataLoad(page);
    expect(errors).toHaveLength(0);
  });

  test("J447 Analytics page has data visualizations", async ({ page }) => {
    await page.goto(`${BASE}/analytics`, { waitUntil: "domcontentloaded" });
    await waitForDataLoad(page);
    const visuals = page.locator("canvas, svg, [class*='chart']");
    const count = await visuals.count();
    expect(count).toBeGreaterThan(0);
  });

  test("J448 Analytics page renders without console errors", async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    await page.goto(`${BASE}/analytics`, { waitUntil: "domcontentloaded" });
    await waitForDataLoad(page);
    expect(errors).toHaveLength(0);
  });

  test("J449 Catalog page has search or filter capability", async ({
    page,
  }) => {
    await page.goto(`${BASE}/catalog`, { waitUntil: "domcontentloaded" });
    await waitForDataLoad(page);
    const searchOrFilter = page.locator(
      "input, [class*='search'], [class*='filter'], select",
    );
    const count = await searchOrFilter.count();
    expect(count).toBeGreaterThan(0);
  });
});

/* ======================================================================
   D. Protected Page Auth Redirects (J450–J459)
   ====================================================================== */

test.describe("D - Protected Page Auth Redirects", () => {
  test("J450 /compliance redirects unauthenticated user to sign-in", async ({
    page,
  }) => {
    await page.goto(`${BASE}/compliance`, { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/signin/, { timeout: T });
  });

  test("J451 /credentials redirects unauthenticated user to sign-in", async ({
    page,
  }) => {
    await page.goto(`${BASE}/credentials`, { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/signin/, { timeout: T });
  });

  test("J452 /patient/profile redirects unauthenticated user to sign-in", async ({
    page,
  }) => {
    await page.goto(`${BASE}/patient/profile`, {
      waitUntil: "domcontentloaded",
    });
    await expect(page).toHaveURL(/signin/, { timeout: T });
  });

  test("J453 /patient/research redirects unauthenticated user to sign-in", async ({
    page,
  }) => {
    await page.goto(`${BASE}/patient/research`, {
      waitUntil: "domcontentloaded",
    });
    await expect(page).toHaveURL(/signin/, { timeout: T });
  });

  test("J454 /patient/insights redirects unauthenticated user to sign-in", async ({
    page,
  }) => {
    await page.goto(`${BASE}/patient/insights`, {
      waitUntil: "domcontentloaded",
    });
    await expect(page).toHaveURL(/signin/, { timeout: T });
  });

  test("J455 /admin redirects unauthenticated user to sign-in", async ({
    page,
  }) => {
    await page.goto(`${BASE}/admin`, { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/signin/, { timeout: T });
  });

  test("J456 /data/discover redirects unauthenticated user to sign-in", async ({
    page,
  }) => {
    await page.goto(`${BASE}/data/discover`, {
      waitUntil: "domcontentloaded",
    });
    await expect(page).toHaveURL(/signin/, { timeout: T });
  });

  test("J457 /negotiate redirects unauthenticated user to sign-in", async ({
    page,
  }) => {
    await page.goto(`${BASE}/negotiate`, { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/signin/, { timeout: T });
  });

  test("J458 /settings redirects unauthenticated user to sign-in", async ({
    page,
  }) => {
    await page.goto(`${BASE}/settings`, { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/signin/, { timeout: T });
  });

  test("J459 Sign-in page shows demo persona section", async ({ page }) => {
    await page.goto(`${BASE}/auth/signin`, { waitUntil: "domcontentloaded" });
    // Sign-in page shows "Demo users" section
    const demoSection = page.locator("text=/demo users/i");
    await expect(demoSection.first()).toBeVisible({ timeout: T });
  });
});

/* ======================================================================
   E. Page Stability — No Client Errors (J460–J469)
   ====================================================================== */

test.describe("E - Page Stability", () => {
  const publicPages = [
    { name: "Home", path: "/" },
    { name: "Graph", path: "/graph" },
    { name: "Catalog", path: "/catalog" },
    { name: "Analytics", path: "/analytics" },
    { name: "Query", path: "/query" },
    { name: "EEHRxF", path: "/eehrxf" },
    { name: "Patient", path: "/patient" },
    { name: "Docs", path: "/docs" },
  ];

  for (const { name, path } of publicPages) {
    test(`J46${publicPages.indexOf({
      name,
      path,
    })} ${name} page loads without page errors`, async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (err) => errors.push(err.message));
      await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
      await waitForDataLoad(page);
      expect(errors).toHaveLength(0);
    });
  }

  test("J468 No broken images on Graph page", async ({ page }) => {
    await page.goto(`${BASE}/graph`, { waitUntil: "domcontentloaded" });
    await waitForDataLoad(page);
    const brokenImages = await page.evaluate(() =>
      [...document.images].filter(
        (img) => !img.complete || img.naturalWidth === 0,
      ),
    );
    expect(brokenImages).toHaveLength(0);
  });

  test("J469 No broken images on Catalog page", async ({ page }) => {
    await page.goto(`${BASE}/catalog`, { waitUntil: "domcontentloaded" });
    await waitForDataLoad(page);
    const brokenImages = await page.evaluate(() =>
      [...document.images].filter(
        (img) => !img.complete || img.naturalWidth === 0,
      ),
    );
    expect(brokenImages).toHaveLength(0);
  });
});

/* ======================================================================
   F. Content Integrity Checks (J470–J479)
   ====================================================================== */

test.describe("F - Content Integrity", () => {
  test("J470 Catalog shows HealthDCAT-AP dataset metadata", async ({
    page,
  }) => {
    await page.goto(`${BASE}/catalog`, { waitUntil: "domcontentloaded" });
    await waitForDataLoad(page);
    // Dataset cards should contain metadata text
    const metadata = page.locator("text=/dataset|license|publisher|format/i");
    const count = await metadata.count();
    expect(count).toBeGreaterThan(0);
  });

  test("J471 Analytics shows OMOP-related content", async ({ page }) => {
    await page.goto(`${BASE}/analytics`, { waitUntil: "domcontentloaded" });
    await waitForDataLoad(page);
    const omopContent = page.locator(
      "text=/omop|cohort|condition|person|analytics/i",
    );
    const count = await omopContent.count();
    expect(count).toBeGreaterThan(0);
  });

  test("J472 EEHRxF page shows EU profile content", async ({ page }) => {
    await page.goto(`${BASE}/eehrxf`, { waitUntil: "domcontentloaded" });
    await waitForDataLoad(page);
    const eehrxfContent = page.locator(
      "text=/eehrxf|fhir|profile|resource|category/i",
    );
    const count = await eehrxfContent.count();
    expect(count).toBeGreaterThan(0);
  });

  test("J473 Patient index page shows journey-related content", async ({
    page,
  }) => {
    await page.goto(`${BASE}/patient`, { waitUntil: "domcontentloaded" });
    await waitForDataLoad(page);
    const content = page.locator(
      "text=/patient|timeline|condition|observation|journey/i",
    );
    const count = await content.count();
    expect(count).toBeGreaterThan(0);
  });

  test("J474 Graph Explorer shows node counts or statistics", async ({
    page,
  }) => {
    await page.goto(`${BASE}/graph`, { waitUntil: "domcontentloaded" });
    await waitForDataLoad(page);
    // Graph should display node/edge counts or layer info
    const stats = page.locator("text=/node|edge|layer|participant|patient/i");
    const count = await stats.count();
    expect(count).toBeGreaterThan(0);
  });

  test("J475 Home page has navigation with expected groups", async ({
    page,
  }) => {
    await page.goto(BASE, { waitUntil: "domcontentloaded" });
    const nav = page.locator("nav");
    // Without auth, should show at least Explore and Docs
    await expect(nav.getByRole("button", { name: /explore/i })).toBeVisible({
      timeout: T,
    });
    await expect(nav.getByRole("button", { name: /docs/i })).toBeVisible({
      timeout: T,
    });
  });

  test("J476 Home page has Sign in button for unauthenticated user", async ({
    page,
  }) => {
    await page.goto(BASE, { waitUntil: "domcontentloaded" });
    const signInBtn = page.locator("button, a", { hasText: /sign in/i });
    await expect(signInBtn.first()).toBeVisible({ timeout: T });
  });

  test("J477 Docs page shows architecture documentation", async ({ page }) => {
    await page.goto(`${BASE}/docs`, { waitUntil: "domcontentloaded" });
    await waitForDataLoad(page);
    const docContent = page.locator(
      "text=/architecture|layer|neo4j|fhir|omop|ehds/i",
    );
    const count = await docContent.count();
    expect(count).toBeGreaterThan(0);
  });

  test("J478 Sign-in page shows Keycloak button", async ({ page }) => {
    await page.goto(`${BASE}/auth/signin`, { waitUntil: "domcontentloaded" });
    const keycloakBtn = page.locator("button", {
      hasText: /sign in with keycloak/i,
    });
    await expect(keycloakBtn).toBeVisible({ timeout: T });
  });

  test("J479 Sign-in page shows all 7 demo persona cards", async ({ page }) => {
    await page.goto(`${BASE}/auth/signin`, { waitUntil: "domcontentloaded" });
    // Each persona username appears as text within a button card
    const personas = [
      "edcadmin",
      "clinicuser",
      "researcher",
      "regulator",
      "lmcuser",
      "patient1",
      "patient2",
    ];
    for (const persona of personas) {
      await expect(page.locator(`text=${persona}`).first()).toBeVisible({
        timeout: T,
      });
    }
  });
});

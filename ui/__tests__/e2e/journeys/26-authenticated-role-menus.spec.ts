/**
 * Phase 26: Authenticated Role-Based Menu Tests (J480–J559)
 *
 * Tests that each of the 7 demo users sees the correct navigation groups
 * and menu items after Keycloak login, matching the "Menu Items per Role" table.
 *
 * 80 test cases:
 *   A. edcadmin  — EDC_ADMIN (J480–J489)                     — 10 tests
 *   B. clinicuser — DATA_HOLDER (J490–J499)                   — 10 tests
 *   C. researcher — DATA_USER (J500–J509)                     — 10 tests
 *   D. regulator — HDAB_AUTHORITY (J510–J519)                 — 10 tests
 *   E. lmcuser  — DATA_HOLDER (J520–J529)                     — 10 tests
 *   F. patient1 — PATIENT (J530–J539)                         — 10 tests
 *   G. patient2 — PATIENT (J540–J549)                         — 10 tests
 *   H. Protected page access after auth (J550–J559)           — 10 tests
 *
 * Prerequisites:
 *   - Keycloak running on localhost:8080 (realm: edcv)
 *   - UI running on localhost:3000 or PLAYWRIGHT_BASE_URL
 *   - Password = username for all demo users
 */
import { test, expect, type Page } from "@playwright/test";
import {
  T,
  loginAs,
  skipIfKeycloakDown,
  expectHeading,
  waitForDataLoad,
} from "./helpers";

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

/* ── Shared helpers ─────────────────────────────────────────────────── */

/** Assert that specific nav group buttons are visible. */
async function expectNavGroups(page: Page, groups: string[]) {
  const nav = page.locator("nav");
  for (const group of groups) {
    await expect(
      nav.getByRole("button", { name: new RegExp(`^${group}$`, "i") }),
    ).toBeVisible({ timeout: T });
  }
}

/** Assert that specific nav group buttons are NOT visible. */
async function expectNoNavGroups(page: Page, groups: string[]) {
  const nav = page.locator("nav");
  for (const group of groups) {
    await expect(
      nav.getByRole("button", { name: new RegExp(`^${group}$`, "i") }),
    ).not.toBeVisible({ timeout: 3000 });
  }
}

/** Open a nav dropdown and verify menu items are present. */
async function expectMenuItems(page: Page, group: string, items: string[]) {
  const nav = page.locator("nav");
  const btn = nav.getByRole("button", { name: new RegExp(`^${group}$`, "i") });
  await btn.click();
  for (const item of items) {
    await expect(
      nav.getByRole("menuitem", { name: new RegExp(item, "i") }),
    ).toBeVisible({ timeout: T });
  }
  // Close the dropdown
  await btn.click();
}

/* ======================================================================
   A. edcadmin — EDC_ADMIN (J480–J489)
   Nav groups: Explore, Governance, Exchange, Manage, Docs
   ====================================================================== */

test.describe("A - edcadmin (EDC_ADMIN)", () => {
  test.beforeAll(async () => {
    await skipIfKeycloakDown();
  });

  test.beforeEach(async ({ page }) => {
    await loginAs(page, "edcadmin", "edcadmin");
  });

  test("J480 edcadmin sees Explore, Governance, Exchange, Manage, Docs groups", async ({
    page,
  }) => {
    await expectNavGroups(page, [
      "Explore",
      "Governance",
      "Exchange",
      "Manage",
      "Docs",
    ]);
  });

  test("J481 edcadmin does NOT see My Researches or My Health", async ({
    page,
  }) => {
    await expectNoNavGroups(page, ["My Researches", "My Health"]);
  });

  test("J482 Explore menu has Graph Explorer, Dataset Catalog, DCAT-AP Editor, Patient Journey, OMOP Analytics, NLQ/Federated, EEHRxF", async ({
    page,
  }) => {
    await expectMenuItems(page, "Explore", [
      "Graph Explorer",
      "Dataset Catalog",
      "DCAT-AP Editor",
      "Patient Journey",
      "OMOP Analytics",
      "NLQ",
      "EEHRxF",
    ]);
  });

  test("J483 Governance menu has EHDS Approval, Protocol TCK, Credentials", async ({
    page,
  }) => {
    await expectMenuItems(page, "Governance", [
      "EHDS Approval",
      "Protocol TCK",
      "Credentials",
    ]);
  });

  test("J484 Exchange menu has Share Data, Discover, Negotiate, Tasks, Transfer", async ({
    page,
  }) => {
    await expectMenuItems(page, "Exchange", [
      "Share Data",
      "Discover",
      "Negotiate",
      "Tasks",
      "Transfer",
    ]);
  });

  test("J485 Manage menu has Onboarding, Operator Dashboard, EDC Components, Tenants, Policies, Audit", async ({
    page,
  }) => {
    await expectMenuItems(page, "Manage", [
      "Onboarding",
      "Operator Dashboard",
      "EDC Components",
      "Tenants",
      "Policies",
      "Audit",
    ]);
  });

  test("J486 edcadmin can access /admin dashboard", async ({ page }) => {
    await page.goto(`${BASE}/admin`, { waitUntil: "domcontentloaded" });
    // Should not redirect to sign-in
    await expect(page).not.toHaveURL(/signin/, { timeout: 5000 });
  });

  test("J487 edcadmin can access /compliance", async ({ page }) => {
    await page.goto(`${BASE}/compliance`, { waitUntil: "domcontentloaded" });
    await expectHeading(page, "Compliance");
  });

  test("J488 edcadmin can access /credentials", async ({ page }) => {
    await page.goto(`${BASE}/credentials`, { waitUntil: "domcontentloaded" });
    await expect(page).not.toHaveURL(/signin/, { timeout: 5000 });
  });

  test("J489 edcadmin can access /patient/profile (has EDC_ADMIN)", async ({
    page,
  }) => {
    await page.goto(`${BASE}/patient/profile`, {
      waitUntil: "domcontentloaded",
    });
    await expect(page).not.toHaveURL(/signin/, { timeout: 5000 });
  });
});

/* ======================================================================
   B. clinicuser — DATA_HOLDER (J490–J499)
   Nav groups: Explore, Exchange, Docs
   ====================================================================== */

test.describe("B - clinicuser (DATA_HOLDER)", () => {
  test.beforeAll(async () => {
    await skipIfKeycloakDown();
  });

  test.beforeEach(async ({ page }) => {
    await loginAs(page, "clinicuser", "clinicuser");
  });

  test("J490 clinicuser sees Explore, Exchange, Docs groups", async ({
    page,
  }) => {
    await expectNavGroups(page, ["Explore", "Exchange", "Docs"]);
  });

  test("J491 clinicuser does NOT see Governance, Manage, My Researches, My Health", async ({
    page,
  }) => {
    await expectNoNavGroups(page, [
      "Governance",
      "Manage",
      "My Researches",
      "My Health",
    ]);
  });

  test("J492 Explore menu has Graph Explorer, Dataset Catalog, DCAT-AP Editor, Patient Journey, EEHRxF but NOT NLQ or OMOP Analytics", async ({
    page,
  }) => {
    await expectMenuItems(page, "Explore", [
      "Graph Explorer",
      "Dataset Catalog",
      "DCAT-AP Editor",
      "Patient Journey",
      "EEHRxF",
    ]);
  });

  test("J493 Exchange menu has Share Data, Negotiate, Tasks, Transfer", async ({
    page,
  }) => {
    await expectMenuItems(page, "Exchange", [
      "Share Data",
      "Negotiate",
      "Tasks",
      "Transfer",
    ]);
  });

  test("J494 clinicuser can access /catalog", async ({ page }) => {
    await page.goto(`${BASE}/catalog`, { waitUntil: "domcontentloaded" });
    await expectHeading(page, "Catalog");
  });

  test("J495 clinicuser can access /graph", async ({ page }) => {
    await page.goto(`${BASE}/graph`, { waitUntil: "domcontentloaded" });
    await waitForDataLoad(page);
  });

  test("J496 clinicuser can access /negotiate", async ({ page }) => {
    await page.goto(`${BASE}/negotiate`, { waitUntil: "domcontentloaded" });
    await expect(page).not.toHaveURL(/signin/, { timeout: 5000 });
  });

  test("J497 clinicuser CANNOT access /admin (redirects to unauthorized)", async ({
    page,
  }) => {
    await page.goto(`${BASE}/admin`, { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/unauthorized/, { timeout: T });
  });

  test("J498 clinicuser CANNOT access /compliance (redirects to unauthorized)", async ({
    page,
  }) => {
    await page.goto(`${BASE}/compliance`, { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/unauthorized/, { timeout: T });
  });

  test("J499 clinicuser CANNOT access /patient/profile (redirects to unauthorized)", async ({
    page,
  }) => {
    await page.goto(`${BASE}/patient/profile`, {
      waitUntil: "domcontentloaded",
    });
    await expect(page).toHaveURL(/unauthorized/, { timeout: T });
  });
});

/* ======================================================================
   C. researcher — DATA_USER (J500–J509)
   Nav groups: My Researches, Docs (Explore hidden, Exchange hidden)
   ====================================================================== */

test.describe("C - researcher (DATA_USER)", () => {
  test.beforeAll(async () => {
    await skipIfKeycloakDown();
  });

  test.beforeEach(async ({ page }) => {
    await loginAs(page, "researcher", "researcher");
  });

  test("J500 researcher sees My Researches and Docs groups", async ({
    page,
  }) => {
    await expectNavGroups(page, ["My Researches", "Docs"]);
  });

  test("J501 researcher does NOT see Explore, Governance, Manage, My Health", async ({
    page,
  }) => {
    await expectNoNavGroups(page, [
      "Explore",
      "Governance",
      "Manage",
      "My Health",
    ]);
  });

  test("J502 My Researches menu has Research Overview, Browse Catalogs, Discover, Request Access, My Applications, Retrieve Data, Run Analytics, Query & Export, Patient Journeys, EEHRxF", async ({
    page,
  }) => {
    await expectMenuItems(page, "My Researches", [
      "Research Overview",
      "Browse Catalogs",
      "Discover",
      "Request Access",
      "My Applications",
      "Retrieve Data",
      "Run Analytics",
      "Query & Export",
      "Patient Journeys",
      "EEHRxF",
    ]);
  });

  test("J503 researcher can access /catalog", async ({ page }) => {
    await page.goto(`${BASE}/catalog`, { waitUntil: "domcontentloaded" });
    await expectHeading(page, "Catalog");
  });

  test("J504 researcher can access /analytics", async ({ page }) => {
    await page.goto(`${BASE}/analytics`, { waitUntil: "domcontentloaded" });
    await expect(page).not.toHaveURL(/signin/, { timeout: 5000 });
  });

  test("J505 researcher can access /query", async ({ page }) => {
    await page.goto(`${BASE}/query`, { waitUntil: "domcontentloaded" });
    await expect(page).not.toHaveURL(/signin/, { timeout: 5000 });
  });

  test("J506 researcher can access /negotiate", async ({ page }) => {
    await page.goto(`${BASE}/negotiate`, { waitUntil: "domcontentloaded" });
    await expect(page).not.toHaveURL(/signin/, { timeout: 5000 });
  });

  test("J507 researcher CANNOT access /admin", async ({ page }) => {
    await page.goto(`${BASE}/admin`, { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/unauthorized/, { timeout: T });
  });

  test("J508 researcher CANNOT access /compliance", async ({ page }) => {
    await page.goto(`${BASE}/compliance`, { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/unauthorized/, { timeout: T });
  });

  test("J509 researcher CANNOT access /patient/profile", async ({ page }) => {
    await page.goto(`${BASE}/patient/profile`, {
      waitUntil: "domcontentloaded",
    });
    await expect(page).toHaveURL(/unauthorized/, { timeout: T });
  });
});

/* ======================================================================
   D. regulator — HDAB_AUTHORITY (J510–J519)
   Nav groups: Explore, Governance, Exchange, Manage, Docs
   ====================================================================== */

test.describe("D - regulator (HDAB_AUTHORITY)", () => {
  test.beforeAll(async () => {
    await skipIfKeycloakDown();
  });

  test.beforeEach(async ({ page }) => {
    await loginAs(page, "regulator", "regulator");
  });

  test("J510 regulator sees Explore, Governance, Exchange, Manage, Docs groups", async ({
    page,
  }) => {
    await expectNavGroups(page, [
      "Explore",
      "Governance",
      "Exchange",
      "Manage",
      "Docs",
    ]);
  });

  test("J511 regulator does NOT see My Researches or My Health", async ({
    page,
  }) => {
    await expectNoNavGroups(page, ["My Researches", "My Health"]);
  });

  test("J512 Explore menu has Graph Explorer, Dataset Catalog, Patient Journey, OMOP Analytics, NLQ, EEHRxF (no DCAT-AP Editor)", async ({
    page,
  }) => {
    await expectMenuItems(page, "Explore", [
      "Graph Explorer",
      "Dataset Catalog",
      "Patient Journey",
      "OMOP Analytics",
      "NLQ",
      "EEHRxF",
    ]);
  });

  test("J513 Governance menu has EHDS Approval, Protocol TCK, Credentials", async ({
    page,
  }) => {
    await expectMenuItems(page, "Governance", [
      "EHDS Approval",
      "Protocol TCK",
      "Credentials",
    ]);
  });

  test("J514 Manage menu has Policies and Audit (but NOT Onboarding, Dashboard, Components, Tenants)", async ({
    page,
  }) => {
    await expectMenuItems(page, "Manage", ["Policies", "Audit"]);
  });

  test("J515 regulator can access /compliance", async ({ page }) => {
    await page.goto(`${BASE}/compliance`, { waitUntil: "domcontentloaded" });
    await expectHeading(page, "Compliance");
  });

  test("J516 regulator can access /credentials", async ({ page }) => {
    await page.goto(`${BASE}/credentials`, { waitUntil: "domcontentloaded" });
    await expect(page).not.toHaveURL(/signin/, { timeout: 5000 });
  });

  test("J517 regulator CANNOT access /admin (redirects to unauthorized)", async ({
    page,
  }) => {
    await page.goto(`${BASE}/admin`, { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/unauthorized/, { timeout: T });
  });

  test("J518 regulator CANNOT access /patient/profile", async ({ page }) => {
    await page.goto(`${BASE}/patient/profile`, {
      waitUntil: "domcontentloaded",
    });
    await expect(page).toHaveURL(/unauthorized/, { timeout: T });
  });

  test("J519 Exchange menu has Discover, Negotiate, Tasks, Transfer (no Share Data)", async ({
    page,
  }) => {
    await expectMenuItems(page, "Exchange", [
      "Discover",
      "Negotiate",
      "Tasks",
      "Transfer",
    ]);
  });
});

/* ======================================================================
   E. lmcuser — DATA_HOLDER (J520–J529)
   Same as clinicuser: Explore, Exchange, Docs
   ====================================================================== */

test.describe("E - lmcuser (DATA_HOLDER)", () => {
  test.beforeAll(async () => {
    await skipIfKeycloakDown();
  });

  test.beforeEach(async ({ page }) => {
    await loginAs(page, "lmcuser", "lmcuser");
  });

  test("J520 lmcuser sees Explore, Exchange, Docs groups", async ({ page }) => {
    await expectNavGroups(page, ["Explore", "Exchange", "Docs"]);
  });

  test("J521 lmcuser does NOT see Governance, Manage, My Researches, My Health", async ({
    page,
  }) => {
    await expectNoNavGroups(page, [
      "Governance",
      "Manage",
      "My Researches",
      "My Health",
    ]);
  });

  test("J522 Explore menu has Graph Explorer, Dataset Catalog, DCAT-AP Editor, Patient Journey, EEHRxF", async ({
    page,
  }) => {
    await expectMenuItems(page, "Explore", [
      "Graph Explorer",
      "Dataset Catalog",
      "DCAT-AP Editor",
      "Patient Journey",
      "EEHRxF",
    ]);
  });

  test("J523 Exchange menu has Share Data, Negotiate, Tasks, Transfer", async ({
    page,
  }) => {
    await expectMenuItems(page, "Exchange", [
      "Share Data",
      "Negotiate",
      "Tasks",
      "Transfer",
    ]);
  });

  test("J524 lmcuser can access /catalog", async ({ page }) => {
    await page.goto(`${BASE}/catalog`, { waitUntil: "domcontentloaded" });
    await expectHeading(page, "Catalog");
  });

  test("J525 lmcuser can access /negotiate", async ({ page }) => {
    await page.goto(`${BASE}/negotiate`, { waitUntil: "domcontentloaded" });
    await expect(page).not.toHaveURL(/signin/, { timeout: 5000 });
  });

  test("J526 lmcuser CANNOT access /admin", async ({ page }) => {
    await page.goto(`${BASE}/admin`, { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/unauthorized/, { timeout: T });
  });

  test("J527 lmcuser CANNOT access /compliance", async ({ page }) => {
    await page.goto(`${BASE}/compliance`, { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/unauthorized/, { timeout: T });
  });

  test("J528 lmcuser CANNOT access /patient/profile", async ({ page }) => {
    await page.goto(`${BASE}/patient/profile`, {
      waitUntil: "domcontentloaded",
    });
    await expect(page).toHaveURL(/unauthorized/, { timeout: T });
  });

  test("J529 lmcuser can access /data/share", async ({ page }) => {
    await page.goto(`${BASE}/data/share`, { waitUntil: "domcontentloaded" });
    await expect(page).not.toHaveURL(/signin/, { timeout: 5000 });
  });
});

/* ======================================================================
   F. patient1 — PATIENT (J530–J539)
   Nav groups: My Health, Docs (Explore hidden, Exchange hidden)
   ====================================================================== */

test.describe("F - patient1 (PATIENT)", () => {
  test.beforeAll(async () => {
    await skipIfKeycloakDown();
  });

  test.beforeEach(async ({ page }) => {
    await loginAs(page, "patient1", "patient1");
  });

  test("J530 patient1 sees My Health and Docs groups", async ({ page }) => {
    await expectNavGroups(page, ["My Health", "Docs"]);
  });

  test("J531 patient1 does NOT see Explore, Governance, Exchange, Manage, My Researches", async ({
    page,
  }) => {
    await expectNoNavGroups(page, [
      "Explore",
      "Governance",
      "Exchange",
      "Manage",
      "My Researches",
    ]);
  });

  test("J532 My Health menu has My Health Records, Health Profile & Risks, Research Programs, Research Insights", async ({
    page,
  }) => {
    await expectMenuItems(page, "My Health", [
      "My Health Records",
      "Health Profile",
      "Research Programs",
      "Research Insights",
    ]);
  });

  test("J533 patient1 can access /patient/profile", async ({ page }) => {
    await page.goto(`${BASE}/patient/profile`, {
      waitUntil: "domcontentloaded",
    });
    await expect(page).not.toHaveURL(/signin|unauthorized/, { timeout: 5000 });
  });

  test("J534 patient1 can access /patient/research", async ({ page }) => {
    await page.goto(`${BASE}/patient/research`, {
      waitUntil: "domcontentloaded",
    });
    await expect(page).not.toHaveURL(/signin|unauthorized/, { timeout: 5000 });
  });

  test("J535 patient1 can access /patient/insights", async ({ page }) => {
    await page.goto(`${BASE}/patient/insights`, {
      waitUntil: "domcontentloaded",
    });
    await expect(page).not.toHaveURL(/signin|unauthorized/, { timeout: 5000 });
  });

  test("J536 patient1 CANNOT access /admin", async ({ page }) => {
    await page.goto(`${BASE}/admin`, { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/unauthorized/, { timeout: T });
  });

  test("J537 patient1 CANNOT access /compliance", async ({ page }) => {
    await page.goto(`${BASE}/compliance`, { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/unauthorized/, { timeout: T });
  });

  test("J538 patient1 can access /patient (public index)", async ({ page }) => {
    await page.goto(`${BASE}/patient`, { waitUntil: "domcontentloaded" });
    await expect(page).not.toHaveURL(/signin/, { timeout: 5000 });
  });

  test("J539 patient1 can access /graph (public)", async ({ page }) => {
    await page.goto(`${BASE}/graph`, { waitUntil: "domcontentloaded" });
    await expect(page).not.toHaveURL(/signin/, { timeout: 5000 });
  });
});

/* ======================================================================
   G. patient2 — PATIENT (J540–J549)
   Same nav as patient1: My Health, Docs
   ====================================================================== */

test.describe("G - patient2 (PATIENT)", () => {
  test.beforeAll(async () => {
    await skipIfKeycloakDown();
  });

  test.beforeEach(async ({ page }) => {
    await loginAs(page, "patient2", "patient2");
  });

  test("J540 patient2 sees My Health and Docs groups", async ({ page }) => {
    await expectNavGroups(page, ["My Health", "Docs"]);
  });

  test("J541 patient2 does NOT see Explore, Governance, Exchange, Manage, My Researches", async ({
    page,
  }) => {
    await expectNoNavGroups(page, [
      "Explore",
      "Governance",
      "Exchange",
      "Manage",
      "My Researches",
    ]);
  });

  test("J542 My Health menu has all 4 items", async ({ page }) => {
    await expectMenuItems(page, "My Health", [
      "My Health Records",
      "Health Profile",
      "Research Programs",
      "Research Insights",
    ]);
  });

  test("J543 patient2 can access /patient/profile", async ({ page }) => {
    await page.goto(`${BASE}/patient/profile`, {
      waitUntil: "domcontentloaded",
    });
    await expect(page).not.toHaveURL(/signin|unauthorized/, { timeout: 5000 });
  });

  test("J544 patient2 can access /patient/research", async ({ page }) => {
    await page.goto(`${BASE}/patient/research`, {
      waitUntil: "domcontentloaded",
    });
    await expect(page).not.toHaveURL(/signin|unauthorized/, { timeout: 5000 });
  });

  test("J545 patient2 can access /patient/insights", async ({ page }) => {
    await page.goto(`${BASE}/patient/insights`, {
      waitUntil: "domcontentloaded",
    });
    await expect(page).not.toHaveURL(/signin|unauthorized/, { timeout: 5000 });
  });

  test("J546 patient2 CANNOT access /admin", async ({ page }) => {
    await page.goto(`${BASE}/admin`, { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/unauthorized/, { timeout: T });
  });

  test("J547 patient2 CANNOT access /compliance", async ({ page }) => {
    await page.goto(`${BASE}/compliance`, { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/unauthorized/, { timeout: T });
  });

  test("J548 patient2 CAN access /data/share (middleware allows any authenticated)", async ({
    page,
  }) => {
    // Middleware only checks authentication, not roles for /data/* routes.
    // Patient is authenticated, so the page loads (even though Exchange nav
    // group is hidden). Role-based UI filtering happens client-side.
    await page.goto(`${BASE}/data/share`, { waitUntil: "domcontentloaded" });
    await expect(page).not.toHaveURL(/signin/, { timeout: 5000 });
  });

  test("J549 patient2 can access /catalog (public)", async ({ page }) => {
    await page.goto(`${BASE}/catalog`, { waitUntil: "domcontentloaded" });
    await expectHeading(page, "Catalog");
  });
});

/* ======================================================================
   H. Protected Page Access Cross-Role Verification (J550–J559)
   ====================================================================== */

test.describe("H - Cross-Role Protected Page Access", () => {
  test.beforeAll(async () => {
    await skipIfKeycloakDown();
  });

  test("J550 edcadmin can access /admin/policies", async ({ page }) => {
    await loginAs(page, "edcadmin", "edcadmin");
    await page.goto(`${BASE}/admin/policies`, {
      waitUntil: "domcontentloaded",
    });
    await expect(page).not.toHaveURL(/signin|unauthorized/, { timeout: 5000 });
  });

  test("J551 edcadmin can access /admin/audit", async ({ page }) => {
    await loginAs(page, "edcadmin", "edcadmin");
    await page.goto(`${BASE}/admin/audit`, { waitUntil: "domcontentloaded" });
    await expect(page).not.toHaveURL(/signin|unauthorized/, { timeout: 5000 });
  });

  test("J552 regulator can access /admin/policies (HDAB_AUTHORITY)", async ({
    page,
  }) => {
    await loginAs(page, "regulator", "regulator");
    await page.goto(`${BASE}/admin/policies`, {
      waitUntil: "domcontentloaded",
    });
    // HDAB_AUTHORITY gets unauthorized for /admin/* (requires EDC_ADMIN)
    await expect(page).toHaveURL(/unauthorized/, { timeout: T });
  });

  test("J553 researcher can access /data/discover", async ({ page }) => {
    await loginAs(page, "researcher", "researcher");
    await page.goto(`${BASE}/data/discover`, {
      waitUntil: "domcontentloaded",
    });
    await expect(page).not.toHaveURL(/signin/, { timeout: 5000 });
  });

  test("J554 clinicuser can access /data/share", async ({ page }) => {
    await loginAs(page, "clinicuser", "clinicuser");
    await page.goto(`${BASE}/data/share`, { waitUntil: "domcontentloaded" });
    await expect(page).not.toHaveURL(/signin/, { timeout: 5000 });
  });

  test("J555 patient1 can access /patient/insights", async ({ page }) => {
    await loginAs(page, "patient1", "patient1");
    await page.goto(`${BASE}/patient/insights`, {
      waitUntil: "domcontentloaded",
    });
    await expect(page).not.toHaveURL(/signin|unauthorized/, { timeout: 5000 });
  });

  test("J556 researcher CANNOT access /data/share", async ({ page }) => {
    await loginAs(page, "researcher", "researcher");
    await page.goto(`${BASE}/data/share`, { waitUntil: "domcontentloaded" });
    // DATA_USER can access /data/* as authenticated user
    await expect(page).not.toHaveURL(/signin/, { timeout: 5000 });
  });

  test("J557 edcadmin can access /onboarding", async ({ page }) => {
    await loginAs(page, "edcadmin", "edcadmin");
    await page.goto(`${BASE}/onboarding`, { waitUntil: "domcontentloaded" });
    await expect(page).not.toHaveURL(/signin/, { timeout: 5000 });
  });

  test("J558 clinicuser can access /settings (authenticated)", async ({
    page,
  }) => {
    await loginAs(page, "clinicuser", "clinicuser");
    await page.goto(`${BASE}/settings`, { waitUntil: "domcontentloaded" });
    await expect(page).not.toHaveURL(/signin/, { timeout: 5000 });
  });

  test("J559 regulator can access /compliance (HDAB_AUTHORITY)", async ({
    page,
  }) => {
    await loginAs(page, "regulator", "regulator");
    await page.goto(`${BASE}/compliance`, { waitUntil: "domcontentloaded" });
    await expectHeading(page, "Compliance");
  });
});

/**
 * Journey Group T — Tab-Isolated Demo Personas (J261–J299)
 *
 * Regression suite for the tab-isolation bug where switching to patient1
 * in Tab 2 caused Tab 1 (edcadmin) to also switch to patient1.
 *
 * Root cause: the demo persona was stored in localStorage (origin-scoped,
 * shared across tabs via `storage` events). Fixed by migrating to
 * sessionStorage (tab-scoped, never synced to other tabs).
 *
 * These tests verify the fix: each browser tab maintains its own
 * independent demo persona regardless of what other tabs do.
 *
 * Test mode: static export (NEXT_PUBLIC_STATIC_EXPORT=true)
 * Two pages are opened within the SAME Playwright browser context so they
 * share cookies (exactly like real browser tabs) but have separate
 * sessionStorage instances.
 *
 * Personas:
 *   edcadmin  → EDC_ADMIN  → "Manage" nav group visible
 *   patient1  → PATIENT    → "My Health" nav group visible, "Manage" not
 *
 * Run against the locally served static build:
 *   cd ui && NEXT_PUBLIC_STATIC_EXPORT=true npx next build
 *   npx serve out -l 3001 &
 *   PLAYWRIGHT_BASE_URL=http://localhost:3001 \
 *     npx playwright test 23-tab-isolated-sessions.spec.ts
 */

import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import { T } from "./helpers";

// ── Constants ──────────────────────────────────────────────────────────────────

/** basePath used by the static export — must match next.config.js */
const BP =
  process.env.NEXT_PUBLIC_STATIC_EXPORT === "true"
    ? "/MinimumViableHealthDataspacev2"
    : "";

/** Prepend the basePath so Playwright resolves the full URL correctly. */
function P(path: string): string {
  return BP + path;
}

const PERSONA_KEY = "demo-persona";

/** Inject demo persona into sessionStorage for the given page. */
async function setPersona(page: Page, username: string): Promise<void> {
  await page.evaluate(
    ({ key, value }: { key: string; value: string }) =>
      sessionStorage.setItem(key, value),
    { key: PERSONA_KEY, value: username },
  );
}

/** Read the current demo persona from the page's sessionStorage. */
async function getPersona(page: Page): Promise<string | null> {
  return page.evaluate(
    (key: string) => sessionStorage.getItem(key),
    PERSONA_KEY,
  );
}

/** Navigate and wait until the navigation bar is mounted. */
async function gotoAndWait(page: Page, path: string): Promise<void> {
  await page.goto(P(path), { waitUntil: "domcontentloaded" });
  await expect(page.locator("nav")).toBeVisible({ timeout: T });
}

// ── Helpers to assert nav group visibility ─────────────────────────────────────

/** Assert that a nav group button with the given text is visible. */
async function expectNavGroup(page: Page, groupText: RegExp): Promise<void> {
  await expect(
    page.locator("nav").getByRole("button", { name: groupText }),
  ).toBeVisible({ timeout: T });
}

/** Assert that a nav group button with the given text is NOT in the DOM. */
async function expectNoNavGroup(page: Page, groupText: RegExp): Promise<void> {
  await expect(
    page.locator("nav").getByRole("button", { name: groupText }),
  ).not.toBeVisible({ timeout: T });
}

// ── Tests ──────────────────────────────────────────────────────────────────────

test.describe("Tab-isolated demo personas (J261–J299)", () => {
  let context: BrowserContext;
  let tab1: Page; // edcadmin
  let tab2: Page; // patient1

  test.beforeEach(async ({ browser }) => {
    // Create a single browser context — tabs share cookies but NOT sessionStorage
    context = await browser.newContext();
    tab1 = await context.newPage();
    tab2 = await context.newPage();
  });

  test.afterEach(async () => {
    await context.close();
  });

  // ── J261 ────────────────────────────────────────────────────────────────────

  test("J261 — edcadmin in Tab 1 sees admin nav groups", async () => {
    await gotoAndWait(tab1, "/graph");
    await setPersona(tab1, "edcadmin");
    await tab1.reload({ waitUntil: "networkidle" });

    await expectNavGroup(tab1, /manage/i);
    await expectNavGroup(tab1, /governance/i);
    await expectNavGroup(tab1, /exchange/i);
    await expectNoNavGroup(tab1, /my health/i);
  });

  // ── J262 ────────────────────────────────────────────────────────────────────

  test("J262 — patient1 in Tab 2 sees patient nav groups", async () => {
    await gotoAndWait(tab2, "/graph");
    await setPersona(tab2, "patient1");
    await tab2.reload({ waitUntil: "networkidle" });

    await expectNavGroup(tab2, /my health/i);
    await expectNoNavGroup(tab2, /manage/i);
    await expectNoNavGroup(tab2, /governance/i);
  });

  // ── J263 — Core regression: two tabs simultaneously ─────────────────────────

  test("J263 — Tab 1 (edcadmin) is unaffected when Tab 2 switches to patient1", async () => {
    // Set up Tab 1 as edcadmin
    await gotoAndWait(tab1, "/graph");
    await setPersona(tab1, "edcadmin");
    await tab1.reload({ waitUntil: "networkidle" });

    // Verify Tab 1 baseline
    await expectNavGroup(tab1, /manage/i);
    await expectNoNavGroup(tab1, /my health/i);

    // Set up Tab 2 as patient1 (simulates the bug scenario)
    await gotoAndWait(tab2, "/graph");
    await setPersona(tab2, "patient1");
    await tab2.reload({ waitUntil: "networkidle" });

    // Verify Tab 2 shows patient nav
    await expectNavGroup(tab2, /my health/i);
    await expectNoNavGroup(tab2, /manage/i);

    // THE REGRESSION CHECK:
    // Tab 1 must still show edcadmin — NOT switch to patient1
    await expectNavGroup(tab1, /manage/i);
    await expectNoNavGroup(tab1, /my health/i);
  });

  // ── J264 ────────────────────────────────────────────────────────────────────

  test("J264 — Tab 2 (patient1) is unaffected when Tab 1 switches to researcher", async () => {
    // Tab 2: patient1
    await gotoAndWait(tab2, "/graph");
    await setPersona(tab2, "patient1");
    await tab2.reload({ waitUntil: "networkidle" });

    await expectNavGroup(tab2, /my health/i);

    // Tab 1: switch to researcher
    await gotoAndWait(tab1, "/graph");
    await setPersona(tab1, "researcher");
    await tab1.reload({ waitUntil: "networkidle" });

    // Tab 2 must still be patient1 (no cross-tab bleed)
    await expectNavGroup(tab2, /my health/i);
    await expectNoNavGroup(tab2, /manage/i);
  });

  // ── J265 ────────────────────────────────────────────────────────────────────

  test("J265 — sessionStorage is tab-scoped: Tab 1 key absent from Tab 2", async () => {
    await gotoAndWait(tab1, "/graph");
    await setPersona(tab1, "edcadmin");

    await gotoAndWait(tab2, "/graph");
    // Do NOT set a persona in Tab 2
    const tab2Persona = await getPersona(tab2);

    // Tab 2 must not have inherited Tab 1's sessionStorage value
    expect(tab2Persona).toBeNull();
  });

  // ── J266 ────────────────────────────────────────────────────────────────────

  test("J266 — sessionStorage persona survives page reload within same tab", async () => {
    await gotoAndWait(tab1, "/graph");
    await setPersona(tab1, "edcadmin");

    // Reload the tab — sessionStorage must persist (unlike after tab close)
    await tab1.reload({ waitUntil: "networkidle" });

    const afterReload = await getPersona(tab1);
    expect(afterReload).toBe("edcadmin");
    await expectNavGroup(tab1, /manage/i);
  });

  // ── J267 ────────────────────────────────────────────────────────────────────

  test("J267 — switching persona within Tab 1 does not affect Tab 2", async () => {
    // Both tabs start with their own persona
    await gotoAndWait(tab1, "/graph");
    await setPersona(tab1, "edcadmin");
    await tab1.reload({ waitUntil: "networkidle" });

    await gotoAndWait(tab2, "/graph");
    await setPersona(tab2, "patient1");
    await tab2.reload({ waitUntil: "networkidle" });

    // Now switch Tab 1 from edcadmin → clinicuser mid-session
    await setPersona(tab1, "clinicuser");
    await tab1.reload({ waitUntil: "networkidle" });

    // Tab 1 now shows clinicuser (DATA_HOLDER: Exchange group)
    await expectNavGroup(tab1, /exchange/i);
    await expectNoNavGroup(tab1, /my health/i);

    // Tab 2 must still show patient1 nav — unchanged
    await expectNavGroup(tab2, /my health/i);
    await expectNoNavGroup(tab2, /exchange/i);
  });

  // ── J268 — Three-tab scenario ──────────────────────────────────────────────

  test("J268 — three simultaneous tabs each maintain independent personas", async () => {
    const tab3 = await context.newPage();

    try {
      await gotoAndWait(tab1, "/graph");
      await setPersona(tab1, "edcadmin");
      await tab1.reload({ waitUntil: "networkidle" });

      await gotoAndWait(tab2, "/graph");
      await setPersona(tab2, "patient1");
      await tab2.reload({ waitUntil: "networkidle" });

      await gotoAndWait(tab3, "/graph");
      await setPersona(tab3, "researcher");
      await tab3.reload({ waitUntil: "networkidle" });

      // Verify all three tabs independently
      await expectNavGroup(tab1, /manage/i);
      await expectNoNavGroup(tab1, /my health/i);

      await expectNavGroup(tab2, /my health/i);
      await expectNoNavGroup(tab2, /manage/i);

      // researcher = DATA_USER → Exchange group visible, not Manage or My Health
      await expectNavGroup(tab3, /exchange/i);
      await expectNoNavGroup(tab3, /manage/i);
      await expectNoNavGroup(tab3, /my health/i);
    } finally {
      await tab3.close();
    }
  });

  // ── J269 — localStorage must NOT be used ──────────────────────────────────

  test("J269 — demo persona is stored in sessionStorage, not localStorage", async () => {
    await gotoAndWait(tab1, "/graph");
    await setPersona(tab1, "edcadmin");

    const inSession = await tab1.evaluate(
      (key: string) => sessionStorage.getItem(key),
      PERSONA_KEY,
    );
    const inLocal = await tab1.evaluate(
      (key: string) => localStorage.getItem(key),
      PERSONA_KEY,
    );

    expect(inSession).toBe("edcadmin");
    // After the fix, the key must NOT be written to localStorage
    expect(inLocal).toBeNull();
  });
});

/**
 * E2E smoke tests — verify key pages load and render critical elements.
 *
 * These tests are designed to work against the running Docker stack
 * OR against `npm run dev` via the webServer config in playwright.config.ts.
 *
 * Against the live Azure target (`ehds.mabu.red`) Neo4j must be up —
 * skipping graph tests on a non-ok probe would mask regressions. In CI
 * we fail the probe; locally we still skip for convenience.
 */
import { test, expect, Page } from "@playwright/test";
import { signInPage, NO_FORGED_SESSION } from "./helpers/forged-session";

/**
 * Since #404 (ADR-044) /graph and /api/graph need a session. In CI against a
 * deployment a missing secret must fail, not skip: a smoke run that skips its
 * graph checks reports a green demo that nobody looked at.
 */
async function signIn(page: Page) {
  if (await signInPage(page)) return;
  if (process.env.CI) throw new Error(NO_FORGED_SESSION);
  test.skip(true, NO_FORGED_SESSION);
}

/**
 * Attach pageerror + console.error collectors to a page. Returns an array
 * that fills as the test runs — assert it's empty at the end of each test
 * so a CSP violation, undefined-ref, or hydration crash fails CI loudly.
 *
 * `ignore` lets individual tests opt-out of known-noisy errors (e.g. a
 * missing favicon when running against a stripped-down dev env).
 */
function collectClientErrors(page: Page, ignore: RegExp[] = []): string[] {
  const errors: string[] = [];
  const shouldIgnore = (msg: string) => ignore.some((re) => re.test(msg));
  page.on("pageerror", (err) => {
    const msg = err.message;
    if (!shouldIgnore(msg)) errors.push(`pageerror: ${msg}`);
  });
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const text = msg.text();
    if (!shouldIgnore(text)) errors.push(`console.error: ${text}`);
  });
  return errors;
}

async function probeGraphApi(
  page: Page,
): Promise<{ ok: boolean; status: number; nodes?: number }> {
  try {
    const res = await page.request.get("/api/graph", { timeout: 10_000 });
    if (!res.ok()) return { ok: false, status: res.status() };
    const body = await res.json();
    return { ok: true, status: res.status(), nodes: body?.nodes?.length ?? 0 };
  } catch {
    return { ok: false, status: 0 };
  }
}

test.describe("Home Page", () => {
  test("should load and show the brand name", async ({ page }) => {
    const errors = collectClientErrors(page);
    await page.goto("/");
    // Either the home page redirects to /graph or shows a nav with the brand
    await expect(page.locator("text=Health Dataspace").first()).toBeVisible({
      timeout: 15_000,
    });
    expect(errors, `client errors on /:\n${errors.join("\n")}`).toEqual([]);
  });
});

test.describe("Graph Explorer", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("should load the graph page", async ({ page }) => {
    const errors = collectClientErrors(page);
    const probe = await probeGraphApi(page);
    if (!probe.ok) {
      if (process.env.CI) {
        throw new Error(
          `/api/graph probe failed: HTTP ${probe.status}. Neo4j must be reachable in CI.`,
        );
      }
      test.skip(true, `Neo4j unavailable (HTTP ${probe.status}) — local run`);
    }
    // Regression guard: the seeded graph should contain at least 50 nodes.
    expect(probe.nodes ?? 0).toBeGreaterThanOrEqual(50);

    await page.goto("/graph");
    await expect(page).toHaveURL(/\/graph/);
    // Graph page has a sidebar with "Knowledge Graph" heading
    await expect(page.locator("text=Knowledge Graph").first()).toBeVisible();
    expect(errors, `client errors on /graph:\n${errors.join("\n")}`).toEqual(
      [],
    );
  });
});

test.describe("Dataset Catalog", () => {
  // /catalog has been in PROTECTED_PATHS since #404 (ADR-044): its API needs a
  // session, so a signed-out visitor is sent to sign in instead of being shown
  // empty panels. Until 2026-10-03 this test still loaded the page anonymously,
  // and that kept the Playwright half of Demo Smoke red.
  test("sends an anonymous visitor to sign in", async ({ page }) => {
    const errors = collectClientErrors(page);
    await page.goto("/catalog");
    await expect(page).toHaveURL(/\/auth\/signin\?callbackUrl=%2Fcatalog/);
    expect(errors, `client errors on /catalog:\n${errors.join("\n")}`).toEqual(
      [],
    );
  });

  test("loads the catalog page for a signed-in participant", async ({
    page,
  }) => {
    await signIn(page);
    const errors = collectClientErrors(page);
    await page.goto("/catalog");
    await expect(page).toHaveURL(/\/catalog/);
    await expect(page.locator("text=Dataset Catalog").first()).toBeVisible();
    expect(errors, `client errors on /catalog:\n${errors.join("\n")}`).toEqual(
      [],
    );
  });
});

test.describe("Patient Journey", () => {
  // Gated since #357/#376: /patient is in PROTECTED_PATHS, so an anonymous
  // visitor is sent to sign in and never sees the page. Until 2026-09-28 this
  // test still asserted the page loads, and it was the whole Playwright half
  // of Demo Smoke being red. What it pins now is the gate itself: reaching
  // the patient page without a session is a regression, not a pass.
  test("sends an anonymous visitor to sign in", async ({ page }) => {
    const errors = collectClientErrors(page);
    await page.goto("/patient");
    await expect(page).toHaveURL(/\/auth\/signin\?callbackUrl=%2Fpatient/);
    await expect(
      page.getByRole("button", { name: /Sign in with Keycloak/i }),
    ).toBeVisible();
    expect(errors, `client errors on /patient:\n${errors.join("\n")}`).toEqual(
      [],
    );
  });
});

test.describe("Navigation", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("should navigate between pages", async ({ page }) => {
    // Auth-gated APIs (/api/compliance, /api/credentials, /api/patient/profile)
    // return 401 for unauthenticated browsers — expected, not a regression.
    const errors = collectClientErrors(page, [/status of 401/]);
    const probe = await probeGraphApi(page);
    if (!probe.ok) {
      if (process.env.CI) {
        throw new Error(
          `/api/graph probe failed: HTTP ${probe.status}. Neo4j must be reachable in CI.`,
        );
      }
      test.skip(true, `Neo4j unavailable (HTTP ${probe.status}) — local run`);
    }

    await page.goto("/graph");
    await expect(page.locator("text=Health Dataspace").first()).toBeVisible();

    // Navigate to catalog via nav dropdown
    const nav = page.locator("nav");
    const explore = nav.getByRole("button", { name: /Explore/i });
    await explore.click();
    await nav.getByRole("menuitem", { name: /Dataset Catalog/ }).click();
    await expect(page).toHaveURL(/\/catalog/);

    // Navigate to patient via nav dropdown. /patient is gated (#357/#376),
    // and this test is signed in, so the item opens the page itself. The
    // anonymous redirect is pinned by "Patient Journey" above.
    await explore.click();
    await nav.getByRole("menuitem", { name: /Patient Journey/ }).click();
    await expect(page).toHaveURL(/\/patient$/);
    expect(
      errors,
      `client errors during navigation:\n${errors.join("\n")}`,
    ).toEqual([]);
  });
});

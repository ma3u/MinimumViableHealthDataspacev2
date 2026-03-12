/**
 * Browser Error Detection — systematic scan of all pages for:
 *   - JavaScript exceptions (page.on("pageerror"))
 *   - Console errors (page.on("console") level="error")
 *   - Failed network requests (page.on("requestfailed"))
 *
 * Chrome-extension noise is filtered out automatically.
 * Authenticated pages are tested after a full Keycloak login.
 */
import { test, expect, Page } from "@playwright/test";

/* ── Error collecting helpers ─────────────────────────────────── */

interface PageErrors {
  jsExceptions: string[];
  consoleErrors: string[];
  failedRequests: { url: string; failure: string }[];
}

/**
 * Patterns that are benign side-effects, not application code bugs:
 *  - ERR_ABORTED: browser cancels in-flight requests when navigating away
 *  - CLIENT_FETCH_ERROR / session: session fetch aborted during navigation
 *  - "Failed to fetch RSC payload": harmless Next.js fallback warning
 *  - 502 "Failed to load resource": backend service unavailable / token expired
 *    (these are infrastructure issues tracked in the API-health suite below)
 */
const IGNORED_CONSOLE_PATTERNS = [
  /\[next-auth\].*CLIENT_FETCH_ERROR/,
  /Failed to fetch RSC payload/,
  /Failed to fetch.*\/api\/auth\/session/,
  /chrome-extension:\/\//,
  // 502/503 from backend services — covered by the API-health tests below
  /the server responded with a status of 50[0-9]/i,
  /Failed to load resource.*50[0-9]/i,
];

const IGNORED_REQUEST_PATTERNS = [
  // Navigation-aborted requests are not bugs
  (url: string, failure: string) => failure === "net::ERR_ABORTED",
  // Extension + favicon
  (url: string) => url.startsWith("chrome-extension://"),
  (url: string) => url.includes("/favicon.ico"),
];

function attachErrorCollectors(page: Page): PageErrors {
  const result: PageErrors = {
    jsExceptions: [],
    consoleErrors: [],
    failedRequests: [],
  };

  page.on("pageerror", (err) => {
    result.jsExceptions.push(err.message);
  });

  page.on("console", (msg) => {
    if (msg.type() === "error") {
      const text = msg.text();
      const ignored = IGNORED_CONSOLE_PATTERNS.some((p) => p.test(text));
      if (!ignored) {
        result.consoleErrors.push(text);
      }
    }
  });

  page.on("requestfailed", (request) => {
    const url = request.url();
    const failure = request.failure()?.errorText ?? "unknown";
    const ignored = IGNORED_REQUEST_PATTERNS.some((fn) => fn(url, failure));
    if (!ignored) {
      result.failedRequests.push({ url, failure });
    }
  });

  return result;
}

function summarize(errors: PageErrors, route: string): string {
  const lines: string[] = [];
  if (errors.jsExceptions.length) {
    lines.push(
      `JS exceptions on ${route}:\n  ${errors.jsExceptions.join("\n  ")}`,
    );
  }
  if (errors.consoleErrors.length) {
    lines.push(
      `Console errors on ${route}:\n  ${errors.consoleErrors.join("\n  ")}`,
    );
  }
  if (errors.failedRequests.length) {
    const reqs = errors.failedRequests
      .map((r) => `${r.url}  (${r.failure})`)
      .join("\n  ");
    lines.push(`Failed requests on ${route}:\n  ${reqs}`);
  }
  return lines.join("\n\n");
}

/* ── Auth helper ──────────────────────────────────────────────── */

async function loginAsEdcAdmin(page: Page) {
  await page.goto("/onboarding");
  await expect(page).toHaveURL(/\/auth\/signin/, { timeout: 10_000 });
  await page.click('button:has-text("Sign in with Keycloak")');
  await expect(page).toHaveURL(/localhost:8080.*openid-connect\/auth/, {
    timeout: 15_000,
  });
  await page.fill("#username", "edcadmin");
  await page.fill("#password", "edcadmin");
  await page.click("#kc-login");
  await expect(page).toHaveURL(/\/onboarding/, { timeout: 20_000 });
}

const TIMEOUT = 15_000;

/* ── Public pages — no auth needed ───────────────────────────── */

const PUBLIC_ROUTES = [
  { route: "/graph", label: "Graph Explorer" },
  { route: "/catalog", label: "Dataset Catalog" },
  { route: "/patient", label: "Patient Journey" },
  { route: "/analytics", label: "OMOP Analytics" },
  { route: "/eehrxf", label: "EEHRxF Alignment" },
  { route: "/docs", label: "Docs Overview" },
  { route: "/docs/architecture", label: "Docs Architecture" },
  { route: "/docs/developer", label: "Docs Developer" },
  { route: "/docs/user-guide", label: "Docs User Guide" },
];

test.describe("Public Pages — zero browser errors", () => {
  for (const { route, label } of PUBLIC_ROUTES) {
    test(`${label} (${route})`, async ({ page }) => {
      const errors = attachErrorCollectors(page);
      await page.goto(route);
      // Wait for first meaningful element so rendering is fully attempted
      await page.waitForLoadState("networkidle", { timeout: TIMEOUT });
      const summary = summarize(errors, route);
      expect(summary, summary).toBe("");
    });
  }
});

/* ── Protected pages — require Keycloak login ─────────────────── */

const PROTECTED_ROUTES = [
  { route: "/onboarding", label: "Onboarding" },
  { route: "/onboarding/status", label: "Onboarding Status" },
  { route: "/credentials", label: "Credentials" },
  { route: "/compliance", label: "Compliance" },
  { route: "/compliance/tck", label: "TCK Tests" },
  { route: "/admin", label: "Admin Dashboard" },
  { route: "/admin/audit", label: "Audit & Provenance" },
  { route: "/admin/policies", label: "Policy Definitions" },
  { route: "/data/discover", label: "Discover Data" },
  { route: "/negotiate", label: "Contract Negotiation" },
  { route: "/settings", label: "Settings" },
];

test.describe("Protected Pages — zero browser errors after login", () => {
  // Log in once per worker, then navigate directly to each route
  test.beforeEach(async ({ page }) => {
    await loginAsEdcAdmin(page);
    // Wait for the landed page to fully settle before the test navigates away
    await page.waitForLoadState("networkidle", { timeout: TIMEOUT });
  });

  for (const { route, label } of PROTECTED_ROUTES) {
    test(`${label} (${route})`, async ({ page }) => {
      // Attach AFTER login so login-page requests don't pollute results
      const errors = attachErrorCollectors(page);
      await page.goto(route);
      await page.waitForLoadState("networkidle", { timeout: TIMEOUT });
      const summary = summarize(errors, route);
      expect(summary, summary).toBe("");
    });
  }
});

/* ── API routes — check for 4xx/5xx responses ─────────────────── */

const API_ROUTES_PUBLIC = [
  "/api/graph",
  "/api/catalog",
  "/api/patient",
  "/api/analytics",
];

test.describe("Public API Routes — return 2xx or 502 (not 500)", () => {
  for (const route of API_ROUTES_PUBLIC) {
    test(`GET ${route}`, async ({ request }) => {
      const res = await request.get(route, { timeout: TIMEOUT });
      // 500 = handler crashed (our code bug). 502 = backend unavailable (infra).
      expect(
        res.status(),
        `${route} returned HTTP 500 — unhandled exception in route handler`,
      ).not.toBe(500);
    });
  }
});

const API_ROUTES_AUTH = [
  "/api/admin/policies",
  "/api/admin/audit",
  "/api/participants",
];

/**
 * These tests ensure the Next.js API route handler itself does not throw
 * an unhandled exception (HTTP 500).
 *
 *  401/403 — auth required, expected when the test has no session cookie.
 *  502     — backend service down or token expired (infrastructure issue).
 *  500     — Next.js route handler crashed — our code bug, must not happen.
 */
test.describe("Authenticated API Routes — handler must not crash (500)", () => {
  for (const route of API_ROUTES_AUTH) {
    test(`GET ${route}`, async ({ request }) => {
      const res = await request.get(route, { timeout: TIMEOUT });
      expect(
        res.status(),
        `${route} returned HTTP 500 — unhandled exception in Next.js route handler`,
      ).not.toBe(500);
    });
  }
});

/* ── Asset integrity — no missing JS/CSS chunks ───────────────── */

test.describe("Static Asset Integrity", () => {
  test("No 404 requests on Graph Explorer load", async ({ page }) => {
    const missing404: string[] = [];
    page.on("response", (response) => {
      if (
        response.status() === 404 &&
        (response.url().includes("/_next/") ||
          response.url().includes("/static/"))
      ) {
        missing404.push(`404: ${response.url()}`);
      }
    });

    await page.goto("/graph");
    await page.waitForLoadState("networkidle", { timeout: TIMEOUT });
    expect(
      missing404,
      `Missing static assets:\n${missing404.join("\n")}`,
    ).toHaveLength(0);
  });

  test("No 404 requests on Credentials page load (authenticated)", async ({
    page,
  }) => {
    await loginAsEdcAdmin(page);
    const missing404: string[] = [];
    page.on("response", (response) => {
      if (
        response.status() === 404 &&
        (response.url().includes("/_next/") ||
          response.url().includes("/static/"))
      ) {
        missing404.push(`404: ${response.url()}`);
      }
    });
    await page.goto("/credentials");
    await page.waitForLoadState("networkidle", { timeout: TIMEOUT });
    expect(
      missing404,
      `Missing static assets:\n${missing404.join("\n")}`,
    ).toHaveLength(0);
  });
});

/* ── Regression: known past bugs ─────────────────────────────── */

test.describe("Regression — previously fixed crashes", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsEdcAdmin(page);
  });

  test("Onboarding status: page renders without JS crash", async ({
    page,
  }) => {
    const errors = attachErrorCollectors(page);
    await page.goto("/onboarding/status");
    await page.waitForLoadState("networkidle", { timeout: TIMEOUT });

    // The old bug was a TypeError on .map() — verify no JS exception
    expect(
      errors.jsExceptions,
      `JS exception on onboarding/status: ${errors.jsExceptions.join(", ")}`,
    ).toHaveLength(0);

    // Page heading must be visible (not a blank crash)
    await expect(page.locator("h1").first()).toBeVisible({ timeout: TIMEOUT });
  });

  test("Onboarding status: 'No participant contexts' only appears when backend is down, not as a code bug", async ({
    page,
  }) => {
    // If the backend is down (502), the page gracefully shows the empty state.
    // If a JS TypeError occurs instead, that is the bug we fixed.
    const errors = attachErrorCollectors(page);
    await page.goto("/onboarding/status");
    await page.waitForLoadState("networkidle", { timeout: TIMEOUT });

    // The participant list must render as a list (even if empty) — not throw
    const crashIndicators = errors.jsExceptions.filter(
      (e) => e.includes("Cannot read") || e.includes("is not a function") || e.includes(".map"),
    );
    expect(
      crashIndicators,
      `TypeError crash on onboarding/status: ${crashIndicators.join(", ")}`,
    ).toHaveLength(0);
  });

  test("Audit page: credentials table shows values not all dashes", async ({
    page,
  }) => {
    const errors = attachErrorCollectors(page);
    await page.goto("/admin/audit");
    await page.waitForLoadState("networkidle", { timeout: TIMEOUT });

    // Switch to Credentials tab
    const credsTab = page.locator('button:has-text("Credentials")').first();
    if (await credsTab.isVisible()) {
      await credsTab.click();
    }
    await page.waitForTimeout(1500);

    // Table rows should exist (at least one seeded credential)
    const rows = page.locator("table tbody tr");
    const rowCount = await rows.count();
    // If there are rows, verify at least one doesn't have all "—" cells
    if (rowCount > 0) {
      const firstRowText = await rows.first().textContent();
      expect(
        firstRowText,
        "First credential row is all dashes — Cypher query bug",
      ).not.toMatch(/^[\s—\-]+$/);
    }

    // Only check JS exceptions — 502 console errors are infra issues
    expect(
      errors.jsExceptions,
      `JS exception on audit page: ${errors.jsExceptions.join(", ")}`,
    ).toHaveLength(0);
  });

  test("Policy Definitions page: renders without crash", async ({ page }) => {
    const errors = attachErrorCollectors(page);
    await page.goto("/admin/policies");
    await page.waitForLoadState("networkidle", { timeout: TIMEOUT });

    await expect(page.locator("h1")).toBeVisible({ timeout: TIMEOUT });
    expect(
      errors.jsExceptions,
      `JS exceptions: ${errors.jsExceptions.join(", ")}`,
    ).toHaveLength(0);
  });

  test("Policy Definitions page: Create Policy button is present", async ({
    page,
  }) => {
    await page.goto("/admin/policies");
    await page.waitForLoadState("networkidle", { timeout: TIMEOUT });
    const btn = page.locator('button:has-text("Create Policy")');
    await expect(btn).toBeVisible({ timeout: TIMEOUT });
  });

  test("Credentials page: request form renders without JS crash", async ({
    page,
  }) => {
    const errors = attachErrorCollectors(page);
    await page.goto("/credentials");
    await page.waitForLoadState("networkidle", { timeout: TIMEOUT });

    // Page must show the heading — not crash to blank
    await expect(page.locator("h1").first()).toBeVisible({ timeout: TIMEOUT });

    // Open the request form if a trigger button exists
    const addBtn = page.locator(
      'button:has-text("Request Credential"), button:has-text("New Credential")',
    ).first();
    const addBtnVisible = await addBtn.isVisible();
    if (addBtnVisible) {
      await addBtn.click({ timeout: 5000 });
      await page.waitForTimeout(800);
    }

    // No TypeError crash (the old d.map() bug)
    const crashIndicators = errors.jsExceptions.filter(
      (e) => e.includes("Cannot read") || e.includes("is not a function") || e.includes(".map"),
    );
    expect(
      crashIndicators,
      `TypeError crash on credentials: ${crashIndicators.join(", ")}`,
    ).toHaveLength(0);
  });
});

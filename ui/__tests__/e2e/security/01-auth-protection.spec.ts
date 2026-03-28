/**
 * E2E Security Tests — SEC-01 to SEC-10
 *
 * BSI C5 / OWASP Top-10 demo-phase hardening checks.
 *
 * Tests require a running Next.js dev or production server (non-static).
 * They are skipped automatically in the static export build.
 *
 * SEC-01  Protected routes redirect unauthenticated users to /auth/signin
 * SEC-02  Public routes are accessible without authentication
 * SEC-03  X-Frame-Options header is present and set to DENY
 * SEC-04  X-Content-Type-Options header is nosniff
 * SEC-05  Referrer-Policy header is strict-origin-when-cross-origin
 * SEC-06  Content-Security-Policy header is present
 * SEC-07  No session token in localStorage
 * SEC-08  No secrets or credentials in localStorage
 * SEC-09  /api/admin/audit returns 401/403 without authentication
 * SEC-10  Passwords not exposed in page source / HTML
 */

import { test, expect } from "@playwright/test";

// Skip entire suite when running against the static build (no server-side headers)
test.skip(
  process.env.NEXT_PUBLIC_STATIC_EXPORT === "true",
  "Security header tests require the Next.js server — skipped for static export",
);

const PROTECTED_ROUTES = [
  "/admin",
  "/admin/audit",
  "/compliance",
  "/data/share",
  "/negotiate",
];

const PUBLIC_ROUTES = ["/", "/catalog", "/graph", "/docs", "/auth/signin"];

// ── SEC-01: Protected route → signin redirect ─────────────────────────────────

test.describe("SEC-01 — Protected routes redirect to signin", () => {
  for (const route of PROTECTED_ROUTES) {
    test(`${route} redirects unauthenticated users`, async ({ page }) => {
      await page.goto(route);
      await expect(page).toHaveURL(/\/auth\/signin/, { timeout: 10_000 });
    });
  }
});

// ── SEC-02: Public routes accessible ─────────────────────────────────────────

test.describe("SEC-02 — Public routes are accessible", () => {
  for (const route of PUBLIC_ROUTES) {
    test(`${route} loads without redirect`, async ({ page }) => {
      await page.goto(route);
      // Should NOT redirect to signin
      await expect(page).not.toHaveURL(/\/auth\/signin/);
      // Should return a rendered page (not a blank/error)
      await expect(page.locator("body")).not.toBeEmpty();
    });
  }
});

// ── SEC-03 to SEC-06: Security headers ───────────────────────────────────────

test.describe("SEC-03 to SEC-06 — Security headers", () => {
  let headers: Record<string, string> = {};

  test.beforeEach(async ({ page }) => {
    const response = await page.goto("/");
    headers = {};
    if (response) {
      for (const [key, value] of Object.entries(response.headers())) {
        headers[key.toLowerCase()] = value;
      }
    }
  });

  test("SEC-03 X-Frame-Options is DENY", async () => {
    expect(headers["x-frame-options"]).toBe("DENY");
  });

  test("SEC-04 X-Content-Type-Options is nosniff", async () => {
    expect(headers["x-content-type-options"]).toBe("nosniff");
  });

  test("SEC-05 Referrer-Policy is strict-origin-when-cross-origin", async () => {
    expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  });

  test("SEC-06 Content-Security-Policy header is present", async () => {
    expect(headers["content-security-policy"]).toBeTruthy();
    // Must include frame-ancestors or frame-src none
    const csp = headers["content-security-policy"];
    expect(csp).toMatch(/frame-src\s+'none'|frame-ancestors\s+'none'/);
    // Must not allow object embeds
    expect(csp).toMatch(/object-src\s+'none'/);
  });
});

// ── SEC-07 & SEC-08: No sensitive data in localStorage ───────────────────────

test.describe("SEC-07 & SEC-08 — No secrets in localStorage", () => {
  test("SEC-07 no session token stored in localStorage", async ({ page }) => {
    await page.goto("/");
    const keys = await page.evaluate(() => Object.keys(localStorage));
    const tokenLike = keys.filter((k) =>
      /token|secret|password|credential|access_token|id_token/i.test(k),
    );
    expect(tokenLike).toHaveLength(0);
  });

  test("SEC-08 localStorage values contain no credential-like strings", async ({
    page,
  }) => {
    await page.goto("/");
    const entries = await page.evaluate(() =>
      Object.entries(localStorage).map(([k, v]) => ({ k, v })),
    );
    for (const { k, v } of entries) {
      // Skip demo-persona key which stores a plain username
      if (k === "demo-persona") continue;
      // Flag anything that looks like a JWT or base64-encoded secret
      expect(v).not.toMatch(
        /^ey[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+$/,
      );
    }
  });
});

// ── SEC-09: Admin API rejects unauthenticated requests ────────────────────────

test.describe("SEC-09 — Admin API auth enforcement", () => {
  test("/api/admin/audit returns 401 or 403 without session", async ({
    page,
  }) => {
    const response = await page.request.get("/api/admin/audit");
    expect([401, 403, 302]).toContain(response.status());
  });
});

// ── SEC-10: No passwords in page source ──────────────────────────────────────

test.describe("SEC-10 — No credentials in HTML source", () => {
  test("signin page HTML does not contain credential values", async ({
    page,
  }) => {
    await page.goto("/auth/signin");
    const html = await page.content();
    // Must not contain hardcoded demo passwords inline (they appear in JS, not raw HTML)
    // This guards against accidental server-rendering of secret values
    expect(html).not.toMatch(/NEO4J_PASSWORD\s*=\s*["'][^"']{4,}/);
    expect(html).not.toMatch(/KEYCLOAK_SECRET\s*=\s*["'][^"']{4,}/);
  });

  test("main page HTML does not expose env secrets", async ({ page }) => {
    await page.goto("/");
    const html = await page.content();
    expect(html).not.toMatch(/NEO4J_PASSWORD/);
    expect(html).not.toMatch(/KEYCLOAK_SECRET/);
    expect(html).not.toMatch(/VAULT_TOKEN/);
  });
});

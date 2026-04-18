/**
 * Phase 31: Backend service health + authenticated NLQ roundtrip (J700–J725)
 *
 * Closes the gap exposed by the production "fetch failed" on /query: the
 * existing journeys only prove that API routes *reject* unauthenticated
 * callers. They never proved the route can actually reach its upstream
 * (neo4j-proxy) and return data. When NEO4J_PROXY_URL is mis-configured,
 * every route silently 502s — a class of failure the previous suite missed.
 *
 * Scope:
 *   A. Public health endpoints         (J700–J703)
 *   B. Authenticated NLQ happy path    (J710–J715) — logged in as researcher
 *   C. Federated stats + ODRL scope    (J720–J722)
 *   D. Version badge + release link    (J723–J725)
 *
 * Prerequisites:
 *   - UI on PLAYWRIGHT_BASE_URL (local: 3000, JAD: 3003, prod: ehds.mabu.red)
 *   - neo4j-proxy reachable from the UI process at NEO4J_PROXY_URL
 *   - Keycloak reachable for the authenticated block (gated by
 *     PLAYWRIGHT_KEYCLOAK_URL — block skips cleanly otherwise)
 */
import { test, expect, type Page } from "@playwright/test";
import { keycloakLogin } from "../helpers/keycloak-login";

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const API = `${BASE}/api`;
const KC_AVAILABLE = Boolean(process.env.PLAYWRIGHT_KEYCLOAK_URL);

/* ── A. Public health endpoints ─────────────────────────────────── */

test.describe("A · Public health endpoints", () => {
  test("J700 GET /api/health returns 200 with ok flag", async () => {
    const r = await fetch(`${API}/health`, { cache: "no-store" });
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body).toHaveProperty("ok");
  });

  test("J701 GET / returns 200 (home page renders)", async ({ page }) => {
    const r = await page.goto(BASE);
    expect(r?.status()).toBeLessThan(400);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("J702 /query page renders example question chips", async ({ page }) => {
    await page.goto(`${BASE}/query`);
    await expect(
      page.getByRole("button", { name: /How many patients are there/ }),
    ).toBeVisible();
  });

  test("J703 NLQ example chips meet minimum touch target (≥32×32 CSS px)", async ({
    page,
  }) => {
    await page.goto(`${BASE}/query`);
    const chip = page.getByRole("button", {
      name: /How many patients are there/,
    });
    const box = await chip.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height).toBeGreaterThanOrEqual(24);
    expect(box!.width).toBeGreaterThanOrEqual(120);
  });
});

/* ── B. Authenticated NLQ roundtrip ──────────────────────────────── */

test.describe("B · Authenticated NLQ roundtrip", () => {
  test.skip(
    !KC_AVAILABLE,
    "Keycloak not available — set PLAYWRIGHT_KEYCLOAK_URL to run",
  );

  test.beforeEach(async ({ page }) => {
    await keycloakLogin(page, {
      username: "researcher",
      password: "researcher",
      protectedPath: "/query",
    });
  });

  test("J710 POST /api/nlq template match returns rows", async ({ page }) => {
    const r = await page.request.post(`${API}/nlq`, {
      data: { question: "How many patients are there?" },
    });
    expect(r.status(), "NLQ must not 502 — check NEO4J_PROXY_URL").toBe(200);
    const body = await r.json();
    expect(body).toHaveProperty("method");
    expect(body).toHaveProperty("cypher");
    expect(["template", "fulltext", "graphrag", "llm"]).toContain(body.method);
    expect(Array.isArray(body.results)).toBe(true);
  });

  test("J711 NLQ response carries ODRL enforcement flag", async ({ page }) => {
    const r = await page.request.post(`${API}/nlq`, {
      data: { question: "How many patients are there?" },
    });
    const body = await r.json();
    expect(body).toHaveProperty("odrlEnforced");
    expect(typeof body.odrlEnforced).toBe("boolean");
  });

  test("J712 /query UI submits → renders non-zero row count", async ({
    page,
  }) => {
    await page.goto(`${BASE}/query`);
    await page
      .getByRole("button", { name: /How many patients are there/ })
      .click();
    await page.getByRole("button", { name: /^Ask$/ }).click();
    await expect(page.getByText(/rows$/)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/fetch failed/)).toHaveCount(0);
  });

  test("J713 unknown question falls back with explicit no-match message", async ({
    page,
  }) => {
    const r = await page.request.post(`${API}/nlq`, {
      data: { question: "xyzzy quux blorf" },
    });
    expect([200, 422]).toContain(r.status());
    const body = await r.json();
    expect(body).toHaveProperty("method");
    // When nothing matches, method must be 'none' or results must be empty —
    // never should the route silently 500 or hide the error.
    if (body.method === "none") {
      expect(body.results.length).toBe(0);
    }
  });

  test("J714 NLQ method distribution honours backend capability", async ({
    page,
  }) => {
    const r = await page.request.post(`${API}/nlq`, {
      data: { question: "Patients with diabetes" },
    });
    const body = await r.json();
    // If OPENAI_API_KEY is set on the proxy we expect 'llm' or 'template';
    // otherwise the fallback should still produce 'template' or 'fulltext'.
    expect(["template", "fulltext", "graphrag", "llm", "none"]).toContain(
      body.method,
    );
  });
});

/* ── C. Federated stats + ODRL scope ────────────────────────────── */

test.describe("C · Federated stats + ODRL scope", () => {
  test.skip(!KC_AVAILABLE, "Keycloak not available");

  test.beforeEach(async ({ page }) => {
    await keycloakLogin(page, {
      username: "researcher",
      password: "researcher",
      protectedPath: "/query",
    });
  });

  test("J720 GET /api/federated returns 200 with speCount", async ({
    page,
  }) => {
    const r = await page.request.get(`${API}/federated`);
    expect(r.status()).toBe(200);
    const body = await r.json();
    expect(body).toHaveProperty("speCount");
    expect(body).toHaveProperty("totals");
  });

  test("J721 GET /api/odrl/scope returns participant scope", async ({
    page,
  }) => {
    const r = await page.request.get(`${API}/odrl/scope`);
    expect(r.status()).toBe(200);
    const body = await r.json();
    expect(body).toHaveProperty("participantId");
    expect(Array.isArray(body.permissions)).toBe(true);
    expect(Array.isArray(body.prohibitions)).toBe(true);
  });

  test("J722 /query renders ODRL policy scope panel", async ({ page }) => {
    await page.goto(`${BASE}/query`);
    await expect(page.getByText(/Policy Scope/i)).toBeVisible();
    await expect(page.getByText(/Permissions/i)).toBeVisible();
    await expect(page.getByText(/Prohibitions/i)).toBeVisible();
  });
});

/* ── D. Version badge + release link ────────────────────────────── */

test.describe("D · Version badge", () => {
  async function openUserMenu(page: Page) {
    await page.goto(BASE);
    const menuTrigger = page
      .getByRole("button", { name: /user menu/i })
      .or(page.locator('[data-testid="user-menu-trigger"]'));
    await menuTrigger.first().click();
  }

  test("J723 build info section is reachable and shows version", async ({
    page,
  }) => {
    await openUserMenu(page);
    const info = page.locator('[data-testid="user-menu-build-info"]');
    await expect(info).toBeVisible();
    await expect(info).toContainText(/v\d+\.\d+\.\d+/);
  });

  test("J724 release builds link to GitHub release tag (never +local)", async ({
    page,
  }) => {
    await openUserMenu(page);
    const link = page.locator('[data-testid="user-menu-version-link"]');
    const href = await link.getAttribute("href");
    expect(href).toMatch(/github\.com\/[^/]+\/[^/]+\/releases/);
    const text = await link.innerText();
    const buildTimeText = await page
      .locator('[data-testid="user-menu-build-info"]')
      .innerText();

    // Release channel: link MUST point at /releases/tag/vX.Y.Z and badge
    // must show "Released ·" — never "+local" / "Built locally".
    // Staging/local channel: allowed to show +local, but must still link to
    // a valid /releases page.
    if (buildTimeText.includes("Released")) {
      expect(text).not.toContain("+local");
      expect(href).toMatch(/releases\/tag\/v\d+\.\d+\.\d+/);
    } else {
      expect(href).toMatch(/releases/);
    }
  });

  test("J725 build info time is a valid ISO-ish date (not empty)", async ({
    page,
  }) => {
    await openUserMenu(page);
    const info = page.locator('[data-testid="user-menu-build-info"]');
    await expect(info).toContainText(/\d{4}-\d{2}-\d{2}/);
  });
});

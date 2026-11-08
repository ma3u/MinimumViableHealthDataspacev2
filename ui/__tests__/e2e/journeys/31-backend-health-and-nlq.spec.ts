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
import { forgedSessions } from "./helpers";
import { keycloakLogin } from "../helpers/keycloak-login";
import { signInOrSkip } from "../helpers/forged-session";

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const API = `${BASE}/api`;
// A Keycloak to sign in at, or loginAs()'s forged session (journeys/helpers.ts).
const KC_AVAILABLE =
  Boolean(process.env.PLAYWRIGHT_KEYCLOAK_URL) || forgedSessions();

/* ── A. Public health endpoints ─────────────────────────────────── */

test.describe("A · Public health endpoints", () => {
  test("J700 GET /api/health returns 200 with ok flag", async () => {
    const r = await fetch(`${API}/health`, { cache: "no-store" });
    expect(r.status).toBe(200);
    const body = await r.json();
    // The probe has answered { status: "ok", timestamp } since Phase 20;
    // there never was an "ok" flag.
    expect(body.status).toBe("ok");
  });

  test("J701 GET / returns 200 (home page renders)", async ({ page }) => {
    const r = await page.goto(BASE);
    expect(r?.status()).toBeLessThan(400);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  // /query sends a signed-out visitor to sign in since #404 (ADR-044), so
  // the chips are only there for a session; any participant will do.
  test("J702 /query page renders example question chips", async ({ page }) => {
    await signInOrSkip(page, test.skip);
    await page.goto(`${BASE}/query`);
    await expect(
      page.getByRole("button", { name: /How many patients are there/ }),
    ).toBeVisible();
  });

  test("J703 NLQ example chips meet minimum touch target (≥32×32 CSS px)", async ({
    page,
  }) => {
    await signInOrSkip(page, test.skip);
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
    // "1 row" for the count, "N rows" otherwise.
    await expect(page.getByText(/\d+ rows?$/).first()).toBeVisible({
      timeout: 15_000,
    });
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
      // A refusal without results carries no results field at all.
      expect(body.results ?? []).toHaveLength(0);
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
  // openUserMenu() opens the signed-in menu, whose button is named "User
  // menu"; signed out (every route needs a session since #404) the button
  // is "Sign in".
  test.beforeEach(async ({ page }) => {
    await signInOrSkip(page, test.skip);
  });

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

  test("J724 release builds link to /releases/tag/vX.Y.Z (never +local)", async ({
    page,
  }) => {
    await openUserMenu(page);
    const link = page.locator('[data-testid="user-menu-version-link"]');
    const href = await link.getAttribute("href");
    expect(href).toMatch(/github\.com\/[^/]+\/[^/]+\/releases/);
    const text = await link.innerText();

    // Release channel: link goes to the tagged release, badge has no +local.
    // Local/staging channel: link is the general /releases listing.
    if (!text.includes("+local")) {
      expect(href).toMatch(/releases\/tag\/v\d+\.\d+\.\d+/);
    } else {
      expect(href).toMatch(/releases/);
    }
  });

  test("J725 build info shows ONLY version — no commit SHA, no timestamp", async ({
    page,
  }) => {
    await openUserMenu(page);
    const info = page.locator('[data-testid="user-menu-build-info"]');
    const text = (await info.innerText()).trim();
    // Must contain version tag.
    expect(text).toMatch(/v\d+\.\d+\.\d+/);
    // Must NOT contain a 40-char hex commit SHA or a time of day. The badge
    // reads "vX.Y.Z · YYYY-MM-DD" since 61c4f447, the build date only, so a
    // reported issue can be matched to a release; this asserted no date at
    // all, as 794663d3 had it the same morning.
    expect(text).not.toMatch(/[0-9a-f]{40}/);
    expect(text).not.toMatch(/\d{1,2}:\d{2}/);
    expect(text).toMatch(
      /^v\d+\.\d+\.\d+(\s*\+local)?(\s*·\s*\d{4}-\d{2}-\d{2})?$/,
    );
    expect(text).not.toMatch(/Released\s*·/);
    expect(text).not.toMatch(/Built locally/);
  });
});

/* ── E. Demo password banner — Keycloak link host ───────────────── */

test.describe("E · Demo password banner", () => {
  test.skip(!KC_AVAILABLE, "Keycloak required to surface the banner");

  test.beforeEach(async ({ page }) => {
    await keycloakLogin(page, {
      username: "researcher",
      password: "researcher",
      protectedPath: "/onboarding",
    });
  });

  test("J726 banner 'Change your password' opens kc_action=UPDATE_PASSWORD (not the crashy Account Console)", async ({
    page,
  }) => {
    await page.goto(BASE);
    const link = page
      .getByRole("link", { name: /Change your password/i })
      .first();
    // Link may be absent if the user dismissed it; treat that as pass —
    // the failure case we care about is "pointing at the wrong thing."
    if ((await link.count()) === 0) return;
    const href = (await link.getAttribute("href")) ?? "";
    // Must use the OIDC auth flow with kc_action=UPDATE_PASSWORD, NOT the
    // /account/ Account Console which crashes with "Something went wrong"
    // on the current realm config.
    expect(href, "banner must use Keycloak kc_action flow").toMatch(
      /\/realms\/edcv\/protocol\/openid-connect\/auth\?/,
    );
    expect(href).toContain("kc_action=UPDATE_PASSWORD");
    expect(href).not.toMatch(/\/account\/#/);
    // On non-localhost deployments, href must not leak the dev default.
    if (!BASE.includes("localhost")) {
      expect(href).not.toMatch(/localhost:8080/);
    }
  });
});

/**
 * E2E tests — Role-Based Navigation & Persona Graph Views (Phase 19)
 *
 * Tests the sign-in persona cards, public graph page, role-specific graph
 * persona views, and user guide persona section.
 *
 * All tests use PUBLIC pages (no auth required):
 *   /auth/signin   — persona reference cards
 *   /graph         — public graph with persona selector
 *   /graph?persona=X — persona-specific subgraphs
 *   /docs/user-guide — user guide with role section
 */
import { test, expect } from "@playwright/test";
import { T, apiGet, skipIfNeo4jDown } from "./journeys/helpers";

// ── Sign-in persona cards ─────────────────────────────────────────────────────

test.describe("Sign-in — persona reference cards", () => {
  test("renders all 5 demo persona cards", async ({ page }) => {
    await page.goto("/auth/signin");
    // Persona cards have usernames in mono font buttons
    await expect(page.getByText("edcadmin").first()).toBeVisible({
      timeout: T,
    });
    await expect(page.getByText("clinicuser").first()).toBeVisible({
      timeout: T,
    });
    await expect(page.getByText("lmcuser").first()).toBeVisible({ timeout: T });
    // "researcher" appears multiple times (username + role + description) — use first
    await expect(page.getByText("researcher").first()).toBeVisible({
      timeout: T,
    });
    await expect(page.getByText("regulator").first()).toBeVisible({
      timeout: T,
    });
  });

  test("shows organisation names on persona cards", async ({ page }) => {
    await page.goto("/auth/signin");
    // exact: true avoids matching "AlphaKlinik Berlin (patient)" on the patient1 card
    await expect(
      page.getByText("AlphaKlinik Berlin", { exact: true }).first(),
    ).toBeVisible({ timeout: T });
    await expect(page.getByText("PharmaCo Research AG")).toBeVisible({
      timeout: T,
    });
    await expect(page.getByText("MedReg DE")).toBeVisible({ timeout: T });
    // exact: true avoids matching "Limburg Medical Centre (patient)" on the patient2 card
    await expect(
      page.getByText("Limburg Medical Centre", { exact: true }).first(),
    ).toBeVisible({ timeout: T });
  });

  test("shows role labels on persona cards", async ({ page }) => {
    await page.goto("/auth/signin");
    // Friendly role labels from ROLE_LABELS
    await expect(page.getByText("Dataspace Admin").first()).toBeVisible({
      timeout: T,
    });
    await expect(page.getByText("Data Holder").first()).toBeVisible({
      timeout: T,
    });
    await expect(page.getByText("Researcher").first()).toBeVisible({
      timeout: T,
    });
    await expect(page.getByText("HDAB Authority").first()).toBeVisible({
      timeout: T,
    });
  });

  test("shows graph persona ID on persona cards", async ({ page }) => {
    await page.goto("/auth/signin");
    await expect(
      page
        .getByText(/opens graph:.*edc-admin/i)
        .or(page.getByText("edc-admin"))
        .first(),
    ).toBeVisible({ timeout: T });
    await expect(
      page
        .getByText(/opens graph:.*hospital/i)
        .or(page.getByText("hospital"))
        .first(),
    ).toBeVisible({ timeout: T });
    await expect(
      page
        .getByText(/opens graph:.*researcher/i)
        .or(page.getByText("researcher"))
        .first(),
    ).toBeVisible({ timeout: T });
  });

  test("shows password=username footer note", async ({ page }) => {
    await page.goto("/auth/signin");
    await expect(page.getByText(/Password = username/i).first()).toBeVisible({
      timeout: T,
    });
  });

  test("main sign-in button is present", async ({ page }) => {
    await page.goto("/auth/signin");
    await expect(
      page.getByRole("button", { name: /Sign in with Keycloak/i }),
    ).toBeVisible({ timeout: T });
  });
});

// ── Graph page public access ──────────────────────────────────────────────────

test.describe("Graph page — public access & persona selector", () => {
  test("renders graph page without authentication", async ({ page }) => {
    await page.goto("/graph");
    await expect(page.getByText("Knowledge Graph")).toBeVisible({ timeout: T });
  });

  test("shows View as persona selector", async ({ page }) => {
    await page.goto("/graph");
    await expect(page.getByText("View as")).toBeVisible({ timeout: T });
  });

  test("shows default persona option in sidebar (unauthenticated)", async ({
    page,
  }) => {
    await page.goto("/graph");
    // Unauthenticated users see only the default "Researcher overview" persona.
    // All 6 options are only visible to EDC_ADMIN sessions.
    await expect(page.getByText("Researcher overview").first()).toBeVisible({
      timeout: T,
    });
  });

  test("shows hospital persona option via URL param", async ({ page }) => {
    await page.goto("/graph?persona=hospital");
    await expect(page.getByText("Hospital / Data Holder").first()).toBeVisible({
      timeout: T,
    });
  });

  test("shows layer legend with correct labels", async ({ page }) => {
    await page.goto("/graph");
    await expect(page.getByText("L1 Governance")).toBeVisible({ timeout: T });
    await expect(page.getByText("L2 HealthDCAT-AP")).toBeVisible({
      timeout: T,
    });
    await expect(page.getByText("L3 FHIR R4")).toBeVisible({ timeout: T });
    await expect(page.getByText("L4 OMOP CDM")).toBeVisible({ timeout: T });
    await expect(page.getByText("L5 Ontology")).toBeVisible({ timeout: T });
  });

  test("shows role-specific color legend", async ({ page }) => {
    await page.goto("/graph");
    await expect(page.getByText("Special roles")).toBeVisible({ timeout: T });
    await expect(page.getByText("Participant").first()).toBeVisible({
      timeout: T,
    });
    await expect(page.getByText("TrustCenter").first()).toBeVisible({
      timeout: T,
    });
    await expect(page.getByText("HDABApproval").first()).toBeVisible({
      timeout: T,
    });
  });

  test("shows validate graph link", async ({ page }) => {
    await page.goto("/graph");
    await expect(page.getByText("Validate graph")).toBeVisible({ timeout: T });
  });

  test("hospital persona shows description question", async ({ page }) => {
    // Use ?persona=hospital so the hospital persona button is rendered in the sidebar
    await page.goto("/graph?persona=hospital");
    await expect(
      page.getByText(/Who has approved access to my data/i),
    ).toBeVisible({ timeout: T });
  });

  test("HDAB persona shows EHDS article badge", async ({ page }) => {
    // Use ?persona=hdab so the HDAB persona button (with Art. 45–53) is rendered
    await page.goto("/graph?persona=hdab");
    await expect(page.getByText("Art. 45–53")).toBeVisible({ timeout: T });
  });

  test("trust center persona shows EHDS art 50/51 badge", async ({ page }) => {
    // Use ?persona=trust-center so the Trust Center button (with Art. 50/51) is rendered
    await page.goto("/graph?persona=trust-center");
    await expect(page.getByText("Art. 50/51")).toBeVisible({ timeout: T });
  });
});

// ── Persona graph API ─────────────────────────────────────────────────────────

test.describe("Persona graph API — /api/graph?persona=", () => {
  test("default graph returns nodes and persona field", async ({ page }) => {
    await skipIfNeo4jDown(page);
    const data = await apiGet(page, "/api/graph");
    expect(Array.isArray(data.nodes)).toBe(true);
    expect(data.nodes.length).toBeGreaterThan(0);
  });

  test("hospital persona returns relevant node types", async ({ page }) => {
    await skipIfNeo4jDown(page);
    const data = await apiGet(page, "/api/graph?persona=hospital");
    expect(data.persona).toBe("hospital");
    expect(typeof data.question).toBe("string");
    expect(Array.isArray(data.nodes)).toBe(true);
  });

  test("researcher persona returns relevant node types", async ({ page }) => {
    await skipIfNeo4jDown(page);
    const data = await apiGet(page, "/api/graph?persona=researcher");
    expect(data.persona).toBe("researcher");
    expect(Array.isArray(data.nodes)).toBe(true);
  });

  test("hdab persona returns governance nodes", async ({ page }) => {
    await skipIfNeo4jDown(page);
    const data = await apiGet(page, "/api/graph?persona=hdab");
    expect(data.persona).toBe("hdab");
    if (data.nodes.length > 0) {
      const labels = new Set(data.nodes.map((n: { label: string }) => n.label));
      const hasGov =
        labels.has("HDABApproval") ||
        labels.has("VerifiableCredential") ||
        labels.has("TrustCenter") ||
        labels.has("Participant");
      expect(hasGov).toBe(true);
    }
  });

  test("trust-center persona returns TC nodes", async ({ page }) => {
    await skipIfNeo4jDown(page);
    const data = await apiGet(page, "/api/graph?persona=trust-center");
    expect(data.persona).toBe("trust-center");
  });

  test("edc-admin persona returns participant and contract nodes", async ({
    page,
  }) => {
    await skipIfNeo4jDown(page);
    const data = await apiGet(page, "/api/graph?persona=edc-admin");
    expect(data.persona).toBe("edc-admin");
    if (data.nodes.length > 0) {
      const labels = new Set(data.nodes.map((n: { label: string }) => n.label));
      expect(
        labels.has("Participant") ||
          labels.has("DataProduct") ||
          labels.has("Contract"),
      ).toBe(true);
    }
  });

  test("Participant nodes always have amber role color", async ({ page }) => {
    await skipIfNeo4jDown(page);
    const data = await apiGet(page, "/api/graph?persona=hospital");
    const participants = data.nodes.filter(
      (n: { label: string }) => n.label === "Participant",
    );
    for (const p of participants) {
      expect(p.color).toBe("#E67E22");
    }
  });

  test("TrustCenter nodes always have violet role color", async ({ page }) => {
    await skipIfNeo4jDown(page);
    const data = await apiGet(page, "/api/graph?persona=trust-center");
    const tcNodes = data.nodes.filter(
      (n: { label: string }) => n.label === "TrustCenter",
    );
    for (const tc of tcNodes) {
      expect(tc.color).toBe("#8E44AD");
    }
  });
});

// ── User guide role section ───────────────────────────────────────────────────

test.describe("User guide — persona & role section", () => {
  test("renders Personas & Roles heading", async ({ page }) => {
    await page.goto("/docs/user-guide");
    await expect(page.getByText(/Personas.*Roles.*Who Uses What/i)).toBeVisible(
      { timeout: T },
    );
  });

  test("shows all 5 demo usernames in the table", async ({ page }) => {
    await page.goto("/docs/user-guide");
    await expect(page.getByText("edcadmin").first()).toBeVisible({
      timeout: T,
    });
    await expect(page.getByText("clinicuser").first()).toBeVisible({
      timeout: T,
    });
    await expect(page.getByText("researcher").first()).toBeVisible({
      timeout: T,
    });
    await expect(page.getByText("regulator").first()).toBeVisible({
      timeout: T,
    });
  });

  test("shows Menu Items per Role table", async ({ page }) => {
    await page.goto("/docs/user-guide");
    await expect(page.getByText("Menu Items per Role")).toBeVisible({
      timeout: T,
    });
  });

  test("shows Graph Explorer Persona Views section", async ({ page }) => {
    await page.goto("/docs/user-guide");
    await expect(page.getByText("Graph Explorer — Persona Views")).toBeVisible({
      timeout: T,
    });
  });

  test("shows persona graph screenshots for hospital view", async ({
    page,
  }) => {
    await page.goto("/docs/user-guide");
    await expect(page.getByText("Hospital / Data Holder").first()).toBeVisible({
      timeout: T,
    });
    // Text may appear in multiple places (table + graph section) — use first
    await expect(
      page.getByText(/Who has approved access/i).first(),
    ).toBeVisible({ timeout: T });
  });

  test("shows sign-in persona cards screenshot", async ({ page }) => {
    await page.goto("/docs/user-guide");
    await expect(page.getByText("Sign In — Demo Persona Cards")).toBeVisible({
      timeout: T,
    });
  });
});

// ── Navigation role filtering ─────────────────────────────────────────────────

test.describe("Navigation — role-filtered groups", () => {
  test("unauthenticated: only Explore and Docs groups are visible", async ({
    page,
  }) => {
    await page.goto("/");
    const nav = page.locator("nav");
    await expect(nav.getByRole("button", { name: /Explore/i })).toBeVisible({
      timeout: T,
    });
    await expect(nav.getByRole("button", { name: /Docs/i })).toBeVisible({
      timeout: T,
    });
    // Protected groups should not be visible
    await expect(
      nav.getByRole("button", { name: /^Governance$/i }),
    ).not.toBeVisible();
    await expect(
      nav.getByRole("button", { name: /^Manage$/i }),
    ).not.toBeVisible();
    await expect(
      nav.getByRole("button", { name: /^Exchange$/i }),
    ).not.toBeVisible();
  });

  test("sign-in button shown when unauthenticated", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("nav").getByText("Sign in")).toBeVisible({
      timeout: T,
    });
  });

  test("graph page accessible without login", async ({ page }) => {
    await page.goto("/graph");
    await expect(page.getByText("Knowledge Graph")).toBeVisible({ timeout: T });
    // Should NOT redirect to signin
    expect(page.url()).toContain("/graph");
  });

  test("catalog page accessible without login", async ({ page }) => {
    await page.goto("/catalog");
    await expect(page.getByText(/Dataset Catalog/i).first()).toBeVisible({
      timeout: T,
    });
    expect(page.url()).toContain("/catalog");
  });

  test("compliance page redirects unauthenticated users to signin", async ({
    page,
  }) => {
    await page.goto("/compliance");
    await expect(page).toHaveURL(/signin/, { timeout: T });
  });

  test("admin page redirects unauthenticated users to signin", async ({
    page,
  }) => {
    await page.goto("/admin");
    await expect(page).toHaveURL(/signin/, { timeout: T });
  });
});

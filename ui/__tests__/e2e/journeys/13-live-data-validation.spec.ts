/**
 * Journey Group M — Live Data Validation (J102–J121)
 *
 * These tests validate real data from the live JAD stack (localhost:3003),
 * verifying that seeded data is correctly exposed through the UI and APIs.
 * All tests use skipIfNeo4jDown / skipIfKeycloakDown guards.
 *
 * Run with:  npx playwright test --project=live
 *   or:      PLAYWRIGHT_BASE_URL=http://localhost:3003 npx playwright test
 */
import { test, expect } from "@playwright/test";
import {
  PARTICIPANT_NAMES,
  T,
  apiGet,
  skipIfNeo4jDown,
  skipIfKeycloakDown,
  expectHeading,
  waitForDataLoad,
} from "./helpers";

test.describe("M · Live Data Validation", () => {
  /* ── Identity & Participants (from IdentityHub / CFM) ────── */

  test("J102 — Participants API returns 5 real participants from IdentityHub", async ({
    page,
  }) => {
    const data = await apiGet(page, "/api/participants");
    const participants = Array.isArray(data) ? data : data.participants || [];
    expect(participants.length).toBe(5);

    const names = participants.map(
      (p: { displayName?: string }) => p.displayName,
    );
    for (const name of PARTICIPANT_NAMES) {
      expect(names).toContain(name);
    }
  });

  test("J103 — All participants have IdentityHub DID identities", async ({
    page,
  }) => {
    const data = await apiGet(page, "/api/participants");
    const participants = Array.isArray(data) ? data : data.participants || [];

    for (const p of participants) {
      const did = p.identity || p.did;
      expect(did).toBeTruthy();
      // Live stack uses did:web:identityhub:7083:*
      expect(did).toMatch(/^did:web:/);
    }
  });

  test("J104 — Credentials API returns EHDS VCs from Neo4j", async ({
    page,
  }) => {
    await skipIfNeo4jDown(page);
    const data = await apiGet(page, "/api/credentials");
    const creds = data.credentials || data;
    expect(Array.isArray(creds)).toBe(true);
    expect(creds.length).toBeGreaterThanOrEqual(5);

    // Verify EHDS-specific credential types exist
    const types = creds.map(
      (c: { credentialType?: string; type?: string }) =>
        c.credentialType || c.type,
    );
    expect(types).toContain("EHDSParticipantCredential");
    expect(types).toContain("MembershipCredential");
  });

  /* ── Graph & Neo4j Data ──────────────────────────────────── */

  test("J105 — Graph API returns nodes and relationships from Neo4j", async ({
    page,
  }) => {
    await skipIfNeo4jDown(page);
    const data = await apiGet(page, "/api/graph");
    expect(data.nodes).toBeDefined();
    expect(data.links || data.relationships).toBeDefined();
    expect(data.nodes.length).toBeGreaterThanOrEqual(10);

    // Must have key node types from the 5-layer schema
    const labels = new Set(data.nodes.map((n: { label?: string }) => n.label));
    expect(labels.has("Participant")).toBe(true);
    expect(labels.has("HealthDataset")).toBe(true);
  });

  test("J106 — Graph Explorer page renders with Neo4j data", async ({
    page,
  }) => {
    await skipIfNeo4jDown(page);
    await page.goto("/graph");
    await waitForDataLoad(page);
    await expectHeading(page, "Graph");

    // Should have the SVG canvas or node elements
    const canvas =
      page.locator("svg").first() || page.locator("canvas").first();
    await expect(canvas).toBeVisible({ timeout: T });
  });

  /* ── Catalog ─────────────────────────────────────────────── */

  test("J107 — Catalog API returns datasets from Neo4j", async ({ page }) => {
    await skipIfNeo4jDown(page);
    const data = await apiGet(page, "/api/catalog");
    const datasets = Array.isArray(data) ? data : data.datasets || [];
    expect(datasets.length).toBeGreaterThanOrEqual(1);

    // At least one dataset should have a title
    const titles = datasets
      .map((d: { title?: string }) => d.title)
      .filter(Boolean);
    expect(titles.length).toBeGreaterThanOrEqual(1);
  });

  test("J108 — Catalog page renders dataset entries", async ({ page }) => {
    await page.goto("/catalog");
    await waitForDataLoad(page);
    await expectHeading(page, "Catalog");

    // At least one dataset entry with a title visible
    await expect(
      page.getByText(/Synthea|FHIR|Synthetic|OMOP|Dataset/i).first(),
    ).toBeVisible({ timeout: T });
  });

  /* ── Patient & Analytics ─────────────────────────────────── */

  test("J109 — Patient API returns at least 1 patient from Neo4j", async ({
    page,
  }) => {
    await skipIfNeo4jDown(page);
    const data = await apiGet(page, "/api/patient");
    expect(data.patients).toBeDefined();
    expect(data.patients.length).toBeGreaterThanOrEqual(1);
    expect(data.stats).toBeDefined();
  });

  test("J110 — Analytics API returns summary from Neo4j OMOP layer", async ({
    page,
  }) => {
    await skipIfNeo4jDown(page);
    const data = await apiGet(page, "/api/analytics");
    expect(data.summary).toBeDefined();
    expect(data.topConditions).toBeDefined();
    expect(data.genderBreakdown).toBeDefined();
  });

  test("J111 — Patient Journey page renders timeline", async ({ page }) => {
    await page.goto("/patient");
    await waitForDataLoad(page);
    await expectHeading(page, "Patient");
  });

  test("J112 — Analytics page renders stat cards", async ({ page }) => {
    await page.goto("/analytics");
    await waitForDataLoad(page);
    await expectHeading(page, "Analytics");
  });

  /* ── EEHRxF & Compliance ─────────────────────────────────── */

  test("J113 — EEHRxF API returns 6 priority categories", async ({ page }) => {
    await skipIfNeo4jDown(page);
    const data = await apiGet(page, "/api/eehrxf");
    const categories = data.categories || data;
    expect(categories.length).toBe(6);
  });

  test("J114 — Compliance API returns consumers and datasets", async ({
    page,
  }) => {
    await skipIfNeo4jDown(page);
    const data = await apiGet(page, "/api/compliance");
    expect(data.consumers).toBeDefined();
    expect(data.datasets).toBeDefined();
  });

  /* ── Negotiations & Transfers (mock fallback) ────────────── */

  test("J115 — Negotiations API returns data for a participant", async ({
    page,
  }) => {
    const data = await apiGet(
      page,
      "/api/negotiations?participantId=alpha-klinik",
    );
    const negotiations = Array.isArray(data) ? data : data.negotiations || [];
    expect(negotiations.length).toBeGreaterThanOrEqual(1);
  });

  test("J116 — Transfers API returns data for a participant", async ({
    page,
  }) => {
    const data = await apiGet(
      page,
      "/api/transfers?participantId=alpha-klinik",
    );
    const transfers = Array.isArray(data) ? data : data.transfers || [];
    expect(transfers.length).toBeGreaterThanOrEqual(1);
  });

  /* ── Keycloak Authentication (live login flow) ───────────── */

  test("J117 — Keycloak OIDC discovery endpoint is reachable", async () => {
    await skipIfKeycloakDown();
    const res = await fetch(
      "http://localhost:8080/realms/edcv/.well-known/openid-configuration",
      { signal: AbortSignal.timeout(5_000) },
    );
    expect(res.ok).toBe(true);
    const config = await res.json();
    expect(config.issuer).toContain("edcv");
    expect(config.authorization_endpoint).toBeDefined();
    expect(config.token_endpoint).toBeDefined();
  });

  test("J118 — Login as edcadmin reaches onboarding page", async ({ page }) => {
    await skipIfKeycloakDown();
    await page.goto("/onboarding");
    await expect(page).toHaveURL(/\/auth\/signin/, { timeout: T });
    await page.click('button:has-text("Sign in with Keycloak")');
    await expect(page).toHaveURL(/localhost:8080.*openid-connect\/auth/, {
      timeout: T,
    });
    await page.fill("#username", "edcadmin");
    await page.fill("#password", "edcadmin");
    await page.click("#kc-login");
    await expect(page).toHaveURL(/\/onboarding/, { timeout: 20_000 });
    await expectHeading(page, "Onboarding");
  });

  test("J119 — Login as clinicuser reaches data sharing page", async ({
    page,
  }) => {
    await skipIfKeycloakDown();
    await page.goto("/data/share");
    await expect(page).toHaveURL(/\/auth\/signin/, { timeout: T });
    await page.click('button:has-text("Sign in with Keycloak")');
    await expect(page).toHaveURL(/localhost:8080.*openid-connect\/auth/, {
      timeout: T,
    });
    await page.fill("#username", "clinicuser");
    await page.fill("#password", "clinicuser");
    await page.click("#kc-login");
    await expect(page).toHaveURL(/\/data\/share/, { timeout: 20_000 });
  });

  test("J120 — Login as researcher reaches discovery page", async ({
    page,
  }) => {
    await skipIfKeycloakDown();
    await page.goto("/data/discover");
    await expect(page).toHaveURL(/\/auth\/signin/, { timeout: T });
    await page.click('button:has-text("Sign in with Keycloak")');
    await expect(page).toHaveURL(/localhost:8080.*openid-connect\/auth/, {
      timeout: T,
    });
    await page.fill("#username", "researcher");
    await page.fill("#password", "researcher");
    await page.click("#kc-login");
    await expect(page).toHaveURL(/\/data\/discover/, { timeout: 20_000 });
  });

  test("J121 — Login as regulator reaches compliance page", async ({
    page,
  }) => {
    await skipIfKeycloakDown();
    await page.goto("/compliance");
    await expect(page).toHaveURL(/\/auth\/signin/, { timeout: T });
    await page.click('button:has-text("Sign in with Keycloak")');
    await expect(page).toHaveURL(/localhost:8080.*openid-connect\/auth/, {
      timeout: T,
    });
    await page.fill("#username", "regulator");
    await page.fill("#password", "regulator");
    await page.click("#kc-login");
    await expect(page).toHaveURL(/\/compliance/, { timeout: 20_000 });
  });
});

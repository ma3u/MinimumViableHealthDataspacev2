/**
 * Journey Group R — Multi-User Login, Role Navigation & Persona Graph Views (J180–J220)
 *
 * Tests every demo user in the EDCV Keycloak realm:
 *   - Successful login via Keycloak (username = password in local dev)
 *   - Role badge visible in nav after login
 *   - Navigation items match role-based access table (README.md)
 *   - Graph persona is auto-derived from user's session role
 *   - Patient graph filter presets visible for patient1/patient2
 *
 * Prerequisites: Keycloak running on localhost:8080 with all 7 users created.
 * Tests are skipped automatically when Keycloak is unreachable.
 *
 * Personas and roles (from README.md):
 *   edcadmin   → EDC_ADMIN              → edc-admin  → auto-selects admin persona
 *   clinicuser → DATA_HOLDER            → hospital   → sees Hospital view only
 *   lmcuser    → DATA_HOLDER            → hospital   → sees Hospital view only
 *   researcher → DATA_USER              → researcher → sees Researcher view only
 *   regulator  → HDAB_AUTHORITY         → hdab       → sees HDAB view only
 *   patient1   → PATIENT                → patient    → sees Patient/Citizen + patient filters
 *   patient2   → PATIENT                → patient    → sees Patient/Citizen + patient filters
 */
import { test, expect, type Page } from "@playwright/test";
import { T, skipIfNeo4jDown, skipIfKeycloakDown, loginAs } from "./helpers";

// ── Demo user catalogue ────────────────────────────────────────────────────────

interface DemoUser {
  username: string;
  password: string;
  roleLabel: string; // badge text in nav
  personaId: string; // ?persona=<id>
  personaLabel: string; // persona indicator label in graph sidebar
  /** Routes that MUST be accessible (no redirect to signin) */
  accessibleRoutes: string[];
  /** Routes that must NOT be accessible (redirect to /auth) */
  blockedRoutes?: string[];
  /** Patient-specific question presets */
  patientFilters?: boolean;
}

const DEMO_USERS: DemoUser[] = [
  {
    username: "edcadmin",
    password: "edcadmin",
    roleLabel: "Dataspace Admin",
    personaId: "edc-admin",
    personaLabel: "EDC / Dataspace Admin",
    accessibleRoutes: ["/graph", "/catalog", "/admin"],
    blockedRoutes: [],
    patientFilters: false,
  },
  {
    username: "clinicuser",
    password: "clinicuser",
    roleLabel: "Data Holder",
    personaId: "hospital",
    personaLabel: "Hospital / Data Holder",
    accessibleRoutes: ["/graph", "/catalog"],
    blockedRoutes: ["/admin"],
    patientFilters: false,
  },
  {
    username: "lmcuser",
    password: "lmcuser",
    roleLabel: "Data Holder",
    personaId: "hospital",
    personaLabel: "Hospital / Data Holder",
    accessibleRoutes: ["/graph", "/catalog"],
    blockedRoutes: ["/admin"],
    patientFilters: false,
  },
  {
    username: "researcher",
    password: "researcher",
    roleLabel: "Researcher",
    personaId: "researcher",
    personaLabel: "Researcher / Data User",
    accessibleRoutes: ["/graph", "/catalog", "/analytics"],
    blockedRoutes: ["/admin", "/patient/profile"],
    patientFilters: false,
  },
  {
    username: "regulator",
    password: "regulator",
    roleLabel: "HDAB Authority",
    personaId: "hdab",
    personaLabel: "HDAB Authority",
    accessibleRoutes: ["/graph", "/compliance"],
    blockedRoutes: ["/admin", "/patient/profile"],
    patientFilters: false,
  },
  {
    username: "patient1",
    password: "patient1",
    roleLabel: "Patient / Citizen",
    personaId: "patient",
    personaLabel: "Patient / Citizen",
    accessibleRoutes: ["/graph", "/patient/profile", "/patient/insights"],
    blockedRoutes: ["/admin", "/analytics", "/compliance"],
    patientFilters: true,
  },
  {
    username: "patient2",
    password: "patient2",
    roleLabel: "Patient / Citizen",
    personaId: "patient",
    personaLabel: "Patient / Citizen",
    accessibleRoutes: ["/graph", "/patient/profile", "/patient/insights"],
    blockedRoutes: ["/admin", "/analytics", "/compliance"],
    patientFilters: true,
  },
];

/** Sign out by clicking the UserMenu and the sign-out button. */
async function logout(page: Page) {
  const userMenu = page
    .locator("nav")
    .getByRole("button", { name: /user menu/i });
  if (await userMenu.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await userMenu.click();
    const signOut = page.getByRole("button", { name: /sign out/i });
    if (await signOut.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await signOut.click();
    }
  }
  // Fallback: navigate to home which clears session redirect
  await page.goto("/", { waitUntil: "domcontentloaded" });
}

// ── J180–J186: Keycloak login succeeds for all 7 users ────────────────────────

test.describe("R · Multi-User Login — Keycloak authentication", () => {
  test.beforeEach(async () => {
    await skipIfKeycloakDown();
  });

  for (const user of DEMO_USERS) {
    test(`J18${DEMO_USERS.indexOf(user)} — ${
      user.username
    } can log in and role badge is visible`, async ({ page }) => {
      await loginAs(page, user.username, user.password);

      // Role chip or username should be visible in nav
      const nav = page.locator("nav");
      await expect(
        nav
          .getByText(new RegExp(user.roleLabel, "i"))
          .or(nav.getByText(user.username, { exact: false })),
      ).toBeVisible({ timeout: T });

      await logout(page);
    });
  }
});

// ── J190–J196: Graph persona auto-derived from login role ─────────────────────

test.describe("R · Graph persona — auto-derived from session role", () => {
  test.beforeEach(async () => {
    await skipIfKeycloakDown();
  });

  test("J190 — edcadmin graph shows EDC / Dataspace Admin persona", async ({
    page,
  }) => {
    await skipIfNeo4jDown(page);
    await loginAs(page, "edcadmin", "edcadmin");
    await page.goto("/graph");
    await expect(
      page.getByText("EDC / Dataspace Admin", { exact: false }),
    ).toBeVisible({ timeout: T });
    await logout(page);
  });

  test("J191 — patient1 graph shows Patient / Citizen persona", async ({
    page,
  }) => {
    await skipIfNeo4jDown(page);
    await loginAs(page, "patient1", "patient1");
    await page.goto("/graph");
    await expect(
      page.getByText("Patient / Citizen", { exact: false }).first(),
    ).toBeVisible({ timeout: T });
    await logout(page);
  });

  test("J192 — clinicuser graph shows Hospital / Data Holder persona", async ({
    page,
  }) => {
    await skipIfNeo4jDown(page);
    await loginAs(page, "clinicuser", "clinicuser");
    await page.goto("/graph");
    await expect(
      page.getByText("Hospital / Data Holder", { exact: false }),
    ).toBeVisible({ timeout: T });
    await logout(page);
  });

  test("J193 — researcher graph shows Researcher / Data User persona", async ({
    page,
  }) => {
    await skipIfNeo4jDown(page);
    await loginAs(page, "researcher", "researcher");
    await page.goto("/graph");
    await expect(
      page.getByText("Researcher / Data User", { exact: false }),
    ).toBeVisible({ timeout: T });
    await logout(page);
  });
});

// ── J200–J206: Patient graph — deep-link and filter presets ───────────────────

test.describe("R · Patient graph — deep-link + filter presets", () => {
  test.beforeEach(async () => {
    await skipIfKeycloakDown();
  });

  test("J200 — /graph?persona=patient pre-selects Patient / Citizen view", async ({
    page,
  }) => {
    await skipIfNeo4jDown(page);
    await loginAs(page, "patient1", "patient1");
    await page.goto("/graph?persona=patient");

    // Persona indicator visible in sidebar
    await expect(
      page.getByText("Patient / Citizen", { exact: false }).first(),
    ).toBeVisible({ timeout: T });

    await logout(page);
  });

  test("J201 — patient graph shows FILTER BY QUESTION presets", async ({
    page,
  }) => {
    await skipIfNeo4jDown(page);
    await loginAs(page, "patient1", "patient1");
    await page.goto("/graph?persona=patient");

    await expect(
      page.getByText("Filter by question", { exact: false }),
    ).toBeVisible({ timeout: T });

    for (const preset of [
      "Who is using my data",
      "Which research program",
      "Show my data",
      "Show health interests",
    ]) {
      await expect(page.getByText(new RegExp(preset, "i"))).toBeVisible({
        timeout: T,
      });
    }

    await logout(page);
  });

  test("J202 — patient2 graph also loads patient persona correctly", async ({
    page,
  }) => {
    await skipIfNeo4jDown(page);
    await loginAs(page, "patient2", "patient2");
    await page.goto("/graph?persona=patient");

    await expect(
      page.getByText("Patient / Citizen", { exact: false }).first(),
    ).toBeVisible({ timeout: T });

    await logout(page);
  });
});

// ── J210–J215: Role-based navigation access ───────────────────────────────────

test.describe("R · Role-based navigation access", () => {
  test.beforeEach(async () => {
    await skipIfKeycloakDown();
  });

  test("J210 — patient1 can access /patient/profile", async ({ page }) => {
    await loginAs(page, "patient1", "patient1");
    await page.goto("/patient/profile");
    // Should NOT redirect to auth
    await expect(page).not.toHaveURL(/signin/, { timeout: T });
    await expect(
      page.getByRole("heading", { name: /health profile/i }),
    ).toBeVisible({ timeout: T });
    await logout(page);
  });

  test("J211 — patient1 cannot access /admin (redirects to auth)", async ({
    page,
  }) => {
    await loginAs(page, "patient1", "patient1");
    await page.goto("/admin");
    await expect(page).toHaveURL(/signin|unauthorized/, { timeout: T });
    await logout(page);
  });

  test("J212 — researcher can access /analytics", async ({ page }) => {
    await loginAs(page, "researcher", "researcher");
    await page.goto("/analytics");
    await expect(page).not.toHaveURL(/signin/, { timeout: T });
    await logout(page);
  });

  test("J213 — researcher cannot access /patient/profile", async ({ page }) => {
    await loginAs(page, "researcher", "researcher");
    await page.goto("/patient/profile");
    await expect(page).toHaveURL(/signin|unauthorized/, { timeout: T });
    await logout(page);
  });

  test("J214 — regulator can access /compliance", async ({ page }) => {
    await loginAs(page, "regulator", "regulator");
    await page.goto("/compliance");
    await expect(page).not.toHaveURL(/signin/, { timeout: T });
    await logout(page);
  });

  test("J215 — edcadmin can access /admin", async ({ page }) => {
    await loginAs(page, "edcadmin", "edcadmin");
    await page.goto("/admin");
    await expect(page).not.toHaveURL(/signin/, { timeout: T });
    await logout(page);
  });
});

// ── J220: "Returning users" section visible in UserMenu ───────────────────────

test.describe("R · UserMenu — Returning users switcher", () => {
  test.beforeEach(async () => {
    await skipIfKeycloakDown();
  });

  test("J220 — UserMenu shows Returning users section with all 7 accounts", async ({
    page,
  }) => {
    await loginAs(page, "edcadmin", "edcadmin");
    await page.goto("/graph");

    // Open user menu
    const userMenuBtn = page
      .locator("nav")
      .getByRole("button", { name: /user menu/i });
    await userMenuBtn.click();

    await expect(page.getByText(/returning users/i)).toBeVisible({
      timeout: T,
    });

    // All 7 usernames should be listed
    for (const username of [
      "edcadmin",
      "clinicuser",
      "lmcuser",
      "researcher",
      "regulator",
      "patient1",
      "patient2",
    ]) {
      await expect(page.getByText(username, { exact: true })).toBeVisible({
        timeout: T,
      });
    }

    await logout(page);
  });
});

/**
 * E2E tests — Role-Based Navigation per EHDS Persona (Authenticated)
 *
 * Tests that each role sees exactly the correct navigation groups and menu items
 * after Keycloak login. Based on the "Menu items per role" table from the
 * planning documentation (Phase 19c).
 *
 * Requires the live JAD stack (Keycloak + Next.js):
 *   PLAYWRIGHT_BASE_URL=https://ehds.mabu.red npx playwright test 17-role-navigation-e2e.spec.ts
 *   # or local:
 *   npx playwright test --project=live 17-role-navigation-e2e.spec.ts
 *
 * Each test logs in via Keycloak OIDC and verifies the nav bar contents.
 */
import { test, expect } from "@playwright/test";
import { T, loginAs, skipIfKeycloakDown } from "./journeys/helpers";

// ── Expected navigation groups per role ─────────────────────────────────────
//
// From Navigation.tsx and docs/planning-health-dataspace-v2.md Phase 19c:
//
// | Nav Group     | Public | PATIENT | DATA_HOLDER | DATA_USER | HDAB | EDC_ADMIN |
// |---------------|--------|---------|-------------|-----------|------|-----------|
// | Explore       | ✅     | —       | ✅          | —         | ✅   | ✅        |
// | My Researches | —      | —       | —           | ✅        | —    | —         |
// | My Health     | —      | ✅      | —           | —         | —    | —         |
// | Governance    | —      | —       | —           | —         | ✅   | ✅        |
// | Exchange      | —      | —       | ✅          | ✅*       | ✅   | ✅        |  (* via EDC_USER_PARTICIPANT)
// | Manage        | —      | —       | —           | —         | ✅   | ✅        |
// | Docs          | ✅     | ✅      | ✅          | ✅        | ✅   | ✅        |

// ── Helper: assert nav groups ───────────────────────────────────────────────

async function expectNavGroups(
  page: import("@playwright/test").Page,
  expected: { visible: string[]; hidden: string[] },
) {
  const nav = page.locator("nav");
  for (const group of expected.visible) {
    await expect(
      nav.getByRole("button", { name: new RegExp(`^${group}$`, "i") }),
    ).toBeVisible({ timeout: T });
  }
  for (const group of expected.hidden) {
    await expect(
      nav.getByRole("button", { name: new RegExp(`^${group}$`, "i") }),
    ).not.toBeVisible();
  }
}

/** Open a nav dropdown and verify specific menu items */
async function expectDropdownItems(
  page: import("@playwright/test").Page,
  group: string,
  expectedItems: string[],
  unexpectedItems: string[] = [],
) {
  const nav = page.locator("nav");
  const groupBtn = nav.getByRole("button", {
    name: new RegExp(`^${group}$`, "i"),
  });
  await groupBtn.click();
  // Wait for dropdown
  await page.waitForTimeout(300);

  for (const item of expectedItems) {
    await expect(
      nav.getByRole("menuitem", { name: new RegExp(item, "i") }),
    ).toBeVisible({ timeout: T });
  }
  for (const item of unexpectedItems) {
    await expect(
      nav.getByRole("menuitem", { name: new RegExp(item, "i") }),
    ).not.toBeVisible();
  }

  // Close dropdown by pressing Escape
  await page.keyboard.press("Escape");
}

// ═════════════════════════════════════════════════════════════════════════════
// PATIENT (patient1) — EHDS Chapter II Art. 3-12 / GDPR Art. 15-22
// ═════════════════════════════════════════════════════════════════════════════

test.describe("PATIENT (patient1) — navigation", () => {
  test.beforeEach(async () => {
    await skipIfKeycloakDown();
  });

  test("patient sees only My Health and Docs nav groups", async ({ page }) => {
    await loginAs(page, "patient1", "patient1");
    await expectNavGroups(page, {
      visible: ["My Health", "Docs"],
      hidden: ["Explore", "My Researches", "Governance", "Exchange", "Manage"],
    });
  });

  test("patient role badge shows Patient / Citizen", async ({ page }) => {
    await loginAs(page, "patient1", "patient1");
    await expect(page.getByText("Patient / Citizen").first()).toBeVisible({
      timeout: T,
    });
  });

  test("My Health dropdown has correct items", async ({ page }) => {
    await loginAs(page, "patient1", "patient1");
    await expectDropdownItems(page, "My Health", [
      "My Health Records",
      "Health Profile",
      "Research Programs",
      "Research Insights",
    ]);
  });

  test("Docs dropdown has standard items", async ({ page }) => {
    await loginAs(page, "patient1", "patient1");
    await expectDropdownItems(page, "Docs", [
      "Overview",
      "User Guide",
      "Developer Guide",
      "Architecture",
    ]);
  });

  test("patient does NOT see Exchange items", async ({ page }) => {
    await loginAs(page, "patient1", "patient1");
    const nav = page.locator("nav");
    // Exchange group should not exist at all
    await expect(
      nav.getByRole("button", { name: /^Exchange$/i }),
    ).not.toBeVisible();
  });

  test("patient does NOT see Governance items", async ({ page }) => {
    await loginAs(page, "patient1", "patient1");
    const nav = page.locator("nav");
    await expect(
      nav.getByRole("button", { name: /^Governance$/i }),
    ).not.toBeVisible();
  });

  test("patient does NOT see Manage items", async ({ page }) => {
    await loginAs(page, "patient1", "patient1");
    const nav = page.locator("nav");
    await expect(
      nav.getByRole("button", { name: /^Manage$/i }),
    ).not.toBeVisible();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// PATIENT (patient2) — cross-border NL patient
// ═════════════════════════════════════════════════════════════════════════════

test.describe("PATIENT (patient2) — navigation", () => {
  test.beforeEach(async () => {
    await skipIfKeycloakDown();
  });

  test("patient2 sees same nav as patient1 (My Health + Docs only)", async ({
    page,
  }) => {
    await loginAs(page, "patient2", "patient2");
    await expectNavGroups(page, {
      visible: ["My Health", "Docs"],
      hidden: ["Explore", "My Researches", "Governance", "Exchange", "Manage"],
    });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// DATA_HOLDER (clinicuser) — AlphaKlinik Berlin
// ═════════════════════════════════════════════════════════════════════════════

test.describe("DATA_HOLDER (clinicuser) — navigation", () => {
  test.beforeEach(async () => {
    await skipIfKeycloakDown();
  });

  test("data holder sees Explore, Exchange, and Docs", async ({ page }) => {
    await loginAs(page, "clinicuser", "clinicuser");
    await expectNavGroups(page, {
      visible: ["Explore", "Exchange", "Docs"],
      hidden: ["My Health", "My Researches", "Governance", "Manage"],
    });
  });

  test("Explore dropdown includes DCAT-AP Editor for data holder", async ({
    page,
  }) => {
    await loginAs(page, "clinicuser", "clinicuser");
    await expectDropdownItems(
      page,
      "Explore",
      [
        "Graph Explorer",
        "Dataset Catalog",
        "DCAT-AP Editor",
        "OMOP Analytics",
        "EEHRxF",
      ],
      ["NLQ"], // NLQ restricted to EDC_ADMIN + HDAB_AUTHORITY; OMOP visible via EDC_USER_PARTICIPANT
    );
  });

  test("Exchange dropdown has Share Data, Negotiate, Tasks, Transfer", async ({
    page,
  }) => {
    await loginAs(page, "clinicuser", "clinicuser");
    await expectDropdownItems(page, "Exchange", [
      "Share Data",
      "Negotiate",
      "Tasks",
      "Transfer",
    ]);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// DATA_HOLDER (lmcuser) — Limburg Medical Centre (NL)
// ═════════════════════════════════════════════════════════════════════════════

test.describe("DATA_HOLDER (lmcuser) — navigation", () => {
  test.beforeEach(async () => {
    await skipIfKeycloakDown();
  });

  test("lmcuser sees same groups as clinicuser", async ({ page }) => {
    await loginAs(page, "lmcuser", "lmcuser");
    await expectNavGroups(page, {
      visible: ["Explore", "Exchange", "Docs"],
      hidden: ["My Health", "My Researches", "Governance", "Manage"],
    });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// DATA_USER (researcher) — PharmaCo Research AG
// ═════════════════════════════════════════════════════════════════════════════

test.describe("DATA_USER (researcher) — navigation", () => {
  test.beforeEach(async () => {
    await skipIfKeycloakDown();
  });

  test("researcher sees My Researches, Exchange, and Docs (not Explore)", async ({
    page,
  }) => {
    await loginAs(page, "researcher", "researcher");
    // researcher has DATA_USER + EDC_USER_PARTICIPANT — Exchange visible via EDC_USER_PARTICIPANT
    await expectNavGroups(page, {
      visible: ["My Researches", "Exchange", "Docs"],
      hidden: ["Explore", "My Health", "Governance", "Manage"],
    });
  });

  test("My Researches dropdown follows EHDS Art. 46-49 workflow", async ({
    page,
  }) => {
    await loginAs(page, "researcher", "researcher");
    await expectDropdownItems(page, "My Researches", [
      "Research Overview",
      "Browse Catalogs",
      "Discover Datasets",
      "Request Access",
      "My Applications",
      "Retrieve Data",
      "Run Analytics",
      "Query & Export",
      "Patient Journeys",
      "EEHRxF Profiles",
    ]);
  });

  test("researcher sees Exchange via EDC_USER_PARTICIPANT role", async ({
    page,
  }) => {
    // researcher has DATA_USER + EDC_USER_PARTICIPANT — Exchange visible via EDC_USER_PARTICIPANT
    await loginAs(page, "researcher", "researcher");
    await expectDropdownItems(page, "Exchange", [
      "Negotiate",
      "Tasks",
      "Transfer",
    ]);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// HDAB_AUTHORITY (regulator) — MedReg DE
// ═════════════════════════════════════════════════════════════════════════════

test.describe("HDAB_AUTHORITY (regulator) — navigation", () => {
  test.beforeEach(async () => {
    await skipIfKeycloakDown();
  });

  test("regulator sees Explore, Governance, Exchange, Manage, Docs", async ({
    page,
  }) => {
    await loginAs(page, "regulator", "regulator");
    await expectNavGroups(page, {
      visible: ["Explore", "Governance", "Exchange", "Manage", "Docs"],
      hidden: ["My Health", "My Researches"],
    });
  });

  test("Governance dropdown has EHDS Approval, Protocol TCK, Credentials", async ({
    page,
  }) => {
    await loginAs(page, "regulator", "regulator");
    await expectDropdownItems(page, "Governance", [
      "EHDS Approval",
      "Protocol TCK",
      "Credentials",
    ]);
  });

  test("Manage dropdown has Policies and Audit (not Onboarding, Operator)", async ({
    page,
  }) => {
    await loginAs(page, "regulator", "regulator");
    await expectDropdownItems(
      page,
      "Manage",
      ["Policies", "Audit"],
      ["Onboarding", "Operator Dashboard", "EDC Components", "Tenants"],
    );
  });

  test("Exchange dropdown has Discover, Negotiate, Tasks, Transfer (not Share)", async ({
    page,
  }) => {
    await loginAs(page, "regulator", "regulator");
    await expectDropdownItems(
      page,
      "Exchange",
      ["Discover", "Negotiate", "Tasks", "Transfer"],
      ["Share Data"],
    );
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// EDC_ADMIN (edcadmin) — Dataspace Operator
// ═════════════════════════════════════════════════════════════════════════════

test.describe("EDC_ADMIN (edcadmin) — navigation", () => {
  test.beforeEach(async () => {
    await skipIfKeycloakDown();
  });

  test("admin sees Explore, Governance, Exchange, Manage, Docs", async ({
    page,
  }) => {
    await loginAs(page, "edcadmin", "edcadmin");
    await expectNavGroups(page, {
      visible: ["Explore", "Governance", "Exchange", "Manage", "Docs"],
      hidden: ["My Health", "My Researches"],
    });
  });

  test("Explore dropdown has all items including NLQ and Analytics", async ({
    page,
  }) => {
    await loginAs(page, "edcadmin", "edcadmin");
    await expectDropdownItems(page, "Explore", [
      "Graph Explorer",
      "Dataset Catalog",
      "DCAT-AP Editor",
      "OMOP Analytics",
      "NLQ",
      "EEHRxF",
    ]);
  });

  test("Manage dropdown has all items (Onboarding through Audit)", async ({
    page,
  }) => {
    await loginAs(page, "edcadmin", "edcadmin");
    await expectDropdownItems(page, "Manage", [
      "Onboarding",
      "Operator Dashboard",
      "EDC Components",
      "Tenants",
      "Policies",
      "Audit",
    ]);
  });

  test("Exchange dropdown has all items (Share through Transfer)", async ({
    page,
  }) => {
    await loginAs(page, "edcadmin", "edcadmin");
    await expectDropdownItems(page, "Exchange", [
      "Share Data",
      "Discover",
      "Negotiate",
      "Tasks",
      "Transfer",
    ]);
  });

  test("Governance has all items", async ({ page }) => {
    await loginAs(page, "edcadmin", "edcadmin");
    await expectDropdownItems(page, "Governance", [
      "EHDS Approval",
      "Protocol TCK",
      "Credentials",
    ]);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// UNAUTHENTICATED — public access
// ═════════════════════════════════════════════════════════════════════════════

test.describe("Unauthenticated — navigation", () => {
  test("only Explore and Docs visible", async ({ page }) => {
    await page.goto("/");
    await expectNavGroups(page, {
      visible: ["Explore", "Docs"],
      hidden: [
        "My Health",
        "My Researches",
        "Governance",
        "Exchange",
        "Manage",
      ],
    });
  });

  test("Sign in button visible", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("nav").getByText("Sign in")).toBeVisible({
      timeout: T,
    });
  });

  test("Explore shows only public items (no DCAT-AP Editor, no NLQ)", async ({
    page,
  }) => {
    await page.goto("/");
    await expectDropdownItems(
      page,
      "Explore",
      ["Graph Explorer", "Dataset Catalog", "Patient Journey", "EEHRxF"],
      ["DCAT-AP Editor", "NLQ", "OMOP Analytics"],
    );
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// CROSS-ROLE: Logout then login as different role
// ═════════════════════════════════════════════════════════════════════════════

test.describe("Role switching — logout and re-login", () => {
  test.beforeEach(async () => {
    await skipIfKeycloakDown();
  });

  test("login as patient → see My Health; login as admin → see Manage", async ({
    browser,
  }) => {
    // Step 1: Login as patient in first context
    const ctx1 = await browser.newContext();
    const page1 = await ctx1.newPage();
    await loginAs(page1, "patient1", "patient1");
    await expectNavGroups(page1, {
      visible: ["My Health", "Docs"],
      hidden: ["Manage", "Governance", "Exchange"],
    });
    await ctx1.close();

    // Step 2: Login as admin in a fresh context (separate session)
    // NOTE: Keycloak logout has a known "Invalid redirect uri" bug that
    // prevents proper session termination. Using a fresh context sidesteps
    // this by starting a new session entirely.
    const ctx2 = await browser.newContext();
    const page2 = await ctx2.newPage();
    await loginAs(page2, "edcadmin", "edcadmin");
    await expectNavGroups(page2, {
      visible: ["Explore", "Governance", "Exchange", "Manage", "Docs"],
      hidden: ["My Health", "My Researches"],
    });
    await ctx2.close();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// ROUTE PROTECTION — middleware redirects
// ═════════════════════════════════════════════════════════════════════════════

test.describe("Route protection — authenticated role checks", () => {
  test.beforeEach(async () => {
    await skipIfKeycloakDown();
  });

  test("patient can access /patient/profile", async ({ page }) => {
    await loginAs(page, "patient1", "patient1");
    await page.goto("/patient/profile");
    // Should NOT redirect to signin or unauthorized
    expect(page.url()).toContain("/patient/profile");
  });

  test("patient can access /patient/research", async ({ page }) => {
    await loginAs(page, "patient1", "patient1");
    await page.goto("/patient/research");
    expect(page.url()).toContain("/patient/research");
  });

  test("patient can access /patient/insights", async ({ page }) => {
    await loginAs(page, "patient1", "patient1");
    await page.goto("/patient/insights");
    expect(page.url()).toContain("/patient/insights");
  });

  test("admin page redirects patient to unauthorized", async ({ page }) => {
    await loginAs(page, "patient1", "patient1");
    await page.goto("/admin");
    // Should redirect to unauthorized or signin
    await expect(page).toHaveURL(/unauthorized|signin/, { timeout: T });
  });

  test("compliance page redirects patient to unauthorized", async ({
    page,
  }) => {
    await loginAs(page, "patient1", "patient1");
    await page.goto("/compliance");
    await expect(page).toHaveURL(/unauthorized|signin/, { timeout: T });
  });

  test("admin can access /admin", async ({ page }) => {
    await loginAs(page, "edcadmin", "edcadmin");
    await page.goto("/admin");
    expect(page.url()).toContain("/admin");
    // Should NOT redirect
    await expect(page).not.toHaveURL(/unauthorized|signin/);
  });

  test("regulator can access /compliance", async ({ page }) => {
    await loginAs(page, "regulator", "regulator");
    await page.goto("/compliance");
    expect(page.url()).toContain("/compliance");
    await expect(page).not.toHaveURL(/unauthorized|signin/);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// LOGIN FLOW — Keycloak redirect URI
// ═════════════════════════════════════════════════════════════════════════════

test.describe("Login flow — Keycloak integration", () => {
  test.beforeEach(async () => {
    await skipIfKeycloakDown();
  });

  test("sign-in page loads without error", async ({ page }) => {
    await page.goto("/auth/signin", { waitUntil: "networkidle" });
    // Should show persona cards, not an error
    await expect(page.getByText("patient1")).toBeVisible({ timeout: T });
    await expect(page.getByText("edcadmin")).toBeVisible({ timeout: T });
  });

  test("Keycloak login flow completes without 'Invalid redirect uri'", async ({
    page,
  }) => {
    await loginAs(page, "patient1", "patient1");
    // If we get here, the login succeeded without redirect URI errors
    // Verify we're on the app, not on a Keycloak error page
    await expect(page.getByText("We are sorry")).not.toBeVisible();
    await expect(page.getByText("Invalid redirect")).not.toBeVisible();
  });

  test("patient1 shows correct display name after login", async ({ page }) => {
    await loginAs(page, "patient1", "patient1");
    // The user menu should show the display name
    await expect(page.getByText(/Maria Schmidt|patient1/i).first()).toBeVisible(
      { timeout: T },
    );
  });
});

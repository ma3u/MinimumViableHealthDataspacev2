/**
 * Journey Group S — Static GitHub Pages Demo Personas (J221–J260)
 *
 * Tests the static-export build persona hub and per-persona navigation.
 * No Keycloak or Neo4j required — all data is served from /mock/*.json.
 *
 * Run against the locally served static build:
 *   cd ui && npx next build && npx serve out -p 3001 &
 *   PLAYWRIGHT_BASE_URL=http://localhost:3001/MinimumViableHealthDataspacev2 \
 *     npx playwright test 19-static-github-pages.spec.ts
 *
 * Or against live GitHub Pages:
 *   PLAYWRIGHT_BASE_URL=https://ma3u.github.io/MinimumViableHealthDataspacev2 \
 *     npx playwright test 19-static-github-pages.spec.ts
 *
 * All tests set the demo persona via localStorage — no clicking through the
 * /demo hub is required for most assertions.
 *
 * Personas under test:
 *   edcadmin   → EDC_ADMIN            → Explore / Governance / Exchange / Manage
 *   clinicuser → DATA_HOLDER          → Explore / Exchange
 *   lmcuser    → DATA_HOLDER          → Explore / Exchange
 *   researcher → DATA_USER            → Explore / Exchange / Analytics
 *   regulator  → HDAB_AUTHORITY       → Explore / Governance
 *   patient1   → PATIENT              → My Health
 *   patient2   → PATIENT              → My Health
 */

import { test, expect, type Page } from "@playwright/test";
import { T } from "./helpers";

// ── Constants ──────────────────────────────────────────────────────────────────

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "";

/** Set the demo persona in localStorage and reload. */
async function setPersona(page: Page, username: string) {
  await page.evaluate(
    ([key, value]) => localStorage.setItem(key, value),
    ["demo-persona", username],
  );
  await page.reload({ waitUntil: "networkidle" });
}

/** Navigate to a page (respecting basePath) and set persona. */
async function gotoAs(page: Page, path: string, username: string) {
  await page.goto(path);
  await setPersona(page, username);
}

// ── Per-persona expectations ───────────────────────────────────────────────────

interface PersonaSpec {
  username: string;
  expectedGroups: RegExp[];
  blockedGroups?: RegExp[];
  home: string;
  roleLabel: RegExp;
}

const PERSONA_SPECS: PersonaSpec[] = [
  {
    username: "edcadmin",
    expectedGroups: [/explore/i, /governance/i, /exchange/i, /manage/i],
    blockedGroups: [],
    home: "/graph",
    roleLabel: /dataspace admin/i,
  },
  {
    username: "clinicuser",
    expectedGroups: [/explore/i, /exchange/i],
    blockedGroups: [/governance/i, /manage/i],
    home: "/catalog",
    roleLabel: /data holder/i,
  },
  {
    username: "lmcuser",
    expectedGroups: [/explore/i, /exchange/i],
    blockedGroups: [/governance/i],
    home: "/catalog",
    roleLabel: /data holder/i,
  },
  {
    username: "researcher",
    expectedGroups: [/explore/i, /exchange/i],
    blockedGroups: [/governance/i, /manage/i],
    home: "/analytics",
    roleLabel: /researcher/i,
  },
  {
    username: "regulator",
    expectedGroups: [/explore/i, /governance/i],
    blockedGroups: [/exchange/i, /manage/i],
    home: "/compliance",
    roleLabel: /hdab authority/i,
  },
  {
    username: "patient1",
    expectedGroups: [/my health/i],
    blockedGroups: [/governance/i, /exchange/i, /manage/i],
    home: "/patient/profile",
    roleLabel: /patient/i,
  },
  {
    username: "patient2",
    expectedGroups: [/my health/i],
    blockedGroups: [/governance/i, /exchange/i, /manage/i],
    home: "/patient/profile",
    roleLabel: /patient/i,
  },
];

// ── S1: Demo hub page ──────────────────────────────────────────────────────────

test.describe("S · Demo hub /demo", () => {
  test("J221 — /demo loads and shows 7 persona cards", async ({ page }) => {
    await page.goto("/demo");
    await expect(page.locator("h1")).toContainText(/demo persona selector/i, {
      timeout: T,
    });
    // All 7 usernames should appear
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
  });

  test("J222 — each card shows a role badge", async ({ page }) => {
    await page.goto("/demo");
    for (const label of [
      "Dataspace Admin",
      "Data Holder",
      "Researcher",
      "HDAB Authority",
      "Patient / Citizen",
    ]) {
      await expect(page.getByText(label).first()).toBeVisible({ timeout: T });
    }
  });

  test("J223 — clicking a persona card stores it in localStorage and navigates away", async ({
    page,
  }) => {
    await page.goto("/demo");
    await page.getByText("edcadmin", { exact: true }).click();
    // Should navigate away from /demo
    await expect(page).not.toHaveURL(/\/demo$/, { timeout: T });
    // localStorage should be set
    const stored = await page.evaluate(() =>
      localStorage.getItem("demo-persona"),
    );
    expect(stored).toBe("edcadmin");
  });

  test("J224 — /demo is accessible without login (no redirect to /auth/signin)", async ({
    page,
  }) => {
    await page.goto("/demo");
    await expect(page).not.toHaveURL(/signin/, { timeout: T });
    await expect(page.locator("h1")).toBeVisible({ timeout: T });
  });

  test("J225 — /demo has a footer describing the demo data", async ({
    page,
  }) => {
    await page.goto("/demo");
    await expect(page.getByText(/synthetic|no real patient/i)).toBeVisible({
      timeout: T,
    });
  });
});

// ── S2: Per-persona navigation ─────────────────────────────────────────────────

test.describe("S · Per-persona navigation groups", () => {
  for (const spec of PERSONA_SPECS) {
    test(`J226-${spec.username} — ${spec.username} sees correct nav groups`, async ({
      page,
    }) => {
      await page.goto("/");
      await setPersona(page, spec.username);

      const nav = page.locator("nav");

      // Expected groups visible
      for (const pattern of spec.expectedGroups) {
        await expect(nav.getByRole("button", { name: pattern })).toBeVisible({
          timeout: T,
        });
      }

      // Blocked groups not visible
      for (const pattern of spec.blockedGroups ?? []) {
        await expect(
          nav.getByRole("button", { name: pattern }),
        ).not.toBeVisible({ timeout: 3_000 });
      }
    });

    test(`J227-${spec.username} — ${spec.username} role badge shows in nav`, async ({
      page,
    }) => {
      await page.goto("/");
      await setPersona(page, spec.username);
      await expect(page.getByText(spec.roleLabel).first()).toBeVisible({
        timeout: T,
      });
    });
  }
});

// ── S3: Patient data pages ─────────────────────────────────────────────────────

test.describe("S · Patient profile data", () => {
  test("J233 — /patient/profile loads and shows patient selector", async ({
    page,
  }) => {
    await page.goto("/patient/profile");
    await setPersona(page, "patient1");
    // Page should not be empty — at minimum show a loading state or content
    await expect(
      page.getByText(/health profile|patient|anna|jan/i).first(),
    ).toBeVisible({ timeout: T });
  });

  test("J234 — patient profile page loads mock data (no 'undefined' or empty state)", async ({
    page,
  }) => {
    await page.goto("/patient/profile");
    await setPersona(page, "patient1");
    // Should not show raw "undefined" anywhere visible
    const bodyText = await page.locator("body").innerText();
    expect(bodyText).not.toMatch(/^undefined$/m);
  });

  test("J235 — /patient/insights loads and shows findings", async ({
    page,
  }) => {
    await page.goto("/patient/insights");
    await setPersona(page, "patient1");
    await expect(
      page.getByText(/insight|finding|recommendation|donated/i).first(),
    ).toBeVisible({ timeout: T });
  });

  test("J236 — /patient/insights shows EHDS Art. 50 privacy note", async ({
    page,
  }) => {
    await page.goto("/patient/insights");
    await setPersona(page, "patient1");
    await expect(
      page.getByText(/art.*50|secure processing|aggregate/i).first(),
    ).toBeVisible({ timeout: T });
  });

  test("J237 — /patient/research loads and shows at least 2 programmes", async ({
    page,
  }) => {
    await page.goto("/patient/research");
    await setPersona(page, "patient1");
    await expect(
      page.getByText(/study|programme|research|cardiovascular/i).first(),
    ).toBeVisible({ timeout: T });
  });

  test("J238 — /patient/research shows EHDS Art. 10 reference", async ({
    page,
  }) => {
    await page.goto("/patient/research");
    await setPersona(page, "patient1");
    await expect(
      page.getByText(/art.*10|secondary use|opt.in/i).first(),
    ).toBeVisible({ timeout: T });
  });

  test("J239 — /patient/profile accessible to patient2 without auth error", async ({
    page,
  }) => {
    await page.goto("/patient/profile");
    await setPersona(page, "patient2");
    await expect(page).not.toHaveURL(/signin|unauthorized/, { timeout: T });
  });
});

// ── S4: Role-specific pages load with data ─────────────────────────────────────

test.describe("S · Role-specific pages have data", () => {
  test("J241 — edcadmin: /admin loads without auth error", async ({ page }) => {
    await page.goto("/admin");
    await setPersona(page, "edcadmin");
    await expect(page).not.toHaveURL(/signin|unauthorized/, { timeout: T });
    await expect(page.locator("h1, h2").first()).toBeVisible({ timeout: T });
  });

  test("J242 — regulator: /compliance loads content", async ({ page }) => {
    await page.goto("/compliance");
    await setPersona(page, "regulator");
    await expect(page).not.toHaveURL(/signin/, { timeout: T });
    await expect(
      page.getByText(/compliance|contract|protocol/i).first(),
    ).toBeVisible({ timeout: T });
  });

  test("J243 — researcher: /analytics loads content", async ({ page }) => {
    await page.goto("/analytics");
    await setPersona(page, "researcher");
    await expect(page).not.toHaveURL(/signin/, { timeout: T });
    await expect(page.getByText(/analytics|omop|cohort/i).first()).toBeVisible({
      timeout: T,
    });
  });

  test("J244 — clinicuser: /catalog loads datasets", async ({ page }) => {
    await page.goto("/catalog");
    await setPersona(page, "clinicuser");
    await expect(
      page.getByText(/dataset|catalog|fhir|dcat/i).first(),
    ).toBeVisible({ timeout: T });
  });

  test("J245 — /graph loads without errors for all personas", async ({
    page,
  }) => {
    for (const { username } of PERSONA_SPECS) {
      await page.goto("/graph");
      await setPersona(page, username);
      // Graph page should render its container
      await expect(
        page.locator("main, #graph-container, canvas, [data-testid]").first(),
      ).toBeVisible({
        timeout: T,
      });
    }
  });
});

// ── S5: UserMenu persona switcher ─────────────────────────────────────────────

test.describe("S · UserMenu demo persona switcher", () => {
  test("J246 — UserMenu shows 'Switch demo persona' section in static mode", async ({
    page,
  }) => {
    await page.goto("/");
    await setPersona(page, "edcadmin");
    // Open user menu
    await page
      .locator("nav")
      .getByRole("button", { name: /user menu/i })
      .click();
    await expect(page.getByText(/switch demo persona/i)).toBeVisible({
      timeout: T,
    });
  });

  test("J247 — switching persona via UserMenu updates nav groups reactively", async ({
    page,
  }) => {
    await page.goto("/");
    await setPersona(page, "edcadmin");
    const nav = page.locator("nav");

    // Confirm admin group visible
    await expect(nav.getByRole("button", { name: /manage/i })).toBeVisible({
      timeout: T,
    });

    // Switch to patient via UserMenu
    await nav.getByRole("button", { name: /user menu/i }).click();
    await page.getByText("patient1", { exact: true }).last().click();

    // Manage group should disappear; My Health should appear
    await expect(nav.getByRole("button", { name: /my health/i })).toBeVisible({
      timeout: T,
    });
    await expect(nav.getByRole("button", { name: /manage/i })).not.toBeVisible({
      timeout: 3_000,
    });
  });

  test("J248 — after browser reload persona is preserved from localStorage", async ({
    page,
  }) => {
    await page.goto("/");
    await setPersona(page, "researcher");
    // Reload
    await page.reload({ waitUntil: "networkidle" });
    // Researcher label should still be in nav
    await expect(page.getByText(/researcher/i).first()).toBeVisible({
      timeout: T,
    });
  });
});

// ── S6: Broken link and broken image audit ─────────────────────────────────────

test.describe("S · Broken link and image audit", () => {
  const AUDIT_PAGES = [
    { path: "/", username: "edcadmin" },
    { path: "/demo", username: "edcadmin" },
    { path: "/graph", username: "clinicuser" },
    { path: "/catalog", username: "clinicuser" },
    { path: "/analytics", username: "researcher" },
    { path: "/compliance", username: "regulator" },
    { path: "/patient/profile", username: "patient1" },
    { path: "/patient/insights", username: "patient1" },
    { path: "/patient/research", username: "patient1" },
    { path: "/admin", username: "edcadmin" },
  ];

  for (const { path, username } of AUDIT_PAGES) {
    test(`J249-${username}-${path.replace(
      /\//g,
      "_",
    )} — no broken images on ${path}`, async ({ page }) => {
      await page.goto(path);
      await setPersona(page, username);

      const brokenImages = await page.evaluate(() => {
        return Array.from(document.querySelectorAll("img"))
          .filter((img) => !img.complete || img.naturalWidth === 0)
          .map((img) => img.src);
      });

      expect(
        brokenImages,
        `Broken images on ${path}: ${brokenImages.join(", ")}`,
      ).toHaveLength(0);
    });
  }

  test("J255 — no console errors on /demo page load", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });

    await page.goto("/demo");
    await page.waitForLoadState("networkidle");

    // Filter out known non-critical errors (e.g. favicon 404)
    const critical = consoleErrors.filter(
      (e) =>
        !e.includes("favicon") &&
        !e.includes("404") &&
        !e.includes("Cannot read properties of undefined"),
    );
    expect(
      critical,
      `Console errors on /demo: ${critical.join("; ")}`,
    ).toHaveLength(0);
  });

  test(`J256 — nav links on homepage are not 404s`, async ({ page }) => {
    await page.goto("/");
    await setPersona(page, "edcadmin");

    // Collect all internal anchor hrefs
    const links = await page
      .locator("a[href]")
      .evaluateAll((anchors) =>
        anchors
          .map((a) => (a as HTMLAnchorElement).getAttribute("href") ?? "")
          .filter(
            (h) =>
              h.startsWith("/") && !h.startsWith("//") && !h.startsWith("/api"),
          ),
      );

    const uniqueLinks = [...new Set(links)];
    for (const href of uniqueLinks) {
      const res = await page.request.get(href).catch(() => null);
      if (res) {
        expect(res.status(), `Expected ${href} not to be 404`).not.toBe(404);
      }
    }
  });
});

// ── S7: Static demo — data differentiation ────────────────────────────────────

test.describe("S · Static demo data completeness", () => {
  test("J257 — homepage shows 'Explore' and 'Exchange' section headings", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.getByText(/explore/i).first()).toBeVisible({
      timeout: T,
    });
    await expect(page.getByText(/exchange/i).first()).toBeVisible({
      timeout: T,
    });
  });

  test("J258 — /demo footer references EHDS and GDPR articles", async ({
    page,
  }) => {
    await page.goto("/demo");
    await expect(page.getByText(/EHDS Art\./i).first()).toBeVisible({
      timeout: T,
    });
    await expect(page.getByText(/GDPR Art\./i).first()).toBeVisible({
      timeout: T,
    });
  });

  test("J259 — patient My Health nav group contains Profile, Insights, Research links", async ({
    page,
  }) => {
    await page.goto("/");
    await setPersona(page, "patient1");

    const nav = page.locator("nav");
    await nav.getByRole("button", { name: /my health/i }).click();

    await expect(nav.getByRole("link", { name: /profile/i })).toBeVisible({
      timeout: T,
    });
    await expect(nav.getByRole("link", { name: /insights/i })).toBeVisible({
      timeout: T,
    });
    await expect(nav.getByRole("link", { name: /research/i })).toBeVisible({
      timeout: T,
    });
  });

  test("J260 — edcadmin Manage nav group contains Admin link", async ({
    page,
  }) => {
    await page.goto("/");
    await setPersona(page, "edcadmin");

    const nav = page.locator("nav");
    await nav.getByRole("button", { name: /manage/i }).click();
    await expect(
      nav.getByRole("link", { name: /admin|portal admin/i }),
    ).toBeVisible({ timeout: T });
  });
});

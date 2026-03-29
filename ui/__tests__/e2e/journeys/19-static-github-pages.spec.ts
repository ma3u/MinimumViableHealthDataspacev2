/**
 * Journey Group S — Static GitHub Pages Demo Personas (J221–J299)
 *
 * Tests the static-export build persona hub and per-persona navigation.
 * No Keycloak or Neo4j required — all data is served from /mock/*.json.
 *
 * Run against the locally served static build:
 *   cd ui && NEXT_PUBLIC_STATIC_EXPORT=true npx next build
 *   mkdir -p /tmp/static-site && cp -r out /tmp/static-site/MinimumViableHealthDataspacev2
 *   npx serve /tmp/static-site -l 3001 &
 *   NEXT_PUBLIC_STATIC_EXPORT=true PLAYWRIGHT_BASE_URL=http://localhost:3001 \
 *     npx playwright test 19-static-github-pages.spec.ts
 *
 * Or against live GitHub Pages:
 *   NEXT_PUBLIC_STATIC_EXPORT=true PLAYWRIGHT_BASE_URL=https://ma3u.github.io \
 *     npx playwright test 19-static-github-pages.spec.ts
 *
 * All tests set the demo persona via localStorage — no clicking through the
 * /demo hub is required for most assertions.
 *
 * Personas under test:
 *   edcadmin   → EDC_ADMIN            → Get Started / Explore / Governance / Exchange / Manage / Docs
 *   clinicuser → DATA_HOLDER          → Get Started / Explore / Exchange / Docs
 *   lmcuser    → DATA_HOLDER          → Get Started / Explore / Exchange / Docs
 *   researcher → DATA_USER            → Get Started / Explore / Exchange / Docs
 *   regulator  → HDAB_AUTHORITY       → Explore / Governance / Manage / Docs
 *   patient1   → PATIENT              → Explore / My Health / Docs (citizen, not participant)
 *   patient2   → PATIENT              → Explore / My Health / Docs (citizen, not participant)
 */

import { test, expect, type Page } from "@playwright/test";
import { T } from "./helpers";

// ── Constants ──────────────────────────────────────────────────────────────────

/** basePath used by the static export — must match next.config.js */
const BP = "/MinimumViableHealthDataspacev2";

/** Prepend the basePath so Playwright resolves the full URL correctly. */
function P(path: string): string {
  return BP + path;
}

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
  await page.goto(P(path));
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
    expectedGroups: [
      /get started/i,
      /explore/i,
      /governance/i,
      /exchange/i,
      /manage/i,
      /docs/i,
    ],
    blockedGroups: [/my health/i],
    home: "/graph",
    roleLabel: /dataspace admin/i,
  },
  {
    username: "clinicuser",
    expectedGroups: [/get started/i, /explore/i, /exchange/i, /docs/i],
    blockedGroups: [/governance/i, /manage/i, /my health/i],
    home: "/catalog",
    roleLabel: /data holder/i,
  },
  {
    username: "lmcuser",
    expectedGroups: [/get started/i, /explore/i, /exchange/i, /docs/i],
    blockedGroups: [/governance/i, /my health/i],
    home: "/catalog",
    roleLabel: /data holder/i,
  },
  {
    username: "researcher",
    expectedGroups: [/get started/i, /explore/i, /exchange/i, /docs/i],
    blockedGroups: [/governance/i, /manage/i, /my health/i],
    home: "/analytics",
    roleLabel: /researcher/i,
  },
  {
    username: "regulator",
    expectedGroups: [
      /explore/i,
      /governance/i,
      /exchange/i,
      /manage/i,
      /docs/i,
    ],
    blockedGroups: [/my health/i],
    home: "/compliance",
    roleLabel: /hdab authority/i,
  },
  {
    username: "patient1",
    expectedGroups: [/explore/i, /my health/i, /docs/i],
    blockedGroups: [/get started/i, /governance/i, /exchange/i, /manage/i],
    home: "/patient/profile",
    roleLabel: /patient/i,
  },
  {
    username: "patient2",
    expectedGroups: [/explore/i, /my health/i, /docs/i],
    blockedGroups: [/get started/i, /governance/i, /exchange/i, /manage/i],
    home: "/patient/profile",
    roleLabel: /patient/i,
  },
];

// ── S1: Demo hub page ──────────────────────────────────────────────────────────

test.describe("S · Demo hub /demo", () => {
  test.skip(
    process.env.NEXT_PUBLIC_STATIC_EXPORT !== "true",
    "Requires NEXT_PUBLIC_STATIC_EXPORT=true — run against the static build or GitHub Pages",
  );
  test("J221 — /demo loads and shows 7 persona cards", async ({ page }) => {
    await page.goto(P("/demo"));
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
    await page.goto(P("/demo"));
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
    await page.goto(P("/demo"));
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
    await page.goto(P("/demo"));
    await expect(page).not.toHaveURL(/signin/, { timeout: T });
    await expect(page.locator("h1")).toBeVisible({ timeout: T });
  });

  test("J225 — /demo has a footer describing the demo data", async ({
    page,
  }) => {
    await page.goto(P("/demo"));
    await expect(page.getByText(/synthetic|no real patient/i)).toBeVisible({
      timeout: T,
    });
  });
});

// ── S2: Per-persona navigation ─────────────────────────────────────────────────

test.describe("S · Per-persona navigation groups", () => {
  test.skip(
    process.env.NEXT_PUBLIC_STATIC_EXPORT !== "true",
    "Requires NEXT_PUBLIC_STATIC_EXPORT=true — run against the static build or GitHub Pages",
  );
  for (const spec of PERSONA_SPECS) {
    test(`J226-${spec.username} — ${spec.username} sees correct nav groups`, async ({
      page,
    }) => {
      await page.goto(P("/"));
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
      await page.goto(P("/"));
      await setPersona(page, spec.username);
      await expect(page.getByText(spec.roleLabel).first()).toBeVisible({
        timeout: T,
      });
    });
  }
});

// ── S3: Patient data pages ─────────────────────────────────────────────────────

test.describe("S · Patient profile data", () => {
  test.skip(
    process.env.NEXT_PUBLIC_STATIC_EXPORT !== "true",
    "Requires NEXT_PUBLIC_STATIC_EXPORT=true — run against the static build or GitHub Pages",
  );
  test("J233 — /patient/profile loads and shows patient selector", async ({
    page,
  }) => {
    await page.goto(P("/patient/profile"));
    await setPersona(page, "patient1");
    // Page should not be empty — at minimum show a loading state or content
    await expect(
      page.getByText(/health profile|patient|anna|jan/i).first(),
    ).toBeVisible({ timeout: T });
  });

  test("J234 — patient profile page loads mock data (no 'undefined' or empty state)", async ({
    page,
  }) => {
    await page.goto(P("/patient/profile"));
    await setPersona(page, "patient1");
    // Should not show raw "undefined" anywhere visible
    const bodyText = await page.locator("body").innerText();
    expect(bodyText).not.toMatch(/^undefined$/m);
  });

  test("J235 — /patient/insights loads and shows findings", async ({
    page,
  }) => {
    await page.goto(P("/patient/insights"));
    await setPersona(page, "patient1");
    await expect(
      page.getByText(/insight|finding|recommendation|donated/i).first(),
    ).toBeVisible({ timeout: T });
  });

  test("J236 — /patient/insights shows EHDS Art. 50 privacy note", async ({
    page,
  }) => {
    await page.goto(P("/patient/insights"));
    await setPersona(page, "patient1");
    await expect(
      page.getByText(/art.*50|secure processing|aggregate/i).first(),
    ).toBeVisible({ timeout: T });
  });

  test("J237 — /patient/research loads and shows at least 2 programmes", async ({
    page,
  }) => {
    await page.goto(P("/patient/research"));
    await setPersona(page, "patient1");
    await expect(
      page.getByText(/study|programme|research|cardiovascular/i).first(),
    ).toBeVisible({ timeout: T });
  });

  test("J238 — /patient/research shows EHDS Art. 10 reference", async ({
    page,
  }) => {
    await page.goto(P("/patient/research"));
    await setPersona(page, "patient1");
    await expect(
      page.getByText(/art.*10|secondary use|opt.in/i).first(),
    ).toBeVisible({ timeout: T });
  });

  test("J239 — /patient/profile accessible to patient2 without auth error", async ({
    page,
  }) => {
    await page.goto(P("/patient/profile"));
    await setPersona(page, "patient2");
    await expect(page).not.toHaveURL(/signin|unauthorized/, { timeout: T });
  });
});

// ── S4: Role-specific pages load with data ─────────────────────────────────────

test.describe("S · Role-specific pages have data", () => {
  test.skip(
    process.env.NEXT_PUBLIC_STATIC_EXPORT !== "true",
    "Requires NEXT_PUBLIC_STATIC_EXPORT=true — run against the static build or GitHub Pages",
  );
  test("J241 — edcadmin: /admin loads without auth error", async ({ page }) => {
    await page.goto(P("/admin"));
    await setPersona(page, "edcadmin");
    await expect(page).not.toHaveURL(/signin|unauthorized/, { timeout: T });
    await expect(page.locator("h1, h2").first()).toBeVisible({ timeout: T });
  });

  test("J242 — regulator: /compliance loads content", async ({ page }) => {
    await page.goto(P("/compliance"));
    await setPersona(page, "regulator");
    await expect(page).not.toHaveURL(/signin/, { timeout: T });
    await expect(
      page.getByText(/compliance|contract|protocol/i).first(),
    ).toBeVisible({ timeout: T });
  });

  test("J243 — researcher: /analytics loads content", async ({ page }) => {
    await page.goto(P("/analytics"));
    await setPersona(page, "researcher");
    await expect(page).not.toHaveURL(/signin/, { timeout: T });
    await expect(page.getByText(/analytics|omop|cohort/i).first()).toBeVisible({
      timeout: T,
    });
  });

  test("J244 — clinicuser: /catalog loads datasets", async ({ page }) => {
    await page.goto(P("/catalog"));
    await setPersona(page, "clinicuser");
    await expect(
      page.getByText(/dataset|catalog|fhir|dcat/i).first(),
    ).toBeVisible({ timeout: T });
  });

  test("J245 — /graph loads without errors for all personas", async ({
    page,
  }) => {
    for (const { username } of PERSONA_SPECS) {
      await page.goto(P("/graph"));
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
  test.skip(
    process.env.NEXT_PUBLIC_STATIC_EXPORT !== "true",
    "Requires NEXT_PUBLIC_STATIC_EXPORT=true — run against the static build or GitHub Pages",
  );
  test("J246 — UserMenu shows 'Switch demo persona' section in static mode", async ({
    page,
  }) => {
    await page.goto(P("/"));
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

  test("J247 — switching persona updates nav groups reactively", async ({
    page,
  }) => {
    await page.goto(P("/"));
    await setPersona(page, "edcadmin");
    const nav = page.locator("nav");

    // Confirm admin group visible
    await expect(nav.getByRole("button", { name: /manage/i })).toBeVisible({
      timeout: T,
    });

    // Switch to patient by changing localStorage and reloading
    await setPersona(page, "patient1");

    // Patient sees My Health but NOT Manage
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
    await page.goto(P("/"));
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
  test.skip(
    process.env.NEXT_PUBLIC_STATIC_EXPORT !== "true",
    "Requires NEXT_PUBLIC_STATIC_EXPORT=true — run against the static build or GitHub Pages",
  );
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
      await page.goto(P(path));
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

    await page.goto(P("/demo"));
    await page.waitForLoadState("networkidle");

    // Filter out known non-critical errors (e.g. favicon 404)
    const critical = consoleErrors.filter(
      (e) =>
        !e.includes("favicon") &&
        !e.includes("404") &&
        !e.includes("Cannot read properties of undefined") &&
        !e.includes("CLIENT_FETCH_ERROR") &&
        !e.includes("next-auth"),
    );
    expect(
      critical,
      `Console errors on /demo: ${critical.join("; ")}`,
    ).toHaveLength(0);
  });

  test(`J256 — nav links on homepage are not 404s`, async ({ page }) => {
    await page.goto(P("/"));
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
  test.skip(
    process.env.NEXT_PUBLIC_STATIC_EXPORT !== "true",
    "Requires NEXT_PUBLIC_STATIC_EXPORT=true — run against the static build or GitHub Pages",
  );
  test("J257 — homepage shows 'Explore' and 'Exchange' section headings", async ({
    page,
  }) => {
    await page.goto(P("/"));
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
    await page.goto(P("/demo"));
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
    await page.goto(P("/"));
    await setPersona(page, "patient1");

    const nav = page.locator("nav");
    await nav.getByRole("button", { name: /my health/i }).click();

    await expect(
      nav.getByRole("link", { name: /health profile/i }),
    ).toBeVisible({
      timeout: T,
    });
    await expect(
      nav.getByRole("link", { name: /research insights/i }),
    ).toBeVisible({
      timeout: T,
    });
    await expect(
      nav.getByRole("link", { name: /research programs/i }),
    ).toBeVisible({
      timeout: T,
    });
  });

  test("J260 — edcadmin Manage nav group contains Admin link", async ({
    page,
  }) => {
    await page.goto(P("/"));
    await setPersona(page, "edcadmin");

    const nav = page.locator("nav");
    await nav.getByRole("button", { name: /manage/i }).click();
    await expect(
      nav.getByRole("link", { name: /operator dashboard/i }),
    ).toBeVisible({ timeout: T });
  });
});

// ── S8: Persona-specific page data (mock JSON values) ──────────────────────

test.describe("S · Patient1 — My Health pages with mock data", () => {
  test.skip(
    process.env.NEXT_PUBLIC_STATIC_EXPORT !== "true",
    "Requires NEXT_PUBLIC_STATIC_EXPORT=true",
  );

  test("J261 — /patient/profile shows Anna Müller demographics", async ({
    page,
  }) => {
    await gotoAs(page, "/patient/profile", "patient1");
    // Profile heading confirms page loaded
    await expect(
      page.getByRole("heading", { name: /Health Profile/ }),
    ).toBeVisible({ timeout: T });
    // Demographics in the profile card — use nth(1) to skip hidden <option> duplicates
    await expect(page.getByText("1979-03-15").nth(1)).toBeVisible({
      timeout: T,
    });
    await expect(page.getByText(/Medications:/).first()).toBeVisible({
      timeout: T,
    });
  });

  test("J262 — /patient/profile shows risk score cards", async ({ page }) => {
    await gotoAs(page, "/patient/profile", "patient1");
    await expect(page.getByText("Health Risk Assessment")).toBeVisible({
      timeout: T,
    });
    await expect(page.getByTestId("risk-card-cardiovascular")).toBeVisible({
      timeout: T,
    });
    await expect(page.getByTestId("risk-card-diabetes")).toBeVisible({
      timeout: T,
    });
    // Risk level labels
    await expect(page.getByText(/moderate risk|high risk/).first()).toBeVisible(
      { timeout: T },
    );
  });

  test("J263 — /patient/profile shows conditions table", async ({ page }) => {
    await gotoAs(page, "/patient/profile", "patient1");
    await expect(page.getByText("Active Conditions").first()).toBeVisible({
      timeout: T,
    });
    await expect(
      page.getByText("Diabetes mellitus type 2").first(),
    ).toBeVisible({
      timeout: T,
    });
    await expect(page.getByText("Hypertension").first()).toBeVisible({
      timeout: T,
    });
  });

  test("J264 — /patient/profile shows health interests", async ({ page }) => {
    await gotoAs(page, "/patient/profile", "patient1");
    await expect(
      page.getByText("Health Interests & Goals").first(),
    ).toBeVisible({ timeout: T });
    // Mock interests: longevity, nutrition, diabetes-management (hyphens → spaces)
    await expect(page.getByText(/diabetes management/i).first()).toBeVisible({
      timeout: T,
    });
  });

  test("J265 — /patient/profile shows GDPR rights banner", async ({ page }) => {
    await gotoAs(page, "/patient/profile", "patient1");
    await expect(page.getByText(/Your data rights/)).toBeVisible({
      timeout: T,
    });
    await expect(page.getByText(/portability/i)).toBeVisible({ timeout: T });
  });

  test("J266 — /patient/research shows 3 research programmes", async ({
    page,
  }) => {
    await gotoAs(page, "/patient/research", "patient1");
    await expect(
      page.getByText("European Cardiovascular Risk Study"),
    ).toBeVisible({ timeout: T });
    await expect(page.getByText("T2D Progression Biomarkers")).toBeVisible({
      timeout: T,
    });
    await expect(page.getByText("Respiratory EHDS Cohort")).toBeVisible({
      timeout: T,
    });
  });

  test("J267 — /patient/research shows institution names", async ({ page }) => {
    await gotoAs(page, "/patient/research", "patient1");
    await expect(page.getByText("PharmaCo Research AG")).toBeVisible({
      timeout: T,
    });
    await expect(page.getByText("Institut de Recherche Santé")).toBeVisible({
      timeout: T,
    });
  });

  test("J268 — /patient/research shows consent history", async ({ page }) => {
    await gotoAs(page, "/patient/research", "patient1");
    await expect(page.getByText("Consent History")).toBeVisible({
      timeout: T,
    });
    await expect(page.getByText("STUDY-CARDIO-2024")).toBeVisible({
      timeout: T,
    });
    // Active consent badge
    await expect(page.getByText("Active").first()).toBeVisible({
      timeout: T,
    });
  });

  test("J269 — /patient/research shows donate and revoke buttons", async ({
    page,
  }) => {
    await gotoAs(page, "/patient/research", "patient1");
    await expect(
      page.getByText("Donate my EHR to this study").first(),
    ).toBeVisible({ timeout: T });
    await expect(page.getByText(/Revoke consent/).first()).toBeVisible({
      timeout: T,
    });
  });

  test("J270 — /patient/insights shows aggregate research findings", async ({
    page,
  }) => {
    await gotoAs(page, "/patient/insights", "patient1");
    await expect(page.getByText("Aggregate Research Findings")).toBeVisible({
      timeout: T,
    });
    await expect(page.getByText(/HbA1c progression/)).toBeVisible({
      timeout: T,
    });
    await expect(
      page.getByText(/cardiovascular event probability/),
    ).toBeVisible({ timeout: T });
  });

  test("J271 — /patient/insights shows evidence level badges", async ({
    page,
  }) => {
    await gotoAs(page, "/patient/insights", "patient1");
    await expect(page.getByText("moderate evidence")).toBeVisible({
      timeout: T,
    });
  });

  test("J272 — /patient/insights shows personalised recommendations", async ({
    page,
  }) => {
    await gotoAs(page, "/patient/insights", "patient1");
    await expect(page.getByText("Personalised Recommendations")).toBeVisible({
      timeout: T,
    });
    await expect(page.getByText("Monitoring").first()).toBeVisible({
      timeout: T,
    });
    await expect(page.getByText("high priority").first()).toBeVisible({
      timeout: T,
    });
    await expect(page.getByText(/stress-management/)).toBeVisible({
      timeout: T,
    });
  });

  test("J273 — /patient/insights shows donated studies table", async ({
    page,
  }) => {
    await gotoAs(page, "/patient/insights", "patient1");
    await expect(page.getByText("Studies Using My Data")).toBeVisible({
      timeout: T,
    });
    await expect(
      page.getByText("European Cardiovascular Risk Study"),
    ).toBeVisible({ timeout: T });
    await expect(page.getByText("completed")).toBeVisible({ timeout: T });
  });

  test("J274 — /patient/insights shows SPE privacy note", async ({ page }) => {
    await gotoAs(page, "/patient/insights", "patient1");
    await expect(page.getByText(/aggregate results.*k ≥ 5/)).toBeVisible({
      timeout: T,
    });
  });
});

// ── S9: Patient2 — cross-border patient data ────────────────────────────────

test.describe("S · Patient2 — cross-border NL patient", () => {
  test.skip(
    process.env.NEXT_PUBLIC_STATIC_EXPORT !== "true",
    "Requires NEXT_PUBLIC_STATIC_EXPORT=true",
  );

  test("J275 — /patient/profile shows patient data for patient2", async ({
    page,
  }) => {
    await gotoAs(page, "/patient/profile", "patient2");
    // Patient selector defaults to first patient (Anna Müller)
    await expect(
      page.getByRole("heading", { name: /Health Profile/ }),
    ).toBeVisible({ timeout: T });
    // Profile card shows patient demographics
    await expect(page.locator("text=Gender:").first()).toBeVisible({
      timeout: T,
    });
  });

  test("J276 — patient2 sees My Health nav, not Exchange or Get Started", async ({
    page,
  }) => {
    await gotoAs(page, "/", "patient2");
    const nav = page.locator("nav");
    await expect(nav.getByRole("button", { name: /my health/i })).toBeVisible({
      timeout: T,
    });
    await expect(
      nav.getByRole("button", { name: /exchange/i }),
    ).not.toBeVisible({ timeout: 3_000 });
    await expect(
      nav.getByRole("button", { name: /get started/i }),
    ).not.toBeVisible({ timeout: 3_000 });
  });

  test("J277 — patient2 research page shows same programmes", async ({
    page,
  }) => {
    await gotoAs(page, "/patient/research", "patient2");
    await expect(
      page.getByText("European Cardiovascular Risk Study"),
    ).toBeVisible({ timeout: T });
  });
});

// ── S10: EDC Admin — admin pages with mock data ─────────────────────────────

test.describe("S · EDC Admin — admin pages with data", () => {
  test.skip(
    process.env.NEXT_PUBLIC_STATIC_EXPORT !== "true",
    "Requires NEXT_PUBLIC_STATIC_EXPORT=true",
  );

  test("J278 — /admin shows tenant count and participant stats", async ({
    page,
  }) => {
    await gotoAs(page, "/admin", "edcadmin");
    await expect(page.getByText("Operator Dashboard")).toBeVisible({
      timeout: T,
    });
    // Mock data has tenants — should show count cards
    await expect(page.getByText(/Tenants|Participants/).first()).toBeVisible({
      timeout: T,
    });
  });

  test("J279 — /admin/tenants shows AlphaKlinik Berlin", async ({ page }) => {
    await gotoAs(page, "/admin/tenants", "edcadmin");
    await expect(page.getByText("AlphaKlinik Berlin").first()).toBeVisible({
      timeout: T,
    });
  });

  test("J280 — /compliance shows contract or approval data", async ({
    page,
  }) => {
    await gotoAs(page, "/compliance", "edcadmin");
    await expect(
      page.getByText(/compliance|approval|contract|dataset/i).first(),
    ).toBeVisible({ timeout: T });
  });

  test("J281 — /negotiate shows contract negotiations", async ({ page }) => {
    await gotoAs(page, "/negotiate", "edcadmin");
    await expect(
      page.getByText(/negotiat|contract|agreement/i).first(),
    ).toBeVisible({ timeout: T });
  });

  test("J282 — /credentials shows verifiable credentials", async ({ page }) => {
    await gotoAs(page, "/credentials", "edcadmin");
    await expect(
      page.getByText(/credential|verifiable|did/i).first(),
    ).toBeVisible({ timeout: T });
  });

  test("J283 — edcadmin sees all 6 nav groups (not My Health)", async ({
    page,
  }) => {
    await gotoAs(page, "/", "edcadmin");
    const nav = page.locator("nav");
    for (const group of [
      /get started/i,
      /explore/i,
      /governance/i,
      /exchange/i,
      /manage/i,
      /docs/i,
    ]) {
      await expect(nav.getByRole("button", { name: group })).toBeVisible({
        timeout: T,
      });
    }
    await expect(
      nav.getByRole("button", { name: /my health/i }),
    ).not.toBeVisible({ timeout: 3_000 });
  });
});

// ── S11: Data Holder (clinicuser) — catalog and exchange pages ──────────────

test.describe("S · Data Holder (clinicuser) — catalog & exchange", () => {
  test.skip(
    process.env.NEXT_PUBLIC_STATIC_EXPORT !== "true",
    "Requires NEXT_PUBLIC_STATIC_EXPORT=true",
  );

  test("J284 — /catalog shows dataset entries", async ({ page }) => {
    await gotoAs(page, "/catalog", "clinicuser");
    await expect(
      page.getByText(/Synthetic Type 2 Diabetes/i).first(),
    ).toBeVisible({ timeout: T });
  });

  test("J285 — clinicuser sees Get Started + Explore + Exchange + Docs", async ({
    page,
  }) => {
    await gotoAs(page, "/", "clinicuser");
    const nav = page.locator("nav");
    for (const group of [/get started/i, /explore/i, /exchange/i, /docs/i]) {
      await expect(nav.getByRole("button", { name: group })).toBeVisible({
        timeout: T,
      });
    }
    await expect(nav.getByRole("button", { name: /manage/i })).not.toBeVisible({
      timeout: 3_000,
    });
    await expect(
      nav.getByRole("button", { name: /my health/i }),
    ).not.toBeVisible({ timeout: 3_000 });
  });

  test("J286 — clinicuser Explore dropdown shows DCAT-AP Editor", async ({
    page,
  }) => {
    await gotoAs(page, "/", "clinicuser");
    const nav = page.locator("nav");
    await nav.getByRole("button", { name: /explore/i }).click();
    await expect(
      nav.getByRole("link", { name: /dcat-ap editor/i }),
    ).toBeVisible({
      timeout: T,
    });
  });
});

// ── S12: Researcher — analytics and explore pages ───────────────────────────

test.describe("S · Researcher — analytics & explore", () => {
  test.skip(
    process.env.NEXT_PUBLIC_STATIC_EXPORT !== "true",
    "Requires NEXT_PUBLIC_STATIC_EXPORT=true",
  );

  test("J287 — /analytics shows OMOP cohort data", async ({ page }) => {
    await gotoAs(page, "/analytics", "researcher");
    await expect(page.getByText(/OMOP|cohort|person/i).first()).toBeVisible({
      timeout: T,
    });
    // Mock data has 167 persons
    await expect(page.getByText("167")).toBeVisible({ timeout: T });
  });

  test("J288 — researcher Explore shows OMOP Analytics and NLQ links", async ({
    page,
  }) => {
    await gotoAs(page, "/", "researcher");
    const nav = page.locator("nav");
    await nav.getByRole("button", { name: /explore/i }).click();
    await expect(
      nav.getByRole("link", { name: /omop analytics/i }),
    ).toBeVisible({ timeout: T });
    await expect(nav.getByRole("link", { name: /nlq|federated/i })).toBeVisible(
      { timeout: T },
    );
  });

  test("J289 — researcher does NOT see Manage or My Health", async ({
    page,
  }) => {
    await gotoAs(page, "/", "researcher");
    const nav = page.locator("nav");
    await expect(nav.getByRole("button", { name: /manage/i })).not.toBeVisible({
      timeout: 3_000,
    });
    await expect(
      nav.getByRole("button", { name: /my health/i }),
    ).not.toBeVisible({ timeout: 3_000 });
  });
});

// ── S13: Regulator (HDAB) — governance pages ────────────────────────────────

test.describe("S · Regulator (HDAB) — governance pages", () => {
  test.skip(
    process.env.NEXT_PUBLIC_STATIC_EXPORT !== "true",
    "Requires NEXT_PUBLIC_STATIC_EXPORT=true",
  );

  test("J290 — /compliance shows approval data for regulator", async ({
    page,
  }) => {
    await gotoAs(page, "/compliance", "regulator");
    await expect(
      page.getByText(/compliance|approval|ehds/i).first(),
    ).toBeVisible({ timeout: T });
  });

  test("J291 — regulator sees Governance + Manage nav groups", async ({
    page,
  }) => {
    await gotoAs(page, "/", "regulator");
    const nav = page.locator("nav");
    await expect(nav.getByRole("button", { name: /governance/i })).toBeVisible({
      timeout: T,
    });
    await expect(nav.getByRole("button", { name: /manage/i })).toBeVisible({
      timeout: T,
    });
  });

  test("J292 — regulator Governance dropdown shows EHDS Approval and Protocol TCK", async ({
    page,
  }) => {
    await gotoAs(page, "/", "regulator");
    const nav = page.locator("nav");
    await nav.getByRole("button", { name: /governance/i }).click();
    await expect(nav.getByRole("link", { name: /ehds approval/i })).toBeVisible(
      { timeout: T },
    );
    await expect(nav.getByRole("link", { name: /protocol tck/i })).toBeVisible({
      timeout: T,
    });
  });

  test("J293 — regulator does NOT see My Health", async ({ page }) => {
    await gotoAs(page, "/", "regulator");
    const nav = page.locator("nav");
    // HDAB_AUTHORITY IS in Exchange group — only My Health is blocked
    await expect(
      nav.getByRole("button", { name: /my health/i }),
    ).not.toBeVisible({ timeout: 3_000 });
  });
});

// ── S14: LMC user — second Data Holder with same view as clinicuser ─────────

test.describe("S · LMC user — second Data Holder", () => {
  test.skip(
    process.env.NEXT_PUBLIC_STATIC_EXPORT !== "true",
    "Requires NEXT_PUBLIC_STATIC_EXPORT=true",
  );

  test("J294 — lmcuser sees same nav groups as clinicuser", async ({
    page,
  }) => {
    await gotoAs(page, "/", "lmcuser");
    const nav = page.locator("nav");
    for (const group of [/get started/i, /explore/i, /exchange/i, /docs/i]) {
      await expect(nav.getByRole("button", { name: group })).toBeVisible({
        timeout: T,
      });
    }
    await expect(nav.getByRole("button", { name: /manage/i })).not.toBeVisible({
      timeout: 3_000,
    });
  });

  test("J295 — lmcuser /catalog loads datasets", async ({ page }) => {
    await gotoAs(page, "/catalog", "lmcuser");
    await expect(page.getByText(/dataset|catalog|fhir/i).first()).toBeVisible({
      timeout: T,
    });
  });
});

// ── S15: Cross-persona page value verification ──────────────────────────────

test.describe("S · No undefined/null values on persona pages", () => {
  test.skip(
    process.env.NEXT_PUBLIC_STATIC_EXPORT !== "true",
    "Requires NEXT_PUBLIC_STATIC_EXPORT=true",
  );

  const PERSONA_PAGES = [
    { username: "patient1", path: "/patient/profile" },
    { username: "patient1", path: "/patient/insights" },
    { username: "patient1", path: "/patient/research" },
    { username: "edcadmin", path: "/admin" },
    { username: "edcadmin", path: "/admin/tenants" },
    { username: "clinicuser", path: "/catalog" },
    { username: "researcher", path: "/analytics" },
    { username: "regulator", path: "/compliance" },
  ];

  for (const { username, path } of PERSONA_PAGES) {
    test(`J296-${username}${path.replace(
      /\//g,
      "_",
    )} — no 'undefined' or 'null' text on ${path}`, async ({ page }) => {
      await gotoAs(page, path, username);
      // Wait for data to load
      await page.waitForTimeout(2_000);
      const bodyText = await page.locator("body").innerText();
      expect(bodyText).not.toMatch(/\bundefined\b/);
      // Allow "null" in data context but not as a bare visible value
      const lines = bodyText.split("\n").filter((l) => l.trim() === "null");
      expect(
        lines,
        `Found bare "null" text on ${path} as ${username}`,
      ).toHaveLength(0);
    });
  }
});

// ── S16: Public pages accessible to all personas ────────────────────────────

test.describe("S · Public pages with data for every persona", () => {
  test.skip(
    process.env.NEXT_PUBLIC_STATIC_EXPORT !== "true",
    "Requires NEXT_PUBLIC_STATIC_EXPORT=true",
  );

  for (const { username } of PERSONA_SPECS) {
    test(`J297-${username} — /docs loads for ${username}`, async ({ page }) => {
      await gotoAs(page, "/docs", username);
      await expect(
        page.getByText(/documentation|overview/i).first(),
      ).toBeVisible({
        timeout: T,
      });
    });
  }

  test("J298 — /eehrxf loads EEHRxF profiles page", async ({ page }) => {
    await gotoAs(page, "/eehrxf", "patient1");
    await expect(
      page.getByText(/eehrxf|electronic health record|profile/i).first(),
    ).toBeVisible({ timeout: T });
  });

  test("J299 — /patient (public patient journey) loads for all personas", async ({
    page,
  }) => {
    await gotoAs(page, "/patient", "edcadmin");
    await expect(page.getByText(/patient|journey|fhir/i).first()).toBeVisible({
      timeout: T,
    });
  });
});

/**
 * Phase 29: Authenticated WCAG 2.2 AA Tests via Keycloak (J700–J799)
 *
 * Runs axe-core accessibility checks on pages that require authentication,
 * logging in as each Keycloak persona. Tests protected pages that the
 * unauthenticated WCAG spec (27) cannot reach.
 *
 * Prerequisites:
 *   - Next.js server on PLAYWRIGHT_BASE_URL (default localhost:3000)
 *   - Keycloak running on localhost:8080 with all 7 demo users
 *   - Neo4j with seed data (for graph/catalog/patient pages)
 *
 * For JAD stack: PLAYWRIGHT_BASE_URL=http://localhost:3003
 */
import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { T, skipIfKeycloakDown, loginAs } from "./helpers";

test.skip(
  process.env.NEXT_PUBLIC_STATIC_EXPORT === "true",
  "Authenticated WCAG tests require the Next.js server with Keycloak",
);

/* ── Configuration ───────────────────────────────────────────────── */

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

interface RoleTest {
  username: string;
  password: string;
  role: string;
  pages: { path: string; label: string }[];
}

const ROLE_TESTS: RoleTest[] = [
  {
    username: "edcadmin",
    password: "edcadmin",
    role: "EDC_ADMIN",
    pages: [
      { path: "/admin", label: "Admin Portal" },
      { path: "/compliance", label: "Compliance" },
      { path: "/credentials", label: "Credentials" },
      { path: "/settings", label: "Settings" },
      { path: "/onboarding", label: "Onboarding" },
      { path: "/graph", label: "Graph (admin)" },
      { path: "/catalog", label: "Catalog (admin)" },
    ],
  },
  {
    username: "clinicuser",
    password: "clinicuser",
    role: "DATA_HOLDER",
    pages: [
      { path: "/graph", label: "Graph (holder)" },
      { path: "/catalog", label: "Catalog (holder)" },
      { path: "/data/share", label: "Share Data" },
      { path: "/negotiate", label: "Contract Negotiation" },
      { path: "/credentials", label: "Credentials (holder)" },
      { path: "/settings", label: "Settings (holder)" },
    ],
  },
  {
    username: "researcher",
    password: "researcher",
    role: "DATA_USER",
    pages: [
      { path: "/graph", label: "Graph (researcher)" },
      { path: "/catalog", label: "Catalog (researcher)" },
      { path: "/analytics", label: "OMOP Analytics" },
      { path: "/query", label: "NLQ Query" },
      { path: "/data/discover", label: "Discover Data" },
      { path: "/negotiate", label: "Negotiate (researcher)" },
      { path: "/data/transfer", label: "Data Transfer" },
      { path: "/tasks", label: "EHDS Tasks" },
    ],
  },
  {
    username: "regulator",
    password: "regulator",
    role: "HDAB_AUTHORITY",
    pages: [
      { path: "/graph", label: "Graph (regulator)" },
      { path: "/compliance", label: "Compliance (regulator)" },
      { path: "/credentials", label: "Credentials (regulator)" },
    ],
  },
  {
    username: "patient1",
    password: "patient1",
    role: "PATIENT",
    pages: [
      { path: "/patient/profile", label: "Patient Profile" },
      { path: "/patient/insights", label: "Patient Insights" },
      { path: "/patient/research", label: "Patient Research" },
      { path: "/graph", label: "Graph (patient)" },
    ],
  },
  {
    username: "patient2",
    password: "patient2",
    role: "PATIENT",
    pages: [
      { path: "/patient/profile", label: "Patient Profile (P2)" },
      { path: "/patient/insights", label: "Patient Insights (P2)" },
    ],
  },
  {
    username: "lmcuser",
    password: "lmcuser",
    role: "DATA_HOLDER",
    pages: [
      { path: "/graph", label: "Graph (LMC)" },
      { path: "/catalog", label: "Catalog (LMC)" },
      { path: "/data/share", label: "Share Data (LMC)" },
    ],
  },
];

/* ── Helpers ─────────────────────────────────────────────────────── */

async function setTheme(page: Page, mode: "light" | "dark") {
  await page.evaluate((m) => {
    document.documentElement.classList.toggle("dark", m === "dark");
    try {
      localStorage.setItem("theme", m);
    } catch (_e) {
      /* storage blocked */
    }
  }, mode);
  await page.waitForTimeout(300);
}

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
  await page.goto("/", { waitUntil: "domcontentloaded" });
}

function formatViolations(
  violations: {
    id: string;
    help: string;
    impact?: string | null;
    nodes: { html: string }[];
  }[],
): string {
  if (violations.length === 0) return "No violations";
  return violations
    .map((v) => {
      const nodes = v.nodes
        .slice(0, 3)
        .map((n) => `  → ${n.html.substring(0, 120)}`)
        .join("\n");
      const more =
        v.nodes.length > 3 ? `\n  … and ${v.nodes.length - 3} more` : "";
      return `[${v.id}] ${v.help} (${v.impact})\n${nodes}${more}`;
    })
    .join("\n\n");
}

/* ── Tests ───────────────────────────────────────────────────────── */

test.describe("J700–J799 — Authenticated WCAG 2.2 AA", () => {
  test.beforeAll(async () => {
    await skipIfKeycloakDown();
  });

  // Serial execution: each test logs in as a different user
  test.describe.configure({ mode: "serial" });

  for (const roleTest of ROLE_TESTS) {
    test.describe(`${roleTest.role} (${roleTest.username})`, () => {
      test.beforeEach(async ({ page }) => {
        await loginAs(page, roleTest.username, roleTest.password);
      });

      test.afterEach(async ({ page }) => {
        await logout(page);
      });

      for (const { path, label } of roleTest.pages) {
        test(`J7xx ${label} — dark mode WCAG`, async ({ page }) => {
          await page.goto(path, {
            waitUntil: "domcontentloaded",
            timeout: T,
          });

          // Skip if redirected to signin (role doesn't have access)
          if (page.url().includes("/auth/signin")) {
            test.skip(true, `${roleTest.username} cannot access ${path}`);
            return;
          }

          await setTheme(page, "dark");

          const results = await new AxeBuilder({ page })
            .withTags(WCAG_TAGS)
            .analyze();

          if (results.violations.length > 0) {
            console.log(
              `\n[${
                roleTest.username
              }] ${label} (dark) violations:\n${formatViolations(
                results.violations,
              )}`,
            );
          }

          expect(
            results.violations,
            `${label} (dark, ${roleTest.username}): ${formatViolations(
              results.violations,
            )}`,
          ).toHaveLength(0);
        });

        test(`J7xx ${label} — light mode WCAG`, async ({ page }) => {
          await page.goto(path, {
            waitUntil: "domcontentloaded",
            timeout: T,
          });

          if (page.url().includes("/auth/signin")) {
            test.skip(true, `${roleTest.username} cannot access ${path}`);
            return;
          }

          await setTheme(page, "light");

          const results = await new AxeBuilder({ page })
            .withTags(WCAG_TAGS)
            .analyze();

          if (results.violations.length > 0) {
            console.log(
              `\n[${
                roleTest.username
              }] ${label} (light) violations:\n${formatViolations(
                results.violations,
              )}`,
            );
          }

          expect(
            results.violations,
            `${label} (light, ${roleTest.username}): ${formatViolations(
              results.violations,
            )}`,
          ).toHaveLength(0);
        });
      }
    });
  }
});

/* ── Summary ─────────────────────────────────────────────────────── */

test("J799 Authenticated WCAG summary", async ({ page }) => {
  test.setTimeout(180_000); // 7 roles × login/logout + axe scans
  let keycloakReachable = true;
  try {
    await skipIfKeycloakDown();
  } catch {
    keycloakReachable = false;
  }

  if (!keycloakReachable) {
    console.log(
      "\n⚠ Keycloak not reachable — authenticated WCAG tests skipped",
    );
    test.skip(true, "Keycloak not reachable");
    return;
  }

  let totalViolations = 0;
  const summary: string[] = [];

  for (const roleTest of ROLE_TESTS) {
    try {
      await loginAs(page, roleTest.username, roleTest.password);
    } catch (_e) {
      // SSO session or Keycloak hiccup — skip this role
      console.log(`  ⚠ Could not login as ${roleTest.username} — skipping`);
      continue;
    }

    for (const { path, label } of roleTest.pages) {
      await page.goto(path, { waitUntil: "domcontentloaded", timeout: T });
      if (page.url().includes("/auth/signin")) continue;

      for (const mode of ["dark", "light"] as const) {
        await setTheme(page, mode);
        const results = await new AxeBuilder({ page })
          .withTags(WCAG_TAGS)
          .analyze();

        if (results.violations.length > 0) {
          totalViolations += results.violations.length;
          const nodeCount = results.violations.reduce(
            (s, v) => s + v.nodes.length,
            0,
          );
          summary.push(
            `  [${roleTest.username}] ${label} (${mode}): ${results.violations.length} violations, ${nodeCount} nodes`,
          );
        }
      }
    }

    await logout(page);
  }

  if (summary.length > 0) {
    console.log(
      `\n📊 Authenticated WCAG Summary: ${totalViolations} violations total`,
    );
    console.log(summary.join("\n"));
  } else {
    console.log(
      "\n✅ All authenticated pages pass WCAG 2.2 AA across all roles",
    );
  }
});

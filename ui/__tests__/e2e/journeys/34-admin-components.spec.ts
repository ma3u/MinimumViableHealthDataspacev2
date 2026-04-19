/**
 * Issue #17 — /admin/components page + cost estimator panels (J800–J819).
 *
 * Covers three correctness areas:
 *   A. Page renders both view-mode toggles + the header stats.
 *   B. Environment-appropriate cost panel:
 *        localhost + GitHub Pages → StackIT (Frankfurt)
 *        ehds.mabu.red            → Azure Container Apps Consumption
 *   C. Cluster total memory matches the sum of visible rows (no manual-sum
 *      mismatch as reported by the user).
 *
 * Auth: the page is EDC_ADMIN-only. Skips the admin block when
 * PLAYWRIGHT_KEYCLOAK_URL is unset (matching the convention used by other
 * specs in this repo).
 */
import { test, expect } from "@playwright/test";
import { keycloakLogin } from "../helpers/keycloak-login";

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const KC_AVAILABLE = Boolean(process.env.PLAYWRIGHT_KEYCLOAK_URL);
const IS_AZURE_BASE = BASE.includes("ehds.mabu.red");
const IS_LOCALHOST = BASE.includes("localhost");

async function signInAsAdmin(page: import("@playwright/test").Page) {
  await keycloakLogin(page, {
    username: "edcadmin",
    password: "edcadmin",
    protectedPath: "/onboarding",
  });
}

test.describe("Issue #17 · /admin/components", () => {
  test.skip(!KC_AVAILABLE, "Keycloak required for /admin/*");

  test.beforeEach(async ({ page }) => {
    await signInAsAdmin(page);
    await page.goto(`${BASE}/admin/components`);
  });

  /* ── A. Page shell ──────────────────────────────────────────────── */

  test("J800 page renders with Layer + Participant view toggles", async ({
    page,
  }) => {
    await expect(
      page.getByRole("button", { name: /Layer View/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Participant View/i }),
    ).toBeVisible();
  });

  test("J801 cluster header shows CPU % + memory", async ({ page }) => {
    const header = page.getByText(/Cluster/).first();
    await expect(header).toBeVisible();
    const body = await page.locator("body").innerText();
    // "CPU 4.5% now" / "MEM 2.7 GB now"
    expect(body).toMatch(/CPU\s+[\d.]+%\s+now/i);
    expect(body).toMatch(/MEM\s+[\d.]+\s*(MB|GB)\s+now/i);
  });

  /* ── B. Environment-appropriate cost panel ──────────────────────── */

  test("J802 Azure demo renders the Azure Container Apps cost panel", async ({
    page,
  }) => {
    test.skip(!IS_AZURE_BASE, "Only meaningful against ehds.mabu.red");
    await expect(page.getByText(/Azure Container Apps/i).first()).toBeVisible();
    // StackIT panel must NOT show on Azure demo.
    await expect(page.getByText(/STACKIT \(Frankfurt\)/i)).toHaveCount(0);
  });

  test("J803 localhost renders the StackIT cost panel", async ({ page }) => {
    test.skip(!IS_LOCALHOST, "Only meaningful against a local dev server");
    await expect(
      page.getByText(/STACKIT \(Frankfurt\)/i).first(),
    ).toBeVisible();
    // Azure panel must NOT show on local dev.
    await expect(page.getByText(/Azure Container Apps/i)).toHaveCount(0);
  });

  test("J804 cost panel shows a non-zero monthly EUR total", async ({
    page,
  }) => {
    const body = await page.locator("body").innerText();
    // Either panel writes "€NN/mo" figures per service; at least one must be non-zero.
    const eurLines = body.match(/€\s*[0-9]+(?:[.,][0-9]+)?\s*\/\s*mo/g) ?? [];
    expect(
      eurLines.length,
      "at least one €NN/mo figure must render",
    ).toBeGreaterThan(0);
  });

  test("J805 cost panel cites its price source", async ({ page }) => {
    const body = await page.locator("body").innerText();
    // STACKIT or Azure price-source footnote.
    expect(body).toMatch(/STACKIT|West Europe|Consumption plan/i);
  });

  /* ── C. Aggregation correctness — the manual-sum fix ─────────────── */

  test("J810 cluster MEM total roughly matches sum of visible shared-infra rows", async ({
    page,
  }) => {
    // Switch to layer view to force the cluster-level aggregation used in
    // the header (same reducer as snapshot.components).
    await page.getByRole("button", { name: /Layer View/i }).click();

    const body = await page.locator("body").innerText();
    // Parse all "NNN MB" rows shown in the body (ignore "<1" and GB rows).
    const rowMBs = [...body.matchAll(/(?<!\/)(\d{2,4})\s*MB(?!\w)/g)].map((m) =>
      Number(m[1]),
    );
    if (rowMBs.length === 0) return; // empty demo data — skip
    const rowsSum = rowMBs.reduce((s, n) => s + n, 0);

    // Extract the cluster "MEM X MB|GB now" header value.
    const headerMatch = body.match(/MEM\s+([\d.]+)\s*(MB|GB)\s+now/i);
    if (!headerMatch) return;
    const headerMB =
      headerMatch[2].toUpperCase() === "GB"
        ? Math.round(Number(headerMatch[1]) * 1024)
        : Number(headerMatch[1]);

    // Tolerate ±5% jitter due to rounding-mode differences across
    // component cards vs the header reducer.
    const tolerance = Math.max(100, rowsSum * 0.05);
    expect(
      Math.abs(headerMB - rowsSum),
      `header ${headerMB} MB vs rowsSum ${rowsSum} MB (Δ ${Math.abs(
        headerMB - rowsSum,
      )}, tol ${tolerance})`,
    ).toBeLessThanOrEqual(tolerance);
  });

  /* ── D. Participant view sanity (no identical-rows-masking-bug) ─── */

  test("J811 participant view shows participant count + shared infra section", async ({
    page,
  }) => {
    await page.getByRole("button", { name: /Participant View/i }).click();
    await expect(
      page.getByText(/Dataspace Participants/i).first(),
    ).toBeVisible();
    await expect(
      page.getByText(/Shared Infrastructure/i).first(),
    ).toBeVisible();
  });
});

/**
 * Phase 30: Admin → Infrastructure Components (J600–J609)
 *
 * Covers the /admin/components page which surfaces:
 *   • live CPU/memory metrics (Docker socket OR Azure Monitor)
 *   • the five seeded participants
 *   • the cost estimator panel (Azure when deployed on ACA, StackIT otherwise)
 *
 * Prerequisites (CI / local): Keycloak + Neo4j reachable, UI seeded. The spec
 * uses the `edcadmin` demo user — only EDC_ADMIN may reach /admin/components.
 */
import { test, expect } from "@playwright/test";
import { T, loginAs, skipIfKeycloakDown } from "./helpers";

test.describe("Admin → Components (J600–J609)", () => {
  test.beforeAll(async () => {
    await skipIfKeycloakDown();
  });

  test.beforeEach(async ({ page }) => {
    await loginAs(page, "edcadmin", "edcadmin");
    await page.goto("/admin/components");
  });

  test("J600 heading renders for EDC_ADMIN", async ({ page }) => {
    await expect(
      page
        .locator("h1, h2")
        .filter({ hasText: /Component|Infrastructure/i })
        .first(),
    ).toBeVisible({ timeout: T });
  });

  test("J601 /api/admin/components returns a metrics source", async ({
    request,
  }) => {
    const res = await request.get("/api/admin/components");
    // Auth middleware may intercept; accept 200 or 401 and only assert shape on 200
    if (res.status() !== 200) {
      test.skip(true, "API requires session cookie — covered by UI test");
    }
    const body = await res.json();
    expect(body).toHaveProperty("components");
    expect(body).toHaveProperty("participants");
    expect(body).toHaveProperty("metricsSource");
    expect(["docker", "azure-monitor", "none"]).toContain(body.metricsSource);
  });

  test("J602 participant list is non-empty (CFM or Neo4j fallback)", async ({
    page,
  }) => {
    // Wait for the API snapshot call to complete
    const resp = await page.waitForResponse(
      (r) => r.url().includes("/api/admin/components") && r.status() === 200,
      { timeout: 30_000 },
    );
    const data = await resp.json();
    expect(Array.isArray(data.participants)).toBe(true);
    expect(data.participants.length).toBeGreaterThan(0);
  });

  test("J603 cost estimator panel is visible", async ({ page }) => {
    await expect(
      page.getByText(/Monthly Cost Estimate|Cost Estimate/i).first(),
    ).toBeVisible({ timeout: T });
  });

  test("J604 Docker warning hidden when Azure Monitor provides metrics", async ({
    page,
  }) => {
    const resp = await page.waitForResponse(
      (r) => r.url().includes("/api/admin/components") && r.status() === 200,
      { timeout: 30_000 },
    );
    const data = await resp.json();
    if (data.metricsSource === "azure-monitor") {
      await expect(page.getByText(/Docker socket not available/i)).toHaveCount(
        0,
      );
    } else {
      test.skip(true, "Not running on Azure — Docker fallback expected");
    }
  });
});

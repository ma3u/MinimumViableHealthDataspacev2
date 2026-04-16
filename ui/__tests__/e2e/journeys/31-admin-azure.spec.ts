/**
 * Phase 31: Admin pages on Azure Container Apps (J610–J619)
 *
 * Regression spec for the four bugs that surfaced once the stack moved from
 * Docker Compose to ACA:
 *
 *   1. /admin/tenants showed 0 participants (CFM tenant-manager unreachable
 *      at Docker hostname `health-dataspace-tenant-manager`).
 *   2. /admin/components showed the STACKIT cost card on an Azure deployment.
 *   3. /admin/components showed empty CPU/memory rows because the topology
 *      route only knew how to talk to the Docker socket.
 *   4. The "Docker socket not available" banner stayed visible on ACA even
 *      after Azure Monitor metrics started flowing.
 *
 * Activation: this spec only runs when PLAYWRIGHT_BASE_URL points at a host
 * we recognise as Azure (substring "azurecontainerapps.io" OR exact match for
 * the prod URL "ehds.mabu.red"). On any other target every test self-skips so
 * the spec stays cheap to keep in the default journey set.
 */
import { test, expect } from "@playwright/test";
import { T, loginAs, skipIfKeycloakDown } from "./helpers";

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const RUNNING_ON_AZURE = /azurecontainerapps\.io|ehds\.mabu\.red/i.test(BASE);

test.describe("Admin → Azure regression (J610–J619)", () => {
  test.beforeAll(async () => {
    if (!RUNNING_ON_AZURE) {
      test.skip(true, `Not an Azure target (BASE=${BASE})`);
    }
    await skipIfKeycloakDown();
  });

  test.beforeEach(async ({ page }) => {
    // Keycloak OIDC login on ACA consumes ~25s (networkidle + OIDC redirect
    // chain). The admin/components route itself can take 10-15s because it
    // sequentially fetches Azure Monitor metrics and CFM tenant data. The 30s
    // default per-test timeout leaves no margin for the API response waits,
    // so raise it for every test in this describe block.
    test.setTimeout(60_000);
    await loginAs(page, "edcadmin", "edcadmin");
  });

  test("J610 /api/admin/components reports deploymentTarget=azure", async ({
    page,
  }) => {
    await page.goto("/admin/components");
    const resp = await page.waitForResponse(
      (r) =>
        r.url().includes("/api/admin/components") &&
        !r.url().includes("/topology") &&
        r.status() === 200,
      { timeout: 30_000 },
    );
    const data = await resp.json();
    expect(data.deploymentTarget).toBe("azure");
  });

  test("J611 /admin/tenants shows ≥5 participants (Neo4j fallback)", async ({
    page,
  }) => {
    await page.goto("/admin/tenants");
    const resp = await page.waitForResponse(
      (r) => r.url().includes("/api/admin/tenants") && r.status() === 200,
      { timeout: 30_000 },
    );
    const data = await resp.json();
    expect(Array.isArray(data.tenants)).toBe(true);
    // The seeded knowledge graph has at least the 5 JAD participants
    // (AlphaKlinik, PharmaCo, MedReg, LMC, IRS) — never zero.
    expect(data.tenants.length).toBeGreaterThanOrEqual(5);
  });

  test("J612 cost panel is Azure, not STACKIT", async ({ page }) => {
    await page.goto("/admin/components");
    await page.waitForResponse(
      (r) => r.url().includes("/api/admin/components") && r.status() === 200,
      { timeout: 30_000 },
    );
    await expect(
      page.getByText(/Monthly Cost Estimate.*Azure Container Apps/i).first(),
    ).toBeVisible({ timeout: T });
    await expect(page.getByText(/Monthly Cost Estimate.*STACKIT/i)).toHaveCount(
      0,
    );
  });

  test("J613 Docker-socket banner is hidden on Azure", async ({ page }) => {
    await page.goto("/admin/components");
    await page.waitForResponse(
      (r) => r.url().includes("/api/admin/components") && r.status() === 200,
      { timeout: 30_000 },
    );
    await expect(page.getByText(/Docker socket not available/i)).toHaveCount(0);
  });

  test("J614 topology route exposes Azure metrics + components", async ({
    page,
  }) => {
    await page.goto("/admin/components");
    const resp = await page.waitForResponse(
      (r) =>
        r.url().includes("/api/admin/components/topology") &&
        r.status() === 200,
      { timeout: 30_000 },
    );
    const data = await resp.json();
    expect(data.deploymentTarget).toBe("azure");
    // Either Azure Monitor is wired or it's still propagating — but the
    // shape should always include infrastructure rows mapped to mvhd-* names.
    const containers = (data.infrastructure ?? []).map(
      (c: { container: string }) => c.container,
    );
    expect(containers.some((c: string) => c.startsWith("mvhd-"))).toBe(true);
  });

  test("J615 at least one component reports non-zero CPU or memory", async ({
    page,
  }) => {
    await page.goto("/admin/components");
    const resp = await page.waitForResponse(
      (r) =>
        r.url().includes("/api/admin/components/topology") &&
        r.status() === 200,
      { timeout: 30_000 },
    );
    const data = await resp.json();
    const allComps = [
      ...(data.participants ?? []).flatMap(
        (p: { components: { cpu: number; memMB: number }[] }) => p.components,
      ),
      ...(data.infrastructure ?? []),
    ];
    // Azure Monitor lags behind ACA boot by ~3 minutes, so we tolerate the
    // first call returning all-zero. Skip if metricsSource isn't yet
    // azure-monitor — this just means the role assignment hasn't propagated
    // or metrics haven't been published yet.
    if (data.metricsSource !== "azure-monitor") {
      test.skip(
        true,
        `metricsSource=${data.metricsSource} — Azure Monitor not wired yet`,
      );
    }
    const anyNonZero = allComps.some(
      (c: { cpu: number; memMB: number }) => c.cpu > 0 || c.memMB > 0,
    );
    expect(anyNonZero).toBe(true);
  });
});

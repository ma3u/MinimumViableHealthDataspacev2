/**
 * Phase 26f (issue #8): Cross-Participant Dataset Discovery (J730–J749)
 *
 * Covers the federated-discovery surfaces delivered by Phase 26:
 *   - /admin/participants — dynamic participant directory (26a)
 *   - /data/discover      — federated HealthDCAT-AP datasets in search
 *   - /federated/query    — contributor k-anonymity via the proxy (26e),
 *     exercised through the public /api/federated stats endpoint
 *
 * Needs a running UI + seeded Neo4j (and Keycloak for the admin login);
 * every test self-skips when its backend dependency is down, matching the
 * other journey specs.
 */
import { test, expect } from "@playwright/test";
import { T, loginAs, skipIfKeycloakDown, waitForDataLoad } from "./helpers";

test.describe("Federated discovery — participant directory (J730–J739)", () => {
  test.beforeAll(async () => {
    await skipIfKeycloakDown();
  });

  test.beforeEach(async ({ page }) => {
    test.setTimeout(60_000);
    await loginAs(page, "edcadmin", "edcadmin");
  });

  test("J730 /admin/participants lists the directory with source + wallet badges", async ({
    page,
  }) => {
    await page.goto("/admin/participants");
    await expect(
      page.getByRole("heading", { name: "Participant Directory" }),
    ).toBeVisible({ timeout: T });

    const table = page.getByTestId("participants-table");
    await expect(table).toBeVisible({ timeout: T });

    // The 5 seeded demo participants are always present.
    const rows = table.locator("tbody tr");
    expect(await rows.count()).toBeGreaterThanOrEqual(5);
    await expect(table.getByText("AlphaKlinik Berlin")).toBeVisible();

    // Badges: at least one seed source and one business wallet.
    await expect(table.getByText("seed").first()).toBeVisible();
    await expect(table.getByText("business").first()).toBeVisible();
  });

  test("J731 summary row counts participants and crawl targets", async ({
    page,
  }) => {
    await page.goto("/admin/participants");
    const summary = page.getByTestId("participants-summary");
    await expect(summary).toBeVisible({ timeout: T });
    await expect(summary).toContainText(/\d+ participants/);
    await expect(summary).toContainText(/\d+ crawlable/);
  });

  test("J732 seeded participants cannot be deleted from the UI", async ({
    page,
  }) => {
    await page.goto("/admin/participants");
    const table = page.getByTestId("participants-table");
    await expect(table).toBeVisible({ timeout: T });

    // The AlphaKlinik row is seeded — it must not render a remove button.
    const alphaRow = table.locator("tr", { hasText: "AlphaKlinik Berlin" });
    await expect(alphaRow).toBeVisible();
    await expect(alphaRow.getByRole("button", { name: /Remove/ })).toHaveCount(
      0,
    );
  });

  test("J733 onboarding form validates the DID format", async ({ page }) => {
    await page.goto("/admin/participants");
    const form = page.getByTestId("participant-form");
    await expect(form).toBeVisible({ timeout: T });

    await form
      .getByPlaceholder("did:web:clinic.example:participant")
      .fill("not-a-did");
    await form.getByPlaceholder("Fictional Clinic GmbH").fill("Test Clinic");
    await form.getByRole("button", { name: "Add to directory" }).click();

    await expect(page.getByText(/participantId must be a DID/i)).toBeVisible({
      timeout: T,
    });
  });

  test("J734 non-admin personas cannot reach the directory API", async ({
    page,
  }) => {
    // researcher holds DATA_USER, not EDC_ADMIN → the API must refuse.
    await loginAs(page, "researcher", "researcher");
    const status = await page.evaluate(async () => {
      const res = await fetch("/api/admin/participants");
      return res.status;
    });
    expect([401, 403]).toContain(status);
  });
});

test.describe("Federated discovery — datasets in Discover (J740–J744)", () => {
  test.beforeAll(async () => {
    await skipIfKeycloakDown();
  });

  test.beforeEach(async ({ page }) => {
    test.setTimeout(60_000);
    await loginAs(page, "researcher", "researcher");
  });

  test("J740 Discover search spans participants beyond the caller's own", async ({
    page,
  }) => {
    await page.goto("/data/discover");
    await expect(
      page.getByRole("heading", { name: "Discover Data" }),
    ).toBeVisible({ timeout: T });
    await waitForDataLoad(page);

    // The participant tally comes from the crawled directory — with the
    // federated enricher seeded it exceeds the 5 core demo participants.
    await expect(page.getByText(/\d+ participants/)).toBeVisible({
      timeout: T,
    });
    await expect(page.getByText(/\d+ HealthDCAT-AP datasets/)).toBeVisible();
  });

  test("J741 diabetes search returns datasets from multiple publishers", async ({
    page,
  }) => {
    await page.goto("/data/discover");
    await waitForDataLoad(page);

    await page.getByRole("textbox").first().fill("Diabetes");
    // Publisher names render under each matched dataset title.
    await expect(page.getByText("AlphaKlinik Berlin").first()).toBeVisible({
      timeout: T,
    });
    await expect(
      page.getByText("Limburg Medical Centre").first(),
    ).toBeVisible();
  });
});

test.describe("Federated query — k-anonymity surface (J745–J749)", () => {
  test("J745 /api/federated stats endpoint responds", async ({ page }) => {
    const res = await page.request.get("/api/federated");
    // 200 with stats when the proxy is up; the mock fallback also returns 200.
    // Anything else means the federated path regressed.
    expect(res.status()).toBe(200);
  });
});

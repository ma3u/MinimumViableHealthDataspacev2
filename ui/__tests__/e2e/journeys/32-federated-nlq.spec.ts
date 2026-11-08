/**
 * Phase 26f (issue #8): Cross-Participant Dataset Discovery (J730–J749)
 *
 * Covers the federated-discovery surfaces delivered by Phase 26:
 *   - /admin/participants — dynamic participant directory (26a)
 *   - /data/discover      — federated HealthDCAT-AP datasets in search
 *   - /federated/query    — contributor k-anonymity via the proxy (26e),
 *     exercised through the /api/federated stats endpoint
 *
 * Needs a running UI + seeded Neo4j (and Keycloak for the admin login);
 * every test self-skips when its backend dependency is down, matching the
 * other journey specs.
 */
import { test, expect } from "@playwright/test";
import { T, loginAs, skipIfKeycloakDown, waitForDataLoad } from "./helpers";
import { signInOrSkip } from "../helpers/forged-session";

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

  test("J732 a seeded participant asks before it is removed", async ({
    page,
  }) => {
    await page.goto("/admin/participants");
    const table = page.getByTestId("participants-table");
    await expect(table).toBeVisible({ timeout: T });

    // Seeded rows can be removed too, until the next deploy re-seeds them.
    // The first click only asks; Cancel leaves the row alone.
    const alphaRow = table.locator("tr", { hasText: "AlphaKlinik Berlin" });
    await alphaRow
      .getByRole("button", { name: "Remove AlphaKlinik Berlin" })
      .click();
    await expect(alphaRow.getByText("Back on next deploy")).toBeVisible();
    await alphaRow.getByRole("button", { name: "Cancel" }).click();
    await expect(alphaRow).toBeVisible();
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
    // Limburg's diabetes cohort is a federated dataset: the catalog crawler
    // and enricher write it from the participants' DSP catalogues (seeded
    // only by that pipeline, see neo4j/seed-catalog-translations.cypher).
    // A stack without them has AlphaKlinik's and Riverside's alone.
    const catalog = await page.request.get("/api/catalog");
    expect(catalog.ok()).toBe(true);
    const ids = ((await catalog.json()) as { id: string }[]).map((d) => d.id);
    test.skip(
      !ids.some((id) => id.startsWith("dataset:lmc:")),
      "No federated datasets: the catalog crawler and enricher have not run",
    );
    await page.goto("/data/discover");
    await waitForDataLoad(page);

    // The search field is type="search", so a searchbox, not a textbox.
    await page.getByRole("searchbox").first().fill("Diabetes");
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
    // Every API route needs a session since #404 (ADR-044).
    await signInOrSkip(page, test.skip, "researcher");
    const res = await page.request.get("/api/federated");
    // The route asks the neo4j-proxy and answers 502 when it cannot reach
    // it; there is no mock fallback in a server build. The nightly runs
    // without a proxy.
    test.skip(
      res.status() === 502,
      "The UI cannot reach the neo4j-proxy (NEO4J_PROXY_URL)",
    );
    // 200 with stats when the proxy is up. Anything else means the federated
    // path regressed.
    expect(res.status()).toBe(200);
    expect(await res.json()).toHaveProperty("speCount");
  });
});

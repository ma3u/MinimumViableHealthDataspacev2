/**
 * Journey Group D — Discovery & Federated Search (J23–J30)
 *
 * Verifies dataset discovery via catalog search, graph exploration,
 * patient journey querying, and federated catalog statistics.
 *
 * Public pages used: /catalog, /graph, /patient, /analytics.
 * APIs used: /api/catalog, /api/federated.
 * Protected pages: verify redirect.
 */
import { test, expect } from "@playwright/test";
import {
  T,
  expectHeading,
  expectSigninRedirect,
  waitForDataLoad,
  apiGet,
} from "./helpers";

const isCI = !!process.env.CI;

test.describe("D · Discovery & Federated Search", () => {
  /* ── J23: Search catalog by keyword "FHIR" ───────────────── */
  test("J23 — Catalog page displays FHIR datasets", async ({ page }) => {
    await page.goto("/catalog");
    await expectHeading(page, "Dataset Catalog");
    await waitForDataLoad(page);

    // FHIR datasets should be visible in the catalog
    await expect(page.getByText(/FHIR/).first()).toBeVisible({ timeout: T });
  });

  /* ── J24: Catalog API has multiple dataset types ─────────── */
  test("J24 — Catalog API includes datasets with various types", async ({
    page,
  }) => {
    const datasets = await apiGet(page, "/api/catalog");
    expect(datasets.length).toBeGreaterThanOrEqual(10);

    // At least one dataset should have a title
    const withTitles = datasets.filter(
      (d: { title?: string }) => d.title != null,
    );
    expect(withTitles.length).toBeGreaterThanOrEqual(5);
  });

  /* ── J25: Clinical trial datasets discoverable ───────────── */
  test("J25 — Clinical trial dataset exists in catalog API", async ({
    page,
  }) => {
    const datasets = await apiGet(page, "/api/catalog");
    const trial = datasets.find(
      (d: { title?: string }) => d.title?.includes("Clinical Trial"),
    );
    expect(trial).toBeTruthy();
  });

  /* ── J26: Discover page (protected) redirects ────────────── */
  test("J26 — Discover Data page requires authentication", async ({ page }) => {
    await page.goto("/data/discover");
    await expectSigninRedirect(page);
  });

  /* ── J27: Graph Explorer renders layer sidebar ───────────── */
  test("J27 — Graph Explorer shows all 5 graph layers", async ({ page }) => {
    test.skip(isCI, "Requires live Neo4j");
    await page.goto("/graph");

    await expect(page.getByText("Layers").first()).toBeVisible({ timeout: T });

    const layers = [
      "Marketplace",
      "HealthDCAT-AP",
      "FHIR R4",
      "OMOP CDM",
      "Ontology",
    ];
    for (const layer of layers) {
      await expect(page.getByText(layer).first()).toBeVisible({ timeout: T });
    }
  });

  /* ── J28: Graph canvas renders with FHIR and OMOP layers ── */
  test("J28 — Graph canvas renders and includes FHIR R4 + OMOP CDM", async ({
    page,
  }) => {
    test.skip(isCI, "Requires live Neo4j");

    await page.goto("/graph");
    await expect(page.getByText("Layers").first()).toBeVisible({ timeout: T });

    const canvas = page.locator("canvas");
    await expect(canvas.first()).toBeVisible({ timeout: T });

    await expect(page.getByText("FHIR R4").first()).toBeVisible({ timeout: T });
    await expect(page.getByText("OMOP CDM").first()).toBeVisible({
      timeout: T,
    });
  });

  /* ── J29: Patient Journey page renders cohort data ───────── */
  test("J29 — Patient Journey page shows patient cohort", async ({ page }) => {
    await page.goto("/patient");
    await expectHeading(page, "Patient Journey");
    await waitForDataLoad(page);

    await expect(
      page.getByText(/patient|cohort|encounter|condition/i).first(),
    ).toBeVisible({ timeout: T });
  });

  /* ── J30: OMOP Analytics page loads research data ────────── */
  test("J30 — OMOP Research Analytics page renders", async ({ page }) => {
    await page.goto("/analytics");
    await expectHeading(page, "OMOP Research Analytics");
    await waitForDataLoad(page);

    await expect(
      page.getByText(/OMOP|analytics|concept|cohort/i).first(),
    ).toBeVisible({ timeout: T });
  });
});

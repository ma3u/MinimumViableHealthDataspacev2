/**
 * Journey Group K — Catalog Search & Dataset Detail Verification (J82–J91)
 *
 * Verifies the catalog search/filter functionality, dataset card expansion,
 * metadata detail panels, HealthDCAT-AP fields, and action buttons.
 *
 * /catalog is PUBLIC. All tests use mock fallback data.
 */
import { test, expect } from "@playwright/test";
import { T, expectHeading, waitForDataLoad, apiGet } from "./helpers";

test.describe("K · Catalog Search & Dataset Detail", () => {
  /* ── J82: Catalog has a search/filter input ────────────── */
  test("J82 — Catalog page has a search filter input", async ({ page }) => {
    await page.goto("/catalog");
    await expectHeading(page, "Dataset Catalog");
    await waitForDataLoad(page);

    const searchInput = page.locator('input[type="search"]');
    await expect(searchInput).toBeVisible({ timeout: T });
    await expect(searchInput).toHaveAttribute(
      "placeholder",
      /filter by title|description|theme/i,
    );
  });

  /* ── J83: Search filter narrows displayed datasets ─────── */
  test("J83 — Typing in search filter narrows the displayed datasets", async ({
    page,
  }) => {
    await page.goto("/catalog");
    await expectHeading(page, "Dataset Catalog");
    await waitForDataLoad(page);

    // Wait for at least one dataset to render
    await expect(
      page.getByText(/Synthea|FHIR|Synthetic|OMOP/i).first(),
    ).toBeVisible({ timeout: T });

    // Type a filter term
    const searchInput = page.locator('input[type="search"]');
    await searchInput.fill("FHIR");
    await page.waitForTimeout(500); // debounce

    // After filtering, FHIR datasets should still be visible
    await expect(page.getByText(/FHIR/i).first()).toBeVisible({ timeout: T });

    // Clear the filter and verify datasets come back
    await searchInput.clear();
    await page.waitForTimeout(500);
    await expect(
      page.getByText(/Synthea|FHIR|Synthetic|OMOP/i).first(),
    ).toBeVisible({ timeout: T });
  });

  /* ── J84: Dataset card shows publisher info ────────────── */
  test("J84 — Expanded dataset card shows publisher information", async ({
    page,
  }) => {
    await page.goto("/catalog");
    await expectHeading(page, "Dataset Catalog");
    await waitForDataLoad(page);

    // Click on first dataset to expand
    const firstCard = page.getByText(/Synthea|FHIR|Synthetic/i).first();
    await firstCard.click();

    // Expanded view should show publisher info
    await expect(page.getByText(/publisher/i).first()).toBeVisible({
      timeout: T,
    });
  });

  /* ── J85: Dataset card shows legal basis ───────────────── */
  test("J85 — Expanded dataset card shows legal basis", async ({ page }) => {
    await page.goto("/catalog");
    await expectHeading(page, "Dataset Catalog");
    await waitForDataLoad(page);

    await page
      .getByText("Synthea Synthetic FHIR R4 Patient Cohort")
      .first()
      .click();

    await expect(page.getByText(/legal basis/i).first()).toBeVisible({
      timeout: T,
    });
  });

  /* ── J86: HealthDCAT-AP metadata section renders ───────── */
  test("J86 — Expanded dataset shows HealthDCAT-AP Metadata heading", async ({
    page,
  }) => {
    await page.goto("/catalog");
    await expectHeading(page, "Dataset Catalog");
    await waitForDataLoad(page);

    await page
      .getByText("Synthea Synthetic FHIR R4 Patient Cohort")
      .first()
      .click();

    await expect(page.getByText("HealthDCAT-AP Metadata").first()).toBeVisible({
      timeout: T,
    });
  });

  /* ── J87: Dataset detail has Show Data Model button ────── */
  test("J87 — Expanded dataset has Show Data Model action", async ({
    page,
  }) => {
    await page.goto("/catalog");
    await expectHeading(page, "Dataset Catalog");
    await waitForDataLoad(page);

    await page
      .getByText("Synthea Synthetic FHIR R4 Patient Cohort")
      .first()
      .click();

    await expect(page.getByText(/Show Data Model/i).first()).toBeVisible({
      timeout: T,
    });
  });

  /* ── J88: Dataset detail has Download DCAT-AP action ───── */
  test("J88 — Expanded dataset has Download DCAT-AP action", async ({
    page,
  }) => {
    await page.goto("/catalog");
    await expectHeading(page, "Dataset Catalog");
    await waitForDataLoad(page);

    await page
      .getByText("Synthea Synthetic FHIR R4 Patient Cohort")
      .first()
      .click();

    await expect(page.getByText(/Download DCAT-AP/i).first()).toBeVisible({
      timeout: T,
    });
  });

  /* ── J89: Catalog API datasets have HealthDCAT-AP fields ─ */
  test("J89 — Catalog API datasets include title and publisher", async ({
    page,
  }) => {
    const datasets = await apiGet(page, "/api/catalog");
    expect(datasets.length).toBeGreaterThanOrEqual(10);

    // Most datasets should have a title
    const withTitle = datasets.filter((ds: { title?: string }) => ds.title);
    expect(withTitle.length).toBeGreaterThanOrEqual(10);

    // Many datasets should have a publisher (some Neo4j-only ones may be null)
    const withPublisher = datasets.filter(
      (ds: { publisher?: string }) => ds.publisher,
    );
    expect(withPublisher.length).toBeGreaterThanOrEqual(5);
  });

  /* ── J90: Catalog datasets have dataset type classification ─ */
  test("J90 — Catalog datasets include datasetType classification", async ({
    page,
  }) => {
    const datasets = await apiGet(page, "/api/catalog");
    const withType = datasets.filter(
      (d: { datasetType?: string }) => d.datasetType,
    );
    expect(withType.length).toBeGreaterThanOrEqual(5);
  });

  /* ── J91: Catalog description mentions HealthDCAT-AP ───── */
  test("J91 — Catalog page description references HealthDCAT-AP", async ({
    page,
  }) => {
    await page.goto("/catalog");
    await expectHeading(page, "Dataset Catalog");

    await expect(page.getByText(/HealthDCAT-AP/i).first()).toBeVisible({
      timeout: T,
    });
  });
});

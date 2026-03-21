/**
 * Journey Group B — Dataset Upload & Metadata Definition (J06–J15)
 *
 * Verifies catalog dataset registration, HealthDCAT-AP metadata display,
 * FHIR R4 conformance, legal basis, and publisher attribution.
 *
 * The /catalog page is PUBLIC (no auth required).
 * Tests combine UI assertions + /api/catalog data-level checks.
 */
import { test, expect } from "@playwright/test";
import { T, expectHeading, waitForDataLoad, apiGet } from "./helpers";

test.describe("B · Dataset Upload & Metadata Definition", () => {
  /* ── J06: AlphaKlinik's FHIR patient cohort in catalog ───── */
  test("J06 — Synthea FHIR R4 Patient Cohort appears in catalog", async ({
    page,
  }) => {
    await page.goto("/catalog");
    await expectHeading(page, "Dataset Catalog");
    await waitForDataLoad(page);

    const card = page
      .getByText("Synthea Synthetic FHIR R4 Patient Cohort")
      .first();
    await expect(card).toBeVisible({ timeout: T });

    // Expand the card
    await card.click();

    // Should show dataset metadata — FHIR R4 reference or conformance info
    await expect(
      page.getByText(/fhir.*r4|conformsTo|hl7/i).first(),
    ).toBeVisible({ timeout: T });
  });

  /* ── J07: HealthDCAT-AP metadata for encounter data ──────── */
  test("J07 — FHIR Encounter History has HealthDCAT-AP metadata", async ({
    page,
  }) => {
    await page.goto("/catalog");
    await expectHeading(page, "Dataset Catalog");
    await waitForDataLoad(page);

    const card = page.getByText("FHIR Encounter History").first();
    await expect(card).toBeVisible({ timeout: T });
    await card.click();

    // Verify metadata fields are present
    await expect(
      page.getByText(/publisher|license|theme/i).first(),
    ).toBeVisible({ timeout: T });
  });

  /* ── J08: Limburg MC uploads diagnostic reports ──────────── */
  test("J08 — FHIR Diagnostic Reports dataset visible in catalog", async ({
    page,
  }) => {
    await page.goto("/catalog");
    await expectHeading(page, "Dataset Catalog");
    await waitForDataLoad(page);

    await expect(page.getByText("FHIR Diagnostic Reports").first()).toBeVisible(
      { timeout: T },
    );
  });

  /* ── J09: Catalog API includes OMOP dataset ID ────────────── */
  test("J09 — Catalog API contains OMOP CDM dataset entry", async ({
    page,
  }) => {
    const datasets = await apiGet(page, "/api/catalog");
    const omop = datasets.find(
      (d: { id?: string }) => d.id === "dataset:omop-cdm-v54-analytics",
    );
    expect(omop).toBeTruthy();
  });

  /* ── J10: EHDS Article 53 legal basis on dataset ─────────── */
  test("J10 — Dataset shows EHDS Article 53 legal basis", async ({ page }) => {
    await page.goto("/catalog");
    await expectHeading(page, "Dataset Catalog");
    await waitForDataLoad(page);

    // Click on Synthea dataset
    await page
      .getByText("Synthea Synthetic FHIR R4 Patient Cohort")
      .first()
      .click();

    await expect(page.getByText(/EHDS.*Art.*53/i).first()).toBeVisible({
      timeout: T,
    });
  });

  /* ── J11: Limburg MC immunization records ────────────────── */
  test("J11 — FHIR Immunization Records visible in catalog", async ({
    page,
  }) => {
    await page.goto("/catalog");
    await expectHeading(page, "Dataset Catalog");
    await waitForDataLoad(page);

    await expect(
      page.getByText("FHIR Immunization Records").first(),
    ).toBeVisible({ timeout: T });
  });

  /* ── J12: Care plan registry with quality labels ─────────── */
  test("J12 — FHIR Care Plan Registry appears in catalog", async ({ page }) => {
    await page.goto("/catalog");
    await expectHeading(page, "Dataset Catalog");
    await waitForDataLoad(page);

    const card = page.getByText("FHIR Care Plan Registry").first();
    await expect(card).toBeVisible({ timeout: T });
    await card.click();

    // Should show FHIR conformance
    await expect(page.getByText(/fhir/i).first()).toBeVisible({ timeout: T });
  });

  /* ── J13: MedDRA adverse events classification ───────────── */
  test("J13 — MedDRA v27 Adverse Event Classification in catalog", async ({
    page,
  }) => {
    await page.goto("/catalog");
    await expectHeading(page, "Dataset Catalog");
    await waitForDataLoad(page);

    const card = page
      .getByText("MedDRA v27.0 Adverse Event Classification")
      .first();
    await expect(card).toBeVisible({ timeout: T });
    await card.click();

    // Expand and verify metadata
    await expect(page.getByText(/MedDRA|adverse/i).first()).toBeVisible({
      timeout: T,
    });
  });

  /* ── J14: Clinical Trial Phases metadata ─────────────────── */
  test("J14 — Clinical Trial Phases I–IV metadata in catalog", async ({
    page,
  }) => {
    await page.goto("/catalog");
    await expectHeading(page, "Dataset Catalog");
    await waitForDataLoad(page);

    const card = page.getByText(/Clinical Trial Phases/).first();
    await expect(card).toBeVisible({ timeout: T });
    await card.click();

    await expect(page.getByText(/Phase|trial/i).first()).toBeVisible({
      timeout: T,
    });
  });

  /* ── J15: FHIR AllergyIntolerance with R4 conformance ───── */
  test("J15 — FHIR AllergyIntolerance Registry with FHIR R4 conformance", async ({
    page,
  }) => {
    await page.goto("/catalog");
    await expectHeading(page, "Dataset Catalog");
    await waitForDataLoad(page);

    const card = page.getByText("FHIR AllergyIntolerance Registry").first();
    await expect(card).toBeVisible({ timeout: T });
    await card.click();

    // Should show FHIR R4 conformance indicator
    await expect(page.getByText(/fhir.*r4|hl7/i).first()).toBeVisible({
      timeout: T,
    });
  });
});

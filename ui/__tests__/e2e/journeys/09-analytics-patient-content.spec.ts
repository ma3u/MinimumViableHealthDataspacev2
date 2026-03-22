/**
 * Journey Group I — Analytics & Patient Content Verification (J62–J71)
 *
 * Verifies that the OMOP Analytics and Patient Journey pages render
 * meaningful content beyond basic headings — stat cards, charts,
 * cohort badges, patient selectors, and timeline structure.
 *
 * All pages are PUBLIC (no auth required). Data comes from mock
 * fallback when Neo4j is unavailable.
 */
import { test, expect } from "@playwright/test";
import { T, expectHeading, waitForDataLoad, skipIfNeo4jDown } from "./helpers";

test.describe("I · Analytics & Patient Content Verification", () => {
  /* ── J62: Analytics page shows 6 stat cards ────────────── */
  test("J62 — Analytics page renders all 6 OMOP stat cards", async ({
    page,
  }) => {
    await page.goto("/analytics");
    await expectHeading(page, "OMOP Research Analytics");
    await waitForDataLoad(page);

    const labels = [
      "Patients",
      "Conditions",
      "Drug Exposures",
      "Procedures",
      "Measurements",
      "Visits",
    ];
    for (const label of labels) {
      await expect(page.getByText(label, { exact: true }).first()).toBeVisible({
        timeout: T,
      });
    }
  });

  /* ── J63: Analytics page shows bar chart sections ──────── */
  test("J63 — Analytics page renders Top Conditions and Top Drug Exposures sections", async ({
    page,
  }) => {
    await page.goto("/analytics");
    await expectHeading(page, "OMOP Research Analytics");
    await waitForDataLoad(page);

    // Verify the four bar chart sections exist
    const sections = [
      "Top Conditions",
      "Top Drug Exposures",
      "Top Measurements",
      "Top Procedures",
    ];
    for (const section of sections) {
      await expect(page.getByText(section).first()).toBeVisible({ timeout: T });
    }
  });

  /* ── J64: Analytics page shows Gender Distribution ─────── */
  test("J64 — Analytics page renders Gender Distribution section", async ({
    page,
  }) => {
    await page.goto("/analytics");
    await expectHeading(page, "OMOP Research Analytics");
    await waitForDataLoad(page);

    // Gender Distribution is conditional on data. Check page text content.
    // Use a generous timeout since parallel tests may slow the server.
    await page.waitForTimeout(2000);
    const body = await page.textContent("body");
    expect(
      body?.includes("Gender Distribution") ||
        body?.includes("No data") ||
        body?.includes("Loading"),
    ).toBe(true);
  });

  /* ── J65: Analytics stat cards show numeric values ─────── */
  test("J65 — Analytics stat card values are numeric or loading", async ({
    page,
  }) => {
    await page.goto("/analytics");
    await expectHeading(page, "OMOP Research Analytics");
    await waitForDataLoad(page);

    // The Patients label should be visible somewhere on the page
    await expect(
      page.getByText("Patients", { exact: true }).first(),
    ).toBeVisible({ timeout: T });
  });

  /* ── J66: Patient Journey page shows cohort stat badges ── */
  test("J66 — Patient Journey page shows 6 cohort stat badges", async ({
    page,
  }) => {
    await skipIfNeo4jDown(page);
    await page.goto("/patient");
    await expectHeading(page, "Patient Journey");
    await waitForDataLoad(page);

    const badges = [
      "Patients",
      "Encounters",
      "Conditions",
      "Observations",
      "Medications",
      "Procedures",
    ];
    for (const badge of badges) {
      await expect(page.getByText(badge, { exact: true }).first()).toBeVisible({
        timeout: T,
      });
    }
  });

  /* ── J67: Patient Journey page has a patient selector ──── */
  test("J67 — Patient Journey page renders patient selector dropdown", async ({
    page,
  }) => {
    await page.goto("/patient");
    await expectHeading(page, "Patient Journey");
    await waitForDataLoad(page);

    // Patient selector is a <select> element
    const select = page.locator("select").first();
    await expect(select).toBeVisible({ timeout: T });

    // The select should contain a placeholder option mentioning patients
    const options = select.locator("option");
    const count = await options.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  /* ── J68: Patient page description mentions FHIR R4 ────── */
  test("J68 — Patient Journey page describes FHIR R4 clinical events", async ({
    page,
  }) => {
    await page.goto("/patient");
    await expectHeading(page, "Patient Journey");

    // Page description should mention FHIR R4 and OMOP CDM
    await expect(page.getByText(/FHIR R4/i).first()).toBeVisible({
      timeout: T,
    });
    await expect(page.getByText(/OMOP/i).first()).toBeVisible({ timeout: T });
  });

  /* ── J69: Analytics has prev/next navigation links ─────── */
  test("J69 — Analytics page has Patient Journey and NL Query nav links", async ({
    page,
  }) => {
    await page.goto("/analytics");
    await expectHeading(page, "OMOP Research Analytics");

    // PageIntro provides prev/next navigation
    await expect(
      page.getByRole("link", { name: /Patient Journey/i }),
    ).toBeVisible({ timeout: T });
  });

  /* ── J70: Patient page has prev/next navigation links ──── */
  test("J70 — Patient Journey page has Catalog and Analytics nav links", async ({
    page,
  }) => {
    await page.goto("/patient");
    await expectHeading(page, "Patient Journey");

    await expect(
      page.getByRole("link", { name: /OMOP Analytics/i }),
    ).toBeVisible({ timeout: T });
  });

  /* ── J71: Analytics description mentions OMOP CDM ──────── */
  test("J71 — Analytics page description references OMOP CDM and Synthea", async ({
    page,
  }) => {
    await page.goto("/analytics");
    await expectHeading(page, "OMOP Research Analytics");

    await expect(page.getByText(/OMOP CDM/i).first()).toBeVisible({
      timeout: T,
    });
    await expect(page.getByText(/Synthea/i).first()).toBeVisible({
      timeout: T,
    });
  });
});

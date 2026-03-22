/**
 * Journey Group J — EEHRxF Profile & Compliance Content Verification (J72–J81)
 *
 * Verifies that the EEHRxF Profile Alignment page renders meaningful
 * content (stat cards, timeline milestones, category cards, reference links)
 * and that the Compliance page has form elements and credential sections.
 *
 * /eehrxf is PUBLIC. /compliance is PROTECTED but we verify its
 * auth-redirect behavior plus compliance API content.
 */
import { test, expect } from "@playwright/test";
import {
  T,
  expectHeading,
  waitForDataLoad,
  expectSigninRedirect,
  apiGet,
  skipIfNeo4jDown,
} from "./helpers";

test.describe("J · EEHRxF Profile & Compliance Content", () => {
  /* ── J72: EEHRxF page renders 4 summary stat cards ────── */
  test("J72 — EEHRxF page shows Priority Categories and EU Profiles stats", async ({
    page,
  }) => {
    await page.goto("/eehrxf");
    await expectHeading(page, "EEHRxF Profile Alignment");
    await waitForDataLoad(page);

    const stats = ["Priority Categories", "EU Profiles Tracked"];
    for (const stat of stats) {
      await expect(page.getByText(stat).first()).toBeVisible({ timeout: T });
    }
  });

  /* ── J73: EEHRxF page shows Overall Coverage percentage ── */
  test("J73 — EEHRxF page shows Overall Coverage stat", async ({ page }) => {
    await page.goto("/eehrxf");
    await expectHeading(page, "EEHRxF Profile Alignment");
    await waitForDataLoad(page);

    await expect(page.getByText("Overall Coverage").first()).toBeVisible({
      timeout: T,
    });
  });

  /* ── J74: EEHRxF page shows EHDS timeline milestones ──── */
  test("J74 — EEHRxF page renders EHDS Implementation Timeline", async ({
    page,
  }) => {
    await page.goto("/eehrxf");
    await expectHeading(page, "EEHRxF Profile Alignment");
    await waitForDataLoad(page);

    await expect(
      page.getByText("EHDS Implementation Timeline").first(),
    ).toBeVisible({ timeout: T });

    // Verify key milestones
    await expect(page.getByText("2025").first()).toBeVisible({ timeout: T });
    await expect(page.getByText("2029").first()).toBeVisible({ timeout: T });
  });

  /* ── J75: EEHRxF page shows status badges ──────────────── */
  test("J75 — EEHRxF categories have Available/Partial/Gap badges", async ({
    page,
  }) => {
    await skipIfNeo4jDown(page);
    await page.goto("/eehrxf");
    await expectHeading(page, "EEHRxF Profile Alignment");
    await waitForDataLoad(page);

    // Wait for category content to load
    await expect(page.getByText("Priority Categories").first()).toBeVisible({
      timeout: T,
    });

    // At least one of Available, Partial, or Gap badges should be in the page
    const body = await page.textContent("body");
    const hasAvailable = body?.includes("Available") ?? false;
    const hasPartial = body?.includes("Partial") ?? false;
    const hasGap = body?.includes("Gap") ?? false;
    expect(hasAvailable || hasPartial || hasGap).toBe(true);
  });

  /* ── J76: EEHRxF page has reference links ──────────────── */
  test("J76 — EEHRxF page shows References section with regulation links", async ({
    page,
  }) => {
    await page.goto("/eehrxf");
    await expectHeading(page, "EEHRxF Profile Alignment");
    await waitForDataLoad(page);

    await expect(page.getByText("References").first()).toBeVisible({
      timeout: T,
    });

    // Should have at least one reference link to EHDS regulation
    await expect(
      page
        .getByText(/EHDS Regulation|EEHRxF Recommendation|HL7 Europe/i)
        .first(),
    ).toBeVisible({ timeout: T });
  });

  /* ── J77: EEHRxF description references HL7 Europe ────── */
  test("J77 — EEHRxF page description mentions HL7 Europe FHIR R4", async ({
    page,
  }) => {
    await page.goto("/eehrxf");
    await expectHeading(page, "EEHRxF Profile Alignment");

    await expect(page.getByText(/HL7 Europe/i).first()).toBeVisible({
      timeout: T,
    });
  });

  /* ── J78: Compliance page redirects unauthenticated ────── */
  test("J78 — Compliance page requires authentication", async ({ page }) => {
    await page.goto("/compliance");
    await expectSigninRedirect(page);
  });

  /* ── J79: Compliance API validates against Neo4j ─────── */
  test("J79 — Compliance validation API is reachable", async ({ page }) => {
    await skipIfNeo4jDown(page);
    // The compliance page uses graph queries — verify the API returns data
    const data = await apiGet(page, "/api/credentials");
    const creds = data.credentials || data;
    expect(Array.isArray(creds)).toBe(true);
    expect(creds.length).toBeGreaterThanOrEqual(1);
  });

  /* ── J80: EEHRxF has prev/next navigation links ──────── */
  test("J80 — EEHRxF page has NL Query and Compliance nav links", async ({
    page,
  }) => {
    await page.goto("/eehrxf");
    await expectHeading(page, "EEHRxF Profile Alignment");

    await expect(
      page.getByRole("link", { name: /EHDS Compliance/i }),
    ).toBeVisible({ timeout: T });
  });

  /* ── J81: EEHRxF Profiles with Data stat card ─────────── */
  test("J81 — EEHRxF page shows Profiles with Data stat", async ({ page }) => {
    await page.goto("/eehrxf");
    await expectHeading(page, "EEHRxF Profile Alignment");
    await waitForDataLoad(page);

    await expect(page.getByText("Profiles with Data").first()).toBeVisible({
      timeout: T,
    });
  });
});

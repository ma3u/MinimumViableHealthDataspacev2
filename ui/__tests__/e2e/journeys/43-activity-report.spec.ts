/**
 * Issue #206 — the activity report of the access body (J950–J952).
 *
 * Regulation (EU) 2025/327, Art. 59(1): every health data access body
 * publishes an activity report every two years on its website, with the
 * items (a) to (k). The demo generates it from the graph; this journey reads
 * it without a session, as the public would, in JSON, on the page and as
 * Markdown.
 *
 *   PLAYWRIGHT_BASE_URL=https://ehds.mabu.red \
 *     npx playwright test __tests__/e2e/journeys/43-activity-report.spec.ts
 */
import { test, expect } from "@playwright/test";

const ITEMS = "abcdefghijk".split("");

test.describe("Issue #206 · the activity report (Art. 59)", () => {
  test("J950 the report is generated for everyone, without a session", async ({
    browser,
  }) => {
    const anyone = await browser.newContext();
    const page = await anyone.newPage();
    const r = await page.request.get("/api/activity-report");
    expect(r.status(), await r.text()).toBe(200);
    const report = await r.json();
    expect(report.article).toContain("Art. 59(1)");
    expect(report.period.months).toBe(24);
    expect(Object.keys(report.items)).toEqual(ITEMS);
    // The seed puts at least one application and one permit in the graph.
    expect(report.items.a.applications).toBeGreaterThan(0);
    expect(report.items.a.permitsIssued).toBeGreaterThan(0);
    expect(report.items.i.total).toBeGreaterThanOrEqual(0);
    await anyone.close();
  });

  test("J951 the page lists the eleven items and the period", async ({
    browser,
  }) => {
    const anyone = await browser.newContext();
    const page = await anyone.newPage();
    await page.goto("/activity-report");
    await expect(page).not.toHaveURL(/signin/);
    await expect(
      page.getByText("Activity report of the health data access body"),
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("report-period")).toBeVisible({
      timeout: 15_000,
    });
    for (const k of ITEMS) {
      await expect(page.getByTestId(`report-item-${k}`)).toBeVisible();
    }
    await expect(page.getByTestId("report-item-a")).toContainText(
      "Permits issued",
    );
    await anyone.close();
  });

  test("J952 the Markdown export carries one heading per item", async ({
    browser,
  }) => {
    const anyone = await browser.newContext();
    const page = await anyone.newPage();
    const r = await page.request.get("/api/activity-report?format=md");
    expect(r.status(), await r.text()).toBe(200);
    expect(r.headers()["content-type"]).toContain("text/markdown");
    const md = await r.text();
    expect(md).toContain("# Activity report of the health data access body");
    for (const k of ITEMS) {
      expect(md).toContain(`## (${k}) `);
    }
    await anyone.close();
  });
});

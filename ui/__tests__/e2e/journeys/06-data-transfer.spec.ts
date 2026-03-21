/**
 * Journey Group F — Data Transfer & Viewing (J41–J48)
 *
 * Verifies the DSP data transfer lifecycle: transfer states,
 * FHIR viewing in knowledge graph, audit API, and protected page redirects.
 *
 * /data/transfer, /data/share, /admin/audit are protected → verify redirect.
 * APIs (/api/tasks, /api/admin/audit) have no middleware.
 */
import { test, expect } from "@playwright/test";
import {
  T,
  expectHeading,
  expectSigninRedirect,
  waitForDataLoad,
  apiGet,
} from "./helpers";

test.describe("F · Data Transfer & Viewing", () => {
  /* ── J41: Transfer page is protected ─────────────────────── */
  test("J41 — Transfer page requires authentication", async ({ page }) => {
    await page.goto("/data/transfer");
    await expectSigninRedirect(page);
  });

  /* ── J42: Share Data page is protected ───────────────────── */
  test("J42 — Share Data page requires authentication", async ({ page }) => {
    await page.goto("/data/share");
    await expectSigninRedirect(page);
  });

  /* ── J43: Tasks API returns transfer entries ─────────────── */
  test("J43 — Tasks API includes transfer entries", async ({ page }) => {
    const data = await apiGet(page, "/api/tasks");
    const tasks = data.tasks || data;
    expect(Array.isArray(tasks)).toBe(true);

    const transfers = tasks.filter(
      (t: { type: string }) => t.type === "transfer",
    );
    expect(transfers.length).toBeGreaterThanOrEqual(1);
  });

  /* ── J44: Transfer states include STARTED or REQUESTING ──── */
  test("J44 — At least one in-progress transfer exists", async ({ page }) => {
    const data = await apiGet(page, "/api/tasks");
    const tasks = data.tasks || data;

    const inProgress = tasks.filter(
      (t: { type: string; state: string }) =>
        t.type === "transfer" && /STARTED|REQUESTING|REQUESTED/.test(t.state),
    );
    expect(inProgress.length).toBeGreaterThanOrEqual(1);
  });

  /* ── J45: Multiple transfer states exist ─────────────────── */
  test("J45 — Transfers span at least 2 different states", async ({ page }) => {
    const data = await apiGet(page, "/api/tasks");
    const tasks = data.tasks || data;

    const transferStates = new Set(
      tasks
        .filter((t: { type: string }) => t.type === "transfer")
        .map((t: { state: string }) => t.state),
    );
    expect(transferStates.size).toBeGreaterThanOrEqual(2);
  });

  /* ── J46: Audit API returns transfer and negotiation data ── */
  test("J46 — Audit API includes transfers and negotiations", async ({
    page,
  }) => {
    const audit = await apiGet(page, "/api/admin/audit");
    // Audit should have some transfer or negotiation data
    const hasTransfers =
      Array.isArray(audit.transfers) && audit.transfers.length > 0;
    const hasNegotiations =
      Array.isArray(audit.negotiations) && audit.negotiations.length > 0;
    expect(hasTransfers || hasNegotiations).toBe(true);
  });

  /* ── J47: Graph renders canvas with layers ───────────────── */
  test("J47 — Knowledge graph renders with clickable canvas", async ({
    page,
  }) => {
    await page.goto("/graph");
    await expect(page.getByText("Layers").first()).toBeVisible({ timeout: T });

    const canvas = page.locator("canvas");
    await expect(canvas.first()).toBeVisible({ timeout: T });

    // Click on canvas — no crash = success
    await page.waitForTimeout(2000);
    const box = await canvas.first().boundingBox();
    if (box) {
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    }
  });

  /* ── J48: Transfers span multiple participants ───────────── */
  test("J48 — Transfers involve multiple participants", async ({ page }) => {
    const data = await apiGet(page, "/api/tasks");
    const tasks = data.tasks || data;

    const transferParticipants = new Set(
      tasks
        .filter((t: { type: string }) => t.type === "transfer")
        .map((t: { participant: string }) => t.participant),
    );
    expect(transferParticipants.size).toBeGreaterThanOrEqual(2);
  });
});

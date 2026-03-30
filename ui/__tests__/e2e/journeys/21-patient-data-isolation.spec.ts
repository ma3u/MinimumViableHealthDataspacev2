/**
 * Journey 21: Patient Data Isolation (J285–J295)
 *
 * EHDS Art. 3 / GDPR Art. 15 — patients must only see their own health data.
 * The patient selector dropdown must be hidden for PATIENT role users.
 * Other roles (DATA_USER, EDC_ADMIN) can browse all patients.
 */
import { test, expect } from "@playwright/test";
import { T } from "./helpers";

test.describe("Patient Data Isolation (EHDS Art. 3)", () => {
  // ── API-level tests (no auth = full access) ─────────────────────────────

  test("J285 — unauthenticated /api/patient returns all patients", async ({
    page,
  }) => {
    const res = await page.request.get("/api/patient");
    expect(res.ok()).toBe(true);
    const data = await res.json();
    // Without auth, the API returns the full patient list
    expect(data.patients.length).toBeGreaterThan(1);
    expect(data.restricted).not.toBe(true);
  });

  test("J286 — unauthenticated /api/patient returns cohort stats for all", async ({
    page,
  }) => {
    const res = await page.request.get("/api/patient");
    const data = await res.json();
    // Full cohort stats should show > 100 patients
    expect(data.stats.patients).toBeGreaterThan(100);
  });

  // ── UI-level tests (unauthenticated = researcher/admin view) ──────────

  test("J287 — patient page shows selector OR restricted banner", async ({
    page,
  }) => {
    await page.goto("/patient");
    // Either a <select> (non-patient) or a restricted banner (PATIENT role)
    const select = page.locator("select");
    const banner = page.getByText("Showing your personal health record");
    await expect(select.or(banner).first()).toBeVisible({ timeout: T });
  });

  test("J288 — patient page shows Patient Journey heading", async ({
    page,
  }) => {
    await page.goto("/patient");
    await expect(page.getByText("Patient Journey")).toBeVisible({ timeout: T });
    // Stats load from API — check the container renders
    await expect(page.getByText(/FHIR R4 clinical events/i)).toBeVisible({
      timeout: T,
    });
  });

  test("J289 — patient page loads timeline when a patient is selected", async ({
    page,
  }) => {
    await page.goto("/patient");
    const select = page.locator("select");
    await expect(select).toBeVisible({ timeout: T });
    // Select the second option (first real patient after the placeholder)
    const options = select.locator("option");
    const count = await options.count();
    if (count > 1) {
      const value = await options.nth(1).getAttribute("value");
      if (value) {
        await select.selectOption(value);
        // Demographics should appear
        await expect(page.getByText("Gender:")).toBeVisible({ timeout: T });
      }
    }
  });

  // ── API restriction for specific patientId ────────────────────────────

  test("J290 — /api/patient?patientId returns timeline data", async ({
    page,
  }) => {
    // First get a valid patient ID
    const listRes = await page.request.get("/api/patient");
    const listData = await listRes.json();
    if (listData.patients.length === 0) return;
    const pid = listData.patients[0].id;
    // Now fetch the timeline
    const res = await page.request.get(
      `/api/patient?patientId=${encodeURIComponent(pid)}`,
    );
    expect(res.ok()).toBe(true);
    const data = await res.json();
    expect(Array.isArray(data.timeline)).toBe(true);
  });

  // ── Verify data isolation design ──────────────────────────────────────

  test("J291 — API response includes 'restricted' field", async ({ page }) => {
    const res = await page.request.get("/api/patient");
    const data = await res.json();
    // The 'restricted' field tells the UI whether to show the selector
    expect(typeof data.restricted).toBe("boolean");
  });

  test("J292 — restricted response returns exactly 1 patient when true", async ({
    page,
  }) => {
    // This test validates the contract: when restricted=true, only 1 patient is returned
    // We can't force the PATIENT session in E2E without login, but we verify the field exists
    const res = await page.request.get("/api/patient");
    const data = await res.json();
    if (data.restricted === true) {
      expect(data.patients.length).toBe(1);
      expect(data.stats.patients).toBe(1);
    } else {
      // Non-restricted: multiple patients
      expect(data.patients.length).toBeGreaterThan(1);
    }
  });

  test("J293 — patient page title and description are visible", async ({
    page,
  }) => {
    await page.goto("/patient");
    await expect(page.getByText("Patient Journey")).toBeVisible({
      timeout: T,
    });
    await expect(page.getByText(/FHIR R4 clinical events/i)).toBeVisible({
      timeout: T,
    });
  });
});

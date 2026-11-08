/**
 * Journey 21: Patient Data Isolation (J285–J295)
 *
 * EHDS Art. 3 / GDPR Art. 15 — patients must only see their own health data.
 * The patient selector dropdown must be hidden for PATIENT role users.
 * Other roles (DATA_USER, EDC_ADMIN) can browse all patients.
 *
 * Since #357 neither /api/patient nor /patient answers without a session:
 * an anonymous caller gets a 401, and a signed-in participant who is not a
 * PATIENT sees the cohort. The journeys sign in as the researcher (DATA_USER)
 * for the cohort view and as patient1 for the restricted one.
 */
import { test, expect } from "@playwright/test";
import { T } from "./helpers";
import { signInOrSkip, signInPage } from "../helpers/forged-session";

test.describe("Patient Data Isolation (EHDS Art. 3)", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    // J285 checks the anonymous answer itself before it signs in.
    if (testInfo.title.startsWith("J285")) return;
    await signInOrSkip(page, test.skip, "researcher");
  });

  // ── API-level tests (anonymous = refused, signed in = cohort) ───────────

  test("J285: anonymous /api/patient is refused; a signed-in participant gets all patients", async ({
    page,
  }) => {
    const anonymous = await page.request.get("/api/patient");
    expect(anonymous.status()).toBe(401);
    expect(await anonymous.json()).toHaveProperty("error");

    await signInOrSkip(page, test.skip, "researcher");
    const res = await page.request.get("/api/patient");
    expect(res.ok()).toBe(true);
    const data = await res.json();
    // A participant who is not a PATIENT gets the full patient list
    expect(data.patients.length).toBeGreaterThan(1);
    expect(data.restricted).not.toBe(true);
  });

  test("J286: signed-in /api/patient returns cohort stats for all", async ({
    page,
  }) => {
    const res = await page.request.get("/api/patient");
    expect(res.ok()).toBe(true);
    const data = await res.json();
    // The stats count the whole cohort, every patient listed, not one record.
    // The seeded demo graph (neo4j/seed.sh) holds 16 patients; the "> 100"
    // this asserted needs the Synthea load of the JAD stack (phase 3).
    expect(data.patients.length).toBeGreaterThan(1);
    expect(data.stats.patients).toBeGreaterThanOrEqual(data.patients.length);
  });

  // ── UI-level tests (signed in as a researcher = cohort view) ──────────

  test("J287 — patient page shows selector OR restricted banner", async ({
    page,
  }) => {
    await page.goto("/patient");
    // Either a <select> (non-patient) or a restricted banner (PATIENT role).
    // By its name: the language picker in the nav is a <select> too (#782).
    const select = page.getByRole("combobox", { name: /select patient/i });
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
    const select = page.getByRole("combobox", { name: /select patient/i });
    await expect(select).toBeVisible({ timeout: T });
    // Select the second option (first real patient after the placeholder)
    const options = select.locator("option");
    const count = await options.count();
    if (count > 1) {
      const value = await options.nth(1).getAttribute("value");
      if (value) {
        await select.selectOption(value);
        // Demographics should appear. Their labels lost the colon in the
        // Phase 23 redesign (970a6c4b): "Gender" above the value.
        await expect(page.getByText("Gender", { exact: true })).toBeVisible({
          timeout: T,
        });
      }
    }
  });

  // ── API restriction for specific patientId ────────────────────────────

  test("J290 — /api/patient?patientId returns timeline data", async ({
    page,
  }) => {
    // First get a valid patient ID
    const listRes = await page.request.get("/api/patient");
    expect(listRes.ok()).toBe(true);
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
    expect(res.ok()).toBe(true);
    const data = await res.json();
    // The 'restricted' field tells the UI whether to show the selector
    expect(typeof data.restricted).toBe("boolean");
  });

  test("J292 — restricted response returns exactly 1 patient when true", async ({
    page,
  }) => {
    // This test validates the contract: when restricted=true, only 1 patient
    // is returned. A forged PATIENT session reaches that branch, which the
    // test could not before it signed in.
    const cohort = await (await page.request.get("/api/patient")).json();
    expect(cohort.restricted).toBe(false);
    expect(cohort.patients.length).toBeGreaterThan(1);

    expect(await signInPage(page, "patient1")).toBe(true);
    const res = await page.request.get("/api/patient");
    expect(res.ok()).toBe(true);
    const data = await res.json();
    expect(data.restricted).toBe(true);
    expect(data.patients.length).toBe(1);
    expect(data.stats.patients).toBe(1);
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

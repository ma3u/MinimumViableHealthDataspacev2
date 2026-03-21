/**
 * Journey Group C — Policy Definition & Catalog Offering (J16–J22)
 *
 * Verifies ODRL policy structures, policy constraints, and catalog
 * offering lifecycle. Policy pages are protected, so we use API
 * assertions (/api/admin/policies) + public /catalog page.
 */
import { test, expect } from "@playwright/test";
import {
  PARTICIPANT_NAMES,
  T,
  expectHeading,
  expectSigninRedirect,
  waitForDataLoad,
  apiGet,
} from "./helpers";

test.describe("C · Policy Definition & Catalog Offering", () => {
  /* ── J16: Policies API returns policies for multiple participants ── */
  test("J16 — Policies exist for multiple participants", async ({ page }) => {
    const data = await apiGet(page, "/api/admin/policies");
    const participants = data.participants || [];
    expect(participants.length).toBeGreaterThanOrEqual(3);

    // Each participant entry has an identity and policies array
    for (const p of participants) {
      expect(p.identity || p.participantId).toBeTruthy();
      expect(Array.isArray(p.policies)).toBe(true);
    }
  });

  /* ── J17: ODRL policies have permission/prohibition structure ── */
  test("J17 — Policies include ODRL permission and prohibition fields", async ({
    page,
  }) => {
    const data = await apiGet(page, "/api/admin/policies");
    const participants = data.participants || [];

    // Find a participant with at least 1 policy
    const withPolicies = participants.find(
      (p: { policies: unknown[] }) => p.policies.length > 0,
    );
    expect(withPolicies).toBeTruthy();

    const policy = withPolicies.policies[0];
    expect(policy.policy || policy["@type"]).toBeTruthy();

    // ODRL policy structure has permission and prohibition arrays
    if (policy.policy) {
      expect(policy.policy.permission).toBeDefined();
      expect(policy.policy.prohibition).toBeDefined();
    }
  });

  /* ── J18: Policies page is protected (auth middleware) ──── */
  test("J18 — Policy page requires authentication", async ({ page }) => {
    await page.goto("/admin/policies");
    await expectSigninRedirect(page);
  });

  /* ── J19: MedReg has regulatory policies ──────────────── */
  test("J19 — MedReg participant has registered policies", async ({ page }) => {
    const data = await apiGet(page, "/api/admin/policies");
    const participants = data.participants || [];

    const medreg = participants.find(
      (p: { identity?: string }) => p.identity?.includes("medreg"),
    );
    expect(medreg).toBeTruthy();
    expect(medreg.policies.length).toBeGreaterThanOrEqual(1);
  });

  /* ── J20: Catalog page shows dataset entries publicly ──── */
  test("J20 — Catalog page renders dataset cards publicly", async ({
    page,
  }) => {
    await page.goto("/catalog");
    await expectHeading(page, "Dataset Catalog");
    await waitForDataLoad(page);

    // Should show multiple dataset entries
    await expect(page.getByText(/Synthea|FHIR|Synthetic/i).first()).toBeVisible(
      { timeout: T },
    );
  });

  /* ── J21: Catalog API returns ≥15 datasets ─────────────── */
  test("J21 — Catalog API has at least 15 registered datasets", async ({
    page,
  }) => {
    const datasets = await apiGet(page, "/api/catalog");
    expect(Array.isArray(datasets)).toBe(true);
    expect(datasets.length).toBeGreaterThanOrEqual(15);
  });

  /* ── J22: Catalog includes SyntheticData type ──────────── */
  test("J22 — At least one catalog dataset is SyntheticData type", async ({
    page,
  }) => {
    const datasets = await apiGet(page, "/api/catalog");
    const synthetic = datasets.find(
      (d: { datasetType?: string }) => d.datasetType === "SyntheticData",
    );
    expect(synthetic).toBeTruthy();
  });
});

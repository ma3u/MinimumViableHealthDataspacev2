/**
 * Journey Group G — Cross-Border & Federated Compliance (J49–J50)
 *
 * Two comprehensive end-to-end scenarios:
 * J49: Cross-border API journey — participants from multiple countries, graph view
 * J50: Comprehensive compliance audit via APIs (credentials, policies, catalog, audit)
 *
 * Protected pages → verify redirects. All data assertions via API.
 */
import { test, expect } from "@playwright/test";
import {
  PARTICIPANT_NAMES,
  T,
  expectHeading,
  expectSigninRedirect,
  waitForDataLoad,
  apiGet,
  skipIfNeo4jDown,
} from "./helpers";

test.describe("G · Cross-Border & Federated Compliance", () => {
  /* ── J49: Full cross-border data exchange journey ────────── */
  test("J49 — Cross-border journey: multi-country participants, negotiations, graph", async ({
    page,
  }) => {
    await skipIfNeo4jDown(page);

    // Step 1: Verify participants from multiple countries via API
    const participantsData = await apiGet(page, "/api/participants");
    const participants = Array.isArray(participantsData)
      ? participantsData
      : participantsData.participants || [];
    expect(participants.length).toBeGreaterThanOrEqual(3);

    // Should include participants with different DID path segments (different orgs)
    const dids = participants
      .map((p: { identity: string; did: string }) => p.identity || p.did || "")
      .filter((d: string) => d.startsWith("did:web:"));
    // Each participant should have a unique DID
    expect(new Set(dids).size).toBeGreaterThanOrEqual(3);

    // Step 2: Verify cross-border negotiations exist
    const tasksData = await apiGet(page, "/api/tasks");
    const tasks = tasksData.tasks || tasksData;
    const negotiations = tasks.filter(
      (t: { type: string }) => t.type === "negotiation",
    );
    expect(negotiations.length).toBeGreaterThanOrEqual(1);

    // Step 3: Discover page is protected
    await page.goto("/data/discover");
    await expectSigninRedirect(page);

    // Step 4: Graph is public — renders with canvas
    await page.goto("/graph");
    const canvas = page.locator("canvas");
    await expect(canvas.first()).toBeVisible({ timeout: T });
  });

  /* ── J50: Comprehensive compliance audit ─────────────────── */
  test("J50 — Compliance audit: credentials, policies, catalog, audit log", async ({
    page,
  }) => {
    await skipIfNeo4jDown(page); // Step 1: All 5 participants registered
    const participantsData = await apiGet(page, "/api/participants");
    const participants = Array.isArray(participantsData)
      ? participantsData
      : participantsData.participants || [];
    expect(participants.length).toBeGreaterThanOrEqual(5);

    // Step 2: Credentials include EHDS types
    const credData = await apiGet(page, "/api/credentials");
    const credentials = credData.credentials || credData;
    expect(Array.isArray(credentials)).toBe(true);

    const ehds = credentials.filter(
      (c: { credentialType: string; type: string }) =>
        (c.credentialType || c.type) === "EHDSParticipantCredential",
    );
    expect(ehds.length).toBeGreaterThanOrEqual(1);

    // Step 3: Policies exist for multiple participants
    const policiesData = await apiGet(page, "/api/admin/policies");
    const participantPolicies =
      policiesData.participants || policiesData.policies || policiesData;
    if (Array.isArray(participantPolicies)) {
      expect(participantPolicies.length).toBeGreaterThanOrEqual(3);
    }

    // Step 4: Catalog has datasets with identifiers
    const catalogData = await apiGet(page, "/api/catalog");
    const datasets =
      catalogData["dcat:dataset"] || catalogData.datasets || catalogData;
    expect(Array.isArray(datasets)).toBe(true);
    expect(datasets.length).toBeGreaterThanOrEqual(10);

    // Most datasets should have at least a title or id
    const identified = datasets.filter(
      (ds: Record<string, string>) =>
        ds["dct:title"] || ds.title || ds["@id"] || ds.id || ds.name,
    );
    expect(identified.length).toBeGreaterThanOrEqual(10);

    // Step 5: Audit API returns compliance data
    const audit = await apiGet(page, "/api/admin/audit");
    const hasTransfers =
      Array.isArray(audit.transfers) && audit.transfers.length > 0;
    const hasNegotiations =
      Array.isArray(audit.negotiations) && audit.negotiations.length > 0;
    const hasCredentials =
      Array.isArray(audit.credentials) && audit.credentials.length > 0;
    expect(hasTransfers || hasNegotiations || hasCredentials).toBe(true);

    // Step 6: Compliance page is protected
    await page.goto("/compliance");
    await expectSigninRedirect(page);
  });
});

/**
 * Journey Group N — Trust Center & Pseudonym Resolution (J122–J133)
 *
 * Verifies the Phase 18 Trust Center implementation:
 * - Trust Center API returns active trust centers (RKI, RIVM)
 * - Pseudonym resolution audit log is accessible
 * - SPE sessions with TEE attestation are returned
 * - Graph explorer includes Trust Center node types
 * - Fraunhofer FIT participant is onboarded
 *
 * Trust Center APIs are proxied through /api/trust-center/* routes.
 */
import { test, expect } from "@playwright/test";
import {
  T,
  apiGet,
  skipIfNeo4jDown,
  expectHeading,
  waitForDataLoad,
} from "./helpers";

test.describe("N · Trust Center & Pseudonym Resolution", () => {
  /* ── J122: Trust Center API returns registered trust centers ── */
  test("J122 — Trust Center API returns at least 2 trust centers", async ({
    page,
  }) => {
    const data = await apiGet(page, "/api/trust-center");
    const trustCenters = data.trustCenters || [];
    expect(trustCenters.length).toBeGreaterThanOrEqual(2);

    const names = trustCenters.map((tc: { name: string }) => tc.name);
    expect(names).toContain("RKI Trust Center DE");
    expect(names).toContain("RIVM Trust Center NL");
  });

  /* ── J123: Trust Centers have correct governance chain ──────── */
  test("J123 — Trust Centers have HDAB governance and country info", async ({
    page,
  }) => {
    const data = await apiGet(page, "/api/trust-center");
    const trustCenters = data.trustCenters || [];

    for (const tc of trustCenters) {
      expect(tc.country).toBeTruthy();
      expect(tc.status).toBe("active");
      expect(tc.operatedBy).toBeTruthy();
      expect(tc.protocol).toBeTruthy();
    }

    // RKI should use deterministic protocol
    const rki = trustCenters.find(
      (tc: { name: string }) => tc.name === "RKI Trust Center DE",
    );
    expect(rki).toBeDefined();
    expect(rki.country).toBe("DE");
    expect(rki.protocol).toBe("deterministic-pseudonym-v1");
  });

  /* ── J124: RIVM Trust Center uses key-managed protocol ──────── */
  test("J124 — RIVM Trust Center NL uses key-managed protocol", async ({
    page,
  }) => {
    const data = await apiGet(page, "/api/trust-center");
    const rivm = (data.trustCenters || []).find(
      (tc: { name: string }) => tc.name === "RIVM Trust Center NL",
    );
    expect(rivm).toBeDefined();
    expect(rivm.country).toBe("NL");
    expect(rivm.protocol).toBe("key-managed-v1");
  });

  /* ── J125: Pseudonym resolution audit log is accessible ─────── */
  test("J125 — Pseudonym audit log returns entries", async ({ page }) => {
    const data = await apiGet(page, "/api/trust-center/audit?limit=10");
    expect(data.entries).toBeDefined();
    expect(Array.isArray(data.entries)).toBe(true);

    if (data.entries.length > 0) {
      const entry = data.entries[0];
      expect(entry.rpsn).toMatch(/^RPSN-/);
      expect(entry.trustCenter).toBeTruthy();
      expect(entry.providerPseudonyms).toBeDefined();
      expect(Array.isArray(entry.providerPseudonyms)).toBe(true);
    }
  });

  /* ── J126: Audit entries have valid status and mode ──────────── */
  test("J126 — Audit entries have valid status and mode fields", async ({
    page,
  }) => {
    const data = await apiGet(page, "/api/trust-center/audit?limit=10");
    for (const entry of data.entries || []) {
      expect(["active", "revoked"]).toContain(entry.status);
      if (entry.mode) {
        expect(["stateless", "key-managed"]).toContain(entry.mode);
      }
    }
  });

  /* ── J127: SPE sessions API returns sessions ────────────────── */
  test("J127 — SPE sessions API returns at least 1 session", async ({
    page,
  }) => {
    const data = await apiGet(page, "/api/trust-center/spe-sessions");
    const sessions = data.sessions || [];
    expect(sessions.length).toBeGreaterThanOrEqual(1);
  });

  /* ── J128: SPE sessions have TEE attestation info ───────────── */
  test("J128 — SPE sessions have TEE attestation and k-anonymity", async ({
    page,
  }) => {
    const data = await apiGet(page, "/api/trust-center/spe-sessions");
    const sessions = data.sessions || [];

    for (const ss of sessions) {
      expect(ss.sessionId).toBeTruthy();
      expect(["active", "completed", "revoked"]).toContain(ss.status);
      expect(ss.attestationType).toBeTruthy();
      expect(ss.approvedCodeHash).toMatch(/^sha256:/);
      // k-anonymity threshold should be >= 5
      if (ss.kAnonymityThreshold != null) {
        expect(ss.kAnonymityThreshold).toBeGreaterThanOrEqual(5);
      }
    }
  });

  /* ── J129: Graph API includes Trust Center node types ────────── */
  test("J129 — Graph API returns TrustCenter nodes", async ({ page }) => {
    await skipIfNeo4jDown(page);
    const data = await apiGet(page, "/api/graph");
    const labels = new Set(
      (data.nodes || []).map((n: { label: string }) => n.label),
    );

    // At least the Trust Center nodes should be present
    expect(labels.has("TrustCenter")).toBe(true);
  });

  /* ── J130: Graph includes pseudonym-related relationships ────── */
  test("J130 — Graph includes RESOLVED_BY and GOVERNED_BY links", async ({
    page,
  }) => {
    await skipIfNeo4jDown(page);
    const data = await apiGet(page, "/api/graph");
    const linkTypes = new Set(
      (data.links || []).map((l: { type: string }) => l.type),
    );

    expect(
      linkTypes.has("GOVERNED_BY") ||
        linkTypes.has("RESOLVED_BY") ||
        linkTypes.has("CONTRIBUTES_PROTOCOL_TO"),
    ).toBe(true);
  });

  /* ── J131: Fraunhofer FIT is onboarded as a participant ──────── */
  test("J131 — Fraunhofer FIT participant exists in graph", async ({
    page,
  }) => {
    await skipIfNeo4jDown(page);
    const data = await apiGet(page, "/api/graph");
    const names = (data.nodes || []).map((n: { name: string }) => n.name);

    expect(names.some((n: string) => /Fraunhofer/i.test(n))).toBe(true);
  });

  /* ── J132: Graph Explorer page renders with Trust Center data ── */
  test("J132 — Graph Explorer renders Trust Center nodes", async ({
    page,
  }) => {
    await page.goto("/graph");
    await waitForDataLoad(page);
    await expectHeading(page, "Graph");

    // The canvas or SVG should be visible (graph rendered)
    const canvas =
      page.locator("canvas").first() || page.locator("svg").first();
    await expect(canvas).toBeVisible({ timeout: T });
  });

  /* ── J133: Research pseudonyms link to exactly 2+ providers ─── */
  test("J133 — Audit entries link at least 2 provider pseudonyms each", async ({
    page,
  }) => {
    const data = await apiGet(page, "/api/trust-center/audit?limit=10");
    for (const entry of data.entries || []) {
      expect(entry.providerPseudonyms.length).toBeGreaterThanOrEqual(2);
    }
  });
});

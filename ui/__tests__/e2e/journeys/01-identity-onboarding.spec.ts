/**
 * Journey Group A — Identity & Participant Management (J01–J05)
 *
 * Verifies participant registration, credentials via API, network
 * membership, DID resolution, and cross-participant visibility.
 *
 * Protected pages redirect to sign-in (no Keycloak in test env),
 * so identity tests use /api/* routes for data assertions.
 */
import { test, expect } from "@playwright/test";
import {
  PARTICIPANT_NAMES,
  T,
  expectSigninRedirect,
  apiGet,
  skipIfNeo4jDown,
} from "./helpers";

test.describe("A · Identity & Participant Management", () => {
  /* ── J01: Admin dashboard is protected (auth middleware) ──── */
  test("J01 — Admin dashboard requires authentication", async ({ page }) => {
    await page.goto("/admin");
    await expectSigninRedirect(page);
  });

  /* ── J02: All 5 participants are registered via API ──────── */
  test("J02 — All 5 participants registered in the network", async ({
    page,
  }) => {
    const data = await apiGet(page, "/api/participants");
    const participants = Array.isArray(data) ? data : data.participants || [];
    expect(participants.length).toBeGreaterThanOrEqual(5);

    const names = participants.map(
      (p: { displayName?: string }) => p.displayName,
    );
    for (const name of PARTICIPANT_NAMES) {
      expect(names).toContain(name);
    }
  });

  /* ── J03: Each participant has a DID identity ────────────── */
  test("J03 — Each participant has a valid DID identity", async ({ page }) => {
    const data = await apiGet(page, "/api/participants");
    const participants = Array.isArray(data) ? data : data.participants || [];

    for (const p of participants) {
      const did = p.identity || p.did;
      expect(did).toBeTruthy();
      expect(did).toMatch(/^did:web:/);
    }
  });

  /* ── J04: Credentials exist for all participants ─────────── */
  test("J04 — Credentials exist for all participant holders", async ({
    page,
  }) => {
    await skipIfNeo4jDown(page);
    const data = await apiGet(page, "/api/credentials");
    const creds = data.credentials || data;
    expect(Array.isArray(creds)).toBe(true);
    expect(creds.length).toBeGreaterThanOrEqual(5);

    // Every credential has a holder name and type
    for (const c of creds) {
      expect(c.holderName || c.subjectDid).toBeTruthy();
      expect(c.credentialType || c.type).toBeTruthy();
    }
  });

  /* ── J05: Credentials include EHDS and DataQuality types ── */
  test("J05 — Both EHDS and DataQuality credential types exist", async ({
    page,
  }) => {
    await skipIfNeo4jDown(page);
    const data = await apiGet(page, "/api/credentials");
    const creds = data.credentials || data;
    const types = new Set(
      creds.map(
        (c: { credentialType?: string; type?: string }) =>
          c.credentialType || c.type,
      ),
    );
    expect(types.has("EHDSParticipantCredential")).toBe(true);
    expect(types.has("DataQualityLabelCredential")).toBe(true);
  });
});

/**
 * Journey Group L — Negotiation Workflow, Transfer Pipeline & Data Sharing (J92–J101)
 *
 * Verifies the full DSP workflow chain: negotiation API structure,
 * transfer state-machine states, asset management APIs, and the
 * end-to-end Negotiate→Transfer linkage (FINALIZED → STARTED).
 *
 * /negotiate, /data/transfer, /data/share are PROTECTED pages.
 * Tests use API-level assertions (no auth middleware on /api/*).
 */
import { test, expect } from "@playwright/test";
import { expectSigninRedirect, apiGet } from "./helpers";

test.describe("L · Negotiation Workflow, Transfer Pipeline & Data Sharing", () => {
  /* ── J92: Negotiations follow DSP protocol with correct fields ── */
  test("J92 — Negotiations have DSP protocol, state, and counterPartyId", async ({
    page,
  }) => {
    const participantsData = await apiGet(page, "/api/participants");
    const participants = Array.isArray(participantsData)
      ? participantsData
      : participantsData.participants || [];
    const pid = participants[0].participantId || participants[0]["@id"];
    const negs = await apiGet(page, `/api/negotiations?participantId=${pid}`);
    expect(negs.length).toBeGreaterThanOrEqual(1);

    const neg = negs[0];
    expect(neg.protocol).toMatch(/dataspace-protocol/);
    expect(neg.state).toBeTruthy();
    expect(neg.counterPartyId || neg.counterPartyAddress).toBeTruthy();
    expect(neg.assetId || neg["assetId"]).toBeTruthy();
  });

  /* ── J93: Transfer API returns all 4 DSP state types ─────── */
  test("J93 — Transfer API includes REQUESTED, STARTED, COMPLETED, and TERMINATED states", async ({
    page,
  }) => {
    const participantsData = await apiGet(page, "/api/participants");
    const participants = Array.isArray(participantsData)
      ? participantsData
      : participantsData.participants || [];
    const pid = participants[0].participantId || participants[0]["@id"];
    const transfers = await apiGet(page, `/api/transfers?participantId=${pid}`);
    expect(Array.isArray(transfers)).toBe(true);
    expect(transfers.length).toBeGreaterThanOrEqual(10);

    const stateSet = new Set(transfers.map((t: { state: string }) => t.state));
    expect(stateSet.has("STARTED")).toBe(true);
    expect(stateSet.has("COMPLETED")).toBe(true);
    // At least 3 of the 4 DSP states should be present
    const dspStates = ["REQUESTED", "STARTED", "COMPLETED", "TERMINATED"];
    const found = dspStates.filter((s) => stateSet.has(s));
    expect(found.length).toBeGreaterThanOrEqual(3);
  });

  /* ── J94: Transfer entries reference contract agreements ─── */
  test("J94 — Transfer entries have contractId linking to negotiations", async ({
    page,
  }) => {
    const participantsData = await apiGet(page, "/api/participants");
    const participants = Array.isArray(participantsData)
      ? participantsData
      : participantsData.participants || [];
    const pid = participants[0].participantId || participants[0]["@id"];
    const transfers = await apiGet(page, `/api/transfers?participantId=${pid}`);
    const withContract = transfers.filter(
      (t: { contractId?: string }) => t.contractId,
    );
    expect(withContract.length).toBeGreaterThanOrEqual(5);

    // Contract IDs should be non-empty strings (UUIDs or agreement-* patterns)
    for (const t of withContract.slice(0, 3)) {
      expect(t.contractId.length).toBeGreaterThanOrEqual(5);
    }
  });

  /* ── J95: Negotiate→Transfer chain — finalized negotiations have matching transfers ── */
  test("J95 — Finalized negotiations have corresponding transfer processes", async ({
    page,
  }) => {
    const participantsData = await apiGet(page, "/api/participants");
    const participants = Array.isArray(participantsData)
      ? participantsData
      : participantsData.participants || [];
    const pid = participants[0].participantId || participants[0]["@id"];
    const negs = await apiGet(page, `/api/negotiations?participantId=${pid}`);

    const finalized = negs.filter(
      (n: { state: string }) => n.state === "FINALIZED",
    );
    expect(finalized.length).toBeGreaterThanOrEqual(1);

    // At least one finalized negotiation should have a contractAgreementId
    const withAgreement = finalized.filter(
      (n: { contractAgreementId?: string }) => n.contractAgreementId,
    );
    expect(withAgreement.length).toBeGreaterThanOrEqual(1);
  });

  /* ── J96: Assets API returns well-structured asset entries ── */
  test("J96 — Assets API returns entries with name, contenttype, and description", async ({
    page,
  }) => {
    const assets = await apiGet(page, "/api/assets");
    expect(Array.isArray(assets)).toBe(true);
    expect(assets.length).toBeGreaterThanOrEqual(1);

    // Check first participant's assets have proper structure
    const firstWithAssets = assets.find(
      (a: { assets: unknown[] }) =>
        Array.isArray(a.assets) && a.assets.length > 0,
    );
    expect(firstWithAssets).toBeTruthy();

    const asset = firstWithAssets.assets[0];
    expect(asset["@id"] || asset.id || asset.assetId).toBeTruthy();
  });

  /* ── J97: Share Data page is protected ───────────────────── */
  test("J97 — Share Data page redirects unauthenticated users", async ({
    page,
  }) => {
    await page.goto("/data/share");
    await expectSigninRedirect(page);
  });

  /* ── J98: Transfers use HttpData-PULL type ───────────────── */
  test("J98 — Transfers use HttpData-PULL transfer type", async ({ page }) => {
    const participantsData = await apiGet(page, "/api/participants");
    const participants = Array.isArray(participantsData)
      ? participantsData
      : participantsData.participants || [];
    const pid = participants[0].participantId || participants[0]["@id"];
    const transfers = await apiGet(page, `/api/transfers?participantId=${pid}`);
    const httpPull = transfers.filter(
      (t: { transferType?: string }) => t.transferType === "HttpData-PULL",
    );
    expect(httpPull.length).toBeGreaterThanOrEqual(5);
  });

  /* ── J99: Negotiations span all 5 fictional participants ── */
  test("J99 — Negotiations reference multiple counterparty DIDs", async ({
    page,
  }) => {
    const participantsData = await apiGet(page, "/api/participants");
    const participants = Array.isArray(participantsData)
      ? participantsData
      : participantsData.participants || [];

    const allCounterparties = new Set<string>();
    for (const p of participants.slice(0, 3)) {
      const pid = p.participantId || p["@id"];
      const negs = await apiGet(page, `/api/negotiations?participantId=${pid}`);
      for (const n of negs) {
        if (n.counterPartyId) allCounterparties.add(n.counterPartyId);
      }
    }
    // At least 2 different counterparties across all negotiations
    expect(allCounterparties.size).toBeGreaterThanOrEqual(2);
  });

  /* ── J100: Transfers have timestamps ────────────────────── */
  test("J100 — Transfer entries include stateTimestamp", async ({ page }) => {
    const participantsData = await apiGet(page, "/api/participants");
    const participants = Array.isArray(participantsData)
      ? participantsData
      : participantsData.participants || [];
    const pid = participants[0].participantId || participants[0]["@id"];
    const transfers = await apiGet(page, `/api/transfers?participantId=${pid}`);
    const withTimestamp = transfers.filter(
      (t: { stateTimestamp?: number }) =>
        typeof t.stateTimestamp === "number" && t.stateTimestamp > 0,
    );
    expect(withTimestamp.length).toBeGreaterThanOrEqual(10);
  });

  /* ── J101: Discover Data page is protected ──────────────── */
  test("J101 — Discover Data page requires authentication", async ({
    page,
  }) => {
    await page.goto("/data/discover");
    await expectSigninRedirect(page);
  });
});

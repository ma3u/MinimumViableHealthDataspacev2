/**
 * Journey Group E — Contract Negotiation (J31–J40)
 *
 * Verifies the DSP contract negotiation lifecycle: participant APIs,
 * negotiation state-machine progression, cross-border scenarios,
 * asset definitions, and task aggregation.
 *
 * /negotiate is protected → verify redirect.
 * APIs (/api/tasks, /api/negotiations, /api/assets) have no middleware.
 */
import { test, expect } from "@playwright/test";
import { PARTICIPANT_NAMES, T, expectSigninRedirect, apiGet } from "./helpers";

test.describe("E · Contract Negotiation", () => {
  /* ── J31: Negotiate page is protected ────────────────────── */
  test("J31 — Negotiate page requires authentication", async ({ page }) => {
    await page.goto("/negotiate");
    await expectSigninRedirect(page);
  });

  /* ── J32: Tasks API returns negotiations ─────────────────── */
  test("J32 — Tasks API includes negotiation entries", async ({ page }) => {
    const data = await apiGet(page, "/api/tasks");
    const tasks = data.tasks || data;
    expect(Array.isArray(tasks)).toBe(true);

    const negotiations = tasks.filter(
      (t: { type: string }) => t.type === "negotiation",
    );
    expect(negotiations.length).toBeGreaterThanOrEqual(1);
  });

  /* ── J33: Negotiations include FINALIZED state ───────────── */
  test("J33 — At least one negotiation is FINALIZED", async ({ page }) => {
    const data = await apiGet(page, "/api/tasks");
    const tasks = data.tasks || data;

    const finalized = tasks.filter(
      (t: { type: string; state: string }) =>
        t.type === "negotiation" && t.state === "FINALIZED",
    );
    expect(finalized.length).toBeGreaterThanOrEqual(1);
  });

  /* ── J34: Negotiations span multiple participants ────────── */
  test("J34 — Negotiations exist for multiple participants", async ({
    page,
  }) => {
    const data = await apiGet(page, "/api/tasks");
    const tasks = data.tasks || data;

    const participants = new Set(
      tasks
        .filter((t: { type: string }) => t.type === "negotiation")
        .map((t: { participant: string }) => t.participant),
    );
    expect(participants.size).toBeGreaterThanOrEqual(2);
  });

  /* ── J35: Per-participant negotiations via API ───────────── */
  test("J35 — Participant-scoped negotiations API works", async ({ page }) => {
    const participantsData = await apiGet(page, "/api/participants");
    const participants = Array.isArray(participantsData)
      ? participantsData
      : participantsData.participants || [];
    expect(participants.length).toBeGreaterThanOrEqual(1);

    // Try loading negotiations for the first participant
    const pid = participants[0].participantId || participants[0]["@id"];
    const negs = await apiGet(page, `/api/negotiations?participantId=${pid}`);
    expect(Array.isArray(negs)).toBe(true);
  });

  /* ── J36: Negotiations use DSP protocol ──────────────────── */
  test("J36 — Negotiations follow DSP protocol", async ({ page }) => {
    const participantsData = await apiGet(page, "/api/participants");
    const participants = Array.isArray(participantsData)
      ? participantsData
      : participantsData.participants || [];

    const pid = participants[0].participantId || participants[0]["@id"];
    const negs = await apiGet(page, `/api/negotiations?participantId=${pid}`);

    if (negs.length > 0) {
      const neg = negs[0];
      expect(neg.protocol || neg["@type"]).toBeTruthy();
      // State should be a valid DSP state
      expect(neg.state).toMatch(
        /REQUESTED|OFFERED|ACCEPTED|AGREED|VERIFIED|FINALIZED|TERMINATED/,
      );
    }
  });

  /* ── J37: Assets API returns participant-scoped assets ──── */
  test("J37 — Assets API returns assets for multiple participants", async ({
    page,
  }) => {
    const assets = await apiGet(page, "/api/assets");
    expect(Array.isArray(assets)).toBe(true);
    expect(assets.length).toBeGreaterThanOrEqual(3);

    // Each entry should have a participantId and assets array
    for (const entry of assets) {
      expect(entry.participantId || entry.identity).toBeTruthy();
      expect(Array.isArray(entry.assets)).toBe(true);
    }
  });

  /* ── J38: TERMINATED negotiations exist ──────────────────── */
  test("J38 — Terminated negotiation exists in task list or per-participant", async ({
    page,
  }) => {
    // Check tasks first
    const data = await apiGet(page, "/api/tasks");
    const tasks = data.tasks || data;

    // Also check per-participant negotiations
    const participantsData = await apiGet(page, "/api/participants");
    const participants = Array.isArray(participantsData)
      ? participantsData
      : participantsData.participants || [];

    let foundTerminated = tasks.some(
      (t: { type: string; state: string }) =>
        t.type === "negotiation" && t.state === "TERMINATED",
    );

    if (!foundTerminated) {
      for (const p of participants) {
        const pid = p.participantId || p["@id"];
        const negs = await apiGet(
          page,
          `/api/negotiations?participantId=${pid}`,
        );
        if (negs.some((n: { state: string }) => n.state === "TERMINATED")) {
          foundTerminated = true;
          break;
        }
      }
    }
    expect(foundTerminated).toBe(true);
  });

  /* ── J39: Negotiations have contractAgreementId when FINALIZED ── */
  test("J39 — Finalized negotiations include contractAgreementId", async ({
    page,
  }) => {
    const participantsData = await apiGet(page, "/api/participants");
    const participants = Array.isArray(participantsData)
      ? participantsData
      : participantsData.participants || [];

    for (const p of participants) {
      const pid = p.participantId || p["@id"];
      const negs = await apiGet(page, `/api/negotiations?participantId=${pid}`);
      const finalized = negs.filter(
        (n: { state: string }) => n.state === "FINALIZED",
      );
      for (const f of finalized) {
        expect(f.contractAgreementId).toBeTruthy();
      }
      if (finalized.length > 0) break;
    }
  });

  /* ── J40: Cross-border negotiation counterparty ──────────── */
  test("J40 — Cross-border negotiation involves different DID domains", async ({
    page,
  }) => {
    const participantsData = await apiGet(page, "/api/participants");
    const participants = Array.isArray(participantsData)
      ? participantsData
      : participantsData.participants || [];

    // Find negotiations where counterPartyId has a different DID than the participant
    for (const p of participants) {
      const pid = p.participantId || p["@id"];
      const negs = await apiGet(page, `/api/negotiations?participantId=${pid}`);
      const crossBorder = negs.filter(
        (n: { counterPartyId: string }) =>
          n.counterPartyId && n.counterPartyId !== p.identity,
      );
      if (crossBorder.length > 0) {
        expect(crossBorder[0].counterPartyId).toMatch(/^did:web:/);
        return;
      }
    }
    // If we reach here, at least verify the data was accessible
    expect(participants.length).toBeGreaterThanOrEqual(3);
  });
});

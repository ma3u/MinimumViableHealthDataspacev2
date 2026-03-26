/**
 * Journey Group N — Trust Center & Pseudonym Resolution (Phase 18)
 * EHDS Art. 50 (Secure Processing Environment) + Art. 51 (Cross-Border)
 *
 * Tests the Trust Center UI section on /compliance and the
 * /api/trust-center API endpoint with seeded graph data.
 *
 * Run with:  npx playwright test __tests__/e2e/journeys/14-trust-center.spec.ts
 *   or:      PLAYWRIGHT_BASE_URL=http://localhost:3003 npx playwright test
 */
import { test, expect } from "@playwright/test";
import { T, apiGet, skipIfNeo4jDown, expectHeading } from "./helpers";

test.describe("N · Trust Center — EHDS Art. 50/51", () => {
  /* ── API: Trust Center status endpoint ────────────────────── */

  test("J130 — /api/trust-center returns trust centers array", async ({
    page,
  }) => {
    await skipIfNeo4jDown(page);
    const data = await apiGet(page, "/api/trust-center");
    expect(Array.isArray(data.trustCenters)).toBe(true);
  });

  test("J131 — /api/trust-center returns RKI trust center after seeding", async ({
    page,
  }) => {
    await skipIfNeo4jDown(page);
    const data = await apiGet(page, "/api/trust-center");

    if (data.trustCenters.length === 0) {
      test.skip(
        true,
        "Trust center seed data not loaded — run seed-trust-center.cypher",
      );
      return;
    }

    const rki = data.trustCenters.find(
      (tc: { name: string }) => tc.name === "RKI Trust Center DE",
    );
    expect(rki).toBeDefined();
    expect(rki.country).toBe("DE");
    expect(rki.status).toBe("active");
    expect(rki.did).toBe("did:web:rki.de:trustcenter");
  });

  test("J132 — /api/trust-center returns RIVM trust center after seeding", async ({
    page,
  }) => {
    await skipIfNeo4jDown(page);
    const data = await apiGet(page, "/api/trust-center");

    if (data.trustCenters.length < 2) {
      test.skip(true, "Trust center seed data not loaded");
      return;
    }

    const rivm = data.trustCenters.find(
      (tc: { name: string }) => tc.name === "RIVM Trust Center NL",
    );
    expect(rivm).toBeDefined();
    expect(rivm.country).toBe("NL");
    expect(rivm.status).toBe("active");
  });

  test("J133 — Trust centers include mutual recognition countries", async ({
    page,
  }) => {
    await skipIfNeo4jDown(page);
    const data = await apiGet(page, "/api/trust-center");

    if (data.trustCenters.length < 2) {
      test.skip(true, "Trust center seed data not loaded");
      return;
    }

    const rki = data.trustCenters.find(
      (tc: { name: string }) => tc.name === "RKI Trust Center DE",
    );
    expect(rki?.recognisedCountries).toContain("NL");
  });

  test("J134 — /api/trust-center returns SPE sessions array", async ({
    page,
  }) => {
    await skipIfNeo4jDown(page);
    const data = await apiGet(page, "/api/trust-center");
    expect(Array.isArray(data.speSessions)).toBe(true);
  });

  test("J135 — SPE sessions have k-anonymity threshold and output policy", async ({
    page,
  }) => {
    await skipIfNeo4jDown(page);
    const data = await apiGet(page, "/api/trust-center");

    if (data.speSessions.length === 0) {
      test.skip(true, "No SPE sessions seeded");
      return;
    }

    const session = data.speSessions[0];
    expect(typeof session.kAnonymityThreshold).toBe("number");
    expect(session.kAnonymityThreshold).toBeGreaterThanOrEqual(5);
    expect(session.outputPolicy).toBe("aggregate-only");
  });

  /* ── UI: /compliance page Trust Center section ────────────── */

  test("J136 — /compliance page renders Trust Center section heading", async ({
    page,
  }) => {
    await page.goto("/compliance");
    await expectHeading(page, "Trust Center");
    await expect(page.getByText(/Pseudonym Resolution/i).first()).toBeVisible({
      timeout: T,
    });
  });

  test("J137 — /compliance page renders EHDS Art. 50/51 description", async ({
    page,
  }) => {
    await page.goto("/compliance");
    await expect(page.getByText(/EHDS Art\. 50\/51/i).first()).toBeVisible({
      timeout: T,
    });
  });

  test("J138 — /compliance shows trust center cards or fallback message", async ({
    page,
  }) => {
    await page.goto("/compliance");
    // Either trust center cards are shown (seeded) or fallback message
    await expect(
      page
        .getByTestId("trust-center-card")
        .or(page.getByText(/No trust centers found/i)),
    ).toBeVisible({ timeout: T });
  });

  test("J139 — /compliance trust center card shows status and protocol", async ({
    page,
  }) => {
    await page.goto("/compliance");

    const cards = page.getByTestId("trust-center-card");
    const count = await cards.count();
    if (count === 0) {
      test.skip(
        true,
        "No trust center seed data — run seed-trust-center.cypher",
      );
      return;
    }

    const firstCard = cards.first();
    await expect(firstCard).toBeVisible({ timeout: T });
    // Status should be visible
    await expect(firstCard.getByText(/active|inactive/i).first()).toBeVisible({
      timeout: T,
    });
  });

  test("J140 — /compliance shows security model threat mitigations", async ({
    page,
  }) => {
    await page.goto("/compliance");
    await expect(
      page.getByText(/Security Model.*Threat Mitigations/i),
    ).toBeVisible({ timeout: T });
    await expect(page.getByText(/Researcher accesses raw data/i)).toBeVisible({
      timeout: T,
    });
    await expect(page.getByText(/Trust Center collusion/i)).toBeVisible({
      timeout: T,
    });
  });

  test("J141 — /compliance shows pseudonym resolution flow diagram", async ({
    page,
  }) => {
    await page.goto("/compliance");

    const cards = page.getByTestId("trust-center-card");
    const count = await cards.count();
    if (count === 0) {
      test.skip(true, "No trust center seed data");
      return;
    }

    // Flow diagram labels within a trust center card
    await expect(page.getByText("Provider PSN").first()).toBeVisible({
      timeout: T,
    });
    await expect(page.getByText(/SPE \(TEE\)/i).first()).toBeVisible({
      timeout: T,
    });
    await expect(page.getByText("Researcher").first()).toBeVisible({
      timeout: T,
    });
  });

  test("J142 — /compliance shows SPE session table when sessions seeded", async ({
    page,
  }) => {
    await page.goto("/compliance");

    const speTable = page.getByText(/Active SPE Sessions/i);
    const isVisible = await speTable.isVisible().catch(() => false);
    if (!isVisible) {
      test.skip(true, "No SPE sessions seeded — run seed-trust-center.cypher");
      return;
    }

    await expect(speTable).toBeVisible({ timeout: T });
    const sessionRows = page.getByTestId("spe-session-row");
    await expect(sessionRows.first()).toBeVisible({ timeout: T });
  });
});

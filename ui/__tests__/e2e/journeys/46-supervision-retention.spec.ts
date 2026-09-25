/**
 * Issue #206 — supervision and the retention of the logs (J995 to J999).
 *
 * Regulation (EU) 2025/327: the access body records a finding of
 * non-compliance and the party states its views within four weeks (Art.
 * 63(2)); the body takes a measure (Art. 63(3)), here the revocation of the
 * permit the finding concerns, and the next transfer fails; the measure is
 * on the audit page and on the public register (Art. 57(1)(j)(iv)); the
 * body asks for information and gets an answer on record (Art. 63(1)); and
 * the logs of the secure processing environment are kept at least one year
 * (Art. 73(1)(e)), so the purge deletes nothing younger.
 *
 * Every run leaves an application, a permit, a finding and an information
 * request on the graph, like journeys 40 to 42 and 45.
 *
 *   PLAYWRIGHT_BASE_URL=https://ehds.mabu.red \
 *     npx playwright test __tests__/e2e/journeys/46-supervision-retention.spec.ts
 */
import { test, expect, type Browser, type Page } from "@playwright/test";
import { apiGet, loginAs, skipIfKeycloakDown } from "./helpers";

test.describe.configure({ mode: "serial" });

const DATASET = `dataset:journey46-${Date.now().toString(36)}`;
const TRANSFER = {
  participantId: "pharmaco-ctx",
  contractId: "demo-agreement:fhir-cohort-bundle",
  assetId: "fhir-cohort-bundle",
  counterPartyAddress: "https://alpha-klinik.de/dsp/2025-1",
  datasetId: DATASET,
};
const DAY = 86_400_000;

let permitId = "";
let findingId = "";
let infoId = "";

async function signedInAs(browser: Browser, user: string): Promise<Page> {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    try {
      sessionStorage.setItem("demo-password-banner-dismissed", "true");
    } catch {
      /* ignore */
    }
  });
  await loginAs(page, user, user);
  return page;
}

test.describe("Issue #206 · supervision (Art. 63) and retention (Art. 73(1)(e))", () => {
  test.beforeEach(async () => {
    await skipIfKeycloakDown();
  });

  test("J995 a permit is issued and the access body records a finding against its holder", async ({
    browser,
  }) => {
    test.setTimeout(150_000);
    const researcher = await signedInAs(browser, "researcher");
    const applied = await researcher.request.post(
      "/api/compliance/applications",
      {
        data: {
          datasetId: DATASET,
          purpose: "SCIENTIFIC_RESEARCH",
          justification: "Journey 46: cohort analysis, aggregate output only.",
          periodMonths: 6,
        },
      },
    );
    expect(applied.status(), await applied.text()).toBe(201);
    const applicationId = (await applied.json()).applicationId;
    await researcher.context().close();

    const regulator = await signedInAs(browser, "regulator");
    const issued = await regulator.request.post("/api/compliance/permits", {
      data: {
        applicationId,
        decision: "APPROVED",
        purpose: "SCIENTIFIC_RESEARCH",
        datasetId: DATASET,
      },
    });
    expect(issued.status(), await issued.text()).toBe(200);
    permitId = (await issued.json()).permitId;

    await regulator.goto("/supervision");
    await expect(
      regulator.getByRole("heading", { name: "Supervision" }),
    ).toBeVisible({ timeout: 15_000 });
    await regulator
      .locator("#finding-party")
      .selectOption("did:web:pharmaco.de:research");
    await expect(regulator.locator("#finding-permit")).toContainText(permitId, {
      timeout: 15_000,
    });
    await regulator.locator("#finding-permit").selectOption(permitId);
    await regulator
      .locator("#finding-description")
      .fill(
        "Journey 46: output left the SPE with direct identifiers (Art. 61(2)).",
      );
    await regulator.getByRole("button", { name: "Record and notify" }).click();
    const status = regulator.getByRole("status").first();
    await expect(status).toContainText("states its views by", {
      timeout: 15_000,
    });
    await expect(status).toContainText("supervisory authority is informed");
    findingId =
      (await status.textContent())?.match(/Finding (\S+) recorded/)?.[1] ?? "";
    expect(findingId).toMatch(/^finding-pharmaco-/);

    const list = await apiGet(regulator, "/api/compliance/findings");
    const mine = (
      list.findings as {
        findingId: string;
        status: string;
        respondBy: string;
        gdprBreach: boolean;
        permitId: string;
      }[]
    ).find((f) => f.findingId === findingId);
    expect(mine?.status).toBe("OPEN");
    expect(mine?.gdprBreach).toBe(true);
    expect(mine?.permitId).toBe(permitId);
    const by = Date.parse(mine?.respondBy ?? "") - Date.now();
    expect(by).toBeGreaterThan(27 * DAY);
    expect(by).toBeLessThanOrEqual(28 * DAY);
    await regulator.context().close();
  });

  test("J996 the party states its views within the four weeks (Art. 63(2))", async ({
    browser,
  }) => {
    test.setTimeout(120_000);
    const researcher = await signedInAs(browser, "researcher");
    await researcher.goto("/supervision");
    const card = researcher.locator(
      `[data-testid="finding-card"][data-finding-id="${findingId}"]`,
    );
    await expect(card).toBeVisible({ timeout: 15_000 });
    await expect(card.getByTestId("finding-respond-by")).toContainText("days");
    await card
      .locator(`#views-${findingId}`)
      .fill(
        "Journey 46: the export was a test file with synthetic identifiers; the procedure is corrected.",
      );
    await card.getByRole("button", { name: "Send views" }).click();
    await expect(card.getByRole("status")).toContainText("on record", {
      timeout: 15_000,
    });
    await expect(card.getByTestId("supervision-status")).toHaveText(
      /views received/,
    );
    await researcher.context().close();
  });

  test("J997 the measure revokes the permit; the transfer fails; the register and the audit page show it", async ({
    browser,
  }) => {
    test.setTimeout(150_000);
    const regulator = await signedInAs(browser, "regulator");
    const closed = await regulator.request.post(
      "/api/compliance/findings/close",
      {
        data: {
          findingId,
          measure: "REVOCATION",
          note: "Journey 46: direct identifiers left the environment; the permit is revoked (Art. 63(3)).",
        },
      },
    );
    expect(closed.status(), await closed.text()).toBe(200);
    const body = await closed.json();
    expect(body.permitRevoked).toBe(true);
    expect(body.permitId).toBe(permitId);

    await regulator.goto("/admin/audit");
    await regulator.getByRole("button", { name: "Supervision" }).click();
    const row = regulator
      .locator('[data-testid="finding-row"]')
      .filter({ hasText: findingId });
    await expect(row).toBeVisible({ timeout: 20_000 });
    await expect(row).toContainText("REVOCATION");
    await expect(row).toContainText(permitId);
    await regulator.context().close();

    const researcher = await signedInAs(browser, "researcher");
    const transfer = await researcher.request.post("/api/transfers", {
      data: TRANSFER,
    });
    expect(transfer.status(), await transfer.text()).toBe(403);
    expect((await transfer.json()).article).toContain("Art. 61(1)");
    await researcher.context().close();
  });

  test("J998 the public register lists the measure; an information request is answered (Art. 63(1))", async ({
    browser,
    page,
  }) => {
    test.setTimeout(150_000);
    const register = await apiGet(page, "/api/permits");
    const measure = (
      register.measures as {
        findingId: string;
        measure: string;
        party: string;
      }[]
    ).find((m) => m.findingId === findingId);
    expect(measure?.measure).toBe("REVOCATION");
    expect(measure?.party).toBe("PharmaCo Research AG");
    const revoked = (
      register.entries as { permitId: string | null; outcome: string }[]
    ).find((e) => e.permitId === permitId);
    expect(revoked?.outcome).toBe("permit revoked");
    await page.goto("/permits");
    await expect(
      page
        .locator('[data-testid="measure-row"]')
        .filter({ hasText: "Journey 46" })
        .first(),
    ).toBeVisible({ timeout: 15_000 });

    const regulator = await signedInAs(browser, "regulator");
    const asked = await regulator.request.post(
      "/api/compliance/information-requests",
      {
        data: {
          partyDid: "did:web:pharmaco.de:research",
          permitId,
          findingId,
          question:
            "Journey 46: which outputs left the environment under this permit?",
        },
      },
    );
    expect(asked.status(), await asked.text()).toBe(201);
    infoId = (await asked.json()).requestId;
    await regulator.context().close();

    const researcher = await signedInAs(browser, "researcher");
    await researcher.goto("/supervision");
    const card = researcher.locator(
      `[data-testid="information-request-card"][data-request-id="${infoId}"]`,
    );
    await expect(card).toBeVisible({ timeout: 15_000 });
    await card
      .locator(`#answer-${infoId}`)
      .fill(
        "Journey 46: two aggregate tables, both on record in the audit trail.",
      );
    await card.getByRole("button", { name: "Send answer" }).click();
    await expect(card.getByRole("status")).toContainText("on record", {
      timeout: 15_000,
    });
    const own = await apiGet(
      researcher,
      "/api/compliance/information-requests",
    );
    const answered = (
      own.requests as { requestId: string; status: string }[]
    ).find((r) => r.requestId === infoId);
    expect(answered?.status).toBe("ANSWERED");
    await researcher.context().close();
  });

  test("J999 the logs are kept at least one year; the purge deletes nothing younger (Art. 73(1)(e))", async ({
    browser,
  }) => {
    test.setTimeout(120_000);
    const regulator = await signedInAs(browser, "regulator");
    const before = await apiGet(regulator, "/api/admin/audit/retention");
    expect(before.policy.months).toBe(12);
    expect(before.events.total).toBeGreaterThan(0);
    expect(before.events.withRetention).toBeGreaterThan(0);

    const purge = await regulator.request.post("/api/admin/audit/retention", {
      data: { confirm: true },
    });
    expect(purge.status(), await purge.text()).toBe(200);
    const result = await purge.json();
    expect(result.deleted.events).toBe(before.events.expired);
    expect(result.events.expired).toBe(0);
    expect(result.events.total).toBe(
      before.events.total - before.events.expired,
    );

    await regulator.goto("/admin/audit");
    await regulator.getByRole("button", { name: "Access Logs" }).click();
    await expect(regulator.getByTestId("retention-line")).toContainText(
      "at least 12 months",
      { timeout: 20_000 },
    );
    await regulator.context().close();
  });
});

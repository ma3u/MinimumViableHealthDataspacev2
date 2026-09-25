/**
 * Issue #206 — transparency, results, fees and the trusted holder
 * (J1000 to J1004).
 *
 * Regulation (EU) 2025/327: the access body informs the public (Art. 58(1))
 * on a page that needs no sign-in; a permit carries a fee split between the
 * body and the holder, reduced for the categories of Art. 62(3); the data
 * user communicates the results of its use within 18 months (Art. 61(4))
 * and they are published (Art. 57(1)(j)(v)) and reported (Art. 59(1)(j));
 * a trusted data holder answers a statistical request on its own dataset
 * (Art. 72); and the activity report shows the revenues (Art. 59(1)(g)).
 *
 * Every run leaves an application, a permit, a result and a request on the
 * graph, like journeys 40 to 42, 45 and 46.
 *
 *   PLAYWRIGHT_BASE_URL=https://ehds.mabu.red \
 *     npx playwright test __tests__/e2e/journeys/47-information-results-fees.spec.ts
 */
import { test, expect, type Browser, type Page } from "@playwright/test";
import { apiGet, loginAs, skipIfKeycloakDown } from "./helpers";

test.describe.configure({ mode: "serial" });

const DATASET = `dataset:journey47-${Date.now().toString(36)}`;
/** The dataset AlphaKlinik Berlin offers, so the trusted holder may answer. */
const ALPHA_DATASET = "urn:uuid:riverside:dataset:diab-001";

let applicationId = "";
let permitId = "";
let requestId = "";

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

test.describe("Issue #206 · information, results, fees, trusted holder", () => {
  test("J1000 the public information page renders without a session (Art. 58(1))", async ({
    page,
  }) => {
    await page.goto("/information");
    await expect(
      page.getByRole("heading", {
        name: "Secondary use of health data: what you should know",
      }),
    ).toBeVisible({ timeout: 15_000 });
    for (const letter of ["a", "b", "c", "d", "e", "f", "g"]) {
      await expect(page.getByTestId(`info-${letter}`)).toBeVisible();
    }
    await expect(page.getByTestId("info-e")).toContainText("MedReg DE", {
      timeout: 15_000,
    });
    await expect(page.getByTestId("info-fees")).toContainText("Art. 62");
    const info = await apiGet(page, "/api/information");
    expect(info.article).toContain("Art. 58(1)");
    expect(info.fees.reductions.ACADEMIC).toBe(0.5);
    expect(info.bodies.length).toBeGreaterThan(0);
  });

  test("J1001 an academic applicant's permit carries a reduced fee (Art. 62)", async ({
    browser,
  }) => {
    test.setTimeout(150_000);
    await skipIfKeycloakDown();
    const researcher = await signedInAs(browser, "researcher");
    const applied = await researcher.request.post(
      "/api/compliance/applications",
      {
        data: {
          datasetId: DATASET,
          purpose: "SCIENTIFIC_RESEARCH",
          justification: "Journey 47: outcomes study, aggregate output only.",
          applicantCategory: "ACADEMIC",
          processingPeriodMonths: 12,
          identifiability: "PSEUDONYMISED",
          pseudonymisationJustification: "longitudinal linkage",
        },
      },
    );
    expect(applied.status(), await applied.text()).toBe(201);
    applicationId = (await applied.json()).applicationId;
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
    const body = await issued.json();
    permitId = body.permitId;
    expect(body.fee.category).toBe("ACADEMIC");
    expect(body.fee.reduction).toBe(0.5);
    expect(body.fee.totalEur).toBe(body.fee.bodyEur + body.fee.holderEur);
    expect(body.fee.totalEur).toBe(Math.round((1500 + 250 + 600 + 2000) * 0.5));
    await regulator.context().close();

    const register = await apiGet(regulator, "/api/permits").catch(() => null);
    if (register) {
      const entry = (
        register.entries as { permitId: string | null; feeEur: number | null }[]
      ).find((e) => e.permitId === permitId);
      expect(entry?.feeEur).toBe(body.fee.totalEur);
    }
  });

  test("J1002 the data user communicates results; the register, the information page and the report show them (Art. 61(4))", async ({
    browser,
    page,
  }) => {
    test.setTimeout(150_000);
    await skipIfKeycloakDown();
    const researcher = await signedInAs(browser, "researcher");
    await researcher.goto("/applications");
    const card = researcher.locator(
      `[data-testid="application-card"][data-application-id="${applicationId}"]`,
    );
    await expect(card).toBeVisible({ timeout: 15_000 });
    const form = card.getByTestId("results-form");
    await expect(form).toContainText("due by");
    await form
      .locator(`#result-title-${applicationId}`)
      .fill("Journey 47: second-line therapies and HbA1c trajectories");
    await form.getByRole("button", { name: "Communicate results" }).click();
    await expect(form.getByRole("status")).toContainText(
      "within the 18 months",
      {
        timeout: 15_000,
      },
    );
    await researcher.context().close();

    const register = await apiGet(page, "/api/permits");
    const result = (
      register.results as { permitId: string; title: string; onTime: boolean }[]
    ).find((r) => r.permitId === permitId);
    expect(result?.title).toContain("Journey 47");
    expect(result?.onTime).toBe(true);
    const entry = (
      register.entries as {
        permitId: string | null;
        results: { count: number; onTime: boolean | null } | null;
      }[]
    ).find((e) => e.permitId === permitId);
    expect(entry?.results?.count).toBe(1);
    expect(entry?.results?.onTime).toBe(true);

    await page.goto("/permits");
    await expect(
      page
        .locator('[data-testid="result-row"]')
        .filter({ hasText: "Journey 47" })
        .first(),
    ).toBeVisible({ timeout: 15_000 });

    const info = await apiGet(page, "/api/information");
    expect(
      (info.results as { permitId: string }[]).some(
        (r) => r.permitId === permitId,
      ),
    ).toBe(true);

    const report = await apiGet(page, "/api/activity-report");
    expect(report.items.a.resultsCommunicated).toBeGreaterThan(0);
    expect((report.items.j.entries as string[]).join(" ")).toContain(
      "Journey 47",
    );
    expect(report.items.g.amountEur).toBeGreaterThan(0);
  });

  test("J1003 a trusted data holder answers a statistical request on its own dataset (Art. 72)", async ({
    browser,
  }) => {
    test.setTimeout(180_000);
    await skipIfKeycloakDown();
    const researcher = await signedInAs(browser, "researcher");
    const filed = await researcher.request.post("/api/compliance/requests", {
      data: {
        question: "How many patients are there?",
        purpose: "SCIENTIFIC_RESEARCH",
        datasetId: ALPHA_DATASET,
        statisticalContent:
          "Journey 47: one count of the cohort, no breakdown.",
        safeguards:
          "No record leaves the environment; counts below 5 are suppressed.",
      },
    });
    expect(filed.status(), await filed.text()).toBe(201);
    requestId = (await filed.json()).requestId;
    await researcher.context().close();

    const clinic = await signedInAs(browser, "clinicuser");
    const inbox = await apiGet(clinic, "/api/compliance/requests");
    expect(inbox.trustedHolder).toBe(true);
    expect(inbox.scope).toBe("holder");
    const mine = (
      inbox.requests as { requestId: string; canDecide: boolean }[]
    ).find((r) => r.requestId === requestId);
    expect(mine?.canDecide).toBe(true);

    await clinic.goto("/requests");
    await expect(clinic.getByTestId("trusted-holder-note")).toBeVisible({
      timeout: 15_000,
    });
    const card = clinic.locator(
      `[data-testid="request-card"][data-request-id="${requestId}"]`,
    );
    await expect(card).toBeVisible({ timeout: 15_000 });
    await expect(card).toContainText("Decide as the trusted data holder");
    await card.getByRole("button", { name: /approve/i }).click();
    await expect(card.getByTestId("decided-under")).toContainText("Art. 72", {
      timeout: 90_000,
    });
    await clinic.context().close();
  });

  test("J1004 the register says who decided under Art. 72 and what it cost", async ({
    page,
  }) => {
    const register = await apiGet(page, "/api/permits");
    const entry = (
      register.entries as {
        applicationId: string;
        decidedUnder: string | null;
        feeEur: number | null;
        accessBody: string | null;
      }[]
    ).find((e) => e.applicationId === requestId);
    expect(entry?.decidedUnder).toBe("Art. 72");
    expect(entry?.feeEur).toBe(300);
    expect(entry?.accessBody).toBe("AlphaKlinik Berlin");
    expect(register.articles.trustedHolders).toBe("Art. 72");
  });
});

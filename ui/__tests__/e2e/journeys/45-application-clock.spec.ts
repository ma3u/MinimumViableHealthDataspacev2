/**
 * Issue #206 — the application with its eleven items and the Art. 68(4)
 * clock (J990 to J994).
 *
 * Regulation (EU) 2025/327: the data user applies with the items of Art.
 * 67(2); the access body has three months from a complete application, may
 * send the applicant back for missing items (four weeks), and may extend
 * once by three months with reasons. This journey files a complete
 * application through the researcher's form, has the access body find it
 * incomplete anyway (the demo has no reviewer to argue), sees the clock
 * stop, completes it, sees the clock run again from now, extends once and
 * sees the second extension refused, and reads it all on the public register.
 *
 * Every run leaves one application on the graph, like journeys 40 to 42.
 *
 *   PLAYWRIGHT_BASE_URL=https://ehds.mabu.red \
 *     npx playwright test __tests__/e2e/journeys/45-application-clock.spec.ts
 */
import { test, expect, type Browser, type Page } from "@playwright/test";
import { apiGet, loginAs, skipIfKeycloakDown } from "./helpers";

test.describe.configure({ mode: "serial" });

const DATASET = `dataset:journey45-${Date.now().toString(36)}`;
const DAY = 86_400_000;

let applicationId = "";

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

test.describe("Issue #206 · the application and the Art. 68(4) clock", () => {
  test.beforeEach(async () => {
    await skipIfKeycloakDown();
  });

  test("J990 the researcher files a complete application through the form (Art. 67(2))", async ({
    browser,
  }) => {
    test.setTimeout(120_000);
    const researcher = await signedInAs(browser, "researcher");
    await researcher.goto("/applications");
    await expect(
      researcher.getByRole("heading", { name: "Data permit applications" }),
    ).toBeVisible({ timeout: 15_000 });
    await researcher.locator("#apply-name").fill("Journey 45 application");
    await researcher.locator("#apply-datasetId").fill(DATASET);
    await researcher
      .getByRole("button", { name: "File the application" })
      .click();
    const status = researcher.getByRole("status").first();
    await expect(status).toContainText("filed, 11 of 11 items", {
      timeout: 20_000,
    });
    const m = (await status.textContent())?.match(/Application (\S+) filed/);
    applicationId = m?.[1] ?? "";
    expect(applicationId).toMatch(/^app-pharmaco-/);

    const card = researcher.locator(
      `[data-testid="application-card"][data-application-id="${applicationId}"]`,
    );
    await expect(card.getByTestId("application-completeness")).toContainText(
      "complete, 11 of 11",
      { timeout: 30_000 },
    );
    await expect(card.getByTestId("application-status")).toHaveText(
      /under decision/,
    );
    await researcher.context().close();
  });

  test("J991 the access body sees every item and stops the clock (Art. 68(4))", async ({
    browser,
  }) => {
    test.setTimeout(120_000);
    const regulator = await signedInAs(browser, "regulator");
    const inbox = await apiGet(regulator, "/api/compliance/applications");
    const mine = (
      inbox.applications as {
        applicationId: string;
        completeness: { complete: boolean; present: number };
        clockState: string;
      }[]
    ).find((a) => a.applicationId === applicationId);
    expect(mine?.completeness.complete).toBe(true);
    expect(mine?.completeness.present).toBe(11);
    expect(mine?.clockState).toBe("running");

    await regulator.goto("/compliance");
    await expect(regulator.getByText("Decision due")).toBeVisible({
      timeout: 15_000,
    });
    const row = regulator.locator(`tr[data-application-id="${applicationId}"]`);
    await expect(row).toBeVisible({ timeout: 15_000 });
    await row.click();
    const panel = regulator.getByTestId("application-panel");
    await expect(panel.getByTestId("application-items")).toContainText(
      "complete, 11 of 11",
    );
    const actions = panel.getByTestId("clock-actions");
    await actions
      .locator("textarea")
      .fill("Journey 45: name the persons who will access the data (a)");
    await actions.getByRole("button", { name: "Notify incomplete" }).click();
    await expect(actions.getByRole("status")).toContainText(
      "must be completed by",
      { timeout: 15_000 },
    );

    const after = await apiGet(regulator, "/api/compliance/applications");
    const paused = (
      after.applications as {
        applicationId: string;
        clockState: string;
        completeBy: string | null;
        decisionDue: string | null;
      }[]
    ).find((a) => a.applicationId === applicationId);
    expect(paused?.clockState).toBe("paused");
    expect(paused?.decisionDue).toBeNull();
    const by = Date.parse(paused?.completeBy ?? "") - Date.now();
    expect(by).toBeGreaterThan(27 * DAY);
    expect(by).toBeLessThanOrEqual(28 * DAY);
    await regulator.context().close();
  });

  test("J992 the researcher completes it and the three months run from now", async ({
    browser,
  }) => {
    test.setTimeout(120_000);
    const researcher = await signedInAs(browser, "researcher");
    await researcher.goto("/applications");
    const card = researcher.locator(
      `[data-testid="application-card"][data-application-id="${applicationId}"]`,
    );
    await expect(card.getByTestId("application-status")).toHaveText(
      /incomplete, please complete/,
      { timeout: 15_000 },
    );
    await expect(card.getByTestId("application-clock")).toContainText(
      "stopped; complete by",
    );
    const form = card.getByTestId("complete-form");
    await form
      .locator(`#complete-${applicationId}-namedPersons`)
      .fill("PharmaCo Research AG; Dr A. Weber; M. Costa (journey 45)");
    await form.getByRole("button", { name: "Send the missing items" }).click();
    await expect(form.getByRole("status")).toContainText(
      "Complete application received",
      { timeout: 15_000 },
    );

    const own = await apiGet(researcher, "/api/compliance/applications");
    const running = (
      own.applications as {
        applicationId: string;
        clockState: string;
        decisionDue: string | null;
        completedAt: string | null;
      }[]
    ).find((a) => a.applicationId === applicationId);
    expect(running?.clockState).toBe("running");
    expect(running?.completedAt).toBeTruthy();
    const due = Date.parse(running?.decisionDue ?? "") - Date.now();
    expect(due).toBeGreaterThan(85 * DAY);
    expect(due).toBeLessThan(95 * DAY);
    await researcher.context().close();
  });

  test("J993 the access body extends once, and only once", async ({
    browser,
  }) => {
    test.setTimeout(90_000);
    const regulator = await signedInAs(browser, "regulator");
    const first = await regulator.request.post(
      "/api/compliance/applications/clock",
      {
        data: {
          applicationId,
          action: "EXTEND",
          reason:
            "Journey 45: linkage across two holders needs a second opinion",
        },
      },
    );
    expect(first.status(), await first.text()).toBe(200);
    const extended = await first.json();
    expect(extended.clockState).toBe("extended");
    const due = Date.parse(extended.decisionDue) - Date.now();
    expect(due).toBeGreaterThan(175 * DAY);
    expect(due).toBeLessThan(186 * DAY);

    const second = await regulator.request.post(
      "/api/compliance/applications/clock",
      { data: { applicationId, action: "EXTEND", reason: "again" } },
    );
    expect(second.status()).toBe(409);
    expect((await second.json()).error).toContain("one extension");
    await regulator.context().close();
  });

  test("J994 the public register shows the application with its clock", async ({
    page,
  }) => {
    const register = await apiGet(page, "/api/permits");
    const entry = (
      register.entries as {
        applicationId: string;
        outcome: string;
        clockState: string;
        extended: boolean;
        complete: boolean | null;
      }[]
    ).find((e) => e.applicationId === applicationId);
    expect(entry?.outcome).toBe("pending");
    expect(entry?.clockState).toBe("extended");
    expect(entry?.extended).toBe(true);
    expect(entry?.complete).toBe(true);
    await page.goto("/permits");
    await expect(
      page.getByText("Applications received, awaiting a decision"),
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("PharmaCo Research AG").first()).toBeVisible();
  });
});

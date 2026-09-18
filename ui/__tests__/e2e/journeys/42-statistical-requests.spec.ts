/**
 * Issue #206 — health data requests, Art. 69 (J940–J943).
 *
 * The researcher asks for a statistic; the access body approves; the
 * researcher receives an anonymised count and nothing else; a question that
 * would return records is approved but yields no answer.
 *
 *   PLAYWRIGHT_BASE_URL=https://ehds.mabu.red \
 *   KEYCLOAK_PUBLIC_URL=https://<the deployment's Keycloak> \
 *     npx playwright test __tests__/e2e/journeys/42-statistical-requests.spec.ts
 */
import { test, expect, type Browser, type Page } from "@playwright/test";
import { apiGet, loginAs, skipIfKeycloakDown } from "./helpers";

test.describe.configure({ mode: "serial" });

let countRequestId = "";
let recordRequestId = "";

async function signedInAs(browser: Browser, user: string): Promise<Page> {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await loginAs(page, user, user);
  return page;
}

test.describe("Issue #206 · statistical requests (Art. 69)", () => {
  test.beforeEach(async () => {
    await skipIfKeycloakDown();
  });

  test("J940 the researcher files two requests", async ({ browser }) => {
    test.setTimeout(90_000);
    const researcher = await signedInAs(browser, "researcher");
    const a = await researcher.request.post("/api/compliance/requests", {
      data: {
        question: "How many patients are there?",
        purpose: "SCIENTIFIC_RESEARCH",
        datasetId: "dataset:synthea-fhir-r4-mvd",
        statisticalContent: "Journey 42: one count of the cohort.",
      },
    });
    expect(a.status(), await a.text()).toBe(201);
    countRequestId = (await a.json()).requestId;

    const b = await researcher.request.post("/api/compliance/requests", {
      data: {
        question: "Show me the patient journey of patient 17",
        purpose: "SCIENTIFIC_RESEARCH",
        statisticalContent:
          "Journey 42: a single timeline (should not be answerable).",
      },
    });
    expect(b.status(), await b.text()).toBe(201);
    recordRequestId = (await b.json()).requestId;
    await researcher.context().close();
  });

  test("J941 the access body approves the count and the researcher gets only the statistic", async ({
    browser,
  }) => {
    test.setTimeout(150_000);
    const regulator = await signedInAs(browser, "regulator");
    const decided = await regulator.request.post(
      "/api/compliance/requests/decide",
      {
        data: { requestId: countRequestId, decision: "APPROVED" },
        timeout: 90_000,
      },
    );
    expect(decided.status(), await decided.text()).toBe(200);
    const body = await decided.json();
    expect(body.answered, JSON.stringify(body)).toBe(true);
    expect(body.answerTemplate).toBe("patient_count");
    await regulator.context().close();

    const researcher = await signedInAs(browser, "researcher");
    const mine = await apiGet(researcher, "/api/compliance/requests");
    expect(mine.scope).toBe("own");
    const r = (
      mine.requests as {
        requestId: string;
        status: string;
        answer: Record<string, unknown>[] | null;
      }[]
    ).find((x) => x.requestId === countRequestId);
    expect(r?.status).toBe("ANSWERED");
    expect(Array.isArray(r?.answer)).toBe(true);
    const keys = Object.keys(r!.answer![0]);
    expect(keys.some((k) => /id$/i.test(k))).toBe(false);
    await researcher.context().close();
  });

  test("J942 a question that returns records is approved but yields no statistic", async ({
    browser,
  }) => {
    test.setTimeout(150_000);
    const regulator = await signedInAs(browser, "regulator");
    const decided = await regulator.request.post(
      "/api/compliance/requests/decide",
      {
        data: { requestId: recordRequestId, decision: "APPROVED" },
        timeout: 90_000,
      },
    );
    expect(decided.status(), await decided.text()).toBe(200);
    const body = await decided.json();
    expect(body.answered).toBe(false);
    expect(body.answer).toBeNull();
    await regulator.context().close();
  });

  test("J943 the page shows the answer to the researcher", async ({
    browser,
  }) => {
    test.setTimeout(90_000);
    const researcher = await signedInAs(browser, "researcher");
    await researcher.goto("/requests");
    await expect(researcher.getByText("Statistical requests")).toBeVisible({
      timeout: 15_000,
    });
    await expect(researcher.getByTestId("answer-table").first()).toBeVisible({
      timeout: 15_000,
    });
    await expect(researcher.getByText("answered").first()).toBeVisible();
    await researcher.context().close();
  });
});

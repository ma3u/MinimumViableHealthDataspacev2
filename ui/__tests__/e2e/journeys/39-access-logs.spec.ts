/**
 * Issue #205 — the Access Logs tab of /admin/audit shows what the platform
 * records (J910–J912).
 *
 * The neo4j-proxy writes a TransferEvent for every data request it serves,
 * with the caller's DID from the X-Participant header. This journey produces
 * one such event as the PharmaCo researcher, then reads it back through the
 * audit API and the audit page as the EDC admin. Running it against a stack
 * is therefore also the way to fill the tab: every run adds one entry.
 *
 *   PLAYWRIGHT_BASE_URL=https://ehds.mabu.red \
 *   KEYCLOAK_PUBLIC_URL=https://<the deployment's Keycloak> \
 *     npx playwright test __tests__/e2e/journeys/39-access-logs.spec.ts
 *
 * Auth: Keycloak, through the shared loginAs helper. The researcher and
 * edcadmin users come from jad/keycloak-realm.json. Skips when Keycloak is
 * unreachable, like the other authenticated journeys.
 */
import { test, expect, type Page } from "@playwright/test";
import { apiGet, loginAs, loginAsAdmin, skipIfKeycloakDown } from "./helpers";

const RESEARCHER_DID = "did:web:pharmaco.de:research";
const RESEARCHER_NAME = "PharmaCo Research AG";
const QUESTION = "How many patients are there?";

interface AccessLog {
  id?: string;
  consumerDid?: string;
  consumerName?: string;
  accessedAt?: string;
  accessType?: string;
  endpoint?: string;
  purpose?: string;
}

/** Neo4j prints nine fractional digits; Date.parse wants at most three. */
function parseNeo4jTime(iso: string): number {
  return Date.parse(iso.replace(/(\.\d{3})\d+/, "$1"));
}

async function newestResearcherLog(page: Page): Promise<AccessLog | undefined> {
  const body = await apiGet(
    page,
    "/api/admin/audit?type=accesslogs&limit=5" +
      `&consumerDid=${encodeURIComponent(RESEARCHER_DID)}`,
  );
  return (body.accesslogs as AccessLog[])[0];
}

test.describe("Issue #205 · access logs are recorded and shown", () => {
  test.beforeEach(async () => {
    await skipIfKeycloakDown();
  });

  test("J910 a researcher query is recorded with the researcher's DID", async ({
    browser,
  }) => {
    // The researcher asks one question. The proxy answers it and records
    // the request; nothing else in this test writes to the graph.
    const researcher = await browser.newContext();
    const rPage = await researcher.newPage();
    await loginAs(rPage, "researcher", "researcher");
    const startedAt = Date.now();
    const q = await rPage.request.post("/api/nlq", {
      data: { question: QUESTION },
    });
    expect(q.status(), "NLQ must answer, or nothing gets recorded").toBe(200);
    await researcher.close();

    // The admin reads it back. The proxy writes the event after answering
    // (fire-and-forget), so poll briefly rather than assert at once. Five
    // minutes of clock skew between the runner and the server is tolerated.
    const admin = await browser.newContext();
    const aPage = await admin.newPage();
    await loginAsAdmin(aPage);
    let newest: AccessLog | undefined;
    await expect
      .poll(
        async () => {
          newest = await newestResearcherLog(aPage);
          return newest?.accessedAt ? parseNeo4jTime(newest.accessedAt) : 0;
        },
        {
          timeout: 20_000,
          message: "no access event for the researcher's query showed up",
        },
      )
      .toBeGreaterThanOrEqual(startedAt - 5 * 60_000);

    expect(newest?.consumerDid).toBe(RESEARCHER_DID);
    expect(newest?.consumerName).toBe(RESEARCHER_NAME);
    expect(newest?.accessType).toBe("QUERY");
    expect(newest?.endpoint).toBe("/nlq");
    await admin.close();
  });

  test("J911 the Access Logs tab lists the researcher", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/admin/audit");
    await page.getByRole("button", { name: /Access Logs/ }).click();

    const heading = page.getByText(/Data Access Logs \(\d+\)/);
    await expect(heading).toBeVisible({ timeout: 15_000 });
    const count = Number(
      /\((\d+)\)/.exec((await heading.textContent()) ?? "")?.[1] ?? 0,
    );
    expect(
      count,
      "J910 has run at least once against this stack",
    ).toBeGreaterThan(0);
    await expect(page.getByText("No access logs recorded")).toHaveCount(0);
    await expect(
      page.getByRole("cell", { name: new RegExp(RESEARCHER_NAME) }).first(),
    ).toBeVisible();
  });

  test("J912 the overview counts access events per consumer", async ({
    page,
  }) => {
    await loginAsAdmin(page);
    const body = await apiGet(page, "/api/admin/audit?type=all");
    expect(body.summary.nodeCounts.TransferEvent).toBeGreaterThan(0);
    const consumers = body.summary.accessByConsumer as {
      consumerName: string;
      totalAccesses: number;
    }[];
    const pharmaco = consumers.find((c) => c.consumerName === RESEARCHER_NAME);
    expect(pharmaco?.totalAccesses).toBeGreaterThan(0);
  });
});

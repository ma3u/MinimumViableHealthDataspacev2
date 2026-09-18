/**
 * Issue #206 — the data permit gate (J920–J923).
 *
 * Regulation (EU) 2025/327: the data user applies (Art. 67), the health data
 * access body decides within three months (Art. 68), and the user accesses
 * data only under the permit (Art. 61(1)), in the secure processing
 * environment (Art. 73). This journey walks it end to end: the PharmaCo
 * researcher applies, the MedReg regulator refuses and both the transfer and
 * a query on the dataset are blocked, the regulator issues the permit and
 * both go through, and the audit trail shows the transfer under that permit.
 *
 * Every run leaves one application, one decision and one transfer in the
 * graph, which is what a demo needs to show anyway. The dataset id is unique
 * per run: a permit an earlier run issued stays valid (refusing a new
 * application revokes nothing, Art. 63(3) is a separate act), so a second run
 * against the same graph could not be blocked for the same dataset.
 *
 *   PLAYWRIGHT_BASE_URL=https://ehds.mabu.red \
 *   KEYCLOAK_PUBLIC_URL=https://<the deployment's Keycloak> \
 *     npx playwright test __tests__/e2e/journeys/40-permit-gate.spec.ts
 */
import { test, expect, type Browser, type Page } from "@playwright/test";
import { apiGet, loginAs, skipIfKeycloakDown } from "./helpers";

test.describe.configure({ mode: "serial" });

const DATASET = `dataset:journey40-${Date.now().toString(36)}`;
const TRANSFER = {
  participantId: "pharmaco-ctx",
  contractId: "demo-agreement:fhir-cohort-bundle",
  assetId: "fhir-cohort-bundle",
  counterPartyAddress: "https://alpha-klinik.de/dsp/2025-1",
  datasetId: DATASET,
};

let applicationId = "";
let permitId = "";

async function signedInAs(browser: Browser, user: string): Promise<Page> {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await loginAs(page, user, user);
  return page;
}

test.describe("Issue #206 · the data permit gates the transfer", () => {
  test.beforeEach(async () => {
    await skipIfKeycloakDown();
  });

  test("J920 the researcher applies for access (Art. 67)", async ({
    browser,
  }) => {
    test.setTimeout(90_000);
    const researcher = await signedInAs(browser, "researcher");
    const r = await researcher.request.post("/api/compliance/applications", {
      data: {
        datasetId: DATASET,
        purpose: "SCIENTIFIC_RESEARCH",
        justification:
          "Journey 40: real-world outcomes of second-line type 2 diabetes therapies, aggregate output only.",
        periodMonths: 12,
        ethicsCommitteeRef: "EC-PharmaCo-2026-011",
      },
    });
    expect(r.status(), await r.text()).toBe(201);
    const body = await r.json();
    applicationId = body.applicationId;
    expect(applicationId).toMatch(/^app-pharmaco-/);
    expect(body.status).toBe("PENDING");
    expect(Date.parse(body.decisionDue)).toBeGreaterThan(Date.now());
    await researcher.context().close();
  });

  test("J921 a refusal blocks the transfer and the query (Art. 61(1))", async ({
    browser,
  }) => {
    test.setTimeout(120_000);
    const regulator = await signedInAs(browser, "regulator");
    const decision = await regulator.request.post("/api/compliance/permits", {
      data: {
        applicationId,
        decision: "REJECTED",
        justification:
          "Journey 40: data minimisation statement does not cover the linkage step (Art. 66).",
      },
    });
    expect(decision.status(), await decision.text()).toBe(200);
    await regulator.context().close();

    const researcher = await signedInAs(browser, "researcher");
    const transfer = await researcher.request.post("/api/transfers", {
      data: TRANSFER,
    });
    expect(transfer.status(), await transfer.text()).toBe(403);
    const body = await transfer.json();
    expect(body.error).toBe("No data permit covers this transfer");
    expect(body.article).toContain("Art. 61(1)");

    // The secure processing environment stands behind the same permit: a
    // query that names the dataset is refused before it reaches the proxy.
    const query = await researcher.request.post("/api/nlq", {
      data: { question: "How many patients are there?", datasetId: DATASET },
    });
    expect(query.status(), await query.text()).toBe(403);
    const refused = await query.json();
    expect(refused.error).toBe("No data permit covers this query");
    expect(refused.article).toContain("Art. 61(1)");
    await researcher.context().close();
  });

  test("J922 the permit unlocks the transfer and the query (Art. 68(3))", async ({
    browser,
  }) => {
    test.setTimeout(150_000);
    const regulator = await signedInAs(browser, "regulator");
    const validUntil = new Date();
    validUntil.setUTCFullYear(validUntil.getUTCFullYear() + 1);
    const decision = await regulator.request.post("/api/compliance/permits", {
      data: {
        applicationId,
        decision: "APPROVED",
        purpose: "SCIENTIFIC_RESEARCH",
        validUntil: validUntil.toISOString(),
        conditions: [
          "Access only in the secure processing environment (Art. 73)",
          "Aggregate output only (Art. 61(3))",
        ],
        criteria: {
          a: true,
          b: true,
          c: true,
          d: true,
          e: true,
          f: true,
          g: true,
          h: true,
        },
        datasetId: DATASET,
      },
    });
    expect(decision.status(), await decision.text()).toBe(200);
    const issued = await decision.json();
    permitId = issued.permitId;
    expect(permitId).toBe(`permit-${applicationId}`);
    expect(issued.datasetId).toBe(DATASET);
    await regulator.context().close();

    const researcher = await signedInAs(browser, "researcher");
    const transfer = await researcher.request.post("/api/transfers", {
      data: TRANSFER,
    });
    expect(transfer.status(), await transfer.text()).toBe(201);
    const body = await transfer.json();
    expect(body.permitId).toBe(permitId);
    expect(body.permitDatasetMatched).toBe(true);

    // The same question now runs under the permit. The proxy scales to zero
    // on Azure and needs a moment to wake.
    const query = await researcher.request.post("/api/nlq", {
      data: { question: "How many patients are there?", datasetId: DATASET },
      timeout: 90_000,
    });
    expect(query.status(), await query.text()).toBe(200);
    const answered = await query.json();
    expect(answered.error).toBeUndefined();
    expect(answered.totalRows).toBeGreaterThan(0);
    await researcher.context().close();
  });

  test("J923 the decision and the transfer are on record", async ({
    browser,
  }) => {
    test.setTimeout(120_000);
    const regulator = await signedInAs(browser, "regulator");

    const inbox = await apiGet(regulator, "/api/compliance/applications");
    const mine = (
      inbox.applications as {
        applicationId: string;
        decision: string;
        permitId: string;
      }[]
    ).find((a) => a.applicationId === applicationId);
    expect(mine?.decision).toBe("APPROVED");
    expect(mine?.permitId).toBe(permitId);

    // The audit write is fire-and-forget, so give it a moment.
    await expect
      .poll(
        async () => {
          const audit = await apiGet(
            regulator,
            "/api/admin/audit?type=transfers&limit=200",
          );
          return (audit.transfers as { permitId?: string }[]).some(
            (t) => t.permitId === permitId,
          );
        },
        {
          timeout: 20_000,
          message: "the permitted transfer never reached the audit trail",
        },
      )
      .toBe(true);

    await regulator.goto("/compliance");
    await expect(regulator.getByText("Decision due")).toBeVisible({
      timeout: 15_000,
    });
    await regulator
      .getByRole("row", { name: /PharmaCo Research AG/ })
      .first()
      .click();
    const panel = regulator.getByTestId("application-panel");
    await expect(panel).toBeVisible();
    await expect(
      panel.getByText("Criteria assessed, Art. 68(1)"),
    ).toBeVisible();
    await regulator.context().close();
  });
});

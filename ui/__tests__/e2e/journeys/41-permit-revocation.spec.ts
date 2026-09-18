/**
 * Issue #206 — revocation and the public register (J930–J933).
 *
 * Regulation (EU) 2025/327: a permit stays valid until the access body revokes
 * it (Art. 63(3)); the body publishes applications, decisions and measures
 * (Art. 57(1)(j)) for everyone, sign-in or not (Art. 58(1)(f)). This journey
 * issues a permit, transfers under it, revokes it, sees the same transfer
 * refused, and reads it all back on /permits without a session.
 *
 * The dataset id is unique per run for the same reason as in journey 40.
 *
 *   PLAYWRIGHT_BASE_URL=https://ehds.mabu.red \
 *   KEYCLOAK_PUBLIC_URL=https://<the deployment's Keycloak> \
 *     npx playwright test __tests__/e2e/journeys/41-permit-revocation.spec.ts
 */
import { test, expect, type Browser, type Page } from "@playwright/test";
import { loginAs, skipIfKeycloakDown } from "./helpers";

test.describe.configure({ mode: "serial" });

const DATASET = `dataset:journey41-${Date.now().toString(36)}`;
const TRANSFER = {
  participantId: "pharmaco-ctx",
  contractId: "demo-agreement:fhir-cohort-bundle",
  assetId: "fhir-cohort-bundle",
  counterPartyAddress: "https://alpha-klinik.de/dsp/2025-1",
  datasetId: DATASET,
};
const REASON =
  "Journey 41: output left the SPE with direct identifiers (Art. 61(2)).";

let applicationId = "";
let permitId = "";

async function signedInAs(browser: Browser, user: string): Promise<Page> {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await loginAs(page, user, user);
  return page;
}

test.describe("Issue #206 · revocation and the public register", () => {
  test.beforeEach(async () => {
    await skipIfKeycloakDown();
  });

  test("J930 a permit is issued and the transfer starts", async ({
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
          justification: "Journey 41: cohort analysis, aggregate output only.",
          periodMonths: 6,
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
        conditions: [
          "Access only in the secure processing environment (Art. 73)",
        ],
        datasetId: DATASET,
      },
    });
    expect(issued.status(), await issued.text()).toBe(200);
    permitId = (await issued.json()).permitId;
    await regulator.context().close();

    const again = await signedInAs(browser, "researcher");
    const transfer = await again.request.post("/api/transfers", {
      data: TRANSFER,
    });
    expect(transfer.status(), await transfer.text()).toBe(201);
    expect((await transfer.json()).permitId).toBe(permitId);
    await again.context().close();
  });

  test("J931 the access body revokes it and the next transfer is refused (Art. 63(3))", async ({
    browser,
  }) => {
    test.setTimeout(120_000);
    const regulator = await signedInAs(browser, "regulator");
    const revoked = await regulator.request.post(
      "/api/compliance/permits/revoke",
      {
        data: { permitId, reason: REASON },
      },
    );
    expect(revoked.status(), await revoked.text()).toBe(200);
    expect((await revoked.json()).article).toContain("Art. 63(3)");
    await regulator.context().close();

    const researcher = await signedInAs(browser, "researcher");
    const transfer = await researcher.request.post("/api/transfers", {
      data: TRANSFER,
    });
    expect(transfer.status(), await transfer.text()).toBe(403);
    const body = await transfer.json();
    expect(body.reason).toContain("revoked");
    expect(body.reason).toContain("Art. 63(3)");
    await researcher.context().close();
  });

  test("J932 the register lists it for everyone, without a session", async ({
    browser,
  }) => {
    const anyone = await browser.newContext();
    const page = await anyone.newPage();
    const r = await page.request.get("/api/permits");
    expect(r.status()).toBe(200);
    const entries = (await r.json()).entries as {
      applicationId: string;
      outcome: string;
      revocationReason: string | null;
      publishBy: string | null;
    }[];
    const mine = entries.find((e) => e.applicationId === applicationId);
    expect(mine?.outcome).toBe("permit revoked");
    expect(mine?.revocationReason).toBe(REASON);
    expect(mine?.publishBy).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    await anyone.close();
  });

  test("J933 the public page shows the measure", async ({ browser }) => {
    const anyone = await browser.newContext();
    const page = await anyone.newPage();
    await page.goto("/permits");
    await expect(page).not.toHaveURL(/signin/);
    await expect(page.getByText("Data permits register")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText(REASON).first()).toBeVisible({
      timeout: 15_000,
    });
    await anyone.close();
  });
});

/**
 * The bonus programs of another data space, in the patient portal (#934,
 * step 3). AlphaKasse DE publishes its "Active year bonus" in a DCAT-AP
 * catalogue; the catalogue crawler fetches it, the enricher writes it as
 * (:DataService:BonusProgramme), and /patient/programmes lists it with its
 * rule and what the insurer receives: a yes or no, never the data (ADR-080).
 *
 * Step 4 (J1094): the patient joins, asks the hub to send the year's answer,
 * withdraws, and the same request is then refused with 403.
 *
 * Both need the crawl to have run on the stack. Where it has not (the PR
 * E2E seeds Neo4j without the crawler), they skip and say so.
 *
 *   PLAYWRIGHT_BASE_URL=http://localhost:3003 \
 *     npx playwright test __tests__/e2e/journeys/54-bonus-programmes.spec.ts
 */
import { expect, test } from "@playwright/test";
import { loginAs, skipIfKeycloakDown } from "./helpers";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      sessionStorage.setItem("demo-password-banner-dismissed", "true");
    } catch {
      /* ignore */
    }
  });
});

test.describe("Bonus programs from another data space", () => {
  test.beforeEach(async ({ page }) => {
    await skipIfKeycloakDown();
    await loginAs(page, "patient1", "patient1");
  });

  test("J1092 the portal lists AlphaKasse's program, its rule and what leaves the record", async ({
    page,
  }) => {
    const api = await page.request.get("/api/patient/programmes");
    expect(api.status()).toBe(200);
    const { programmes } = (await api.json()) as {
      programmes: { title: string }[];
    };
    test.skip(
      programmes.length === 0,
      "SKIPPED: the catalogue crawler has not indexed a bonus program on this stack (#934)",
    );

    await page.goto("/patient/programmes?lang=en");
    await expect(
      page.getByRole("heading", { level: 1, name: "Bonus Programs" }),
    ).toBeVisible({ timeout: 15_000 });
    const card = page
      .getByTestId("bonus-programme-card")
      .filter({ hasText: "Active year bonus 2027" });
    await expect(card).toBeVisible({ timeout: 15_000 });
    await expect(card).toContainText("AlphaKasse DE");
    await expect(card).toContainText("Insurance and wellbeing data space");
    await expect(card).toContainText("The rule, version 2027.1");
    await expect(card).toContainText("What AlphaKasse DE receives");
    await expect(card).toContainText("The year, and goal met: yes or no.");
    await expect(card.getByTestId("bonus-programme-join-state")).toContainText(
      "enrolls you in no study",
    );
  });

  test("J1094 join, send, withdraw: after the withdrawal the send is refused with 403", async ({
    page,
  }) => {
    const api = await page.request.get("/api/patient/programmes");
    const { programmes } = (await api.json()) as {
      programmes: { programmeId: string; title: string }[];
    };
    const programme = programmes.find(
      (p) => p.title === "Active year bonus 2027",
    );
    test.skip(
      !programme,
      "SKIPPED: the catalogue crawler has not indexed a bonus program on this stack (#934)",
    );

    await page.goto("/patient/programmes?lang=en");
    const card = page
      .getByTestId("bonus-programme-card")
      .filter({ hasText: "Active year bonus 2027" });
    await expect(card).toBeVisible({ timeout: 15_000 });

    // A run before may have left a consent open; start from a closed one.
    if (await card.getByTestId("bonus-programme-joined").isVisible()) {
      await card.getByRole("button", { name: /Withdraw/ }).click();
      await expect(card.getByTestId("bonus-programme-withdrawn")).toBeVisible();
    }

    await card.getByRole("button", { name: "Join this program" }).click();
    await expect(card.getByTestId("bonus-programme-joined")).toContainText(
      "You joined on",
    );
    await card.getByRole("button", { name: "Send my answer for 2027" }).click();
    await expect(card.getByRole("status")).toContainText("Recorded for 2027");

    await card.getByRole("button", { name: /Withdraw/ }).click();
    await expect(card.getByTestId("bonus-programme-withdrawn")).toContainText(
      "Nothing is sent any more",
    );

    // The step 4 check: the same instruction, after the withdrawal.
    const refused = await page.request.post(
      "/api/patient/programmes/transfer",
      { data: { programmeId: programme!.programmeId, year: 2027 } },
    );
    expect(refused.status()).toBe(403);
    expect((await refused.json()).error).toContain("No open consent");
  });
});

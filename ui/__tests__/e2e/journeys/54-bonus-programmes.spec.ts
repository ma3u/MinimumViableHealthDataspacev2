/**
 * The bonus programs of another data space, in the patient portal (#934,
 * step 3). AlphaKasse DE publishes its "Active year bonus" in a DCAT-AP
 * catalogue; the catalogue crawler fetches it, the enricher writes it as
 * (:DataService:BonusProgramme), and /patient/programmes lists it with its
 * rule and what the insurer receives: a yes or no, never the data (ADR-080).
 *
 * J1092 needs the crawl to have run on the stack. Where it has not (the PR
 * E2E seeds Neo4j without the crawler), it skips and says so.
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
      "You cannot join yet",
    );
  });
});

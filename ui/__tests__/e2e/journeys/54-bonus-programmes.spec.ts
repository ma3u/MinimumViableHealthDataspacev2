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
 * Step 6 (J1099, ADR-087): the hub works out the ended year inside the
 * record. patient1's seeded 2025 (52 weeks of exercise, about 181 minutes a
 * week, and a check-up) meets the rule; the transfer carries the year and
 * goal met and nothing else.
 *
 * Both need the crawl to have run on the stack. Where it has not (the PR
 * E2E seeds Neo4j without the crawler), they skip and say so.
 *
 *   PLAYWRIGHT_BASE_URL=http://localhost:3003 \
 *     npx playwright test __tests__/e2e/journeys/54-bonus-programmes.spec.ts
 */
import { expect, test } from "@playwright/test";
import { loginAs, skipIfKeycloakDown } from "./helpers";

// J1094 and J1099 both join, send and withdraw on patient1's one consent to
// the program. Run side by side (fullyParallel, any run with more than one
// worker), one withdraws while the other sends, and the send is refused.
test.describe.configure({ mode: "serial" });

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
      .filter({ hasText: "Active year bonus 2025" });
    await expect(card).toBeVisible({ timeout: 15_000 });
    await expect(card).toContainText("AlphaKasse DE");
    await expect(card).toContainText("Insurance and wellbeing data space");
    await expect(card).toContainText("The rule, version 2025.1");
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
      (p) => p.title === "Active year bonus 2025",
    );
    test.skip(
      !programme,
      "SKIPPED: the catalogue crawler has not indexed a bonus program on this stack (#934)",
    );

    await page.goto("/patient/programmes?lang=en");
    const card = page
      .getByTestId("bonus-programme-card")
      .filter({ hasText: "Active year bonus 2025" });
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
    // Step 8: the reference the insurer's answer is tied to (ADR-091).
    await expect(card.getByTestId("bonus-programme-reference")).toContainText(
      /Your reference for .+: [0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}\./,
    );
    // Step 6: the result shows before anything is sent (ADR-087).
    await expect(card.getByTestId("bonus-programme-goal")).toBeVisible({
      timeout: 15_000,
    });
    await card.getByRole("button", { name: "Send my answer for 2025" }).click();
    await expect(card.getByRole("status")).toContainText(
      /Recorded for 2025: goal met, (yes|no)\./,
    );

    await card.getByRole("button", { name: /Withdraw/ }).click();
    await expect(card.getByTestId("bonus-programme-withdrawn")).toContainText(
      "Nothing is sent any more",
    );

    // The step 4 check: the same instruction, after the withdrawal.
    const refused = await page.request.post(
      "/api/patient/programmes/transfer",
      { data: { programmeId: programme!.programmeId, year: 2025 } },
    );
    expect(refused.status()).toBe(403);
    expect((await refused.json()).error).toContain("No open consent");
  });

  test("J1099 the member sees goal met for 2025 before sending, and the transfer carries only the year and goal met", async ({
    page,
  }) => {
    const api = await page.request.get("/api/patient/programmes");
    const { programmes } = (await api.json()) as {
      programmes: { programmeId: string; title: string }[];
    };
    const programme = programmes.find(
      (p) => p.title === "Active year bonus 2025",
    );
    test.skip(
      !programme,
      "SKIPPED: the catalogue crawler has not indexed a bonus program on this stack (#934)",
    );

    // The result for patient1's seeded 2025, worked out inside the record.
    const evaluated = await page.request.get(
      `/api/patient/programmes/evaluation?programmeId=${encodeURIComponent(
        programme!.programmeId,
      )}`,
    );
    expect(evaluated.status()).toBe(200);
    const { evaluation } = await evaluated.json();
    expect(evaluation).toMatchObject({
      year: 2025,
      status: "evaluated",
      goalMet: true,
      checkUp: { count: 1, met: true },
    });
    expect(evaluation.activity.minutesPerWeek).toBeGreaterThanOrEqual(150);

    // A year the rule does not cover is refused, and nothing is recorded.
    const wrongYear = await page.request.post(
      "/api/patient/programmes/transfer",
      { data: { programmeId: programme!.programmeId, year: 2024 } },
    );
    expect([400, 403]).toContain(wrongYear.status());

    await page.goto("/patient/programmes?lang=en");
    const card = page
      .getByTestId("bonus-programme-card")
      .filter({ hasText: "Active year bonus 2025" });
    await expect(card).toBeVisible({ timeout: 15_000 });
    if (!(await card.getByTestId("bonus-programme-joined").isVisible())) {
      await card.getByRole("button", { name: "Join this program" }).click();
    }
    const result = card.getByTestId("bonus-programme-result");
    await expect(result).toContainText("Your result for 2025", {
      timeout: 15_000,
    });
    await expect(card.getByTestId("bonus-programme-goal")).toHaveText(
      "Goal met: yes",
    );
    await expect(result).toContainText("This breakdown stays in your record");

    const sent = await page.request.post("/api/patient/programmes/transfer", {
      data: { programmeId: programme!.programmeId, year: 2025 },
    });
    expect(sent.status()).toBe(202);
    const { transfer } = await sent.json();
    expect(transfer).toMatchObject({
      year: 2025,
      goalMet: true,
      status: "evaluated",
    });
    // ADR-080, decision 2: no minutes, weeks or check-ups leave with it.
    expect(Object.keys(transfer).sort()).toEqual([
      "goalMet",
      "programmeId",
      "requestedAt",
      "status",
      "transferId",
      "year",
    ]);

    await card.getByRole("button", { name: /Withdraw/ }).click();
    await expect(card.getByTestId("bonus-programme-withdrawn")).toBeVisible();
  });
});

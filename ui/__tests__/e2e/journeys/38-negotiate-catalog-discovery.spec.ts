/**
 * J900-J902: the negotiation flow returns offers and leads on to the transfer.
 *
 * This guards a regression that reached the live demo: the participant dropdown
 * is served from public/mock/participants.json whenever the connector reports no
 * ACTIVATED contexts, so "Discover Offers" was sending a demo context id to the
 * live connector, getting a correct 404, and printing the raw EDC error where
 * the offer list should be.
 *
 * The assertion is on the contract the demo depends on, not on which path served
 * it: offers appear and no connector error is shown. It therefore keeps passing
 * once the Azure EDC stack is seeded (issue #25) and the catalogue becomes live.
 *
 * J902 carries that through to the end of the walkthrough. Each fix so far moved
 * the dead end one click further along: the catalogue, then the negotiation, then
 * the agreement that the transfer page reads. This asserts the whole path, so the
 * next such break shows up here rather than in front of an audience.
 */
import { test, expect } from "@playwright/test";
import { loginAs, skipIfKeycloakDown, T } from "./helpers";

test.describe("Contract negotiation, catalog discovery", () => {
  test("J900 Discover Offers returns offers, never a raw connector error", async ({
    page,
  }) => {
    await skipIfKeycloakDown();
    await loginAs(page, "researcher", "researcher");

    await page.goto("/negotiate");
    await expect(
      page.getByRole("heading", { name: /Contract Negotiation/i }),
    ).toBeVisible({ timeout: T });

    const selects = page.locator("select");

    async function pick(index: number, needle: string) {
      const select = selects.nth(index);
      const value = await select
        .locator("option", { hasText: needle })
        .first()
        .getAttribute("value");
      expect(value, `no option matching ${needle}`).toBeTruthy();
      await select.selectOption(value!);
    }

    // PharmaCo consumes, AlphaKlinik provides. The other way round returns
    // nothing even when everything works, because a data user holds no datasets.
    await pick(0, "PharmaCo Research AG");
    await pick(1, "AlphaKlinik Berlin");

    const [response] = await Promise.all([
      page.waitForResponse((r) => r.url().includes("catalog=true"), {
        timeout: T,
      }),
      page.getByRole("button", { name: /Discover Offers/i }).click(),
    ]);

    expect(response.status()).toBe(200);
    await expect(page.getByText(/offer\(s\) found/i)).toBeVisible({
      timeout: T,
    });
    await expect(page.getByText(/EDC API error/i)).toHaveCount(0);
  });

  test("J901 a demo catalogue says so, a live one does not", async ({
    page,
  }) => {
    await skipIfKeycloakDown();
    await loginAs(page, "researcher", "researcher");
    await page.goto("/negotiate");

    const selects = page.locator("select");
    for (const [index, needle] of [
      [0, "PharmaCo Research AG"],
      [1, "AlphaKlinik Berlin"],
    ] as const) {
      const select = selects.nth(index);
      const value = await select
        .locator("option", { hasText: needle })
        .first()
        .getAttribute("value");
      await select.selectOption(value!);
    }

    const [response] = await Promise.all([
      page.waitForResponse((r) => r.url().includes("catalog=true"), {
        timeout: T,
      }),
      page.getByRole("button", { name: /Discover Offers/i }).click(),
    ]);
    const body = await response.json();

    // Whichever path served it, the page must not misrepresent which one it was.
    const note = page.getByText(/demonstrator's own catalogue/i);
    await expect(note).toHaveCount(body.demo === true ? 1 : 0);
  });

  test("J902 a negotiation leads on to the transfer step", async ({ page }) => {
    await skipIfKeycloakDown();
    await loginAs(page, "researcher", "researcher");
    await page.goto("/negotiate");

    const selects = page.locator("select");
    for (const [index, needle] of [
      [0, "PharmaCo Research AG"],
      [1, "AlphaKlinik Berlin"],
    ] as const) {
      const select = selects.nth(index);
      const value = await select
        .locator("option", { hasText: needle })
        .first()
        .getAttribute("value");
      await select.selectOption(value!);
    }

    await Promise.all([
      page.waitForResponse((r) => r.url().includes("catalog=true"), {
        timeout: T,
      }),
      page.getByRole("button", { name: /Discover Offers/i }).click(),
    ]);

    // Pick the first offer, which enables Step 2. The offers are the buttons of
    // the container holding the "N offer(s) found" line, so this does not depend
    // on which datasets the catalogue happens to carry.
    const offerList = page
      .locator("div")
      .filter({ hasText: /offer\(s\) found/ })
      .last();
    await offerList.getByRole("button").first().click();
    const negotiate = page.getByRole("button", { name: /Start Negotiation/i });
    await expect(negotiate).toBeEnabled({ timeout: T });

    const [response] = await Promise.all([
      page.waitForResponse(
        (r) =>
          r.url().endsWith("/api/negotiations") &&
          r.request().method() === "POST",
        { timeout: T },
      ),
      negotiate.click(),
    ]);

    // Whether the connector took the negotiation or the demonstrator recorded it,
    // the step must not end here: the walkthrough's next stop is the transfer
    // page, which only lists agreements from finalized negotiations. A demo
    // negotiation left at REQUESTED was a dead end one click later.
    expect(response.status()).toBe(201);
    const body = await response.json();
    expect(body["@id"]).toBeTruthy();

    if (body.demo === true) {
      await expect(page.getByText(/Demo negotiation recorded/i)).toBeVisible({
        timeout: T,
      });
      // Finalized here rather than by a counter-party, so the row has to say so.
      await expect(page.getByText("Demo").first()).toBeVisible({ timeout: T });
      expect(body.contractAgreementId).toContain("demo-agreement:");
    }

    const transferLink = page
      .locator(`a[href*="contractId="]`, { hasText: /Transfer/i })
      .first();
    await expect(transferLink).toBeVisible({ timeout: T });

    await transferLink.click();
    await expect(
      page.getByRole("heading", { name: /Data Transfer/i }).first(),
    ).toBeVisible({ timeout: T });

    // The agreement the negotiation produced is selectable here, not absent.
    await expect(
      page.locator('input[type="checkbox"]:checked').first(),
    ).toBeVisible({ timeout: T });
    await expect(page.getByText(/EDC API error/i)).toHaveCount(0);
  });
});

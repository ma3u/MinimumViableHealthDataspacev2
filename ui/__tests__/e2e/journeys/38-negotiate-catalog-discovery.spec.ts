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
import { test, expect, type Page } from "@playwright/test";
import { loginAs, skipIfKeycloakDown, T } from "./helpers";

/**
 * PharmaCo consumes, AlphaKlinik provides. The other way round returns
 * nothing even when everything works, because a data user holds no datasets.
 *
 * The selects are found by their labels. The first <select> on the page is
 * the language picker in the navigation (#782), so picking by position chose
 * a language and waited for an option that list never has.
 */
async function pickParties(page: Page) {
  for (const [name, needle] of [
    [/Requesting as/i, "PharmaCo Research AG"],
    [/^Data Provider$/i, "AlphaKlinik Berlin"],
  ] as const) {
    const select = page.getByRole("combobox", { name });
    const value = await select
      .locator("option", { hasText: needle })
      .first()
      .getAttribute("value");
    expect(value, `no option matching ${needle}`).toBeTruthy();
    await select.selectOption(value!);
  }
}

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

    await pickParties(page);

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

    await pickParties(page);

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
    // A connector's negotiation takes seconds to be agreed; room for that.
    test.setTimeout(90_000);
    await skipIfKeycloakDown();
    await loginAs(page, "researcher", "researcher");
    await page.goto("/negotiate");

    await pickParties(page);

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

    // The offer's terms gate the negotiation (#876, ADR-077): Start Negotiation
    // stays disabled until the user agrees to them.
    const agree = page.getByRole("checkbox", {
      name: /I have read these terms and agree/i,
    });
    await expect(agree).toBeVisible({ timeout: T });
    await expect(negotiate).toBeDisabled();
    await agree.check();
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

    // The link to this negotiation's agreement, not the first of the history:
    // on a stack with a connector the history holds earlier agreements too.
    // A connector's negotiation is followed until it is agreed and then offers
    // "Continue to transfer" (#879); a demo one is agreed at once and its row
    // links its demo agreement.
    const transferLink =
      body.demo === true
        ? page
            .locator(
              `a[href*="contractId=${encodeURIComponent(
                body.contractAgreementId,
              )}"]`,
            )
            .first()
        : page
            .getByTestId("negotiation-progress")
            .getByRole("link", { name: /Continue to transfer/i });
    await expect(transferLink).toBeVisible({ timeout: 60_000 });
    const contractId = new URL(
      (await transferLink.getAttribute("href")) ?? "",
      page.url(),
    ).searchParams.get("contractId");
    expect(contractId).toBeTruthy();

    await transferLink.click();
    await expect(
      page.getByRole("heading", { name: /Data Transfer/i }).first(),
    ).toBeVisible({ timeout: T });

    // The agreement the negotiation produced is listed here and can be
    // transferred, not absent. The page lists agreements with their next
    // action since #876, where it had a checkbox per agreement before; the
    // linked one is the row the page scrolls to.
    const linked = page.locator(`[id="contract-${contractId}"]`);
    await expect(linked).toBeVisible({ timeout: T });
    await expect(linked.getByTestId("start-transfer")).toBeVisible({
      timeout: T,
    });
    await expect(page.getByText(/EDC API error/i)).toHaveCount(0);
  });
});

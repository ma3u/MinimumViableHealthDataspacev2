/**
 * The start page's two journeys (J1100–J1103): the person's and the
 * researcher's swimlanes from the HL7 showcase deck, drawn on scroll, with
 * every box opening its step. Runs against the dev server, a production build
 * and the static export alike; nothing is stubbed.
 */
import { test, expect } from "@playwright/test";

const IS_STATIC = process.env.NEXT_PUBLIC_STATIC_EXPORT === "true";
const BP = IS_STATIC ? "/MinimumViableHealthDataspacev2" : "";

test.describe("Start page journeys", () => {
  test("J1100 the person's journey draws itself once it is on screen", async ({
    page,
  }) => {
    await page.goto(`${BP}/`);
    const section = page.getByTestId("journey-flows");
    await section.scrollIntoViewIfNeeded();
    const svg = page.getByTestId("journey-flow-primary");
    await expect(svg).toHaveClass(/is-playing/);
    const steps = svg.getByTestId("journey-flow-step");
    await expect(steps).toHaveCount(10);
    // The last box is in after its delay and the pop-in.
    await expect(steps.last()).toHaveCSS("opacity", "1", { timeout: 10_000 });
    // No horizontal page scroll at any width the drawing is shown.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test("J1101 the tabs switch to the researcher's journey", async ({
    page,
  }) => {
    await page.goto(`${BP}/`);
    const section = page.getByTestId("journey-flows");
    await section.scrollIntoViewIfNeeded();
    await section
      .getByRole("tab", { name: "Secondary use: the researcher" })
      .click();
    const svg = page.getByTestId("journey-flow-secondary");
    await expect(svg.getByTestId("journey-flow-step")).toHaveCount(12);
    await expect(
      svg.getByRole("link", { name: /4b · Approve data permit/ }),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("J1102 a box opens its step on this site", async ({ page }) => {
    await page.goto(`${BP}/`);
    const section = page.getByTestId("journey-flows");
    await section.scrollIntoViewIfNeeded();
    await section
      .getByRole("tab", { name: "Secondary use: the researcher" })
      .click();
    const discover = page
      .getByTestId("journey-flow-secondary")
      .getByRole("link", { name: /3 · Discover data/ });
    await expect(discover).toHaveCSS("opacity", "1", { timeout: 10_000 });
    await discover.click();
    // The hub sends a signed-out visitor to sign in first; the static
    // export opens the page itself.
    await expect(page).toHaveURL(
      /\/data\/discover|callbackUrl=%2Fdata%2Fdiscover/,
    );
  });

  test("J1103 the switch sends the boxes to the other demo in a new tab", async ({
    page,
  }) => {
    await page.goto(`${BP}/`);
    const section = page.getByTestId("journey-flows");
    await section.scrollIntoViewIfNeeded();
    const other = IS_STATIC ? "live" : "static";
    const base = IS_STATIC
      ? "https://ehds.mabu.red"
      : "https://ma3u.github.io/MinimumViableHealthDataspacev2";
    await page.getByTestId(`journey-site-${other}`).click();
    const insights = page
      .getByTestId("journey-flow-primary")
      .getByRole("link", { name: /10 · What came back/ });
    await expect(insights).toHaveAttribute("href", `${base}/patient/insights`);
    await expect(insights).toHaveAttribute("target", "_blank");
  });
});

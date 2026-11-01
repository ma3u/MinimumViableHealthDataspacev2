/**
 * The hub fits a phone (J1016). On 2026-11-01 the language picker in the
 * menu bar showed the full language name ("Français") and made the bar, and
 * so the page, wider than an iPhone: the start page scrolled sideways.
 *
 *   PLAYWRIGHT_BASE_URL=http://localhost:3003 \
 *     npx playwright test __tests__/e2e/journeys/50-phone-width.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";
import { loginAs, skipIfKeycloakDown } from "./helpers";

const PAGES = ["/", "/catalog", "/jurisdictions"];
const LANGS = ["en", "de", "fr", "nl", "es"];

async function overflow(page: Page) {
  return page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
}

for (const width of [375, 390]) {
  test(`J1016 no page scrolls sideways at ${width} px, in any language`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    await skipIfKeycloakDown();
    await loginAs(page, "edcadmin", "edcadmin");
    for (const lang of LANGS) {
      for (const path of PAGES) {
        await page.goto(`${path}?lang=${lang}`);
        await page.waitForLoadState("networkidle");
        expect(await overflow(page), `${path} in ${lang}`).toBeLessThanOrEqual(
          0,
        );
      }
    }
    // The picker is in the menu panel on a phone.
    await page.goto("/");
    await page.getByRole("button", { name: "Open menu" }).click();
    await expect(
      page.locator("#mobile-nav").getByRole("combobox"),
    ).toBeVisible();
  });
}

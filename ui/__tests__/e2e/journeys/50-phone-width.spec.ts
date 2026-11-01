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
    await page.locator(`[aria-controls="mobile-nav"]`).click();
    await expect(
      page.locator("#mobile-nav").getByRole("combobox"),
    ).toBeVisible();
  });
}

test("J1019 the menu panel scrolls to its last entry on a phone", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await skipIfKeycloakDown();
  // edcadmin sees every menu group, the longest panel there is.
  await loginAs(page, "edcadmin", "edcadmin");
  await page.goto("/");
  await page.locator(`[aria-controls="mobile-nav"]`).click();
  const panel = page.locator("#mobile-nav");
  await expect(panel).toBeVisible();
  // After the panel's fade-in, which moves it while it runs.
  await page.waitForTimeout(800);
  const box = await panel.boundingBox();
  // The panel ends inside the screen and scrolls itself.
  expect(box!.y + box!.height).toBeLessThanOrEqual(844 + 1);
  const last = panel.getByRole("link").last();
  await last.scrollIntoViewIfNeeded();
  await expect(last).toBeInViewport();
});

// On 2026-11-01 the French menu bar wrapped: the role chip carried the
// Regulation's full term for an access body, and below about 1220 px the
// groups, the picker and the user menu overflowed in every language.
for (const width of [1024, 1280]) {
  test(`J1020 the menu bar is one line at ${width} px, in any language`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 800 });
    await skipIfKeycloakDown();
    await loginAs(page, "edcadmin", "edcadmin");
    for (const lang of LANGS) {
      await page.goto(`/compliance?lang=${lang}`);
      await page.waitForLoadState("networkidle");
      const bar = page.getByRole("navigation", { name: "Main navigation" });
      const box = await bar.boundingBox();
      expect(box!.height, `bar height in ${lang}`).toBeLessThanOrEqual(64);
      expect(await overflow(page), `page width in ${lang}`).toBeLessThanOrEqual(
        0,
      );
      // The chip has room for the short form; the full term is its title.
      if (width >= 1280 && lang === "fr") {
        await expect(
          page.locator(`[title="Administrateur de l’espace de données"]`),
        ).toHaveText("Admin");
      }
    }
  });
}

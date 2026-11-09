/**
 * Site search (J1092–J1098, ADR-082, #1000).
 *
 * The search over the pages and the documentation, from the menu bar: the
 * index public/pagefind/<lang>/ that `npm run build` writes, searched in the
 * browser. Runs against the dev server, a production build and the static
 * export alike; nothing is stubbed.
 */
import { test, expect, type Page } from "@playwright/test";

const IS_STATIC = process.env.NEXT_PUBLIC_STATIC_EXPORT === "true";
const BP = IS_STATIC ? "/MinimumViableHealthDataspacev2" : "";

async function search(page: Page, query: string) {
  await page.keyboard.press("Control+k");
  const dialog = page.getByTestId("site-search");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("combobox").fill(query);
  return dialog;
}

test.describe("Site search", () => {
  test("J1092 Ctrl+K lists the glossary term and opens it at its anchor", async ({
    page,
  }) => {
    await page.goto(`${BP}/docs`);
    const dialog = await search(page, "opt-out");
    const glossary = dialog.getByRole("option", { name: /EHDS glossary/ });
    await expect(glossary).toBeVisible({ timeout: 15_000 });
    await expect(glossary.locator("mark").first()).toBeVisible();
    await dialog.getByRole("option", { name: /right to opt out/ }).click();
    await expect(page).toHaveURL(/\/docs\/ehds\/glossary#opt-out$/);
  });

  test("J1093 the button opens it and Escape closes it", async ({ page }) => {
    await page.goto(`${BP}/docs`);
    const button = page.getByTestId("site-search-button");
    await button.click();
    await expect(page.getByTestId("site-search")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("site-search")).toBeHidden();
    await expect(button).toBeFocused();
  });

  test("J1094 a reader in German searches the German index", async ({
    page,
  }) => {
    await page.goto(`${BP}/docs?lang=de`);
    const dialog = await search(page, "Widerspruch");
    await expect(dialog.getByRole("option").first()).toBeVisible({
      timeout: 15_000,
    });
    await expect(dialog).toContainText("Recht zum Widerspruch");
  });

  test("J1095 says so when nothing matches", async ({ page }) => {
    await page.goto(`${BP}/docs`);
    const dialog = await search(page, "qqqxyzzy");
    await expect(dialog).toContainText("No results for “qqqxyzzy”", {
      timeout: 15_000,
    });
  });

  test("J1096 the last searches come back, newest first, and can be cleared", async ({
    page,
  }) => {
    await page.goto(`${BP}/docs`);
    for (const q of ["permit", "opt-out"]) {
      const dialog = await search(page, q);
      await expect(dialog.getByRole("option").first()).toBeVisible({
        timeout: 15_000,
      });
      await page.keyboard.press("Escape");
    }
    await page.getByTestId("site-search-button").click();
    const dialog = page.getByTestId("site-search");
    await expect(dialog).toContainText("Recent searches");
    await expect(dialog.getByRole("option")).toHaveText(["opt-out", "permit"]);
    await dialog.getByRole("option", { name: "permit" }).click();
    await expect(dialog.getByRole("combobox")).toHaveValue("permit");
    await dialog.getByRole("combobox").fill("");
    await dialog.getByRole("button", { name: "Clear" }).click();
    await expect(dialog).not.toContainText("Recent searches");
  });

  test("J1097 the search opens at the magnifier, and spans a phone's screen", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1400, height: 900 });
    await page.goto(`${BP}/docs`);
    const button = page.getByTestId("site-search-button");
    await button.click();
    const b = (await button.boundingBox())!;
    const d = (await page.getByTestId("site-search").boundingBox())!;
    expect(Math.abs(d.x + d.width - (b.x + b.width))).toBeLessThan(2);
    expect(d.y).toBeGreaterThanOrEqual(b.y + b.height);
    // Just under the menu bar, which is a little taller than the button.
    expect(d.y - (b.y + b.height)).toBeLessThan(32);

    // Between a phone and the desktop menu the icon sits further left; the
    // panel stays whole on screen (858 px cut it off on the left once).
    for (const width of [858, 1024, 375]) {
      await page.keyboard.press("Escape");
      await page.setViewportSize({ width, height: 812 });
      await button.click();
      const m = (await page.getByTestId("site-search").boundingBox())!;
      expect(m.x, `left edge at ${width} px`).toBeGreaterThanOrEqual(0);
      expect(m.x + m.width, `right edge at ${width} px`).toBeLessThanOrEqual(
        width,
      );
      if (width === 375) expect(m.width).toBeGreaterThan(340);
    }
  });

  test("J1098 an acronym finds its own document before longer words", async ({
    page,
  }) => {
    await page.goto(`${BP}/docs`);
    const dialog = await search(page, "SPE");
    await expect(dialog.getByRole("option").first()).toContainText(
      "secure processing environment",
      { timeout: 15_000 },
    );
  });
});

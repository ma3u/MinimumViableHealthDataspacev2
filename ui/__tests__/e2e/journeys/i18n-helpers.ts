/**
 * Shared by the translation journeys (#782, ADR-070): open a page in each
 * language with ?lang= and check its heading and one label. Each track of
 * pages has its own spec file, so tracks translated in parallel do not all
 * edit one spec.
 */
import { expect, type Page } from "@playwright/test";

/** [language, the page's h1, one more visible text] */
export type LanguageCase = [string, string | RegExp, string | RegExp];

export async function checkLanguages(
  page: Page,
  path: string,
  cases: LanguageCase[],
) {
  for (const [lang, title, label] of cases) {
    await page.goto(`${path}${path.includes("?") ? "&" : "?"}lang=${lang}`);
    await expect(
      page.getByRole("heading", { level: 1, name: title }),
      `${path} h1 in ${lang}`,
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      page.getByText(label).first(),
      `${path} label in ${lang}`,
    ).toBeVisible({ timeout: 15_000 });
  }
}

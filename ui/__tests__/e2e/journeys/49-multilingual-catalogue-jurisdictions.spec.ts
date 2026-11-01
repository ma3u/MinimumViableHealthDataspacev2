/**
 * Issue #782, phase 1: dataset descriptions in more than one language and
 * the national implementation profiles (J1006 to J1015).
 *
 * The catalogue shows a dataset's title and description in the language a
 * visitor picks in the menu bar and falls back to English, marked as such; the HealthDCAT-AP
 * description tags each value with its language. /jurisdictions shows how DE,
 * AT, BE, FR, NL and ES implement secondary use, and which of the hub's
 * fictional access bodies acts under which.
 *
 *   PLAYWRIGHT_BASE_URL=http://localhost:3003 \
 *     npx playwright test __tests__/e2e/journeys/49-multilingual-catalogue-jurisdictions.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";
import { apiGet, loginAs, skipIfKeycloakDown } from "./helpers";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      sessionStorage.setItem("demo-password-banner-dismissed", "true");
    } catch {
      /* ignore */
    }
  });
});

test.describe("Issue #782 · multilingual catalogue, national profiles", () => {
  test("J1006 the language picker in the menu switches the catalogue to German and back", async ({
    page,
  }) => {
    await skipIfKeycloakDown();
    await loginAs(page, "researcher", "researcher");
    await page.goto("/catalog");
    await expect(page.locator("h3 [lang]").first()).toBeVisible({
      timeout: 20_000,
    });

    await languagePicker(page).selectOption("de");
    // At least one card title is now in German, and says so to a reader.
    await expect(page.locator('h3 [lang="de"]').first()).toBeVisible();

    // The choice is kept for the next visit.
    await page.reload();
    await expect(languagePicker(page)).toHaveValue("de", { timeout: 20_000 });

    await languagePicker(page).selectOption("en");
    await expect(page.locator('h3 [lang="de"]')).toHaveCount(0);
  });

  test("J1007 /api/catalog hands over the German titles", async ({ page }) => {
    await skipIfKeycloakDown();
    await loginAs(page, "researcher", "researcher");
    // apiGet throws on any status but 2xx.
    const rows = (await apiGet(page, "/api/catalog")) as {
      id: string;
      title: string;
      translations?: { de?: { title?: string } };
    }[];
    const german = rows.filter((r) => r.translations?.de?.title);
    expect(german.length).toBeGreaterThan(0);
    for (const r of rows) expect(typeof r.title).toBe("string");
  });

  test("J1008 the HealthDCAT-AP description tags its title with English and German", async ({
    page,
  }) => {
    await skipIfKeycloakDown();
    await loginAs(page, "researcher", "researcher");
    const doc = (await apiGet(
      page,
      "/api/catalog/jsonld?id=dataset:omop-cdm-v54-analytics",
    )) as Record<string, unknown>;
    const title = doc["dct:title"];
    const values = (Array.isArray(title) ? title : [title]) as {
      "@language"?: string;
    }[];
    expect(values.map((v) => v["@language"])).toEqual(
      expect.arrayContaining(["en", "de"]),
    );
  });

  test("J1009 /jurisdictions needs a session and then shows six member states", async ({
    page,
  }) => {
    await page.goto("/jurisdictions");
    await expect(page).toHaveURL(/signin/);
    await skipIfKeycloakDown();
    await loginAs(page, "regulator", "regulator");
    await page.goto("/jurisdictions");
    await expect(
      page.getByRole("heading", {
        name: "National implementation of the EHDS",
      }),
    ).toBeVisible({ timeout: 15_000 });
    for (const code of ["DE", "AT", "BE", "FR", "NL", "ES"]) {
      await expect(page.getByTestId(`jurisdiction-${code}`)).toBeVisible();
    }
    await expect(page.getByTestId("jurisdiction-DE")).toContainText(
      "MedReg DE",
    );
    await expect(page.getByTestId("jurisdiction-ES")).toContainText(
      "MedReg ES",
    );
    await expect(page.getByTestId("jurisdiction-FR")).toContainText(
      "Institut de Recherche Santé",
    );
  });

  test("J1010 the information page links each access body to its national rules", async ({
    page,
  }) => {
    await skipIfKeycloakDown();
    await loginAs(page, "regulator", "regulator");
    await page.goto("/information");
    const link = page
      .getByTestId("info-e")
      .getByRole("link", { name: "national rules" })
      .first();
    await expect(link).toBeVisible({ timeout: 15_000 });
    await link.click();
    await expect(page).toHaveURL(/\/jurisdictions#[a-z]{2}$/);
  });

  test("J1011 the catalogue journey in every language it offers", async ({
    page,
  }, testInfo) => {
    await skipIfKeycloakDown();
    await loginAs(page, "researcher", "researcher");
    await page.goto("/catalog");
    const picker = languagePicker(page);
    await expect(page.locator("h3 [lang]").first()).toBeVisible({
      timeout: 20_000,
    });
    const names = (await picker.locator("option").allTextContents()).map((n) =>
      n.trim(),
    );
    // English plus at least German; French and Dutch where datasets have them.
    expect(names[0]).toBe("English");
    expect(names).toContain("Deutsch");

    const CODES: Record<string, string> = {
      English: "en",
      Deutsch: "de",
      Français: "fr",
      Nederlands: "nl",
      Español: "es",
    };
    for (const name of names) {
      const lang = CODES[name];
      await picker.selectOption(lang);
      await expect(picker).toHaveValue(lang);
      const titles = page.locator("h3 [lang]");
      await expect(titles.first()).toBeVisible();
      const langs = await titles.evaluateAll((els) =>
        els.map((e) => e.getAttribute("lang")),
      );
      // Every title is in the chosen language or, marked, in English.
      expect(
        langs.every((l) => l === lang || l === "en"),
        name,
      ).toBe(true);
      if (lang === "en") {
        await expect(page.getByTestId("english-fallback")).toHaveCount(0);
      } else {
        expect(langs, `${name}: a title in ${lang}`).toContain(lang);
        const fallbacks = langs.filter((l) => l === "en").length;
        await expect(page.getByTestId("english-fallback")).toHaveCount(
          await countMarks(page, name, fallbacks),
        );
      }
      // The detail of the first dataset carries the same language.
      await page.getByTestId("dataset-details").first().click();
      await expect(page.locator(".fixed [lang]").first()).toHaveAttribute(
        "lang",
        new RegExp(`^(${lang}|en)$`),
      );
      await page.keyboard.press("Escape");
      await page.mouse.click(5, 5);
      await page.screenshot({
        path: testInfo.outputPath(`catalog-${lang}.png`),
        fullPage: false,
      });
    }
  });

  test("J1012 the national profiles of every country, from the catalogue", async ({
    page,
  }) => {
    await skipIfKeycloakDown();
    await loginAs(page, "researcher", "researcher");
    await page.goto("/catalog");
    await page.getByRole("link", { name: /National EHDS rules/ }).click();
    await expect(page).toHaveURL(/\/jurisdictions$/);
    for (const code of ["DE", "AT", "BE", "FR", "NL", "ES"]) {
      await page
        .getByRole("navigation", { name: "Countries" })
        .getByRole("link", { name: new RegExp(`^${code} ·`) })
        .click();
      await expect(page).toHaveURL(new RegExp(`#${code.toLowerCase()}$`));
      const profile = page.getByTestId(`jurisdiction-${code}`);
      await expect(profile).toBeInViewport();
      // The national law is linked to its official source.
      await expect(
        profile.getByRole("link").filter({ hasText: /\S/ }).first(),
      ).toHaveAttribute("href", /^https:\/\//);
    }
  });
});

test.describe("Issue #782 · the browser's language", () => {
  test.use({ locale: "de-DE" });

  test("J1013 a German browser sees German descriptions; ?lang=en and a stored choice win", async ({
    page,
  }) => {
    await skipIfKeycloakDown();
    await loginAs(page, "researcher", "researcher");

    await page.goto("/catalog");
    await expect(languagePicker(page)).toHaveValue("de", { timeout: 20_000 });
    await expect(page.locator('h3 [lang="de"]').first()).toBeVisible();

    // A shared English link stays English.
    await page.goto("/catalog?lang=en");
    await expect(languagePicker(page)).toHaveValue("en", { timeout: 20_000 });
    await expect(page.locator('h3 [lang="de"]')).toHaveCount(0);

    // So does a visitor who chose English once.
    await languagePicker(page).selectOption("en");
    await page.goto("/catalog");
    await expect(languagePicker(page)).toHaveValue("en", { timeout: 20_000 });
  });
});

test.describe("Issue #782 · the interface follows the picker", () => {
  test("J1014 menu, sign-in page and catalogue switch to German, French, Dutch and Spanish", async ({
    page,
  }) => {
    // Signed out: the sign-in page and the menu bar.
    await page.goto("/auth/signin");
    const picker = languagePicker(page);
    const cases: [string, string, string, string][] = [
      ["de", "Mit Keycloak anmelden", "Entdecken", "Sprache"],
      ["fr", "Se connecter avec Keycloak", "Explorer", "Langue"],
      ["nl", "Inloggen met Keycloak", "Verkennen", "Taal"],
      ["es", "Iniciar sesión con Keycloak", "Explorar", "Idioma"],
    ];
    for (const [lang, signIn, explore, language] of cases) {
      await picker.selectOption(lang);
      await expect(page.getByRole("button", { name: signIn })).toBeVisible();
      await expect(
        page.getByRole("navigation", { name: "Main navigation" }),
      ).toContainText(explore);
      await expect(page.getByRole("combobox", { name: language })).toHaveValue(
        lang,
      );
      await expect(page.locator("html")).toHaveAttribute("lang", lang);
    }
    await picker.selectOption("en");
    await expect(
      page.getByRole("button", { name: "Sign in with Keycloak" }),
    ).toBeVisible();

    // Signed in: the catalogue's own texts follow too.
    await skipIfKeycloakDown();
    await loginAs(page, "researcher", "researcher");
    await page.goto("/catalog");
    await languagePicker(page).selectOption("de");
    await expect(
      page.getByRole("heading", { name: "Datensatzkatalog" }),
    ).toBeVisible({ timeout: 20_000 });
    await expect(page.getByPlaceholder("Datensätze suchen…")).toBeVisible();
    await languagePicker(page).selectOption("en");
  });
});

test.describe("Issue #782 · the start page follows the picker", () => {
  test("J1015 the start page in German, French, Dutch and Spanish, and back", async ({
    page,
  }) => {
    await page.goto("/");
    const cases: [string, string, string][] = [
      ["de", "Europäischer Gesundheitsdatenraum", "Für Forschende"],
      ["fr", "Espace européen des données de santé", "Pour les chercheurs"],
      ["nl", "Europese ruimte voor gezondheidsgegevens", "Voor onderzoekers"],
      ["es", "Espacio Europeo de Datos de Salud", "Para investigadores"],
      ["en", "European Health Data Space", "For Researchers"],
    ];
    for (const [lang, title, card] of cases) {
      await languagePicker(page).selectOption(lang);
      await expect(
        page.getByRole("heading", { level: 1, name: title }),
      ).toBeVisible();
      await expect(page.getByRole("heading", { name: card })).toBeVisible();
      await expect(page.locator("html")).toHaveAttribute("lang", lang);
    }
  });
});

/** The language picker in the menu bar (components/LanguagePicker.tsx). */
function languagePicker(page: Page) {
  // By place, not by name: its label is "Sprache" once German is picked.
  return page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("combobox");
}

/** The marks shown for English fallbacks: one per title, plus one per
 * description that falls back too, so at least the titles' count. */
async function countMarks(page: Page, name: string, titles: number) {
  const marks = await page.getByTestId("english-fallback").count();
  expect(marks).toBeGreaterThanOrEqual(titles);
  return marks;
}

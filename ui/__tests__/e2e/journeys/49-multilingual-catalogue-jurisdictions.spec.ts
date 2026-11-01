/**
 * Issue #782, phase 1: dataset descriptions in more than one language and
 * the national implementation profiles (J1006 to J1010).
 *
 * The catalogue shows a dataset's title and description in the language a
 * visitor chooses and falls back to English, marked as such; the HealthDCAT-AP
 * description tags each value with its language. /jurisdictions shows how DE,
 * AT, BE, FR, NL and ES implement secondary use, and which of the hub's
 * fictional access bodies acts under which.
 *
 *   PLAYWRIGHT_BASE_URL=http://localhost:3003 \
 *     npx playwright test __tests__/e2e/journeys/49-multilingual-catalogue-jurisdictions.spec.ts
 */
import { test, expect } from "@playwright/test";
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
  test("J1006 the catalogue switches its descriptions to German and back", async ({
    page,
  }) => {
    await skipIfKeycloakDown();
    await loginAs(page, "researcher", "researcher");
    await page.goto("/catalog");
    const group = page.getByRole("group", {
      name: "Language of the dataset descriptions",
    });
    await expect(group).toBeVisible({ timeout: 20_000 });

    await group.getByRole("button", { name: "Deutsch" }).click();
    await expect(
      group.getByRole("button", { name: "Deutsch" }),
    ).toHaveAttribute("aria-pressed", "true");
    // At least one card title is now in German, and says so to a reader.
    await expect(page.locator('h3 [lang="de"]').first()).toBeVisible();

    // The choice is kept for the next visit.
    await page.reload();
    await expect(
      page
        .getByRole("group", { name: "Language of the dataset descriptions" })
        .getByRole("button", { name: "Deutsch" }),
    ).toHaveAttribute("aria-pressed", "true", { timeout: 20_000 });

    await page
      .getByRole("group", { name: "Language of the dataset descriptions" })
      .getByRole("button", { name: "English" })
      .click();
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
});

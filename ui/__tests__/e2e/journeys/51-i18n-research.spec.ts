/**
 * Issue #782, ADR-070: the health data user's pages follow the language
 * picker (J1030 to J1039). Each page is opened with ?lang= in German,
 * French, Dutch, Spanish and English, and its heading and one label are
 * checked. Data (dataset titles, codes, NLQ example questions) stays English.
 *
 *   PLAYWRIGHT_BASE_URL=http://localhost:3003 \
 *     npx playwright test __tests__/e2e/journeys/51-i18n-research.spec.ts
 */
import { test, expect } from "@playwright/test";
import { loginAs, skipIfKeycloakDown } from "./helpers";
import { checkLanguages } from "./i18n-helpers";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      sessionStorage.setItem("demo-password-banner-dismissed", "true");
    } catch {
      /* ignore */
    }
  });
});

test.describe("Issue #782 · the health data user's pages in five languages", () => {
  test.beforeEach(async ({ page }) => {
    await skipIfKeycloakDown();
    await loginAs(page, "researcher", "researcher");
  });

  test("J1030 discover data in every language", async ({ page }) => {
    await checkLanguages(page, "/data/discover", [
      ["de", "Daten entdecken", "EDC-Assets"],
      ["fr", "Découvrir des données", "Actifs EDC"],
      ["nl", "Gegevens ontdekken", "EDC-assets"],
      ["es", "Descubrir datos", "Activos EDC"],
      ["en", "Discover Data", "EDC Assets"],
    ]);
  });

  test("J1031 contract negotiation in every language", async ({ page }) => {
    await checkLanguages(page, "/negotiate", [
      ["de", "Vertragsverhandlung", "Schritt 1: Datenanbieter wählen"],
      [
        "fr",
        "Négociation de contrat",
        "Étape 1 : choisir le fournisseur de données",
      ],
      ["nl", "Contractonderhandeling", "Stap 1: gegevensaanbieder kiezen"],
      ["es", "Negociación de contrato", "Paso 1: elegir el proveedor de datos"],
      ["en", "Contract Negotiation", "Step 1: Choose Data Provider"],
    ]);
  });

  test("J1032 data transfers in every language", async ({ page }) => {
    await checkLanguages(page, "/data/transfer", [
      ["de", "Datenübertragungen", "Meine Verträge und Daten"],
      ["fr", "Transferts de données", "Mes contrats et mes données"],
      ["nl", "Gegevensoverdrachten", "Mijn contracten en gegevens"],
      ["es", "Transferencias de datos", "Mis contratos y datos"],
      ["en", "Data Transfers", "My contracts and data"],
    ]);
  });

  test("J1033 the health data user's tasks in every language", async ({
    page,
  }) => {
    await checkLanguages(page, "/tasks", [
      ["de", "Meine Aufgaben", "Aufgaben gesamt"],
      ["fr", "Mes tâches", "Tâches au total"],
      ["nl", "Mijn taken", "Taken totaal"],
      ["es", "Mis tareas", "Tareas totales"],
      ["en", "My Tasks", "Total Tasks"],
    ]);
  });

  test("J1034 OMOP analytics in every language", async ({ page }) => {
    await checkLanguages(page, "/analytics", [
      ["de", "OMOP-Forschungsanalysen", "Arzneimittelexpositionen"],
      ["fr", "Analyses de recherche OMOP", "Expositions médicamenteuses"],
      ["nl", "OMOP-onderzoeksanalyses", "Geneesmiddelblootstellingen"],
      ["es", "Análisis de investigación OMOP", "Exposiciones a fármacos"],
      ["en", "OMOP Research Analytics", "Drug Exposures"],
    ]);
  });

  test("J1035 the natural language query in every language", async ({
    page,
  }) => {
    await checkLanguages(page, "/query", [
      ["de", "Abfrage in natürlicher Sprache", /^Föderiert$/],
      ["fr", "Requête en langage naturel", /^Fédéré$/],
      ["nl", "Vraag in natuurlijke taal", /^Gefedereerd$/],
      ["es", "Consulta en lenguaje natural", /^Federado$/],
      ["en", "Natural Language Query", /^Federated$/],
    ]);
  });

  test("J1036 the example questions stay English in every language", async ({
    page,
  }) => {
    // The query engine matches English patterns, so the chips that send a
    // question must send the English one whatever the interface language.
    await page.goto("/query?lang=fr");
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "Requête en langage naturel",
      }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      page.getByRole("button", { name: "How many patients are there?" }),
    ).toBeVisible();
  });

  test("J1037 French and Spanish name the regulation EEDS on the analytics page", async ({
    page,
  }) => {
    for (const [lang, phrase] of [
      ["fr", "art. 53 de l’EEDS"],
      ["es", "art. 53 del EEDS"],
    ] as const) {
      await page.goto(`/analytics?lang=${lang}`);
      await expect(page.getByText(phrase).first()).toBeVisible({
        timeout: 15_000,
      });
      await expect(page.getByText("EHDS Art. 53")).toHaveCount(0);
    }
  });
});

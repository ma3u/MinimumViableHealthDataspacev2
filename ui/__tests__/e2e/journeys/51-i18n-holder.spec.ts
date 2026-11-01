/**
 * Issue #782, ADR-070: the health data holder's pages follow the language
 * picker (J1040 to J1049). Per page the h1 and one label in German, French,
 * Dutch and Spanish, then English again; two journeys open a form and check
 * the texts inside it.
 *
 * Every page here answers any signed-in participant, and the holder is the
 * one who uses them, so the journeys sign in as clinicuser (AlphaKlinik
 * Berlin).
 *
 *   PLAYWRIGHT_BASE_URL=http://localhost:3003 \
 *     npx playwright test __tests__/e2e/journeys/51-i18n-holder.spec.ts
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

test.describe("Issue #782 · the health data holder's pages in five languages", () => {
  test("J1040 /data/share in every language", async ({ page }) => {
    await skipIfKeycloakDown();
    await loginAs(page, "clinicuser", "clinicuser");
    await checkLanguages(page, "/data/share", [
      ["de", "Daten teilen", "Meine Assets"],
      ["fr", "Partager des données", "Mes actifs"],
      ["nl", "Gegevens delen", "Mijn assets"],
      ["es", "Compartir datos", "Mis activos"],
      ["en", "Share Data", "My Assets"],
    ]);
  });

  test("J1041 /catalog/editor in every language", async ({ page }) => {
    await skipIfKeycloakDown();
    await loginAs(page, "clinicuser", "clinicuser");
    await checkLanguages(page, "/catalog/editor", [
      ["de", "HealthDCAT-AP-Editor", "Neuer Eintrag"],
      ["fr", "Éditeur HealthDCAT-AP", "Nouvelle entrée"],
      ["nl", "HealthDCAT-AP-editor", "Nieuwe invoer"],
      ["es", "Editor HealthDCAT-AP", "Nueva entrada"],
      ["en", "HealthDCAT-AP Editor", "New Entry"],
    ]);
  });

  test("J1042 /eehrxf in every language", async ({ page }) => {
    await skipIfKeycloakDown();
    await loginAs(page, "clinicuser", "clinicuser");
    await checkLanguages(page, "/eehrxf", [
      ["de", "Abgleich mit den EEHRxF-Profilen", "Vorrangige Kategorien"],
      ["fr", "Alignement sur les profils EEHRxF", "Catégories prioritaires"],
      ["nl", "Afstemming op EEHRxF-profielen", "Prioritaire categorieën"],
      ["es", "Alineación con los perfiles EEHRxF", "Categorías prioritarias"],
      ["en", "EEHRxF Profile Alignment", "Priority Categories"],
    ]);
  });

  test("J1043 /credentials in every language", async ({ page }) => {
    await skipIfKeycloakDown();
    await loginAs(page, "clinicuser", "clinicuser");
    await checkLanguages(page, "/credentials", [
      ["de", "Verifizierbare Nachweise", "Nachweis anfordern"],
      ["fr", "Attestations vérifiables", "Demander une attestation"],
      ["nl", "Verifieerbare bewijsstukken", "Bewijsstuk aanvragen"],
      ["es", "Credenciales verificables", "Solicitar credencial"],
      ["en", "Verifiable Credentials", "Request Credential"],
    ]);
  });

  test("J1044 the editor's form names the Art. 51 categories in German, and FR says EEDS", async ({
    page,
  }) => {
    await skipIfKeycloakDown();
    await loginAs(page, "clinicuser", "clinicuser");
    await page.goto("/catalog/editor?lang=de");
    await page.getByRole("button", { name: "Neuer Eintrag" }).click();
    await expect(page.getByText("DCAT-AP-Pflichtfelder")).toBeVisible({
      timeout: 15_000,
    });
    await expect(
      page.getByText("Gesundheitsdatenkategorien (Art. 51 Abs. 1)"),
    ).toBeVisible();
    await expect(
      page.getByText("Elektronische Gesundheitsdaten aus EHR-Systemen"),
    ).toBeVisible();

    // French abbreviates the Regulation EEDS, never EHDS.
    await page.goto("/catalog/editor?lang=fr");
    await expect(page.getByText("Éditeur EEDS")).toBeVisible({
      timeout: 15_000,
    });
    await page.goto("/catalog/editor?lang=en");
    await expect(page.getByText("EHDS Editor")).toBeVisible({
      timeout: 15_000,
    });
  });

  test("J1045 registering a data asset, in French", async ({ page }) => {
    await skipIfKeycloakDown();
    await loginAs(page, "clinicuser", "clinicuser");
    await page.goto("/data/share?lang=fr");
    await page.getByRole("button", { name: "Nouvel enregistrement" }).click();
    await expect(
      page.getByRole("heading", { name: "Enregistrer un actif de données" }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.getByLabel("Nom de l’actif")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Enregistrer l’actif" }),
    ).toBeVisible();
    await page.goto("/data/share?lang=en");
    await expect(
      page.getByRole("heading", { level: 1, name: "Share Data" }),
    ).toBeVisible({ timeout: 15_000 });
  });
});

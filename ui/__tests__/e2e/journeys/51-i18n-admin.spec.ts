/**
 * Issue #782, ADR-070: the administration and the small pages follow the
 * language picker (J1060 to J1068). Each page shows its heading and one more
 * label in German, French, Dutch and Spanish, then in English again. FR and
 * ES write EEDS; the legal terms come from ui/src/lib/i18n/ehds-terminology.json.
 *
 *   PLAYWRIGHT_BASE_URL=http://localhost:3003 \
 *     npx playwright test __tests__/e2e/journeys/51-i18n-admin.spec.ts
 */
import { test } from "@playwright/test";
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

test.describe("Issue #782 · the administration follows the picker", () => {
  test.beforeEach(async ({ page }) => {
    await skipIfKeycloakDown();
    await loginAs(page, "edcadmin", "edcadmin");
  });

  test("J1060 the operator dashboard and the tenants in every language", async ({
    page,
  }) => {
    await checkLanguages(page, "/admin", [
      ["de", "Systemübersicht", "Schnellaktionen"],
      ["fr", "Vue d’ensemble du système", "Opérations rapides"],
      ["nl", "Systeemoverzicht", "Snelle acties"],
      ["es", "Resumen del sistema", "Operaciones rápidas"],
      ["en", "System Overview", "Quick Operations"],
    ]);
    await checkLanguages(page, "/admin/tenants", [
      ["de", "Mandantenverwaltung", "RBAC-Übersicht"],
      ["fr", "Gestion des locataires", "Synthèse RBAC"],
      ["nl", "Tenantbeheer", "RBAC-overzicht"],
      ["es", "Gestión de inquilinos", "Resumen RBAC"],
      ["en", "Tenant Management", "RBAC Summary"],
    ]);
  });

  test("J1061 the participant directory in every language", async ({
    page,
  }) => {
    await checkLanguages(page, "/admin/participants", [
      ["de", "Teilnehmerverzeichnis", "Teilnehmer-Wallet aufnehmen"],
      [
        "fr",
        "Annuaire des participants",
        "Intégrer le portefeuille d’un participant",
      ],
      ["nl", "Deelnemersregister", "Wallet van deelnemer toevoegen"],
      [
        "es",
        "Directorio de participantes",
        "Incorporar la cartera de un participante",
      ],
      ["en", "Participant Directory", "Onboard participant wallet"],
    ]);
  });

  test("J1062 the policy definitions in every language", async ({ page }) => {
    await checkLanguages(page, "/admin/policies", [
      ["de", "Richtliniendefinitionen", "Richtlinie erstellen"],
      ["fr", "Définitions de politiques", "Créer une politique"],
      ["nl", "Beleidsdefinities", "Beleid aanmaken"],
      ["es", "Definiciones de políticas", "Crear política"],
      ["en", "Policy Definitions", "Create Policy"],
    ]);
  });

  test("J1063 the EDC components in every language", async ({ page }) => {
    await checkLanguages(page, "/admin/components", [
      ["de", "EDC-Komponenten", "Schichtansicht"],
      ["fr", "Composants EDC", "Vue par couche"],
      ["nl", "EDC-componenten", "Laagweergave"],
      ["es", "Componentes EDC", "Vista por capas"],
      ["en", "EDC Components", "Layer View"],
    ]);
  });

  test("J1064 audit and provenance in every language", async ({ page }) => {
    await checkLanguages(page, "/admin/audit", [
      ["de", "Audit und Herkunft", "Einträge sind nicht versiegelt"],
      ["fr", "Audit et provenance", "Les enregistrements ne sont pas scellés"],
      ["nl", "Audit en herkomst", "Records zijn niet verzegeld"],
      ["es", "Auditoría y procedencia", "Los registros no están sellados"],
      ["en", "Audit & Provenance", "Records are not sealed"],
    ]);
  });

  test("J1065 the SPE attestation in every language", async ({ page }) => {
    await checkLanguages(page, "/admin/attestation", [
      ["de", "SPE-Attestierung", "Was Attestierung ist"],
      ["fr", "Attestation SPE", "Ce qu’est l’attestation"],
      ["nl", "SPE-attestatie", "Wat attestatie is"],
      ["es", "Atestación SPE", "Qué es la atestación"],
      ["en", "SPE attestation", "What attestation is"],
    ]);
  });

  test("J1066 the dataspace settings in every language", async ({ page }) => {
    await checkLanguages(page, "/settings", [
      [
        "de",
        "Einstellungen des Datenraums",
        /Alle Teilnehmerprofile im Datenraum verwalten/,
      ],
      [
        "fr",
        "Paramètres de l’espace de données",
        /Gérer tous les profils de participants/,
      ],
      [
        "nl",
        "Instellingen van de dataspace",
        /Alle deelnemersprofielen in de dataspace beheren/,
      ],
      [
        "es",
        "Configuración del espacio de datos",
        /Gestionar todos los perfiles de participantes/,
      ],
      [
        "en",
        "Dataspace Settings",
        /Manage all participant profiles across the dataspace/,
      ],
    ]);
  });

  test("J1067 participant onboarding in every language", async ({ page }) => {
    await checkLanguages(page, "/onboarding", [
      [
        "de",
        "Teilnehmer-Onboarding",
        "EHDS- und Vertragsanforderungen für das Teilen von Daten",
      ],
      [
        "fr",
        "Intégration des participants",
        "Exigences EEDS et contractuelles pour le partage de données",
      ],
      [
        "nl",
        "Onboarding van deelnemers",
        "EHDS- en contractuele eisen voor het delen van gegevens",
      ],
      [
        "es",
        "Incorporación de participantes",
        "Requisitos del EEDS y contractuales para compartir datos",
      ],
      [
        "en",
        "Participant Onboarding",
        "EHDS & Contractual Requirements for Data Sharing",
      ],
    ]);
  });

  test("J1068 the access denied page in every language", async ({ page }) => {
    await checkLanguages(page, "/auth/unauthorized", [
      ["de", "Zugriff verweigert", "Zur Startseite"],
      ["fr", "Accès refusé", "Retour à l’accueil"],
      ["nl", "Toegang geweigerd", "Terug naar de startpagina"],
      ["es", "Acceso denegado", "Volver al inicio"],
      ["en", "Access Denied", "Return to Home"],
    ]);
  });
});

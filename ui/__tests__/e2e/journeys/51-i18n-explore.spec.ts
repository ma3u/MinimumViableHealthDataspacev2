/**
 * The explore pages follow the language picker (#782, ADR-070): the graph
 * explorer, the persona overview, Maria's journey, the demo persona selector
 * and the protocol TCK, each in German, French, Dutch, Spanish and back in
 * English. The admin sees every page.
 *
 *   PLAYWRIGHT_BASE_URL=http://localhost:3003 \
 *     npx playwright test __tests__/e2e/journeys/51-i18n-explore.spec.ts
 */
import { test } from "@playwright/test";
import { loginAs, skipIfKeycloakDown } from "./helpers";
import { checkLanguages } from "./i18n-helpers";

test.describe("Issue #782 · the explore pages in five languages", () => {
  test.beforeEach(async ({ page }) => {
    await skipIfKeycloakDown();
    await loginAs(page, "edcadmin", "edcadmin");
  });

  test("J1050 the graph explorer in every language", async ({ page }) => {
    await checkLanguages(page, "/graph", [
      ["de", "Wissensgraph", "Den Graphen fragen"],
      ["fr", "Graphe de connaissances", "Interroger le graphe"],
      ["nl", "Kennisgraaf", "Vraag het de graaf"],
      ["es", "Grafo de conocimiento", "Preguntar al grafo"],
      ["en", "Knowledge Graph", "Ask the graph"],
    ]);
  });

  test("J1051 the access body's overview in every language", async ({
    page,
  }) => {
    await checkLanguages(page, "/overview?persona=hdab", [
      ["de", "Compliance auf einen Blick", "Legende"],
      ["fr", "La conformité en un coup d’œil", "Légende"],
      ["nl", "Naleving in één overzicht", "Legenda"],
      ["es", "La conformidad de un vistazo", "Leyenda"],
      ["en", "Compliance, in one view", "Legend"],
    ]);
  });

  test("J1052 Maria's journey in every language", async ({ page }) => {
    await checkLanguages(page, "/journey", [
      ["de", /Maria übernimmt die Kontrolle/, "EHDS-Patienten-Wallet"],
      ["fr", /Maria prend le contrôle/, "Portefeuille patient EEDS"],
      ["nl", /Maria neemt de regie/, "EHDS-patiëntenwallet"],
      ["es", /Maria toma el control/, "Monedero del paciente del EEDS"],
      ["en", /Maria takes control of/, "EHDS Patient Wallet"],
    ]);
  });

  test("J1053 the demo persona selector in every language", async ({
    page,
  }) => {
    await checkLanguages(page, "/demo", [
      ["de", "Demo-Persona wählen", "Demo starten"],
      ["fr", "Choix de la persona de démo", "Lancer la démo"],
      ["nl", "Demopersona kiezen", "Demo starten"],
      ["es", "Selector de persona de demostración", "Iniciar la demo"],
      ["en", "Demo Persona Selector", "Start demo"],
    ]);
  });

  test("J1054 the protocol TCK in every language", async ({ page }) => {
    await checkLanguages(page, "/compliance/tck", [
      ["de", "Protokoll-Konformität", "EHDS-Genehmigungsprüfung"],
      [
        "fr",
        "Tableau de conformité aux protocoles",
        "Contrôle des approbations EEDS",
      ],
      ["nl", "Dashboard protocolconformiteit", "EHDS-goedkeuringscontrole"],
      [
        "es",
        "Panel de conformidad de protocolos",
        "Comprobación de aprobaciones EEDS",
      ],
      ["en", "Protocol Compliance Dashboard", "EHDS Approval Checker"],
    ]);
  });
});

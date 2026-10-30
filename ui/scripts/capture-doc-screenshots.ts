/**
 * Captures the screenshots the documentation shows, from the static demo:
 * the GitHub Pages build, which needs no sign-in, no Neo4j and no EDC, so
 * every page renders the same mock data on any machine. Each page is taken
 * as the demo persona that would open it.
 *
 *   npx tsx scripts/capture-doc-screenshots.ts
 *
 * Writes 1440 x 900 PNGs to public/images/screenshots/, refreshes the copy
 * under docs/images/screenshots/ for every file that has one, and the
 * persona overview the README shows (docs/images/persona-overview.png).
 * BASE_URL defaults to the GitHub Pages site; to capture a local static
 * build, serve out/ under /MinimumViableHealthDataspacev2 and point BASE_URL
 * at it.
 */
import { chromium, type Page } from "@playwright/test";
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const BASE_URL = (
  process.env.BASE_URL ??
  "https://ma3u.github.io/MinimumViableHealthDataspacev2"
).replace(/\/$/, "");
const UI_SHOTS = join(process.cwd(), "public", "images", "screenshots");
const DOC_IMAGES = join(process.cwd(), "..", "docs", "images");
const DOC_SHOTS = join(DOC_IMAGES, "screenshots");

interface Shot {
  file: string;
  path: string;
  /** Demo persona; null shows the page signed out. */
  persona: string | null;
  /** Extra wait for canvases and charts to settle. */
  settle?: number;
}

const SHOTS: Shot[] = [
  {
    file: "ehds-health-dataspace-home-dashboard.png",
    path: "/",
    persona: null,
  },
  {
    file: "ehds-signin-persona-cards.png",
    path: "/auth/signin",
    persona: null,
  },
  {
    file: "ehds-user-guide-overview.png",
    path: "/docs/user-guide",
    persona: null,
  },
  {
    file: "neo4j-health-dataspace-graph-explorer.png",
    path: "/graph",
    persona: "edcadmin",
    settle: 3000,
  },
  {
    file: "graph-explorer-default.png",
    path: "/graph",
    persona: "edcadmin",
    settle: 3000,
  },
  {
    file: "graph-explorer-persona-selector.png",
    path: "/overview",
    persona: "edcadmin",
    settle: 3000,
  },
  {
    file: "graph-explorer-hospital-persona.png",
    path: "/graph?persona=hospital",
    persona: "clinicuser",
    settle: 3000,
  },
  {
    file: "graph-explorer-researcher-persona.png",
    path: "/graph?persona=researcher",
    persona: "researcher",
    settle: 3000,
  },
  {
    file: "graph-explorer-trust-center-persona.png",
    path: "/graph?persona=trust-center",
    persona: "regulator",
    settle: 3000,
  },
  {
    file: "graph-explorer-hdab-persona.png",
    path: "/graph?persona=hdab",
    persona: "regulator",
    settle: 3000,
  },
  {
    file: "graph-explorer-edc-admin-persona.png",
    path: "/graph?persona=edc-admin",
    persona: "edcadmin",
    settle: 3000,
  },
  {
    file: "ehds-fhir-dataset-catalog-browser.png",
    path: "/catalog",
    persona: "researcher",
  },
  {
    file: "ehds-federated-catalog-discovery.png",
    path: "/data/discover",
    persona: "researcher",
  },
  {
    file: "ehds-natural-language-federated-query.png",
    path: "/query",
    persona: "researcher",
  },
  {
    file: "omop-cdm-analytics-dashboard.png",
    path: "/analytics",
    persona: "researcher",
    settle: 1500,
  },
  {
    file: "fhir-patient-journey-timeline-view.png",
    path: "/patient",
    persona: "clinicuser",
  },
  {
    file: "eehrxf-exchange-format-profiles.png",
    path: "/eehrxf",
    persona: "clinicuser",
  },
  {
    file: "ehds-share-data-asset-registration.png",
    path: "/data/share",
    persona: "clinicuser",
  },
  {
    file: "edc-contract-negotiation-manager.png",
    path: "/negotiate",
    persona: "researcher",
  },
  {
    file: "edc-data-transfer-history-log.png",
    path: "/data/transfer",
    persona: "researcher",
  },
  {
    file: "ehds-data-transfer-task-queue.png",
    path: "/tasks",
    persona: "researcher",
  },
  {
    file: "ehds-data-access-approval-workflow.png",
    path: "/compliance",
    persona: "regulator",
  },
  {
    file: "dsp-protocol-tck-compliance-tests.png",
    path: "/compliance/tck",
    persona: "edcadmin",
  },
  {
    file: "ehds-verifiable-credentials-overview.png",
    path: "/credentials",
    persona: "edcadmin",
  },
  {
    file: "ehds-participant-settings-credentials.png",
    path: "/settings",
    persona: "clinicuser",
  },
  {
    file: "ehds-participant-onboarding-wizard.png",
    path: "/onboarding",
    persona: "edcadmin",
  },
  {
    file: "ehds-operator-admin-dashboard.png",
    path: "/admin",
    persona: "edcadmin",
  },
  {
    file: "edc-connector-components-overview.png",
    path: "/admin/components",
    persona: "edcadmin",
  },
];

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function open(page: Page, path: string, persona: string | null) {
  // The persona lives in sessionStorage (mirrored to localStorage), so it is
  // set on the origin first and the page loaded after it.
  await page.goto(`${BASE_URL}/`, { waitUntil: "domcontentloaded" });
  await page.evaluate((p) => {
    sessionStorage.clear();
    localStorage.removeItem("demo-persona");
    if (p) {
      sessionStorage.setItem("demo-persona", p);
      localStorage.setItem("demo-persona", p);
    }
  }, persona);
  await page.goto(`${BASE_URL}${path}`, { waitUntil: "networkidle" });
}

async function main() {
  mkdirSync(UI_SHOTS, { recursive: true });
  const browser = await chromium.launch(
    process.env.CHROMIUM_PATH
      ? { executablePath: process.env.CHROMIUM_PATH }
      : {},
  );
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
  });
  for (const s of SHOTS) {
    await open(page, s.path, s.persona);
    await pause(s.settle ?? 1000);
    const out = join(UI_SHOTS, s.file);
    await page.screenshot({ path: out });
    if (existsSync(join(DOC_SHOTS, s.file))) {
      copyFileSync(out, join(DOC_SHOTS, s.file));
    }
    console.log(`${s.file}  ${s.path} as ${s.persona ?? "signed out"}`);
  }
  // README: the access body's compliance state, in one view.
  await open(page, "/overview?persona=hdab", "edcadmin");
  await pause(4000);
  await page.screenshot({ path: join(DOC_IMAGES, "persona-overview.png") });
  console.log("persona-overview.png  /overview?persona=hdab");
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

/**
 * Journey Group ES — EHDS Secondary Use, end to end (J860–J899)
 *
 * The journey in `docs/userjourney.drawio`, which is the one walked through in
 * the Spanish HDAB demo (issue #27), asserted step by step against the static
 * export. Every step is a deep link that a presenter can paste, so a failure
 * here means a link in `docs/demos/hdab-spain-secondary-use-journey.md` is dead
 * and the demo breaks in front of a regulator.
 *
 *   1a/1b/1c  Registration and trust        /onboarding, /credentials
 *   2         Publish (DCAT catalogue)      /data/share, /catalog
 *   3         Discover (DCAT search)        /data/discover
 *   4         Negotiate (offer/accept)      /negotiate
 *   4b        HDAB approves the permit      /compliance
 *   5         Extract and upload FHIR       /data/transfer
 *   6         Analyse in the SPE (OMOP)     /analytics, /query
 *   7         Share results                 /tasks
 *   8         Audit report                  /admin/audit
 *
 * No Keycloak: the static build has no session, and the persona comes from
 * `?persona=`. That is the point of the fallback, so it is what is tested.
 *
 * Run against the local static build:
 *   cd ui && mv src/app/api /tmp/api_disabled
 *   NEXT_PUBLIC_STATIC_EXPORT=true npx next build
 *   mv /tmp/api_disabled src/app/api
 *   mkdir -p /tmp/static-site && cp -r out /tmp/static-site/MinimumViableHealthDataspacev2
 *   npx serve /tmp/static-site -l 3102 &
 *   NEXT_PUBLIC_STATIC_EXPORT=true PLAYWRIGHT_BASE_URL=http://localhost:3102 \
 *     npx playwright test 37-ehds-secondary-use-journey.spec.ts --project=chromium
 *
 * Or against live GitHub Pages:
 *   NEXT_PUBLIC_STATIC_EXPORT=true PLAYWRIGHT_BASE_URL=https://ma3u.github.io \
 *     npx playwright test 37-ehds-secondary-use-journey.spec.ts --project=chromium
 */

import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { T } from "./helpers";

/** basePath used by the static export — must match next.config.js */
const BP = "/MinimumViableHealthDataspacev2";

/**
 * Deep link for one journey step.
 *
 * No trailing slash, deliberately. The export sets `trailingSlash: false`, so
 * `/graph` serves and `/graph/` is a 404 on GitHub Pages. A demo script with
 * tidy-looking trailing slashes fails on every link.
 */
function step(path: string, persona: string): string {
  return `${BP}${path}?persona=${persona}`;
}

/** Opens a step and waits for the client to have applied the persona. */
async function open(page: Page, path: string, persona: string) {
  await page.goto(step(path, persona));
  await page.waitForLoadState("networkidle");
}

/** The persona the page believes is active, as the app itself stores it. */
async function activePersona(page: Page): Promise<string | null> {
  return page.evaluate(() => sessionStorage.getItem("demo-persona"));
}

// ── The journey, step by step ────────────────────────────────────────────────

interface Step {
  id: string;
  name: string;
  path: string;
  persona: string;
  /** Username the persona resolves to, which is what the app stores. */
  stores: string;
  /** Text that proves this page rendered its own content, not a shell. */
  expect: RegExp;
}

const JOURNEY: Step[] = [
  {
    id: "J860",
    name: "1a. Hospital registers",
    path: "/onboarding",
    persona: "hospital",
    stores: "clinicuser",
    expect: /onboard|participant|register/i,
  },
  {
    id: "J861",
    name: "1b. Researcher registers",
    path: "/onboarding",
    persona: "researcher",
    stores: "researcher",
    expect: /onboard|participant|register/i,
  },
  {
    id: "J862",
    name: "1c. HDAB registers",
    path: "/onboarding",
    persona: "hdab",
    stores: "regulator",
    expect: /onboard|participant|register/i,
  },
  {
    id: "J863",
    name: "1. Trust: verifiable credentials",
    path: "/credentials",
    persona: "hdab",
    stores: "regulator",
    expect: /credential/i,
  },
  {
    id: "J864",
    name: "2. Hospital publishes to the DCAT catalogue",
    path: "/data/share",
    persona: "hospital",
    stores: "clinicuser",
    expect: /share|publish|dataset/i,
  },
  {
    id: "J865",
    name: "2. The catalogue lists it",
    path: "/catalog",
    persona: "hospital",
    stores: "clinicuser",
    expect: /catalog|dataset/i,
  },
  {
    id: "J866",
    name: "3. Researcher discovers data",
    path: "/data/discover",
    persona: "researcher",
    stores: "researcher",
    expect: /discover|search|dataset/i,
  },
  {
    id: "J867",
    name: "4. Contract negotiation",
    path: "/negotiate",
    persona: "researcher",
    stores: "researcher",
    expect: /negotiat|contract|offer/i,
  },
  {
    id: "J868",
    name: "4b. HDAB approves the data permit",
    path: "/compliance",
    persona: "hdab",
    stores: "regulator",
    expect: /compliance|permit|hdab|approval/i,
  },
  {
    id: "J869",
    name: "5. Extract and upload, pseudonymised FHIR",
    path: "/data/transfer",
    persona: "hospital",
    stores: "clinicuser",
    expect: /transfer/i,
  },
  {
    id: "J870",
    name: "6. Analyse in the SPE, OMOP cohort",
    path: "/analytics",
    persona: "researcher",
    stores: "researcher",
    expect: /analytic|cohort|omop/i,
  },
  {
    id: "J871",
    name: "6. Query the graph",
    path: "/query",
    persona: "researcher",
    stores: "researcher",
    expect: /query/i,
  },
  {
    id: "J872",
    name: "7. Share results",
    path: "/tasks",
    persona: "researcher",
    stores: "researcher",
    expect: /task/i,
  },
  {
    id: "J873",
    name: "8. HDAB receives the audit report",
    path: "/admin/audit",
    persona: "hdab",
    stores: "regulator",
    expect: /audit/i,
  },
];

test.describe("EHDS secondary-use journey (static, no login)", () => {
  for (const s of JOURNEY) {
    test(`${s.id} ${s.name}`, async ({ page }) => {
      await open(page, s.path, s.persona);

      // The link resolved. A 404 on Pages still renders HTML, so assert on the
      // page's own content rather than on a status code.
      await expect(page.locator("body")).toContainText(s.expect, {
        timeout: T,
      });
      await expect(page.locator("text=/404|not found/i")).toHaveCount(0);

      // ?persona= took effect. Without this the deep link renders the
      // signed-out view and the presenter sees the wrong navigation.
      expect(await activePersona(page)).toBe(s.stores);
    });
  }
});

test.describe("Deep-link mechanics the demo script depends on", () => {
  test("J880 no link in the demo guide carries a trailing slash", async () => {
    // `trailingSlash: false` in next.config.js means /graph.html exists and
    // /graph/index.html does not, so GitHub Pages answers 404 for /graph/.
    // The status code is asserted separately, because `npx serve` rewrites a
    // trailing slash and Pages does not, so only one of the two environments
    // can prove it. What holds everywhere is the guide itself: a presenter
    // pastes these links, and one "tidied" slash breaks the step live.
    const guide = readFileSync(
      join(
        __dirname,
        "../../../../docs/demos/hdab-spain-secondary-use-journey.md",
      ),
      "utf8",
    );
    const offenders = [
      ...guide.matchAll(/https:\/\/ma3u\.github\.io\/\S*?\/(?=[)\s?#])/g),
    ].map((m) => m[0]);
    expect(offenders, "deep links must not end in /").toEqual([]);
  });

  test("J885 on GitHub Pages a trailing slash really is a 404", async ({
    page,
    baseURL,
  }) => {
    test.skip(
      !(baseURL ?? "").includes("github.io"),
      "only GitHub Pages serves the export the way the audience will see it",
    );
    const response = await page.goto(`${BP}/graph/`, {
      waitUntil: "domcontentloaded",
    });
    expect(response?.status()).toBe(404);
  });

  test("J881 without ?persona= the page still renders, just signed out", async ({
    page,
  }) => {
    // The fallback must degrade, not explode: a regulator who strips the query
    // string should still see the page.
    await page.goto(`${BP}/negotiate`);
    await page.waitForLoadState("networkidle");
    await expect(page.locator("body")).toContainText(/negotiat|contract/i, {
      timeout: T,
    });
  });

  test("J882 persona survives navigation within the tab", async ({ page }) => {
    // Step 4 and step 4b are different pages. If the persona did not persist,
    // every link in the guide would need the query string, and forgetting one
    // would silently show the wrong role.
    await open(page, "/negotiate", "researcher");
    expect(await activePersona(page)).toBe("researcher");

    await page.goto(`${BP}/analytics`);
    await page.waitForLoadState("networkidle");
    expect(await activePersona(page)).toBe("researcher");
  });

  test("J883 a username works where a personaId is expected", async ({
    page,
  }) => {
    // The credentials table in the demo guide lists usernames (regulator),
    // the persona hub uses ids (hdab). Both appear in the docs, so both resolve.
    await open(page, "/compliance", "regulator");
    expect(await activePersona(page)).toBe("regulator");
  });

  test("J884 every mock fixture the journey reads is served", async ({
    request,
  }) => {
    // The pages fetch these client-side, so a missing one shows an empty table
    // rather than an error, which is the worst way to find out mid-demo.
    const fixtures = [
      "catalog.json",
      "negotiations.json",
      "transfers.json",
      "analytics.json",
      "compliance.json",
      "admin_audit.json",
      "credentials.json",
      "tasks.json",
      "participants.json",
    ];
    for (const f of fixtures) {
      const res = await request.get(`${BP}/mock/${f}`);
      expect(res.status(), `${f} must be served`).toBe(200);
      expect(
        JSON.parse(await res.text()),
        `${f} must be non-empty JSON`,
      ).toBeTruthy();
    }
  });
});

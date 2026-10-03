/**
 * Issue #447 — no hydration error on a signed-in page (J1005).
 *
 * Every signed-in page threw React #418 because useTabSession read its
 * sessionStorage snapshot in a useState initialiser: the server rendered the
 * signed-out navigation, the client's first render the signed-in one. Nothing
 * looked broken, React just threw the server HTML away, so only a check like
 * this one notices it coming back.
 *
 *   PLAYWRIGHT_BASE_URL=https://ehds.mabu.red \
 *   KEYCLOAK_PUBLIC_URL=https://auth.ehds.mabu.red \
 *     npx playwright test __tests__/e2e/journeys/48-hydration-signed-in.spec.ts
 */
import { test, expect } from "@playwright/test";
import { loginAs, skipIfKeycloakDown } from "./helpers";

/** Production builds report the minified codes, dev builds the text. */
const HYDRATION =
  /Minified React error #(418|423|425)|Hydration failed|didn't match the client/;

const PAGES = [
  "/",
  "/compliance",
  "/admin/audit",
  "/admin/components",
  "/catalog",
];

test("J1005 signed-in pages hydrate without a mismatch", async ({ page }) => {
  test.setTimeout(180_000);
  await skipIfKeycloakDown();

  const errors: string[] = [];
  let current = "/auth/signin";
  page.on("pageerror", (e) => {
    if (HYDRATION.test(e.message)) errors.push(`${current}: ${e.message}`);
  });

  await loginAs(page, "edcadmin", "edcadmin");
  for (const path of PAGES) {
    current = path;
    await page.goto(path, { waitUntil: "networkidle" });
  }

  expect(errors, errors.join("\n\n")).toEqual([]);
});

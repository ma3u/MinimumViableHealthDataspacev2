/**
 * The user guide's hover previews: one screenshot per feature card, taken
 * from the static GitHub Pages site as the persona whose menu holds the page.
 *
 * Usage: capture PNGs, then make the 1200px WebPs the guide serves:
 *   CAPTURE_GUIDE=1 GUIDE_SHOTS_DIR=/tmp/guide npx playwright test \
 *     capture-guide-screenshots --project=chromium
 *   for f in /tmp/guide/*.png; do cwebp -quiet -resize 1200 0 -q 72 "$f" \
 *     -o "public/images/guide/$(basename "$f" .png).webp"; done
 *
 * The static site shows what main last deployed, so a new page needs its
 * merge (and the Pages deploy) before it can be captured.
 *
 * Skipped unless CAPTURE_GUIDE=1: it calls the public site, which CI must not.
 */
import { test } from "@playwright/test";
import path from "path";
import {
  GUIDE_SCREENS,
  guideScreenshotSlug,
} from "../../src/lib/guide-screenshots";

const SITE =
  process.env.GUIDE_SITE ??
  "https://ma3u.github.io/MinimumViableHealthDataspacev2";
const OUT =
  process.env.GUIDE_SHOTS_DIR ??
  path.resolve(__dirname, "../../test-results/guide-screenshots");

test.describe("User guide hover previews", () => {
  test.skip(!process.env.CAPTURE_GUIDE, "set CAPTURE_GUIDE=1 to capture");
  test.use({ viewport: { width: 1440, height: 900 }, colorScheme: "light" });

  for (const { href, persona } of GUIDE_SCREENS) {
    test(`${href} as ${persona ?? "a visitor"}`, async ({ page }) => {
      await page.goto(SITE + "/");
      // Both stores, as setDemoPersona() does: lib/api.ts picks the patient's
      // own-record mock from localStorage, the menu reads sessionStorage.
      await page.evaluate((p) => {
        sessionStorage.clear();
        localStorage.removeItem("demo-persona");
        if (p) {
          sessionStorage.setItem("demo-persona", p);
          localStorage.setItem("demo-persona", p);
        }
      }, persona);
      await page.goto(SITE + href, { waitUntil: "networkidle" });
      await page.waitForTimeout(2000);
      await page.screenshot({
        path: `${OUT}/${guideScreenshotSlug(href)}.png`,
        fullPage: false,
      });
    });
  }
});

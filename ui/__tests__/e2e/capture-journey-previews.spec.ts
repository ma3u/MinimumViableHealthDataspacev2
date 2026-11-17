/**
 * The step previews of the full-screen journeys page (/journeys): a
 * full-page screenshot of every hub page a step shows, taken from the static
 * GitHub Pages site as the persona whose menu holds the page, with the boxes
 * of the page's core features (its heading, then its tables, forms, charts
 * and cards) that the preview scrolls and zooms to.
 *
 * Usage:
 *   CAPTURE_JOURNEYS=1 JOURNEY_SHOTS_DIR=/tmp/journeys npx playwright test \
 *     capture-journey-previews --project=chromium
 *   python3 scripts/build-journey-previews.py /tmp/journeys
 *
 * The second step makes the WebPs under public/images/journeys/ and writes
 * src/content/journey-previews.json. Skipped unless CAPTURE_JOURNEYS=1: it
 * calls the public site, which CI must not.
 */
import { test } from "@playwright/test";
import { writeFileSync, mkdirSync } from "fs";
import path from "path";
import { GUIDE_SCREENS } from "../../src/lib/guide-screenshots";
import { previewPages } from "../../src/lib/journey-steps";

const SITE =
  process.env.GUIDE_SITE ??
  "https://ma3u.github.io/MinimumViableHealthDataspacev2";
const OUT =
  process.env.JOURNEY_SHOTS_DIR ??
  path.resolve(__dirname, "../../test-results/journey-previews");
/** Taller pages are cut: the preview shows their first part. */
const MAX_HEIGHT = 2600;
const WIDTH = 1440;

test.describe("Journey step previews", () => {
  test.skip(!process.env.CAPTURE_JOURNEYS, "set CAPTURE_JOURNEYS=1 to capture");
  test.use({ viewport: { width: WIDTH, height: 900 }, colorScheme: "light" });

  for (const href of previewPages()) {
    const persona = GUIDE_SCREENS.find((s) => s.href === href)?.persona ?? null;
    test(`${href} as ${persona ?? "a visitor"}`, async ({ page }) => {
      await page.goto(SITE + "/");
      await page.evaluate((p) => {
        sessionStorage.clear();
        localStorage.removeItem("demo-persona");
        if (p) {
          sessionStorage.setItem("demo-persona", p);
          localStorage.setItem("demo-persona", p);
        }
        sessionStorage.setItem("demo-password-banner-dismissed", "true");
      }, persona);
      await page.goto(SITE + href, { waitUntil: "networkidle" });
      await page.waitForTimeout(2500);

      // The core features: the heading's block first, then the largest
      // tables, forms, charts and card grids, in the order they come.
      const focus = await page.evaluate((maxH: number) => {
        const main = document.querySelector("main") ?? document.body;
        const box = (el: Element) => {
          const r = el.getBoundingClientRect();
          return {
            x: r.left + window.scrollX,
            y: r.top + window.scrollY,
            w: r.width,
            h: r.height,
          };
        };
        const out: { x: number; y: number; w: number; h: number }[] = [];
        const h1 = main.querySelector("h1");
        if (h1) {
          const block = h1.parentElement ?? h1;
          const b = box(block);
          out.push({ ...b, h: Math.min(b.h, 360) });
        }
        const picks = [
          ...main.querySelectorAll(
            "table, form, canvas, svg, [role=table], [role=grid], ul, ol, section, article, div",
          ),
        ]
          // A page-wide wrapper holds the heading; a feature does not.
          .filter((el) => !(h1 && el.contains(h1)))
          .filter((el) => el.tagName !== "DIV" || el.childElementCount >= 3)
          .map((el) => ({ el, b: box(el) }))
          .filter(
            ({ b }) =>
              b.w >= 360 && b.h >= 120 && b.y + 40 < maxH && b.h <= 900,
          )
          .sort((a, z) => z.b.w * z.b.h - a.b.w * a.b.h);
        const taken: typeof out = [];
        for (const { b } of picks) {
          const inside = [...out, ...taken].some(
            (t) =>
              b.x >= t.x - 4 &&
              b.y >= t.y - 4 &&
              b.x + b.w <= t.x + t.w + 4 &&
              b.y + b.h <= t.y + t.h + 4,
          );
          const holds = [...out, ...taken].some(
            (t) =>
              t.x >= b.x - 4 &&
              t.y >= b.y - 4 &&
              t.x + t.w <= b.x + b.w + 4 &&
              t.y + t.h <= b.y + b.h + 4,
          );
          if (inside || holds) continue;
          taken.push({ ...b, h: Math.min(b.h, maxH - b.y) });
          if (taken.length === 3) break;
        }
        taken.sort((a, z) => a.y - z.y);
        return [...out, ...taken];
      }, MAX_HEIGHT);

      const height = Math.min(
        MAX_HEIGHT,
        await page.evaluate(() => document.documentElement.scrollHeight),
      );
      mkdirSync(OUT, { recursive: true });
      const slug = href.replace(/^\//, "").replace(/\//g, "-");
      await page.screenshot({
        path: `${OUT}/${slug}.png`,
        fullPage: true,
        clip: { x: 0, y: 0, width: WIDTH, height },
      });
      writeFileSync(
        `${OUT}/${slug}.json`,
        JSON.stringify({ href, width: WIDTH, height, focus }, null, 2),
      );
    });
  }
});

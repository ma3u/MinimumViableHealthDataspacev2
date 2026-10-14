/**
 * Records the preview images of the HL7 showcase deck (issue #252): the card
 * a chat or a feed shows when the deck's link is pasted, and the animation
 * the README shows. Both are the cover slide as it renders, with the
 * patient's knowledge graph turning behind the title and the deck's own
 * controls, caption and key hints hidden.
 *
 *   npx tsx scripts/record-deck-preview.ts
 *   python3 scripts/frames-to-gif.py recordings/deck public/presentations/hl7-showcase-2026/img/preview.gif
 *
 * Writes public/presentations/hl7-showcase-2026/img/og-image.png (1200 x 630,
 * the Open Graph size) and frame-NNN.png plus frames.json to OUT (default
 * ./recordings/deck, 40 frames at 200 ms, 960 x 504). DECK_URL defaults to
 * the GitHub Pages copy, which needs no sign-in and is up off hours.
 */
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const DECK_URL =
  process.env.DECK_URL ??
  "https://ma3u.github.io/MinimumViableHealthDataspacev2/presentations/hl7-showcase-2026/";
const OUT = process.env.OUT ?? join(process.cwd(), "recordings", "deck");
const CARD = join(
  process.cwd(),
  "public",
  "presentations",
  "hl7-showcase-2026",
  "img",
  "og-image.png",
);
const FRAMES = 40;
const FRAME_MS = 200;
const HIDE =
  ".reveal .controls, .reveal .progress, .reveal .slide-number, [class*=navigate-], #narrate, .caption, .tiny { display: none !important; }";

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  for (const [size, task] of [
    [{ width: 1200, height: 630 }, "card"],
    [{ width: 960, height: 504 }, "frames"],
  ] as const) {
    const page = await browser.newPage({
      viewport: size,
      deviceScaleFactor: 1,
    });
    await page.goto(DECK_URL, { waitUntil: "networkidle" });
    // the graph scene draws itself over the first seconds; let it settle
    await pause(5000);
    await page.addStyleTag({ content: HIDE });
    await pause(500);
    if (task === "card") {
      await page.screenshot({ path: CARD, type: "png" });
      console.log(`wrote ${CARD}`);
    } else {
      const durations: number[] = [];
      for (let i = 0; i < FRAMES; i++) {
        await page.screenshot({
          path: join(OUT, `frame-${String(i).padStart(3, "0")}.png`),
          type: "png",
        });
        durations.push(FRAME_MS);
        await pause(FRAME_MS);
      }
      writeFileSync(join(OUT, "frames.json"), JSON.stringify(durations));
      console.log(`wrote ${FRAMES} frames to ${OUT}`);
    }
    await page.close();
  }
  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

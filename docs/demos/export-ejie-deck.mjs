// Renders the EJIE web deck (ui/public/presentations/euskadi-ejie-2026/) for the files
// that leave the browser: one JPEG per slide with every build shown, and a vector PDF
// with one page per slide. build-ejie-deck.py runs this and turns the JPEGs into the
// PowerPoint fallback, so the web deck stays the only source.
//
//     node docs/demos/export-ejie-deck.mjs <out-dir>
//
// Needs the UI's dev dependencies (Playwright and its Chromium): cd ui && npm ci.
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const require = createRequire(path.join(root, "ui/package.json"));
const { chromium } = require("@playwright/test");

const out = path.resolve(process.argv[2] ?? path.join(here, "ejie-export"));
mkdirSync(out, { recursive: true });
const deck = pathToFileURL(
  path.join(root, "ui/public/presentations/euskadi-ejie-2026/index.html"),
).href;
// The narration buttons and subtitles belong to the browser, not to a printed slide.
const HIDE =
  ".narration, #subtitle, .reveal .controls, .reveal .progress, .reveal .slide-number { display: none !important; }";

const browser = await chromium.launch();
try {
  const page = await browser.newPage({
    viewport: { width: 1920, height: 1080 },
  });
  await page.goto(deck, { waitUntil: "networkidle" });
  await page.addStyleTag({ content: HIDE });
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() =>
    Reveal.configure({ transition: "none", backgroundTransition: "none" }),
  );
  const total = await page.evaluate(() => Reveal.getTotalSlides());
  for (let i = 0; i < total; i++) {
    // Every fragment shown, then time for the entrance animations to finish.
    await page.evaluate((h) => Reveal.slide(h, 0, 999), i);
    await page.waitForTimeout(1600);
    const file = path.join(out, `slide-${String(i + 1).padStart(2, "0")}.jpg`);
    await page.screenshot({ path: file, type: "jpeg", quality: 88 });
  }

  // The PDF uses reveal.js's print mode, with all builds on one page per slide.
  const print = await browser.newPage();
  await print.addInitScript(() => {
    let real;
    Object.defineProperty(window, "Reveal", {
      configurable: true,
      get: () => real,
      set: (r) => {
        const init = r.initialize.bind(r);
        r.initialize = (cfg) =>
          init({ ...cfg, pdfSeparateFragments: false, pdfMaxPagesPerSlide: 1 });
        real = r;
      },
    });
  });
  await print.goto(deck + "?print-pdf", { waitUntil: "networkidle" });
  await print.addStyleTag({ content: HIDE });
  await print.evaluate(() => document.fonts.ready);
  await print.waitForTimeout(2500);
  await print.pdf({
    path: path.join(out, "deck.pdf"),
    width: "1920px",
    height: "1080px",
    printBackground: true,
  });
  console.log(`${total} slides and deck.pdf in ${out}`);
} finally {
  await browser.close();
}

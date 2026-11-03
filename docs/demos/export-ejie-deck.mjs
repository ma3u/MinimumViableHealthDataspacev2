// Renders the EJIE web deck (ui/public/presentations/euskadi-ejie-2026/) for the files
// that leave the browser: one JPEG per slide with every build shown, a vector PDF with
// one page per slide (deck.pdf), and the same PDF set in Arial with the cover photo
// cropped (editable.pdf), which build-ejie-deck.py turns into an editable PowerPoint
// through LibreOffice. The web deck stays the only source.
//
//     node docs/demos/export-ejie-deck.mjs <out-dir> [en|es]
//
// Needs the UI's dev dependencies (Playwright and its Chromium): cd ui && npm ci.
import { createRequire } from "node:module";
import { mkdirSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const require = createRequire(path.join(root, "ui/package.json"));
const { chromium } = require("@playwright/test");

const out = path.resolve(process.argv[2] ?? path.join(here, "ejie-export"));
mkdirSync(out, { recursive: true });
const lang = process.argv[3] ?? "en";
// The deck fetches its Spanish text, which file:// does not allow, so ui/public is served here.
const pub = path.join(root, "ui/public");
const TYPES = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
};
const server = createServer((req, res) => {
  const file = path.join(
    pub,
    decodeURIComponent(new URL(req.url, "http://x").pathname),
  );
  let body;
  try {
    if (!file.startsWith(pub)) throw new Error("outside");
    body = readFileSync(file);
  } catch {
    return res.writeHead(404).end();
  }
  res.writeHead(200, {
    "Content-Type": TYPES[path.extname(file)] ?? "application/octet-stream",
  });
  res.end(body);
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const deck = `http://127.0.0.1:${
  server.address().port
}/presentations/euskadi-ejie-2026/index.html`;
// The narration buttons and subtitles belong to the browser, not to a printed slide.
const HIDE =
  ".narration, #subtitle, .reveal .controls, .reveal .progress, .reveal .slide-number { display: none !important; }";

const browser = await chromium.launch();
try {
  const page = await browser.newPage({
    viewport: { width: 1920, height: 1080 },
  });
  await page.goto(`${deck}?lang=${lang}`, { waitUntil: "networkidle" });
  await page.waitForFunction(() => Reveal.isReady());
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
  await print.goto(`${deck}?print-pdf&lang=${lang}`, {
    waitUntil: "networkidle",
  });
  await print.waitForFunction(() => Reveal.isReady());
  await print.addStyleTag({ content: HIDE });
  await print.evaluate(() => document.fonts.ready);
  await print.waitForTimeout(2500);
  await print.pdf({
    path: path.join(out, "deck.pdf"),
    width: "1920px",
    height: "1080px",
    printBackground: true,
  });

  // The editable copy: PowerPoint on another machine has Arial but not DM Sans or Sora,
  // and LibreOffice's PDF import drops the clip that object-fit: cover makes, so the
  // cover photo is cropped to its box first.
  await print.addStyleTag({
    content:
      "* { font-family: Arial, Helvetica, sans-serif !important; letter-spacing: 0 !important; }",
  });
  await print.evaluate(async () => {
    for (const img of document.querySelectorAll(".reveal img")) {
      const w = img.offsetWidth,
        h = img.offsetHeight;
      if (!w || !h || getComputedStyle(img).objectFit !== "cover") continue;
      const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight);
      const sw = w / scale,
        sh = h / scale;
      const c = document.createElement("canvas");
      c.width = w * 2;
      c.height = h * 2;
      c.getContext("2d").drawImage(
        img,
        (img.naturalWidth - sw) / 2,
        (img.naturalHeight - sh) / 2,
        sw,
        sh,
        0,
        0,
        c.width,
        c.height,
      );
      img.src = c.toDataURL("image/jpeg", 0.9);
      img.style.objectFit = "fill";
      await img.decode();
    }
  });
  await print.waitForTimeout(1000);
  await print.pdf({
    path: path.join(out, "editable.pdf"),
    width: "1920px",
    height: "1080px",
    printBackground: true,
  });
  console.log(`${total} slides, deck.pdf and editable.pdf in ${out}`);
} finally {
  await browser.close();
  server.close();
}

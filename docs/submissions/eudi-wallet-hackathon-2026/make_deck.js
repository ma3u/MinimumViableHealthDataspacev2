// Renders deck.json -> deck.html + EUDI-Consent-Wallet-Pitch.pdf (16:9 landscape slides).
// Content-agnostic: edit deck.json, then re-run.
// Usage (from repo root):  NODE_PATH=ui/node_modules node docs/submissions/eudi-wallet-hackathon-2026/make_deck.js
const fs = require("fs");
const path = require("path");
// Resolve the repo's ui Playwright deterministically (a stray parent-level
// node_modules/playwright would otherwise win over NODE_PATH and demand an
// uninstalled browser revision).
const { chromium } = require(
  path.join(__dirname, "../../../ui/node_modules/playwright"),
);

const dir = __dirname;
const deck = JSON.parse(fs.readFileSync(path.join(dir, "deck.json"), "utf8"));

const esc = (s) =>
  String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

// Layer accent colors (graph-constants.ts) used as a thin 5-stop spine.
const LAYERS = ["#2471A3", "#148F77", "#1E8449", "#CA6F1E", "#7D3C98"];

const visualPanel = (slide) => {
  if (slide.image) {
    return `<div class="visual"><img src="img/${esc(slide.image)}" alt="${esc(
      slide.visual,
    )}"/>
      <div class="caption">${esc(slide.visual)}</div></div>`;
  }
  return `<div class="visual placeholder"><div class="vlabel">VISUAL</div>
    <div class="vtext">${esc(slide.visual)}</div></div>`;
};

const titleSlide = (slide) => `
  <section class="slide title">
    <div class="spine">${LAYERS.map(
      (c) => `<span style="background:${c}"></span>`,
    ).join("")}</div>
    <div class="badge">EUDI Wallet Hackathon 2026 &middot; Creative Use Cases &mdash; Health</div>
    <h1>${esc(deck.title)}</h1>
    <p class="subtitle">${esc(deck.subtitle || slide.title)}</p>
    <p class="tagline">&ldquo;${esc(deck.tagline)}&rdquo;</p>
    <div class="footer">EHDS &middot; eIDAS 2.0 &middot; OpenID4VCI / 4VP &middot; SD-JWT VC</div>
  </section>`;

const contentSlide = (slide, isClosing) => `
  <section class="slide ${isClosing ? "closing" : ""}">
    <div class="spine">${LAYERS.map(
      (c) => `<span style="background:${c}"></span>`,
    ).join("")}</div>
    <header><span class="num">${esc(slide.n)}</span><h2>${esc(
      slide.title,
    )}</h2></header>
    <div class="body">
      <ul>${(slide.bullets || [])
        .map((b) => `<li>${esc(b)}</li>`)
        .join("")}</ul>
      ${visualPanel(slide)}
    </div>
    <div class="footnote">Consent Wallet for the European Health Data Space &middot; synthetic data &middot; fictional orgs</div>
  </section>`;

const slidesHtml = deck.slides
  .map((s, i) =>
    s.kind === "title" || (i === 0 && !s.kind)
      ? titleSlide(s)
      : contentSlide(s, s.kind === "closing"),
  )
  .join("\n");

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"/>
<style>
  @page { size: 1280px 720px; margin: 0; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  html, body { margin: 0; padding: 0; font-family: -apple-system, "Segoe UI", Helvetica, Arial, sans-serif; color: #0f1b2d; }
  .slide { position: relative; width: 1280px; height: 720px; padding: 64px 72px 56px; page-break-after: always; overflow: hidden; background: #ffffff; }
  .spine { position: absolute; top: 0; left: 0; width: 100%; height: 8px; display: flex; }
  .spine span { flex: 1; }
  /* Title */
  .slide.title { background: radial-gradient(120% 120% at 0% 0%, #0b3d66 0%, #06223b 60%, #04182a 100%); color: #fff; display: flex; flex-direction: column; justify-content: center; }
  .slide.title .badge { position: absolute; top: 48px; left: 72px; font-size: 20px; letter-spacing: .04em; color: #7fd1c1; text-transform: uppercase; font-weight: 600; }
  .slide.title h1 { font-size: 76px; line-height: 1.04; margin: 0 0 18px; font-weight: 800; max-width: 1050px; letter-spacing: -.01em; }
  .slide.title .subtitle { font-size: 30px; color: #cfe3f2; margin: 0 0 30px; max-width: 1000px; }
  .slide.title .tagline { font-size: 34px; color: #ffd479; font-weight: 600; margin: 0; max-width: 1050px; }
  .slide.title .footer { position: absolute; bottom: 44px; left: 72px; font-size: 19px; color: #8fb3cf; letter-spacing: .03em; }
  /* Content */
  .slide header { display: flex; align-items: baseline; gap: 18px; border-bottom: 3px solid #e6edf4; padding-bottom: 16px; margin-bottom: 26px; }
  .slide .num { font-size: 28px; font-weight: 800; color: #148F77; min-width: 44px; }
  .slide h2 { font-size: 42px; margin: 0; font-weight: 800; color: #0b3d66; letter-spacing: -.01em; }
  .slide .body { display: grid; grid-template-columns: 1.05fr 0.95fr; gap: 40px; height: 478px; align-content: start; }
  .slide ul { margin: 2px 0 0; padding: 0; list-style: none; align-self: start; }
  .slide li { font-size: 23px; line-height: 1.36; margin: 0 0 15px; padding-left: 32px; position: relative; color: #1c2c40; }
  .slide li::before { content: ""; position: absolute; left: 0; top: 10px; width: 15px; height: 15px; border-radius: 4px; background: #148F77; }
  .visual { border-radius: 14px; overflow: hidden; display: flex; flex-direction: column; background: #f4f8fb; border: 1px solid #dbe6f0; }
  .visual img { width: 100%; height: 100%; object-fit: cover; object-position: top center; }
  .visual .caption { font-size: 16px; color: #51657c; padding: 10px 14px; background: #eef4f9; border-top: 1px solid #dbe6f0; }
  .visual.placeholder { align-items: center; justify-content: center; text-align: center; padding: 28px; background: repeating-linear-gradient(135deg,#f1f6fb,#f1f6fb 14px,#eaf2f8 14px,#eaf2f8 28px); }
  .visual .vlabel { font-size: 14px; letter-spacing: .18em; color: #9bb0c6; font-weight: 700; margin-bottom: 10px; }
  .visual .vtext { font-size: 17px; color: #3a516b; line-height: 1.4; }
  .slide.closing { background: linear-gradient(120% 120% at 100% 100%, #f0f7f4 0%, #ffffff 55%); }
  .footnote { position: absolute; bottom: 30px; left: 72px; font-size: 15px; color: #9aa9bb; }
</style></head><body>
${slidesHtml}
</body></html>`;

fs.writeFileSync(path.join(dir, "deck.html"), html);

(async () => {
  const out = path.join(dir, "EUDI-Consent-Wallet-Pitch.pdf");
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto("file://" + path.join(dir, "deck.html"), {
    waitUntil: "networkidle",
  });
  await page.pdf({
    path: out,
    width: "1280px",
    height: "720px",
    printBackground: true,
    pageRanges: "",
    margin: { top: "0", bottom: "0", left: "0", right: "0" },
  });
  await browser.close();
  console.log(
    "Deck PDF written to",
    out,
    "(" + deck.slides.length + " slides)",
  );
})();

// Checks that the EJIE web deck's Spanish translation (ui/public/presentations/
// euskadi-ejie-2026/i18n/es.json) covers every text element of the English slides, and
// holds nothing the slides no longer say. The deck looks each element up by its English
// HTML (deckTextUnits and deckKey in index.html), so an edited English sentence needs
// its Spanish entry edited too, or the Spanish deck shows it in English.
//
//     node docs/demos/check-ejie-i18n.mjs              # exit 1 on a missing or stale entry
//     node docs/demos/check-ejie-i18n.mjs --dump keys.json   # also write every key
//
// Needs the UI's dev dependencies (Playwright and its Chromium): cd ui && npm ci.
import { createRequire } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const require = createRequire(path.join(root, "ui/package.json"));
const { chromium } = require("@playwright/test");

const pub = path.join(root, "ui/public");
const dir = path.join(pub, "presentations/euskadi-ejie-2026");
const es = JSON.parse(readFileSync(path.join(dir, "i18n/es.json"), "utf8"));

// The deck fetches its translation, which file:// does not allow, so ui/public is served here.
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
  if (!file.startsWith(pub)) return res.writeHead(403).end();
  let body;
  try {
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

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.goto(deck + "?lang=en", { waitUntil: "load" });
  const keys = await page.evaluate(() =>
    window
      .deckTextUnits(document.querySelector(".reveal .slides"))
      .map(window.deckKey),
  );
  const dump = process.argv.indexOf("--dump");
  if (dump > 0)
    writeFileSync(
      process.argv[dump + 1],
      JSON.stringify([...new Set(keys)], null, 1),
    );

  await page.goto(deck + "?lang=es", { waitUntil: "load" });
  await page.waitForFunction(() => window.deckI18nMissing !== undefined);
  const missing = await page.evaluate(() => window.deckI18nMissing);
  const stale = Object.keys(es).filter((k) => !keys.includes(k));
  for (const k of missing) console.log("missing:", k);
  for (const k of stale) console.log("stale:  ", k);
  console.log(
    `${new Set(keys).size} text elements, ${missing.length} missing, ${
      stale.length
    } stale`,
  );
  process.exitCode = missing.length || stale.length ? 1 : 0;
  await page.evaluate(() => localStorage.removeItem("ejie-deck-lang"));
} finally {
  await browser.close();
  server.close();
}

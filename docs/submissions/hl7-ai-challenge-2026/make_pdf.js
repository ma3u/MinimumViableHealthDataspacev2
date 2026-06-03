// Regenerates the HL7 AI Challenge submission PDF from submission.html.
// Usage (from repo root):  NODE_PATH=ui/node_modules node docs/submissions/hl7-ai-challenge-2026/make_pdf.js
const path = require("path");
const { chromium } = require("playwright");

(async () => {
  const dir = __dirname;
  const out = path.join(dir, "HL7-AI-Challenge-2026-EHDS-Platform.pdf");
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto("file://" + path.join(dir, "submission.html"), {
    waitUntil: "networkidle",
  });
  await page.pdf({
    path: out,
    format: "A4",
    printBackground: true,
    margin: { top: "14mm", bottom: "14mm", left: "14mm", right: "14mm" },
  });
  await browser.close();
  console.log("PDF written to", out);
})();

# HL7 AI Challenge 2026 — Submission Materials

Submission package for the **2026 HL7 AI Challenge** (https://info.hl7.org/ai-challenge).
Tracked in **issue #66**.

- **Title:** FHIR-Grounded, Governed AI for the European Health Data Space
- **Deadline:** 30 June 2026 · **Entry form:** https://1ag54.share.hsforms.com/29QP4fNVDROyNOrcXTQxsfg
- **Team:** Minimum Viable Health Dataspace (MVHD) — Matthias Buchhorn (@ma3u)

## Files

| File                                      | Purpose                                                             |
| ----------------------------------------- | ------------------------------------------------------------------- |
| `submission.html`                         | The source document (edit this).                                    |
| `HL7-AI-Challenge-2026-EHDS-Platform.pdf` | The generated 4-page PDF uploaded to the challenge (≤10 pages).     |
| `make_pdf.js`                             | Regenerates the PDF from `submission.html` via Playwright/Chromium. |

## Regenerate the PDF

Playwright (Chromium) is already installed under `ui/`. From the repo root:

```bash
NODE_PATH=ui/node_modules node docs/submissions/hl7-ai-challenge-2026/make_pdf.js
```

The PDF is written next to the script. Keep it **≤10 pages** — the challenge does not
evaluate pages beyond the tenth.

## Notes

- Figures in the document are drawn from this repository and marked approximate; verify
  against the current build before each submission.
- Readiness is stated as **prototype on synthetic data** (no real-world clinical deployment).
- The PDF covers the challenge's three evaluation areas: Innovation & Impact, Technical
  Solution, and Contextual Factors.

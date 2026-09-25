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
| `blog-article.md`                         | Guest article for the HL7 blog (Winners Showcase, Oct 2026, #252).  |

## Regenerate the PDF

Playwright (Chromium) is already installed under `ui/`. From the repo root:

```bash
NODE_PATH=ui/node_modules node docs/submissions/hl7-ai-challenge-2026/make_pdf.js
```

The PDF is written next to the script. Keep it **≤10 pages** — the challenge does not
evaluate pages beyond the tenth.

## Regenerate the animations

`img/ehds-researcher-journey.gif` (also shown in the deck under
`ui/public/presentations/hl7-showcase-2026/img/`) is recorded on the live platform as the
researcher persona: the overview the login lands on, dataset discovery, the negotiation
history, the OMOP analytics. From `ui/`:

```bash
PLAYWRIGHT_BASE_URL=https://ehds.mabu.red OUT=/tmp/researcher npx tsx scripts/record-researcher-journey.ts
python3 scripts/frames-to-gif.py /tmp/researcher ../docs/submissions/hl7-ai-challenge-2026/img/ehds-researcher-journey.gif
cp ../docs/submissions/hl7-ai-challenge-2026/img/ehds-researcher-journey.gif public/presentations/hl7-showcase-2026/img/
```

The person's journey on the platform, shown in the deck under the person's swimlane, is
recorded the same way as the patient persona: the overview the login lands on, the own
record, the research programmes with their consents, the findings that came back.

```bash
PLAYWRIGHT_BASE_URL=https://ehds.mabu.red OUT=/tmp/patient npx tsx scripts/record-patient-journey.ts
python3 scripts/frames-to-gif.py /tmp/patient public/presentations/hl7-showcase-2026/img/ehds-patient-journey.gif
```

The frames are screenshots taken at chosen moments, so loading time never ends up in the
animation; about 57 frames, 22 seconds, under 2 MB. `img/klarbefund-tour.gif` is built
from the app screenshots in `docs/klarbefund/img/` (fictional dev dataset).

## Notes

- Figures in the document are drawn from this repository and marked approximate; verify
  against the current build before each submission.
- Readiness is stated as **prototype on synthetic data** (no real-world clinical deployment).
- The PDF covers the challenge's three evaluation areas: Innovation & Impact, Technical
  Solution, and Contextual Factors.

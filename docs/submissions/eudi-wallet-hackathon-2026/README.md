# EUDI Wallet Hackathon 2026 — pitch: Consent Wallet for the EHDS

Pitch deck + speaker notes for the **use-case track** of the EUDI Wallet Hackathon.
This is a **pitch**, not a wallet build — see issue
[#72](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/72)
(use case) and [#22](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/22)
(the implementation that backs the live demo).

## The use case

The EUDI Wallet as the citizen's **verifiable, withdrawable channel to exercise their
EHDS secondary-use rights** — opt out by default, consent where the law requires — with
every researcher access gated by that choice. No central consent/opt-out registry.

## Files

| File                            | What                                                                                                         |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `EUDI-Consent-Wallet-Pitch.pdf` | The deck (9 × 16:9 landscape slides) — **the deliverable**                                                   |
| `deck.json`                     | Slide content (title, bullets, visual, speaker notes) — edit this, then regenerate                           |
| `make_deck.js`                  | Content-agnostic renderer: `deck.json` → `deck.html` → PDF (Chromium)                                        |
| `deck.html`                     | Generated HTML deck (viewable in a browser; references `img/`)                                               |
| `speaker-notes.md`              | 3-minute timing plan, per-slide notes, **Q&A defense crib**, real-vs-roadmap table                           |
| `img/`                          | Real product screenshots: `governance.png` (HDAB/EHDS approval chain), `graph.png` (5-layer graph), `ai.png` |

## Regenerate the PDF

```bash
# from repo root
node docs/submissions/eudi-wallet-hackathon-2026/make_deck.js
```

Uses the repo's `ui` Playwright/Chromium (resolved by path inside the script). If Chromium is
missing: `cd ui && npx playwright install chromium`.

## Visual-direction placeholders

Slides 2, 3, 6, 7, 8 carry **visual-direction placeholders** (the `visual` field, rendered as a
hatched box) describing the diagram/graphic to drop in — the regulation-gap diagram, the wallet
card with claim chips, the article-to-feature map, the closing freeze-frame, and the roadmap
lanes. Slides 1, 4, 5 already embed real screenshots. Replace the placeholders with final
graphics before the live pitch, or present as-is (they read as a clean storyboard).

## Provenance & accuracy

Drafted via a multi-agent workflow (3 framings → 4-persona jury → synthesis → adversarial
fact-check). The fact-check caught and corrected a material legal error: **EHDS Chapter IV
secondary use is permit-based + opt-out, not GDPR Art. 9(2)(a) opt-in consent** — the wallet
_exercises_ the citizen's opt-out/consent right, it is not the legal basis. Revocation is honestly
framed as an auditable access-boundary re-check (cryptographic status-list is roadmap). See
`speaker-notes.md` → "Q&A defense crib" for the defensible position on every claim.

All data synthetic; all organisations fictional (AlphaKlinik Berlin, PharmaCo Research AG,
MedReg DE).

# Demo material

Everything for showing the demonstrator to a ministry or an access body. Four
decks, two guides, four generators, and one narrated web presentation.

## Decks

| File                                                             | Slides | When to use it                                                                                                                                                                                                                   |
| ---------------------------------------------------------------- | -----: | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`spain-ehds-5-slides.pptx`](spain-ehds-5-slides.pptx)           |  **5** | A short slot, or leaving something behind. **Secondary use**: the problem, what the Regulation puts in place, the demonstrated journey, the proposed operating model, the ask.                                                   |
| [`spain-ehds-ministry-deck.pptx`](spain-ehds-ministry-deck.pptx) | **24** | The full story, primary and secondary use: personas, the federated architecture, integration, outcomes, roadmap, and five closing slides on who operates it.                                                                     |
| [`basque-ehds-15min.pptx`](basque-ehds-15min.pptx)               | **11** | 15 minutes for the Basque Government's Department of Health. Answers its eight questions in order: challenges, lessons, decision criteria, architecture, maturity, governance, costs, team. Simple English, timed speaker notes. |
| [`euskadi-ejie-2026.pptx`](euskadi-ejie-2026.pptx)               | **16** | Fallback for the EJIE preparation meeting: the Basque deck plus a Spanish title, the Euskadi pilot in four slides and a LinkedIn QR slide. Fades, auto-builds and click-builds, source links clickable.                          |

The five-slide deck is not a subset of the long one. It is a separate file built
by a generator, so the long deck is never edited to produce it and nothing gets
lost either way. It also has a narrower subject: **secondary use**, seventeen
regional datasets becoming one research resource. Primary use is the long deck's
ground.

Its illustrations are deliberately large. The header is compressed to about
1.4in so each image gets the remaining height, and the operating-model diagram
on slide 4 is the wide 2.3:1 rendering,
[`ehds-operating-model-wide.svg`](../diagrams/ehds-operating-model-wide.svg),
rather than the 1.3:1 original, which on a 16:9 slide can only be shown at half
width and is then unreadable from the back of a room. The 1.3:1 version stays
the right one for a document or an issue, where height is free.

| Generator                                                        | What it does                                                                                                                                            |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`build-5-slide-deck.py`](build-5-slide-deck.py)                 | Builds the five-slide deck from scratch. Safe to re-run; it overwrites its own output.                                                                  |
| [`add-operating-model-slides.py`](add-operating-model-slides.py) | Inserted the five closing slides into the long deck. One-shot, and refuses to run twice.                                                                |
| [`build-basque-deck.py`](build-basque-deck.py)                   | Builds the Basque deck from scratch. Takes the Basque Country photo from the long deck and the layer diagram from `../diagrams/ehds-layers-simple.png`. |
| [`build-ejie-deck.py`](build-ejie-deck.py)                       | Builds the EJIE fallback. Reuses the Basque deck's slides and writes the animation and transition XML that python-pptx cannot.                          |

Both reproduce the long deck's house style, which was read back out of its
existing slides rather than invented: navy rule across the top, 30pt bold navy
title, 16pt grey standfirst, cream cards with a coloured header bar, and the
five accents `143D59` `2A9D8F` `E6A817` `C31E2E` `528B55`. The five-slide deck
also reuses the long deck's own title image, extracted at build time so there is
no second copy of it in the repository.

To preview either without opening PowerPoint:

```bash
soffice --headless --convert-to pdf --outdir /tmp docs/demos/spain-ehds-5-slides.pptx
```

## Narrated web presentation

[`ui/public/presentations/euskadi-ejie-2026/`](../../ui/public/presentations/euskadi-ejie-2026/index.html),
served at
[ma3u.github.io/MinimumViableHealthDataspacev2/presentations/euskadi-ejie-2026/](https://ma3u.github.io/MinimumViableHealthDataspacev2/presentations/euskadi-ejie-2026/)
and [ehds.mabu.red/presentations/euskadi-ejie-2026/](https://ehds.mabu.red/presentations/euskadi-ejie-2026/).
The same 16 slides in reveal.js. **Narración** (or the N key) plays a Spanish
narration in the presenter's cloned voice, shows Basque subtitles (C toggles
them), reveals each slide's builds as the sentence that names them is spoken,
and moves on by itself. Off, it is an ordinary click-through deck.

ElevenLabs has no Basque voice, so Basque is the subtitle language. The text of
both is in `narration-source.json`, one sentence per cue; the Basque is a
machine translation and needs a native proofread.
`python3 scripts/narrate-euskadi-deck.py [slide-id …]` regenerates the audio,
`subtitles/*.eu.vtt` and the cue times in `narration.json`.

## Guides

| File                                                                         | What it is                                                                                                           |
| ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| [`hdab-spain-secondary-use-journey.md`](hdab-spain-secondary-use-journey.md) | The journey step by step. One pasteable link per step, live and static, what to say at each, and the fallback table. |
| [`hdab-spain-30min-guide.md`](hdab-spain-30min-guide.md)                     | The control-surface walkthrough: pre-flight checklist, seven timed sections, persona credentials, Q&A.               |

## The argument behind the slides

- [`../ehds-operating-company.md`](../ehds-operating-company.md): what an
  operating company for the EHDS would be allowed to do, and why Art. 62 caps
  the business model.
- [`../diagrams/ehds-operating-model.svg`](../diagrams/ehds-operating-model.svg):
  the diagram on slide 3, with its generator beside it.
- [`../spe-contrast-migration.md`](../spe-contrast-migration.md): how the secure
  processing environment moves to hardware attestation, step by step.
- [`../ehds-article-numbering.md`](../ehds-article-numbering.md): the slides use
  the adopted article numbers. Much of this repository still uses the 2022
  proposal numbers. This maps them.

## Before a demo

```bash
./scripts/azure/restore-keycloak-realm.sh --check     # is the realm still there
cd ui && PLAYWRIGHT_BASE_URL=https://ehds.mabu.red KEYCLOAK_PUBLIC_URL=https://auth.ehds.mabu.red \
  npx playwright test 18-user-login-roles.spec.ts --project=chromium    # expect 21 passed
cd ui && NEXT_PUBLIC_STATIC_EXPORT=true PLAYWRIGHT_BASE_URL=https://ma3u.github.io \
  npx playwright test 37-ehds-secondary-use-journey.spec.ts --project=chromium  # expect 22 passed
```

# Demo material

Everything for showing the demonstrator to a ministry or an access body. Two
decks, two guides, two generators.

## Decks

| File                                                             | Slides | When to use it                                                                                                                                               |
| ---------------------------------------------------------------- | -----: | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [`spain-ehds-5-slides.pptx`](spain-ehds-5-slides.pptx)           |  **5** | A short slot, or leaving something behind. **Primary use**: the problem, the citizen's rights, what already runs, the proposed operating model, the ask.     |
| [`spain-ehds-ministry-deck.pptx`](spain-ehds-ministry-deck.pptx) | **24** | The full story, primary and secondary use: personas, the federated architecture, integration, outcomes, roadmap, and five closing slides on who operates it. |

The five-slide deck is not a subset of the long one. It is a separate file built
by a generator, so the long deck is never edited to produce it and nothing gets
lost either way. It also has a narrower subject: **primary use**, a record that
follows the citizen. Secondary use, permits and secure processing are the long
deck's ground, and issue #27's.

Its illustrations are deliberately large. The header is compressed to about
1.4in so each image gets the remaining height, and the operating-model diagram
on slide 4 is the wide 2.3:1 rendering,
[`ehds-operating-model-primary.svg`](../diagrams/ehds-operating-model-primary.svg),
rather than the 1.3:1 secondary-use one, which on a 16:9 slide can only be shown
at half width and is then unreadable from the back of a room.

| Generator                                                        | What it does                                                                             |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| [`build-5-slide-deck.py`](build-5-slide-deck.py)                 | Builds the five-slide deck from scratch. Safe to re-run; it overwrites its own output.   |
| [`add-operating-model-slides.py`](add-operating-model-slides.py) | Inserted the five closing slides into the long deck. One-shot, and refuses to run twice. |

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

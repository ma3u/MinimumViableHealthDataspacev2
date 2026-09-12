---
title: "Longevity communities as the CVD data-sharing analogue (deferred)"
status: future
owner: ma3u
updated: 2026-09-12
issues:
  - https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/182
supersedes-scope-of: ../../persona-journeys/registration-identification-exchange.md
---

# Longevity communities as the CVD data-sharing analogue

**Deferred 2026-09-12.** The patient-community journey (S3 in the actor map) is out of current
scope. This file keeps the research that motivated it, because the underlying observation is
sound and the journey is worth building later — just not before the ePA ingest path (W9).

## The finding that deferred it

There is **no cardiovascular equivalent of Fox Insight** — no large, patient-governed,
longitudinal cohort where people with ordinary cardiovascular risk pool data and researchers
query it. What exists splits three ways, and none of them is the thing:

|                                                                                            | What it is                                               | Why it is not the analogue                                        |
| ------------------------------------------------------------------------------------------ | -------------------------------------------------------- | ----------------------------------------------------------------- |
| Deutsche Herzstiftung (90k+ members), DZHK/TORCH, GARY, Nationale Herz-Allianz             | Patient organisation attached to academic registries     | Data flows to institutions, not between members                   |
| Health eHeart (UCSF, target 1M), Apple Health Study (to 2030)                              | Large online cohorts with wearables                      | Academic-owned; participants contribute, they do not govern       |
| FH Europe (24 orgs / 23 countries), Family Heart Foundation + CASCADE FH (6,000+ enrolled) | Genuinely patient-founded, event-driven, registry-backed | Scoped to **genetic** high risk (FH, Lp(a)), not general CVD risk |

The Family Heart Foundation is the closest real counter-example to "there are no associations":
founded by a patient after a missed FH/Lp(a) diagnosis at 39, it runs the CASCADE FH registry,
an annual global summit and National FH Awareness Day. It is patient-driven and data-backed —
but it serves people with a _diagnosable genetic condition_, which is exactly the boundary.

The EAS **FHSC** global registry (84 clinical leads, 70 countries) shows the friction that
defines the gap: **its data cannot be shared with third parties** because of clauses in the
agreements with the data suppliers. The Parkinson's community engineered that away —
Fox Insight's 54,000 participants feed **Fox DEN**, where researchers query and download under
a data-use agreement. That is a governance choice, not a technical one.

## Where the behaviour actually lives: longevity communities

People with ordinary cardiovascular risk _are_ already pooling data — outside the medical
system, under no registry governance at all:

- **Rejuvenation Olympics** — a public leaderboard ranking ~5,700 people by DunedinPACE pace
  of ageing from TruDiagnostic epigenetic tests. Participants publish a biomarker, compare,
  and describe their protocols. The explicit framing is open-sourcing methods.
- **Blueprint / "Don't Die"** — protocol published in full, biomarker panels published,
  a community reproducing and reporting back.
- **DeSci DAOs** — ~50 active initiatives as of early 2026. **VitaDAO** (longevity, $10M+
  deployed, Pfizer Ventures among backers) and **HairDAO** are community-governed research
  funders; **Hippocrat** builds patient-owned health-data networks. **Open Humans** remains
  the reference design for participant-controlled data sharing (genetics, wearables,
  self-tracking), published in GigaScience.

What this cohort has that the CVD registries do not: members treat **fast feedback within
their own lifetime** as the point, and they already accept public or semi-public data sharing
to get it. What they lack: provenance, clinical-grade measurement, and any governance a
research institute can accept.

**That gap is the product opportunity** — and it is the same one the actor map describes for
the patient community (S3): consent-scoped, verifiable contribution where the cohort _is_ the
set of valid consents. The difference from the deferred plan is the entry point: not a
disease association, but a self-tracking community that already has the data and no
credible way to donate it.

## What to revisit when this comes back

- S3's registry journey in
  [`registration-identification-exchange.md`](../../persona-journeys/registration-identification-exchange.md)
  is written and still correct; only its priority changed.
- Add the provenance question these communities cannot answer today: a self-reported
  biomarker and a lab-issued one must be distinguishable in the graph, the way the ePA
  distinguishes a document a practice uploaded from one the insured uploaded.
- Check whether MIO Laborbefund (FHIR, manufacturer-mandatory expected autumn 2026) has
  become the interchange format by then; if so, a community registry can accept structured
  labs rather than PDFs.

## Sources

Fox Insight (Nature Sci Data 2020; 5-year cohort paper 2024) · Fox DEN · Health eHeart (UCSF) ·
Apple Health Study NCT06958523 · Deutsche Herzstiftung · DZHK/TORCH · FH Europe ·
Family Heart Foundation / CASCADE FH · EAS FHSC (Lancet 2021) · Rejuvenation Olympics ·
VitaDAO · Hippocrat · Open Humans (GigaScience 2019). URLs in the session record and in the
issue thread — this file is a planning note, not a citation-grade review.

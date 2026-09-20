# ADR-039: Published reference ranges are quoted alongside the printed one, never in place of it

**Status:** Proposed
**Date:** 2026-09-19
**Relates to:** [ADR-033](ADR-033-lab-report-extraction-pipeline.md), [ADR-038](ADR-038-scan-retained-diagnostics-export.md)
**Tracks:** [#186](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/186)

## Context

Longevity sites publish tables of "optimal" biomarker ranges next to
"official" ones. The one this was modelled on lists nine cardiovascular
markers with an optimal and an official column and attributes them to
"cutting-edge longevity research and expert recommendations". **No source is
given for any number on the page**, so a reader cannot check one, and neither
can a doctor being shown it.

Two constraints already decided pull against each other here.

ADR-033 rule 1 says never normalise away the printed reference range: it is
assay- and population-specific, and a standardised value may sit beside it,
never instead of it.

Section 5 of #186 says the two features that risk making this a regulated
device under IVDR are **flagging out-of-range values** and **plain-language
explanation of results**, and that qualification turns almost entirely on the
stated intended purpose. The decision recorded there was to stay out:
"Reference ranges shown as the lab printed them, not as app-generated
judgements."

A second range on screen is therefore not a small feature. Done carelessly it
is interpretation, and it is interpretation of in-vitro measurements, which is
the IVDR side of MDCG 2019-11.

## Decision

Published ranges are shown, and the following five rules keep them on the
right side of the line.

1. **Every range is quoted from a named, citable source, with a link.** An
   analyte with no source has no entry, and there are 31 ranges across 17
   analytes rather than a complete-looking table. The sources are ESC/EAS
   2019, the EAS Lp(a) consensus 2022, AHA/CDC 2003, ADA 2025, KDIGO 2024,
   Prati 2002, Refsum 2004, Holick 2011, and two WHO guidelines. Each was
   verified against its own record before being written down.

2. **The printed range stays primary.** On a report the laboratory's own range
   is what is shown against the value, in the position it always occupied; the
   published band is a second, smaller line underneath, labelled and sourced.
   The trend screen names both.

3. **Two columns, and neither is "normal".** `guideline` is the threshold the
   body states for the general adult population. `optimal` is the lowest-risk
   band the same source names. Where a guideline is risk-tiered, as the lipid
   targets are, the tiers are quoted verbatim and the summary says plainly
   that which tier applies is a clinical decision.

4. **Placement is a comparison, never a finding.** The four outcomes are
   `withinOptimal`, `outsideOptimal`, `outsideGuideline` and `noRange`. The
   words "normal", "abnormal", "good", "high" and "low" do not appear, and
   there is no score, no risk estimate and no advice. The reminder to consult
   a doctor sits on both new screens.

5. **A range belongs to a unit, and to a sex when the source says so.** Lp(a)
   in mg/dL and in nmol/L are different LOINC codes with different thresholds,
   so each unit carries its own range and neither answers for the other. Sex
   specific ranges apply only once the person has said which applies; until
   then they are not shown at all, because a man's haemoglobin threshold
   beside a woman's value is worse than no threshold.

The table lives in `services/epa-ingest/src/reference-ranges.ts` and the Swift
copy is generated from it, like the analyte dictionary and for the same reason.
The generator validates before it emits: a range whose analyte the dictionary
does not know, or whose unit that analyte is not defined in, fails the build.

## Consequences

- The app can answer "what does a published guideline say about this number"
  without answering "is this number bad", which is the question it must not
  answer.
- Trends become possible and meaningful: the same LOINC code across dates,
  each point keeping its own provenance and printed range, with the published
  band drawn behind. A transcribed point is drawn differently from a
  laboratory-issued one, because they are not the same evidence.
- Coverage is visibly partial, and that is the honest result of requiring a
  source. Sixty-eight analytes are coded; seventeen have a published range.
- The intended purpose stated in #186 section 5 is unchanged, and this ADR is
  the record of why the feature does not change it. If a future version adds
  scoring, risk estimation or advice, that is a different decision and a
  different regulatory position, and it needs its own ADR.

## Postscript, 2026-09-20: colour, and a profile

Two changes that touch the line this ADR draws, both asked for by the platform
owner after seeing the screens.

**A profile.** Sex, date of birth and height, sealed in the store rather than
kept in `UserDefaults`, because a date of birth with a height is closer to
identifying a person than a preference is. Each field exists because a
published range needs it: haemoglobin, HDL, ALT and waist circumference are all
sex-specific, and a waist reading means little without a height. It never
leaves the device, and it is not part of the analysis request.

Body measurements entered there (waist, weight, visceral fat area) become an
ordinary report with `self-tracked` provenance, so they reach the timeline, the
document for a doctor and the OMOP tables through the same path as a
laboratory's values, and are never mistaken for them.

**Colour.** This ADR originally rejected colouring values, because flagging is
one of the two features §5 of #186 names as crossing into IVDR. The decision
is reversed, narrowly, and these are the guardrails that keep it on the same
side of the line:

- colour never carries meaning alone. Every coloured figure has the same
  information in words beside it and a distinct symbol, which is also what
  makes it legible without hue;
- there is no red and no pass or fail. Green is the band a source calls
  lowest-risk, amber is outside it, orange is outside the guideline range, and
  none of them says normal, abnormal, good or bad;
- nothing is scored, ranked or summed. A colour restates a comparison to a
  published number and adds no judgement of its own;
- a legend states exactly that, on both screens that use colour.

What would cross the line is unchanged: a risk score, a recommendation, a
"your result is abnormal", or a colour standing where a word used to be.

## Postscript, 2026-09-20: the OMOP export follows the same rule

An OMOP CDM export was added, and it raises the same question in another
vocabulary: what do you write when you do not have the mapping? The answer is
the one this repository already gives in `fhir-to-omop-transform.cypher`:
`measurement_concept_id = 0` with the LOINC code preserved in
`measurement_source_value`. The phone has no Athena vocabulary, inventing a
concept id would put a wrong identifier on a real measurement, and a second
mapping maintained on a phone is the divergence the generated analyte table
exists to prevent.

## Alternatives considered

- **Copying a longevity site's table.** Rejected: unsourced numbers cannot be
  checked, and presenting them as the app's own would be exactly the
  app-generated judgement §5 rules out.
- **Colouring values red or green against the optimal band.** Rejected at
  first as flagging, then adopted under guardrails; see the postscript below.
- **Deriving ranges by converting units.** Rejected: the unit selects the LOINC
  code, so a converted threshold describes a different measurement. Each unit
  gets its own quoted range or none.
- **Asking for sex at first launch.** Rejected as collecting more than is
  needed up front. It is one control on the reference screen, defaulting to
  not specified.

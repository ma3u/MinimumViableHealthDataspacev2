# ADR-081: The demo record covers three of the six Art. 14 categories, and says which

Date: 2026-11-09

**Status:** Accepted (2026-11-09)
**Supersedes in part:** [ADR-059](ADR-059-the-record-holds-reports-vaccinations-and-the-medication-plan.md), the category count in its Context and Consequences; its decision stands
**Tracks:** the documentation audit of 2026-11-07 ([#946](https://github.com/ma3u/MinimumViableHealthDataspacev2/pull/946))

## Context

ADR-059 says an integrator "can pull one Bundle with four of the five Art. 14
categories from the demo hub", and puts the resting ECG under "medical images
and reports". Both are wrong against the adopted text of Regulation (EU)
2025/327:

- [Art. 14(1)](https://eur-lex.europa.eu/eli/reg/2025/327/oj/eng#014.001)
  names **six** priority categories: (a) patient summaries, (b) electronic
  prescriptions, (c) electronic dispensations, (d) medical imaging studies and
  related imaging reports, (e) medical test results, including laboratory and
  other diagnostic results and related reports, and (f) discharge reports.
- [Annex I](https://eur-lex.europa.eu/eli/reg/2025/327/oj/eng#anx_I) gives
  each one's main characteristics. Category 4, imaging, is data from
  "technologies that are used to view the human body". An ECG does not view
  the body; it is a diagnostic result with its report, category 5. The patient
  summary, category 1, includes "Vaccination/prophylaxis information" (item 6)
  and "Current and relevant past medicines" (item 12).

The Bruno request that checks the record repeated the count and was corrected
in #946. ADR-059 is accepted and is not edited, so this ADR carries the
correction.

## Decision

1. **The demo record covers three of the six categories, in part.** What
   `/api/patient/observations?include=all` returns for P1 (ADR-059, decision 3),
   mapped on Annex I:

   | Art. 14(1) | Category                                                         | In the demo record                                                                                                                                                  |
   | ---------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
   | (a)        | Patient summaries                                                | Two of its eighteen items: the vaccination record (`Immunization`, item 6) and the medication plan (`MedicationStatement`, item 12). Not a patient summary document |
   | (b)        | Electronic prescriptions                                         | No                                                                                                                                                                  |
   | (c)        | Electronic dispensations                                         | No                                                                                                                                                                  |
   | (d)        | Medical imaging studies and related imaging reports              | The imaging report (`DiagnosticReport`, section `RAD`), no images                                                                                                   |
   | (e)        | Medical test results, incl. other diagnostic results and reports | Laboratory values (`Observation`) and the resting ECG with its report (`DiagnosticReport`, section `EC`)                                                            |
   | (f)        | Discharge reports                                                | No                                                                                                                                                                  |

2. **Say "categories (a), (d) and (e), in part", never a count alone.** A
   count hides which categories are missing, and "four of five" was wrong on
   both numbers. Wherever the record's coverage is described, name the
   letters and what is missing.
3. **The ECG belongs to (e).** Where the record or its documentation groups
   results, the resting ECG goes with the test results, not with imaging.

## Consequences

- The gap is visible: e-prescriptions, e-dispensations and discharge reports
  are not in the record, and the patient summary is two items, not a summary.
  Those are the categories an integrator rehearsing against the hub cannot
  test today.
- The dates matter for a reader planning against the hub: the rights apply to
  categories (a) to (c) from 26 March 2029 and to (d) to (f) from 26 March
  2031 ([Art. 105](https://eur-lex.europa.eu/eli/reg/2025/327/oj/eng#art_105)).
  The record covers part of the first group and two of the second.
- Adding a category stays what ADR-059 set: a label, a seed and a mapper in
  `ui/src/lib/patient/record-extras.ts`.

## Alternatives considered

- **Edit ADR-059.** An accepted ADR is not edited (CLAUDE.md); its status line
  points here instead.
- **Correct only the number ("three of six").** Still hides which three, and
  the ECG would stay under imaging.

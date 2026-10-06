# ADR-057: Klarbefund sends weekly device means to the person's own EHDS record, behind a switch of its own

**Status:** Accepted (2026-10-07, Matthias Buchhorn)
**Date:** 2026-10-07
**Relates to:** [ADR-049](ADR-049-klarbefund-connects-by-device-grant.md), [ADR-054](ADR-054-klarbefund-creates-a-sandbox-account-with-app-attest.md), [ADR-033](ADR-033-lab-report-extraction-pipeline.md)
**Tracks:** [#473](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/473), [#186](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/186)

## Context

Klarbefund's Trends screen reads four series from Apple Health: resting heart
rate, heart rate variability (SDNN), steps and body weight. It shows them as
weekly means beside the person's lab values. Until now nothing read from
Health left the screen: `WearableSource.swift` says so, and #186 made it a
criterion.

The person wants these values in their own record on the hub too, next to
the lab values the app already sends (#473 phase 3), so they can analyse
them there. The record is a sandbox the app created for the person
(ADR-054); demo personas' records are synthetic and take no real values.

Device data is a different kind of data from a lab report: continuous,
collected without a visit, and revealing about daily life at fine grain.

## Decision

1. **Weekly means only.** The app sends one mean per metric and ISO week,
   exactly the points its Trends screen draws, for the period it shows (up to
   two years). It never sends a single day or a raw sample: a week is the
   finest grain that leaves the phone. Steps are the week's mean of daily
   totals (steps per day).
2. **A switch of its own,** "Send my device trends to my EHDS record", off
   until the person turns it on, apart from "Send my reports". Turning it off
   stops sending; what was sent stays in the record, as with reports, and the
   person can delete the account.
3. **Its own endpoint,** `POST /api/patient/app/wearables`, with the same gate
   as the reports: the app token from a connected phone (ADR-049) and only an
   account the app created. It accepts a FHIR R4 Bundle of Observations and
   stores only the four metrics, each with its LOINC code and UCUM unit,
   resting heart rate 40443-4 (/min), HRV SDNN 80404-7 (ms), steps per day
   41950-7 (/d) and body weight 29463-7 (kg), status `final`, a plausible
   value and an `effectivePeriod` of at most eight days. Anything else is
   answered as skipped.
4. **Each sync replaces the previous one.** The record holds the series once,
   as the phone last saw it; the values carry the provenance kind
   `device-weekly-mean` and the device names Health reports.

## Consequences

- The hub can analyse device trends next to lab values for the person who
  chose to send them; the timeline and the profile show them with their week.
- What leaves the phone is bounded by design: four metrics, weekly, from a
  closed list the hub enforces, so a later app version cannot widen it
  without a hub change and a new decision.
- `final` is right here, unlike for transcribed lab values (ADR-033): the
  value is computed from the device's own measurements, not read from paper.
- The sandbox remains a demonstrator: the data sits on a demo hub under a
  sandbox account the person can delete (ADR-054).

## Alternatives considered

- **Daily values:** finer analysis (weekday patterns), but a day's steps or
  weight says more about a person than the analysis needs.
- **Every raw sample:** tens of thousands of points, most detail and most
  exposure, and the record views would need paging.
- **The existing "Send my reports" switch:** one switch, but turning it on for
  lab reports would also send wearable data the person may not mean to share.

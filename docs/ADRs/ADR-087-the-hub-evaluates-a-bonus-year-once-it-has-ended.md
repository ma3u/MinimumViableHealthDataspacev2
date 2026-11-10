# ADR-087: The hub evaluates a bonus year once it has ended

Date: 2026-11-10

**Status:** Proposed (2026-11-10). Decision 1 is Matthias Buchhorn's choice of
2026-11-10; decisions 2 to 5 await his review.
**Relates to:** [ADR-080](ADR-080-a-bonus-programme-receives-a-yes-or-no-never-the-data.md) (decisions 2 and 3), [ADR-057](ADR-057-klarbefund-sends-weekly-device-means.md), [ADR-049](ADR-049-klarbefund-connects-by-device-grant.md)
**Tracks:** [#934](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/934), step 6

## Context

ADR-080 decided that the hub, not the insurer, works out whether a member met
a bonus programme's goal, inside the member's own record, and that the member
sees the result before anything is sent (decision 3). Steps 3 and 4 of #934
left "Send my answer" recording `goalMet: null`, status `awaiting-evaluation`.

Two facts stood in the way of computing it:

- **The year.** AlphaKasse DE's programme was "Active year bonus 2027", rule
  2027.1. On 2026-11-10 that year had not begun, and any answer before
  31 December can still change. An insurer that receives "yes" for a year in
  progress has received a guess.
- **The data.** The rule reads "active for at least 150 minutes a week on
  average and went to one check-up". The record held laboratory visits and,
  from Klarbefund, weekly means of resting heart rate, HRV, steps and weight
  (ADR-057). Nothing in minutes of activity, and no Encounter coded as a
  check-up.

## Decision

1. **Ended years only.** The hub evaluates a calendar year from 1 January of
   the next. Before that, the member's screen says the year is not over and
   when it can be evaluated; "Send my answer" is off and the transfer route
   answers 409, recording nothing. The demo programme becomes **Active year
   bonus 2025**, rule 2025.1 (issued 2024-11-15), claimed the year after the
   way a German bonus booklet is, so patient1 can be evaluated today.
2. **Activity is exercise minutes, never steps.** LOINC
   [55411-3](https://clinicaltables.nlm.nih.gov/api/loinc_items/v3/search?terms=55411-3)
   "Exercise duration", one Observation per week holding that week's mean
   minutes per day (`min/d`), as Klarbefund sends it from Apple Health's
   exercise minutes, a fifth series beside ADR-057's four. A week's minutes
   are its mean times seven; a week belongs to the year it ends in. The
   year's average divides the sum by 52: a week the tracker shared nothing
   counts as no activity, because the hub can only see what was shared. The
   member's screen says how many weeks were shared.
3. **The check-up is coded.** An Encounter in that year with SNOMED CT
   185349003 "Encounter for check up" in `typeCode`, or that display in
   `type`, which is how the Synthea loader stores it. A visit only named
   "check-up" does not count.
4. **The breakdown stays with the member.** The evaluation answers the year,
   goal met and, for the member's eyes, minutes a week, weeks shared and
   check-ups (`GET /api/patient/programmes/evaluation` and its app twin). The
   query returns three sums and nothing finer. A transfer stores the year and
   `goalMet`, status `evaluated`, and nothing else (ADR-080, decision 2).
   Delivery to AlphaKasse is still step 8.
5. **A dropped programme leaves the list, its consents stay.** The enricher
   never deletes a service it no longer sees. The list shows only programmes
   within an hour of their publisher's latest crawl, so the 2027 entry
   disappears from the offer while the consents given to it remain on record.

## Consequences

### Positive

- The answer AlphaKasse would receive is final: it is computed from a closed
  year and cannot change after it is sent.
- The rule is read from coded data (LOINC, SNOMED CT), so a second tracker or
  EHR that codes the same way counts without new code.
- The privacy boundary is testable: the evaluation query's `RETURN` is pinned
  by a unit test, and the transfer's keys by the API collection and J1099.

### Negative

- A member cannot claim before the year ends; the 2025 demo programme looks
  odd beside a calendar in late 2026 until the reader knows it is claimed
  the year after.
- Counting unshared weeks as no activity punishes a member who forgot to
  sync. The screen shows the weeks shared, and a sync before sending fixes
  it; a programme that wants leniency needs a new rule version.
- Klarbefund asks Apple Health for one more type, so the permission sheet
  changes and the person is asked again.
- Programmes need a rule per year. The hub ships one rule (2025.1); a new
  version means new code, which ADR-080 already accepted.

## Alternatives considered

- **Evaluate the year so far and label it provisional.** An insurer still
  receives a yes or no for a year that is not over.
- **Keep 2027 and wait.** Honest, but the demo shows no result until 2028.
- **Infer minutes from steps.** No validated conversion; the rule asks for
  minutes, and a member could not check how a number was made up.
- **Average only the weeks shared.** One shared active week would meet the
  rule for a year.

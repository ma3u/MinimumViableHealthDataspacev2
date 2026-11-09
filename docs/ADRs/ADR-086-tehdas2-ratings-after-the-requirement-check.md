# ADR-086: The TEHDAS2 ratings after the requirement check

Date: 2026-11-09

**Status:** Proposed
**Amends:** [ADR-083](ADR-083-what-the-hub-takes-over-from-tehdas2.md), decision 2 and its table
**Tracks:** [#990](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/990), [#991](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/991), [#992](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/992)

## Status

Proposed on 2026-11-09, the day the checks ran.

## Context

ADR-083 rated each TEHDAS2 document from a mapping at component level and
said each "taken over, as implemented" document would be checked requirement
by requirement before the hub is shown as implementing it (decision 2). The
checks ran on 2026-11-09 against `main` at `e1492052`, every row with a deep
link to the code:

- D5.1, D5.3, D6.2, D6.3: [#991, report 1](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/991#issuecomment-6745762566)
- Linkage of datasets and handling research outcomes (drafts): [#991, report 2](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/991#issuecomment-6745763337)
- D7.1, D7.4, D8.1: [#991, report 3](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/991#issuecomment-6745821939)
- D6.4 DAAMS: [#992](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/992#issuecomment-6745694280), 94 elements: 31 the same, 33 different, 30 missing

| Document                  | Requirements checked | Implemented | Partial | Not implemented | Not applicable |
| ------------------------- | -------------------- | ----------- | ------- | --------------- | -------------- |
| D5.1                      | 32                   | 15          | 9       | 6               | 2              |
| D5.3                      | 21                   | 7           | 7       | 6               | 1              |
| D6.2                      | 36                   | 12          | 14      | 9               | 1              |
| D6.3                      | 40                   | 13          | 12      | 11              | 4              |
| D7.1                      | 25                   | 6           | 11      | 6               | 2              |
| D8.1                      | 29                   | 11          | 11      | 3               | 4              |
| Linkage (draft)           | 22                   | 2           | 9       | 8               | 3              |
| Research outcomes (draft) | 18                   | 5           | 6       | 5               | 2              |

D7.4 was checked in 46 groups of requirements, not counted by status; its
data-protection core is implemented. Three of the six documents ADR-083
called implemented are not.

## Decision

1. **D6.2, D7.1 and linkage of datasets are rated partial, not implemented.**
   They move from ADR-083 decision 2 ("taken over, as implemented") to
   decision 3 ("taken over, with the gap closed in an issue"):
   - D6.2: the ten-section application form and the Art. 53(2) and
     amendment gaps go to #717 and #1031; delivery after a permit stays #720.
   - D7.1: the review before export goes to #716; the person named in the
     permit and a second factor go to #1030. The hub is a query SPE, not an
     interactive workspace a user logs into; that is stated, not changed.
   - Linkage: the pseudonym per project and the pseudonym's order go to #475;
     logging on the audit chain to #587; the linking process itself (method,
     validation, quality report to the user) is not built.
2. **D5.1, D8.1 and research outcomes stay "implemented", each with its gaps
   named.** D5.1 meets HealthDCAT-AP Release 8 but not D5.1's own stricter
   mandatory properties (#1033). D8.1's core holds; the Art. 71(3) permit-date
   rule and other holders are #696, the activity report's count is #1032.
   Research outcomes are implemented for the Art. 61(4) reporting; output
   control and significant findings stay with #716 and #996.
3. **D5.3, D6.3 and D7.4 stay partial**, with the gaps the checks found added
   to their issues (#714, #717, #1031, #716, #1030, #587).
4. **D6.4 stays "the model"** (ADR-083 decision 4). Its largest deviations
   (statuses, decision and permit as one record, no decision card, one
   dataset per application) are #1031, with its own ADR before the data model
   changes. For the conference, D6.4's status names are shown as labels.
5. **Two findings outside TEHDAS2** are filed: the trust-centre routes'
   missing role check and the proxy's internal error messages (#1029).

### The table after the check

Of the 21 documents: 4 implemented (D4.1, D5.1, D8.1, research outcomes), 15
in part, 2 not covered (D8.2, data enrichment). ADR-083 had 7, 12 and 2.

| Document                           | ADR-083     | After the check                                 | Issues                         |
| ---------------------------------- | ----------- | ----------------------------------------------- | ------------------------------ |
| D5.1 Data description              | Implemented | Implemented, D5.1's stricter properties missing | #1033, #697                    |
| D6.2 Good application practice     | Implemented | Partial                                         | #717, #1031, #720              |
| D7.1 Using data in the SPE         | Implemented | Partial                                         | #716, #1030                    |
| D8.1 Opt-out                       | Implemented | Implemented, with gaps                          | #696, #1032                    |
| Linkage of datasets (draft)        | Implemented | Partial                                         | #475, #587                     |
| Handling research outcomes (draft) | Implemented | Implemented for Art. 61(4) reporting            | #716, #996                     |
| D5.3, D6.3, D6.4, D7.4             | Partial     | Partial                                         | #714, #717, #1031, #716, #1030 |

Every other row of ADR-083's table stands.

## Consequences

- The mapping page (#993) and the conference demo (#994) say "partial" for
  D6.2, D7.1 and linkage, and name the gaps.
- Five issues are new: #1029 to #1033. The D6.4 permit model (#1031) is the
  largest piece of work and needs its own ADR.
- The hub's strongest claims at the conference are D5.1 (HealthDCAT-AP
  Release 8, CI-validated), D8.1, research outcomes, and the confidential SPE,
  which goes beyond what D7.4 asks for data protection.

## Alternatives considered

- **Edit ADR-083's table.** Lost: an accepted ADR is superseded or amended,
  never edited.
- **Keep the ratings and list the gaps only in the issues.** Lost: the page
  and the demo would claim more than the code does.

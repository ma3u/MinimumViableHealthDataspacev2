# ADR-083: What the hub takes over from TEHDAS2

Date: 2026-11-09

**Status:** Proposed
**Relates to:** [ADR-044](ADR-044-every-api-route-needs-a-session.md), [ADR-062](ADR-062-the-art-71-opt-out-is-a-record-and-a-label.md), [ADR-063](ADR-063-healthdcat-ap-release-8-and-its-namespace.md), [ADR-068](ADR-068-a-sovereign-confidential-spe-on-confidential-containers-and-trustee.md), [ADR-077](ADR-077-a-minimal-set-of-standard-data-sharing-policies.md)
**Tracks:** [#990](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/990) (epic) with [#991](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/991) to [#999](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/999)

## Status

Proposed on 2026-11-09, before the TEHDAS2 final conference on 16 November 2026.

## Context

TEHDAS2, the Joint Action that prepares the EHDS, has written 21 guidelines
and technical specifications for access bodies, data holders and data users.
14 are final ([results by user group](https://tehdas.eu/results-by-user-group/)).
7 are wave-3 drafts from the
[third public consultation](https://tehdas.eu/public-consultations/), which
closed on 18 August 2026. None of the seven was listed as final on
9 November 2026. The [final conference](https://tehdas.eu/event/tehdas2-final-conference/)
is on 16 November 2026 in Brussels and online.

The documents are guidance, not law. What binds is
[Regulation (EU) 2025/327](https://eur-lex.europa.eu/eli/reg/2025/327/oj/eng)
and its implementing acts. Where those leave the how open, an access body will
be measured against TEHDAS2. A reference implementation that plays the access
body, the holder and the user is measured the same way.

A mapping of 9 November 2026 rated every document against the hub's components
and the [EHDS article table](../ehds/regulation-implementation.md): 7
implemented, 12 in part, 2 not covered (D8.2 significant findings, and the
return of enriched data). It works at component and article level, not
requirement by requirement. This ADR records that mapping and decides, for each
document, what the hub takes over.

## Decision

1. **The Regulation first, TEHDAS2 where it leaves the how open.** The
   Regulation and its implementing acts take precedence. Where the hub follows a
   TEHDAS2 document, that document is its specification. Where it deviates, the
   mapping page under `/docs` says so and why
   ([#993](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/993)).
2. **Taken over, as implemented:** D5.1, D6.2, D7.1, D8.1, linkage of datasets
   and handling research outcomes. Each is checked requirement by requirement
   before the hub is shown as implementing it
   ([#991](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/991)).
   A requirement found missing goes to the issue in the table below.
3. **Taken over, with the gap closed in an existing issue:** D5.2, D5.3, D6.1,
   D6.3 and D7.4. Those issues stay in their own epics and are linked from #990.
4. **D6.4 DAAMS is the model for applications and permits.** The hub's
   application, request and permit model is compared with it
   ([#992](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/992)).
   A deviation is either changed, by its own ADR when the data model changes,
   or listed on the mapping page with its reason.
5. **Taken over and built new:**
   - D8.2: the path from a significant finding to the person
     ([#996](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/996)),
     with its own ADR before it is built.
   - The Citizen Information Point
     ([#995](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/995)):
     the information page answers without sign-in. That needs an ADR which
     supersedes ADR-044 for `/information`; this ADR does not do that.
6. **Deferred:**
   - D7.3 and the HealthData@EU part of navigating the catalogue, until the
     Art. 75 implementing act is adopted
     ([#713](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/713)).
   - D7.2 beyond suppression of groups under five
     ([#999](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/999), P3).
   - Data enrichment, until its final guideline
     ([#998](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/998), P3).
7. **Not taken over now:**
   - D4.1's collection of fees and fines: the hub computes fees and records
     fines with fictional amounts, and collects no money.
   - Third-country access: transfers outside the EU/EEA stay refused through
     the policy constraints of ADR-077; there is no application path for
     applicants outside it.
   - The framework for collaboration: ethics review and the protection of
     intellectual property are not modelled.
8. **The wave-3 rows are provisional.** They rest on the May 2026 drafts and
   are re-rated on the final versions
   ([#997](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/997)).
   A decision that changes then gets a new ADR that supersedes the row here.

### The 21 documents

| TEHDAS2 document                                                                                                                                                                                                                                         | Mapping on 2026-11-09 | Decision                       | Issue      |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- | ------------------------------ | ---------- |
| [D4.1 Fees and penalties](https://tehdas.eu/wp-content/uploads/2026/05/d4.1-guideline-for-health-data-access-bodies-on-fees-and-penalties-for-non-compliance-related-to-the-ehds-regulation.pdf)                                                         | Implemented           | Not taken over: collection (7) |            |
| [D5.1 Data description](https://tehdas.eu/wp-content/uploads/2025/10/guideline-for-data-holders-on-data-description.pdf)                                                                                                                                 | Implemented           | Taken over (2)                 | #991, #697 |
| [D5.2 Minimum categories and limitations](https://tehdas.eu/wp-content/uploads/2026/06/d5.2-guideline-for-health-data-access-bodies-on-minimum-categories-and-limitations-on-the-reuse-of-health-data.pdf)                                               | Partial               | Gap closed (3)                 | #717       |
| [D5.3 National metadata catalogue](https://tehdas.eu/wp-content/uploads/2025/10/technical-specification-for-health-data-access-bodies-on-the-national-metadata-catalogue.pdf)                                                                            | Partial               | Gap closed (3)                 | #714       |
| [D6.1 Making data available](https://tehdas.eu/wp-content/uploads/2026/06/d6.1-guideline-for-health-data-holders-on-making-personal-and-non-personal-electronic-health-data-available-for-reuse.pdf)                                                     | Partial               | Gap closed (3)                 | #720       |
| [D6.2 Good application practice](https://tehdas.eu/wp-content/uploads/2025/10/d6.2-guideline-for-data-users-on-good-application-and-access-practice.pdf)                                                                                                 | Implemented           | Taken over (2)                 | #991       |
| [D6.3 Procedures and formats](https://tehdas.eu/wp-content/uploads/2026/05/d6.3-guideline-for-health-data-access-bodies-on-the-procedures-and-formats-for-data-access.pdf)                                                                               | Partial               | Gap closed (3)                 | #717       |
| [D6.4 DAAMS](https://tehdas.eu/wp-content/uploads/2026/06/d6.4-data-access-application-management-system-daams-technical-specification-for-health-data-access-bodies.pdf)                                                                                | Partial               | The model (4)                  | #992       |
| [D7.1 Using data in the SPE](https://tehdas.eu/wp-content/uploads/2025/10/guideline-on-how-to-use-data-in-a-secure-processing-environment.pdf)                                                                                                           | Implemented           | Taken over (2)                 | #991       |
| [D7.2 Minimisation, pseudonymisation, synthetic data](https://tehdas.eu/wp-content/uploads/2026/06/d7.2-guideline-for-health-data-access-bodies-on-data-minimisation-pseudonymisation-anonymisation-and-synthetic-data.pdf)                              | Partial               | Deferred (6)                   | #999, #475 |
| [D7.3 Common IT infrastructure](https://tehdas.eu/wp-content/uploads/2026/05/d7.3-technical-specification-for-health-data-access-bodies-on-the-implementation-of-the-common-it-infrastructure.pdf)                                                       | Partial               | Deferred (6)                   | #713       |
| [D7.4 SPE specification](https://tehdas.eu/wp-content/uploads/2026/06/d7.4-technical-specification-for-health-data-access-bodies-on-the-implementation-of-secure-processing-environments.pdf)                                                            | Partial               | Gap closed (3)                 | #716       |
| [D8.1 Opt-out](https://tehdas.eu/wp-content/uploads/2026/06/d8.1-guideline-for-health-data-access-bodies-on-implementing-opt-out-from-the-secondary-use-of-health-data.pdf)                                                                              | Implemented           | Taken over (2)                 | #991, #696 |
| [D8.2 Significant findings](https://tehdas.eu/wp-content/uploads/2026/06/d8.2-guideline-for-health-data-access-bodies-on-implementing-the-obligation-of-notifying-the-natural-person-on-a-significant-finding-from-the-secondary-use-of-health-data.pdf) | Not covered           | Built new (5)                  | #996       |
| [Framework for collaboration](https://tehdas.eu/wp-content/uploads/2026/05/draft-guideline-on-a-framework-for-collaboration.pdf) (draft)                                                                                                                 | Partial               | Not taken over now (7)         |            |
| [Third-country access and transfer](https://tehdas.eu/wp-content/uploads/2026/05/draft-guideline-for-health-data-access-bodies-on-international-and-third-country-access-and-transfer-of-electronic-health-data.pdf) (draft)                             | Partial               | Not taken over now (7)         |            |
| [Data enrichment](https://tehdas.eu/wp-content/uploads/2026/05/draft-guideline-for-data-enrichment.pdf) (draft)                                                                                                                                          | Not covered           | Deferred (6)                   | #998       |
| [Navigating the catalogue](https://tehdas.eu/wp-content/uploads/2026/05/draft-guideline-for-data-users-navigating-the-catalogue.pdf) (draft)                                                                                                             | Partial               | Deferred, HealthData@EU (6)    | #713       |
| [Linkage of datasets](https://tehdas.eu/wp-content/uploads/2026/05/draft-guideline-for-health-data-access-bodies-on-linkage-of-health-datasets.pdf) (draft)                                                                                              | Implemented           | Taken over (2)                 | #991       |
| [Citizen Information Point](https://tehdas.eu/wp-content/uploads/2026/05/draft-guideline-for-health-data-access-bodies-on-informing-natural-persons-about-the-use-of-health-dataxxxcitizen-information-point-.pdf) (draft)                               | Partial               | Built new (5)                  | #995       |
| [Handling research outcomes](https://tehdas.eu/wp-content/uploads/2026/05/draft-guideline-for-data-users-on-handling-research-outcomes.pdf) (draft)                                                                                                      | Implemented           | Taken over (2)                 | #991       |

The number in brackets is the decision above. The conference demo
([#994](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/994))
shows the rows taken over, along the conference's four sessions.

## Consequences

- The hub can be shown as a reference implementation of the documents in
  decision 2 once #991 has checked them, and of D6.4 once #992 has.
- A reader finds what the hub does with each TEHDAS2 document in one place:
  this table now, the mapping page (#993) once it is published.
- Two new pieces of work follow, D8.2 and the public information page, and
  each needs its own ADR first.
- The deferred and the omitted documents are stated, so a gap the demo does not
  show is a decision rather than an oversight.
- The wave-3 rows can change after the final versions; until then they are
  marked as drafts here and on the mapping page.

## Alternatives considered

- **Take over every TEHDAS2 requirement.** Lost: much of it is written for an
  access body's organisation, staff and procedures, not for software, and the
  conference is a week away.
- **Follow the Regulation only and leave TEHDAS2 aside.** Lost: access bodies
  will be measured against these documents, and the conference audience will
  ask what the hub does with them.

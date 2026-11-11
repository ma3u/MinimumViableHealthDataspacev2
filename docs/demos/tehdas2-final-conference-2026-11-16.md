# Demo: TEHDAS2 final conference, 16 November 2026

**Event:** [TEHDAS2 final conference](https://tehdas.eu/event/tehdas2-final-conference/),
Monday 16 November 2026, 13:00 to 17:10 CET (reception to 18:00), Spark
meetings, Rue Ravenstein 60, Brussels, and online.
**Issue:** [#994](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/994), epic [#990](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/990).
**Decision behind it:** [ADR-083](../ADRs/ADR-083-what-the-hub-takes-over-from-tehdas2.md),
what the hub takes over from each TEHDAS2 document.
**Live demo:** https://ehds.mabu.red · **Fallback:** https://ma3u.github.io/MinimumViableHealthDataspacev2/

## The point to make

TEHDAS2 has written 21 guidelines and technical specifications. The hub is a
running reference implementation of the ones an access body, a holder and a
user can show in software: one dataspace, synthetic data, fictional
organisations. Every step names the TEHDAS2 document it shows, and every gap is
a decision in ADR-083, not an oversight.

## The journey, along the conference's four sessions

Personas on the live hub: `researcher` (PharmaCo Research AG, data user),
`regulator` (MedReg DE, access body), `clinicuser` (AlphaKlinik Berlin, data
holder), `patient1` (a citizen). On the static site, pick the same personas in
the persona menu.

| #   | Session                       | Persona      | Page                    | What to show                                                                                  | TEHDAS2                        |
| --- | ----------------------------- | ------------ | ----------------------- | --------------------------------------------------------------------------------------------- | ------------------------------ |
| 1   | 1. Discovery and access       | researcher   | `/catalog`              | HealthDCAT-AP R8 entries; say the 0 SHACL violations, a PR Gate check, not on the page        | D5.1, D5.3                     |
| 2   | 1                             | researcher   | `/data/discover`        | Federated discovery across the participants' catalogues                                       | D5.3, navigating the catalogue |
| 3   | 1                             | researcher   | `/applications`         | A new application: purpose, datasets, legal basis                                             | D6.2                           |
| 4   | 1                             | regulator    | `/compliance`           | The access body's desk: the application, its decision deadline, the decision                  | D6.3, D6.4                     |
| 5   | 1                             | regulator    | `/permits`              | The permit and the register of permits                                                        | D6.3, D6.4                     |
| 6   | 2. Safe and secure use        | regulator    | `/admin/attestation`    | The SPE workspaces as confidential containers; the key released only to an attested workspace | D7.1, D7.4                     |
| 7   | 2                             | researcher   | `/query`                | Only aggregates leave; groups under five are suppressed                                       | D7.1, D7.2                     |
| 8   | 2                             | regulator    | `/graph`                | Linkage through research pseudonyms in the trust centre                                       | Linkage of datasets            |
| 9   | 2                             | regulator    | `/compliance` (results) | Results published with attribution under the permit's duties                                  | Research outcomes              |
| 10  | 3. Citizens at the heart      | patient1     | `/patient/research`     | The Art. 71 opt-out as a record and a label; the query proxy filters the person out           | D8.1                           |
| 11  | 3                             | (signed out) | `/information`          | The information page; it needs a sign-in today (#995)                                         | Citizen Information Point      |
| 12  | 3                             | patient1     | `/auth/eudi-qr`         | Sign-in with an EUDI Wallet                                                                   | (Regulation 2026/2099)         |
| 13  | 4. Building the EHDS together | any          | `/docs/roadmap#e990`    | What the hub takes over, defers and leaves out (ADR-083), and the roadmap                     | all 21                         |

Ten minutes: steps 1, 3, 4, 5, 6, 7, 10 and 13. Three minutes: steps 1, 4, 10, 13.

## Say it plainly where the hub stops

The requirement check of 9 November ([ADR-086](../ADRs/ADR-086-tehdas2-ratings-after-the-requirement-check.md),
the [mapping page](https://ma3u.github.io/MinimumViableHealthDataspacev2/docs/ehds/tehdas2-mapping)):
4 documents implemented, 15 in part, 2 not covered. D6.2, D7.1 and linkage
are partial, so say "in part" for them.

- **DAAMS (D6.4):** 31 of 94 elements the same, 33 different, 30 missing. The
  statuses, the permit as one record with no versions, no decision card for
  the applicant, and one dataset per application (#1031).
- **The SPE answers queries;** it is not a workspace a user logs into, and
  access checks the organisation, not the person named in the permit, with no
  second factor yet (#1030). Its data protection goes beyond D7.4.
- **HealthData@EU:** no national contact point, no eDelivery. Deferred until
  the Art. 75 implementing act (#713).
- **D8.2 significant findings:** not covered yet; a path is planned with its
  own ADR (#996).
- **Data enrichment:** not covered; after its final guideline (#998).
- **Anonymisation:** suppression of groups under five only; generalisation and
  synthetic data later (#999).
- **Third-country access and the framework for collaboration:** not taken over
  now (ADR-083, decision 7).
- **Wave-3 guidelines:** rated on their May 2026 drafts; re-rated once final (#997).

## Before the day

- [x] #991 and #992 checked on 9 November; the ratings are in ADR-086
- [ ] The mapping page (#993) is live at https://ma3u.github.io/MinimumViableHealthDataspacev2/docs/ehds/tehdas2-mapping; it is the one handout link
- [ ] Show D6.4's status names as labels before the day (#1031, first task)
- [ ] Rehearsal on Friday 13 November: every step above on https://ehds.mabu.red, each persona signed in; anything broken goes to its issue
- [ ] The live stack: Monday is a working day, so the off-hours schedule starts it at 06:17 CET and stops it at 19:13 CET ([runbook](../knowledge/runbooks/live-demo-off-hours.md), ADR-053). The conference ends at 18:00, so no hold is needed. Check at 12:00 CET with `scripts/azure/check-keycloak-health.sh`
- [ ] Fallback: the static site with the same personas, and a recorded run of the ten-minute version
- [ ] Contacts: the work-package leads to meet, from the local contact list (never committed)

## Questions to expect

- **Is this an official TEHDAS2 or Commission tool?** No. An independent
  reference implementation; TEHDAS2 documents are its specification where the
  Regulation leaves the how open (ADR-083, decision 1).
- **Which DAAMS functions are covered?** Applications, requests, permits,
  decision deadlines and the register; the comparison with D6.4 is in #992.
- **Can an access body reuse it?** The code is open on GitHub; the components
  are EDC, Neo4j, FHIR R4, OMOP 5.4 and HealthDCAT-AP R8.
- **Real data?** Never. Synthetic patients only, and fictional organisations. The
  number depends on the view: the hub's FHIR cohort is 127 patients (the
  catalogue's Synthea entry); the query page counts what the two SPE
  workspaces hold, 200 together (167 and 34). Say "synthetic patients" and
  give the number of the page on screen.

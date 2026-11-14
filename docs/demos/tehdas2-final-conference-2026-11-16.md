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
`regulator` (MedReg DE, access body), `edcadmin` (the dataspace operator),
`patient1` (a citizen). On the static site, pick the same personas in the
persona menu.

Steps 6 and 8 use `edcadmin`, not `regulator`. `/admin/attestation` admits
`EDC_ADMIN` only ([`middleware.ts:139`](https://github.com/ma3u/MinimumViableHealthDataspacev2/blob/main/ui/src/middleware.ts#L139)),
and the trust centre register on `/compliance` is open to trust centre
operators and the administrator, not to the access body
([`api/trust-center/route.ts:15`](https://github.com/ma3u/MinimumViableHealthDataspacev2/blob/main/ui/src/app/api/trust-center/route.ts#L15)).
The regulator sees "Access Denied" on the first and a refusal note on the
second. `/graph` opens with "This explorer is retired", so step 8 no longer
uses it.

| #   | Session                       | Persona      | Page                                | What to show                                                                                                       | TEHDAS2                        |
| --- | ----------------------------- | ------------ | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------ |
| 1   | 1. Discovery and access       | researcher   | `/catalog`                          | HealthDCAT-AP R8 entries; say the 0 SHACL violations, a PR Gate check, not on the page                             | D5.1, D5.3                     |
| 2   | 1                             | researcher   | `/data/discover`                    | Federated discovery across the participants' catalogues                                                            | D5.3, navigating the catalogue |
| 3   | 1                             | researcher   | `/applications`                     | A new application: purpose, datasets, legal basis                                                                  | D6.2                           |
| 4   | 1                             | regulator    | `/compliance`                       | The access body's desk: the application, its decision deadline, the decision                                       | D6.3, D6.4                     |
| 5   | 1                             | regulator    | `/permits`                          | The permit and the register of permits                                                                             | D6.3, D6.4                     |
| 6   | 2. Safe and secure use        | edcadmin     | `/admin/attestation`                | The SPE workspaces as confidential containers; the key released only to an attested workspace                      | D7.1, D7.4                     |
| 7   | 2                             | researcher   | `/query`                            | "Patients with diabetes": only aggregates leave; groups under five are suppressed                                  | D7.1, D7.2                     |
| 8   | 2                             | edcadmin     | `/compliance`, Trust Center section | Linkage through research pseudonyms: provider pseudonym, trust centre, research pseudonym, SPE, aggregate only     | Linkage of datasets            |
| 9   | 2                             | regulator    | `/permits` (results)                | The results the data user communicated, Art. 61(4), on the public register; the user sends them on `/applications` | Research outcomes              |
| 10  | 3. Citizens at the heart      | patient1     | `/patient/research`                 | The Art. 71 opt-out as a record and a label; the query proxy filters the person out                                | D8.1                           |
| 11  | 3                             | (signed out) | `/information`                      | The information page; it needs a sign-in on the live hub (#995), the static site shows it without one              | Citizen Information Point      |
| 12  | 3                             | (signed out) | `/auth/eudi-qr`                     | Sign-in with an EUDI Wallet                                                                                        | (Regulation 2026/2099)         |
| 13  | 4. Building the EHDS together | any          | `/docs/roadmap#e990`                | What the hub takes over, defers and leaves out (ADR-083), and the roadmap                                          | all 21                         |

### Timings

| Version       | Steps and minutes                                                                                                                    | Total |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ----- |
| Full          | 1 (1:00), 2 (1:00), 3 (1:00), 4 (1:30), 5 (1:00), 6 (1:30), 7 (1:30), 8 (1:30), 9 (1:00), 10 (1:30), 11 (0:45), 12 (0:45), 13 (1:00) | 15:00 |
| Ten minutes   | 1 (1:00), 3 (1:00), 4 (1:30), 5 (1:00), 6 (1:30), 7 (1:30), 10 (1:30), 13 (1:00)                                                     | 10:00 |
| Three minutes | 1 (0:30), 4 (1:00), 10 (0:45), 13 (0:45)                                                                                             | 3:00  |

Switching persona on the live hub means signing out and in again, which costs
more than a step. Sign in before the session, one browser profile per persona
(`researcher`, `regulator`, `edcadmin`, `patient1`) and one private window
signed out for steps 11 and 12, and switch windows instead.

### What each step shows, from the rehearsal of 14 November

Walked signed in on the local compose stack, which runs the same commit as the
live hub (ae507f77, EDC 1.0.0-RC6), and on the static site. The live hub was
offline for the weekend (ADR-053). Counts on the local stack include test
leftovers, so read the live numbers off the screen on the day.

| #   | Local stack, signed in                                                                                    | Static site                                      |
| --- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| 1   | HealthDCAT-AP datasets listed, Release 8                                                                  | 21 of 21 datasets, Release 8                     |
| 2   | Datasets across the participants' catalogues                                                              | Renders                                          |
| 3   | The application form with the eleven items of Art. 67(2)                                                  | Renders                                          |
| 4   | The compliance matrix: pending applications, decision due dates, late ones in red                         | Renders                                          |
| 5   | The register of permits, Art. 57(1)(j) and 58(1)(f)                                                       | Renders                                          |
| 6   | The SPE attestation page as `edcadmin`; "Access Denied" as `regulator`                                    | Renders as `edcadmin`                            |
| 7   | "Patients with diabetes": 3 rows, "k = 5: 2 values suppressed", the small groups shown as `<5`            | Does not answer (static POST); use the recording |
| 8   | MedReg DE and Limburg trust centres, their HDAB approvals, active research pseudonyms, the NL to DE chain | Trust Center section with pseudonyms             |
| 9   | "Results communicated by data users, Art. 61(4)" on `/permits`                                            | Same section                                     |
| 10  | The Art. 71 opt-out and the study consents, separately                                                    | Renders                                          |
| 11  | Redirects to sign-in (#995)                                                                               | Shows the information page without sign-in       |
| 12  | The d-you QR page, waiting for the wallet                                                                 | Renders                                          |
| 13  | The roadmap at the TEHDAS2 epic                                                                           | Renders                                          |

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
- [x] The mapping page (#993) is live at https://ma3u.github.io/MinimumViableHealthDataspacev2/docs/ehds/tehdas2-mapping (200 on 14 November); it is the one handout link
- [ ] Show D6.4's status names as labels before the day (#1031, first task). Not built; on the day, say that the statuses differ from D6.4 (see above)
- [x] Rehearsal, 14 November: every step on the local stack signed in and on the static site; the results are in the table above. Steps 6 and 8 moved to `edcadmin`
- [ ] Live walk on Monday morning, 08:00 to 12:00 CET, on https://ehds.mabu.red, each persona signed in in its own browser profile; read the live counts for steps 1, 7 and the patient question
- [x] The live stack: Monday is a working day, so the off-hours schedule starts it at 06:17 CET (05:17 UTC) and stops it at 19:13 CET ([runbook](../knowledge/runbooks/live-demo-off-hours.md), ADR-053). The conference ends at 18:00, so no hold is needed. Check at 12:00 CET with `scripts/azure/check-keycloak-health.sh`
- [x] Fallback: the static site with the same personas; every page answers 200 on 14 November, step 7 excepted
- [ ] A recorded run of the ten-minute version, for step 7 and for a dead network. [`ui/scripts/record-tehdas2-demo.ts`](../../ui/scripts/record-tehdas2-demo.ts) records it against the live hub on Monday morning, about 11 minutes, with a caption per step:

  ```bash
  # zsh: asks for each persona's password without echoing it
  cd ui
  for u in RESEARCHER REGULATOR EDCADMIN PATIENT1; do read -rs "RECORD_PASS_$u?Password for ${(L)u}: "; echo; export "RECORD_PASS_$u"; done
  PLAYWRIGHT_BASE_URL=https://ehds.mabu.red npx tsx scripts/record-tehdas2-demo.ts
  ```

  It only reads (no form is submitted) and writes `tehdas2-demo-10min.mp4` to a folder in the system temp directory.

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
  catalogue's Synthea entry); the query page adds up what the two SPE
  workspaces hold after the Art. 71 opt-outs, 200 on the static site; read the
  live number off the screen at the rehearsal. Say "synthetic patients" and
  give the number of the page on screen.

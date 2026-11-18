# TEHDAS2: what the hub implements

TEHDAS2, the Joint Action that prepares the EHDS, has written 21 guidelines and
technical specifications for health data access bodies, data holders and data
users: 14 final ([results by user group](https://tehdas.eu/results-by-user-group/))
and 7 wave-3 drafts from the
[third public consultation](https://tehdas.eu/public-consultations/). This page
says, for each one, what the integration hub implements, where it stops, and
which issue closes the gap. Its
[final conference](https://tehdas.eu/event/tehdas2-final-conference/) took
place on 16 November 2026 in Brussels and online; what it adds is in
[the section below](#what-the-final-conference-adds).

The decisions behind it are
[ADR-083](https://github.com/ma3u/MinimumViableHealthDataspacev2/blob/main/docs/ADRs/ADR-083-what-the-hub-takes-over-from-tehdas2.md)
(what the hub takes over) and
[ADR-086](https://github.com/ma3u/MinimumViableHealthDataspacev2/blob/main/docs/ADRs/ADR-086-tehdas2-ratings-after-the-requirement-check.md)
(the ratings after the requirement check). The work is epic
[#990](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/990).

## In short

- **Of the 21 documents, the hub implements 4, covers 15 in part and does not
  cover 2** (D8.2 significant findings, and the return of enriched data).
- The guidance is not law. Regulation (EU) 2025/327 and its implementing acts
  come first; TEHDAS2 applies where they leave the how open.
- Nine documents were checked requirement by requirement on 2026-11-09, every
  row linked to the code that shows it: reports for
  [D5.1 to D6.3](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/991#issuecomment-6745762566),
  [linkage and research outcomes](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/991#issuecomment-6745763337),
  [D7.1 to D8.1](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/991#issuecomment-6745821939)
  and [D6.4 DAAMS](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/992#issuecomment-6745694280).
- The wave-3 rows rest on the May 2026 drafts and are rated again once the
  final versions are published
  ([#997](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/997)).
  The conference showed them as finalised; on 18 November 2026 the results
  pages still list the 14 documents of waves 1 and 2.

## What the final conference adds

The source is the deck the organisers sent after the event,
[TEHDAS2 Final Event slides and Menti results](https://www.lyyti.fi/att/befdc1b39102d546/000affb10809f735c40b9e5e6209495b)
(PDF, 108 slides, 16 November 2026). It summarises the guidelines along the
user journey and adds the audience votes (Menti). Numbers in brackets below are
the PDF's pages. Nothing in it changes a rating in the tables; it sharpens what the
gaps mean and in which order to close them.

### What the presenters stressed, and where the hub stands

- **Data discovery, D5.1** (pages 17 to 21). Each of the 17 Art. 51 data
  categories now has a definition, its legislative context and examples, and
  HealthDCAT-AP gets property-by-property instructions. The guideline feeds
  the Art. 77 implementing act, the HealthData@EU catalogue and "tools that
  help data holders create dataset descriptions". The hub's catalogue editor
  is such a tool, and its HealthDCAT-AP output is validated in CI. Still open
  are D5.1's stricter properties
  ([#1033](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/1033))
  and the EU harvest
  ([#713](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/713)).
- **Requests, applications and making data available, D6.2 and D6.1**
  (pages 22 to 27). The deck sets the clocks end to end: decision up to 3
  months, the holder supplies the data within 3 months (plus 3 if justified),
  the SPE is ready within 2 months, results are published within 18 months.
  A data request (Art. 69) is the recommended feasibility step before an
  application; anonymised data is the default and pseudonymised data needs a
  justification. The hub runs the decision clock and the 18-month results
  deadline; the holder's 3-month delivery and the 10-step delivery workflow
  are the gap behind
  [#720](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/720),
  the 10-section form the one behind
  [#1031](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/1031).
- **Minimisation and pseudonymisation, D7.2** (pages 28 to 34). Five
  dimensions (who, what, when, where, how), each with a reason. No unsalted
  hash; new pseudonyms for every permit; only the access body or a trusted
  third party can reverse them. Quantitative thresholds stay open: k between
  3 and 100 is in use. The hub's display pseudonym is a keyed HMAC
  ([`patientPseudonym()`](https://github.com/ma3u/MinimumViableHealthDataspacev2/blob/main/ui/src/lib/patient-identity.ts#L49))
  and the birth date is cut to the year, as the deck's example does, but the
  pseudonym is one per record, not one per permit
  ([#475](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/475)),
  and k ≥ 5 suppression is the only disclosure control
  ([#999](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/999)).
- **Secure processing, D7.1 and D7.4** (pages 40 to 54). An Art. 73
  implementing act on SPE specifications is under discussion, with a public
  consultation to come. The capability model makes the stand-alone SPE
  mandatory and treats SPE federation and "EHDS federated computing" as the
  future. Open challenges named: sovereignty, cross-border SPE collaboration
  and AI in SPEs (external models, export of trained models). The hub's query
  SPE already federates, and its confidential containers answer the
  sovereignty question
  ([ADR-068](https://github.com/ma3u/MinimumViableHealthDataspacev2/blob/main/docs/ADRs/ADR-068-a-sovereign-confidential-spe-on-confidential-containers-and-trustee.md)).
  The deck's separation of roles (SPE operator, data user, an access body that
  monitors the logs, an external auditor) is where the hub is thin: no review
  before export and no workspace per permit
  ([#716](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/716)).
- **Linkage, D7.5** (pages 56 to 61, the wave-3 "Linkage of datasets").
  Linking organisations link, users never do; a trusted third party creates
  project-specific pseudonyms by keyed hashing; pseudonyms per permit are
  never reused, logged, then deleted. Five steps: apply with a linkage plan,
  the holder reports the cohort size, quality estimated before the invoice,
  link and validate, deliver with a quality report (Annex 5). The trust
  centre's research pseudonyms are the start; the per-permit pseudonym and
  the linkage process are
  [#475](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/475)
  and [#587](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/587).
- **Citizens, D8.3 and research outcomes** (pages 68 to 81). The Citizen
  Information Point (the wave-3 draft, now numbered D8.3) gathers every
  information duty of the access body. The hub's information page holds the
  register and the results, but needs a sign-in
  ([#995](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/995)).
- **Collaboration** (pages 89 to 92). Research infrastructures should build
  on what they have (discovery, metadata, quality), integrate multi-country
  coordination, linkage, domain SPEs and federated analysis, and pilot
  advanced analytics, synthetic data and automated cohort discovery. The hub
  shows the last group today: natural-language cohort queries on synthetic
  data over a federated proxy.

### What the audience said

| Question (page)                                              | Answer                                                                                                                                   | What it means for the hub                                                                                                               |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Where do you look for health data? (15)                      | Published papers 27 %, Google 20 %, a national or European catalogue 17 %, own databases 16 %, ChatGPT 12 %, a colleague 8 %             | Catalogues are not yet where research starts. Discovery has to be good enough to win: natural-language search, links from publications. |
| As a data holder, what would make the EHDS work? (36)        | Clear guidance on preparing data 32 %, researchers find my dataset and invite me 25 %, describe once and be found across Europe 20 %     | The catalogue editor and the delivery workflow (#720) answer the top two; the EU harvest (#713) the third.                              |
| How prepared are you for SPEs and HDAB infrastructure? (48)  | Fully 4 %, moderately 24 %, early stages 44 %, not prepared 28 %                                                                         | Most organisations start now. A reference implementation they can run is worth more than another specification.                         |
| How many SPEs do you expect in your country? (55)            | 10 or more 41 %, one 18 %, two or three 17 %                                                                                             | Many SPEs per country makes federation the normal case, which is the hub's design.                                                      |
| What should linkage prioritise? (63)                         | 1 standard procedures, 2 common identifiers and standards, 3 trusted third parties and PPRL, 4 cross-border linkage, 5 quality reporting | The order for #475 and #587: the procedure and the identifiers first, the quality report last.                                          |
| What helps a citizen judge whether sharing is worth it? (75) | 1 benefits in care, 2 what the data was used for and what came of it, 3 who benefits, 4 the risks                                        | The results register must reach citizens without a sign-in (#995), in plain language.                                                   |
| How does choosing (the opt-out) make you feel? (84)          | More involved 49 %, more willing 48 %, more trusting 32 %                                                                                | Supports the D8.1 opt-out as implemented.                                                                                               |
| What would make collaboration work? (97)                     | Routine multi-country studies 50 %, pilots adopted across organisations or countries 44 %                                                | A pilot that another organisation or country takes over is the measure of success to aim for.                                           |

### What follows for the hub

1. **Keep #997 open.** The wave-3 guidelines are finalised but not published;
   rate them on the final text when they appear.
2. **Order the gaps by the votes.** The holder's delivery workflow (#720) and
   the per-permit pseudonym with a linkage procedure (#475, #587) come before
   cross-border linkage and quality reporting.
3. **A public Citizen Information Point** (#995): citizens ranked "what came
   of it" second only to benefits in care.
4. **Watch the Art. 73 consultation** on SPE specifications and answer it
   with the hub's confidential, federated query SPE as the worked example.
5. **Funding and participation.** HaDEA announced EU4Health calls opening
   26 November 2026 and closing 24 February 2027 (page 102): the
   EHDS Readiness Package for secondary use (DI-g-26-23, EUR 14.35 million)
   and AI tools for EHDS compliance support (DI-g-26-24, EUR 3 million). An
   info session is planned for 9 December 2026.

## The final documents

| Document                                                                                                                                                                                                                                                 | Status      | Where in the hub                                                                                                   | What is missing                                                                                                                                                              | Issues                                                                                                                                                                                                                            |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [D4.1 Fees and penalties](https://tehdas.eu/wp-content/uploads/2026/05/d4.1-guideline-for-health-data-access-bodies-on-fees-and-penalties-for-non-compliance-related-to-the-ehds-regulation.pdf)                                                         | Implemented | Fees and fines on the access body's desk                                                                           | Amounts are fictional; fines are recorded, not collected                                                                                                                     |                                                                                                                                                                                                                                   |
| [D5.1 Data description](https://tehdas.eu/wp-content/uploads/2025/10/guideline-for-data-holders-on-data-description.pdf)                                                                                                                                 | Implemented | HealthDCAT-AP Release 8, validated in CI against the official SHACL                                                | D5.1's stricter properties for sensitive data: geographical coverage, collection purpose, language, publisher type                                                           | [#1033](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/1033), [#697](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/697)                                                                            |
| [D5.2 Minimum categories and limitations](https://tehdas.eu/wp-content/uploads/2026/06/d5.2-guideline-for-health-data-access-bodies-on-minimum-categories-and-limitations-on-the-reuse-of-health-data.pdf)                                               | Partial     | Purposes and prohibitions as policy terms                                                                          | Art. 54 prohibitions are not checked on the application                                                                                                                      | [#717](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/717)                                                                                                                                                         |
| [D5.3 National metadata catalogue](https://tehdas.eu/wp-content/uploads/2025/10/technical-specification-for-health-data-access-bodies-on-the-national-metadata-catalogue.pdf)                                                                            | Partial     | Catalogue and federated discovery                                                                                  | Public access and EU harvesting, trusted holders in the catalogue, version history, the holder's yearly review                                                               | [#714](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/714), [#697](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/697)                                                                              |
| [D6.1 Making data available](https://tehdas.eu/wp-content/uploads/2026/06/d6.1-guideline-for-health-data-holders-on-making-personal-and-non-personal-electronic-health-data-available-for-reuse.pdf)                                                     | Partial     | Catalogue editor, the connector's data plane                                                                       | No delivery flow after a permit (Art. 60)                                                                                                                                    | [#720](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/720)                                                                                                                                                         |
| [D6.2 Good application practice](https://tehdas.eu/wp-content/uploads/2025/10/d6.2-guideline-for-data-users-on-good-application-and-access-practice.pdf)                                                                                                 | Partial     | Applications with purposes, decision clock, fees, results, revocation                                              | The ten-section form only in part; one dataset per application; no amendment; public-sector purposes not limited                                                             | [#717](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/717), [#1031](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/1031)                                                                            |
| [D6.3 Procedures and formats](https://tehdas.eu/wp-content/uploads/2026/05/d6.3-guideline-for-health-data-access-bodies-on-the-procedures-and-formats-for-data-access.pdf)                                                                               | Partial     | Completeness, clock, criteria, refusal reasons, register, revocation, activity report                              | Templates (Art. 70), partial grants, the applicant's 28 days to accept or appeal, holders consulted before the decision                                                      | [#717](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/717), [#1031](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/1031)                                                                            |
| [D6.4 DAAMS](https://tehdas.eu/wp-content/uploads/2026/06/d6.4-data-access-application-management-system-daams-technical-specification-for-health-data-access-bodies.pdf)                                                                                | Partial     | Applications, requests, permits, the Art. 68(4) clock                                                              | Of 94 elements, 31 the same, 33 different, 30 missing: statuses, decision and permit as one record, no decision card, one dataset per application, no national contact point | [#1031](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/1031), [#713](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/713)                                                                            |
| [D7.1 Using data in the SPE](https://tehdas.eu/wp-content/uploads/2025/10/guideline-on-how-to-use-data-in-a-secure-processing-environment.pdf)                                                                                                           | Partial     | The permit gate, aggregates only (k ≥ 5), pseudonyms, the audit chain, revocation                                  | The review before export; the person named in the permit and a second factor                                                                                                 | [#716](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/716), [#1030](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/1030)                                                                            |
| [D7.2 Minimisation, pseudonymisation, synthetic data](https://tehdas.eu/wp-content/uploads/2026/06/d7.2-guideline-for-health-data-access-bodies-on-data-minimisation-pseudonymisation-anonymisation-and-synthetic-data.pdf)                              | Partial     | Suppression of groups under five                                                                                   | Generalisation and synthetic data; a pseudonym per project                                                                                                                   | [#999](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/999), [#475](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/475)                                                                              |
| [D7.3 Common IT infrastructure](https://tehdas.eu/wp-content/uploads/2026/05/d7.3-technical-specification-for-health-data-access-bodies-on-the-implementation-of-the-common-it-infrastructure.pdf)                                                       | Partial     | Federated discovery, the query proxy                                                                               | No national contact point, no eDelivery; deferred until the Art. 75 implementing act                                                                                         | [#713](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/713)                                                                                                                                                         |
| [D7.4 SPE specification](https://tehdas.eu/wp-content/uploads/2026/06/d7.4-technical-specification-for-health-data-access-bodies-on-the-implementation-of-secure-processing-environments.pdf)                                                            | Partial     | Confidential containers: a sealed extract, a key released only to attested hardware, logs kept 12 months           | Strong identification and MFA, a workspace per person and permit, the export review, the remote desktop                                                                      | [#716](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/716), [#1030](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/1030), [#587](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/587) |
| [D8.1 Opt-out](https://tehdas.eu/wp-content/uploads/2026/06/d8.1-guideline-for-health-data-access-bodies-on-implementing-opt-out-from-the-secondary-use-of-health-data.pdf)                                                                              | Implemented | Opt-out without a reason, reversal, history, confirmation, the Art. 71(4) exception, the filter in the query proxy | The Art. 71(3) permit-date rule, other holders, the activity report's count                                                                                                  | [#696](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/696), [#1032](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/1032)                                                                            |
| [D8.2 Significant findings](https://tehdas.eu/wp-content/uploads/2026/06/d8.2-guideline-for-health-data-access-bodies-on-implementing-the-obligation-of-notifying-the-natural-person-on-a-significant-finding-from-the-secondary-use-of-health-data.pdf) | Not covered | Only a policy duty to report an incident                                                                           | The path from a finding to the person                                                                                                                                        | [#996](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/996)                                                                                                                                                         |

## The wave-3 drafts

| Draft                                                                                                                                                                                                                | Status                               | Where in the hub                                                                                         | What is missing                                                                          | Issues                                                                                                                                               |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ | -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Framework for collaboration](https://tehdas.eu/wp-content/uploads/2026/05/draft-guideline-on-a-framework-for-collaboration.pdf)                                                                                     | Partial                              | Policies, participant onboarding                                                                         | Ethics review and IP protection are not modelled; not taken over now                     |                                                                                                                                                      |
| [Third-country access and transfer](https://tehdas.eu/wp-content/uploads/2026/05/draft-guideline-for-health-data-access-bodies-on-international-and-third-country-access-and-transfer-of-electronic-health-data.pdf) | Partial                              | Transfers outside the EU/EEA refused by policy                                                           | No application path for applicants outside it; not taken over now                        |                                                                                                                                                      |
| [Data enrichment](https://tehdas.eu/wp-content/uploads/2026/05/draft-guideline-for-data-enrichment.pdf)                                                                                                              | Not covered                          | Technical enrichment only (FHIR to OMOP, terminologies)                                                  | Returning enriched datasets to the access body                                           | [#998](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/998)                                                                            |
| [Navigating the catalogue](https://tehdas.eu/wp-content/uploads/2026/05/draft-guideline-for-data-users-navigating-the-catalogue.pdf)                                                                                 | Partial                              | Catalogue, federated discovery, natural-language queries                                                 | No connection to HealthData@EU                                                           | [#713](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/713)                                                                            |
| [Linkage of datasets](https://tehdas.eu/wp-content/uploads/2026/05/draft-guideline-for-health-data-access-bodies-on-linkage-of-health-datasets.pdf)                                                                  | Partial                              | Research pseudonyms in the trust centre                                                                  | The linking process itself (method, validation, quality report); a pseudonym per project | [#475](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/475), [#587](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/587) |
| [Citizen Information Point](https://tehdas.eu/wp-content/uploads/2026/05/draft-guideline-for-health-data-access-bodies-on-informing-natural-persons-about-the-use-of-health-dataxxxcitizen-information-point-.pdf)   | Partial                              | The information page                                                                                     | It needs a sign-in, so a citizen cannot read it                                          | [#995](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/995)                                                                            |
| [Handling research outcomes](https://tehdas.eu/wp-content/uploads/2026/05/draft-guideline-for-data-users-on-handling-research-outcomes.pdf)                                                                          | Implemented for Art. 61(4) reporting | Results reported under the permit, 18-month deadline, on the information page and in the activity report | The review before export; significant findings                                           | [#716](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/716), [#996](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/996) |

## Where the hub deviates on purpose

- **A query SPE.** D7.1 and D7.4 describe a workspace a user logs into, with a
  remote desktop. The hub's secure processing environment answers queries:
  the proxy asks the workspaces, and only aggregates leave. The confidential
  containers go beyond what D7.4 asks for the protection of the data.
- **Opted-out persons in extracts.** An extract for a workspace carries an
  opted-out person with a label rather than leaving them out; the query proxy
  filters them before any answer leaves.
- **A trusted data holder decides data requests itself.** D6.4 has the holder
  propose and the access body decide.

## Check it yourself

- The catalogue against HealthDCAT-AP Release 8, as the PR Gate runs it:
  `python3 scripts/healthdcat-ap/validate.py services/neo4j-proxy/__tests__/fixtures/healthdcat-ap-r8.jsonld`.
- The application, the decision and the permit: sign in as `researcher`, then
  as `regulator`, on `/applications`, `/compliance` and `/permits`.
- The opt-out: sign in as `patient1` and opt out on `/patient/research`; the query proxy
  leaves the person out of every answer.
- The roadmap of this work:
  [/docs/roadmap, epic #990](https://ma3u.github.io/MinimumViableHealthDataspacev2/docs/roadmap#e990).

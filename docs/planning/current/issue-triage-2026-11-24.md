# Issue triage, 2026-11-24

All 102 open issues checked against the code on `main` (`817abb47`), CI, the
109 closed issues and the [Roadmap to 2031](https://github.com/users/ma3u/projects/1)
Project. 95 stay open; 7 were closed, 2 at first and 5 after the decision below.

## The taxonomy

Every open issue now carries four things, and only these four:

| Dimension | Where                                        | Values                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| --------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Epic      | parent issue (sub-issues)                    | [#959](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/959) identity, [#960](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/960) Simpl-Open, [#961](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/961) secondary use, [#962](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/962) health standards, [#963](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/963) connector, [#964](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/964) Klarbefund, [#965](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/965) security and operations, [#966](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/966) quality, [#967](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/967) demos, [#990](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/990) TEHDAS2; all under the plan [#725](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/725) |
| Lane      | Project field `Lane`                         | EHDS regulation, Identity and wallets, Simpl-Open, Dataspace protocols, Health standards, Permits and processing, Klarbefund and patient record, Security and operations, Quality and CI, Demos and partners                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Priority  | Project field `Priority` and label `P1`–`P3` | P1: due before 26 March 2027, and every bug or security gap. P2: by 26 March 2029. P3: no deadline                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Type      | label                                        | `bug`, `enhancement`, `documentation`, `security`, `dependencies`, `upstream`, `question`, `epic`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |

The label and the Project field say the same priority, so `gh issue list --label P1`
gives the same list as the Project's view. Topic labels (`EHDS-compliance`,
`simpl`, `azure`, `edc`, ...) stay as they are.

What changed on 2026-11-24:

- Eight issues were not in the Project: #1074, #1123, #1140, #1144, #1145, #1167, #1203, #1205. Added, with priority, lane and parent.
- Priorities set where they were missing (#1043 to #1047, #1105, #1132, #1133 and the eight above); #1032 moved from P2 to P1 because it is a bug.
- Priority labels synced to the Project on 78 issues; a type label added where none was set (#375, #655, #884, #888, #889, #891, #915, #1123, #1167, #1203, #1205).
- The epics #963 to #967 and #990 now hang under #725 like the others.
- Nine closed issues still showed an open status in the Project (#97, #359, #435, #577, #755, #881, #927, #951, #1029); set to Done.

## Closed in this triage

- [#765](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/765) CodeQL (Swift) cancelled at the timeout: every run since 2026-11-18 ends in success, the Monday schedule of 2026-11-23 included.
- [#994](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/994) TEHDAS2 final conference: took place on 16 Nov 2026; the guideline re-rating continues in #997.

## Decided with Matthias, 2026-11-24

Closed:

Kept open, because the check showed the proposal was wrong:

- [#891](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/891): CFM is not retired on Azure. [#927](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/927) retired it with EDC 0.18, but the fork `v0.0.8-mvhd.1` runs there again since 2026-11-12 ([#973](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/973)), so the question stands.
- [#1043](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/1043) to [#1047](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/1047), [#1105](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/1105): the same fork runs these patches on Azure; #1105 waits upstream on the Eclipse Contributor Agreement.
- [#1123](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/1123): the answer is ADR-094 (merged in #1124), but the issue holds eight build tasks. Retyped from `question` to `enhancement`.

No open issue repeats a closed one. #696 and #697 carry the remainder of
the closed #694 on purpose; #929 continues the closed #8.

## Open issues by priority

The P1 list is in the order to work on it. P2 and P3 are grouped by epic.

### P1: due before 26 March 2027, and every bug or security gap

1. [#1205](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/1205) EEHRxF: align the register with the draft implementing act and send feedback by 21 Dec 2026. _21 Dec 2026: Matthias submits the feedback with EU Login_
2. [#1140](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/1140) npm audit: picomatch ReDoS (GHSA-fc5q-39xc-vjpf) has no fix and blocks every push; build-time only in the UI. _17 Dec 2026: the npm audit exception expires; picomatch 4.0.7 is still the latest_
3. [#779](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/779) NLQ: run generated Cypher in a read-only session. _security: refuse `LOAD CSV` and `apoc.load._` in generated Cypher (task 1b)\*
4. [#1032](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/1032) Activity report: item (e) counts the Art. 71 opt-outs recorded in the graph. _bug: item (e) of the activity report is hard-coded_
5. [#514](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/514) PUBLISHED*BY points at Participant in some seeds and Organization in others, so each catalogue misses half the publishers. \_bug: half the publishers are missing from each catalogue*
6. [#928](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/928) Enforce the EHDS policy constraints in the connector, not only in the hub. _security: the connector does not enforce the EHDS constraints_
7. [#442](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/442) Flexible Server: narrow the firewall to the ACA egress IP, verify TLS certificates, and move the CFM agents' DSN (#412 follow-up). _security: firewall and TLS verification on the Flexible Server (needs `az login`)_
8. [#542](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/542) Local compose: both data planes crash on start, so no negotiation or transfer reaches the audit trail. _bug: recheck against #1204 and #973 first_
9. [#1167](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/1167) NeDRex (REPO4EU) mapping test and call on 19 January 2027. _19 Jan 2027: NeDRex call_
10. [#708](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/708) [EHDS GAP] EUDI Wallet sign-in to Implementing Regulation (EU) 2026/2099: SD-JWT VC, encrypted responses, the PID bound to one record. _26 Mar 2027; one task left: our own relying-party certificate, with #557 and #182_
11. [#711](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/711) [SIMPL GAP] Run the DSP compatibility kit against a Simpl-Open connector, both directions. _26 Mar 2027: 1 of 65 TCK tests passes against `simpl-edc`_
12. [#934](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/934) [PLAN] Simpl interoperability on one use case: AlphaKasse rewards an active year. _26 Mar 2027: 11 of 24 steps_
13. [#709](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/709) [EHDS GAP] European Business Wallet: a person applies for a data permit on behalf of an organisation, and the access body verifies the mandate. _26 Mar 2027: not started, ADR and spike first_

Epics with P1 work: [#725](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/725) Plan · [#959](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/959) Identity and wallets · [#960](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/960) Simpl-Open · [#961](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/961) Secondary use · [#962](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/962) Health standards · [#963](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/963) Connector platform · [#965](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/965) Security and operations · [#966](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/966) Quality · [#990](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/990) TEHDAS2

### P2: by 26 March 2029

**Identity and wallets** ([#959](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/959))

- [#182](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/182) [PLAN] German National EUDI Wallet + update #72 citizen consent demo — EHDS Integration Platform
- [#557](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/557) [PLAN] Keycloak 27: major upgrade and wallet support (OID4VCI issuance, OID4VP verification) for the citizen side
- [#712](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/712) [EHDS GAP] Healthcare attribute attestations (2026/2099) and health professionals signing in with a wallet

**Simpl-Open** ([#960](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/960))

- [#719](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/719) [SIMPL GAP] HealthDCAT-AP Release 8 as a profile of Simpl's DCAT-AP model and resource descriptions
- [#720](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/720) [SIMPL GAP] A data permit carried out as bilateral contracts: one Art. 68 permit, one DSP agreement per holder
- [#721](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/721) [SIMPL GAP] The Art. 71 opt-out at the holder's connector: a person filter at handover, and other holders
- [#722](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/722) [SIMPL GAP] Several access bodies, several Governance Authorities: two federated data spaces

**Secondary use** ([#961](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/961))

- [#204](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/204) [FEATURE] Non-repudiable contract agreements: eIDAS-sealed data permits + detached agreement evidence for DSP 2025-1
- [#475](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/475) [PLAN] A research identity per patient: researchers see a pseudonym, never a name or a birth date
- [#587](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/587) [AUDIT] Audit trail: every data access on the chain, write-once evidence copy, signed digest, export, Trust Center status (#418 Plane 2)
- [#649](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/649) feat(spe): an Iceberg table catalog (Gravitino or Polaris) behind the OMOP data plane; HealthDCAT-AP stays the dataspace catalogue
- [#696](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/696) Art. 71 opt-out, after #694: the permit date, other holders, the data plane exception, and the last proposal-era labels
- [#716](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/716) [EHDS GAP] Art. 73 secure processing environment: an isolated workspace per permit, results released after review
- [#717](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/717) [EHDS GAP] Applications under Chapter IV: Art. 54 prohibited purposes, Art. 81 complaints, Art. 70 templates
- [#833](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/833) SPE follow-ups after phase 21: start on demand, off-hours test, ingest restarts, permit hashes on /admin/policies
- [#889](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/889) Standard policies on the connector: SPE routing for the permit policy, then the seed (ADR-077)
- [#915](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/915) SPE import on Azure: load a transfer as a sealed extract through the Trustee
- [#1132](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/1132) [PLAN] SPE workspace per permit: a notebook with pre-approved tools, the permit's data and storage, inside the confidential container (TEHDAS2 D7.1, D7.4)
- [#1133](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/1133) [PLAN] SPE airlock: exports and imports reviewed by the access body, with automatic disclosure checks and file hashes on the audit chain (TEHDAS2 D7.1, D7.4)

**Health standards** ([#962](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/962))

- [#413](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/413) Lab reports: specimen type end to end and ISO 15189:2022 report content (7.4.1.6 to 7.4.1.8)
- [#697](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/697) [PLAN] EHDS implementing acts 2026: dataset descriptions to 2026/2098 and HealthDCAT-AP Release 8, Art. 78 label, Art. 75 HealthData@EU, new Chapter IV duties
- [#713](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/713) [EHDS GAP] Art. 75 HealthData@EU: a national contact point adapter over eDelivery
- [#714](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/714) [EHDS GAP] Art. 79 EU dataset catalogue: publish the HealthDCAT-AP catalogue for harvesting
- [#715](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/715) [EHDS GAP] Art. 78 quality and utility label in the dataset metadata
- [#718](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/718) [EHDS GAP] Art. 7 portability in the European exchange format, on the current HL7 Europe guides
- [#929](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/929) Federated catalogue: crawl the connectors' live offers on EDC 1.0
- [#1144](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/1144) [EHDS GAP] EEHRxF: validate what /eehrxf claims, on the current HL7 Europe guides (E1 of #1143)

**Connector platform** ([#963](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/963))

- [#888](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/888) Azure: a data plane that serves HttpData assets, and siglet token renewal
- [#890](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/890) Negotiate and transfer pages: own rows first, finish a transfer, translate the demo note
- [#930](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/930) EDC 1.0.0 final: rebuild the launchers and re-run the gate
- [#971](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/971) TCKs: pin dsp-tck, dcp-tck and dps-tck and run all three in CI
- [#972](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/972) Protocol versions: DSP 2025-1 errata, DCP 1.0.1 and Data Plane Signaling 1.0 against the hub
- [#973](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/973) Local stack: drop CFM as on Azure (ADR-078), or follow eclipse-cfm
- [#1203](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/1203) Upstream release: eclipse-dataspacetck/dcp-tck v1.2.2

**Klarbefund** ([#964](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/964))

- [#473](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/473) [PLAN] Klarbefund: Connect to EHDS, sign in with a QR code from the patient screen
- [#513](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/513) Klarbefund: scan rows still unread after the 2026-10-04 audit
- [#655](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/655) Klarbefund evidence: open items after the 2026-10-15 run (independent pentest, pilot, MDR opinion, operator documents, next result types)
- [#760](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/760) My own data in my EHDS record: Klarbefund lab values and Apple Health trends in the Patient Journey
- [#1120](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/1120) [PLAN] Care between providers: the hospital's discharge report and lab results reach the GP, the person sees and restricts who reads them (Art. 8, 9, 11 to 15)

**Security and operations** ([#965](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/965))

- [#585](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/585) [OBS] Log volume and cost: EDC retry backoff, a clean week under 200 MB/day, volume alert, first bill (#418 Phase A)
- [#586](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/586) [OBS] Operations: traces and structured logs in the UI, EDC and Keycloak; alert rules; console logs to the collector (#418 Plane 1)

**Quality** ([#966](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/966))

- [#375](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/375) 55% of the successful-path API checks pass on an empty answer

**Demos** ([#967](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/967))

**TEHDAS2** ([#990](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/990))

- [#995](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/995) Citizen Information Point without sign-in: an ADR that supersedes ADR-044 for /information
- [#996](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/996) TEHDAS2 D8.2 significant findings: the access body assesses, the person is told
- [#997](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/997) TEHDAS2 wave 3: re-rate the seven guidelines on their final versions
- [#1030](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/1030) Data users: the signed-in person must be named in the permit, and sign in with a second factor (TEHDAS2 D7.1, D7.4)
- [#1031](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/1031) Permit lifecycle to D6.4: statuses, a decision card, versions and amendments, a decision per dataset
- [#1033](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/1033) HealthDCAT-AP: serve geographical coverage, collection purpose, data language and publisher type (TEHDAS2 D5.1)

### P3: no deadline

**Simpl-Open** ([#960](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/960))

- [#723](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/723) [SIMPL GAP] Art. 62 fees against Simpl's monetisation model (BP02E, BP14): map and comment
- [#724](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/724) [SIMPL GAP] DOME marketplace: health analytics services findable, usable only inside an SPE (BP02F, BP02G, SA12)

**Secondary use** ([#961](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/961))

- [#894](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/894) One data journey dashboard: offer, contract, transfer, SPE import and policy enforcement in one list

**Health standards** ([#962](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/962))

- [#16](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/16) [PLAN] CDISC SDTM export for regulatory submissions (FDA / PMDA / EMA)
- [#20](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/20) [FEATURE] Ingest clinical guidelines (AWMF Leitlinien) as Layer 6 via Docling + Neo4j GraphRAG
- [#884](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/884) HealthDCAT-AP validator applies Dataset shapes to the catalogue (dcat:Catalog subClassOf dcat:Dataset), fixed upstream in Release 9
- [#1145](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/1145) [PLAN] A cancer journey on the HL7 Europe Common Cancer Model, in FHIR and OMOP (E7 of #1143)

**Connector platform** ([#963](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/963))

- [#891](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/891) Azure participant contexts stay CREATED after activation
- [#1043](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/1043) CFM fork, patch a: the agents' token exchange runs against Keycloak, not only jwtlet
- [#1044](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/1044) CFM fork, patch b/c: the IdentityHub and EDC-V agents provision for IdentityHub's STS
- [#1045](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/1045) CFM fork, patch d: dispose carries the participant context id to the agents
- [#1046](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/1046) CFM fork, patch e: the EDC-V agent accepts 204 when a participant context is deleted
- [#1047](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/1047) CFM fork, patch f: the issuer holder is keyed by the participant context id
- [#1105](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/1105) CFM fork, patch g: the onboarding agent accepts 204 when a credential is revoked

**Klarbefund** ([#964](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/964))

- [#478](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/478) Klarbefund into the real ePA: find a statutory health insurer to partner with

**Security and operations** ([#965](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/965))

- [#571](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/571) [PLAN] After the load and stress tests: Neo4j and /api/graph first, then the UI, the faults found, and the remaining runs

**Quality** ([#966](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/966))

- [#338](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/338) Specifications are documents, not oracles: 1 of 8 can fail a build, and API drift has doubled since August
- [#839](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/839) Developer manual: gaps found while documenting the SDLC and API tests
- [#1074](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/1074) API docs follow-up: what the check of 2026-11-11 found in the hub and left open

**Demos** ([#967](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/967))

- [#782](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/782) Multilingual demonstrator and national EHDS implementation profiles: effort analysis and phasing
- [#1123](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/1123) National health data with a research partner: it stays at the source; the hub takes descriptions, aggregates and counts

**TEHDAS2** ([#990](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/990))

- [#998](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/998) TEHDAS2 data enrichment (M5.4): return enriched datasets to the access body
- [#999](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/999) TEHDAS2 D7.2: anonymisation beyond k ≥ 5 suppression: generalisation and synthetic data

## What to do next

1. **#1205**, by Matthias: review, then submit the EEHRxF feedback (`docs/submissions/eehrxf-feedback-2026-11/`) before 21 December.
2. **#1140**: the npm audit exception for picomatch expires on 17 December and no fixed version exists. Remove the dependency path (Scalar's `@unhead/vue` build plugins) or extend the exception with a reason; otherwise every push fails on 18 December.
3. **#779**, then **#1032** and **#514**: one security gap and two bugs, each a small change with a test.
4. **#928** and **#442**: the larger security gaps; #442 needs a live Azure window.

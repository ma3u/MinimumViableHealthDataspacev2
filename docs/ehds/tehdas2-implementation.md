# What the integration hub implements of the TEHDAS2 guidance

[TEHDAS2](https://tehdas.eu/project/), the second joint action towards the
European Health Data Space, publishes non-binding guidelines and technical
specifications for the secondary use of health data. This page maps each of
its 21 documents (14 final, 7 third-wave drafts) to the hub's components, with
the status, the gap and how much the document matters for the live demo.

Checked against the repository on 2026-11-09. Article-level evidence (routes,
tests, issues) is in [the EHDS article table](regulation-implementation.md);
this page does not repeat it. The mapping is at component and article level,
not requirement by requirement against the PDFs.

- **Implemented**: the hub carries out what the document describes, end to end.
- **Partial**: part of it is there; the gap column says what is missing.
- **Open**: nothing does it yet.
- **Demo relevance High**: part of the clickable journey on
  [ehds.mabu.red](https://ehds.mabu.red) (discovery, application, permit, SPE,
  opt-out, results).

## Summary

The hub implements 7 documents, covers 12 in part and does not yet cover 2:
D8.2 significant findings, and the return of enriched data (data enrichment).

- **Strongest coverage:** opt-out (D8.1), HealthDCAT-AP Release 8 (D5.1, 0 SHACL
  violations), fees and penalties (D4.1), using data in the SPE (D7.1), research
  outcomes and linkage (third wave).
- **Largest gaps:** no connection to HealthData@EU (no national contact point,
  no eDelivery, D7.3); Art. 54 prohibitions not checked on the application
  (D5.2); no delivery flow after a permit (D6.1); anonymisation only by
  suppressing counts below 5 (D7.2).
- **Timing:** TEHDAS2 ends on 31 December 2026; its
  [final conference](https://tehdas.eu/event/tehdas2-final-conference/) is on
  16 November 2026 in Brussels. The third-wave documents are expected in final
  form in autumn 2026.

## Components

| Component                        | Role in the EHDS flow                                                                           | In the repository                                                                                                                                                       |
| -------------------------------- | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Catalogue                        | HealthDCAT-AP Release 8, dataset editor, JSON-LD output, SHACL validation                       | [`healthdcat-ap.ts`](../../services/neo4j-proxy/src/healthdcat-ap.ts), [`/catalog`](../../ui/src/app/catalog), [`validate.py`](../../scripts/healthdcat-ap/validate.py) |
| Federated discovery              | Crawler and enricher across participant catalogues                                              | [`catalog-crawler`](../../services/catalog-crawler), [`catalog-enricher`](../../services/catalog-enricher)                                                              |
| Application and permit workflow  | Applications (Art. 67), requests (Art. 69), permits with the decision clock (Art. 68), register | [`applications.ts`](../../ui/src/lib/applications.ts), [`permits.ts`](../../ui/src/lib/permits.ts), [`permit-gate.ts`](../../ui/src/lib/permit-gate.ts)                 |
| Access body desk and supervision | Review desk, fees, penalties, activity report                                                   | [`/compliance`](../../ui/src/app/compliance), [`/supervision`](../../ui/src/app/supervision), [`fees.ts`](../../ui/src/lib/fees.ts)                                     |
| Policy engine (ODRL)             | Purposes, prohibitions and duties as contract terms                                             | [`odrl-engine.ts`](../../ui/src/lib/odrl-engine.ts), [ADR-077](../ADRs/ADR-077-a-minimal-set-of-standard-data-sharing-policies.md)                                      |
| Query proxy                      | Only aggregates leave, k-anonymity floor of 5, NLQ, opt-out filter                              | [`neo4j-proxy`](../../services/neo4j-proxy)                                                                                                                             |
| Secure processing environment    | Two workspaces as ACI confidential containers, key release through Trustee                      | [`spe-loader`](../../services/spe-loader), [ADR-069](../ADRs/ADR-069-two-spe-workspaces-as-aci-confidential-containers.md)                                              |
| Trust centre                     | Provider and research pseudonyms, linkage                                                       | [`seed-trust-center.cypher`](../../neo4j/seed-trust-center.cypher)                                                                                                      |
| Citizen side                     | Opt-out, information point, EUDI wallet sign-in                                                 | [`/patient`](../../ui/src/app/patient), [`/information`](../../ui/src/app/information), [`opt-out.ts`](../../ui/src/lib/opt-out.ts)                                     |

Underneath sit EDC-V, DCore and CFM (the JAD stack) for DSP 2025-1 and DCP 1.0,
and the Neo4j graph with FHIR R4, OMOP CDM 5.4 and the terminologies.

## Final deliverables (first and second wave)

Of the 14 final documents, 5 are implemented, 8 in part and 1 is open
([results by user group](https://tehdas.eu/results-by-user-group/), each with a
Zenodo DOI).

| Deliverable                                                                                                                                                                                                                                              | Component                                  | Status      | Gap, issue                                                                                                                                                                                       | Demo relevance |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------- |
| [D4.1 Fees and penalties](https://tehdas.eu/wp-content/uploads/2026/05/d4.1-guideline-for-health-data-access-bodies-on-fees-and-penalties-for-non-compliance-related-to-the-ehds-regulation.pdf)                                                         | Access body desk and supervision           | Implemented | Amounts are fictional; fines are recorded, not collected                                                                                                                                         | Low            |
| [D5.1 Data description](https://tehdas.eu/wp-content/uploads/2025/10/guideline-for-data-holders-on-data-description.pdf)                                                                                                                                 | Catalogue                                  | Implemented | The health category is set by rule from the kind of dataset ([#697](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/697))                                                          | High           |
| [D5.2 Minimum categories, purposes, prohibitions](https://tehdas.eu/wp-content/uploads/2026/06/d5.2-guideline-for-health-data-access-bodies-on-minimum-categories-and-limitations-on-the-reuse-of-health-data.pdf)                                       | Permit workflow, policy engine             | Partial     | Art. 54 prohibitions are not checked on the application ([#697](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/697))                                                              | Medium         |
| [D5.3 National metadata catalogue](https://tehdas.eu/wp-content/uploads/2025/10/technical-specification-for-health-data-access-bodies-on-the-national-metadata-catalogue.pdf)                                                                            | Catalogue, federated discovery             | Partial     | Nothing is published to the EU catalogue (Art. 79)                                                                                                                                               | High           |
| [D6.1 Making data available (data holders)](https://tehdas.eu/wp-content/uploads/2026/06/d6.1-guideline-for-health-data-holders-on-making-personal-and-non-personal-electronic-health-data-available-for-reuse.pdf)                                      | Catalogue editor, EDC data plane           | Partial     | No delivery flow after a permit is granted (Art. 60)                                                                                                                                             | Medium         |
| [D6.2 Good application and access practice](https://tehdas.eu/wp-content/uploads/2025/10/d6.2-guideline-for-data-users-on-good-application-and-access-practice.pdf)                                                                                      | Permit workflow (`/applications`)          | Implemented |                                                                                                                                                                                                  | High           |
| [D6.3 Procedures and formats for data access](https://tehdas.eu/wp-content/uploads/2026/05/d6.3-guideline-for-health-data-access-bodies-on-the-procedures-and-formats-for-data-access.pdf)                                                               | Permit workflow, access body desk          | Partial     | Forwarding under Art. 67(3) exists only as seed data; no templates (Art. 70) ([#697](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/697))                                         | High           |
| [D6.4 Data Access Application Management System (DAAMS)](https://tehdas.eu/wp-content/uploads/2026/06/d6.4-data-access-application-management-system-daams-technical-specification-for-health-data-access-bodies.pdf)                                    | Permit workflow, access body desk          | Partial     | Covered functionally; the data model and interfaces are not checked against the specification                                                                                                    | High           |
| [D7.1 Using data in a secure processing environment](https://tehdas.eu/wp-content/uploads/2025/10/guideline-on-how-to-use-data-in-a-secure-processing-environment.pdf)                                                                                   | Secure processing environment, query proxy | Implemented |                                                                                                                                                                                                  | High           |
| [D7.2 Minimisation, pseudonymisation, anonymisation, synthetic data](https://tehdas.eu/wp-content/uploads/2026/06/d7.2-guideline-for-health-data-access-bodies-on-data-minimisation-pseudonymisation-anonymisation-and-synthetic-data.pdf)               | Query proxy, trust centre                  | Partial     | No anonymisation beyond suppressing counts below 5                                                                                                                                               | Medium         |
| [D7.3 Common IT infrastructure](https://tehdas.eu/wp-content/uploads/2026/05/d7.3-technical-specification-for-health-data-access-bodies-on-the-implementation-of-the-common-it-infrastructure.pdf)                                                       | Federated discovery, query proxy           | Partial     | No national contact point, no eDelivery ([ADR-064](../ADRs/ADR-064-simpl-open-through-the-outside-agent-dcp-path.md), [#697](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/697)) | Low            |
| [D7.4 Secure processing environments](https://tehdas.eu/wp-content/uploads/2026/06/d7.4-technical-specification-for-health-data-access-bodies-on-the-implementation-of-secure-processing-environments.pdf)                                               | Secure processing environment              | Partial     | See Art. 73 in [the article table](regulation-implementation.md); audit log kept 12 months ([ADR-068](../ADRs/ADR-068-a-sovereign-confidential-spe-on-confidential-containers-and-trustee.md))   | High           |
| [D8.1 Opt-out](https://tehdas.eu/wp-content/uploads/2026/06/d8.1-guideline-for-health-data-access-bodies-on-implementing-opt-out-from-the-secondary-use-of-health-data.pdf)                                                                              | Citizen side, query proxy                  | Implemented | Other data holders are not marked ([#696](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/696)); [ADR-062](../ADRs/ADR-062-the-art-71-opt-out-is-a-record-and-a-label.md)          | High           |
| [D8.2 Significant findings](https://tehdas.eu/wp-content/uploads/2026/06/d8.2-guideline-for-health-data-access-bodies-on-implementing-the-obligation-of-notifying-the-natural-person-on-a-significant-finding-from-the-secondary-use-of-health-data.pdf) | Policy engine                              | Open        | Only the ODRL duty `reportIncident` ([ADR-077](../ADRs/ADR-077-a-minimal-set-of-standard-data-sharing-policies.md), proposed); no assessment or notification of the person                       | Low            |

## Third wave (drafts)

Of the 7 drafts, 2 are implemented, 4 in part and 1 is open. The rating is
against the drafts of May 2026
([public consultations](https://tehdas.eu/public-consultations/)); revisit it
when the final versions appear on [the results page](https://tehdas.eu/results/).

| Draft                                                                                                                                                                                                                                          | Component                                   | Status      | Gap                                                                                                                                                 | Demo relevance           |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| [Framework for collaboration (M4.2)](https://tehdas.eu/wp-content/uploads/2026/05/draft-guideline-on-a-framework-for-collaboration.pdf)                                                                                                        | Policy engine, participant onboarding (CFM) | Partial     | Ethics review and IP protection are not modelled; the trusted data holder procedure covers requests only (Art. 72)                                  | Low                      |
| [International and third-country access and transfer](https://tehdas.eu/wp-content/uploads/2026/05/draft-guideline-for-health-data-access-bodies-on-international-and-third-country-access-and-transfer-of-electronic-health-data.pdf)         | Policy engine                               | Partial     | Transfers are only blocked, by `spatial isPartOf EU/EEA` and `transferOutsideEU` (ADR-077); no application path for applicants from third countries | Low                      |
| [Data enrichment (M5.4)](https://tehdas.eu/wp-content/uploads/2026/05/draft-guideline-for-data-enrichment.pdf)                                                                                                                                 |                                             | Open        | Enriched datasets are not returned to the access body; the hub only enriches technically (FHIR to OMOP, terminologies, catalogue enricher)          | Low                      |
| [Data users navigating the catalogue (M5.5)](https://tehdas.eu/wp-content/uploads/2026/05/draft-guideline-for-data-users-navigating-the-catalogue.pdf)                                                                                         | Catalogue, federated discovery, NLQ         | Partial     | No connection to the HealthData@EU central platform                                                                                                 | Medium                   |
| [Linkage of health datasets](https://tehdas.eu/wp-content/uploads/2026/05/draft-guideline-for-health-data-access-bodies-on-linkage-of-health-datasets.pdf)                                                                                     | Trust centre                                | Implemented | Linkage through research pseudonyms runs on seed data                                                                                               | High                     |
| [Informing natural persons (Citizen Information Point)](https://tehdas.eu/wp-content/uploads/2026/05/draft-guideline-for-health-data-access-bodies-on-informing-natural-persons-about-the-use-of-health-dataxxxcitizen-information-point-.pdf) | Citizen side (`/information`)               | Partial     | The page needs a sign-in ([ADR-044](../ADRs/ADR-044-every-api-route-needs-a-session.md)), so it is not public                                       | Medium; High once public |
| [Handling research outcomes](https://tehdas.eu/wp-content/uploads/2026/05/draft-guideline-for-data-users-on-handling-research-outcomes.pdf)                                                                                                    | Permit workflow, policy engine              | Implemented | Art. 61(4) through `/api/compliance/results` and the ODRL duties `publishResults` and `attribute`                                                   | High                     |

## Next steps

D6.4 is the biggest lever: the hub already covers the DAAMS workflow
functionally, so a check against the specification turns it into a reference
implementation.

1. D6.4: compare the application and permit schema with the DAAMS data model; file the differences as issues.
2. D8.2: an assessment and notification path for significant findings (the access body assesses, the person is told).
3. D5.2: check the Art. 54 prohibitions on the application ([#697](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/697)).
4. Make the Citizen Information Point reachable without a sign-in, as an exception to ADR-044.
5. Re-rate the third-wave table when the final versions are published.

## Keeping this page true

When a change moves a TEHDAS2 document's status, change its row in the same
pull request and the matching article row in
[regulation-implementation.md](regulation-implementation.md).

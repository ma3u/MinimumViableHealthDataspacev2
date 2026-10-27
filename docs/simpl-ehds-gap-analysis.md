# Simpl-Open and the European Health Data Space: gap analysis

- **Status:** Final, as of 27 October 2026
- **Discussion:** [#701, Simpl-Open vs. this EHDS hub](https://github.com/ma3u/MinimumViableHealthDataspacev2/discussions/701)
- **Decision:** [ADR-064](ADRs/ADR-064-simpl-open-through-the-outside-agent-dcp-path.md)
- **Plan:** [#725, closing the EHDS and Simpl-Open gaps](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/725), one issue per gap, prioritised
- **Compares:** Simpl-Open as its programme describes it; the European Health
  Data Space as adopted, [Regulation (EU) 2025/327](https://eur-lex.europa.eu/eli/reg/2025/327/oj/eng),
  with its implementing acts; and this hub, whose article-by-article status is
  in [What the integration hub implements of the EHDS Regulation](ehds/regulation-implementation.md).
- **Article numbers** are those of the adopted Regulation ([numbering
  reference](ehds-article-numbering.md)).

The hub is a demonstrator on synthetic data with fictional organisations. When
this document says "the hub implements", it means the hub shows the duty end to
end with a test, not that it is an access body.

## Summary

Simpl-Open and the hub share their foundation: both run Eclipse EDC connectors
and speak the Dataspace Protocol. Above that they differ on identity, catalogue
metadata, policy language, contracts and fees. Simpl-Open is generic middleware
that treats the data it moves as opaque; the EHDS needs things that only work
if the middleware knows the data is about persons: an opt-out that removes a
person from every secondary-use query (Art. 71), a permit that binds an access
body, holders and a user (Art. 68), regulated fees with category reductions
(Art. 62), and processing only inside a secure processing environment
(Art. 73).

The way in is the path Simpl describes for connectors outside its own agent:
decentralised claims (DCP) through an IdentityHub, with credentials issued by
the data space's Governance Authority. The hub speaks DCP 1.0, so it can meet
Simpl-Open there without running a Simpl agent, and keeps the EHDS rules in its
own health extension ([ADR-064](ADRs/ADR-064-simpl-open-through-the-outside-agent-dcp-path.md)).

The Simpl requirements that touch the EHDS most directly are at "proposed"
status and open for comment: DOME onboarding and discovery (BP02F, BP02G), AI
services in DOME (SA12) and the monetisation model (BP02E).

## 1. The regulatory baseline

The Regulation applies in stages (Art. 105): generally and for the designation
of access bodies and national contact points from 26 March 2027; Chapter IV,
secondary use, in full and Chapter II for the first priority categories from
26 March 2029; further data categories and Chapter III for EHR systems in
service from 26 March 2031; third-country participation in HealthData@EU from
26 March 2035.

The implementing acts adopted so far, and the one in preparation that matters
most here:

| Act                                                                                                                                             | Fixes                                                                                                                                                     | Applies                   |
| ----------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| [Implementing Regulation (EU) 2026/2098](https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=OJ:L_202602098) (Art. 77(4))                  | Dataset descriptions use HealthDCAT-AP's definitions, cardinalities and vocabularies; 27 minimum elements; health data categories are the Art. 51(1) list | 26 March 2029             |
| [Implementing Regulation (EU) 2026/2099](https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=OJ:L_202602099) (Art. 16(2))                  | Healthcare attributes as attestations in the EUDI Wallet; assurance levels for persons and health professionals                                           | 26 March 2027; parts 2029 |
| [Implementing Regulation (EU) 2026/2083](https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=OJ:L_202602083) (Art. 23)                     | MyHealth@EU central services                                                                                                                              | 26 March 2027             |
| [Draft act on HealthData@EU](https://www.lexisnexis.co.uk/legal/news/commission-consults-on-technical-requirements-for-healthdata-eu) (Art. 75) | Architecture, connection conditions, an enforcement information exchange tool; adoption planned Q4 2026                                                   | 26 March 2029             |

The TEHDAS2 joint action's non-binding guidance fills in what the acts leave
open: [how to implement the opt-out](https://tehdas.eu/results/tehdas2-provides-guidance-on-implementing-the-ehds-right-to-opt-out/),
the [specification for secure processing environments](https://tehdas.eu/results-by-user-group/)
(D7.4) and the [specification for connecting to
HealthData@EU](https://tehdas.eu/results/new-specification-supports-member-state-connection-to-healthdataeu/)
(D7.3).

## 2. Simpl-Open

### Status

Release Gdynia 4.0 shipped in July 2026; Hamburg 4.1 and Innsbruck 5.0 are
targeted for October and Q4 2026 ([development
status](https://simpl-programme.ec.europa.eu/development/development-status)).
The EHDS secondary-use data space (EHDS2) is a wave 1 Simpl-Live data space,
and [integration workshops started in May 2026](https://ec.europa.eu/newsroom/simpl/redirection/item/940026).
Proposed requirements for DOME Marketplace integration and for monetisation
were presented in a [Community Preview on 28 October
2026](https://simpl-programme.ec.europa.eu/event/simpl-open-community-preview).

### Roles and agents

A Simpl data space has data providers, application providers, infrastructure
providers, consumers and one Governance Authority. Each participant runs a
Simpl-Open agent, a local gateway; the Governance Authority's agent is
centralised ([code and impact Q&A](https://simpl-programme.ec.europa.eu/landing-page/code-and-impact-qa)).
Simpl provides no infrastructure itself ([architecture](https://simpl-programme.ec.europa.eu/documentation/architecture)).

### Connector and protocol

The connector is based on Eclipse EDC and implements the three parts of the
Dataspace Protocol: catalogue, contract negotiation, transfer ([architecture
specification](https://ssg-website-ad5a79.pages.code.europa.eu/resources/architecture)).
Simpl does not publish the EDC or DSP version; asked when the connector will be
updated, the Commission answered that the impact of the upgrade is being
analysed ([Q&A](https://simpl-programme.ec.europa.eu/landing-page/from-vision-to-practice-qa)).

### Identity and trust

- **Tier 1, people in an organisation:** Keycloak, role-based access. Gdynia
  added sign-in through an organisation's existing identity provider; SSI
  Tier 1, people authenticating with credentials in a wallet, is in Hamburg
  ([Hamburg items](https://simpl-programme.ec.europa.eu/development/development-status/simpl-open-roadmap-items-q3)).
- **Tier 2, organisations and agents:** inside the agent, x509 certificates
  issued by the Governance Authority, mTLS, attribute-based access. Outside the
  agent, DCP through an IdentityHub with credentials issued by the Governance
  Authority. SSI Tier 2 in Innsbruck will give "identity attributes as VC and
  x509 credentials as DID" ([Simpl-Open Q&A](https://simpl-programme.ec.europa.eu/landing-page/simpl-open-qa)).
- **EHDS2:** the feasibility study lists Keycloak, EU Login and eIDAS login
  for the central platform ([Simpl-Live feasibility study](https://simpl-programme.ec.europa.eu/system/files/2025-06/Simpl-Live-Feasibility-Study-Report-%28Consolidated%29_Simpl_20250328_V1.2%28A%29.pdf)).

### Catalogue

Gdynia brought resource description, schema and vocabulary management for the
XFSC federated catalogue ([Gdynia items](https://simpl-programme.ec.europa.eu/development/development-status/simpl-open-roadmap-items-q2)).
Innsbruck adopts DCAT-AP as the metadata model for data, application and
infrastructure resources and adds federated search across data spaces
([Innsbruck items](https://simpl-programme.ec.europa.eu/development/development-status/simpl-open-roadmap-items-q4)).
Simpl does not impose a metadata standard on the data itself. No source names
HealthDCAT-AP.

### Policies and contracts

A policy decision point evaluates policies against attributes, contracts and
consent; no policy language is named. Policies are enforced on the provider's
connector only, mainly access policies; usage policies are still being
explored, because enforcement after a transfer is hard to guarantee. Contracts
are bilateral, one consumer and one provider; multi-party contracts are out of
scope for now ([code and impact Q&A](https://simpl-programme.ec.europa.eu/landing-page/code-and-impact-qa)).
Innsbruck adds policies in schemas, contract enforcement and consent management
in onboarding.

### Monetisation and billing

- [BP02E](https://simpl-programme.ec.europa.eu/book-page/bp02e-governance-authority-monetisation-model-configuration):
  the Governance Authority configures one monetisation model per participant
  type (consumer, provider): one-off fee, subscription, transaction fee or
  tiered access. Proposed.
- [BP10](https://simpl-programme.ec.europa.eu/book-page/bp10-provider-bills-consumer-based-resource-consumption):
  the provider bills the consumer from a billing schema in the resource
  description; invoicing and payment are outside Simpl-Open.
- BP14, BP14A, BP14B and SA11: the Governance Authority bills participants,
  detects payable events and enforces dunning rules ([requirements
  changelog](https://simpl-programme.ec.europa.eu/page/requirements-changelog)).

### DOME Marketplace integration

- [BP02F](https://simpl-programme.ec.europa.eu/book-page/bp02f-governance-authority-onboards-data-space-dome-marketplace):
  the Governance Authority onboards the whole data space into DOME as one
  entity, with a predefined mapping schema; participants do not onboard into
  DOME themselves. Proposed.
- [BP02G](https://simpl-programme.ec.europa.eu/book-page/bp02g-governance-authority-allows-dome-marketplace-discovery-its-data-space):
  the Governance Authority lets participants discover DOME offerings through
  Simpl-Open search; DOME stays the source and nothing is replicated. Proposed.
- [SA12](https://simpl-programme.ec.europa.eu/book-page/sa12-governance-authority-publishes-data-space-ai-services-dome-marketplace):
  the Governance Authority publishes the data space's AI services as DOME
  offerings; DOME defines the metadata. Contracting, provisioning and use stay
  between consumer and provider, and a consumer must onboard into the data
  space to use the service. Proposed.

DOME itself onboards organisations with eIDAS-based credentials of a legal
entity appointed representative (LEAR) and identifiers derived from the
organisation's eIDAS certificate (`did:elsi`) ([DOME identity and access
guide](https://dome-marketplace.github.io/iam-guide/)).

### Health

The feasibility study concludes Simpl-Open can support EHDS2, with about two
dozen requirements (access body, coordinating access body, national contact
point, DG SANTE authorisation) "to be assessed". The eDelivery team announced
a proof of concept for using eDelivery in a Simpl-Open agent's control and data
plane in March 2025 ([announcement](https://ec.europa.eu/digital-building-blocks/sites/x/rl-kN));
no results were found. No source names FHIR, OMOP or HealthDCAT-AP support, or
says that HealthData@EU or a national access body will run on Simpl-Open.

## 3. The hub

The hub plays the roles of the Regulation (data holders, a data user, access
bodies, a trust centre, persons) on an Eclipse EDC virtual runtime:

- **Exchange:** DSP 2025-1, checked by the DSP technology compatibility kit in
  `compliance.yml`; DCP v1.0 with an IdentityHub and an IssuerService issuing
  membership, participant, processing purpose and quality label credentials
  to `did:web` participants.
- **Data:** FHIR R4 and OMOP CDM 5.4 in one Neo4j graph with SNOMED CT, LOINC,
  ICD-10 and RxNorm; two secure processing environments behind a query proxy
  with a permit gate, an ODRL 2.2 check per query, a k-anonymity floor of 5
  and a hash-chained audit log kept at least 12 months (Art. 73(1)(e)).
- **Catalogue:** dataset descriptions in HealthDCAT-AP Release 8, validated in
  CI with the official SHACL shapes ([ADR-063](ADRs/ADR-063-healthdcat-ap-release-8-and-its-namespace.md)).
- **Access body procedures:** applications, permits and health data requests
  (Art. 67–69), fees with category reductions (Art. 62), enforcement (Art. 63),
  the public register, information page and activity report (Art. 57–59).
- **Opt-out:** a dated record and a label that every secondary-use query
  excludes ([ADR-062](ADRs/ADR-062-the-art-71-opt-out-is-a-record-and-a-label.md)).
- **Persons:** sign-in with the EUDI Wallet over OpenID4VP 1.0 and HAIP, the
  PID as SD-JWT VC or mdoc, bound to one record (ADR-028, ADR-065).

## 4. Layer by layer

| Layer                      | Simpl-Open                                                                                                    | The hub                                                                                                                     | Gap and bridge                                                                                                          |
| -------------------------- | ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Connector                  | EDC-based, the three DSP parts; version not published                                                         | EDC virtual runtime; DSP 2025-1, checked by the TCK in `compliance.yml`                                                     | Confirm Simpl's DSP version; run the TCK against a Simpl agent                                                          |
| Organisation identity      | Inside the agent: Governance Authority x509, mTLS. Outside: DCP. DIDs and VCs in Innsbruck                    | DCP 1.0, `did:web`, IdentityHub and IssuerService; membership, participant, purpose and quality-label credentials           | The outside-agent path: the Governance Authority as a credential issuer the hub's IdentityHub trusts                    |
| Person identity            | Keycloak; EU Login and eIDAS login in EHDS2; wallet credentials in Hamburg                                    | EUDI PID over OpenID4VP and HAIP (SD-JWT VC or mdoc), bound to one record, asking age over 18, never a birth date (ADR-065) | Both sides: healthcare attestations of 2026/2099                                                                        |
| Acting for an organisation | Not described                                                                                                 | Not yet                                                                                                                     | DOME uses LEAR credentials; the European Business Wallet is still in negotiation. Neither side has a mandate credential |
| Catalogue                  | XFSC federated catalogue; DCAT-AP as the Innsbruck model; HealthDCAT-AP not named                             | HealthDCAT-AP Release 8 over the DSP catalogue, validated with the official SHACL; federated crawler (ADR-020)              | A HealthDCAT-AP profile for Simpl's DCAT-AP adoption, which 2026/2098 requires for health from 2029                     |
| Policy                     | Decision point, no named language; access policies on the provider's connector                                | ODRL 2.2, evaluated per query in front of the SPEs                                                                          | Usage control inside the SPE is where the EHDS needs it most (Art. 73)                                                  |
| Contracts                  | Bilateral consumer and provider                                                                               | DSP agreements plus the access body's data permit (Art. 68)                                                                 | A permit binds an access body, one or more holders and a user                                                           |
| Fees                       | One monetisation model per participant type; provider bills consumer; Governance Authority bills participants | Art. 62 schedule: body and holder shares, Art. 62(3) reductions by applicant category (`ui/src/lib/fees.ts`)                | Category-based reductions do not fit one model per participant type                                                     |
| Opt-out                    | Consent management in onboarding (Innsbruck)                                                                  | Art. 71 record and label; every secondary-use query excludes opted-out persons (ADR-062)                                    | A person-level filter needs the middleware to see persons in the data                                                   |
| Marketplace                | DOME onboarding, discovery and AI services through the Governance Authority                                   | None                                                                                                                        | SPE and analytics services as offerings, usable only inside an SPE                                                      |
| Health semantics           | Not named                                                                                                     | FHIR R4, OMOP CDM 5.4, SNOMED CT, LOINC, ICD-10, RxNorm in one graph                                                        | A health extension on top of Simpl                                                                                      |
| Cross-border secondary use | Federated search across data spaces (Innsbruck); eDelivery proof of concept announced                         | Federated statistics and queries across two SPEs; a second access body                                                      | HealthData@EU connects national contact points over dispatchers and eDelivery (TEHDAS2 D7.3), not over DSP              |

## 5. EHDS duties against Simpl and the hub

"Simpl" says what Simpl-Open offers for the duty. The hub column summarises
[the implementation page](ehds/regulation-implementation.md), which has the
evidence and the tracking issue for each gap.

| Art.  | Duty                                            | Applies                  | Simpl                                              | Hub                                                                                                                                           |
| ----- | ----------------------------------------------- | ------------------------ | -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| 3–10  | Rights of the person, primary use               | 2029 and 2031            | Not named                                          | Access implemented; insert, rectification, portability, information on access partial; restriction and the primary-use opt-out not yet (#698) |
| 16    | Identification, cross-border (2026/2099)        | 2027; 2029               | Keycloak, EU Login, eIDAS login; wallet in Hamburg | EUDI PID login, a PID bound to one record, the session's assurance level recorded (#708); no professionals (#712)                             |
| 51    | Minimum categories of data                      | 2029; 2031               | Not named                                          | Every dataset tagged with the Art. 51(1) categories                                                                                           |
| 53–54 | Purposes, prohibited purposes                   | 2029                     | Generic policy decision point                      | Purposes enforced; prohibited purposes named, not checked on applications (#697)                                                              |
| 55–57 | Access bodies, their tasks, the public register | 2027 (designation); 2029 | One Governance Authority per data space            | Access body desk, register of permits                                                                                                         |
| 58–59 | Information to persons, activity report         | 2029                     | Not named                                          | Implemented                                                                                                                                   |
| 61    | Duties of data users, results within 18 months  | 2029                     | Not named                                          | Permit gate on every secondary-use path; results register                                                                                     |
| 62    | Fees                                            | 2029                     | Monetisation models (proposed)                     | Implemented with a fictional schedule                                                                                                         |
| 63    | Enforcement                                     | 2029                     | Not named                                          | Findings, requests for information, revocation                                                                                                |
| 66    | Minimisation, pseudonymisation                  | 2029                     | Not named                                          | k-anonymity floor of 5; research pseudonyms; no anonymisation beyond small-count suppression                                                  |
| 67–69 | Application, permit, health data request        | 2029                     | Bilateral contracts                                | Implemented; cross-border forwarding (67(3)) only as seed data (#697)                                                                         |
| 70    | Templates                                       | 2027 (act)               | Not named                                          | Not yet; implementing act due 26 March 2027 (#697)                                                                                            |
| 71    | Opt-out from secondary use                      | 2029                     | Not named                                          | Implemented; earlier permits filtered too, other holders not marked (#696)                                                                    |
| 72    | Trusted health data holder                      | 2029                     | Not named                                          | For data requests, not applications (#697)                                                                                                    |
| 73    | Secure processing environment, logs ≥ 1 year    | 2029; act 2027           | Not named; Simpl provides no infrastructure        | Two SPEs behind the query proxy, hash-chained log kept 12 months; not an isolated workspace with tools                                        |
| 75    | HealthData@EU, national contact points          | 2027; 2029               | Federated search across data spaces                | Federated queries across SPEs; no contact point, no eDelivery (#697)                                                                          |
| 77    | Dataset description (2026/2098)                 | 2029                     | DCAT-AP in Innsbruck                               | HealthDCAT-AP Release 8, 0 SHACL violations per dataset                                                                                       |
| 78    | Quality and utility label                       | 2029; act 2027           | Not named                                          | Credentials seeded, not assessed, not in the metadata (#697)                                                                                  |
| 79    | EU dataset catalogue                            | 2029                     | DOME discovery (proposed) is a different catalogue | Federated discovery between participants; nothing published to an EU catalogue                                                                |
| 81    | Complaint to the access body                    | 2029                     | Not named                                          | Not yet (#697)                                                                                                                                |

## 6. Where the EHDS does not fit Simpl's model

1. **One Governance Authority, many access bodies.** Simpl's Governance
   Authority agent is centralised, one per data space. The EHDS has an access
   body or several per Member State (Art. 55), a Union access service for data
   held by Union institutions (Art. 56) and national contact points joined
   through HealthData@EU (Art. 75). Either every national health data space is
   its own Simpl data space with its access body as Governance Authority, and
   cross-border use runs through federation between data spaces, or Simpl has
   to support a federation of authorities inside one data space.
2. **A permit is not a bilateral contract.** An Art. 68 permit is issued by an
   access body and binds one or more holders and a user; the holders must make
   the data available in an SPE within the permit's terms. Simpl's bilateral
   contracts can carry each holder-to-SPE delivery, but not the permit itself.
3. **Fees are regulated, not priced.** Art. 62 fees are cost-based, split
   between the access body and the holders, and reduced for public bodies,
   academic researchers and micro-enterprises (Art. 62(3)). BP02E allows one
   model per participant type, and the reduction depends on the applicant's
   category, not its type. BP14 (the Governance Authority bills participants)
   is closer to the access body's fee, if an application can be a payable
   event.
4. **The opt-out needs persons, and Simpl moves opaque data.** An opt-out
   applies to the persons inside datasets, at the holder and again before
   release (TEHDAS2). A provider-side access policy could carry it if the
   connector could evaluate a constraint against a register of opted-out
   persons when it hands data to the SPE. Simpl's consent management in
   onboarding is about participants, not data subjects.
5. **Discovery is public, processing is not.** DOME integration makes cloud,
   edge and AI services findable from a data space search (BP02G, SA12). In the
   EHDS, dataset descriptions are public (Art. 77, 79) but processing happens
   only in an SPE after a permit (Art. 73). An analytics service listed in DOME
   is usable for health data only when it runs inside an SPE; see
   [#650](https://github.com/ma3u/MinimumViableHealthDataspacev2/discussions/650)
   on keeping the discovery catalogue and the catalogue inside the SPE apart.
6. **Who stands for health in DOME.** Under BP02F the Governance Authority
   onboards the whole data space into DOME. For health that would be an access
   body or the Commission, onboarding under its own LEAR credential and
   representing every holder in the data space.
7. **HealthData@EU runs on eDelivery.** The cross-border infrastructure
   exchanges metadata, applications and decisions between contact points
   through dispatchers and eDelivery; health data does not travel through it
   (TEHDAS2 D7.3). A Simpl agent would sit behind a national contact point,
   unless the announced eDelivery proof of concept becomes part of Simpl.

## 7. Identity and trust

Simpl describes two trust models, x509 inside its agent and DCP outside it,
and plans DIDs and credentials for organisations in Innsbruck. The choice
between centralised certificates and decentralised identity is therefore not
the open question for the EHDS; which issuers are trusted for what is:

- **Organisations.** The hub issues membership, participant, processing purpose
  and quality label credentials over DCP. A Simpl data space issues its own
  through the Governance Authority. The bridge is trust configuration: the
  hub's IdentityHub accepts the Governance Authority as an issuer, and Simpl's
  outside-agent path accepts the hub's credentials.
- **People.** The EUDI Wallet is the identity for persons, and 2026/2099 adds
  healthcare attributes as attestations in it, which providers must accept
  from 26 March 2029. Persons authenticate at assurance level substantial from
  2027 and high from 2030; health professionals at high from 2032. Neither
  Simpl nor the hub issues or verifies healthcare attestations yet (#698).
- **People acting for an organisation.** Applying for a permit is done by a
  person on behalf of an organisation. DOME proves that with LEAR credentials;
  the EUDI framework will with the European Business Wallet, still in
  legislative negotiation. Neither Simpl nor the hub has this today, and it is
  the credential an access body most needs to check.

## 8. Decision and recommendations

### The hub's position

[ADR-064](ADRs/ADR-064-simpl-open-through-the-outside-agent-dcp-path.md): the
hub meets Simpl-Open as an EDC connector outside the Simpl-Open agent, over DSP
2025-1 and DCP v1.0, with a data space's Governance Authority as a trusted
issuer in its IdentityHub. Permits, the opt-out filter, fees and the SPE gate
stay in the hub. "Aligned" is claimed only for a capability with a published
Simpl source and a check in the hub that exercises it.

### For the Simpl programme

Comments on the proposed requirements and questions for the programme:

1. Publish the EDC and DSP versions of the Simpl-Open connector, with
   conformance evidence from the DSP technology compatibility kit.
2. Make HealthDCAT-AP a profile of the DCAT-AP model adopted in Innsbruck, so a
   health data space can meet 2026/2098 without a second catalogue.
3. Let BP02E express reductions by applicant category and a split between the
   Governance Authority and providers (Art. 62); let an application be a
   payable event under BP14.
4. Support a contract that an authority issues and several providers carry
   out, or describe how a data permit maps onto bilateral contracts.
5. Give the provider's connector a hook to filter persons against a register
   when data is handed over, so an opt-out (Art. 71) can be enforced at the
   holder.
6. Say how several access bodies and a Union service fit the one Governance
   Authority model, and how a Simpl data space connects to HealthData@EU.
7. In the DOME integration, accept EUDI PIDs and, once adopted, European
   Business Wallet mandates alongside LEAR credentials, and allow sector
   attributes on offerings (SPE certification, permit required).

### For the hub

Each gap is an issue in the plan [#725](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/725),
with its priority (P1 to P3) and the evidence that closes it.

1. When Hamburg 4.1 code is public: trust a Governance Authority as issuer in
   the IdentityHub, and run the DSP TCK against a Simpl agent.
2. Map HealthDCAT-AP Release 8 onto Simpl's DCAT-AP and XFSC resource
   descriptions.
3. Express the `fees.ts` schedule as a BP02E monetisation model and record what
   does not fit.
4. Contact the EHDS2 Simpl-Live pilot.
5. Close the open EHDS items: #696 (opt-out follow-ups), #697 (implementing
   acts and Chapter IV duties), #698 (Chapter II rights, EU FHIR guides, EUDI
   health attestations).

## 9. The hub as a health extension on Simpl

```
Simpl-Open (generic)
  connector (EDC, DSP), Governance Authority, XFSC / DCAT-AP catalogue,
  Tier 1 and Tier 2 identity, monetisation, DOME bridge
  └── EHDS health extension (this hub)
       ├── HealthDCAT-AP Release 8 dataset descriptions (Art. 77, 2026/2098)
       ├── FHIR R4 and OMOP CDM 5.4 behind the data planes
       ├── access body procedures: application, permit, request (Art. 67–69)
       ├── Art. 71 opt-out filter at the holder and before release
       ├── SPEs with a permit gate and an audit log (Art. 73)
       ├── Art. 62 fees with category reductions
       └── persons: EUDI Wallet login (Art. 16, 2026/2099)
```

Other sectors would build their own extensions on the same core. Health is the
first sector whose regulation fixes formats, procedures and dates, so it shows
first where the core needs hooks.

## Sources and limits

Simpl facts come from the programme's [Simpl-Open
Q&A](https://simpl-programme.ec.europa.eu/landing-page/simpl-open-qa), its
[development status and roadmap pages](https://simpl-programme.ec.europa.eu/development/development-status)
and its [requirement pages](https://simpl-programme.ec.europa.eu/page/requirements-changelog).
The architecture specification on code.europa.eu could not be read directly; a
[rendered copy (D1.3.4, version 0.1, December 2025)](https://ssg-website-ad5a79.pages.code.europa.eu/resources/architecture)
was used. Not found anywhere: the EDC and DSP versions of the Simpl connector,
a named policy language, support for FHIR, OMOP or HealthDCAT-AP, and the
outcome of the eDelivery proof of concept. Requirements marked "proposed" may
change after the Community Preview. Corrections go to
[#701](https://github.com/ma3u/MinimumViableHealthDataspacev2/discussions/701).

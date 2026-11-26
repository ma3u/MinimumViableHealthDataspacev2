---
title: "Feedback on the draft Implementing Regulation on secure processing environments, Ares(2026)10903532"
subtitle: "From a dataspace architect, with a non-commercial EHDS demo that runs a confidential, federated SPE"
date: "26 November 2026"
---

# What this feedback asks

This feedback replaces my submission of 24 November 2026. Its first two parts are new:

- **A. Cost and effort.** The draft prescribes a manual, per-permit pipeline whose cost falls on access bodies and operators, with one proportionality clause and no cost estimate.
- **B. Data spaces and digital identity.** Secondary use under the EHDS is a data space, but the draft does not connect SPEs to the Data Act's rules for data spaces, to the Dataspace Protocol or to eIDAS 2.0.
- **C. The points of my first submission** (C1 to C9), which stand.

# Who I am

I am an experienced dataspace architect. I built the operating company for Catena-X (<https://catena-x.net>), the dataspace of the global automotive supply chain, so I know what it takes to run a dataspace with many independent participants, not only to specify one. I also contribute to Eclipse Tractus-X (<https://eclipse-tractusx.github.io>), the open-source reference implementation of Catena-X, and to Eclipse Dataspace Components (<https://github.com/eclipse-edc>), the connector it builds on. I build the Minimum Viable Health Dataspace, an open-source reference implementation of Regulation (EU) 2025/327.

> **A non-commercial demo.** The Minimum Viable Health Dataspace is not a product and is not for sale. No company stands behind it, nothing is offered as a service, and it holds no real health data: its patients are synthetic and its organisations (AlphaKlinik Berlin, Limburg Medical Centre, PharmaCo Research AG, MedReg DE) are fictional. It exists to show the EHDS standards working together, so that access bodies, data holders and developers can see, test and question them before 2029. Everything is published under an open-source licence.

It combines the Dataspace Protocol, the Decentralised Claims Protocol, HL7 FHIR R4, OMOP CDM 5.4, HealthDCAT-AP, ODRL policies and CNCF Confidential Containers in one knowledge graph. It plays all roles of Chapter IV: a health data access body, two data holders and a data user.

- Try the demo (no sign-in, synthetic data): <https://ma3u.github.io/MinimumViableHealthDataspacev2>
- Documentation: <https://ma3u.github.io/MinimumViableHealthDataspacev2/docs>
- Source code: <https://github.com/ma3u/MinimumViableHealthDataspacev2>

# How the hub's secure processing environment works

Each data holder has a workspace: a confidential container group on AMD SEV-SNP hardware, built on CNCF Confidential Containers. The workspace's data arrives encrypted. The key is held by a key broker (Trustee) that the access body runs. Trustee releases the key only when the CPU-signed attestation report proves that the workspace runs exactly the images, commands and settings bound to the data permit. A changed tool gives a different policy hash, and the key is not released. The data lives only in encrypted memory and is gone when the workspace stops.

Two workspaces answer federated queries. A query goes to each workspace, runs there, and only aggregates with every group below five suppressed return to the data user. Every attestation, key release, refusal, load and deletion is written to a hash-chained audit log.

The decisions behind this are public:

- Confidential containers with remote attestation: [ADR-037](https://github.com/ma3u/MinimumViableHealthDataspacev2/blob/main/docs/ADRs/ADR-037-secure-processing-environment-confidential-computing.md)
- A Trustee the access body runs, data loaded per permit: [ADR-068](https://github.com/ma3u/MinimumViableHealthDataspacev2/blob/main/docs/ADRs/ADR-068-a-sovereign-confidential-spe-on-confidential-containers-and-trustee.md)
- The policy hash bound to the permit: [ADR-069](https://github.com/ma3u/MinimumViableHealthDataspacev2/blob/main/docs/ADRs/ADR-069-two-spe-workspaces-as-aci-confidential-containers.md)
- Workspaces start on demand: [ADR-072](https://github.com/ma3u/MinimumViableHealthDataspacev2/blob/main/docs/ADRs/ADR-072-spe-workspaces-start-on-demand.md)
- The developer's explanation: [secure-processing-environment.md](https://github.com/ma3u/MinimumViableHealthDataspacev2/blob/main/docs/developer/secure-processing-environment.md)

The hub is a demonstrator. It is not an SPE that holds real data, and it does not claim to comply with the draft. I checked it against the draft article by article (table at the end) to find out what the text asks in practice. The points below come from that check.

Article 18's paragraphs are numbered 8 to 11 in the draft; I cite them by position, as 18(1) to 18(4).

# The SPE in the demo

The first screenshot comes from the Azure deployment on 24 November 2026: SPE-1 running as an ACI confidential container group on AMD SEV-SNP hardware, its evidence checked by the access body's Trustee and its key released. The other two come from the public demo, viewed as its demo administrator persona (no account is needed). The public demo is a static build of a recorded run from a laptop without confidential hardware, so it is labelled "Simulated attestation" and its light shows amber: the Trustee, the policy, the key release and the audit record are real, the hardware proof is not.

![A real SPE on Azure: a traffic light (green: proven by hardware) and five plain checks. The processor proved that the workspace runs exactly the software the data permit allows, and only then did the access body release the key (Art. 5(1), (2)). The amber check is honest: the key broker runs in the hub's own subscription, not yet in one of the access body's own. The measurements, the chain from permit to key and the audit events are folded away for auditors.](img/01-spe-attestation.png)

SPE attestation in the public demo (amber there, simulated evidence): <https://ma3u.github.io/MinimumViableHealthDataspacev2/admin/attestation>

![A federated question answered by both workspaces. Each reports aggregates only, and counts below five are shown as "<5" (Art. 18(2)(e), (g)).](img/02-federated-query.png)

Natural-language and federated query: <https://ma3u.github.io/MinimumViableHealthDataspacev2/query>

![The secure-processing log: attestation, key release and refusal, workspace loaded and destroyed, and opt-outs synced, each with the permit and its policy hash (Art. 16(3), Art. 17(1)). The badge "Records are not sealed" is honest: the log is hash-chained, not yet in write-once storage (Art. 16(2)).](img/03-spe-audit.png)

Audit and provenance, tab "Secure processing": <https://ma3u.github.io/MinimumViableHealthDataspacev2/admin/audit>

# A. Cost and effort for operators

**Draft:** every obligation below is per data permit or per instance, and none scales with risk or use:

| Obligation                                                                                                       | Draft                  | Unit           |
| ---------------------------------------------------------------------------------------------------------------- | ---------------------- | -------------- |
| A dedicated, segregated instance, configured to the permit's data, tools, persons and network                    | Art. 2(4), 3(1) to (3) | per permit     |
| A separate staging environment                                                                                   | Recital 5, Art. 4(1)   | per instance   |
| The access body verifies artefacts, mitigates risks, prepares and pseudonymises the data, and uploads it itself  | Art. 4(2), (3)         | per permit     |
| Verification that the set-up fully matches the permit before access, and monitoring throughout                   | Art. 5(1), (2)         | per permit     |
| A pre-installed data-science suite and collaboration tools in every instance                                     | Art. 6(1), (2)         | per instance   |
| Approval of every export, with automated checks and manual review                                                | Art. 7(1), (3)         | per export     |
| Documented, verifiable deletion within six months                                                                | Art. 8(5)              | per permit     |
| Tamper-evident logs of all observable user activity, in a write-once, central repository                         | Art. 16(1) to (3)      | per instance   |
| Internal audits, and external audits at least every four years; for a third-party operator 12 months after start | Art. 17(2) to (4)      | per operator   |
| A written agreement for every federation, with admission, exclusion and incident procedures                      | Art. 20                | per federation |

Only disaster recovery is proportionate to "size, complexity, risk profile and service criticality" (Art. 11(7)). Recital 3 expects "market actors" to offer compliant SPEs, but no impact or cost estimate is published, and the access body stays accountable for a third-party operator (Art. 9(4)(b)).

**Evidence:** TEHDAS2 D7.4, written by the access bodies that will procure SPEs, says it plainly:

- "building SPEs and their supporting services is an expensive and time-consuming effort" (Annex 7, p. 97);
- recording every user action "is also significant cost issue", and the authors consider it a privacy problem for the users themselves (Annex 7, p. 100);
- consultation respondents found some requirements "infeasible or overly costly (especially the exhaustive logging)" (Annex 2, p. 78);
- remote desktop is "the legacy approach" (section 5.6, p. 61), yet eight of its nine requirements, TIR-18 to TIR-26, are mandatory (section 5.6.2, p. 64).

**Experience:** in the hub, most of these duties are done by machines, not people. The access body's key broker checks a hardware-signed report of the measured workload against the permit's policy hash and releases the key only on a match (Art. 5 in one automated step). The extract is sealed per holder and decrypted only inside the attested instance (no staging copy to verify, store and delete). Small counts are suppressed automatically (Art. 7 for aggregates). A workspace starts on demand and stops after 30 minutes idle, so an unused instance costs nothing. Catena-X taught me the same lesson at scale: a data space with many independent participants is affordable only when conformance is checked once, against published standards, and the rest is automated.

**Request:**

1. Add a proportionality clause for the whole regulation, by risk and by use. An instance that only runs approved queries or batch jobs (Art. 14(3)) and returns aggregates needs neither the collaboration suite of Art. 6 nor a remote desktop; apply Art. 6 "where the data permit provides for interactive processing".
2. Accept machine evidence in place of manual work: a hardware-signed attestation that binds the measured instance to the permit satisfies Art. 5(1), (2) and Art. 12(1)(a); destroying the per-permit key, together with volatile memory, is verifiable deletion under Art. 8(5), including for backups.
3. Accept a sealed, per-permit encrypted extract that is decrypted only inside an attested instance as equivalent to staging and upload by the access body (Art. 4(2), (3)).
4. Limit Art. 16(3)(d) to security-relevant events, as D7.4 recommends, and let a compliance assessment under the Art. 21 framework be recognised by every access body, so that an operator is not assessed again in each Member State.
5. Publish a cost and impact assessment, covering access bodies, trusted health data holders and smaller operators, before adoption.

# B. Data spaces and digital identity

**Draft:** data spaces appear only in the name of the European Health Data Space, and the Data Act, Regulation (EU) 2023/2854, is not mentioned. Identity is covered by:

- Art. 10(4): "strong user authentication as defined in Article 3 (51) of Regulation 910/2014", for all users;
- recital 7: support for the European Digital Identity Wallet "referred to in Article 5a of Regulation (EU) No 910/2014", with a footnote to the 2014 text, in which Art. 5a does not exist; it was inserted by Regulation (EU) 2024/1183;
- recital 10 and Art. 18(2)(c): "identity federation mechanisms" and user management "interoperable" within a federation, without saying how;
- Art. 18(2)(d): instances are authenticated through encryption.

Not addressed: identities of organisations (access bodies, holders, operators, federation members), identities of machines (instances, batch jobs, API clients), electronic attestations of attributes, qualified electronic seals and time stamps, machine-readable data permits, and any protocol between a data holder and an SPE.

**Evidence:** D7.4 expects the opposite. It finds that the success of the EHDS "will depend heavily on" the eIDAS network and the EUDI Wallet (Annex 7, p. 94), that attributes such as a researcher's affiliation and qualification (EHDS Art. 68(1)(d)) are needed, and that data spaces are expected to provide them as Wallet verifiable credentials (p. 95). It asks for a "machine-actionable access permit" derived from the data permit (p. 95) and leaves the transfer protocol open (FSPER-8, p. 22 and p. 72).

**Experience:** the hub is built the data space way. Participants are identified by DIDs and prove their role with verifiable credentials over the Decentralised Claims Protocol; data is offered, negotiated and transferred over the Dataspace Protocol; the policies are ODRL; the catalogue is HealthDCAT-AP; a person can sign in with an EUDI Wallet. Every access decision follows from something machine-readable. In Catena-X, the same building blocks let companies connect once and exchange data with all others; without them every pair of participants needs its own contract and its own integration, which is what an SPE federation under Art. 20 would become.

**Request:**

6. Cite Regulation (EU) No 910/2014 as amended by Regulation (EU) 2024/1183, and accept electronic attestations of attributes (affiliation, professional qualification, completed training) as a basis for granting and revoking access rights (Art. 10(1), (2)).
7. Require organisational identities for access bodies, holders, operators and federation members, using the European Business Wallet or qualified electronic seals, and attested workload identities for instances, batch jobs and API clients (Art. 10, 14, 18(2)(c), (d)). Keep strong user authentication for natural persons.
8. Make the data permit machine-readable, for example in ODRL, so that the configuration of Art. 3(3), the access check of Art. 5(1) and the access rights of Art. 10(1) follow from it automatically and can be audited against it.
9. Connect holders, SPEs and federations through the Dataspace Protocol and the harmonised standards on trusted data transactions requested under Art. 33 of the Data Act, and name the common standards a federation starts from: the HealthData@EU specifications (EHDS Art. 75), HealthDCAT-AP (Art. 77), OMOP CDM and HL7 FHIR (Art. 18(2)).

# C. The points of my first submission

## C1. Protection of data in use

**Draft:** Art. 13(2) and (3) require encryption at rest and in transit. Art. 12(1)(a) asks a third-party operator not to access personal data "except when strictly necessary". Art. 5(1) and (2) ask the operator and the access body to verify, and to monitor for the permit's lifetime, that an instance matches the permit, including its tools.

**Experience:** data at rest and in transit are protected by encryption, but during processing the data sits in plain memory, readable by whoever runs the host: the operator, a cloud provider, or an attacker with administrator rights. Art. 12 answers this with a duty, not a measure. Confidential computing answers it with hardware: memory is encrypted per instance, and the CPU signs a report of what runs in it. In the hub, that report is also how the access body verifies the instance (Art. 5): the key is released only to an instance whose measured images match the permit.

**Request:**

- Require state-of-the-art protection of electronic health data in use where a third-party operator or a cloud service operates the SPE (Art. 12, recital 4).
- Name remote attestation as a means to verify the configuration of an instance before and during access (Art. 5(1), (2)).
- Leave the technology open (AMD SEV-SNP, Intel TDX, Arm CCA, or others).

## C2. Disclosure control on aggregates inside a federation

**Draft:** Art. 2(12) defines federated processing as an exchange of "queries, code, aggregated results or model parameters". Art. 18(3) exempts parameters, weights and gradients from the export control of Art. 7. Art. 18(4) applies Art. 7 only to exports out of the federation.

**Experience:** a coordinator that receives per-site aggregates can recover what a site would have suppressed. If three sites report 40, 37 and a suppressed count, and the coordinator sees a total of 80, the suppressed count is 3. The hub met this twice:

- Its federated statistics needed a rule for totals as well as for each site. A total now leaves out the site counts below the threshold unless together they reach it, and a total below the threshold is itself suppressed ([`combineCounts()`](https://github.com/ma3u/MinimumViableHealthDataspacev2/blob/e84f2716/services/neo4j-proxy/src/k-anonymity.ts#L148)).
- Its federated query applies k-anonymity at the coordinator, after the per-site results have left each workspace ([federated.ts](https://github.com/ma3u/MinimumViableHealthDataspacev2/blob/e84f2716/services/neo4j-proxy/src/routes/federated.ts#L191)). Under the draft, the check belongs in each instance. I found this gap by reading the draft.

Model updates carry the known risks of membership inference and gradient inversion.

**Request:**

- Require that each instance applies disclosure control to aggregated results before they leave it, and that the coordinating operator applies it again to combined results, including totals.
- In the guidelines of Art. 22, name secure aggregation and differential privacy as measures for Art. 18(3).

## C3. Query-only and batch SPEs

**Draft:** Art. 6(1) and (2) require, in every instance, general-purpose data-processing tools and collaboration tools. Art. 14(3) allows batch execution.

**Experience:** a health data request (Art. 69) answers with anonymised statistics, and a feasibility query with a count. Neither needs a notebook, a remote desktop or a shared folder, and each of those enlarges the attack surface (Art. 7(2), concealment in exports). The hub's federated SPE is query-only today; an interactive workspace per permit is planned separately.

**Request:** apply Art. 6 "where the data permit provides for interactive processing", and state that an instance limited to batch or query execution under Art. 14(3) complies.

## C4. Log retention

**Draft:** Art. 16(4): logs are kept "for a period of five years or for one year following the end of validity of the data permit, whichever period is shorter". Regulation (EU) 2025/327 Art. 73(1)(e) requires "at least one year".

**Experience:** implementing this as a retention date per log entry, the start of the five years is unclear. If they count from each entry, the rule gives min(entry + 5 years, permit end + 1 year), which is never less than one year after the entry. If they count from the start of the permit, an entry written in the sixth year of a long permit would be due for deletion at once. The hub today keeps entries 12 months, which meets Art. 73 but not this draft for long permits.

**Request:** state that the five years count from each log entry, and that no entry is kept less than one year (Art. 73(1)(e)).

## C5. Deletion and reproducibility

**Draft:** Art. 8(5): secure deletion of the instance within six months after the permit ends.

**Guidance:** TEHDAS2 D7.1 provides for a reduced archive to reproduce results and for keeping analysis scripts for the access body. Results are published within 18 months (Regulation Art. 61).

**Request:**

- Delete "without undue delay and at the latest within six months".
- Allow the analysis scripts and the outputs already released under Art. 7, never row-level data, to be kept outside the instance for verification and reproducibility.

## C6. Common standards for federations

**Draft:** Art. 18(2)(a) to (c) require common data models, metadata standards, query languages, remote execution interfaces and interoperable user management within a federation, and Art. 20 leaves their choice to each federation's agreement.

**Experience:** the hub's two workspaces federate because they share OMOP CDM 5.4, FHIR R4, LOINC and SNOMED CT, and describe themselves in HealthDCAT-AP. Two federations that choose differently cannot later join, and a cross-border request through HealthData@EU would meet as many choices as there are federations. Catena-X shows the alternative: its participants interoperate because they implement published, versioned standards and are checked against them before they join, while an operating company runs the shared services. Art. 20 leaves exactly these choices to each federation.

**Request:** refer to the specifications under Art. 75 (HealthData@EU) and Art. 77 (HealthDCAT-AP), to OMOP CDM and HL7 FHIR as common data models, and to organisation identities based on the European Digital Identity framework, as the default a federation departs from only with a reason.

## C7. Machine-readable public information

**Draft:** Art. 9(2) asks for public information on capabilities and tools; Art. 18(1) on the members of a federation.

**Request:** publish both in the national dataset catalogue as HealthDCAT-AP data services (`dcat:DataService`), linked to the datasets they serve, so an applicant can choose an SPE in the application (Art. 67) and HealthData@EU can show them across borders.

## C8. Authentication of machines

**Draft:** Art. 10(4) requires strong user authentication (eIDAS Art. 3(51)) "for all users"; recital 7 asks for European Digital Identity Wallet support.

**Experience:** batch jobs (Art. 14(3)), API clients (Art. 14(1)) and federated instances (Art. 18(2)(d)) are systems, not natural persons. They authenticate with workload identities, certificates or verifiable credentials, as the Dataspace Protocol and the Decentralised Claims Protocol do in the hub.

**Request:** add a rule for workload and organisation identities, consistent with Art. 18(2)(d), and keep strong user authentication for natural persons. The hub's EUDI Wallet sign-in shows the person side is feasible.

## C9. Editorial

- Art. 1 is numbered (14) and (15).
- Art. 2 starts at point (2).
- Art. 8 starts at paragraph 4.
- Art. 18 is numbered 8 to 11, while Art. 20(1)(b) refers to Art. 18(2).
- Art. 19(2) refers to Art. 20(1), point (a); Art. 20(1) uses letters a. to d.
- Art. 21(3) has two points (a).
- Art. 13(2): "within an shall be encrypted" (the noun is missing).
- Art. 14(3)(b): "execute model training these tasks".
- Recital 7: "sensisity", "processsed"; Art. 20(1): "sercure".

# Annex: the hub checked against the draft

This shows what an implementer meets in each article. Status as of 26 November 2026.

| Article       | Requirement                                                  | The hub                                                             |
| ------------- | ------------------------------------------------------------ | ------------------------------------------------------------------- |
| 3             | An instance per permit, segregated, allowed connections only | A workspace per data holder; per permit is planned                  |
| 4             | Staging, verification and preparation by the access body     | Encrypted extract per holder; no staging for data users             |
| 5(1), (2)     | Verify and monitor that the instance matches the permit      | Hardware attestation bound to the permit's policy hash              |
| 5(3)          | Separation across one user's concurrent permits              | One key per workspace, not per permit                               |
| 6             | Data-science and collaboration tools                         | Query-only; an interactive workspace is planned                     |
| 7             | Export only after approval; automated and manual checks      | Automatic suppression of groups below five; no approval step        |
| 8             | Revoke at expiry; delete within six months                   | Data deleted when a workspace stops; not triggered by expiry        |
| 9             | Public documentation and capabilities                        | Developer documentation public; no capability statement             |
| 10            | Role-based access, strong authentication                     | Roles from the identity provider; EUDI Wallet sign-in available     |
| 13            | Isolation, encryption at rest and in transit                 | Encrypted memory per workspace, TLS                                 |
| 14(3)         | Batch execution with the same output control                 | Synchronous queries with the same output control                    |
| 16            | Tamper-evident, write-once logs; retention                   | Hash-chained log; kept one year after the permit ends, 1 to 5 years |
| 18(2)(e), (g) | Local execution; no sourced data between instances           | Local execution; suppression applied at the coordinator             |
| 18(2)(f)      | Federation-wide logging                                      | Each workspace's events collected into one chain                    |
| 19            | Federated learning                                           | Not built                                                           |
| 18(1)         | Public list of federation members                            | Drafted: members as HealthDCAT-AP data services                     |
| 20            | Written governance agreement                                 | Drafted: an agreement between the fictional parties                 |

# Sources

- Draft implementing regulation, Ares(2026)10903532: <https://ec.europa.eu/info/law/better-regulation/api/download/090166e53752f4ab>
- Feedback page, initiative 17192: <https://ec.europa.eu/info/law/better-regulation/have-your-say/initiatives/17192-European-Health-Data-Space-requirements-for-secure-processing-environments_en>
- Regulation (EU) 2025/327 (EHDS), Articles 61, 67, 69, 73, 75 and 77: <https://eur-lex.europa.eu/eli/reg/2025/327/oj/eng>
- Regulation (EU) No 910/2014 (eIDAS), Art. 3(51): <https://eur-lex.europa.eu/eli/reg/2014/910/oj/eng>
- TEHDAS2 D7.4, SPE specification for access bodies: <https://zenodo.org/records/20266473>
- TEHDAS2 results by user group: <https://tehdas.eu/results-by-user-group/>
- TEHDAS2 D7.4, PDF as read for this feedback (24 February 2026): <https://tehdas.eu/wp-content/uploads/2026/06/d7.4-technical-specification-for-health-data-access-bodies-on-the-implementation-of-secure-processing-environments.pdf>
- Regulation (EU) 2024/1183 (eIDAS 2.0): <https://eur-lex.europa.eu/eli/reg/2024/1183/oj/eng>
- Regulation (EU) 2023/2854 (Data Act), Art. 33: <https://eur-lex.europa.eu/eli/reg/2023/2854/oj/eng>
- Dataspace Protocol (Eclipse Foundation): <https://eclipse-dataspace-protocol-base.github.io/DataspaceProtocol/>
- Decentralised Claims Protocol (Eclipse Foundation): <https://eclipse-dataspace-dcp.github.io/decentralized-claims-protocol/>
- ODRL Information Model 2.2 (W3C): <https://www.w3.org/TR/odrl-model/>
- CNCF Confidential Containers: <https://confidentialcontainers.org/>
- Trustee (key broker and attestation service): <https://github.com/confidential-containers/trustee>
- AMD SEV-SNP: <https://docs.kernel.org/arch/x86/amd-memory-encryption.html#secure-nested-paging-snp>
- HealthDCAT-AP, release 8: <https://data.health.europa.eu/healthdcat-ap/releases/release-8/>
- OMOP CDM 5.4: <https://ohdsi.github.io/CommonDataModel/cdm54.html>

Evidence in my own code (commit e84f2716):

- Small-count suppression and the totals rule: <https://github.com/ma3u/MinimumViableHealthDataspacev2/blob/e84f2716/services/neo4j-proxy/src/k-anonymity.ts>
- The federated query and where it suppresses: <https://github.com/ma3u/MinimumViableHealthDataspacev2/blob/e84f2716/services/neo4j-proxy/src/routes/federated.ts#L191>
- The hash-chained audit log: <https://github.com/ma3u/MinimumViableHealthDataspacev2/blob/e84f2716/services/neo4j-proxy/src/audit-chain.ts>
- Log retention today: <https://github.com/ma3u/MinimumViableHealthDataspacev2/blob/e84f2716/services/neo4j-proxy/src/audit.ts#L70>

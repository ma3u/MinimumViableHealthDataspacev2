# Demo Guide: Spanish HDAB Regulator

**Audience:** Spanish Health Data Access Body regulator. The visiting
regulator is the peer to the seeded `MedReg DE` and `Institut de Recherche
Santé` (FR) HDABs in this reference implementation.

**Live demo:** [https://ehds.mabu.red](https://ehds.mabu.red)

**Repo:** [github.com/ma3u/MinimumViableHealthDataspacev2](https://github.com/ma3u/MinimumViableHealthDataspacev2)

**Goal:** show that an EHDS reference implementation can demonstrate every
HDAB-relevant control surface on a single dataspace with synthetic data.
The control surfaces covered are: primary-use patient rights (Art. 3 to
12), secondary-use access approval (Art. 46 to 53), cross-border
participant coordination (Art. 75, HealthData@EU), and DSP / DCP /
HealthDCAT-AP protocol compliance.

---

## What an EHDS HDAB does

The EHDS Regulation (EU) 2025/327 assigns the Health Data Access Body a
dozen statutory tasks. They split into four functional clusters.

### 1. Permits & access decisions

- **Art. 46, Data permits.** The HDAB receives applications from data
  users (researchers, public bodies, industry). It evaluates purpose,
  lawful basis, and proportionality, then issues a **data permit** with
  attached use conditions or refuses with documented reasons.
- **Art. 47, Data requests.** This is a lighter-weight access path for
  anonymised or statistical datasets that do not need a full permit.
- **Art. 53, Penalties.** The HDAB enforces permit conditions. It can
  suspend or revoke permits and levy administrative fines for misuse.

### 2. Secure processing & pseudonymisation

- **Art. 50, Secure Processing Environment (SPE).** Only the SPE may
  receive identifiable data. Analytical code is approved and attested
  before execution. Only **aggregated, k-anonymous results** leave the
  SPE.
- **Art. 51, Pseudonymised provisioning.** Data leaves the data holder
  pseudonymised. Only the HDAB-operated Trust Center can re-identify, and
  only when legally required (for example, a safety signal).

### 3. Catalogue, transparency, quality

- **Art. 55, Datasets catalogue.** The HDAB maintains a public,
  machine-readable catalogue of available datasets (HealthDCAT-AP).
- **Art. 56, Quality & utility label.** Datasets are scored for
  completeness, consistency, and timeliness so users know what they are
  paying for.
- **Art. 41, Quality label scheme.** The same idea applies to EHR systems.
- The HDAB publishes data permits, applications, and outcomes for
  transparency.

### 4. Coordination & enforcement

- **Art. 36, Establishment.** Each Member State designates one or more
  HDABs. Spain has named the Ministry of Health's data office.
- **Art. 37, Tasks & powers.** The HDAB performs supervision, audits, and
  complaints handling. It cooperates with the Data Protection Authority.
- **Art. 38, DPA cooperation.** Joint investigations on personal-data
  matters.
- **Art. 75, HealthData@EU.** Cross-border infrastructure: a permit
  issued by HDAB-ES is honoured by HDAB-DE, transfers are logged on both
  sides, and either HDAB can revoke.

### What this demo / integration hub covers

| HDAB statutory task                       | Coverage in this demo                                                                                                                                                                                                                                                                          |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Art. 36, HDAB designation**             | Two HDABs are seeded (`MedReg DE`, `Institut de Recherche Santé` FR) as `:Participant {role:'HDAB_AUTHORITY'}` with `did:web:…:hdab`. The Spanish HDAB is pluggable as the third (see Q&A).                                                                                                    |
| **Art. 37, Tasks & powers**               | The `regulator` Keycloak role plus `HDAB_AUTHORITY` Next.js middleware gate `/compliance`, `/admin/policies`, `/admin/audit` to the HDAB persona. Approval supervision is exercised through the EHDS approval-chain UI.                                                                        |
| **Art. 38, DPA cooperation**              | The audit page surfaces the **compliance officer mailto** on every transfer/negotiation row. This is the contact a DPA would use to escalate. The audit trail conforms to GDPR Art. 30.                                                                                                        |
| **Art. 41 / 56, Quality & utility label** | EEHRxF profile compliance per dataset is rendered in `/eehrxf` and on each catalogue card. Quality dimensions are tagged in `(:HealthDataset {qualityLabel})`.                                                                                                                                 |
| **Art. 46, Data permit**                  | The full chain is modelled: `(:DataUser)-[:SUBMITS]->(:AccessApplication)-[:DECIDED_BY]->(:HDABApproval)-[:GRANTS]->(:Contract)-[:COVERS]->(:DataProduct)`. It is visible in `/compliance`. An ODRL policy is attached per dataset (`/admin/policies`).                                        |
| **Art. 47, Data requests**                | The same Cypher path applies, with a lighter ODRL policy: no individual-level data, k≥5 aggregation enforced server-side.                                                                                                                                                                      |
| **Art. 50, SPE**                          | A TEE-attested SPE is modelled as `(:SPESession {attestation, approvedCodeHash, k, createdAt})`. Approved analytical code is hashed and recorded; aggregate-only output is enforced. ADR-018 / ADR-019 cover the security model.                                                               |
| **Art. 51, Pseudonymisation**             | The Trust Center implementation lives in [`services/neo4j-proxy/src/index.ts:3530+`](https://github.com/ma3u/MinimumViableHealthDataspacev2/blob/main/services/neo4j-proxy/src/index.ts) with two modes (stateless HMAC-SHA-256, key-managed). It is visible in `/graph?persona=trust-center`. |
| **Art. 53, Penalties**                    | The audit trail records compliance officer, retention, and prohibited uses on every transfer. This is the foundation for permit suspension or revocation. The suspension API exists; the UI button is on the post-demo backlog.                                                                |
| **Art. 55, Datasets catalogue**           | A HealthDCAT-AP 2.1 catalogue is served at `/catalog` with full DCAT-AP fields (publisher, license, conformsTo, distribution, accessUrl). Machine-readable JSON-LD is at `/api/catalog`.                                                                                                       |
| **Art. 75, HealthData@EU cross-border**   | Cross-border is modelled as `(:HDABApproval)-[:COORDINATED_WITH]->(:HDABApproval)`. Transfer rows carry a `crossBorder=true` flag and an orange-globe Art. 7 badge. **Live federation between HDAB instances is not yet wired.** It is modelled in the graph but not yet exchanged over DSP.   |
| **Transparency, public permits register** | Approved applications are visible to any HDAB-role user via `/compliance`. CSV export is available. A public-register endpoint (no auth) is on the backlog.                                                                                                                                    |
| **Standards alignment**                   | DSP 2025-1, DCP v1.0, FHIR R4, OMOP CDM v5.4, HealthDCAT-AP 2.1, EEHRxF, ODRL 2.2, DID:web (W3C), OIDC 1.0. All are green on the local Docker stack TCK; the EHDS suite is green on Azure.                                                                                                     |

### What this demo does **not** yet cover (post-demo backlog)

| Gap                                       | Why / tracker                                                                                                                                                                                                                                        |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Live federation HDAB-ES ↔ HDAB-DE        | Needs a Spanish HDAB participant seeded plus a cross-border DSP catalog handshake. Issue [#25](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/25), follow-up [#27](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/27). |
| Real-time SPE code execution              | TEE attestation is modelled and the code hash is verified, but the actual execution runtime is mocked. Production target: Azure Confidential Computing or IBM Hyper Protect.                                                                         |
| Fee-charging workflow (Art. 51 §10)       | The fee model is documented in an ADR but there is no Stripe / SEPA integration in this reference.                                                                                                                                                   |
| Complaints & appeals interface            | The `mailto:` to the compliance officer is the placeholder. A formal complaints workflow is on the roadmap.                                                                                                                                          |
| EHDS-Article 41 EHR-system quality labels | Dataset quality labels are wired. EHR-system-level labels are not modelled yet (it would need Manufacturer / Model entities).                                                                                                                        |
| DSP / DCP green on Azure                  | The multi-port controlplane is up but per-participant seeding is missing. Tracked under issue #25. The local Docker stack is the canonical compliance proof until then.                                                                              |

---

## Pre-flight checklist

Open these tabs in order so nothing cold-starts mid-demo.

| #   | Tab                                                                               | Purpose                                      |
| --- | --------------------------------------------------------------------------------- | -------------------------------------------- |
| 1   | [`/auth/signin`](https://ehds.mabu.red/auth/signin)                               | Persona cards: visible roles                 |
| 2   | [`/graph`](https://ehds.mabu.red/graph)                                           | Default 5-layer graph, 294 nodes / 259 links |
| 3   | [`/graph?persona=hdab`](https://ehds.mabu.red/graph?persona=hdab)                 | "Govern the Dataspace": HDAB sub-graph       |
| 4   | [`/graph?persona=trust-center`](https://ehds.mabu.red/graph?persona=trust-center) | Pseudonym resolution view (Art. 50/51)       |
| 5   | [`/compliance`](https://ehds.mabu.red/compliance)                                 | EHDS approval checker (after login)          |
| 6   | [`/compliance/tck`](https://ehds.mabu.red/compliance/tck)                         | DSP 2025-1 / DCP v1.0 protocol scorecard     |
| 7   | [`/admin/audit`](https://ehds.mabu.red/admin/audit)                               | Audit & Provenance (HIPAA-style)             |
| 8   | [`/catalog`](https://ehds.mabu.red/catalog)                                       | HealthDCAT-AP dataset catalogue              |
| 9   | [`/credentials`](https://ehds.mabu.red/credentials)                               | DCP verifiable credentials                   |
| 10  | [`/admin/policies`](https://ehds.mabu.red/admin/policies)                         | ODRL policy definitions per dataset          |
| 11  | [`/eehrxf`](https://ehds.mabu.red/eehrxf)                                         | EEHRxF profile compliance per dataset        |
| 12  | [`/docs/architecture`](https://ehds.mabu.red/docs/architecture)                   | Reference for "how it works" questions       |

Login as **`regulator` / `regulator`** (HDAB_AUTHORITY). All demo personas
use `username = password` against the local Keycloak realm.

| Persona          | Username        | Role               | When to use                                    |
| ---------------- | --------------- | ------------------ | ---------------------------------------------- |
| Dataspace Admin  | `edcadmin`      | EDC_ADMIN          | Optional sidebar: managing the dataspace       |
| Data Holder (DE) | `clinicuser`    | DATA_HOLDER        | "AlphaKlinik Berlin": the data origin          |
| Data Holder (NL) | `lmcuser`       | DATA_HOLDER        | "Limburg Medical Centre": cross-border peer    |
| Researcher       | `researcher`    | DATA_USER          | "PharmaCo Research AG": applicant              |
| **HDAB**         | **`regulator`** | **HDAB_AUTHORITY** | **Primary persona for this meeting**           |
| Patient          | `patient1`      | PATIENT            | If asked about the citizen view (Art. 3 to 12) |

---

## Walkthrough

### Intro & dataspace topology

Open tab 2: [`/graph`](https://ehds.mabu.red/graph). The 5-layer EHDS graph
fits in one viewport.

- L1 Marketplace: Participants, DataProducts, ODRL policies, Contracts, HDAB Approvals.
- L2 HealthDCAT-AP: Catalogue, Datasets, Distributions, DataServices.
- L3 FHIR R4: Patients, Conditions, Observations, MedicationRequests.
- L4 OMOP CDM: Persons, ConditionOccurrence, DrugExposure, Measurement.
- L5 Biomedical ontology: SNOMED, ICD-10, RxNorm, LOINC.

Three-line script:

> "This is one Neo4j graph holding the EHDS reference data: 127 synthetic
> patients across 5 fictional EU participants. Every node a regulator might
> need to inspect (patient, condition, dataset, contract, HDAB approval) is
> here, queryable through DSP and HealthDCAT-AP exactly as it would be in a
> production HDAB."

### HDAB persona graph & sign-in

Open tab 1: [`/auth/signin`](https://ehds.mabu.red/auth/signin). Show the
persona cards. Sign in as **`regulator`** (password `regulator`).

Land on the HDAB graph view: tab 3
[`/graph?persona=hdab`](https://ehds.mabu.red/graph?persona=hdab). The live
API returns **8 participants plus 31 governance nodes plus 4 trust-center
nodes** for this persona. The center label answers _"Govern the dataspace."_

Talking points:

- Two HDABs are seeded: `MedReg DE` and `Institut de Recherche Santé`
  (FR). A Spanish HDAB would slot in as a third peer with its own
  `did:web:<domain>:hdab` identifier.
- Article 75 cross-border coordination is modelled as
  `(:HDABApproval)-[:COORDINATED_WITH]->(:HDABApproval)` between peer
  HDABs. The Spanish HDAB would coordinate with `MedReg DE` whenever a
  Spanish citizen's data is requested by a German researcher.

### Data permit & approval workflow (Art. 46 to 49)

Open tab 5: [`/compliance`](https://ehds.mabu.red/compliance). This is the
EHDS approval checker. Each row is an `:AccessApplication` from a
researcher to a dataset, with the approval chain:

```
DATA_USER (researcher) -> AccessApplication -> HDABApproval -> Contract -> TransferEvent
```

Show one approved application end to end (a `pharmaco`-requested OMOP
cohort to study a cardiovascular drug). Then open tab 10
[`/admin/policies`](https://ehds.mabu.red/admin/policies) for the ODRL
policy attached to the dataset: Art. 53(c) research purpose, Art. 7
cross-border permission, retention 730 days, prohibited re-identification.

EHDS articles to reference here: **Art. 46 to 49** (researcher → HDAB
application) and **Art. 50 to 53** (HDAB approval, conditions, denial
reasons, penalties).

### Audit & provenance (Art. 37, 38, 53)

Open tab 7: [`/admin/audit`](https://ehds.mabu.red/admin/audit). The page
has five tabs.

- **Overview:** node counts (transfers, negotiations, credentials, access logs).
- **Transfers:** every `TransferEvent`, with direction, byte size, EHDS article badge, and a "Mail compliance officer" button (Art. 51 enforcement contact).
- **Negotiations:** DSP contract negotiations, ODRL policy expanded inline, EDC endpoints, contract IDs.
- **Credentials:** every VC issued (HDAB participant credential, EHDS access credential).
- **Access Logs:** per-row data accesses inside the SPE, pseudonym-aware.

The CSV export buttons exist for offline auditor review. Cross-border
transfers carry an orange globe and an Art. 7 badge.

Spanish-HDAB framing: this is the table a Spanish HDAB would inherit when
joining the dataspace. Every transfer involving a Spanish citizen would
show up here with a `crossBorder=true` flag and the Spanish HDAB's
compliance officer as the escalation contact.

### Trust Center & pseudonym resolution (Art. 50/51)

Open tab 4:
[`/graph?persona=trust-center`](https://ehds.mabu.red/graph?persona=trust-center).
Center label: _"Operate trust services."_ The graph shows
`(:TrustCenter)-[:RESOLVES_PSEUDONYMS_FOR]->(:HealthDataset)` and
`(:ResearchPseudonym)-[:LINKED_FROM]->(:ProviderPseudonym)`. This is the
Art. 50/51 pseudonym resolution.

Two modes are wired up.

- **Stateless:** deterministic HMAC-SHA-256 derivation
  (`HMAC(studyId:providerId:providerPSN, key)`). Fast, no storage, but
  irrevocable. Code:
  [`services/neo4j-proxy/src/index.ts:3543-3553`](https://github.com/ma3u/MinimumViableHealthDataspacev2/blob/main/services/neo4j-proxy/src/index.ts#L3543-L3553).
- **Key-managed:** stored mapping with per-dataset revocation. The key is
  split between Trust Center and HDAB (production: Shamir secret sharing).

Endpoints:

- `POST /trust-center/resolve`: provider PSN to research PSN (HDAB-only).
- `GET /trust-center/audit`: resolution audit log.
- `DELETE /trust-center/revoke/{rpsn}`: revoke a research pseudonym.

### Catalogue, EEHRxF & data quality (Art. 55 to 56)

Open tab 8: [`/catalog`](https://ehds.mabu.red/catalog). The HealthDCAT-AP
2.1 dataset catalogue carries title, publisher, license, conformsTo,
distribution, access URL, and an EEHRxF compliance badge.

Open tab 11: [`/eehrxf`](https://ehds.mabu.red/eehrxf). The page shows a
per-dataset profile-conformance table (PatientSummary, Laboratory, Imaging,
ePrescription, Discharge). Each row links into the relevant FHIR profile.

This is the public-catalogue surface the Spanish HDAB would publish under
Art. 55, with the quality labels (Art. 56) attached.

### Protocol compliance (DSP / DCP / EHDS)

Open tab 6: [`/compliance/tck`](https://ehds.mabu.red/compliance/tck). The
live scorecard runs three suites.

- **DSP 2025-1:** Dataspace Protocol catalog, negotiation, transfer schema.
- **DCP v1.0:** DIDs, key pairs, verifiable credentials, issuer service.
- **EHDS:** HealthDCAT-AP, EEHRxF profiles, OMOP CDM, Article 53 enforcement.

Expected demo state:

- ✅ 6 of 6 EHDS rows green (Neo4j-backed integrity checks).
- ⚪ DSP and DCP rows render as **neutral blue "skipped"** with a banner.
  EDC services on Azure use single-port ingress while EDC needs four
  Jetty ports per service. The local Docker stack runs the full DSP/DCP
  validation green. The scope split is recorded in
  [ADR-022](https://github.com/ma3u/MinimumViableHealthDataspacev2/blob/main/docs/ADRs/ADR-022-edc-connector-cost-vs-function.md)
  and tracked by [issue #25](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/25).

This is the page to point at when asked _"is the connector compliant?"_.
The scorecard shows EHDS green and a clearly-documented Azure scope-split,
which is honest, auditable, and traceable to specific ADRs.

---

## Q&A talking points

| Question                                               | One-line answer                                                                                                                                                                                                                                      |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| _Is this real patient data?_                           | No: 127 synthetic Synthea patients. Source script: `scripts/generate-synthea.sh`. Fictional org names only (AlphaKlinik Berlin, PharmaCo Research AG, etc.); never real clinics, ministries, or pharma companies.                                    |
| _What's the auth model?_                               | Keycloak realm `edcv` issues OIDC tokens; UI is a Next.js 14 RP, EDC connector runs DCP for participant-to-participant trust. 7 demo roles: EDC_ADMIN, DATA_HOLDER, DATA_USER, HDAB_AUTHORITY, TRUST_CENTER_OPERATOR, PATIENT, EDC_USER_PARTICIPANT. |
| _How is patient consent represented?_                  | `(:Patient)-[:CONSENTS_TO]->(:DataProduct)` with a temporal `consentedAt` property; consent withdrawal is modelled as a relationship update plus a cascade to all downstream contracts.                                                              |
| _Where does GDPR Art. 15 to 22 (subject rights) live?_ | `/patient/profile` (Art. 15 access), `/patient/insights` (Art. 22 explanation of automated decisions), `/patient/research` (Art. 7 consent for research). Open with persona `patient1`.                                                              |
| _What about cross-border (Art. 75)?_                   | Modelled as `(:HDABApproval)-[:COORDINATED_WITH]->(:HDABApproval)`. The audit page filters on `crossBorder=true`. Live HealthData@EU federation between HDAB nodes is on the post-demo backlog.                                                      |
| _Is a Spanish HDAB pluggable?_                         | Yes. Add a fifth participant with `did:web:<spanish-domain>:hdab`, give them HDAB_AUTHORITY role in Keycloak, and mint the participant credential through the IssuerService. Onboarding script: `jad/seed-all.sh` phases 2 to 4.                     |
| _Source of the protocol implementations?_              | Eclipse Dataspace Components: `connector` for DSP, `IdentityHub` plus `IssuerService` for DCP. Forked and EHDS-extended in `connector-fork/`.                                                                                                        |
| _Open source?_                                         | Yes. Apache 2.0. All ADRs live in [`docs/ADRs/`](https://github.com/ma3u/MinimumViableHealthDataspacev2/tree/main/docs/ADRs).                                                                                                                        |
| _What's not yet on Azure?_                             | Per-participant DSP/DCP runtime. The controlplane runs, but the 5 ParticipantContexts aren't seeded (see [issue #25](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/25)). Local Docker Compose runs the full stack.                   |
| _Standards alignment?_                                 | DSP 2025-1, DCP v1.0, FHIR R4, OMOP CDM v5.4, HealthDCAT-AP 2.1, EEHRxF, ODRL 2.2, DID:web (W3C), OIDC 1.0. EHDS Art. 3 to 12 (primary use), Art. 46 to 53 (secondary use). GDPR Art. 15 to 22.                                                      |

---

## Backup links (if a tab fails to load)

| If…                         | Open instead                                                                                                  |
| --------------------------- | ------------------------------------------------------------------------------------------------------------- |
| TCK page errors out         | [`/compliance`](https://ehds.mabu.red/compliance), the EHDS approval checker (Neo4j-only, no EDC dependency). |
| Audit table is slow         | [`/admin/components`](https://ehds.mabu.red/admin/components), the component health view.                     |
| Trust Center graph is empty | [`/graph`](https://ehds.mabu.red/graph), the default graph; filter by group "trust-center" in the controls.   |
| Login times out             | Tabs 2 and 9 (`/graph`, `/credentials`) work without auth.                                                    |

---

## After the demo

- GitHub Pages mirror (no auth required, mock data):
  [https://ma3u.github.io/MinimumViableHealthDataspacev2/](https://ma3u.github.io/MinimumViableHealthDataspacev2/).
  Useful as a shareable read-only link.
- Source: [github.com/ma3u/MinimumViableHealthDataspacev2](https://github.com/ma3u/MinimumViableHealthDataspacev2).
- ADR index: [`docs/ADRs/`](https://github.com/ma3u/MinimumViableHealthDataspacev2/tree/main/docs/ADRs).
- Architectural overview: [`/docs/architecture`](https://ehds.mabu.red/docs/architecture).

If a follow-up session is requested, the natural next step is to add a
Spanish HDAB persona to `jad/keycloak-realm.json` plus a `did:web`
participant in the seed cypher, then walk through the cross-border
approval chain end to end with the Spanish HDAB as a coordinating peer.
That follow-up is tracked in issue
[#27](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/27).

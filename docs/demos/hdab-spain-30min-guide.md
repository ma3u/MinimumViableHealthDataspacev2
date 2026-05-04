# 30-Minute Demo Guide — Spanish HDAB Regulator

**Audience:** Spanish Health Data Access Body regulator, peer to the seeded
`MedReg DE` and `Institut de Recherche Santé` HDABs in this reference
implementation.

**Live demo:** [https://ehds.mabu.red](https://ehds.mabu.red)

**Repo:** [github.com/ma3u/MinimumViableHealthDataspacev2](https://github.com/ma3u/MinimumViableHealthDataspacev2)

**Goal:** show that an EHDS reference implementation can demonstrate every
HDAB-relevant control surface — primary-use patient rights (Art. 3-12),
secondary-use access approval (Art. 46-53), cross-border participant
coordination (Art. 14), and DSP / DCP / HealthDCAT-AP protocol compliance —
in 30 minutes with synthetic data.

---

## Pre-flight checklist (5 minutes before)

Open these tabs in order so you never wait on a cold start during the demo:

| #   | Tab                                                                               | Purpose                                      |
| --- | --------------------------------------------------------------------------------- | -------------------------------------------- |
| 1   | [`/auth/signin`](https://ehds.mabu.red/auth/signin)                               | Persona cards — visible roles                |
| 2   | [`/graph`](https://ehds.mabu.red/graph)                                           | Default 5-layer graph, 294 nodes / 259 links |
| 3   | [`/graph?persona=hdab`](https://ehds.mabu.red/graph?persona=hdab)                 | "Govern the Dataspace" — HDAB sub-graph      |
| 4   | [`/graph?persona=trust-center`](https://ehds.mabu.red/graph?persona=trust-center) | Pseudonym resolution view (Art. 50/51)       |
| 5   | [`/compliance`](https://ehds.mabu.red/compliance)                                 | EHDS approval checker (after login)          |
| 6   | [`/compliance/tck`](https://ehds.mabu.red/compliance/tck)                         | DSP 2025-1 / DCP v1.0 protocol scorecard     |
| 7   | [`/admin/audit`](https://ehds.mabu.red/admin/audit)                               | Audit & Provenance (HIPAA-style)             |
| 8   | [`/catalog`](https://ehds.mabu.red/catalog)                                       | HealthDCAT-AP dataset catalogue              |
| 9   | [`/credentials`](https://ehds.mabu.red/credentials)                               | DCP verifiable credentials                   |
| 10  | [`/docs/architecture`](https://ehds.mabu.red/docs/architecture)                   | Reference for "how it works" questions       |

Login as **`regulator` / `regulator`** (HDAB_AUTHORITY). All 5 demo personas
use `username = password` against the local Keycloak realm.

| Persona          | Username        | Role               | When to use                                  |
| ---------------- | --------------- | ------------------ | -------------------------------------------- |
| Dataspace Admin  | `edcadmin`      | EDC_ADMIN          | Optional sidebar — managing the dataspace    |
| Data Holder (DE) | `clinicuser`    | DATA_HOLDER        | "AlphaKlinik Berlin" — the data origin       |
| Data Holder (NL) | `lmcuser`       | DATA_HOLDER        | "Limburg Medical Centre" — cross-border peer |
| Researcher       | `researcher`    | DATA_USER          | "PharmaCo Research AG" — applicant           |
| **HDAB**         | **`regulator`** | **HDAB_AUTHORITY** | **Primary persona for this meeting**         |
| Patient          | `patient1`      | PATIENT            | If asked about citizen view (Art. 3-12)      |

---

## 30-minute walkthrough

### 0:00 – 2:00 — Intro & dataspace topology (2 min)

Open tab 2: [`/graph`](https://ehds.mabu.red/graph). 5-layer EHDS graph in
one viewport:

- L1 Marketplace — Participants, DataProducts, ODRL policies, Contracts, HDAB Approvals
- L2 HealthDCAT-AP — Catalogue, Datasets, Distributions, DataServices
- L3 FHIR R4 — Patients, Conditions, Observations, MedicationRequests
- L4 OMOP CDM — Persons, ConditionOccurrence, DrugExposure, Measurement
- L5 Biomedical ontology — SNOMED, ICD-10, RxNorm, LOINC

Three-line script:

> "This is one Neo4j graph holding the EHDS reference data — 127 synthetic
> patients across 5 fictional EU participants. Every node a regulator might
> need to inspect — patient, condition, dataset, contract, HDAB approval —
> is here, queryable through DSP and HealthDCAT-AP exactly as it would be in
> a production HDAB."

### 2:00 – 7:00 — HDAB persona graph & sign-in (5 min)

Open tab 1: [`/auth/signin`](https://ehds.mabu.red/auth/signin). Show the
persona cards. Sign in as **`regulator`** (password = `regulator`).

Land on the HDAB graph view: tab 3
[`/graph?persona=hdab`](https://ehds.mabu.red/graph?persona=hdab). Live API
returns **8 participants + 31 governance nodes + 4 trust-center nodes** for
this persona. The center label answers _"Govern the dataspace."_

Talking points:

- Two HDABs are seeded — `MedReg DE` and `Institut de Recherche Santé`
  (FR). A Spanish HDAB would slot in as a third peer with its own
  `did:web:<domain>:hdab` identifier.
- Article 14 cross-border coordination is modelled as
  `(:HDABApproval)-[:COORDINATED_WITH]->(:HDABApproval)` between peer HDABs.

### 7:00 – 13:00 — HDAB approval workflow (6 min)

Open tab 5: [`/compliance`](https://ehds.mabu.red/compliance). EHDS
approval checker. Each row is an `:AccessApplication` from a researcher to
a dataset, with the approval chain:

```
DATA_USER (researcher) -> AccessApplication -> HDABApproval -> Contract -> TransferEvent
```

Show one approved application end-to-end (a `pharmaco`-requested OMOP
cohort to study a cardiovascular drug). Then open
[`/admin/policies`](https://ehds.mabu.red/admin/policies) for the ODRL
policy attached to the dataset — Art. 53(c) research purpose, Art. 7
cross-border permission, retention 730 days, prohibited re-identification.

EHDS articles to reference here: **Art. 46–49** (researcher → HDAB
application), **Art. 50–53** (HDAB approval, conditions, denial reasons,
penalties).

### 13:00 – 19:00 — Audit & provenance (6 min)

Open tab 7: [`/admin/audit`](https://ehds.mabu.red/admin/audit). Tabs:

- **Overview** — node counts (transfers, negotiations, credentials, access logs)
- **Transfers** — every `TransferEvent`, direction, byte size, EHDS article badge, "Mail compliance officer" button (Art. 51 enforcement contact)
- **Negotiations** — DSP contract negotiations, ODRL policy expanded inline, EDC endpoints, contract IDs
- **Credentials** — every VC issued (HDAB participant credential, EHDS access credential)
- **Access Logs** — per-row data accesses inside the SPE, pseudonym-aware

The CSV export buttons exist for offline auditor review. Cross-border
transfers carry an orange globe + Art. 7 badge.

Spanish-HDAB framing: this is the table a Spanish HDAB would inherit when
joining the dataspace — every transfer involving a Spanish citizen would
show up here with a `crossBorder=true` flag and the Spanish HDAB's
compliance officer as escalation contact.

### 19:00 – 24:00 — Trust Center & pseudonym resolution (5 min)

Open tab 4:
[`/graph?persona=trust-center`](https://ehds.mabu.red/graph?persona=trust-center).
Center label: _"Operate trust services."_ The graph shows
`(:TrustCenter)-[:RESOLVES_PSEUDONYMS_FOR]->(:HealthDataset)` and
`(:ResearchPseudonym)-[:LINKED_FROM]->(:ProviderPseudonym)` — Art. 50/51
pseudonym resolution.

Two modes are wired up:

- **Stateless** — Deterministic HMAC-SHA-256 derivation
  (`HMAC(studyId:providerId:providerPSN, key)`). Fast, no storage, but
  irrevocable. Code: [`services/neo4j-proxy/src/index.ts:3543-3553`](https://github.com/ma3u/MinimumViableHealthDataspacev2/blob/main/services/neo4j-proxy/src/index.ts#L3543-L3553)
- **Key-managed** — Stored mapping with per-dataset revocation; key
  splitting between Trust Center and HDAB (production: Shamir secret
  sharing).

Endpoints:

- `POST /trust-center/resolve` — provider PSN → research PSN (HDAB-only)
- `GET /trust-center/audit` — resolution audit log
- `DELETE /trust-center/revoke/{rpsn}` — revoke a research pseudonym

### 24:00 – 28:00 — Protocol compliance (DSP / DCP / EHDS) (4 min)

Open tab 6: [`/compliance/tck`](https://ehds.mabu.red/compliance/tck). The
live scorecard runs three suites:

- **DSP 2025-1** — Dataspace Protocol catalog, negotiation, transfer schema
- **DCP v1.0** — DIDs, key pairs, verifiable credentials, issuer service
- **EHDS** — HealthDCAT-AP, EEHRxF profiles, OMOP CDM, Article 53 enforcement

Expected demo state:

- ✅ 6 / 6 EHDS rows green (Neo4j-backed integrity checks)
- ⚪ DSP and DCP rows render as **neutral blue "skipped"** with a banner —
  EDC services on Azure use single-port ingress while EDC needs four
  Jetty ports per service. The local Docker stack runs the full DSP/DCP
  validation green; the scope split is recorded in
  [ADR-022](https://github.com/ma3u/MinimumViableHealthDataspacev2/blob/main/docs/ADRs/ADR-022-edc-connector-cost-vs-function.md)
  and tracked by [issue #25](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/25).

This is the page to point at when asked _"is the connector compliant?"_ —
the scorecard with EHDS green and a clearly-documented Azure scope-split is
honest, auditable, and traceable to specific ADRs.

### 28:00 – 30:00 — Q&A buffer (2 min)

---

## Q&A talking points

| Question                                            | One-line answer                                                                                                                                                                                                                                      |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| _Is this real patient data?_                        | No — 127 synthetic Synthea patients. Source script: `scripts/generate-synthea.sh`. Fictional org names only (AlphaKlinik Berlin, PharmaCo Research AG, etc.) — never real clinics, ministries, or pharma companies.                                  |
| _What's the auth model?_                            | Keycloak realm `edcv` issues OIDC tokens; UI is a Next.js 14 RP, EDC connector runs DCP for participant-to-participant trust. 7 demo roles: EDC_ADMIN, DATA_HOLDER, DATA_USER, HDAB_AUTHORITY, TRUST_CENTER_OPERATOR, PATIENT, EDC_USER_PARTICIPANT. |
| _How is patient consent represented?_               | `(:Patient)-[:CONSENTS_TO]->(:DataProduct)` with a temporal `consentedAt` property; consent withdrawal is modelled as a relationship update + cascade to all downstream contracts.                                                                   |
| _Where does GDPR Art. 15-22 (subject rights) live?_ | `/patient/profile` (Art. 15 access), `/patient/insights` (Art. 22 explanation of automated decisions), `/patient/research` (Art. 7 consent for research). Open with persona `patient1`.                                                              |
| _What about cross-border (Art. 14)?_                | Modelled as `(:HDABApproval)-[:COORDINATED_WITH]->(:HDABApproval)`. The audit page filters on `crossBorder=true`.                                                                                                                                    |
| _Is a Spanish HDAB pluggable?_                      | Yes. Add a fifth participant with `did:web:<spanish-domain>:hdab`, give them HDAB_AUTHORITY role in Keycloak, mint the participant credential through the IssuerService. Onboarding script: `jad/seed-all.sh` phases 2–4.                            |
| _Source of the protocol implementations?_           | Eclipse Dataspace Components — `connector` for DSP, `IdentityHub` + `IssuerService` for DCP. Forked + EHDS-extended in `connector-fork/`.                                                                                                            |
| _Open source?_                                      | Yes. Apache 2.0. All ADRs in [`docs/ADRs/`](https://github.com/ma3u/MinimumViableHealthDataspacev2/tree/main/docs/ADRs).                                                                                                                             |
| _What's not yet on Azure?_                          | Per-participant DSP/DCP runtime (controlplane runs, but the 5 ParticipantContexts aren't seeded — see [issue #25](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/25)). Local Docker Compose runs the full stack.                      |
| _Standards alignment?_                              | DSP 2025-1, DCP v1.0, FHIR R4, OMOP CDM v5.4, HealthDCAT-AP 2.1, ODRL 2.2, DID:web (W3C), OIDC 1.0. EHDS Art. 3-12 (primary use), Art. 46-53 (secondary use). GDPR Art. 15-22.                                                                       |

---

## Backup links (if a tab fails to load)

| If…                         | Open instead                                                                                              |
| --------------------------- | --------------------------------------------------------------------------------------------------------- |
| TCK page errors out         | [`/compliance`](https://ehds.mabu.red/compliance) (EHDS approval checker — Neo4j-only, no EDC dependency) |
| Audit table is slow         | [`/admin/components`](https://ehds.mabu.red/admin/components) (component health view)                     |
| Trust Center graph is empty | [`/graph`](https://ehds.mabu.red/graph) (default graph) + filter by group "trust-center" in the controls  |
| Login times out             | Tabs 2 + 9 (`/graph`, `/credentials`) work without auth                                                   |

---

## After the demo

- GitHub Pages mirror (no auth required, mock data):
  [https://ma3u.github.io/MinimumViableHealthDataspacev2/](https://ma3u.github.io/MinimumViableHealthDataspacev2/)
  Useful for sharing a link with the regulator afterwards.
- Source: [github.com/ma3u/MinimumViableHealthDataspacev2](https://github.com/ma3u/MinimumViableHealthDataspacev2)
- ADR index:
  [docs/ADRs/](https://github.com/ma3u/MinimumViableHealthDataspacev2/tree/main/docs/ADRs)
- Architectural overview:
  [`/docs/architecture`](https://ehds.mabu.red/docs/architecture)

If a follow-up session is requested, the natural next step is to add a
Spanish-HDAB persona to `jad/keycloak-realm.json` + a `did:web` participant
in the seed cypher, and walk through the cross-border approval chain end to
end with the Spanish HDAB as a coordinating peer.

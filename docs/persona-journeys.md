# Persona Journeys — EHDS Health Dataspace v2

Each EHDS participant type has a distinct role, different data access needs,
and a specific entry point into the platform. This document maps each persona
to their journey through the system, the graph view they see, and the EHDS
regulation articles that govern their actions.

Related: [docs/graph-explorer.md](./graph-explorer.md) — graph structure,
colors, filter presets.

---

## Persona Overview

| Persona                    | EHDS Role      | Fictional actor                            | Graph persona ID | Primary entry point                                         |
| -------------------------- | -------------- | ------------------------------------------ | ---------------- | ----------------------------------------------------------- |
| **Hospital / Data Holder** | DATA_HOLDER    | AlphaKlinik Berlin, Limburg Medical Centre | `hospital`       | `/catalog` → `/graph?persona=hospital`                      |
| **Researcher / Data User** | DATA_USER      | PharmaCo Research AG                       | `researcher`     | `/catalog` → `/data/discover` → `/graph?persona=researcher` |
| **HDAB Authority**         | HDAB_AUTHORITY | MedReg DE, Institut de Recherche Santé     | `hdab`           | `/compliance` → `/graph?persona=hdab`                       |
| **Trust Center Operator**  | HDAB / TC      | RKI (DE), RIVM (NL)                        | `trust-center`   | `/compliance#trust-center` → `/graph?persona=trust-center`  |
| **EDC Admin / Operator**   | EDC_ADMIN      | Dataspace Operator                         | `edc-admin`      | `/admin` → `/graph?persona=edc-admin`                       |

---

## 1 — Hospital / Data Holder

### Primary question

> **"Who has approved access to my datasets, and under what conditions?"**

### Journey map

```
1. Login (clinicuser / AlphaKlinik Berlin)
2. /catalog     → Review my published HealthDatasets
3. /compliance  → Check HDAB approval chain for each dataset
4. /graph?persona=hospital
                → See: Participant (self) → DataProduct → Contract
                       → HDABApproval → HealthDataset → EEHRxFProfile
5. Click HDABApproval node → expand → see linked AccessApplications
6. Click HealthDataset  → expand → see Distributions and EEHRxF profiles
7. /compliance  → Verify VerifiableCredentials are valid
```

### Key graph nodes

| Node                   | What it means                                                |
| ---------------------- | ------------------------------------------------------------ |
| `Participant` (amber)  | Your organisation's identity in the dataspace                |
| `HealthDataset`        | Each dataset you've published with HealthDCAT-AP metadata    |
| `Distribution`         | FHIR/OMOP endpoints served by DCore data planes              |
| `Contract`             | Active DSP contracts granting access to specific researchers |
| `HDABApproval` (red)   | HDAB decision authorising secondary use                      |
| `AccessApplication`    | Researcher's application for your data                       |
| `VerifiableCredential` | DCP v1.0 credentials proving role and data quality           |
| `EEHRxFProfile`        | EU FHIR profile conformance score for your dataset           |

### EHDS regulation mapping

| Step                          | EHDS Article | Action                                            |
| ----------------------------- | ------------ | ------------------------------------------------- |
| Publish dataset metadata      | Art. 33      | Register HealthDataset with HealthDCAT-AP         |
| Attach access conditions      | Art. 36      | ODRL policy with EHDS purpose codes               |
| Respond to access application | Art. 45      | HDAB reviews; data holder notified                |
| Provide data to SPE           | Art. 50      | Data transferred to Secure Processing Environment |
| Pseudonymisation              | Art. 37      | Patient data pseudonymised before leaving clinic  |

### Missing journeys (extension opportunities)

- **Data quality attestation**: Update DataQualityCredential completeness score
- **Restrict access**: Revoke a specific Contract when HDAB approval expires
- **Cross-border publishing**: Register dataset with FR/NL HDAB as well as DE

---

## 2 — Researcher / Data User

### Primary question

> **"What datasets match my research protocol, and how can I access them inside the SPE?"**

### Journey map

```
1. Login (researcher / PharmaCo Research AG)
2. /catalog     → Browse HealthDCAT-AP datasets by purpose code
3. /data/discover → Search by condition (e.g. "diabetes", SNOMED 73211009)
4. /negotiate   → Initiate DSP contract negotiation
5. /data/transfer → Trigger data transfer to SPE
6. /graph?persona=researcher
                → See: HealthDataset → DataProduct → OMOPPerson
                       → OMOPConditionOccurrence → SnomedConcept
                       → ResearchPseudonym → SPESession
7. Click SPESession node → verify kAnonymityThreshold ≥ 5
8. /analytics   → Run OMOP cohort queries (aggregate-only inside SPE)
9. /patient     → View FHIR R4 patient timeline (pseudonymised)
```

### Key graph nodes

| Node                      | What it means                                            |
| ------------------------- | -------------------------------------------------------- |
| `HealthDataset`           | Available datasets from the HealthDCAT-AP catalog        |
| `DataProduct`             | Packaged data asset with DSP policy                      |
| `OMOPPerson`              | Pseudonymised research subject (OMOP CDM)                |
| `OMOPConditionOccurrence` | Standardised clinical condition in OMOP format           |
| `SnomedConcept`           | SNOMED CT code linking FHIR conditions to ontology       |
| `ResearchPseudonym` (L1)  | Your study-specific pseudonym (SPE-only, never revealed) |
| `SPESession` (gold)       | The active TEE session your analytics run inside         |
| `EEHRxFProfile`           | EU FHIR profile → shows which resources are available    |

### EHDS regulation mapping

| Step                      | EHDS Article | Action                                          |
| ------------------------- | ------------ | ----------------------------------------------- |
| Discover datasets         | Art. 46      | Browse HealthDCAT-AP catalog                    |
| Submit access application | Art. 47      | Apply to HDAB for secondary use permit          |
| Receive data in SPE       | Art. 50      | Data loaded into TEE; pseudonyms resolved by TC |
| Run analytics             | Art. 50 §3   | Aggregate-only output; k-anonymity ≥ 5          |
| Cross-border data         | Art. 51      | RIVM/RKI mutual recognition for NL+DE datasets  |

### Researcher-specific filter presets

Use the sidebar filter presets while in the `researcher` persona view:

- **"OMOP analytics"** — surfaces OMOPPerson, ConditionOccurrence, drugs
- **"Clinical cohort"** — surfaces Patient, Condition, SNOMED, ICD-10
- **"Pseudonym resolution chain"** — surfaces the SPE session and RPSN nodes

---

## 3 — HDAB Authority

### Primary question

> **"What access applications are pending? Is every approval chain legally complete?"**

### Journey map

```
1. Login (regulator / MedReg DE)
2. /compliance  → Review EHDS approval checker (consumer × dataset matrix)
3. /compliance  → Trust Center section: verify TC governance is in place
4. /graph?persona=hdab
                → See: HDABApproval → AccessApplication → Participant
                       → DataProduct → Contract → VerifiableCredential
                       → TrustCenter → SPESession
5. Click HDABApproval (red) → inspect ehdsArticle and status
6. Click TrustCenter (violet) → verify GOVERNED_BY link to this HDABApproval
7. Click VerifiableCredential → expand → see issuer, subject, expiry
8. /compliance/tck → Run DSP/DCP/EHDS compliance test suite
```

### Key graph nodes

| Node                   | What it means                                                    |
| ---------------------- | ---------------------------------------------------------------- |
| `HDABApproval` (red)   | Your approval decision; links to application and dataset         |
| `AccessApplication`    | Researcher's application — status: pending / approved / rejected |
| `VerifiableCredential` | DCP v1.0 credential issued by IssuerService under HDAB authority |
| `TrustCenter` (violet) | TC you govern; must have `GOVERNED_BY` link to an `HDABApproval` |
| `SPESession` (gold)    | Active TEE sessions; you created them, not the researcher        |
| `Contract`             | DSP contract; must have `APPROVED_BY` link to an `HDABApproval`  |

### EHDS regulation mapping

| Step                       | EHDS Article | Action                                             |
| -------------------------- | ------------ | -------------------------------------------------- |
| Review access applications | Art. 45      | Approve or reject with stated reason               |
| Issue approval             | Art. 45 §4   | Create `HDABApproval` node with `ehdsArticle`      |
| Create SPE session         | Art. 50      | Provision TEE with approved code hash              |
| Authorise TC               | Art. 50 §2   | `TrustCenter GOVERNED_BY HDABApproval` edge        |
| Cross-border recognition   | Art. 51      | `TrustCenter MUTUALLY_RECOGNISES TrustCenter` edge |
| Revoke pseudonym           | Art. 37      | `DELETE /trust-center/revoke/:rpsn`                |

---

## 4 — Trust Center Operator

### Primary question

> **"Which provider pseudonyms am I resolving, for which studies, and with what governance?"**

### Journey map

```
1. Login (hdab operator / RKI or RIVM)
2. /compliance#trust-center
                → Review Trust Center cards: status, governed datasets,
                  active RPSNs, SPE sessions, cross-border recognition
3. /graph?persona=trust-center
                → See: TrustCenter → HDABApproval → HealthDataset
                       → SPESession → ResearchPseudonym → ProviderPseudonym
4. Click TrustCenter (violet) → inspect protocol and DID
5. Click SPESession (gold) → verify kAnonymityThreshold and outputPolicy
6. Click ResearchPseudonym → verify issuedBy = your TC's DID, revoked = false
7. POST /trust-center/resolve (HDAB-auth only)
                → Map provider PSNs to research PSN for new study
8. GET /trust-center/audit → Verify resolution audit trail
9. DELETE /trust-center/revoke/:rpsn → Unlinkability on study closure
```

### Key graph nodes

| Node                   | What it means                                                     |
| ---------------------- | ----------------------------------------------------------------- |
| `TrustCenter` (violet) | Your TC node — must have `did`, `status: active`, `GOVERNED_BY`   |
| `SPESession` (gold)    | Sessions your TC manages: `MANAGES` edge from TC                  |
| `ResearchPseudonym`    | RPSN issued by your TC (`issuedBy = your DID`)                    |
| `ProviderPseudonym`    | Source PSNs from participating data holders                       |
| `HDABApproval`         | The HDAB decision authorising your TC for this study              |
| `HealthDataset`        | Datasets whose pseudonyms you resolve (`RESOLVES_PSEUDONYMS_FOR`) |

### Trust Center API endpoints

| Method   | Path                         | Auth       | Purpose                          |
| -------- | ---------------------------- | ---------- | -------------------------------- |
| `POST`   | `/trust-center/resolve`      | HDAB token | Map provider PSNs → research PSN |
| `GET`    | `/trust-center/audit`        | HDAB token | Resolution audit log             |
| `DELETE` | `/trust-center/revoke/:rpsn` | HDAB token | Revoke RPSN (key-managed only)   |
| `GET`    | `/trust-center/status`       | Public     | TC status + governance chain     |

### Cross-border flow (Art. 51)

```
DE Study (AlphaKlinik + Limburg MC)

  AlphaKlinik PSN ──────►  RKI Trust Center (DE) ──► RPSN-X
  Limburg MC PSN  ──────►  RIVM Trust Center (NL) ──► RPSN-X
                                      ▲
                         MUTUALLY_RECOGNISES (DE ↔ NL)
```

---

## 5 — EDC Admin / Dataspace Operator

### Primary question

> **"Who are my active participants? What contracts and data transfers are in flight?"**

### Journey map

```
1. Login (edcadmin / Dataspace Operator)
2. /admin       → Component health dashboard (EDC-V, DCore, CFM, etc.)
3. /admin/policies → Review ODRL policies per participant
4. /admin/tenants  → CFM tenant provisioning status
5. /admin/audit    → Transfer event log
6. /graph?persona=edc-admin
                → See: Participant → DataProduct → Contract
                       → OdrlPolicy → ContractNegotiation
                       → DataTransfer → TransferEvent → VerifiableCredential
7. Click Participant (amber) → expand → see all their products and contracts
8. Click TransferEvent → inspect endpoint, status code, result count
9. /api/graph/validate → Check graph health report
```

### Key graph nodes

| Node                   | What it means                                  |
| ---------------------- | ---------------------------------------------- |
| `Participant` (amber)  | All registered participants (5 in demo)        |
| `DataProduct`          | Assets registered with EDC-V control plane     |
| `OdrlPolicy`           | ODRL access/usage policies                     |
| `Contract`             | Agreed DSP contracts                           |
| `ContractNegotiation`  | In-flight negotiations                         |
| `DataTransfer`         | Active DCore transfer processes                |
| `TransferEvent`        | EHDS audit log entry (recorded by neo4j-proxy) |
| `VerifiableCredential` | DCP v1.0 credentials across all participants   |

### Admin-specific views

| Route                 | Purpose                                            |
| --------------------- | -------------------------------------------------- |
| `/admin`              | Service health: EDC-V, DCore, CFM, IH, NATS, Vault |
| `/admin/policies`     | Per-participant ODRL policies                      |
| `/admin/tenants`      | CFM multi-tenant provisioning                      |
| `/admin/audit`        | Transfer events and compliance log                 |
| `/api/graph/validate` | Graph data integrity report                        |

---

## Missing Journeys — Extension Opportunities

The following scenarios are not yet covered by E2E tests and represent
natural Phase 19+ backlog items:

| Journey                               | Actor              | Gap                                                  |
| ------------------------------------- | ------------------ | ---------------------------------------------------- |
| Data holder publishes new dataset     | Hospital           | Create HealthDCAT-AP record via catalog editor       |
| HDAB rejects access application       | HDAB               | Application status → `rejected` with reason          |
| Researcher revises study protocol     | Researcher         | Update SPESession approved code hash                 |
| Cross-border mutual recognition setup | TC Operator + HDAB | Add `MUTUALLY_RECOGNISES` edge via UI                |
| Patient requests data deletion        | Patient            | GDPR Art. 17 — delete FHIR patient + OMOP projection |
| Operator scales participants          | EDC Admin          | Add 6th participant (fictional) with new DID         |
| Data quality degradation alert        | Hospital           | DataQualityCredential completeness drops below 80%   |
| Trust Center key rotation             | TC Operator        | `TC_HMAC_KEY` rotation + re-derive existing RPSNs    |

---

## Other User Journeys Not Yet in E2E Tests

The following interactions exist in the UI but lack dedicated E2E journey specs:

| Page                          | Interaction                              | Test spec to create                                 |
| ----------------------------- | ---------------------------------------- | --------------------------------------------------- |
| `/graph`                      | Persona selector switches subgraph       | `15-persona-graphs.spec.ts` ✅                      |
| `/graph`                      | Filter preset dims non-matching nodes    | extend `15-persona-graphs.spec.ts`                  |
| `/graph?persona=trust-center` | TrustCenter node → expand → SPESession   | extend `15-persona-graphs.spec.ts`                  |
| `/api/graph/validate`         | Returns zero orphans on clean seed       | `15-persona-graphs.spec.ts` ✅                      |
| `/compliance#trust-center`    | Trust Center cards visible after seeding | `14-trust-center.spec.ts` ✅                        |
| `/catalog`                    | HealthDCAT-AP editor saves changes       | needs `16-catalog-editor.spec.ts`                   |
| `/data/share`                 | Data holder registers new asset          | needs `16-catalog-editor.spec.ts`                   |
| `/eehrxf`                     | EEHRxF profile conformance scores        | partially in `10-eehrxf-compliance-content.spec.ts` |
| `/onboarding`                 | New participant registers + gets VC      | partially in `01-identity-onboarding.spec.ts`       |

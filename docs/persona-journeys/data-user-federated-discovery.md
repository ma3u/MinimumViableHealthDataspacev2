# Data User — Federated Discovery → Contract → Transfer

**Persona:** `DATA_USER` (PharmaCo Research AG, `did:web:pharmaco.de:research`)
**Primary question:** _"Which datasets across the dataspace match my research
protocol, and how do I get consented access to the ones I don't yet know about?"_
**Tracks:** [ADR-020](../ADRs/ADR-020-cross-participant-dataset-discovery.md),
[Issue #8](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/8),
Phase 26 in [planning-health-dataspace-v2.md](../planning-health-dataspace-v2.md)
**Test coverage:** Playwright journey `32-federated-nlq.spec.ts` (J730–J749)

## Preconditions

- Researcher is logged in to `https://ehds.mabu.red` via Keycloak as
  `researcher / PharmaCo Research AG`.
- Researcher holds at least the baseline VCs:
  `ResearchOrganisationCredential` (issued by MedReg DE),
  `DataUserCredential` (purpose: `medical-research`).
- The catalog crawler (`mvhd-catalog-crawler`) has completed at least one
  5-minute cycle — `:HealthDataset {source: "federated"}` nodes exist in
  the graph.
- At least one publisher (AlphaKlinik Berlin, Limburg Medical Centre, IRS)
  has attached an ODRL policy requiring `DataQualityLabelCredential` to
  exercise the dataset.

## Journey

### Step 1 — Discover

Researcher opens `/query` and asks:

> _"Find all diabetes datasets across German hospitals with
> DataQualityLabelCredential."_

**What happens under the hood:**

- `POST /api/nlq` forwards to `neo4j-proxy` on `/nlq`.
- 4-tier resolver matches `federated_dataset_search` (Phase 26d template).
- Glossary (`neo4j/nlq-glossary.cypher`) expands `"diabetes"` to
  `SNOMED:73211009` and `"german"` to `iso2:"DE"`.
- Cypher joins `:HealthDataset {source:"federated"}` →
  `[:HAS_THEME]->(:SnomedConcept)` AND
  `[:PUBLISHED_BY]->(:Participant {country:"DE"})` AND
  `[:GOVERNED_BY]->(:OdrlPolicy {requiresCredential:"DataQualityLabelCredential"})`.
- k-anonymity (Phase 26e): per-participant count <5 suppressed AND global
  aggregate suppressed if any contributor is suppressed.
- ODRL dual-side (Phase 26e): publisher policy evaluated against
  caller's VCs; caller's own `odrlScope` evaluated against the dataset.
  Both must pass.

**What the researcher sees:**

- Result rows with columns `Dataset | Publisher | Country | Theme |
Policy | Source | Last seen`.
- Method badge: **`template`** (green, top-right).
- Each row is a link to `/catalog/[datasetId]?source=federated`.
- If no rows: a banner explains why (glossary miss, k-anon suppression,
  ODRL mismatch) with a pointer to `/admin/audit` if the researcher has
  the admin role.

**Graph nodes touched:** L2 `HealthDataset` + `Distribution` (layer 2),
L5 `SnomedConcept` (layer 5), L1 `Participant` + `OdrlPolicy` (layer 1).

### Step 2 — Inspect the offer

Researcher clicks one row — e.g. the dataset
`diabetes-registry-berlin-2026` published by AlphaKlinik Berlin.

**What happens:**

- `/catalog/[datasetId]?source=federated` loads the existing catalog
  detail page, which fetches the cached HealthDCAT-AP document from
  Neo4j (mirrored by the enricher). No DSP round-trip unless the
  "Refresh from source" button is clicked.
- The page renders:
  - `dcat:Dataset` metadata (title, description, license, theme,
    publisher, spatial coverage)
  - `dcat:Distribution` endpoints
  - The attached `odrl:Policy` in human-readable form
    (purpose, retention, forbidden uses)
  - Required VCs to exercise the policy
  - `lastSeenAt` from the enricher audit event

### Step 3 — Check eligibility

Before contacting the publisher, the researcher wants to know whether
they can actually get this dataset.

**What happens:**

- UI calls `POST /api/policy/evaluate` with `{ datasetId, policyId }`.
- Route loads caller's VCs from the NextAuth session (populated by
  Keycloak + IdentityHub).
- Each ODRL constraint is checked:
  - `purpose == "medical-research"` → ✅ (caller's purpose)
  - `requiresCredential == "DataQualityLabelCredential"` → caller VC
    set evaluated
  - `retention <= "P2Y"` → caller's consent
  - `spatialScope ∈ {DE}` → caller's hosting region
- Badges rendered inline:
  - ✅ _Eligible_ (green, "Request contract" button enabled)
  - ⚠ _Missing credential: DataQualityLabelCredential_ (amber, link to
    `/credentials/request`)
  - ❌ _Policy mismatch on retention_ (red, button disabled with tooltip)

### Step 4 — Start negotiation

Researcher clicks **Request contract**.

**What happens:**

- `POST /api/negotiate` — existing route — invokes the connector's
  `dsp:ContractRequestMessage` against AlphaKlinik's DSP endpoint.
- **Signing DID:** caller's participant DID (`did:web:pharmaco.de:research`),
  **not** the crawler DID. The crawler DID has discovery rights only.
- Keycloak session + participant-scope mapping resolve the signing key
  via IdentityHub.
- Negotiation record persists to Neo4j as
  `(:Contract {contractId, status:"REQUESTED", signedBy, counterParty})`.

**What the researcher sees:**

- Toast: _"Request sent to AlphaKlinik Berlin. Tracking in /tasks."_
- Redirect to `/tasks`.

### Step 5 — Track + sign

The Data Processing Service (`/tasks`) shows the negotiation alongside
the researcher's other open items.

**State machine (driven by DSP events on NATS subject
`dataspace.contract.negotiation`):**

```
REQUESTED → OFFERED → AGREED → FINALIZED
    │          │         │          │
    └──────────┴─────────┴──────────┴── always terminable: TERMINATED
```

**What happens per state:**

- `OFFERED`: publisher returns their counter-offer (may differ from the
  original policy — e.g. requires extra constraint). UI diffs the two
  policies; researcher accepts or terminates.
- `AGREED`: both sides have signed. Contract hash recorded in
  `:Contract {signatureHash}`.
- `FINALIZED`: connector has persisted the signed agreement;
  researcher gets a "Start transfer" button.

**Audit trail:** every state transition writes a
`:ContractNegotiationEvent` node; EHDS Art. 50–51 transparency
obligations satisfied.

### Step 6 — Fetch data

Researcher clicks **Start transfer** on the finalized contract.

**What happens:**

- `POST /api/transfer` issues `dsp:TransferProcess` via the connector.
- Dataplane-to-dataplane transfer: AlphaKlinik's dataplane streams
  FHIR bundles (or OMOP rows) to PharmaCo's dataplane endpoint, using
  the access token minted during negotiation.
- A new `:TransferEvent {transferId, startedAt, bytesTransferred}`
  node is created and linked back to the `:Contract` and the
  `:HealthDataset` the researcher originally discovered via NLQ.
- One audit trail from question → dataset → contract → transfer:

  ```
  (:QueryAuditEvent)-[:RESULTED_IN]->(:HealthDataset)
                          ↓
                    :GOVERNED_BY
                          ↓
                  (:OdrlPolicy)
                          ↑
                    :COVERS
                          │
                    (:Contract)-[:SOURCED_FROM]->(:TransferEvent)
  ```

## Key nodes referenced by this journey

| Node                        | Layer | Role in this journey                             |
| --------------------------- | ----- | ------------------------------------------------ |
| `:Participant`              | L1    | Publishers and caller; filtered by country/theme |
| `:OdrlPolicy`               | L1    | Dual-side enforcement (publisher + caller scope) |
| `:Contract`                 | L1    | DSP negotiation state machine                    |
| `:TransferEvent`            | L1    | Audit node linking contract to data flow         |
| `:HealthDataset`            | L2    | Federated entries (`source: "federated"`)        |
| `:Distribution`             | L2    | FHIR/OMOP access URLs                            |
| `:SnomedConcept`            | L5    | Glossary target for "diabetes"                   |
| `:QueryAuditEvent`          | L1    | Every NLQ captured with federated flag           |
| `:CatalogEnrichmentEvent`   | L1    | Per-crawl audit from the enricher                |
| `:ContractNegotiationEvent` | L1    | Per-state-transition audit                       |

## EHDS regulation mapping

| Step                           | Article    | Requirement met                                   |
| ------------------------------ | ---------- | ------------------------------------------------- |
| Discover across participants   | Art. 50    | Transparent cross-border cataloguing              |
| Dual-side ODRL enforcement     | Art. 53    | Data holder policy + data user scope              |
| k-anonymity on federated count | Art. 52(3) | No re-identification via small-cohort aggregates  |
| Contract negotiation audit     | Art. 50(4) | Every state transition logged                     |
| Transfer with signed contract  | Art. 45    | No data leaves the data holder without a contract |
| Crawler DID separation         | Art. 51(2) | Discovery rights ≠ transfer rights                |

## Failure modes and user-visible messages

| Condition                                   | UI message                                                     | Recovery                                                     |
| ------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------ |
| Crawler has not run yet                     | _"No federated datasets yet — crawler cycle pending."_         | Wait ≤5 min or hit `/admin/crawler/trigger`                  |
| Glossary miss                               | _"No match for '\<term>'. Glossary contains N terms."_         | Add term to `neo4j/nlq-glossary.cypher` and re-seed          |
| k-anon suppressed                           | _"Result suppressed — cohort below 5 for one participant."_    | Broaden the filter or request aggregated study design        |
| ODRL mismatch on caller                     | _"You lack required credential: DataQualityLabelCredential"_   | Link: `/credentials/request?type=DataQualityLabelCredential` |
| Publisher offline during negotiation        | _"Publisher unreachable. Contract held in REQUESTED state."_   | DSP retry after 10 min; admin can manually retrigger         |
| Publisher counter-offer adds new constraint | _"Publisher requires extra constraint X. Accept / Terminate?"_ | User decision; diff rendered inline                          |
| Transfer fails mid-stream                   | _"Transfer interrupted. Resuming from checkpoint."_            | DSP transfer resumes; no manual action                       |

## Gaps not solved by this journey

- **Discovery beyond pre-configured + DCP-discovered participants.**
  A participant whose wallet is not in the dataspace (business, private,
  or DCP-registered) cannot be found. A truly universal discovery would
  need something like FACIS DCM — deferred.
- **Policy templating.** Researchers cannot propose a counter-policy
  today; they can only accept or terminate the publisher's offer.
  DSP 2026 will likely add this; revisit then.
- **Dynamic credential issuance.** If a researcher needs a
  `DataQualityLabelCredential` they don't have, `/credentials/request`
  routes to the MedReg DE issuer — but issuance is manual. Automating
  this is out of scope for Phase 26.

# Graph Explorer — Architecture & Usage Guide

The Knowledge Graph Explorer (`/graph`) visualises the 5-layer EHDS health
dataspace as a force-directed concentric ring layout. This document explains
the structure, colour system, researcher filter presets, validation rules, and
the embedding trade-off analysis.

---

## Layout — Five Concentric Rings

Nodes are pre-positioned in rings so physics simulation is skipped (instant
first paint). Within each ring, nodes are sorted by label type and then
alphabetically so that related node types cluster together.

```
                           ┌─ L5 Ontology (r=650) ─────────────────────┐
                      ┌─ L4 OMOP CDM (r=500) ─────────────────────┐    │
                 ┌─ L3 FHIR R4 (r=340) ──────────────────────┐   │    │
            ┌─ L2 HealthDCAT-AP (r=200) ──────────────────┐  │   │    │
       ┌─ L1 Governance (r=90) ──────────────────────┐   │  │   │    │
       │  Participant → DataProduct → Contract       │   │  │   │    │
       │  HDABApproval → TrustCenter → SPESession   │   │  │   │    │
       └────────────────────────────────────────────┘   │  │   │    │
```

**Interaction**: Click once to select + centre. Click again (same node) to
expand its immediate Neo4j neighbours. Press `Esc` to deselect.

---

## Node Layers

| Layer | Ring radius | Purpose                           | Key labels                                                                |
| ----- | ----------- | --------------------------------- | ------------------------------------------------------------------------- |
| L1    | 90          | Dataspace governance              | Participant, DataProduct, Contract, HDABApproval, TrustCenter, SPESession |
| L2    | 200         | HealthDCAT-AP metadata            | HealthDataset, Distribution, EEHRxFProfile, EhdsPurpose                   |
| L3    | 340         | FHIR R4 clinical                  | Patient, Condition, Observation, Encounter, MedicationRequest             |
| L4    | 500         | OMOP CDM analytics                | OMOPPerson, OMOPConditionOccurrence, OMOPMeasurement, OMOPDrugExposure    |
| L5    | 650         | Biomedical ontology + credentials | SnomedConcept, ICD10Code, LoincCode, RxNormConcept, VerifiableCredential  |

---

## Colour System

### Layer colours (defaults)

| Layer            | Colour       | Hex       |
| ---------------- | ------------ | --------- |
| L1 Governance    | Steel blue   | `#2471A3` |
| L2 HealthDCAT-AP | Teal         | `#148F77` |
| L3 FHIR R4       | Forest green | `#1E8449` |
| L4 OMOP CDM      | Burnt orange | `#CA6F1E` |
| L5 Ontology      | Muted purple | `#7D3C98` |

### Role-specific colours (override layer colour)

Role colours are applied BEFORE the layer fallback so the most important node
types are immediately recognisable — they are the actors researchers interact
with most.

| Node type        | Colour | Hex       | Rationale                                                                               |
| ---------------- | ------ | --------- | --------------------------------------------------------------------------------------- |
| **Participant**  | Amber  | `#E67E22` | Key actors — data holders and researchers. Amber stands out against all layer colours.  |
| **TrustCenter**  | Violet | `#8E44AD` | EHDS Art. 50 pseudonym authority. Violet distinguishes it from plain governance (blue). |
| **HDABApproval** | Red    | `#C0392B` | Authority decision nodes. Red signals governance authority.                             |
| **SPESession**   | Gold   | `#D4AC0D` | Active TEE sessions. Bright gold shows operational state.                               |

---

## Trust Center — Cross-Provider Pseudonym Resolution

The Trust Center (Phase 18, EHDS Art. 50/51) is the critical node for
understanding how patient data can be linked across providers without exposing
real identities to researchers.

```
 Provider A                    Trust Center (RKI/RIVM)          SPE (TEE)
 ──────────                    ───────────────────────          ─────────
 Patient P1 ──► psn-a-P1 ──►  HMAC(studyId:provA:psn-a-P1)   │
                               HMAC(studyId:provB:psn-b-P1)    │
 Provider B                      └──► RPSN-X ──────────────────► aggregate
 ──────────                                                       only output
 Patient P1 ──► psn-b-P1 ──►                                     ≥ k=5
```

**Security model**:

- Provider pseudonyms (`ProviderPseudonym`) are never shared with researchers
- Research pseudonyms (`ResearchPseudonym`) are only visible inside the SPE
- The SPE enforces `outputPolicy: "aggregate-only"` with `k ≥ 5`
- Revocation deletes `LINKED_FROM` edges (HDAB-initiated unlinkability)
- Stateless mode: HMAC-SHA-256 — fast, no storage, irrevocable by design
- Key-managed mode: stored with revocation; keys split between TC and HDAB

**Graph nodes involved**:

```
(:Participant)-[:OFFERS]->(:DataProduct)
(:TrustCenter)-[:GOVERNED_BY]->(:HDABApproval)
(:TrustCenter)-[:RESOLVES_PSEUDONYMS_FOR]->(:HealthDataset)
(:TrustCenter)-[:MUTUALLY_RECOGNISES]->(:TrustCenter)   ← cross-border Art.51
(:TrustCenter)-[:MANAGES]->(:SPESession)
(:ResearchPseudonym)-[:LINKED_FROM]->(:ProviderPseudonym)
(:ResearchPseudonym)-[:USED_IN]->(:SPESession)
```

---

## Researcher Filter Presets

The sidebar filter panel answers specific research questions by highlighting
relevant nodes (full opacity) and dimming everything else (15% opacity). Click
the same preset again to reset.

| Preset                         | Question answered                                                              | Key labels shown                                                                                                          |
| ------------------------------ | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| **Who's in the dataspace?**    | Which organisations hold or use data, and under what contracts?                | Participant, Organization, DataProduct, Contract, HDABApproval, OdrlPolicy                                                |
| **Pseudonym resolution chain** | How do provider-specific pseudonyms map to cross-provider research pseudonyms? | TrustCenter, SPESession, ResearchPseudonym, ProviderPseudonym, HDABApproval, Participant                                  |
| **HDAB approval chain**        | What is the governance path from application to approved access?               | HDABApproval, AccessApplication, Contract, DataProduct, Participant, VerifiableCredential                                 |
| **Dataset catalog**            | What HealthDCAT-AP datasets are available and how are they distributed?        | HealthDataset, Distribution, DataProduct, Catalog, EEHRxFProfile, EhdsPurpose                                             |
| **Clinical cohort**            | What patient conditions are in scope, with SNOMED CT and ICD-10 coding?        | Patient, Condition, Observation, Encounter, Procedure, MedicationRequest, SnomedConcept, ICD10Code                        |
| **OMOP analytics**             | What OMOP CDM research data exists, with drug and measurement concepts?        | OMOPPerson, OMOPConditionOccurrence, OMOPMeasurement, OMOPDrugExposure, OMOPProcedureOccurrence, RxNormConcept, LoincCode |

---

## Node Sort Order Within Rings

Nodes are sorted within each ring by `LABEL_SORT_ORDER` so related types
cluster together clockwise from 12 o'clock:

| Ring | Order                                                                                                                                              |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| L1   | Participant → Organization → DataProduct → OdrlPolicy → Contract → HDABApproval → TrustCenter → SPESession → ResearchPseudonym → ProviderPseudonym |
| L2   | HealthDataset → Distribution → EhdsPurpose → EEHRxFProfile → EEHRxFCategory → ContactPoint                                                         |
| L3   | Patient → Encounter → Condition → Observation → Procedure → MedicationRequest                                                                      |
| L4   | OMOPPerson → OMOPConditionOccurrence → OMOPMeasurement → OMOPDrugExposure → OMOPProcedureOccurrence → OMOPVisitOccurrence                          |
| L5   | SnomedConcept → ICD10Code → LoincCode → RxNormConcept → VerifiableCredential → TransferEvent                                                       |

---

## Edge Validation — `GET /api/graph/validate`

The validation endpoint reports:

| Field                 | Description                                                                   |
| --------------------- | ----------------------------------------------------------------------------- |
| `summary`             | `{ totalNodes, totalEdges, issueCount }`                                      |
| `nodeCounts`          | Count per label, flagged if `known: false` (not in LABEL_LAYER)               |
| `edgeCounts`          | Count per relationship type, flagged if `defined: false` (not in VALID_EDGES) |
| `orphans`             | Nodes with zero relationships                                                 |
| `missingProps`        | Nodes missing their required identifying properties                           |
| `unknownLabels`       | Neo4j labels not mapped in LABEL_LAYER                                        |
| `unexpectedEdgeTypes` | Relationship types between known labels that aren't in the VALID_EDGES list   |
| `validEdgeRules`      | The full list of expected `{ type, from, to }` triples                        |

### Expected edge types (critical relationships)

```
L1 Governance
  (Participant)-[:OFFERS]->(DataProduct)
  (DataProduct)-[:GOVERNED_BY]->(OdrlPolicy)
  (DataProduct)-[:HAS_CONTRACT]->(Contract)
  (Contract)-[:APPROVED_BY]->(HDABApproval)
  (AccessApplication)-[:APPLIED_BY]->(Participant)

L1→L2
  (DataProduct)-[:DESCRIBES]->(HealthDataset)

L2 HealthDCAT-AP
  (HealthDataset)-[:HAS_DISTRIBUTION]->(Distribution)
  (HealthDataset)-[:CONFORMS_TO]->(EEHRxFProfile)

L3 FHIR R4
  (Patient)-[:HAS_CONDITION]->(Condition)
  (Patient)-[:HAS_OBSERVATION]->(Observation)
  (Patient)-[:HAS_ENCOUNTER]->(Encounter)
  (Patient)-[:HAS_MEDICATION_REQUEST]->(MedicationRequest)
  (Patient)-[:HAS_PROCEDURE]->(Procedure)

L3→L4 (FHIR to OMOP CDM)
  (Patient)-[:MAPS_TO]->(OMOPPerson)
  (Condition)-[:MAPS_TO]->(OMOPConditionOccurrence)

L3→L5 (coding)
  (Condition)-[:CODED_BY]->(SnomedConcept)
  (Condition)-[:CODED_BY]->(ICD10Code)
  (Observation)-[:CODED_BY]->(LoincCode)
  (MedicationRequest)-[:CODED_BY]->(RxNormConcept)

Phase 18: Trust Center
  (TrustCenter)-[:GOVERNED_BY]->(HDABApproval)
  (TrustCenter)-[:RESOLVES_PSEUDONYMS_FOR]->(HealthDataset)
  (TrustCenter)-[:MUTUALLY_RECOGNISES]->(TrustCenter)
  (TrustCenter)-[:MANAGES]->(SPESession)
  (ResearchPseudonym)-[:LINKED_FROM]->(ProviderPseudonym)
  (ResearchPseudonym)-[:USED_IN]->(SPESession)
```

### Required node properties

Each label requires at least one identifying property to be non-null:

| Label                | Required properties              |
| -------------------- | -------------------------------- |
| Participant          | `participantId`, `name`          |
| DataProduct          | `productId`, `name`              |
| Contract             | `contractId`                     |
| HDABApproval         | `approvalId`                     |
| HealthDataset        | `datasetId`, `title`             |
| Patient              | `resourceId`                     |
| Condition            | `resourceId`, `code`             |
| TrustCenter          | `name`, `did`                    |
| SPESession           | `sessionId`, `studyId`           |
| ResearchPseudonym    | `rpsnId`, `studyId`              |
| VerifiableCredential | `credentialId`, `credentialType` |

---

## Should We Calculate Embeddings for Edges?

**Short answer**: Not yet — but yes for specific use cases once the graph
stabilises.

### When embeddings add value in this graph

| Use case                                                 | Embedding target                            | Model                  | Value                                                            |
| -------------------------------------------------------- | ------------------------------------------- | ---------------------- | ---------------------------------------------------------------- |
| Semantic dataset search ("find datasets about diabetes") | `HealthDataset.title + description`         | text-embedding-3-small | High — replaces exact keyword search                             |
| Similar condition clustering                             | `Condition.display + SnomedConcept.display` | text-embedding-3-small | Medium — groups ICD-10 + SNOMED synonyms                         |
| Policy similarity ("find contracts like mine")           | `OdrlPolicy` serialised JSON                | text-embedding-3-small | Medium — surfaces equivalent policies with different identifiers |
| Trust center provenance matching                         | Edge narrative (provider + TC + study)      | text-embedding-3-small | Low — deterministic HMAC is already exact                        |

### Why edges specifically are less useful than nodes

Embeddings capture semantic meaning of text. Edges in this graph are typed
relationships (`CODED_BY`, `HAS_CONTRACT`, `GOVERNED_BY`) — they carry no
free text, only structure. Embedding _edge labels_ adds no signal beyond what
the type name already provides.

**Embed nodes, not edges.** Specifically:

- `HealthDataset.title` + `description`
- `Condition.display`
- `DataProduct.name` + `description`
- `SnomedConcept.display`

### How to add embeddings (Neo4j Community + OpenAI)

Neo4j Community edition does **not** include the Graph Data Science (GDS)
library needed for `node2vec` or `fastRP`. The practical approach is:

```cypher
// 1. Fetch node text in batches from the proxy
// 2. Call OpenAI text-embedding-3-small (already configured via TC_HMAC_KEY env)
// 3. Store as a float array property:
MATCH (ds:HealthDataset) WHERE ds.datasetId = $id
SET ds.embedding = $vector          // 1536-dim float array

// 4. Cosine similarity search (Neo4j 5.x native):
MATCH (ds:HealthDataset)
WHERE ds.embedding IS NOT NULL
WITH ds,
     reduce(dot = 0.0, i IN range(0, size(ds.embedding)-1) |
       dot + ds.embedding[i] * $queryVector[i]) AS dotProduct,
     sqrt(reduce(n1 = 0.0, i IN range(0, size(ds.embedding)-1) |
       n1 + ds.embedding[i]^2)) AS norm1,
     sqrt(reduce(n2 = 0.0, i IN range(0, size($queryVector)-1) |
       n2 + $queryVector[i]^2)) AS norm2
RETURN ds.title, dotProduct / (norm1 * norm2) AS similarity
ORDER BY similarity DESC LIMIT 10
```

### Recommendation

1. **Now**: Use Neo4j full-text search for graph node search — already fast
   and zero infrastructure cost.
2. **Phase 19 candidate**: Add `GET /api/graph/search?q=<semantic-query>` that
   embeds the query text and runs cosine similarity against pre-computed
   `HealthDataset.embedding` and `DataProduct.embedding` properties.
3. **Not worth doing**: Embedding edge types (`CODED_BY`, `GOVERNED_BY`) —
   the typed graph structure already encodes this information precisely.
4. **Skip Neo4j GDS**: Would require upgrading to Enterprise edition. The
   OpenAI + Cypher cosine approach above works on Community edition and is
   cheaper to maintain.

---

## Shared Constants — Single Source of Truth

All layer/colour/filter configuration lives in:

```
ui/src/lib/graph-constants.ts
```

Imported by:

- `ui/src/app/api/graph/route.ts` — overview query
- `ui/src/app/api/graph/expand/route.ts` — neighbour expansion
- `ui/src/app/api/graph/validate/route.ts` — validation report
- `ui/src/app/graph/page.tsx` — client-side rendering and filter presets

This ensures layer colours, sort orders, and filter preset labels stay
consistent between the API and the UI without duplication.

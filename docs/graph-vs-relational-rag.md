# When to Use Graph DB + GraphRAG vs Relational DB + VectorRAG

## TL;DR Decision Matrix

| Criterion              | Graph DB (Neo4j) + GraphRAG                                           | Relational DB (PostgreSQL) + VectorRAG                   |
| ---------------------- | --------------------------------------------------------------------- | -------------------------------------------------------- |
| **Data relationships** | Many-to-many, variable depth, discovered at query time                | Fixed schema, known at design time                       |
| **Query pattern**      | "Follow the path" — traversals, shortest path, pattern matching       | "Filter and aggregate" — WHERE, GROUP BY, JOIN           |
| **RAG retrieval**      | Context-aware: retrieve nodes + their neighbourhood                   | Context-blind: retrieve top-K similar chunks             |
| **Schema evolution**   | Add labels/relationships without migration                            | ALTER TABLE + migration scripts                          |
| **ACID transactions**  | Per-operation (not cross-graph batch)                                 | Full ACID with multi-table consistency                   |
| **Best for**           | Knowledge graphs, clinical pathways, fraud detection, recommendations | Financial ledgers, state machines, audit logs, inventory |

---

## The Core Insight

**VectorRAG** finds _similar_ things. **GraphRAG** finds _connected_ things.

When a researcher asks "Which patients with Type 2 Diabetes also take Metformin and had an HbA1c > 7.0?", the answer requires traversing relationships — not finding similar text chunks.

---

## Architecture in This EHDS Demo

This project uses **both** databases for their optimal access patterns (see [ADR-001](ADRs/ADR-001-postgresql-neo4j-split.md)):

```
┌─────────────────────────────────────────────────────────────┐
│                    Neo4j 5 Community                          │
│  5-layer knowledge graph: 5,300+ nodes, 27 labels            │
│  3 vector indexes (384-dim, cosine) for GraphRAG             │
│  3 fulltext indexes for natural language search              │
│  Graph traversals: O(1) per hop vs O(n) JOINs               │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                    PostgreSQL 17                              │
│  8 databases: EDC-V state machines, Keycloak, CFM            │
│  Contract negotiation lifecycle (strict ACID)                │
│  Transfer process state tracking                             │
│  Credential and key storage                                  │
└─────────────────────────────────────────────────────────────┘
```

---

## Practical Examples from This Demo

### Example 1: Patient Clinical Pathway (Graph wins)

**Question:** "Show me all conditions, medications, and observations for Patient P-042, including which SNOMED concepts they map to."

#### Graph approach (Neo4j — 1 query, <5ms):

```cypher
MATCH (p:Patient {patientId: 'P-042'})-[:HAS_ENCOUNTER]->(e:Encounter)
OPTIONAL MATCH (e)-[:HAS_CONDITION]->(c:Condition)-[:CODED_BY]->(snomed:SnomedConcept)
OPTIONAL MATCH (e)-[:HAS_OBSERVATION]->(o:Observation)-[:CODED_BY]->(loinc:LoincCode)
OPTIONAL MATCH (p)-[:HAS_MEDICATION_REQUEST]->(m:MedicationRequest)-[:CODED_BY]->(rx:RxNormConcept)
RETURN p, e, c, snomed, o, loinc, m, rx
```

Result: A connected subgraph — the entire clinical picture in one traversal.

#### Relational approach (PostgreSQL — 5 JOINs, index-dependent):

```sql
SELECT p.*, e.*, c.*, s.display as snomed_name,
       o.*, l.display as loinc_name,
       m.*, r.display as rxnorm_name
FROM patients p
JOIN encounters e ON e.patient_id = p.id
LEFT JOIN conditions c ON c.encounter_id = e.id
LEFT JOIN snomed_concepts s ON s.code = c.code
LEFT JOIN observations o ON o.encounter_id = e.id
LEFT JOIN loinc_codes l ON l.code = o.code
LEFT JOIN medication_requests m ON m.patient_id = p.id
LEFT JOIN rxnorm_concepts r ON r.code = m.medication_code
WHERE p.patient_id = 'P-042';
```

**Why Graph wins:** The clinical pathway is inherently a graph — one traversal retrieves the full connected context. With PostgreSQL, each new relationship requires another JOIN, and the query grows linearly with schema complexity. Neo4j cost: O(degree) per hop. PostgreSQL cost: O(n × m) per JOIN without careful indexing.

---

### Example 2: FHIR → OMOP Mapping Discovery (Graph wins)

**Question:** "Which FHIR Conditions map to OMOP ConditionOccurrences that are coded by SNOMED concepts in the 'Endocrine' hierarchy?"

```cypher
MATCH (c:Condition)-[:MAPS_TO]->(co:OMOPConditionOccurrence)-[:HAS_CONCEPT]->(s:SnomedConcept)
WHERE s.hierarchy CONTAINS 'Endocrine'
RETURN c.display, co.conditionConceptId, s.display, s.code
```

**Why Graph wins:** The MAPS_TO relationship between FHIR and OMOP layers is the core value — it's a graph relationship, not a foreign key. In a relational model, you'd need a mapping table with JOINs across 3 schemas that may not share a common key space.

---

### Example 3: Natural Language Query with GraphRAG (Graph wins)

**Question:** "Find datasets about cardiovascular conditions in German hospitals"

#### GraphRAG approach (this demo's NLQ system):

```
User query → Embedding (384-dim)
  → Vector similarity on HealthDataset.embedding (top 5)
  → Expand neighbourhood: Dataset → Distribution → DataService
  → Traverse: Dataset ← OFFERS ← Participant (filter: country='DE')
  → Traverse: Dataset → HAS_CONDITION → Condition (filter: SNOMED cardiovascular hierarchy)
  → Return enriched context with provenance chain
```

The NLQ resolution chain in this demo uses 3 tiers:

1. **Tier 1: Template matching** — predefined Cypher for common patterns
2. **Tier 2: Fulltext search** — Neo4j fulltext indexes on clinical/catalog/ontology
3. **Tier 3: Vector + Graph expansion** — vector similarity → graph neighbourhood traversal

#### VectorRAG approach (PostgreSQL + pgvector):

```
User query → Embedding (384-dim)
  → cosine similarity search on document_chunks
  → Return top-K text chunks
  → No structural context, no provenance, no relationship traversal
```

**Why GraphRAG wins:** After finding semantically similar nodes via vector search, GraphRAG _expands the neighbourhood_ — following relationships to related conditions, medications, participants, and data access policies. VectorRAG returns isolated chunks with no structural awareness.

---

### Example 4: DSP Contract Negotiation (Relational wins)

**Question:** "Track the state machine: contract C-789 from REQUESTED → AGREED → FINALIZED"

#### Relational approach (PostgreSQL — ACID guaranteed):

```sql
BEGIN;
UPDATE contract_negotiations
  SET state = 'AGREED', updated_at = NOW()
  WHERE contract_id = 'C-789' AND state = 'REQUESTED';
INSERT INTO negotiation_events (contract_id, from_state, to_state, timestamp)
  VALUES ('C-789', 'REQUESTED', 'AGREED', NOW());
COMMIT;
```

**Why Relational wins:** Contract negotiation is a strict state machine — exactly one state at a time, transitions must be atomic, concurrent modifications must fail cleanly. PostgreSQL's row-level locking and ACID transactions guarantee this. Neo4j's transaction model is per-node and doesn't provide the same isolation guarantees for multi-step state transitions.

---

### Example 5: ODRL Policy Evaluation (Graph wins)

**Question:** "Can PharmaCo Research AG access Dataset DS-003 given their current data permit and ODRL constraints?"

```cypher
MATCH (p:Participant {did: 'did:web:pharmaco.de:research'})
      -[:HAS_CONTRACT]->(c:Contract {status: 'FINALIZED'})
      -[:COVERS]->(dp:DataProduct)
      -[:GOVERNED_BY]->(pol:OdrlPolicy)
MATCH (dp)-[:DESCRIBES]->(ds:HealthDataset {datasetId: 'DS-003'})
WHERE pol.permission CONTAINS 'read'
  AND (pol.temporalConstraint IS NULL
       OR date(pol.temporalConstraint) > date())
RETURN dp, pol, c, ds
```

**Why Graph wins:** Policy evaluation requires traversing trust chains: participant → contract → data product → ODRL policy → temporal/spatial constraints. This is a natural graph traversal. In a relational model, you'd need recursive CTEs or multiple queries to walk the chain.

---

### Example 6: Credential Verification (Relational wins)

**Question:** "Store and retrieve the Verifiable Credential for EHDS membership issued to AlphaKlinik"

```sql
INSERT INTO verifiable_credentials (
  id, holder_did, issuer_did, type, credential_subject, issued_at, expires_at
) VALUES (
  'vc-001',
  'did:web:alpha-klinik.de:participant',
  'did:web:medreg.de:hdab',
  'EHDSMembershipCredential',
  '{"organisationType": "DATA_HOLDER", "country": "DE"}',
  NOW(),
  NOW() + INTERVAL '1 year'
);
```

**Why Relational wins:** VC storage is a simple CRUD operation with strict consistency requirements. The credential either exists or it doesn't. There's no graph traversal needed — just insert, query by holder/type, and check expiry. PostgreSQL's JSONB column handles the flexible credential subject without schema changes.

---

### Example 7: Cohort Discovery Across Layers (Graph wins)

**Question:** "Find all patients with diabetes (SNOMED 73211009) who are part of a dataset offered by a German data holder under an ODRL policy that permits research use"

```cypher
MATCH (s:SnomedConcept {code: '73211009'})
      <-[:CODED_BY]-(co:OMOPConditionOccurrence)
      <-[:HAS_CONDITION_OCCURRENCE]-(person:OMOPPerson)
      <-[:MAPS_TO]-(patient:Patient)
MATCH (patient)<-[:CONTAINS_PATIENT]-(ds:HealthDataset)
      <-[:DESCRIBES]-(dp:DataProduct)
      -[:GOVERNED_BY]->(pol:OdrlPolicy)
MATCH (dp)<-[:OFFERS]-(holder:Participant)
WHERE holder.country = 'DE'
  AND pol.permission CONTAINS 'research'
RETURN patient.name, ds.title, holder.name, pol.policyId
```

**Why Graph wins:** This query crosses ALL 5 layers of the knowledge graph in a single traversal:

- L5 (Ontology) → L4 (OMOP) → L3 (FHIR) → L2 (Catalog) → L1 (Marketplace)

In a relational model, this would require 8+ JOINs across tables that might live in different databases. In Neo4j, it's one connected traversal.

---

## When to Use Which — Decision Framework

### Use Neo4j + GraphRAG when:

1. **Relationships ARE the data** — clinical pathways, social networks, supply chains
2. **Variable-depth traversals** — "find all paths between A and B within 5 hops"
3. **Schema is discovered, not designed** — new node types and relationships added dynamically
4. **RAG needs context** — retrieving not just similar items, but their connected neighbourhood
5. **Multi-hop reasoning** — "patients with condition X who take medication Y prescribed by doctor Z"
6. **Cross-domain queries** — traversing from clinical data through metadata to marketplace policies

### Use PostgreSQL + VectorRAG when:

1. **Strict ACID is required** — financial transactions, state machines, audit logs
2. **Data is tabular** — fixed columns, known schema, aggregate analytics
3. **RAG is document-centric** — finding similar paragraphs in unstructured text
4. **Concurrent writes** — high-volume INSERT/UPDATE with row-level locking
5. **Reporting and BI** — GROUP BY, window functions, materialized views
6. **Upstream systems require it** — EDC-V, Keycloak, and CFM expect PostgreSQL

### Use both (this demo's approach) when:

- **Hybrid workloads** — graph for knowledge, relational for state machines
- **Event projection** — NATS publishes state changes from PostgreSQL → Neo4j for visualization
- **Best-of-both RAG** — vector search for initial retrieval, graph expansion for context enrichment

---

## Performance Comparison (This Demo)

| Query Pattern                          | Neo4j                  | PostgreSQL                            |
| -------------------------------------- | ---------------------- | ------------------------------------- |
| Patient full clinical history (5 hops) | 3–8ms                  | 45–120ms (5 JOINs)                    |
| Shortest path between two participants | 1–3ms                  | Not expressible without recursive CTE |
| Contract state transition              | 15ms (property update) | 2ms (indexed UPDATE + COMMIT)         |
| Top-5 similar datasets (vector)        | 5–12ms                 | 8–15ms (pgvector)                     |
| Vector + 2-hop graph expansion         | 8–20ms                 | Not possible in single query          |
| Bulk cohort count (100K patients)      | 200–500ms              | 50–100ms (COUNT with index)           |

---

## The GraphRAG Advantage: Why Vector Search Alone Is Not Enough

Traditional VectorRAG (pgvector, Pinecone, Weaviate):

```
Query → Embed → Find top-K similar chunks → Return chunks → LLM synthesizes
```

GraphRAG (Neo4j vector + graph traversal):

```
Query → Embed → Find top-K similar nodes → Expand graph neighbourhood →
  Follow relationships (CODED_BY, MAPS_TO, GOVERNED_BY) →
  Include provenance chain → Return structured context → LLM synthesizes
```

The critical difference: **GraphRAG returns answers with provenance**. When a researcher asks about a dataset, they don't just get similar text — they get the dataset, its distribution endpoints, its governing ODRL policy, the HDAB approval chain, and the specific FHIR resources it contains. All connected. All traversable. All auditable.

---

## References

- [ADR-001: PostgreSQL vs Neo4j Split](ADRs/ADR-001-postgresql-neo4j-split.md)
- [Neo4j Schema](../neo4j/init-schema.cypher) — 27 labels, 70+ indexes, 3 vector indexes
- [NLQ API Route](../ui/src/app/api/nlq/route.ts) — Natural language query with ODRL scope
- [SIMPL-Open Gap Analysis](simpl-ehds-gap-analysis.md) — EU programme alignment
- Neo4j Vector Index docs: `CREATE VECTOR INDEX ... OPTIONS {vector.dimensions: 384}`

---
name: neo4j-schema
description: Use when the user adds nodes, relationships, constraints, or indexes to the Neo4j knowledge graph, or edits any *.cypher file.
---

# Neo4j schema changes

Sources: `neo4j/init-schema.cypher`, `docs/health-dataspace-graph-schema.md`,
`.claude/rules/code-style.md` (Cypher section).

## Procedure

1. Read `neo4j/init-schema.cypher` for existing constraints/indexes, and the target
   layer's section in `docs/health-dataspace-graph-schema.md`.
2. Fit the new node/relationship into the 5-layer model:
   - L1 Dataspace: Participant, DataProduct, Contract, HDABApproval, TrustCenter
   - L2 Metadata: HealthDataset, Distribution, EEHRxFProfile
   - L3 FHIR R4: Patient, Encounter, Condition, Observation, MedicationRequest, Procedure
   - L4 OMOP CDM: OMOPPerson, ConditionOccurrence, Measurement, DrugExposure
   - L5 Ontology: SnomedConcept, LoincCode, ICD10Code, RxNormConcept
3. Labels `PascalCase`, relationships `UPPER_SNAKE_CASE`, properties `camelCase`.
   Always `MERGE` (never bare `CREATE`); constraints/indexes always `IF NOT EXISTS`
   — the schema must stay idempotent and safe to re-run.
4. Add seed data to `neo4j/insert-synthetic-schema-data.cypher` if needed.

## Output contract

- Schema change in `neo4j/init-schema.cypher` mirrored in the markdown schema doc.
- Re-run check: piping the file through cypher-shell twice produces no errors.
- New labels referenced by the graph explorer also go in
  `ui/src/lib/graph-constants.ts` `LABEL_LAYER` (see graph-visualisation skill).

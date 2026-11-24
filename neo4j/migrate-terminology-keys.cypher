// ==============================================================================
// Migration: terminology nodes keyed by their constrained key (#1215)
//
// init-schema.cypher makes SnomedConcept.conceptId, LoincCode.loincNumber and
// RxNormConcept.rxcui unique. scripts/load_fhir_neo4j.py,
// seed-study-results.cypher and scripts/generate-graph-seed.py merged on
// `code` instead, so the constraint never saw those nodes and a concept could
// exist twice: on the compose graph on 2026-11-24, 63 LoincCode nodes, 47 of
// them with `code` only, and 8 LOINC codes twice (4548-4 HbA1c, 2345-7
// glucose, 2160-0 creatinine among them). They now merge on the key; this
// file repairs a graph an earlier run split.
//
// For each label, every node without its key but with a `code`:
//   - with a keyed twin (key = code; for SNOMED CT and RxNorm, whose keys the
//     seeds write as integers and as strings, either form), it is merged into
//     the twin: its relationships move to the twin, a relationship the twin
//     already has is not doubled, a property the twin lacks is kept, one it
//     has stays the twin's, and the node is removed;
//   - without one, nodes of the same code are merged into one and it gets
//     the key, its `code` as it is.
//
// Uses apoc.refactor.mergeNodes (APOC is in every Neo4j this repository
// runs: compose, CI, Azure). Idempotent: a second run finds no node without
// its key and changes nothing. The last statement returns what is left
// unkeyed, which neo4j/seed.sh requires to be zero.
//
// neo4j/seed.sh runs it after every seed that writes terminology nodes.
// By hand:
//
//   docker exec -i health-dataspace-neo4j \
//     cypher-shell -u neo4j -p healthdataspace < neo4j/migrate-terminology-keys.cypher
// ==============================================================================

// ── LOINC: loincNumber ───────────────────────────────────────────────────────
MATCH (n:LoincCode)
WHERE n.loincNumber IS NULL AND n.code IS NOT NULL AND trim(toString(n.code)) <> ''
WITH trim(toString(n.code)) AS code, collect(n) AS loose
OPTIONAL MATCH (twin:LoincCode {loincNumber: code})
WITH code, loose, head(collect(twin)) AS twin
WITH code, CASE WHEN twin IS NULL THEN loose ELSE [twin] + loose END AS nodes
CALL apoc.refactor.mergeNodes(nodes, {properties: 'discard', mergeRels: true})
YIELD node
SET node.loincNumber = coalesce(node.loincNumber, code)
RETURN 'LoincCode' AS label, count(node) AS keyedNow;

// ── SNOMED CT: conceptId ─────────────────────────────────────────────────────
MATCH (n:SnomedConcept)
WHERE n.conceptId IS NULL AND n.code IS NOT NULL AND trim(toString(n.code)) <> ''
WITH trim(toString(n.code)) AS code, collect(n) AS loose
OPTIONAL MATCH (twin:SnomedConcept)
  WHERE twin.conceptId IN [code, toInteger(code)]
WITH code, loose, twin
ORDER BY twin.conceptId = code DESC
WITH code, loose, head(collect(twin)) AS twin
WITH code, CASE WHEN twin IS NULL THEN loose ELSE [twin] + loose END AS nodes
CALL apoc.refactor.mergeNodes(nodes, {properties: 'discard', mergeRels: true})
YIELD node
SET node.conceptId = coalesce(node.conceptId, code)
RETURN 'SnomedConcept' AS label, count(node) AS keyedNow;

// ── RxNorm: rxcui ────────────────────────────────────────────────────────────
MATCH (n:RxNormConcept)
WHERE n.rxcui IS NULL AND n.code IS NOT NULL AND trim(toString(n.code)) <> ''
WITH trim(toString(n.code)) AS code, collect(n) AS loose
OPTIONAL MATCH (twin:RxNormConcept)
  WHERE twin.rxcui IN [code, toInteger(code)]
WITH code, loose, twin
ORDER BY twin.rxcui = code DESC
WITH code, loose, head(collect(twin)) AS twin
WITH code, CASE WHEN twin IS NULL THEN loose ELSE [twin] + loose END AS nodes
CALL apoc.refactor.mergeNodes(nodes, {properties: 'discard', mergeRels: true})
YIELD node
SET node.rxcui = coalesce(node.rxcui, code)
RETURN 'RxNormConcept' AS label, count(node) AS keyedNow;

// ── What is left without its key (neo4j/seed.sh requires 0) ─────────────────
RETURN COUNT { MATCH (n:LoincCode) WHERE n.loincNumber IS NULL }
     + COUNT { MATCH (n:SnomedConcept) WHERE n.conceptId IS NULL }
     + COUNT { MATCH (n:RxNormConcept) WHERE n.rxcui IS NULL } AS unkeyedTerminologyNodes;

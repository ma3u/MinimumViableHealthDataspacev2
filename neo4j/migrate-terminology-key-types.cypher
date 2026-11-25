// ==============================================================================
// Migration: one type per terminology key, a string (#1231)
//
// init-schema.cypher makes SnomedConcept.conceptId and RxNormConcept.rxcui
// unique, and a uniqueness constraint treats 415749005 and "415749005" as two
// values. scripts/generate-graph-seed.py and insert-synthetic-schema-data.cypher
// wrote integers, the issue #19 seed, backfill-coded-by.cypher and the
// Synthea loader strings, so a concept could exist twice: on the compose graph
// on 2026-11-25, 66 SNOMED CT and 55 RxNorm keys were integers, and 8 SNOMED
// CT and 6 RxNorm concepts existed in both forms.
//
// The key is a string, as FHIR Coding.code is and as LoincCode.loincNumber
// and ICD10Code.code already are. Every writer now writes one; this file
// repairs a graph written before:
//   - a concept keyed by an integer whose string twin exists is merged into
//     the twin: its relationships move to the twin, one the twin already has
//     is not doubled, a property the twin lacks is kept, one it has stays
//     the twin's, and the integer node is removed;
//   - every other integer key, and a `code` stored as a number, becomes its
//     string.
//
// Runs after migrate-terminology-keys.cypher, which keys the nodes that had
// only `code`. Uses apoc.refactor.mergeNodes, as that file does. Idempotent:
// a second run finds no key that is not a string. The last statement returns
// what is left, which neo4j/seed.sh requires to be zero.
//
//   docker exec -i health-dataspace-neo4j \
//     cypher-shell -u neo4j -p healthdataspace < neo4j/migrate-terminology-key-types.cypher
// ==============================================================================

// ── SNOMED CT: integer twins into the string node ───────────────────────────
MATCH (n:SnomedConcept)
WHERE n.conceptId IS NOT NULL AND NOT n.conceptId IS :: STRING
MATCH (twin:SnomedConcept {conceptId: toString(n.conceptId)})
WITH twin, n
CALL apoc.refactor.mergeNodes([twin, n], {properties: 'discard', mergeRels: true})
YIELD node
RETURN 'SnomedConcept' AS label, count(node) AS mergedIntoStringTwin;

// ── SNOMED CT: the rest to strings ──────────────────────────────────────────
MATCH (n:SnomedConcept)
WHERE n.conceptId IS NOT NULL AND NOT n.conceptId IS :: STRING
SET n.conceptId = toString(n.conceptId)
RETURN 'SnomedConcept' AS label, count(n) AS converted;

// ── RxNorm: integer twins into the string node ──────────────────────────────
MATCH (n:RxNormConcept)
WHERE n.rxcui IS NOT NULL AND NOT n.rxcui IS :: STRING
MATCH (twin:RxNormConcept {rxcui: toString(n.rxcui)})
WITH twin, n
CALL apoc.refactor.mergeNodes([twin, n], {properties: 'discard', mergeRels: true})
YIELD node
RETURN 'RxNormConcept' AS label, count(node) AS mergedIntoStringTwin;

// ── RxNorm: the rest to strings ─────────────────────────────────────────────
MATCH (n:RxNormConcept)
WHERE n.rxcui IS NOT NULL AND NOT n.rxcui IS :: STRING
SET n.rxcui = toString(n.rxcui)
RETURN 'RxNormConcept' AS label, count(n) AS converted;

// ── `code` beside the key, where a seed stored it as a number ───────────────
MATCH (n)
WHERE (n:SnomedConcept OR n:RxNormConcept OR n:LoincCode OR n:ICD10Code)
  AND n.code IS NOT NULL AND NOT n.code IS :: STRING
SET n.code = toString(n.code)
RETURN count(n) AS codesConverted;

// ── What is left that is not a string (neo4j/seed.sh requires 0) ────────────
RETURN COUNT { MATCH (n:SnomedConcept) WHERE n.conceptId IS NOT NULL AND NOT n.conceptId IS :: STRING }
     + COUNT { MATCH (n:RxNormConcept) WHERE n.rxcui IS NOT NULL AND NOT n.rxcui IS :: STRING }
     + COUNT { MATCH (n:LoincCode) WHERE n.loincNumber IS NOT NULL AND NOT n.loincNumber IS :: STRING }
     + COUNT { MATCH (n:ICD10Code) WHERE n.code IS NOT NULL AND NOT n.code IS :: STRING } AS keysNotStrings;

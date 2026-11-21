// ==============================================================================
// Migration: SNOMED CT codes that named another disease (#1167)
//
// scripts/generate-graph-seed.py, neo4j/insert-synthetic-schema-data.cypher,
// the persona overview seed and the issue #19 demo cohort paired SNOMED CT
// codes with labels of a different disease: "Breast Cancer" carried the code
// of colon cancer, "Iron Deficiency Anaemia" the code of dyspnoea, and so on.
// Mapped to another vocabulary (NeDRex, OMOP), those patients landed on the
// wrong disease. The seeds now write the right codes; this file corrects a
// graph that an earlier run loaded.
//
// Each code was checked with the CodeSystem $lookup of
// https://r4.ontoserver.csiro.au/fhir (system http://snomed.info/sct):
//
//   label                      old         returns              new        returns
//   Type 2 diabetes            73211009    Diabetes             44054006   Type 2 diabetes
//   CKD stage 3                709044004   Chronic kidney d.    433144002  Chronic kidney disease stage 3
//   Iron deficiency anaemia    267036007   Dyspnoea             87522002   Iron deficiency anaemia
//   Hyperlipidaemia            190828008   Gouty arthropathy    55822004   Hyperlipidaemia
//   Hepatitis C                235856003   Liver disease        50711007   Hepatitis C
//   Breast cancer              363406005   Malig. neo. colon    254837009  Malignant neoplasm of breast
//   Tendon rupture             262615006   (no such code)       415749005  Rupture of tendon
//
// It recodes a Condition only when its label names the intended disease, so
// a node that really is dyspnoea or liver disease stays as it is. The OMOP
// rows keep their model (conditionConceptId holds the SNOMED code); only the
// code changes. Idempotent: every statement matches the old codes only.
//
// neo4j/seed.sh runs it after the persona overview and issue #19 seeds.
// By hand:
//
//   docker exec -i health-dataspace-neo4j \
//     cypher-shell -u neo4j -p healthdataspace < neo4j/migrate-snomed-condition-codes.cypher
// ==============================================================================

// ── 1. The right concepts exist, named after their SNOMED CT display ──────────
// Where the backfill or the issue #19 seed already made one with a string id,
// that one is reused; otherwise a numeric id, as the graph generator writes.
UNWIND [
  {code: 44054006,  name: 'Type 2 Diabetes Mellitus', display: 'Type 2 diabetes'},
  {code: 433144002, name: 'CKD Stage 3',              display: 'Chronic kidney disease stage 3'},
  {code: 87522002,  name: 'Iron Deficiency Anaemia',  display: 'Iron deficiency anaemia'},
  {code: 55822004,  name: 'Hyperlipidaemia',          display: 'Hyperlipidaemia'},
  {code: 50711007,  name: 'Hepatitis C',              display: 'Hepatitis C'},
  {code: 254837009, name: 'Malignant Neoplasm of Breast', display: 'Malignant neoplasm of breast'},
  {code: 415749005, name: 'Rupture of tendon',        display: 'Rupture of tendon'},
  {code: 230572002, name: 'Diabetic Neuropathy',      display: 'Neuropathy due to diabetes'},
  {code: 156370009, name: 'Psoriatic Arthritis',      display: 'Psoriatic arthritis'},
  {code: 90935002,  name: 'Hemophilia',               display: 'Haemophilia'},
  {code: 278860009, name: 'Chronic Low Back Pain',    display: 'Chronic lower back pain'}
] AS m
OPTIONAL MATCH (e:SnomedConcept) WHERE e.conceptId IN [m.code, toString(m.code)]
WITH m, count(e) AS have
FOREACH (_ IN CASE WHEN have = 0 THEN [1] ELSE [] END |
  MERGE (:SnomedConcept {conceptId: m.code}))
WITH m
MATCH (s:SnomedConcept) WHERE s.conceptId IN [m.code, toString(m.code)]
SET s.name = m.name + ' (SNOMED)',
    s.display = m.display,
    s.active = true;

// ── 2. Conditions: the code, and the CODED_BY edge with it ───────────────────
UNWIND [
  {old: '73211009',  new: '44054006',  words: ['type 2', 't2d']},
  {old: '709044004', new: '433144002', words: ['stage 3']},
  {old: '267036007', new: '87522002',  words: ['iron deficiency']},
  {old: '190828008', new: '55822004',  words: ['hyperlipid']},
  {old: '235856003', new: '50711007',  words: ['hepatitis c']},
  {old: '363406005', new: '254837009', words: ['breast']},
  {old: '262615006', new: '415749005', words: ['tendon']}
] AS m
MATCH (c:Condition {code: m.old})
WHERE any(w IN m.words WHERE toLower(coalesce(c.display, '') + ' ' + coalesce(c.name, '')) CONTAINS w)
SET c.code = m.new
WITH c, m
OPTIONAL MATCH (c)-[r:CODED_BY]->(o:SnomedConcept) WHERE toString(o.conceptId) = m.old
DELETE r
WITH DISTINCT c, m
MATCH (s:SnomedConcept) WHERE toString(s.conceptId) = m.new
MERGE (c)-[:CODED_BY]->(s);

// ── 3. OMOP condition occurrences: the concept id and STANDARD_CONCEPT ───────
// The generator's rows carry the SNOMED code as conditionConceptId; the rows
// of insert-synthetic-schema-data.cypher an OMOP id, and only the edge.
UNWIND [
  {old: 73211009,  new: 44054006,  words: ['type 2', 't2d']},
  {old: 709044004, new: 433144002, words: ['stage 3', 'ckd']},
  {old: 267036007, new: 87522002,  words: ['iron deficiency']},
  {old: 190828008, new: 55822004,  words: ['hyperlipid']},
  {old: 235856003, new: 50711007,  words: ['hepatitis c']},
  {old: 363406005, new: 254837009, words: ['breast']}
] AS m
MATCH (oc:OMOPConditionOccurrence)
WHERE (oc.conditionConceptId = m.old
       OR EXISTS { (oc)-[:STANDARD_CONCEPT]->(o:SnomedConcept) WHERE toString(o.conceptId) = toString(m.old) })
  AND any(w IN m.words WHERE toLower(coalesce(oc.name, '')) CONTAINS w)
SET oc.conditionConceptId = CASE WHEN oc.conditionConceptId = m.old THEN m.new ELSE oc.conditionConceptId END
WITH oc, m
MATCH (oc)-[r:STANDARD_CONCEPT]->(o:SnomedConcept) WHERE toString(o.conceptId) = toString(m.old)
DELETE r
WITH DISTINCT oc, m
MATCH (s:SnomedConcept) WHERE toString(s.conceptId) = toString(m.new)
MERGE (oc)-[:STANDARD_CONCEPT]->(s);

// ── 4. The SNOMED to ICD-10 mappings move to the right concept ──────────────
UNWIND [
  {old: '73211009',  new: '44054006',  icd: 'E11'},
  {old: '709044004', new: '433144002', icd: 'N18.3'},
  {old: '267036007', new: '87522002',  icd: 'D50.9'},
  {old: '190828008', new: '55822004',  icd: 'E78.5'},
  {old: '235856003', new: '50711007',  icd: 'B18.2'},
  {old: '363406005', new: '254837009', icd: 'C50.911'}
] AS m
MATCH (o:SnomedConcept)-[r:STANDARD_CONCEPT]->(i:ICD10Code {code: m.icd})
WHERE toString(o.conceptId) = m.old
DELETE r
WITH DISTINCT m, i
MATCH (s:SnomedConcept) WHERE toString(s.conceptId) = m.new
MERGE (s)-[:STANDARD_CONCEPT]->(i);

// ── 5. The old concepts keep their real SNOMED CT name ───────────────────────
UNWIND [
  {code: '73211009',  name: 'Diabetes mellitus',           active: true,  finding: false},
  {code: '709044004', name: 'Chronic kidney disease',      active: true,  finding: false},
  {code: '267036007', name: 'Dyspnoea',                    active: true,  finding: true},
  {code: '190828008', name: 'Gouty arthropathy',           active: false, finding: false},
  {code: '235856003', name: 'Liver disease',               active: true,  finding: false},
  {code: '363406005', name: 'Malignant neoplasm of colon', active: true,  finding: false},
  {code: '239720000', name: 'Tear of meniscus of knee',    active: true,  finding: false},
  {code: '66857006',  name: 'Haemoptysis',                 active: true,  finding: true}
] AS m
MATCH (s:SnomedConcept) WHERE toString(s.conceptId) = m.code
SET s.name = m.name + ' (SNOMED)',
    s.display = m.name,
    s.active = m.active
WITH s, m WHERE m.finding
OPTIONAL MATCH (s)-[r:IS_A]->(:SnomedConcept {conceptId: 64572001})
DELETE r;

// ── 6. Codes SNOMED CT does not have go, once nothing is coded by them ──────
MATCH (s:SnomedConcept)
WHERE toString(s.conceptId) IN ['262615006', '266356007']
  AND NOT EXISTS { (:Condition)-[:CODED_BY]->(s) }
DETACH DELETE s;

// ── 7. The demo patient P1: one type 2 diabetes, SNOMED coded ───────────────
// seed-persona-overview.cypher now writes cond-p1-44054006 and no ICD-10
// duplicate. The old nodes go only once the new one is there.
MATCH (:Patient {resourceId: 'P1'})-[:HAS_CONDITION]->(:Condition {resourceId: 'cond-p1-44054006'})
MATCH (o:Condition) WHERE o.resourceId IN ['cond-p1-73211009', 'cond-p1-E11.9']
DETACH DELETE o;

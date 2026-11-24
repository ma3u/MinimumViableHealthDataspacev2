// ============================================================================
// Phase 3b: FHIR R4 → OMOP CDM Transformation
//
// Transforms Layer 3 (FHIR Clinical Graph) nodes into Layer 4 (OMOP Research
// Analytics) nodes by creating OMOP-structured counterparts and MAP_TO links.
//
// Run after load_fhir_neo4j.py:
//   cat neo4j/fhir-to-omop-transform.cypher | \
//     docker exec -i health-dataspace-neo4j cypher-shell -u neo4j -p healthdataspace
//
// Re-runnable: MERGE only, and a second run creates nothing (every step skips
// a record that is already MAPPED_TO its OMOP counterpart).
//
// Two shapes of the FHIR layer reach this script, and it reads both:
//
// - Key. scripts/load_fhir_neo4j.py keys a node by `id`; the seeds under
//   neo4j/ and the FHIR document import key it by `resourceId`. A record's
//   key is `coalesce(fhirId, id, resourceId)`, the same fallback as
//   `fhirIdOf` in services/neo4j-proxy/src/fhir-resource.ts. A node with
//   none of the three is skipped rather than merged on a null id.
// - Dates. The loader writes strings ('2024-09-12T10:15:00Z'); the seeds
//   write Neo4j DATE and DATETIME values, on which `left()` fails. Every date
//   is read through `left(toString(x), 10)`, which gives 'YYYY-MM-DD' for a
//   string, a date and a datetime alike, and null for a missing one.
//
// The seeds also name a few properties differently from the loader; the
// coalesce() calls below read either (Observation `effectiveDate`,
// `valueQuantity`, `valueUnit`; MedicationRequest `medicationCode` and
// HAS_MEDICATION_REQUEST; Procedure `date`). An Observation without a
// category counts as uncategorised, as the loader's '' does.
//
// Art. 71 (ADR-062): an OMOP row written or adopted for a patient who opted
// out carries OptedOut from the start, as the FHIR document import does, so
// it never shows in secondary use and a reversal unmarks it with the rest.
//
// Keys (ADR-098). Every OMOP row is keyed by its CDM column, an integer:
// personId, visitOccurrenceId, conditionOccurrenceId, measurementId,
// drugExposureId, procedureOccurrenceId; every event row also carries its
// person's personId. The integer is the first 13 hex digits (52 bits) of the
// MD5 of the FHIR reference, `<type>/<id>`, so the same record gets the same
// row in every run, on every rebuilt graph and from
// scripts/generate-graph-seed.py, which derives it the same way. A MERGE on
// that key is also what adopts a row another writer already made. The link
// back to the FHIR record is the MAPPED_TO edge, never a property.
// ============================================================================

// ── 0. Older rows to the CDM keys (ADR-098) ─────────────────────────────────
// Graphs written before ADR-098 key OMOP rows three ways: this script's
// `id: 'omop-<kind>-' + FHIR id`, the graph seed's FHIR id under `visitId`,
// `conditionId`, `drugId`, `procedureId` and a text `measurementId`, and
// integers from neo4j/insert-synthetic-schema-data.cypher. A row without an
// integer key gets the one derived from its FHIR record: the record it is
// MAPPED_TO from, else the FHIR id it carries. An integer key it already has is
// kept. The old keys go. Re-runnable: each step only touches rows not yet
// converted.
//
// The test is valueType(), not `NOT (x IS :: INTEGER NOT NULL)`: on a property
// with a uniqueness constraint Neo4j 5.26 answers the negated type predicate
// from the index and finds no row whose key is missing (checked 2026-11-21).

MATCH (op:OMOPPerson)
WHERE valueType(op.personId) <> 'INTEGER NOT NULL'
OPTIONAL MATCH (p:Patient)-[:MAPPED_TO]->(op)
WITH op, head(collect(toString(coalesce(p.fhirId, p.id, p.resourceId)))) AS fromRecord
WITH op, coalesce(fromRecord,
       CASE WHEN op.id STARTS WITH 'omop-person-' THEN substring(op.id, 12) END) AS key
WHERE key IS NOT NULL
WITH op, reduce(n = 0, h IN split(left(apoc.util.md5(['Patient/' + key]), 13), '') |
       n * 16 + size(split('0123456789abcdef', h)[0])) AS personId
SET op.personId = personId,
    op.name = 'OMOP person ' + personId
REMOVE op.id
RETURN count(op) AS omop_person_keys_set;

MATCH (ov:OMOPVisitOccurrence)
WHERE valueType(ov.visitOccurrenceId) <> 'INTEGER NOT NULL'
OPTIONAL MATCH (r:Encounter)-[:MAPPED_TO]->(ov)
WITH ov, head(collect(toString(coalesce(r.fhirId, r.id, r.resourceId)))) AS fromRecord
WITH ov, coalesce(fromRecord, ov.visitId,
       CASE WHEN ov.id STARTS WITH 'omop-visit-' THEN substring(ov.id, 11) END) AS key
WHERE key IS NOT NULL
SET ov.visitOccurrenceId = reduce(n = 0, h IN split(left(apoc.util.md5(['Encounter/' + key]), 13), '') |
       n * 16 + size(split('0123456789abcdef', h)[0]))
REMOVE ov.id, ov.visitId
RETURN count(ov) AS visitoccurrence_keys_set;

MATCH (oc:OMOPConditionOccurrence)
WHERE valueType(oc.conditionOccurrenceId) <> 'INTEGER NOT NULL'
OPTIONAL MATCH (r:Condition)-[:MAPPED_TO]->(oc)
WITH oc, head(collect(toString(coalesce(r.fhirId, r.id, r.resourceId)))) AS fromRecord
WITH oc, coalesce(fromRecord, oc.conditionId,
       CASE WHEN oc.id STARTS WITH 'omop-cond-' THEN substring(oc.id, 10) END) AS key
WHERE key IS NOT NULL
SET oc.conditionOccurrenceId = reduce(n = 0, h IN split(left(apoc.util.md5(['Condition/' + key]), 13), '') |
       n * 16 + size(split('0123456789abcdef', h)[0]))
REMOVE oc.id, oc.conditionId
RETURN count(oc) AS conditionoccurrence_keys_set;

MATCH (om:OMOPMeasurement)
WHERE valueType(om.measurementId) <> 'INTEGER NOT NULL'
OPTIONAL MATCH (r:Observation)-[:MAPPED_TO]->(om)
WITH om, head(collect(toString(coalesce(r.fhirId, r.id, r.resourceId)))) AS fromRecord
WITH om, coalesce(fromRecord, CASE WHEN om.measurementId IS :: STRING THEN om.measurementId END,
       CASE WHEN om.id STARTS WITH 'omop-meas-' THEN substring(om.id, 10) END) AS key
WHERE key IS NOT NULL
SET om.measurementId = reduce(n = 0, h IN split(left(apoc.util.md5(['Observation/' + key]), 13), '') |
       n * 16 + size(split('0123456789abcdef', h)[0]))
REMOVE om.id
RETURN count(om) AS measurement_keys_set;

MATCH (od:OMOPDrugExposure)
WHERE valueType(od.drugExposureId) <> 'INTEGER NOT NULL'
OPTIONAL MATCH (r:MedicationRequest)-[:MAPPED_TO]->(od)
WITH od, head(collect(toString(coalesce(r.fhirId, r.id, r.resourceId)))) AS fromRecord
WITH od, coalesce(fromRecord, od.drugId,
       CASE WHEN od.id STARTS WITH 'omop-drug-' THEN substring(od.id, 10) END) AS key
WHERE key IS NOT NULL
SET od.drugExposureId = reduce(n = 0, h IN split(left(apoc.util.md5(['MedicationRequest/' + key]), 13), '') |
       n * 16 + size(split('0123456789abcdef', h)[0]))
REMOVE od.id, od.drugId
RETURN count(od) AS drugexposure_keys_set;

MATCH (opo:OMOPProcedureOccurrence)
WHERE valueType(opo.procedureOccurrenceId) <> 'INTEGER NOT NULL'
OPTIONAL MATCH (r:Procedure)-[:MAPPED_TO]->(opo)
WITH opo, head(collect(toString(coalesce(r.fhirId, r.id, r.resourceId)))) AS fromRecord
WITH opo, coalesce(fromRecord, opo.procedureId,
       CASE WHEN opo.id STARTS WITH 'omop-proc-' THEN substring(opo.id, 10) END) AS key
WHERE key IS NOT NULL
SET opo.procedureOccurrenceId = reduce(n = 0, h IN split(left(apoc.util.md5(['Procedure/' + key]), 13), '') |
       n * 16 + size(split('0123456789abcdef', h)[0]))
REMOVE opo.id, opo.procedureId
RETURN count(opo) AS procedureoccurrence_keys_set;

// This script hung visits on HAS_VISIT; every other writer and reader uses
// HAS_VISIT_OCCURRENCE.
MATCH (op:OMOPPerson)-[old:HAS_VISIT]->(ov:OMOPVisitOccurrence)
MERGE (op)-[:HAS_VISIT_OCCURRENCE]->(ov)
DELETE old
RETURN count(old) AS visit_edges_renamed;

// Every event row carries its person's key, the CDM's person_id.
MATCH (op:OMOPPerson)-[:HAS_VISIT_OCCURRENCE|HAS_CONDITION_OCCURRENCE|HAS_MEASUREMENT|HAS_DRUG_EXPOSURE|HAS_PROCEDURE_OCCURRENCE]->(x)
WHERE op.personId IS NOT NULL
  AND (x.personId IS NULL OR x.personId <> op.personId)
SET x.personId = op.personId
RETURN count(x) AS event_person_keys_set;

// ── 1. OMOPPerson from Patient ───────────────────────────────────────────────
// Map each FHIR Patient to an OMOPPerson with CDM-compatible fields.
//
// No name: the OMOP CDM has no column for one, and this is the research
// layer. It used to copy the patient's name here, which put names in front of
// every researcher (#475). The label is a neutral one derived from the key.
//
// Only a patient with something for research gets a person: a condition, a
// medication, a procedure or a mappable observation (the events of steps 3
// to 6). Step 7 would delete any other person again, and a second run would
// create it once more.

MATCH (p:Patient)
WHERE NOT (p)-[:MAPPED_TO]->(:OMOPPerson)
WITH p, toString(coalesce(p.fhirId, p.id, p.resourceId)) AS key
WHERE key IS NOT NULL
  AND (EXISTS { (p)-[:HAS_CONDITION]->(:Condition) }
    OR EXISTS { (p)-[:HAS_MEDICATION|HAS_MEDICATION_REQUEST]->(:MedicationRequest) }
    OR EXISTS { (p)-[:HAS_PROCEDURE]->(:Procedure) }
    OR EXISTS {
      (p)-[:HAS_OBSERVATION]->(o:Observation)
      WHERE coalesce(o.category, '') IN ['laboratory', 'vital-signs', '']
    })
WITH p,
     reduce(n = 0, h IN split(left(apoc.util.md5(['Patient/' + key]), 13), '') |
       n * 16 + size(split('0123456789abcdef', h)[0])) AS personId,
     CASE p.gender WHEN 'male' THEN 8507 WHEN 'female' THEN 8532 ELSE 0 END AS gender,
     coalesce(toInteger(left(toString(p.birthDate), 4)), 1900) AS yearOfBirth
MERGE (op:OMOPPerson {personId: personId})
  ON CREATE SET op.name            = 'OMOP person ' + personId,
                op.genderConceptId = gender,
                op.yearOfBirth     = yearOfBirth,
                op.ethnicity       = 'Unknown',
                op.raceConceptId   = 0
  ON MATCH SET  op.genderConceptId = gender,
                op.yearOfBirth     = yearOfBirth
MERGE (p)-[:MAPPED_TO]->(op)
FOREACH (_o IN CASE WHEN p:OptedOut THEN [1] ELSE [] END | SET op:OptedOut)
RETURN count(op) AS omop_persons_mapped;

// ── 1b. Repair: OMOP persons that carry a copied patient name ──────────────
// Graphs transformed before #475 gave each OMOPPerson its patient's name.
// Idempotent: once replaced, the name no longer equals the patient's.

MATCH (p:Patient)-[:MAPPED_TO]->(op:OMOPPerson)
WHERE op.name = p.name
SET op.name = 'OMOP person ' + toString(op.personId)
RETURN count(op) AS omop_person_names_removed;

// Steps 2 to 6 MERGE each event on the key derived from its FHIR record. A row
// scripts/generate-graph-seed.py already wrote for that record has the same
// key, so it is found rather than written a second time, and gets the
// MAPPED_TO it lacked.

// ── 2. OMOPVisitOccurrence from Encounter ────────────────────────────────

MATCH (p:Patient)-[:HAS_ENCOUNTER]->(e:Encounter)
MATCH (p)-[:MAPPED_TO]->(op:OMOPPerson)
WHERE NOT (e)-[:MAPPED_TO]->(:OMOPVisitOccurrence)
WITH e, op, p:OptedOut AS optedOut, toString(coalesce(e.fhirId, e.id, e.resourceId)) AS key,
     left(toString(e.date), 10) AS day,
     CASE e.class
       WHEN 'AMB'  THEN 9202
       WHEN 'IMP'  THEN 9201
       WHEN 'EMER' THEN 9203
       ELSE 9202
     END AS visitConceptId
WHERE key IS NOT NULL
WITH e, op, optedOut, key, day, visitConceptId,
     reduce(n = 0, h IN split(left(apoc.util.md5(['Encounter/' + key]), 13), '') |
       n * 16 + size(split('0123456789abcdef', h)[0])) AS cdmId
MERGE (ov:OMOPVisitOccurrence {visitOccurrenceId: cdmId})
  ON CREATE SET ov.name           = 'Visit ' + coalesce(day, key),
                  ov.visitStartDate = coalesce(day, ''),
                  ov.visitConceptId = visitConceptId,
                  ov.personId       = op.personId
  ON MATCH SET  ov.visitStartDate = coalesce(day, ''),
                  ov.visitConceptId = visitConceptId,
                  ov.personId       = op.personId
MERGE (e)-[:MAPPED_TO]->(ov)
MERGE (op)-[:HAS_VISIT_OCCURRENCE]->(ov)
FOREACH (_o IN CASE WHEN optedOut THEN [1] ELSE [] END | SET ov:OptedOut)
RETURN count(ov) AS omop_visits_mapped;

// ── 3. OMOPConditionOccurrence from Condition ────────────────────────────

MATCH (p:Patient)-[:HAS_CONDITION]->(c:Condition)
MATCH (p)-[:MAPPED_TO]->(op:OMOPPerson)
WHERE NOT (c)-[:MAPPED_TO]->(:OMOPConditionOccurrence)
WITH c, op, p:OptedOut AS optedOut, toString(coalesce(c.fhirId, c.id, c.resourceId)) AS key,
     left(toString(c.onsetDate), 10) AS day
WHERE key IS NOT NULL
WITH c, op, optedOut, key, day,
     reduce(n = 0, h IN split(left(apoc.util.md5(['Condition/' + key]), 13), '') |
       n * 16 + size(split('0123456789abcdef', h)[0])) AS cdmId
MERGE (oc:OMOPConditionOccurrence {conditionOccurrenceId: cdmId})
  ON CREATE SET oc.name                 = coalesce(c.display, c.name, key),
                  oc.conditionStartDate   = coalesce(day, ''),
                  oc.conditionSourceValue = c.code,
                  oc.conditionConceptId   = 0,
                  oc.personId             = op.personId
  ON MATCH SET  oc.conditionStartDate   = coalesce(day, ''),
                  oc.conditionSourceValue = c.code,
                  oc.personId             = op.personId
MERGE (c)-[:MAPPED_TO]->(oc)
MERGE (op)-[:HAS_CONDITION_OCCURRENCE]->(oc)
FOREACH (_o IN CASE WHEN optedOut THEN [1] ELSE [] END | SET oc:OptedOut)
RETURN count(oc) AS omop_conditions_mapped;

// Link OMOPConditionOccurrence → SnomedConcept (vocabulary bridge)
MATCH (c:Condition)-[:CODED_BY]->(sc:SnomedConcept)
MATCH (c)-[:MAPPED_TO]->(oc:OMOPConditionOccurrence)
MERGE (oc)-[:CODED_BY]->(sc)
RETURN count(sc) AS snomed_links_on_omop_conditions;

// ── 4. OMOPMeasurement from Observation ──────────────────────────────────

MATCH (p:Patient)-[:HAS_OBSERVATION]->(o:Observation)
MATCH (p)-[:MAPPED_TO]->(op:OMOPPerson)
WHERE NOT (o)-[:MAPPED_TO]->(:OMOPMeasurement)
  AND coalesce(o.category, '') IN ['laboratory', 'vital-signs', '']
WITH o, op, p:OptedOut AS optedOut, toString(coalesce(o.fhirId, o.id, o.resourceId)) AS key,
     left(toString(coalesce(o.dateTime, o.effectiveDate, o.date)), 10) AS day,
     toFloat(coalesce(o.value, o.valueQuantity, '0')) AS value,
     coalesce(o.unit, o.valueUnit, '') AS unit
WHERE key IS NOT NULL
WITH o, op, optedOut, key, day, value, unit,
     reduce(n = 0, h IN split(left(apoc.util.md5(['Observation/' + key]), 13), '') |
       n * 16 + size(split('0123456789abcdef', h)[0])) AS cdmId
MERGE (om:OMOPMeasurement {measurementId: cdmId})
  ON CREATE SET om.name                   = coalesce(o.display, o.name, key),
                  om.measurementDate        = coalesce(day, ''),
                  om.measurementSourceValue = o.code,
                  om.valueAsNumber          = value,
                  om.unit                   = unit,
                  om.measurementConceptId   = 0,
                  om.personId               = op.personId
  ON MATCH SET  om.measurementDate        = coalesce(day, ''),
                  om.measurementSourceValue = o.code,
                  om.valueAsNumber          = value,
                  om.unit                   = unit,
                  om.personId               = op.personId
MERGE (o)-[:MAPPED_TO]->(om)
MERGE (op)-[:HAS_MEASUREMENT]->(om)
FOREACH (_o IN CASE WHEN optedOut THEN [1] ELSE [] END | SET om:OptedOut)
RETURN count(om) AS omop_measurements_mapped;

// Link OMOPMeasurement → LoincCode (vocabulary bridge)
MATCH (o:Observation)-[:CODED_BY]->(lc:LoincCode)
MATCH (o)-[:MAPPED_TO]->(om:OMOPMeasurement)
MERGE (om)-[:CODED_BY]->(lc)
RETURN count(lc) AS loinc_links_on_omop_measurements;

// ── 5. OMOPDrugExposure from MedicationRequest ───────────────────────────

MATCH (p:Patient)-[:HAS_MEDICATION|HAS_MEDICATION_REQUEST]->(m:MedicationRequest)
MATCH (p)-[:MAPPED_TO]->(op:OMOPPerson)
WHERE NOT (m)-[:MAPPED_TO]->(:OMOPDrugExposure)
WITH DISTINCT m, op, p:OptedOut AS optedOut, toString(coalesce(m.fhirId, m.id, m.resourceId)) AS key,
     left(toString(m.date), 10) AS day
WHERE key IS NOT NULL
WITH m, op, optedOut, key, day,
     reduce(n = 0, h IN split(left(apoc.util.md5(['MedicationRequest/' + key]), 13), '') |
       n * 16 + size(split('0123456789abcdef', h)[0])) AS cdmId
MERGE (od:OMOPDrugExposure {drugExposureId: cdmId})
  ON CREATE SET od.name              = coalesce(m.display, m.name, key),
                  od.drugExposureStart = coalesce(day, ''),
                  od.drugSourceValue   = coalesce(m.code, m.medicationCode),
                  od.drugConceptId     = 0,
                  od.daysSupply        = 30,
                  od.personId          = op.personId
  ON MATCH SET  od.drugExposureStart = coalesce(day, ''),
                  od.drugSourceValue   = coalesce(m.code, m.medicationCode),
                  od.personId          = op.personId
MERGE (m)-[:MAPPED_TO]->(od)
MERGE (op)-[:HAS_DRUG_EXPOSURE]->(od)
FOREACH (_o IN CASE WHEN optedOut THEN [1] ELSE [] END | SET od:OptedOut)
RETURN count(od) AS omop_drug_exposures_mapped;

// Link OMOPDrugExposure → RxNormConcept (vocabulary bridge)
MATCH (m:MedicationRequest)-[:CODED_BY]->(rxn:RxNormConcept)
MATCH (m)-[:MAPPED_TO]->(od:OMOPDrugExposure)
MERGE (od)-[:CODED_BY]->(rxn)
RETURN count(rxn) AS rxnorm_links_on_omop_drug_exposures;

// ── 6. OMOPProcedureOccurrence from Procedure ────────────────────────────

MATCH (p:Patient)-[:HAS_PROCEDURE]->(pr:Procedure)
MATCH (p)-[:MAPPED_TO]->(op:OMOPPerson)
WHERE NOT (pr)-[:MAPPED_TO]->(:OMOPProcedureOccurrence)
WITH pr, op, p:OptedOut AS optedOut, toString(coalesce(pr.fhirId, pr.id, pr.resourceId)) AS key,
     left(toString(coalesce(pr.performedStart, pr.date)), 10) AS day
WHERE key IS NOT NULL
WITH pr, op, optedOut, key, day,
     reduce(n = 0, h IN split(left(apoc.util.md5(['Procedure/' + key]), 13), '') |
       n * 16 + size(split('0123456789abcdef', h)[0])) AS cdmId
MERGE (opo:OMOPProcedureOccurrence {procedureOccurrenceId: cdmId})
  ON CREATE SET opo.name                 = coalesce(pr.display, pr.name, key),
                  opo.procedureDate        = coalesce(day, ''),
                  opo.procedureSourceValue = pr.code,
                  opo.procedureConceptId   = 0,
                  opo.personId             = op.personId
  ON MATCH SET  opo.procedureDate        = coalesce(day, ''),
                  opo.procedureSourceValue = pr.code,
                  opo.personId             = op.personId
MERGE (pr)-[:MAPPED_TO]->(opo)
MERGE (op)-[:HAS_PROCEDURE_OCCURRENCE]->(opo)
FOREACH (_o IN CASE WHEN optedOut THEN [1] ELSE [] END | SET opo:OptedOut)
RETURN count(opo) AS omop_procedure_occurrences_mapped;

// Link OMOPProcedureOccurrence → SnomedConcept (vocabulary bridge)
MATCH (pr:Procedure)-[:CODED_BY]->(sc:SnomedConcept)
MATCH (pr)-[:MAPPED_TO]->(opo:OMOPProcedureOccurrence)
MERGE (opo)-[:CODED_BY]->(sc)
RETURN count(sc) AS snomed_links_on_omop_procedures;

// ── 7. Cleanup: Remove orphaned OMOPPerson (no clinical events) ─────────────
// An OMOPPerson with no downstream HAS_CONDITION_OCCURRENCE / HAS_DRUG_EXPOSURE /
// HAS_MEASUREMENT / HAS_PROCEDURE_OCCURRENCE has nothing to contribute to research
// analytics. Detach-delete keeps EHDS OMOP-4.7 passing (no orphan OMOP persons).
MATCH (op:OMOPPerson)
WHERE NOT (op)-[:HAS_CONDITION_OCCURRENCE]->()
  AND NOT (op)-[:HAS_DRUG_EXPOSURE]->()
  AND NOT (op)-[:HAS_MEASUREMENT]->()
  AND NOT (op)-[:HAS_PROCEDURE_OCCURRENCE]->()
WITH collect(op) AS orphans
FOREACH (op IN orphans | DETACH DELETE op)
RETURN size(orphans) AS orphan_omop_persons_removed;

// ── 8. Summary ───────────────────────────────────────────────────────────────

MATCH (n)
WHERE n:OMOPPerson
   OR n:OMOPVisitOccurrence
   OR n:OMOPConditionOccurrence
   OR n:OMOPMeasurement
   OR n:OMOPDrugExposure
   OR n:OMOPProcedureOccurrence
RETURN labels(n)[0] AS omopLayer, count(n) AS total
ORDER BY omopLayer;

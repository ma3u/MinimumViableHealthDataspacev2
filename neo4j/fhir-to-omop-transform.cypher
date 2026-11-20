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
// ============================================================================

// ── 1. OMOPPerson from Patient ───────────────────────────────────────────────
// Map each FHIR Patient to an OMOPPerson with CDM-compatible fields.
//
// No name: the OMOP CDM has no column for one, and this is the research
// layer. It used to copy the patient's name here, which put names in front of
// every researcher (#475). The label is a neutral one derived from the record.
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
WITH p, key,
     CASE p.gender WHEN 'male' THEN 8507 WHEN 'female' THEN 8532 ELSE 0 END AS gender,
     coalesce(toInteger(left(toString(p.birthDate), 4)), 1900) AS yearOfBirth
MERGE (op:OMOPPerson {id: 'omop-person-' + key})
  ON CREATE SET op.name            = 'OMOP person ' + right(key, 6),
                op.genderConceptId = gender,
                op.yearOfBirth     = yearOfBirth,
                op.ethnicity       = 'Unknown',
                op.raceConceptId   = 0
  ON MATCH SET  op.genderConceptId = gender,
                op.yearOfBirth     = yearOfBirth
MERGE (p)-[:MAPPED_TO]->(op)
FOREACH (_o IN CASE WHEN p:OptedOut THEN [1] ELSE [] END | SET op:OptedOut)
RETURN count(op) AS omop_persons_created;

// ── 1b. Repair: OMOP persons that carry a copied patient name ──────────────
// Graphs transformed before #475 gave each OMOPPerson its patient's name.
// Idempotent: once replaced, the name no longer equals the patient's.

MATCH (p:Patient)-[:MAPPED_TO]->(op:OMOPPerson)
WHERE op.name = p.name
SET op.name = 'OMOP person ' + right(toString(coalesce(
      p.fhirId, p.id, p.resourceId, op.id, op.personId)), 6)
RETURN count(op) AS omop_person_names_removed;

// Steps 2 to 6 first look for a counterpart the graph seed already wrote.
// scripts/generate-graph-seed.py writes the OMOP layer next to the FHIR one,
// keyed by the FHIR record's id (`visitId`, `conditionId`, `measurementId`,
// `drugId`, `procedureId`) and hung on the person, but without a MAPPED_TO
// from the FHIR record. Such a counterpart is adopted with that MAPPED_TO,
// rather than written a second time; its properties are left as they are.

// ── 2. OMOPVisitOccurrence from Encounter ───────────────────────────────────

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
OPTIONAL MATCH (op)-[:HAS_VISIT|HAS_VISIT_OCCURRENCE]->(seeded:OMOPVisitOccurrence {visitId: key})
WITH e, op, optedOut, key, day, visitConceptId, head(collect(seeded)) AS seeded
FOREACH (_ IN CASE WHEN seeded IS NULL THEN [] ELSE [1] END |
  MERGE (e)-[:MAPPED_TO]->(seeded)
  FOREACH (_o IN CASE WHEN optedOut THEN [1] ELSE [] END | SET seeded:OptedOut))
FOREACH (_ IN CASE WHEN seeded IS NULL THEN [1] ELSE [] END |
  MERGE (ov:OMOPVisitOccurrence {id: 'omop-visit-' + key})
    ON CREATE SET ov.name           = 'Visit ' + coalesce(day, key),
                  ov.visitStartDate = coalesce(day, ''),
                  ov.visitConceptId = visitConceptId,
                  ov.personId       = coalesce(op.id, op.personId)
    ON MATCH SET  ov.visitStartDate = coalesce(day, ''),
                  ov.visitConceptId = visitConceptId,
                  ov.personId       = coalesce(op.id, op.personId)
  MERGE (e)-[:MAPPED_TO]->(ov)
  MERGE (op)-[:HAS_VISIT]->(ov)
  FOREACH (_o IN CASE WHEN optedOut THEN [1] ELSE [] END | SET ov:OptedOut))
RETURN count(e) - count(seeded) AS omop_visits_created,
       count(seeded) AS omop_visits_adopted;

// ── 3. OMOPConditionOccurrence from Condition ────────────────────────────────

MATCH (p:Patient)-[:HAS_CONDITION]->(c:Condition)
MATCH (p)-[:MAPPED_TO]->(op:OMOPPerson)
WHERE NOT (c)-[:MAPPED_TO]->(:OMOPConditionOccurrence)
WITH c, op, p:OptedOut AS optedOut, toString(coalesce(c.fhirId, c.id, c.resourceId)) AS key,
     left(toString(c.onsetDate), 10) AS day
WHERE key IS NOT NULL
OPTIONAL MATCH (op)-[:HAS_CONDITION_OCCURRENCE]->(seeded:OMOPConditionOccurrence {conditionId: key})
WITH c, op, optedOut, key, day, head(collect(seeded)) AS seeded
FOREACH (_ IN CASE WHEN seeded IS NULL THEN [] ELSE [1] END |
  MERGE (c)-[:MAPPED_TO]->(seeded)
  FOREACH (_o IN CASE WHEN optedOut THEN [1] ELSE [] END | SET seeded:OptedOut))
FOREACH (_ IN CASE WHEN seeded IS NULL THEN [1] ELSE [] END |
  MERGE (oc:OMOPConditionOccurrence {id: 'omop-cond-' + key})
    ON CREATE SET oc.name                 = coalesce(c.display, c.name, key),
                  oc.conditionStartDate   = coalesce(day, ''),
                  oc.conditionSourceValue = c.code,
                  oc.conditionConceptId   = 0,
                  oc.personId             = coalesce(op.id, op.personId)
    ON MATCH SET  oc.conditionStartDate   = coalesce(day, ''),
                  oc.conditionSourceValue = c.code,
                  oc.personId             = coalesce(op.id, op.personId)
  MERGE (c)-[:MAPPED_TO]->(oc)
  MERGE (op)-[:HAS_CONDITION_OCCURRENCE]->(oc)
  FOREACH (_o IN CASE WHEN optedOut THEN [1] ELSE [] END | SET oc:OptedOut))
RETURN count(c) - count(seeded) AS omop_conditions_created,
       count(seeded) AS omop_conditions_adopted;

// Link OMOPConditionOccurrence → SnomedConcept (vocabulary bridge)
MATCH (c:Condition)-[:CODED_BY]->(sc:SnomedConcept)
MATCH (c)-[:MAPPED_TO]->(oc:OMOPConditionOccurrence)
MERGE (oc)-[:CODED_BY]->(sc)
RETURN count(sc) AS snomed_links_on_omop_conditions;

// ── 4. OMOPMeasurement from Observation ──────────────────────────────────────

MATCH (p:Patient)-[:HAS_OBSERVATION]->(o:Observation)
MATCH (p)-[:MAPPED_TO]->(op:OMOPPerson)
WHERE NOT (o)-[:MAPPED_TO]->(:OMOPMeasurement)
  AND coalesce(o.category, '') IN ['laboratory', 'vital-signs', '']
WITH o, op, p:OptedOut AS optedOut, toString(coalesce(o.fhirId, o.id, o.resourceId)) AS key,
     left(toString(coalesce(o.dateTime, o.effectiveDate, o.date)), 10) AS day,
     toFloat(coalesce(o.value, o.valueQuantity, '0')) AS value,
     coalesce(o.unit, o.valueUnit, '') AS unit
WHERE key IS NOT NULL
OPTIONAL MATCH (op)-[:HAS_MEASUREMENT]->(seeded:OMOPMeasurement {measurementId: key})
WITH o, op, optedOut, key, day, value, unit, head(collect(seeded)) AS seeded
FOREACH (_ IN CASE WHEN seeded IS NULL THEN [] ELSE [1] END |
  MERGE (o)-[:MAPPED_TO]->(seeded)
  FOREACH (_o IN CASE WHEN optedOut THEN [1] ELSE [] END | SET seeded:OptedOut))
FOREACH (_ IN CASE WHEN seeded IS NULL THEN [1] ELSE [] END |
  MERGE (om:OMOPMeasurement {id: 'omop-meas-' + key})
    ON CREATE SET om.name                   = coalesce(o.display, o.name, key),
                  om.measurementDate        = coalesce(day, ''),
                  om.measurementSourceValue = o.code,
                  om.valueAsNumber          = value,
                  om.unit                   = unit,
                  om.measurementConceptId   = 0,
                  om.personId               = coalesce(op.id, op.personId)
    ON MATCH SET  om.measurementDate        = coalesce(day, ''),
                  om.measurementSourceValue = o.code,
                  om.valueAsNumber          = value,
                  om.unit                   = unit,
                  om.personId               = coalesce(op.id, op.personId)
  MERGE (o)-[:MAPPED_TO]->(om)
  MERGE (op)-[:HAS_MEASUREMENT]->(om)
  FOREACH (_o IN CASE WHEN optedOut THEN [1] ELSE [] END | SET om:OptedOut))
RETURN count(o) - count(seeded) AS omop_measurements_created,
       count(seeded) AS omop_measurements_adopted;

// Link OMOPMeasurement → LoincCode (vocabulary bridge)
MATCH (o:Observation)-[:CODED_BY]->(lc:LoincCode)
MATCH (o)-[:MAPPED_TO]->(om:OMOPMeasurement)
MERGE (om)-[:CODED_BY]->(lc)
RETURN count(lc) AS loinc_links_on_omop_measurements;

// ── 5. OMOPDrugExposure from MedicationRequest ───────────────────────────────

MATCH (p:Patient)-[:HAS_MEDICATION|HAS_MEDICATION_REQUEST]->(m:MedicationRequest)
MATCH (p)-[:MAPPED_TO]->(op:OMOPPerson)
WHERE NOT (m)-[:MAPPED_TO]->(:OMOPDrugExposure)
WITH DISTINCT m, op, p:OptedOut AS optedOut, toString(coalesce(m.fhirId, m.id, m.resourceId)) AS key,
     left(toString(m.date), 10) AS day
WHERE key IS NOT NULL
OPTIONAL MATCH (op)-[:HAS_DRUG_EXPOSURE]->(seeded:OMOPDrugExposure {drugId: key})
WITH m, op, optedOut, key, day, head(collect(seeded)) AS seeded
FOREACH (_ IN CASE WHEN seeded IS NULL THEN [] ELSE [1] END |
  MERGE (m)-[:MAPPED_TO]->(seeded)
  FOREACH (_o IN CASE WHEN optedOut THEN [1] ELSE [] END | SET seeded:OptedOut))
FOREACH (_ IN CASE WHEN seeded IS NULL THEN [1] ELSE [] END |
  MERGE (od:OMOPDrugExposure {id: 'omop-drug-' + key})
    ON CREATE SET od.name              = coalesce(m.display, m.name, key),
                  od.drugExposureStart = coalesce(day, ''),
                  od.drugSourceValue   = coalesce(m.code, m.medicationCode),
                  od.drugConceptId     = 0,
                  od.daysSupply        = 30,
                  od.personId          = coalesce(op.id, op.personId)
    ON MATCH SET  od.drugExposureStart = coalesce(day, ''),
                  od.drugSourceValue   = coalesce(m.code, m.medicationCode),
                  od.personId          = coalesce(op.id, op.personId)
  MERGE (m)-[:MAPPED_TO]->(od)
  MERGE (op)-[:HAS_DRUG_EXPOSURE]->(od)
  FOREACH (_o IN CASE WHEN optedOut THEN [1] ELSE [] END | SET od:OptedOut))
RETURN count(m) - count(seeded) AS omop_drug_exposures_created,
       count(seeded) AS omop_drug_exposures_adopted;

// Link OMOPDrugExposure → RxNormConcept (vocabulary bridge)
MATCH (m:MedicationRequest)-[:CODED_BY]->(rxn:RxNormConcept)
MATCH (m)-[:MAPPED_TO]->(od:OMOPDrugExposure)
MERGE (od)-[:CODED_BY]->(rxn)
RETURN count(rxn) AS rxnorm_links_on_omop_drug_exposures;

// ── 6. OMOPProcedureOccurrence from Procedure ───────────────────────────────

MATCH (p:Patient)-[:HAS_PROCEDURE]->(pr:Procedure)
MATCH (p)-[:MAPPED_TO]->(op:OMOPPerson)
WHERE NOT (pr)-[:MAPPED_TO]->(:OMOPProcedureOccurrence)
WITH pr, op, p:OptedOut AS optedOut, toString(coalesce(pr.fhirId, pr.id, pr.resourceId)) AS key,
     left(toString(coalesce(pr.performedStart, pr.date)), 10) AS day
WHERE key IS NOT NULL
OPTIONAL MATCH (op)-[:HAS_PROCEDURE_OCCURRENCE]->(seeded:OMOPProcedureOccurrence {procedureId: key})
WITH pr, op, optedOut, key, day, head(collect(seeded)) AS seeded
FOREACH (_ IN CASE WHEN seeded IS NULL THEN [] ELSE [1] END |
  MERGE (pr)-[:MAPPED_TO]->(seeded)
  FOREACH (_o IN CASE WHEN optedOut THEN [1] ELSE [] END | SET seeded:OptedOut))
FOREACH (_ IN CASE WHEN seeded IS NULL THEN [1] ELSE [] END |
  MERGE (opo:OMOPProcedureOccurrence {id: 'omop-proc-' + key})
    ON CREATE SET opo.name                 = coalesce(pr.display, pr.name, key),
                  opo.procedureDate        = coalesce(day, ''),
                  opo.procedureSourceValue = pr.code,
                  opo.procedureConceptId   = 0,
                  opo.personId             = coalesce(op.id, op.personId)
    ON MATCH SET  opo.procedureDate        = coalesce(day, ''),
                  opo.procedureSourceValue = pr.code,
                  opo.personId             = coalesce(op.id, op.personId)
  MERGE (pr)-[:MAPPED_TO]->(opo)
  MERGE (op)-[:HAS_PROCEDURE_OCCURRENCE]->(opo)
  FOREACH (_o IN CASE WHEN optedOut THEN [1] ELSE [] END | SET opo:OptedOut))
RETURN count(pr) - count(seeded) AS omop_procedure_occurrences_created,
       count(seeded) AS omop_procedure_occurrences_adopted;

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

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
// Re-runnable (all MERGE — idempotent).
// ============================================================================

// ── 1. OMOPPerson from Patient ───────────────────────────────────────────────
// Map each FHIR Patient to an OMOPPerson with CDM-compatible fields.

MATCH (p:Patient)
WHERE NOT (p)-[:MAPPED_TO]->(:OMOPPerson)
MERGE (op:OMOPPerson {id: 'omop-person-' + p.id})
SET op.name             = p.name,
    op.genderConceptId  = CASE p.gender
                            WHEN 'male'   THEN 8507
                            WHEN 'female' THEN 8532
                            ELSE 0
                          END,
    op.yearOfBirth      = toInteger(left(coalesce(p.birthDate, '1900'), 4)),
    op.ethnicity        = 'Unknown',
    op.raceConceptId    = 0
MERGE (p)-[:MAPPED_TO]->(op)
RETURN count(op) AS omop_persons_created;

// ── 2. OMOPVisitOccurrence from Encounter ───────────────────────────────────

MATCH (p:Patient)-[:HAS_ENCOUNTER]->(e:Encounter)
MATCH (p)-[:MAPPED_TO]->(op:OMOPPerson)
WHERE NOT (e)-[:MAPPED_TO]->(:OMOPVisitOccurrence)
MERGE (ov:OMOPVisitOccurrence {id: 'omop-visit-' + e.id})
SET ov.name              = 'Visit ' + coalesce(left(e.date, 10), e.id),
    ov.visitStartDate    = coalesce(left(e.date, 10), ''),
    ov.visitConceptId    = CASE e.class
                             WHEN 'AMB'  THEN 9202
                             WHEN 'IMP'  THEN 9201
                             WHEN 'EMER' THEN 9203
                             ELSE 9202
                           END,
    ov.personId          = op.id
MERGE (e)-[:MAPPED_TO]->(ov)
MERGE (op)-[:HAS_VISIT]->(ov)
RETURN count(ov) AS omop_visits_created;

// ── 3. OMOPConditionOccurrence from Condition ────────────────────────────────

MATCH (p:Patient)-[:HAS_CONDITION]->(c:Condition)
MATCH (p)-[:MAPPED_TO]->(op:OMOPPerson)
WHERE NOT (c)-[:MAPPED_TO]->(:OMOPConditionOccurrence)
MERGE (oc:OMOPConditionOccurrence {id: 'omop-cond-' + c.id})
SET oc.name                  = coalesce(c.display, c.name, c.id),
    oc.conditionStartDate    = coalesce(left(c.onsetDate, 10), ''),
    oc.conditionSourceValue  = c.code,
    oc.conditionConceptId    = 0,
    oc.personId              = op.id
MERGE (c)-[:MAPPED_TO]->(oc)
MERGE (op)-[:HAS_CONDITION_OCCURRENCE]->(oc)
RETURN count(oc) AS omop_conditions_created;

// Link OMOPConditionOccurrence → SnomedConcept (vocabulary bridge)
MATCH (c:Condition)-[:CODED_BY]->(sc:SnomedConcept)
MATCH (c)-[:MAPPED_TO]->(oc:OMOPConditionOccurrence)
MERGE (oc)-[:CODED_BY]->(sc)
RETURN count(sc) AS snomed_links_on_omop_conditions;

// ── 4. OMOPMeasurement from Observation ──────────────────────────────────────

MATCH (p:Patient)-[:HAS_OBSERVATION]->(o:Observation)
MATCH (p)-[:MAPPED_TO]->(op:OMOPPerson)
WHERE NOT (o)-[:MAPPED_TO]->(:OMOPMeasurement)
  AND o.category IN ['laboratory', 'vital-signs', '']
MERGE (om:OMOPMeasurement {id: 'omop-meas-' + o.id})
SET om.name                  = coalesce(o.display, o.name, o.id),
    om.measurementDate       = coalesce(left(o.dateTime, 10), ''),
    om.measurementSourceValue = o.code,
    om.valueAsNumber         = toFloat(coalesce(o.value, '0')),
    om.unit                  = coalesce(o.unit, ''),
    om.measurementConceptId  = 0,
    om.personId              = op.id
MERGE (o)-[:MAPPED_TO]->(om)
MERGE (op)-[:HAS_MEASUREMENT]->(om)
RETURN count(om) AS omop_measurements_created;

// Link OMOPMeasurement → LoincCode (vocabulary bridge)
MATCH (o:Observation)-[:CODED_BY]->(lc:LoincCode)
MATCH (o)-[:MAPPED_TO]->(om:OMOPMeasurement)
MERGE (om)-[:CODED_BY]->(lc)
RETURN count(lc) AS loinc_links_on_omop_measurements;

// ── 5. OMOPDrugExposure from MedicationRequest ───────────────────────────────

MATCH (p:Patient)-[:HAS_MEDICATION]->(m:MedicationRequest)
MATCH (p)-[:MAPPED_TO]->(op:OMOPPerson)
WHERE NOT (m)-[:MAPPED_TO]->(:OMOPDrugExposure)
MERGE (od:OMOPDrugExposure {id: 'omop-drug-' + m.id})
SET od.name                = coalesce(m.display, m.name, m.id),
    od.drugExposureStart   = coalesce(left(m.date, 10), ''),
    od.drugSourceValue     = m.code,
    od.drugConceptId       = 0,
    od.daysSupply          = 30,
    od.personId            = op.id
MERGE (m)-[:MAPPED_TO]->(od)
MERGE (op)-[:HAS_DRUG_EXPOSURE]->(od)
RETURN count(od) AS omop_drug_exposures_created;

// Link OMOPDrugExposure → RxNormConcept (vocabulary bridge)
MATCH (m:MedicationRequest)-[:CODED_BY]->(rxn:RxNormConcept)
MATCH (m)-[:MAPPED_TO]->(od:OMOPDrugExposure)
MERGE (od)-[:CODED_BY]->(rxn)
RETURN count(rxn) AS rxnorm_links_on_omop_drug_exposures;

// ── 6. OMOPProcedureOccurrence from Procedure ───────────────────────────────

MATCH (p:Patient)-[:HAS_PROCEDURE]->(pr:Procedure)
MATCH (p)-[:MAPPED_TO]->(op:OMOPPerson)
WHERE NOT (pr)-[:MAPPED_TO]->(:OMOPProcedureOccurrence)
MERGE (opo:OMOPProcedureOccurrence {id: 'omop-proc-' + pr.id})
SET opo.name                    = coalesce(pr.display, pr.name, pr.id),
    opo.procedureDate           = coalesce(left(pr.performedStart, 10), ''),
    opo.procedureSourceValue    = pr.code,
    opo.procedureConceptId      = 0,
    opo.personId                = op.id
MERGE (pr)-[:MAPPED_TO]->(opo)
MERGE (op)-[:HAS_PROCEDURE_OCCURRENCE]->(opo)
RETURN count(opo) AS omop_procedure_occurrences_created;

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
WITH op, count(op) AS orphans
DETACH DELETE op
RETURN orphans AS orphan_omop_persons_removed;

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

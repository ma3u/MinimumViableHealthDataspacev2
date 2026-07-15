---
type: datamodel
title: OMOP CDM v5.4 analytics nodes (L4)
description: Observational-research view of the clinical data — the secondary-use (EHDS Art. 50-51) layer.
resource: .claude/rules/api-conventions.md (Data Models)
tags: [omop, L4]
timestamp: 2026-07-15T00:00:00Z
---

```
(:OMOPPerson {personId, genderConceptId, yearOfBirth})
  -[:HAS_CONDITION_OCCURRENCE]-> (:OMOPConditionOccurrence {conditionConceptId, startDate})
  -[:HAS_MEASUREMENT]->          (:OMOPMeasurement {measurementConceptId, valueAsNumber, unit})
  -[:HAS_DRUG_EXPOSURE]->        (:OMOPDrugExposure {drugConceptId, startDate})
```

Derived from [fhir-r4-nodes](fhir-r4-nodes.md) in JAD seed phase 4 (strict
ordering — FHIR must exist first). Cohort stats via neo4j-proxy `/omop/cohort`.

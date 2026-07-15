---
type: datamodel
title: FHIR R4 clinical nodes (L3)
description: Patient-centric clinical graph — the primary-use (EHDS Art. 3-12) data layer.
resource: .claude/rules/api-conventions.md (Data Models), neo4j/init-schema.cypher
tags: [fhir, L3]
timestamp: 2026-07-15T00:00:00Z
---

```
(:Patient {resourceId, patientId, name, birthDate, gender, city, country})
  -[:HAS_CONDITION]->          (:Condition {resourceId, code, display, onset})
  -[:HAS_OBSERVATION]->        (:Observation {resourceId, code, display, value, unit, effectiveDate})
  -[:HAS_MEDICATION_REQUEST]-> (:MedicationRequest {resourceId, medicationCode, display})
```

Coded via `-[:CODED_BY]->` to L5 concepts (SNOMED/LOINC/RxNorm). Mapped to L4
via `MAPS_TO` → [omop-cdm-nodes](omop-cdm-nodes.md). 127 synthetic patients
(Synthea — `scripts/generate-synthea.sh`).

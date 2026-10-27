---
type: datamodel
title: Art. 71 opt-out from secondary use
description: How a person's opt-out is recorded, how the holder marks their data, and how every secondary-use query leaves it out (ADR-062).
resource: docs/ADRs/ADR-062-the-art-71-opt-out-is-a-record-and-a-label.md, ui/src/lib/opt-out.ts, services/neo4j-proxy/src/opt-out.ts, ui/src/app/api/patient/opt-out/route.ts
tags: [ehds, art-71, secondary-use, privacy, L3, L4]
generated: { by: claude-code/opus-5.5, at: 2026-10-27T00:00:00Z }
verified: { by: UNKNOWN, at: UNKNOWN }
status: draft
---

Regulation (EU) 2025/327, Art. 71: secondary use under a permit is the
default; a person may opt out at any time, without a reason, and reverse it.
Decision: [ADR-062](../../ADRs/ADR-062-the-art-71-opt-out-is-a-record-and-a-label.md).

```
(:Patient)-[:OPTED_OUT]->(:OptOutRecord {optOutId, patientId, optedOutAt,
  source, reversedAt, reversalSource})
```

- **The record** is never deleted. Who was opted out on a date is
  `optedOutAt <= date AND (reversedAt IS NULL OR reversedAt > date)`
  (`OPTED_OUT_AS_OF_CYPHER`). One record is open at a time.
- **The label.** While a record is open, the Patient, the OMOPPerson
  ([omop-cdm-nodes](omop-cdm-nodes.md)) and every person-level node reachable
  through person-level nodes ([fhir-r4-nodes](fhir-r4-nodes.md)) carry
  `OptedOut`.
- **The filter.** `secondaryUseView()` turns `(p:Patient)` into
  `(p:(Patient)&!OptedOut)` in every secondary-use query: the proxy's `/nlq`
  (all four tiers), `/federated/*`, `/omop/*`, `/fhir/*` and GraphRAG
  candidates; the UI's analytics, patient list and researcher graph for
  `DATA_USER`, `HDAB_AUTHORITY`, `TRUST_CENTER_OPERATOR`. The FHIR handlers
  drop a marked node again before release.
- **The exception.** `art71Exception` on the ODRL scope, true only for a
  valid permit granted on an application that invoked Art. 71(4), skips the
  filter on the NLQ path.
- **Surfaces.** `GET/POST/DELETE /api/patient/opt-out`
  ([nextjs-api-routes](../apis/nextjs-api-routes.md)), the panel on
  `/patient/research`, the `secondary-use` node of the patient's overview
  ([persona-overview](../apis/persona-overview.md)), the count on
  `/information`.
- **Checks.** `scripts/run-ehds-tests.sh` category 6: the label and the
  records agree. Bruno `01 Patient/17-19`, `09 Access control/34`.

Open (#696): narrowing by the permit's approval date as Art. 71(3) allows,
propagation to other holders, the exception on the data plane.

Study participation is separate: a `PatientConsent` is a GDPR consent to one
study (Art. 9(2)(a)), withdrawable under Art. 7(3).

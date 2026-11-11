---
type: datamodel
title: Bonus programme consent and transfer
description: How a person joins a bonus programme of another data space, and how a withdrawal stops every transfer of its yes or no (ADR-080, #934).
resource: docs/ADRs/ADR-080-a-bonus-programme-receives-a-yes-or-no-never-the-data.md, docs/ehds/bonus-programme-data-flow.md, ui/src/lib/patient/programme-consent.ts, ui/src/app/api/patient/programmes/
tags: [ehds, art-7, gdpr-art-9, consent, primary-use, L1, L2]
generated: { by: claude-code/opus-5.5, at: 2026-11-09T00:00:00Z }
verified: { by: UNKNOWN, at: UNKNOWN }
status: draft
---

A bonus programme is primary, person-directed sharing (EHDS Art. 2(2)(d) and
7(3); GDPR Art. 9(2)(a)). Decision:
[ADR-080](../../ADRs/ADR-080-a-bonus-programme-receives-a-yes-or-no-never-the-data.md).
The whole process, with what crosses to the insurer:
[bonus-programme-data-flow](../../ehds/bonus-programme-data-flow.md).

```
(:DataService:BonusProgramme {serviceId, ruleVersion, ...})-[:PUBLISHED_BY]->(:Participant)
(:Patient)-[:GAVE_PROGRAMME_CONSENT]->(:ProgrammeConsent {consentId, patientId,
  programmeId, joinedAt, withdrawnAt, source})-[:FOR_PROGRAMME]->(:BonusProgramme)
(:ProgrammeTransfer {transferId, patientId, programmeId, year, goalMet,
  status, requestedAt, deliveredAt, deliveredTo})-[:UNDER_CONSENT]->(:ProgrammeConsent)
```

- **The programme** comes from the crawl: a DCAT-AP `dcat:DataService` typed
  `ehds:BonusProgramme`, written by the [catalog-enricher](../services/catalog-enricher.md).
- **The consent** is its own record, neither `PatientConsent` (study consent)
  nor `OptOutRecord` ([secondary-use-opt-out](secondary-use-opt-out.md)). It is
  open while `withdrawnAt` is null and is never deleted, except the API
  collection's own (`source: 'api-collection'`), which the live clean-up removes.
- **The gate.** `programmeTransferAllowed()` returns the open consent or null;
  `POST /api/patient/programmes/transfer` answers 403 without one and records
  nothing. It does not read the opt-out.
- **The evaluation** (#934 step 6, [ADR-087](../../ADRs/ADR-087-the-hub-evaluates-a-bonus-year-once-it-has-ended.md))
  reads one ended year inside the record: LOINC 55411-3 weekly exercise means
  (times seven, over 52 weeks) and an Encounter coded SNOMED CT 185349003.
  `GET /api/patient/programmes/evaluation` shows the member goal met and the
  breakdown; a year not over answers `year-not-over`.
- **The transfer** carries the programme, the year and `goalMet`, status
  `evaluated`; 400 for a year the rule does not cover, 409 before the year
  ends.
- **The delivery** (#934 step 8, [ADR-091](../../ADRs/ADR-091-the-insurer-collects-the-yes-or-no-under-a-reference-the-hub-issues.md)).
  The insurer that published the programme collects over its bonus agreement:
  a pull of the asset `bonus-programme-answer`, served by the neo4j-proxy's
  `GET /programmes/answers` through `/dataspace/data` and refused with 403
  any other way. Each answer is `programme`, `year`, `goalMet` and
  `memberReference`, only under an open consent. The reference is derived
  from the consent id (`memberReference()`, one copy in the UI and one in the
  proxy, shared vectors) and shown to the member on `/patient/programmes`.
  The first collection sets `status: 'delivered'`, `deliveredAt` and
  `deliveredTo`.
- **Surfaces.** `GET /api/patient/programmes`, `GET
/api/patient/programmes/evaluation`, `POST/DELETE
/api/patient/programmes/consent`, `POST /api/patient/programmes/transfer`,
  and their Klarbefund twins under `/api/patient/app/programmes`
  ([nextjs-api-routes](../apis/nextjs-api-routes.md)); the page
  `/patient/programmes`; Bruno `01 Patient/22` to `27`; journeys J1092, J1094, J1099; identity
  checks PURPOSE-7.1 to 7.4 and DELIVER-8.1 to 8.6.

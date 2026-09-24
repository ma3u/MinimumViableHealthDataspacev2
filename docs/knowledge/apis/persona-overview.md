---
type: api
title: Persona overview API and derivation rules
description: GET /api/overview?persona= returns one state-first view per persona; how the state is derived, what it is built from, where the fixtures and tests are.
resource: ui/src/app/api/overview/route.ts
tags: [nextjs, api, ehds, overview, persona]
generated: { by: claude-code/fable-5, at: 2026-09-24T14:00:00Z }
verified: { by: human:ma3u, at: 2026-09-24T14:00:00Z }
status: stable
---

One route, four builders, one page. Issue #271 from discussion #265; the
decision that derived state lives in the API and is never persisted is
[ADR-040](../../ADRs/ADR-040-derived-compliance-state-in-the-api.md).
Article numbers are Regulation (EU) 2025/327 as adopted
([numbering](../../ehds-article-numbering.md)).

## Route

`GET /api/overview?persona=patient|researcher|hdab|hospital[&patientId=][&me=did][&asOf=YYYY-MM-DD]`

Session required. The persona defaults to the session's role; a role opens its
own persona only, `EDC_ADMIN` any. `PATIENT` sees its own record whatever
`patientId` says (`patient1` owns P1, `patient2` owns P2); the other personas
default to the session's participant (`userToParticipantId`), else PharmaCo
Research AG, MedReg DE or AlphaKlinik Berlin. `asOf` pins the date the state is
computed for; the fixtures use 2026-09-23.

Errors: 401 no session, 403 wrong persona for the role, 400 unknown persona,
502 graph down, and a sub-route's own status when one of the composed routes
fails.

## What each view is built from

The route calls the existing routes in-process (`call(handler, origin, path)`)
and adds a few graph queries, then hands plain records to a pure builder under
`ui/src/lib/overview/`.

| Persona    | Builder         | Composed routes                                                                                       | Graph queries                                                                                      |
| ---------- | --------------- | ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| patient    | `patient.ts`    | `/api/patient/profile`, `/api/patient/insights`, `/api/patient/research`, `/api/patient/observations` | holder (`TREATED_AT`), `ResearchStudy`, consent trust centre, holder's access log 12 months        |
| hdab       | `hdab.ts`       | `/api/compliance`, `/api/permits`, `/api/credentials`                                                 | `Contract`, all access events 12 months, the body's participant                                    |
| hospital   | `hospital.ts`   | `/api/compliance`, `/api/permits`, `/api/credentials`                                                 | `Contract`, the holder's access events, its participant, `QualityAssessment` per label             |
| researcher | `researcher.ts` | `/api/compliance`, `/api/permits`, `/api/credentials`, `/api/catalog`                                 | `Contract`, the researcher's access events, its participant, `ResearchStudy` with `StudyEnrolment` |

`/api/patient/observations?patientId=&code=` is new with #274: a FHIR R4
searchset Bundle of the patient's Observations with the reference range the
laboratory printed (`referenceLow`, `referenceHigh`, `referenceText` on the
`Observation` node).

## The view model

`ui/src/lib/overview/types.ts`. `OverviewView` = `persona`, `asOf`, `me`,
`title`, `question`, `article`, `layers` (id, name, z, color), `nodes`,
`links`, `signals` sorted worst first, `legend`, `dataNote`.

A node carries `id`, `label`, `layer`, `kind` in plain words (never a Neo4j
label), `status` (`ok`, `info`, `warn`, `bad`, `none`), `pulse`, `title`,
`sub`, `description`, `facts` as `[key, value]` pairs, `article`, `links` to the
owning page, and when it has a series: `series [{date, value}]`, `unit`,
`measure`, `range {low, high, text}`, `higherIsWorse`, and `expand`
(`{nodes, links}`, the single measurements or months chained in time, added to
the scene on click). A signal is `severity`, `code`, `nodeId`, `text`,
`article`.

## Derivation rules (`derive.ts`)

Pure functions over plain records; 29 unit cases in `overview-derive.test.ts`.

| Function           | Rule                                                                                                                                                                                                                           |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `trendOf`          | Direction relative to the band width (or a fifth of the first value): under 15 % is stable. Out of band and moving the wrong way: `bad`; out of band or the wrong way: `warn`; else `ok`. `higherIsWorse` flips the wrong way. |
| `credentialState`  | From `expiresAt`, never from the `status` flag: `expired`, `expiring` within 30 days, `revoked`, else `active`.                                                                                                                |
| `permitState`      | `refused`, `revoked`, `pending`, then `validUntil`: `expired`, `expiring` within 30 days, else `valid`.                                                                                                                        |
| `decisionClock`    | Art. 68(4): due three months after submission (or `decisionDue`); `overdue` when undecided past it. Art. 69(4) uses the same clock for requests.                                                                               |
| `chainOfTrust`     | Per consumer, over credentials, permits, contracts and events: see the codes below. `trusted` is false only on a `bad` finding.                                                                                                |
| `aggregateMonthly` | Count or sum per key and month over `monthRange(asOf, 12)`, zero-filled.                                                                                                                                                       |

Signal codes the builders emit, with the article they rest on:

| Code                                                                                                                          | Severity | Meaning                                                                        | Article                |
| ----------------------------------------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------ | ---------------------- |
| `access-after-credential-expiry`                                                                                              | bad      | accesses served after the purpose credential expired                           | 53(1), 61(1)           |
| `access-attempt-after-refusal`                                                                                                | bad      | refused attempts after the application was refused                             | 61(1), 63              |
| `access-without-permit`                                                                                                       | bad      | accesses served with no valid permit                                           | 61(1), 68              |
| `no-membership-credential`                                                                                                    | bad      | nothing in the wallet says who the consumer is                                 | DCP; 61(1)             |
| `transfer-without-contract`                                                                                                   | warn/bad | every served access lacks a contract on file (bad without a permit)            | DSP; 60(1)             |
| `transfer-partly-without-contract`                                                                                            | warn     | some served accesses carry no contract reference                               | DSP                    |
| `credential-expired`, `-expiring`                                                                                             | warn     | purpose credential lapsed or lapsing, no access after it                       | 53(1)                  |
| `permit-expiring`                                                                                                             | warn     | permit lapses within 30 days                                                   | 68(6)                  |
| `decision-overdue`, `decision-due`                                                                                            | bad/info | the body's own clock on an application or request                              | 68(4), 69(4), 57(1)(j) |
| `pending-queue`                                                                                                               | by trend | open applications at month end against a band of 0 to 2                        | 68(4)                  |
| `label-expired`, `label-below-band`, `label-missing`                                                                          | bad/warn | the holder's quality label against the 0.90 renewal band                       | 78, 57(1)(d)           |
| `parameter-out-of-range`, `parameter-trend`                                                                                   | by trend | a patient's measured parameter against the printed range                       | 14, 3                  |
| `opt-out`                                                                                                                     | info     | a study the patient withdrew from, with the date                               | 71                     |
| `description-incomplete`, `description-missing`                                                                               | warn     | a holder's dataset below 8 of 9 catalogue fields, or absent from the catalogue | 77, 79                 |
| `risk-<domain>`                                                                                                               | by level | the profile's risk score with its factors                                      | 3, 14                  |
| `recommendation`, `study-match`, `dataset-match`, `consent-summary`, `access-log`, `allowed-today`, `catalogue`, `parameters` | info/ok  | what to do next, what is near, what is in order                                | 58, 71, 73, 8, 77      |

The compliance matrix's approval counts as a permit even without an id
(`matrixPermit`); a refused applicant that keeps trying shows its refusals per
month rather than its accesses.

## Page

`/overview` (`ui/src/app/overview/page.tsx`): the signals as a list (the
complete, accessible view), the layered 3D scene
(`ui/src/components/overview/OverviewScene.tsx`, `3d-force-graph` and `three`
as npm dependencies, loaded with `next/dynamic`, off under
`prefers-reduced-motion`, a toggle either way), and one node in the detail
panel (`OverviewDetail.tsx`: value against the band, trend, chart, description,
facts, series table, links). Persona from the role; `?persona=` for admins.

## Static export, seed, tests

- Fixtures `ui/public/mock/overview_{patient,hdab,hospital,researcher}.json`
  and `patient_observations.json`, mapped in `ui/src/lib/api.ts`, regenerated
  from a live server by `scripts/refresh-mocks.sh` or from the other fixtures by
  `npx --yes tsx ui/scripts/generate-overview-fixture.ts`.
- Seed `neo4j/seed-persona-overview.cypher` (generated by
  `scripts/generate-persona-overview-seed.py`): patient P1 with 48 LOINC-coded
  Observations, studies with enrolment, consents, twelve months of access
  events, quality assessments per quarter, pinned credential dates. Applied on
  Azure with the `neo4j-seed.yml` workflow, phase `demo-only`.
- Tests: `ui/__tests__/unit/lib/overview-*.test.ts`,
  `unit/api/overview-route.test.ts`, `unit/api/patient-observations-route.test.ts`,
  `unit/pages/overview.test.tsx`, `unit/config/persona-overview-seed.test.ts`;
  journey `44-persona-overview.spec.ts` (J960 to J975), which runs against
  https://ehds.mabu.red with `PLAYWRIGHT_BASE_URL`.
- Since M6: the reads that touched a patient's record are `TransferEvent
-[:READ]-> Patient` edges (the patient view names who read the record,
  Art. 8, and falls back to the holder's log when none is on file); a
  withdrawn consent carries `revokedAt` (Art. 71); `completeness.ts` scores a
  catalogue entry's Art. 77 description over nine fields (holder and researcher
  datasets carry the fact, the holder is warned below 0.8); the demo login
  `patient1` owns P1 in `/api/patient` as it does in the overview.
- Last EHR sync: the Patient node carries `ehrSyncedAt` and `ehrSyncSource`
  (seeded 2026-09-22T18:05:00Z for P1). `/api/patient` returns them to the
  owner as `lastEhrSync: { at, source }` (null when never synced), the
  patient page shows the date and time under the name, and finishing the
  "Request EHR data" flow calls `POST /api/patient/ehr-sync`, which stamps the
  own record with now. Helper `ui/src/lib/patient/ehr-sync.ts`; fixture
  `patient_restricted.json`.
- Still missing: variable-level descriptions for real relevance, SPE session
  state, contract timestamps relative to the permit, the Art. 63 record (#206).

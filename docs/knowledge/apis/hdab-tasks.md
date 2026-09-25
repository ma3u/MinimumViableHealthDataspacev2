# HDAB tasks: the routes and pages of Chapter IV

The health data access body's tasks under Regulation (EU) 2025/327 Art. 57,
61 to 64, 67 to 69, 72 and 73, as the demo implements them (issue #206).
Every route lives under `ui/src/app/api/`; every page under `ui/src/app/`.
Static export serves the fixtures named in `ui/src/lib/api.ts`.

## Applications and permits (Art. 67, 68)

| Route                                        | Who         | What                                                                                                                                                                                                  |
| -------------------------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/compliance/applications`          | data user   | Files an application with the eleven items of Art. 67(2); reports `completeness` (which items are missing). Minimum: dataset, purpose, justification.                                                 |
| `GET /api/compliance/applications`           | any session | The body sees every application; an applicant its own. Each carries the Art. 68(4) clock (`clockState`: running, extended, paused, decided; `decisionDue`, `completeBy`) and `completeness`.          |
| `POST /api/compliance/applications/clock`    | HDAB        | `INCOMPLETE` (stops the clock, four weeks to complete, `reason` = what is missing) or `EXTEND` (once, three months, with reasons).                                                                    |
| `POST /api/compliance/applications/complete` | applicant   | Supplies missing items; once complete, the three months run from now.                                                                                                                                 |
| `POST /api/compliance/permits`               | HDAB        | Approve or refuse; criteria 68(1)(a) to (h), conditions, validity; `statisticalAlternative: true` with a refusal offers an Art. 69 answer (68(3)); an issued permit carries the fee (`fee`, Art. 62). |
| `POST /api/compliance/permits/revoke`        | HDAB        | Revocation with a reason (Art. 63(3)).                                                                                                                                                                |

Pages: `/applications` (the data user's form, its applications, the completion form while the clock is stopped, the results form once a permit is issued), `/compliance` (the body's inbox: the eleven items, the clock actions, the fee estimate, the decision, revocation).

The vocabulary is in `ui/src/lib/permits.ts` (`APPLICATION_ITEMS`, `applicationCompleteness`, `applicationClock`) and `ui/src/lib/fees.ts` (`estimateFee`).

## Supervision (Art. 63, 64)

| Route                                              | Who         | What                                                                                                                                                                            |
| -------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/compliance/findings`                    | HDAB        | A finding against a party, optionally on a permit; `gdprBreach: true` records that the supervisory authority is informed; four weeks to state views.                            |
| `GET /api/compliance/findings`                     | any session | The body sees all; a party the findings against it.                                                                                                                             |
| `POST /api/compliance/findings/respond`            | the party   | `views` on record (63(2)).                                                                                                                                                      |
| `POST /api/compliance/findings/close`              | HDAB        | `measure`: `NONE`, `WARNING`, `REVOCATION` (revokes the permit concerned at once), `EXCLUSION` (`exclusionMonths`, up to 60), `FINE` (`fineEur`, Art. 64); `note` is published. |
| `POST /api/compliance/information-requests`        | HDAB        | A question to a party (63(1)), four weeks to answer.                                                                                                                            |
| `POST /api/compliance/information-requests/answer` | the party   | The answer on record.                                                                                                                                                           |
| `GET /api/admin/audit?type=supervision`            | HDAB, admin | Findings and information requests for the audit page's Supervision tab.                                                                                                         |

Page: `/supervision` (the body records and closes; a data user or holder answers).

## Retention (Art. 73(1)(e))

`GET /api/admin/audit/retention` reports the policy (12 months) and the state of the records; `POST` with `{ "confirm": true }` deletes only access events and transfers past their `retainUntil`, never a record without one. The proxy stamps `retainUntil` on every event; `recordPermittedTransfer` on every transfer; the seeds on what they create. The Access Logs tab on `/admin/audit` shows the line and the button.

## Results, transparency, fees, trusted holders (Art. 61(4), 58, 59, 62, 72)

| Route                                  | Who                                           | What                                                                                                                                                               |
| -------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `POST /api/compliance/results`         | permit holder                                 | A result of the use (`kind`: publication, policy document, regulatory procedure, IT product, other); deadline 18 months after the permit's validity end; `onTime`. |
| `GET /api/compliance/results`          | public                                        | Every result.                                                                                                                                                      |
| `GET /api/permits`                     | public                                        | The register: applications with their clock, decisions, revocations, `measures`, `results`, fees, `decidedUnder` (Art. 68, 69(3) or 72).                           |
| `GET /api/information`                 | public                                        | The Art. 58(1) items from the graph: the bodies and their contact (e), who has access to what and why (f), results (g), opt-outs, retention, the fee schedule.     |
| `GET /api/activity-report`             | public                                        | Art. 59(1)(a) to (k); now with results (a, j, k), fees (g) and fines and other measures (b).                                                                       |
| `POST /api/compliance/requests/decide` | HDAB, or a trusted holder for its own dataset | `decidedUnder` is `Art. 69(3)` or `Art. 72`; an approval carries the request fee.                                                                                  |

Pages: `/information` (public), `/permits` (public), `/activity-report` (public), `/requests` (a trusted holder sees and decides requests on its datasets).

## Journeys

`ui/__tests__/e2e/journeys/40` to `43` (permit gate, revocation, statistical requests, activity report), `45` (the eleven items and the clock, J990 to J994), `46` (supervision and retention, J995 to J999), `47` (information, results, fees, trusted holder, J1000 to J1004). All run against the local stack and against https://ehds.mabu.red; each run leaves its records on the graph.

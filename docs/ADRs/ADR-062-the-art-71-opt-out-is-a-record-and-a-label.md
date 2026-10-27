# ADR-062: The Art. 71 opt-out is a dated record and a label every secondary-use query excludes

**Status:** Accepted (2026-10-27, implemented with #694)
**Date:** 2026-10-27
**Relates to:** [ADR-044](ADR-044-every-api-route-needs-a-session.md), [ADR-045](ADR-045-observability-and-regulatory-audit-trail.md)
**Tracks:** [#694](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/694)

## Context

The hub was built against the 2022 proposal, which had no general opt-out
from secondary use. Regulation (EU) 2025/327 added one in Art. 71: secondary
use under a permit is the default, a person may opt out at any time without
giving a reason, and may reverse it (Art. 71(1)). Under Art. 71(3) the opt-out
binds data permits and requests approved after it; those approved before may
go on processing the person's data. Art. 71(4)
lets a Member State allow an access body to grant access to the data of persons
who opted out for specific public-interest purposes; an application invokes it
as item (k) of Art. 67(2).

What the hub had instead, found while working on #694:

- The only mechanism was withdrawing consent to one study
  (`DELETE /api/patient/research` sets `PatientConsent.revoked`). Study consent
  is a GDPR consent (Art. 6(1)(a), 9(2)(a)), not the EHDS opt-out, and the
  pages labelled it "EHDS Art. 10", which in the adopted text is the
  primary-use opt-out.
- **Nothing filtered on it.** No cohort, NLQ, analytics, transfer or proxy
  query read `PatientConsent`. A person who withdrew everything was still in
  every count a researcher saw.
- The opt-out count on `/information` read `PatientConsent.status` and
  `consentType`, which nothing writes, so a live graph always said 0.
- There is no single place secondary-use Cypher runs. The NLQ chain has four
  tiers (templates, full-text, GraphRAG, a model), the federated endpoint runs
  caller Cypher, the EDC data plane pulls `/fhir/*` and `/omop/*` from the
  proxy, and the UI reads OMOP directly for analytics, the patient list and
  the researcher graph.

The TEHDAS2 opt-out guideline asks for a registry of pseudonymised ids whose
list can be reconstructed as of a permit's date, filtered at the holder first
and again before release.

## Decision

1. **The record.** Each opt-out is an `OptOutRecord {optOutId, patientId,
optedOutAt, source, reversedAt, reversalSource}`, linked
   `(:Patient)-[:OPTED_OUT]->`. A reversal sets `reversedAt`; a record is never
   deleted. Opting out again opens a new record. Who was opted out on any date
   is `optedOutAt <= date AND (reversedAt IS NULL OR reversedAt > date)`
   (`OPTED_OUT_AS_OF_CYPHER` in `ui/src/lib/opt-out.ts`). Opting out while one
   is open returns the open one.

2. **The label at the holder.** While a record is open, the person's Patient,
   OMOPPerson and every person-level node reachable from them through
   person-level nodes only (encounters, conditions, observations, medications,
   OMOP rows) carry the `OptedOut` label. Opting out sets it, the reversal
   removes it, in the same statement as the record.

3. **The filter on the query, not the prompt.** `secondaryUseView()` rewrites
   every node pattern on a person-level label so it excludes the label:
   `(p:Patient)` becomes `(p:(Patient)&!OptedOut)`. It runs on every query
   that serves secondary use, whoever wrote it:

   - the proxy (`services/neo4j-proxy/src/opt-out.ts`): `/nlq` for all four
     tiers and the data-quality helper, `/federated/query` and
     `/federated/stats` on every SPE, `/omop/*`, `/fhir/*`; GraphRAG's vector
     search, expansion and fallback exclude the label explicitly, so nothing
     of an opted-out person reaches the reranking model either;
   - the UI (`ui/src/lib/opt-out.ts`): the OMOP analytics and the patient list
     for `DATA_USER`, `HDAB_AUTHORITY` and `TRUST_CENTER_OPERATOR`, and the
     researcher graph. `EDC_ADMIN`, `DATA_HOLDER` and `PATIENT` read for care
     or for themselves and are not narrowed.
     The two copies of the rewrite share one file of test vectors, and every
     rewritten NLQ template is planned by a real Neo4j 5.26 in
     `opt-out.neo4j.test.ts`.

4. **Before release.** The FHIR handlers drop any node that still carries the
   label before it leaves the proxy, and answer an opted-out patient's
   `$everything` like an unknown one (404), so whether a person opted out is
   not disclosed either.

5. **The Art. 71(4) exception** is the only way past the filter. The ODRL
   scope gains `art71Exception`, true only when a valid, approved permit was
   granted on an application that invoked item (k). The proxy then runs the
   query as written. The scope is built on the server and overrides anything a
   client sends.

6. **The person acts.** `GET/POST/DELETE /api/patient/opt-out`, for the
   person's own record (or `EDC_ADMIN` naming one), on `/patient/research`
   above the study list, which now says what it is: a separate GDPR consent,
   withdrawable under Art. 7(3). `/information` counts open records.

## Consequences

- An opt-out takes effect at once for every query through the hub, including
  queries under a permit approved before it. That is stricter than Art. 71(3),
  which lets an earlier permit go on processing the person's data. It errs on
  the person's side, and the dated records make the precise rule possible:
  narrowing by the persons opted out as of the permit's approval date
  (`OPTED_OUT_AS_OF_CYPHER`) instead of today is a follow-up. Data a permit
  already received is not recalled.
- The rewrite is a heuristic on the query text, deliberately on the side of
  filtering. It covers node patterns that name a person-level label, which is
  what the templates, the full-text tier, GraphRAG and the model write. A
  node matched without any label (`()-[:HAS_CONDITION]->(c)`) is not touched;
  the release check is the second line for the FHIR paths, and the label also
  sits on the clinical nodes themselves, so `(c:Condition)` is filtered even
  when the Patient is not in the pattern.
- The label is per graph. A second SPE (federated) must mark its own copy of
  a person; the hub writes only to its own Neo4j. Propagating an opt-out to
  other holders is a HealthData@EU question (#694 item 7) and stays open.
- The data plane (`/fhir/*`, `/omop/*`) has no permit in hand, so it always
  filters; an Art. 71(4) exception is honoured on the NLQ path only for now.
- `PatientConsent` stays what it is, study participation, and no longer claims
  to be the EHDS opt-out.

## Alternatives considered

- **A property, `p.secondaryUseOptOut = true`, and `WHERE NOT ...` added to
  queries.** Lost because a property cannot be excluded in the node pattern of
  a query someone else wrote; a label expression can, and Neo4j 5 supports
  `&!` natively.
- **A filtered projection or a second database for secondary use.** The
  strongest guarantee, but Neo4j Community has one database and no views, and
  keeping a copy in step is the problem the label solves in place.
- **Filtering in each template by hand.** Lost because the model and GraphRAG
  tiers write Cypher no one reviews; the guard has to sit where every query
  passes, as the identity guard of #475 does.
- **Keeping study consent as the opt-out.** Lost on the law: consent to a
  study is opt-in and per study; Art. 71 is a general opt-out from a default.

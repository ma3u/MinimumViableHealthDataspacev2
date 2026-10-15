# ADR-059: The record holds reports, vaccinations and the medication plan, not laboratory values alone

## Status

Accepted, 2026-10-15. Issue #186 (Klarbefund) and the test database the
demo hub seeds.

## Context

The hub's patient record was laboratory values: `Observation` nodes with a
LOINC code, hung off a `Patient`, exported as a FHIR R4 searchset Bundle by
`/api/patient/observations` and read by the Klarbefund app. An ePA or EHR
integrator who looks at the test database asks for more than that, in the
order the EHDS priority categories of Art. 14 name them: a resting ECG and an
imaging report (medical images and reports), the vaccination record and the
medication plan (patient summary). Until now the graph had no node for any
of them, and the FHIR export could not carry them.

Two constraints shaped the decision. The Klarbefund app parses the
Observation Bundle and must not break when the record grows. And the hub's
rule is fictional data only, idempotent `MERGE`, so a seed can run on every
deploy.

## Decision

1. **Three new node labels, FHIR-named.** `DiagnosticReport` (LOINC code,
   HL7 v2-0074 section such as `EC` or `RAD`, conclusion, `HAS_RESULT` to its
   measured `Observation`s), `Immunization` (CVX code, date, lot) and
   `MedicationStatement` (ATC code, the `1-0-1` dosing of the German
   medication plan, a plan id). Relationships `HAS_DIAGNOSTIC_REPORT`,
   `HAS_IMMUNIZATION` and `HAS_MEDICATION_STATEMENT` from the `Patient`.
   Constraints in `neo4j/init-schema.cypher`, the seed in
   `neo4j/seed-study-results.cypher`, run after the persona overview.
2. **A report's measurements are ordinary Observations.** An ECG interval
   or an ejection fraction is an `Observation` under `HAS_OBSERVATION` as
   well as under the report's `HAS_RESULT`, so the timeline, the trends and
   the Bundle see it without a second code path.
3. **The Bundle grows only on request.** `/api/patient/observations` stays
   Observations only; `include=all` appends the reports, immunizations and
   statements as FHIR resources. The app's `/api/patient/app/record` is
   untouched. The proxy's `$everything` carries the new resources always,
   and now matches a patient by `fhirId`, `id` or `resourceId`, so the demo
   record answers there too.
4. **Every code is verified, every value invented.** LOINC codes checked
   against the NLM clinical tables API; CVX and ATC as published; three
   fictional patients (`P1`, `fhir-pat-1002`, `fhir-pat-1005`).

## Consequences

- An integrator can pull one Bundle with four of the five Art. 14
  categories from the demo hub, with real code systems, and rehearse an
  import against it.
- Adding a further kind of result (microbiology, pathology, a discharge
  letter) is another label with a seed and a mapper in
  `ui/src/lib/patient/record-extras.ts`; the pattern is set.
- The OMOP mirror does not yet see the new nodes; the FHIR to OMOP
  transform covers Observations, Conditions and MedicationRequests only.
- The profile page does not yet show vaccinations or the plan; the FHIR
  export does. A page section is a follow-up.

## Alternatives considered

- **Everything as Observations.** A vaccination as an Observation with a
  CVX code would need no new label, but no importer expects it there, and
  the medication plan has no Observation shape at all.
- **A separate route per resource type.** Four routes, four Bruno
  requests, four spec entries, for what an integrator wants in one Bundle.
- **Extending the app's record route.** Would have changed what the phone
  parses in the same release; the `include` switch keeps the two apart.

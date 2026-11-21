# ADR-098: OMOP rows are keyed by their CDM id, an integer derived from the FHIR reference

Date: 2026-11-21

**Status:** Proposed
**Relates to:** [ADR-062](ADR-062-the-art-71-opt-out-is-a-record-and-a-label.md) (an opted-out person's OMOP rows carry `OptedOut`)
**Tracks:** [#1190](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/1190)

## Context

Layer 4 of the graph holds the OMOP CDM v5.4 rows. Three writers create them, and each keys them its own way:

| Writer                                                                                                    | Person                                        | Event rows                                                                                                                                    | Visit edge             |
| --------------------------------------------------------------------------------------------------------- | --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| [`neo4j/init-schema.cypher`](../../neo4j/init-schema.cypher#L92-L98), the constraints                     | `personId` unique                             | `conditionOccurrenceId`, `measurementId`, `procedureOccurrenceId` unique; nothing for visits and drugs                                        |                        |
| [`neo4j/insert-synthetic-schema-data.cypher`](../../neo4j/insert-synthetic-schema-data.cypher#L206-L240)  | `personId` 99001…                             | the CDM names, integers (`visitOccurrenceId` 88001, `conditionOccurrenceId` 77001, …)                                                         | `HAS_VISIT_OCCURRENCE` |
| [`scripts/generate-graph-seed.py`](../../scripts/generate-graph-seed.py#L443)                             | `personId` 2000…                              | the FHIR record's id as text, under `visitId`, `conditionId`, `drugId`, `procedureId`, and under the CDM name `measurementId`; no `MAPPED_TO` | `HAS_VISIT_OCCURRENCE` |
| [`neo4j/fhir-to-omop-transform.cypher`](../../neo4j/fhir-to-omop-transform.cypher) (Phase 3b, 2026-03-08) | `id: 'omop-person-' + FHIR id`, no `personId` | `id: 'omop-visit-' + FHIR id` and so on; `personId` set to the person's `id` text                                                             | `HAS_VISIT`            |

The schema and the synthetic seed follow the CDM column names (`person_id`, `measurement_id`). The transform was written with the Synthea loader, whose FHIR ids are text (UUIDs), and took the FHIR id with a prefix. Nobody noticed, because until #1186 the transform did not run on the seeded graph.

What it costs:

- **The constraints protect only part of the layer.** Neo4j does not check a uniqueness constraint on a missing property, and the transform's rows have no `personId`. Two runs could write one person twice. #1186 had to add the adoption of generator rows to avoid 1,071 duplicates.
- **Readers see only part of the layer.**
  - The NLQ schema ([`engine.ts:562`](../../services/neo4j-proxy/src/nlq/engine.ts#L562)) tells the model that a person has a `personId`. A generated query misses every person the transform wrote.
  - The patient route works around this with `coalesce(omop.id, omop.personId, …)` ([`route.ts:75`](../../ui/src/app/api/patient/route.ts#L75)).
- **A third name that nobody writes.** `/omop/person/:id/timeline` ([`omop.ts:101`](../../services/neo4j-proxy/src/routes/omop.ts#L101)) looks for `personSourceValue` and for a `MAPS_TO_OMOP_PERSON` edge. Nothing writes either, so the route has never found a person.
- **`measurementId` holds text and integers at once.** On the local graph on 2026-11-21: 771 text, 8 integers.
- **A CDM export does not fit.** The CDM declares `person_id` and every event id as integers. The Klarbefund app's export already writes integers ([`OmopExport.swift`](../../clients/ios/Sources/Shared/OmopExport.swift#L67)), and OHDSI tools such as ATLAS expect them.

## Decision

1. **One key per OMOP label, under the CDM column's name, as an integer:**

   - `OMOPPerson.personId`
   - `OMOPVisitOccurrence.visitOccurrenceId`
   - `OMOPConditionOccurrence.conditionOccurrenceId`
   - `OMOPMeasurement.measurementId`
   - `OMOPDrugExposure.drugExposureId`
   - `OMOPProcedureOccurrence.procedureOccurrenceId`

   Each has a uniqueness constraint. The ones on visits and drugs are new. Every event row also carries `personId`, its person's key, which is the CDM's foreign key.

2. **The integer is derived from the FHIR reference.** It is the first 13 hex digits (52 bits) of the MD5 of `<FHIR type>/<FHIR id>`, for example `Encounter/enc-2000-0`.
   - Cypher computes it with `apoc.util.md5`, and the seed generator computes it with `hashlib.md5`.
   - Because it is deterministic, a rebuilt graph, the generator and the migration give the same row the same id. Nothing has to coordinate a counter between writers.
   - 52 bits stay below `Number.MAX_SAFE_INTEGER`, so the UI and the proxy read the id without loss.
   - At 100,000 rows the chance of a collision is about one in a million, and a collision fails the write on the constraint rather than merging two rows.
   - An integer key that a row already has is kept: the generator's persons 2000… and the synthetic seed's 99001….
3. **The link to the FHIR record is the `MAPPED_TO` edge, not a property.**
   - No `id`, `visitId`, `conditionId`, `drugId` or `procedureId`.
   - No `personSourceValue` holding a record id. The CDM allows an encrypted key there, but the edge already does that job, and a FHIR id in the research layer is one more way back to the record.
   - The `*SourceValue` columns keep what the CDM puts in them, which is the source code (SNOMED, LOINC, RxNorm).
4. **A visit hangs on `HAS_VISIT_OCCURRENCE`**, as the generator, the synthetic seed and the embedding projection already have it. The transform's `HAS_VISIT` goes.
5. **The transform migrates.** It runs in every pipeline (`neo4j/seed.sh`, `scripts/seed-spe2.sh`, `scripts/load_fhir_neo4j.py`), so its new step 0 brings older rows to this shape before anything is mapped:

   - adopts the generator's rows by the FHIR id they carry;
   - gives every row without an integer key its derived one;
   - sets `personId` on every event row;
   - removes the old keys;
   - moves `HAS_VISIT` to `HAS_VISIT_OCCURRENCE`.

   A second run changes nothing.

6. **Readers ask for these keys.**
   - The timeline route finds a person by `personId` and builds the timeline from the person's OMOP rows, not from FHIR nodes.
   - The patient route reads the CDM keys.
   - The graph check requires them.

## Alternatives

- **Text keys.** Easiest in Neo4j, but a CDM export would need a mapping table, and the existing integer rows would have to change instead.
- **A sequence (the largest id plus one).** This is the usual CDM ETL approach. But the generator writes static Cypher and cannot read the largest id, so two writers would have to share a counter. The ids would also change with every rebuild.
- **Keep `id` and add `personSourceValue`.** This means two ids again, and puts the FHIR id into the research layer.

## Consequences

- One constraint covers each OMOP label. A transform run that would write a row twice fails rather than duplicating it.
- NLQ, the timeline route and a CDM export find every person and event under one name.
- The transform depends on APOC (`apoc.util.md5`). Every Neo4j we run has it: Compose, the Azure deployment (`graphrag-deploy.yml`), and the CI Neo4j in `e2e.yml` and `nightly.yml`.
- **The derived id is not a pseudonym.** Anyone who knows a FHIR id can compute it. Within the hub this exposes nothing new: an SPE extract carries the Patient node anyway. Study pseudonyms stay `ResearchPseudonym` per study.
- The patient route's `omopId` becomes a number, and its mock fixture follows.
- On Azure the rows change on the next transform run. The migration is part of that run and needs no separate step.

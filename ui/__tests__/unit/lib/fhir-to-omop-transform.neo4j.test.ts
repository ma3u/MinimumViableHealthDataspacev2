/**
 * neo4j/fhir-to-omop-transform.cypher against a real Neo4j, inside one
 * transaction that is rolled back, so the graph is left as it was.
 *
 * The FHIR layer reaches the transform in three shapes, and the test writes a
 * fictional record in each before running it:
 *
 * - the seeds under neo4j/: keyed by `resourceId` only, dates as Neo4j DATE
 *   and DATETIME values, `valueQuantity`, HAS_MEDICATION_REQUEST;
 * - scripts/load_fhir_neo4j.py: keyed by `id`, dates as strings;
 * - scripts/generate-graph-seed.py: OMOP rows already written, keyed by the
 *   FHIR id (`visitId`, `conditionId`), without a MAPPED_TO.
 *
 * Skipped unless OMOP_TRANSFORM_IT_BOLT points at a Neo4j (an empty one will
 * do; a seeded one also exercises the rest of the graph):
 *
 *   OMOP_TRANSFORM_IT_BOLT=bolt://localhost:7687 npx vitest run __tests__/unit/lib/fhir-to-omop-transform.neo4j.test.ts
 *
 * With fhir-document-import.neo4j.test.ts in the same run, pass
 * --no-file-parallelism: both hold one long transaction over the same graph,
 * and Neo4j answers two of them in parallel with a deadlock.
 */
import neo4j, { type Transaction } from "neo4j-driver";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { omopTransformStatements } from "../../fixtures/omop-transform";

const BOLT = process.env.OMOP_TRANSFORM_IT_BOLT;

interface Changes {
  nodesCreated: number;
  nodesDeleted: number;
  relationshipsCreated: number;
  relationshipsDeleted: number;
}

const FIXTURES = `
MERGE (seed:Patient {resourceId: 'it-omop-seed'})
  ON CREATE SET seed.name = 'Testperson Seed', seed.gender = 'female',
                seed.birthDate = date('1971-05-02')
MERGE (enc:Encounter {resourceId: 'it-omop-seed-enc'})
  ON CREATE SET enc.class = 'AMB', enc.date = datetime('2024-03-04T09:30:00Z')
MERGE (seed)-[:HAS_ENCOUNTER]->(enc)
MERGE (cond:Condition {resourceId: 'it-omop-seed-cond'})
  ON CREATE SET cond.code = '44054006', cond.display = 'Type 2 diabetes mellitus',
                cond.onsetDate = date('2023-06-15')
MERGE (seed)-[:HAS_CONDITION]->(cond)
MERGE (obs:Observation {resourceId: 'it-omop-seed-obs'})
  ON CREATE SET obs.code = '4548-4', obs.display = 'HbA1c', obs.category = 'laboratory',
                obs.valueQuantity = 6.4, obs.valueUnit = '%',
                obs.effectiveDate = date('2024-09-12')
MERGE (seed)-[:HAS_OBSERVATION]->(obs)
MERGE (med:MedicationRequest {resourceId: 'it-omop-seed-med'})
  ON CREATE SET med.medicationCode = '860975', med.display = 'Metformin 500mg',
                med.date = datetime('2024-03-04T10:00:00Z')
MERGE (seed)-[:HAS_MEDICATION_REQUEST]->(med)
MERGE (proc:Procedure {resourceId: 'it-omop-seed-proc'})
  ON CREATE SET proc.code = '73761001', proc.display = 'Colonoscopy',
                proc.performedStart = localdatetime('2024-04-05T08:00:00')
MERGE (seed)-[:HAS_PROCEDURE]->(proc)

MERGE (loader:Patient {id: 'it-omop-loader'})
  ON CREATE SET loader.name = 'Testperson Loader', loader.gender = 'male',
                loader.birthDate = '1980-01-01'
MERGE (lobs:Observation {id: 'it-omop-loader-obs'})
  ON CREATE SET lobs.code = '2339-0', lobs.display = 'Glucose', lobs.category = '',
                lobs.value = '5.5', lobs.unit = 'mmol/L',
                lobs.dateTime = '2024-02-03T10:00:00Z'
MERGE (loader)-[:HAS_OBSERVATION]->(lobs)
MERGE (lmed:MedicationRequest {id: 'it-omop-loader-med'})
  ON CREATE SET lmed.code = '197361', lmed.display = 'Amlodipine 5mg',
                lmed.date = '2024-02-04T11:00:00Z'
MERGE (loader)-[:HAS_MEDICATION]->(lmed)

MERGE (out:Patient:OptedOut {resourceId: 'it-omop-optedout'})
  ON CREATE SET out.name = 'Testperson Opted Out', out.gender = 'male',
                out.birthDate = date('1965-04-12')
MERGE (outc:Condition:OptedOut {resourceId: 'it-omop-optedout-cond'})
  ON CREATE SET outc.code = '195967001', outc.display = 'Asthma',
                outc.onsetDate = '2022-02-02'
MERGE (out)-[:HAS_CONDITION]->(outc)

MERGE (gen:Patient {id: 'it-omop-gen'})
  ON CREATE SET gen.name = 'Testperson Generator', gen.gender = 'female',
                gen.birthDate = '1990-07-22'
MERGE (gop:OMOPPerson {personId: -990001})
  ON CREATE SET gop.name = 'OMOP Person -990001', gop.yearOfBirth = 1990
MERGE (gen)-[:MAPPED_TO]->(gop)
MERGE (genc:Encounter {id: 'it-omop-gen-enc'})
  ON CREATE SET genc.class = 'ambulatory', genc.date = '2025-01-10'
MERGE (gen)-[:HAS_ENCOUNTER]->(genc)
MERGE (gvo:OMOPVisitOccurrence {visitId: 'it-omop-gen-enc'})
  ON CREATE SET gvo.name = 'Visit it-omop-gen-enc', gvo.visitConceptId = 9202
MERGE (gop)-[:HAS_VISIT_OCCURRENCE]->(gvo)
MERGE (gcond:Condition {id: 'it-omop-gen-cond'})
  ON CREATE SET gcond.code = '38341003', gcond.display = 'Hypertension',
                gcond.onsetDate = '2024-11-01'
MERGE (gen)-[:HAS_CONDITION]->(gcond)
MERGE (gco:OMOPConditionOccurrence {conditionId: 'it-omop-gen-cond'})
  ON CREATE SET gco.name = 'OMOP Hypertension', gco.conditionConceptId = 38341003
MERGE (gop)-[:HAS_CONDITION_OCCURRENCE]->(gco)
`;

describe.skipIf(!BOLT)("neo4j/fhir-to-omop-transform.cypher on Neo4j", () => {
  const driver = neo4j.driver(
    BOLT ?? "bolt://localhost:7687",
    neo4j.auth.basic(
      process.env.NEO4J_USER ?? "neo4j",
      process.env.NEO4J_PASSWORD ?? "healthdataspace",
    ),
    { disableLosslessIntegers: true },
  );
  const session = driver.session();
  let tx: Transaction;
  let first: Changes;
  let second: Changes;

  const runTransform = async (): Promise<Changes> => {
    const sum: Changes = {
      nodesCreated: 0,
      nodesDeleted: 0,
      relationshipsCreated: 0,
      relationshipsDeleted: 0,
    };
    for (const statement of omopTransformStatements()) {
      const updates = (await tx.run(statement)).summary.counters.updates();
      for (const k of Object.keys(sum) as (keyof Changes)[]) {
        sum[k] += updates[k];
      }
    }
    return sum;
  };
  const one = async (q: string, p: Record<string, unknown> = {}) =>
    (await tx.run(q, p)).records[0]?.toObject();

  beforeAll(async () => {
    tx = session.beginTransaction();
    await tx.run(FIXTURES);
    first = await runTransform();
    second = await runTransform();
  });

  afterAll(async () => {
    await tx.rollback();
    await session.close();
    await driver.close();
  });

  it("maps a seeded patient keyed by resourceId only, never on a null id", async () => {
    const person = await one(
      `MATCH (:Patient {resourceId: 'it-omop-seed'})-[:MAPPED_TO]->(op:OMOPPerson)
       RETURN op.id AS id, op.yearOfBirth AS yearOfBirth,
              op.genderConceptId AS gender, op.name AS name`,
    );
    expect(person).toEqual({
      id: "omop-person-it-omop-seed",
      yearOfBirth: 1971,
      gender: 8532,
      name: "OMOP person p-seed",
    });
    const keyless = await one(
      `MATCH (op:OMOPPerson) WHERE op.id IS NULL AND op.personId IS NULL
       RETURN count(op) AS n`,
    );
    expect(keyless).toEqual({ n: 0 });
  });

  it("reads Neo4j DATE, DATETIME and LOCALDATETIME values as YYYY-MM-DD", async () => {
    const dates = await one(
      `MATCH (op:OMOPPerson {id: 'omop-person-it-omop-seed'})
       MATCH (op)-[:HAS_VISIT]->(v:OMOPVisitOccurrence)
       MATCH (op)-[:HAS_CONDITION_OCCURRENCE]->(c:OMOPConditionOccurrence)
       MATCH (op)-[:HAS_MEASUREMENT]->(m:OMOPMeasurement)
       MATCH (op)-[:HAS_DRUG_EXPOSURE]->(d:OMOPDrugExposure)
       MATCH (op)-[:HAS_PROCEDURE_OCCURRENCE]->(pr:OMOPProcedureOccurrence)
       RETURN v.id AS visit, v.visitStartDate AS visitStart,
              c.conditionStartDate AS conditionStart,
              m.measurementDate AS measured, m.valueAsNumber AS value, m.unit AS unit,
              d.drugExposureStart AS drugStart, d.drugSourceValue AS drug,
              pr.procedureDate AS procedureDate`,
    );
    expect(dates).toEqual({
      visit: "omop-visit-it-omop-seed-enc",
      visitStart: "2024-03-04",
      conditionStart: "2023-06-15",
      measured: "2024-09-12",
      value: 6.4,
      unit: "%",
      drugStart: "2024-03-04",
      drug: "860975",
      procedureDate: "2024-04-05",
    });
  });

  it("maps the loader's shape, keyed by id with string dates", async () => {
    const loader = await one(
      `MATCH (:Patient {id: 'it-omop-loader'})-[:MAPPED_TO]->(op:OMOPPerson)
       MATCH (op)-[:HAS_MEASUREMENT]->(m:OMOPMeasurement)
       MATCH (op)-[:HAS_DRUG_EXPOSURE]->(d:OMOPDrugExposure)
       RETURN op.id AS id, op.yearOfBirth AS yearOfBirth,
              m.measurementDate AS measured, m.valueAsNumber AS value,
              d.drugExposureStart AS drugStart`,
    );
    expect(loader).toEqual({
      id: "omop-person-it-omop-loader",
      yearOfBirth: 1980,
      measured: "2024-02-03",
      value: 5.5,
      drugStart: "2024-02-04",
    });
  });

  it("adopts the rows the graph seed already wrote rather than writing them twice", async () => {
    const adopted = await one(
      `MATCH (:Encounter {id: 'it-omop-gen-enc'})-[:MAPPED_TO]->(v:OMOPVisitOccurrence)
       MATCH (:Condition {id: 'it-omop-gen-cond'})-[:MAPPED_TO]->(c:OMOPConditionOccurrence)
       RETURN collect(DISTINCT v.visitId) AS visits,
              collect(DISTINCT c.conditionId) AS conditions`,
    );
    expect(adopted).toEqual({
      visits: ["it-omop-gen-enc"],
      conditions: ["it-omop-gen-cond"],
    });
    const twice = await one(
      `MATCH (n) WHERE n.id IN ['omop-visit-it-omop-gen-enc', 'omop-cond-it-omop-gen-cond']
       RETURN count(n) AS n`,
    );
    expect(twice).toEqual({ n: 0 });
  });

  it("keeps an opted-out person's OMOP rows out of secondary use (Art. 71, ADR-062)", async () => {
    const rows = await one(
      `MATCH (:Patient {resourceId: 'it-omop-optedout'})-[:MAPPED_TO]->(op:OMOPPerson)
       MATCH (op)-[:HAS_CONDITION_OCCURRENCE]->(c:OMOPConditionOccurrence)
       RETURN op:OptedOut AS person, c:OptedOut AS condition`,
    );
    expect(rows).toEqual({ person: true, condition: true });
  });

  it("is idempotent: a second run creates and deletes nothing", () => {
    // Eleven for the fixtures, more on a seeded graph never transformed.
    expect(first.nodesCreated).toBeGreaterThanOrEqual(11);
    expect(second).toEqual({
      nodesCreated: 0,
      nodesDeleted: 0,
      relationshipsCreated: 0,
      relationshipsDeleted: 0,
    });
  });
});

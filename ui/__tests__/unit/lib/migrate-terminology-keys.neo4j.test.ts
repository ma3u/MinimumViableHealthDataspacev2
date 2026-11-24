// @vitest-environment node
/**
 * neo4j/migrate-terminology-keys.cypher against a real Neo4j with APOC
 * (#1215), inside one transaction that is rolled back, so the graph is left
 * as it was.
 *
 * The fixtures are what the loader and seed-study-results.cypher left before
 * they merged on the constrained key: a LoincCode, a SnomedConcept and an
 * RxNormConcept keyed by `code` only beside a keyed twin (the SNOMED CT and
 * RxNorm twins keyed by an integer, as the graph generator writes them), an
 * Observation coded by both twins, and two code-only LOINC nodes of a code
 * no keyed node has. The migration runs twice: the second run must change
 * nothing.
 *
 * Skipped unless TERMINOLOGY_KEYS_IT_BOLT points at a Neo4j with APOC. The
 * three uniqueness constraints of init-schema.cypher are created first (IF
 * NOT EXISTS, outside the transaction). Never point it at a graph you care
 * about without reading the file: the rollback keeps the data, the
 * constraints stay.
 *
 * A throwaway Neo4j with the compose stack's image and local password,
 * on another port than the compose graph:
 *
 *   docker run -d --name tmp-neo4j -p 127.0.0.1:17687:7687 \
 *     -e NEO4J_AUTH=neo4j/healthdataspace -e 'NEO4J_PLUGINS=["apoc"]' \
 *     neo4j:5.26.33-community
 *   TERMINOLOGY_KEYS_IT_BOLT=bolt://localhost:17687 \
 *     npx vitest run __tests__/unit/lib/migrate-terminology-keys.neo4j.test.ts
 */
import { readFileSync } from "fs";
import path from "path";
import neo4j, { type Transaction } from "neo4j-driver";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const BOLT = process.env.TERMINOLOGY_KEYS_IT_BOLT;

const MIGRATION = path.resolve(
  __dirname,
  "../../../../neo4j/migrate-terminology-keys.cypher",
);

/** The statements of the migration as cypher-shell runs them. */
function statements(): string[] {
  return readFileSync(MIGRATION, "utf8")
    .split("\n")
    .filter((l) => !l.trim().startsWith("//"))
    .join("\n")
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
}

const CONSTRAINTS = [
  "CREATE CONSTRAINT snomed_concept_id IF NOT EXISTS FOR (sc:SnomedConcept) REQUIRE sc.conceptId IS UNIQUE",
  "CREATE CONSTRAINT loinc_code IF NOT EXISTS FOR (lc:LoincCode) REQUIRE lc.loincNumber IS UNIQUE",
  "CREATE CONSTRAINT rxnorm_rxcui IF NOT EXISTS FOR (rx:RxNormConcept) REQUIRE rx.rxcui IS UNIQUE",
];

// Codes no seed writes, so the assertions see the fixtures only.
const FIXTURES = `
CREATE (keyedLoinc:LoincCode {loincNumber: '91215-1', name: 'Keyed twin',
                              longCommonName: 'Keyed twin, long name'})
CREATE (looseLoinc:LoincCode {code: '91215-1', display: 'Code-only twin',
                              system: 'http://loinc.org'})
CREATE (both:Observation {resourceId: 'it-1215-obs-both', code: '91215-1'})
CREATE (both)-[:CODED_BY]->(keyedLoinc)
CREATE (both)-[:CODED_BY]->(looseLoinc)
CREATE (onlyLoose:Observation {resourceId: 'it-1215-obs-loose', code: '91215-1'})
CREATE (onlyLoose)-[:CODED_BY]->(looseLoinc)
CREATE (measurement:OMOPMeasurement {measurementId: -91215})
CREATE (measurement)-[:STANDARD_CONCEPT]->(looseLoinc)

CREATE (lonelyA:LoincCode {code: '91215-2', display: 'No keyed twin'})
CREATE (lonelyB:LoincCode {code: '91215-2', display: 'No keyed twin, second copy'})
CREATE (oA:Observation {resourceId: 'it-1215-obs-a', code: '91215-2'})
CREATE (oB:Observation {resourceId: 'it-1215-obs-b', code: '91215-2'})
CREATE (oA)-[:CODED_BY]->(lonelyA)
CREATE (oB)-[:CODED_BY]->(lonelyB)

CREATE (keyedSnomed:SnomedConcept {conceptId: 9912150001, name: 'Keyed by an integer'})
CREATE (looseSnomed:SnomedConcept {code: '9912150001', name: 'Loader copy',
                                   description: 'Loader copy'})
CREATE (cond:Condition {id: 'it-1215-cond', code: '9912150001'})
CREATE (cond)-[:CODED_BY]->(looseSnomed)
CREATE (proc:Procedure {id: 'it-1215-proc', code: '9912150001'})
CREATE (proc)-[:CODED_BY]->(keyedSnomed)

CREATE (keyedRx:RxNormConcept {rxcui: 991215, display: 'Keyed by an integer'})
CREATE (looseRx:RxNormConcept {code: '991215', name: 'Loader copy'})
CREATE (med:MedicationRequest {id: 'it-1215-med', code: '991215'})
CREATE (med)-[:CODED_BY]->(looseRx)
`;

const FIXTURE_CODES = ["91215-1", "91215-2", "9912150001", "991215"];

describe.skipIf(!BOLT)(
  "neo4j/migrate-terminology-keys.cypher on Neo4j (#1215)",
  () => {
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
    let edgesBefore: string[];
    let nodesBefore: number;
    let afterFirst: unknown[];
    let afterSecond: unknown[];

    /** Every relationship of a fixture's terminology node, as text. */
    const edges = async () =>
      (
        await tx.run(
          `MATCH (x)-[r]->(t)
           WHERE (t:LoincCode OR t:SnomedConcept OR t:RxNormConcept)
             AND toString(coalesce(t.loincNumber, t.conceptId, t.rxcui, t.code)) IN $codes
           RETURN DISTINCT coalesce(x.resourceId, x.id, toString(x.measurementId))
                  + ' -' + type(r) + '-> '
                  + toString(coalesce(t.loincNumber, t.conceptId, t.rxcui, t.code)) AS edge
           ORDER BY edge`,
          { codes: FIXTURE_CODES },
        )
      ).records.map((r) => r.get("edge") as string);

    /** The fixtures' terminology nodes: count, and every node and edge. */
    const MATCH_FIXTURES = `MATCH (t) WHERE (t:LoincCode OR t:SnomedConcept OR t:RxNormConcept)
         AND toString(coalesce(t.loincNumber, t.conceptId, t.rxcui, t.code)) IN $codes`;
    const fixtureNodes = async () =>
      (
        await tx.run(`${MATCH_FIXTURES} RETURN count(t) AS n`, {
          codes: FIXTURE_CODES,
        })
      ).records[0].get("n") as number;
    /**
     * Each node with its element id, labels and properties, and its edges.
     * The counters of a query do not include what an APOC procedure writes,
     * so a second run is shown to change nothing by comparing these.
     */
    const snapshot = async () =>
      (
        await tx.run(
          `${MATCH_FIXTURES}
           RETURN elementId(t) AS id, labels(t) AS labels, properties(t) AS props,
                  [(x)-[r]->(t) | elementId(x) + ' ' + type(r) + ' ' + elementId(r)] AS edges
           ORDER BY id`,
          { codes: FIXTURE_CODES },
        )
      ).records.map((r) => ({
        ...r.toObject(),
        edges: [...(r.get("edges") as string[])].sort(),
      }));

    const migrate = async () => {
      for (const statement of statements()) await tx.run(statement);
    };
    const rows = async (q: string, p: Record<string, unknown> = {}) =>
      (await tx.run(q, p)).records.map((r) => r.toObject());

    beforeAll(async () => {
      for (const c of CONSTRAINTS) await session.run(c);
      tx = session.beginTransaction();
      await tx.run(FIXTURES);
      edgesBefore = await edges();
      nodesBefore = await fixtureNodes();
      await migrate();
      afterFirst = await snapshot();
      await migrate();
      afterSecond = await snapshot();
    }, 60_000);

    afterAll(async () => {
      await tx?.rollback();
      await session.close();
      await driver.close();
    });

    it("starts from the split the loader left", () => {
      expect(edgesBefore).toEqual([
        "-91215 -STANDARD_CONCEPT-> 91215-1",
        "it-1215-cond -CODED_BY-> 9912150001",
        "it-1215-med -CODED_BY-> 991215",
        "it-1215-obs-a -CODED_BY-> 91215-2",
        "it-1215-obs-b -CODED_BY-> 91215-2",
        "it-1215-obs-both -CODED_BY-> 91215-1",
        "it-1215-obs-loose -CODED_BY-> 91215-1",
        "it-1215-proc -CODED_BY-> 9912150001",
      ]);
    });

    it("leaves no terminology node without its key", async () => {
      const [left] = await rows(
        `RETURN COUNT { MATCH (n:LoincCode) WHERE n.loincNumber IS NULL } AS loinc,
                COUNT { MATCH (n:SnomedConcept) WHERE n.conceptId IS NULL } AS snomed,
                COUNT { MATCH (n:RxNormConcept) WHERE n.rxcui IS NULL } AS rxnorm`,
      );
      expect(left).toEqual({ loinc: 0, snomed: 0, rxnorm: 0 });
    });

    it("keeps one node per concept", async () => {
      const counts = await rows(
        `UNWIND $codes AS code
         RETURN code, COUNT {
           MATCH (t) WHERE (t:LoincCode OR t:SnomedConcept OR t:RxNormConcept)
             AND toString(coalesce(t.loincNumber, t.conceptId, t.rxcui, t.code)) = code
         } AS nodes
         ORDER BY code`,
        { codes: FIXTURE_CODES },
      );
      expect(counts).toEqual(
        [...FIXTURE_CODES].sort().map((code) => ({ code, nodes: 1 })),
      );
    });

    it("moves every relationship to the keyed node, and doubles none", async () => {
      expect(await edges()).toEqual(edgesBefore);
      const [doubled] = await rows(
        `MATCH (x)-[r]->(t)
         WHERE (t:LoincCode OR t:SnomedConcept OR t:RxNormConcept)
           AND toString(coalesce(t.loincNumber, t.conceptId, t.rxcui)) IN $codes
         WITH x, type(r) AS type, t, count(r) AS n WHERE n > 1
         RETURN count(*) AS doubled`,
        { codes: FIXTURE_CODES },
      );
      expect(doubled).toEqual({ doubled: 0 });
    });

    it("keeps the keyed twin's key and properties, and adds what only the copy had", async () => {
      const [loinc] = await rows(
        `MATCH (l:LoincCode {loincNumber: '91215-1'})
         RETURN l.name AS name, l.longCommonName AS longName,
                l.display AS display, l.code AS code, l.system AS system`,
      );
      expect(loinc).toEqual({
        name: "Keyed twin",
        longName: "Keyed twin, long name",
        display: "Code-only twin",
        code: "91215-1",
        system: "http://loinc.org",
      });
      const [snomed] = await rows(
        `MATCH (s:SnomedConcept) WHERE s.conceptId IN [9912150001, '9912150001']
         RETURN s.conceptId AS conceptId, s.name AS name, s.code AS code`,
      );
      expect(snomed).toEqual({
        conceptId: 9912150001,
        name: "Keyed by an integer",
        code: "9912150001",
      });
      const [rx] = await rows(
        `MATCH (r:RxNormConcept) WHERE r.rxcui IN [991215, '991215']
         RETURN r.rxcui AS rxcui, r.display AS display, r.name AS name`,
      );
      expect(rx).toEqual({
        rxcui: 991215,
        display: "Keyed by an integer",
        name: "Loader copy",
      });
    });

    it("keys a code no keyed node has by that code", async () => {
      const [lonely] = await rows(
        `MATCH (l:LoincCode {loincNumber: '91215-2'})
         RETURN l.code AS code, COUNT { (l)<-[:CODED_BY]-() } AS coded`,
      );
      expect(lonely).toEqual({ code: "91215-2", coded: 2 });
    });

    it("removes the copies and creates nothing", async () => {
      expect(nodesBefore).toBe(8);
      expect(await fixtureNodes()).toBe(4);
      expect(afterFirst).toHaveLength(4);
    });

    it("changes nothing when it runs again", () => {
      expect(afterSecond).toEqual(afterFirst);
    });
  },
);

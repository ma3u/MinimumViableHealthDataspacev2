/**
 * #1218: the loader keeps an Observation's codings, a numeric value with its
 * UCUM code, and its components; the OMOP transform measures each component;
 * seed.sh converts a value an older loader stored as a string and fails a run
 * that leaves one.
 *
 * The loader's parsing is tested in scripts/test_load_fhir_neo4j.py, the FHIR
 * output in services/neo4j-proxy/__tests__/fhir-resource.test.ts, and the
 * transform against a real Neo4j in fhir-to-omop-transform.neo4j.test.ts.
 * These tests keep the files wired together.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "../../../..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf-8");

const seedSh = read("neo4j/seed.sh");
const migration = read("neo4j/migrate-observation-values.cypher");
const transform = read("neo4j/fhir-to-omop-transform.cypher");

describe("Observation fidelity wiring (#1218)", () => {
  it("seed.sh converts text values in both phases, after the key migration", () => {
    const runs = seedSh.match(
      /migrate-clinical-keys\.cypher[^\n]*\n\s*run_file "\$SEED_DIR"\/migrate-observation-values\.cypher/g,
    );
    expect(runs).toHaveLength(2);
  });

  it("fails a run that leaves a value stored as text", () => {
    expect(seedSh).toContain("Observation values stored as text");
    expect(seedSh).toContain("o.value IS :: STRING NOT NULL");
  });

  it("never asks `IS :: STRING` without NOT NULL, which NULL passes", () => {
    for (const text of [migration, seedSh]) {
      expect(text).not.toMatch(/o\.value IS :: STRING(?! NOT NULL)/);
    }
  });

  it("measures a panel per component, and not the panel itself", () => {
    expect(transform).toContain("4b. One OMOPMeasurement per component");
    expect(transform).toContain("'Observation/' + key + '/component/' + code");
    expect(transform).toMatch(
      /size\(coalesce\(o\.componentCodes, \[\]\)\) = 0\s+OR coalesce\(o\.value, o\.valueQuantity\) IS NOT NULL/,
    );
  });
});

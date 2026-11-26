/**
 * #1222 follow-up: init-schema.cypher makes resourceId unique on the six
 * clinical labels, but scripts/load_fhir_neo4j.py and
 * scripts/generate-graph-seed.py merged on `id` and never wrote it, so the
 * constraint covered none of their nodes. The graph seed also drew every
 * laboratory value from 3 to 200 with no unit. Both writers now key on
 * resourceId and the seed draws in the test's unit and range;
 * neo4j/migrate-clinical-keys.cypher repairs a graph loaded before and must
 * carry the generator's LOINC table unchanged.
 *
 * The migration itself ran against the compose graph (771 lab values
 * rescaled, a second run changed nothing); seed.sh fails a run that leaves a
 * node without its key (check_clinical_keys).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "../../../..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf-8");

const generator = read("scripts/generate-graph-seed.py");
const loader = read("scripts/load_fhir_neo4j.py");
const migration = read("neo4j/migrate-clinical-keys.cypher");
const seedSh = read("neo4j/seed.sh");

const LABELS = [
  "Patient",
  "Encounter",
  "Condition",
  "Observation",
  "MedicationRequest",
  "Procedure",
];

type Row = {
  code: string;
  name: string;
  unit: string;
  low: number;
  high: number;
  decimals: number;
};

function generatorLoinc(): Row[] {
  const block = generator.slice(
    generator.indexOf("LOINC = ["),
    generator.indexOf("LOINC_BY_CODE"),
  );
  return [
    ...block.matchAll(
      /\("([^"]+)", "([^"]+)", "([^"]+)", ([\d.]+), ([\d.]+), (\d)\)/g,
    ),
  ].map((m) => ({
    code: m[1],
    name: m[2],
    unit: m[3],
    low: Number(m[4]),
    high: Number(m[5]),
    decimals: Number(m[6]),
  }));
}

function migrationLoinc(): Row[] {
  return [
    ...migration.matchAll(
      /\{code: '([^']+)', name: '([^']+)', unit: '([^']+)', low: ([\d.]+), high: ([\d.]+), decimals: (\d)\}/g,
    ),
  ].map((m) => ({
    code: m[1],
    name: m[2],
    unit: m[3],
    low: Number(m[4]),
    high: Number(m[5]),
    decimals: Number(m[6]),
  }));
}

describe("clinical nodes keyed by resourceId (#1222)", () => {
  it.each(LABELS)("the Synthea loader writes resourceId on %s", (label) => {
    const re = new RegExp(
      `MERGE \\((\\w+):${label} \\{id: row\\.id\\}\\)\\nSET \\1\\.resourceId = row\\.id`,
    );
    expect(loader).toMatch(re);
  });

  it.each(LABELS)("the graph seed writes resourceId on %s", (label) => {
    const re = new RegExp(
      `MERGE \\((\\w+):${label} \\{\\{id: '([^']+)'\\}\\}\\)\\n\\s*SET \\1\\.resourceId = '\\2'`,
    );
    expect(generator).toMatch(re);
  });

  it("the migration keys all six labels and policies", () => {
    for (const label of LABELS) expect(migration).toContain(`'${label}'`);
    expect(migration).toContain("SET n.resourceId = n.id");
    expect(migration).toContain("SET pol.policyId = pol.id");
  });
});

describe("graph seed laboratory values (#1222)", () => {
  const rows = generatorLoinc();

  it("gives every LOINC code a unit and a range", () => {
    expect(rows).toHaveLength(40);
    for (const r of rows) {
      expect(r.unit).not.toBe("");
      expect(r.low).toBeLessThan(r.high);
    }
  });

  it("no longer draws every value from 3 to 200", () => {
    expect(generator).not.toContain("random.uniform(3.0, 200.0)");
    expect(generator).not.toContain("result',");
    expect(generator).toContain("o.unit = '{unit}'");
  });

  it("names 14937-7 urea nitrogen and 30313-1 arterial haemoglobin", () => {
    const byCode = Object.fromEntries(rows.map((r) => [r.code, r.name]));
    expect(byCode["14937-7"]).toMatch(/Urea Nitrogen/);
    expect(byCode["30313-1"]).toMatch(/Hemoglobin .*Arterial/);
    expect(byCode["3026-2"]).not.toMatch(/Free/);
  });

  it("the migration carries the generator's table unchanged", () => {
    expect(migrationLoinc()).toEqual(rows);
  });
});

describe("seed.sh runs the migration and checks it (#1222)", () => {
  it("runs it in both phases, after the dataset publishers", () => {
    const runs = seedSh.match(
      /run_file "\$SEED_DIR"\/migrate-clinical-keys\.cypher/g,
    );
    expect(runs).toHaveLength(2);
    expect(seedSh).toMatch(
      /migrate-dataset-publishers\.cypher[^\n]*\n\s*run_file "\$SEED_DIR"\/migrate-clinical-keys\.cypher/,
    );
  });

  it("fails a run that leaves a node without its key", () => {
    expect(seedSh).toContain("check_clinical_keys() {");
    expect(seedSh.match(/^\s*check_clinical_keys$/gm)).toHaveLength(2);
  });
});

/**
 * #1167: the OMOP layer holds OMOP standard concept ids, and the RxNorm codes
 * name the drug they are labelled with.
 *
 * neo4j/seed-omop-concept-ids.cypher maps SNOMED CT and RxNorm codes to OMOP
 * standard concepts (read from the OHDSI vocabulary service);
 * neo4j/migrate-rxnorm-codes.cypher corrects a graph loaded with the
 * generators' old RxCUIs. These tests keep the generators, the tables and
 * seed.sh in step.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "../../../..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf-8");

const conceptSeed = read("neo4j/seed-omop-concept-ids.cypher");
const migration = read("neo4j/migrate-rxnorm-codes.cypher");
const seedSh = read("neo4j/seed.sh");
const graphGenerator = read("scripts/generate-graph-seed.py");
const bundleGenerator = read("scripts/generate-fhir-bundles.py");
const syntheticSeed = read("neo4j/insert-synthetic-schema-data.cypher");

type Row = { code: string; omop: number; name: string };

/** The {code, omop, name} rows of the UNWIND after `heading`. */
function table(text: string, heading: string): Map<string, Row> {
  const start = text.indexOf(heading);
  expect(start, heading).toBeGreaterThan(-1);
  const body = text.slice(start, text.indexOf("] AS m", start));
  const rows = new Map<string, Row>();
  for (const m of body.matchAll(
    /\{code: '(\d+)', omop: (\d+), name: '((?:[^'\\]|\\.)*)'\}/g,
  )) {
    rows.set(m[1], { code: m[1], omop: Number(m[2]), name: m[3] });
  }
  return rows;
}

/** The (code, "label") pairs of a Python table such as RXNORM = [...]. */
function pythonTable(name: string): [string, string][] {
  const start = graphGenerator.indexOf(`${name} = [`);
  const body = graphGenerator.slice(
    start,
    graphGenerator.indexOf("\n]", start),
  );
  return [...body.matchAll(/\(\s*(\d+),\s*"([^"]+)"/g)].map((m) => [
    m[1],
    m[2],
  ]);
}

const CONDITIONS = table(conceptSeed, "// ── Conditions");
const DRUGS = table(conceptSeed, "// ── Drugs");

/** The ingredient a label names, in RxNorm's spelling. */
const RXNORM_SPELLING: Record<string, string> = {
  salbutamol: "albuterol",
  "budesonide/formoterol": "budesonide",
};
function ingredient(label: string): string {
  const first = label.toLowerCase().split(" ")[0];
  return RXNORM_SPELLING[first] ?? first;
}

describe("OMOP concept ids (#1167)", () => {
  it("maps every SNOMED CT code the graph generator writes", () => {
    const missing = pythonTable("SNOMED")
      .map(([code]) => code)
      .filter((code) => !CONDITIONS.has(code));
    expect(missing).toEqual([]);
  });

  it("maps every RxCUI of both generators to a drug that has the label's ingredient", () => {
    const bundleDrugs = [
      ...bundleGenerator.matchAll(
        /\{"code": "(\d+)", "display": "([^"]+)", "system": "http:\/\/www\.nlm\.nih\.gov\/research\/umls\/rxnorm"\}/g,
      ),
    ].map((m) => [m[1], m[2]] as [string, string]);
    expect(bundleDrugs.length).toBeGreaterThan(5);
    const wrong = [...pythonTable("RXNORM"), ...bundleDrugs]
      .filter(([code, label]) => {
        const row = DRUGS.get(code);
        return !row || !row.name.toLowerCase().includes(ingredient(label));
      })
      .map(([code, label]) => `${code} ${label}: ${DRUGS.get(code)?.name}`);
    expect(wrong).toEqual([]);
  });

  it("no OMOP concept id a seed writes directly is a code in the tables", () => {
    // The seed's step 3 reads a row without a source value as holding a code;
    // a real concept id that equals a code would be remapped.
    const direct = [
      ...syntheticSeed.matchAll(/(?:condition|drug)ConceptId = (\d+)/g),
    ].map((m) => m[1]);
    expect(direct.length).toBeGreaterThan(5);
    expect(direct.filter((id) => CONDITIONS.has(id) || DRUGS.has(id))).toEqual(
      [],
    );
  });

  it("CKD stage 3 is 443597, not stage 5's 443611", () => {
    expect(syntheticSeed).not.toMatch(/CKD Stage 3[^\n]*443611/);
    expect(CONDITIONS.get("433144002")?.omop).toBe(443597);
  });

  it("the generator leaves the concept id to the seed and keeps the source code", () => {
    expect(graphGenerator).toContain("co.conditionSourceValue = '{snomed_id}'");
    expect(graphGenerator).toContain("de.drugSourceValue = '{rxcui}'");
    expect(graphGenerator).not.toMatch(/ConceptId = \{(snomed_id|rxcui)\}/);
  });
});

describe("RxNorm recode migration (#1167)", () => {
  const recodes = [
    ...migration.matchAll(
      /\{old: '(\d+)', new: '(\d+)', label: '((?:[^'\\]|\\.)*)'/g,
    ),
  ].map((m) => ({ old: m[1], next: m[2], label: m[3] }));

  it("recodes by code and label together, never by code alone", () => {
    expect(recodes.length).toBeGreaterThan(25);
    expect(migration).toContain(
      "AND toLower(coalesce(mr.display, mr.name, '')) = m.label",
    );
    expect(migration).toContain("= 'omop ' + m.label");
    expect(migration).not.toMatch(/\bCREATE \(/);
  });

  it("every new code is in the drug table and has the label's ingredient", () => {
    const wrong = recodes
      .filter(
        ({ next, label }) =>
          !DRUGS.get(next)?.name.toLowerCase().includes(ingredient(label)),
      )
      .map(({ next, label }) => `${next} ${label}`);
    expect(wrong).toEqual([]);
  });

  it("the generator writes the new codes, not the old ones", () => {
    const written = new Set(pythonTable("RXNORM").map(([code]) => code));
    const generatorRecodes = recodes.filter(({ label }) =>
      pythonTable("RXNORM").some(([, l]) => l.toLowerCase() === label),
    );
    expect(generatorRecodes.length).toBeGreaterThan(20);
    for (const { old, next, label } of generatorRecodes) {
      expect(written.has(next), `${label} ${next}`).toBe(true);
      const stillOld = pythonTable("RXNORM").some(
        ([code, l]) => code === old && l.toLowerCase() === label,
      );
      expect(stillOld, `${label} ${old}`).toBe(false);
    }
  });

  it("seed.sh runs the migration, then the concept seed, in both phases", () => {
    const MIG = 'run_file "$SEED_DIR"/migrate-rxnorm-codes.cypher';
    const SEED = 'run_file "$SEED_DIR"/seed-omop-concept-ids.cypher';
    expect(seedSh.split(MIG).length - 1).toBe(2);
    expect(seedSh.split(SEED).length - 1).toBe(2);
    const transform = seedSh.indexOf(
      'run_file "$SEED_DIR"/fhir-to-omop-transform.cypher',
    );
    const lastSeed = seedSh.lastIndexOf(SEED);
    expect(seedSh.lastIndexOf(MIG)).toBeLessThan(lastSeed);
    expect(seedSh.indexOf(MIG)).toBeLessThan(seedSh.indexOf(SEED));
    expect(lastSeed).toBeGreaterThan(transform);
  });
});

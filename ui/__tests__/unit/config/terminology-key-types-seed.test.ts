/**
 * #1231: a uniqueness constraint treats 415749005 and "415749005" as two
 * values, so a SNOMED CT or RxNorm concept written once as an integer and
 * once as a string existed twice (8 SNOMED CT and 6 RxNorm concepts on the
 * compose graph, 2026-11-25). The key is a string, as FHIR Coding.code is and
 * as LoincCode.loincNumber and ICD10Code.code already are.
 *
 * These tests fail when a seed, a migration or a generator writes or matches
 * the key as a number again. neo4j/migrate-terminology-key-types.cypher
 * repairs a graph written before; it ran twice on the compose graph (151
 * concepts to 137, every coded record still coded, then nothing), and
 * seed.sh fails a run that leaves a key that is not a string.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "../../../..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf-8");

const cypherFiles = readdirSync(join(ROOT, "neo4j"))
  .filter((f) => f.endsWith(".cypher"))
  .map((f) => `neo4j/${f}`);
const generators = readdirSync(join(ROOT, "scripts"))
  .filter((f) => f.endsWith(".py"))
  .map((f) => `scripts/${f}`);

/** A key literal or expression that is not a string. */
const INTEGER_KEY =
  /(SnomedConcept|RxNormConcept) \{\{?(conceptId|rxcui): (?:\d+|\{\w+\}|toInteger\([^)]*\))\}/g;

describe("terminology keys are strings (#1231)", () => {
  it.each([...cypherFiles, ...generators])(
    "%s writes and matches no integer key",
    (file) => {
      const hits = [...read(file).matchAll(INTEGER_KEY)].map((m) => m[0]);
      expect(hits).toEqual([]);
    },
  );

  it("the pattern catches what the seeds used to write", () => {
    const old = [
      "MERGE (scDM:SnomedConcept {conceptId: 44054006})",
      "MERGE (s:SnomedConcept {{conceptId: {cid}}})",
      "MERGE (n:RxNormConcept {rxcui: toInteger(m.new)})",
    ];
    for (const line of old)
      expect(line).toMatch(new RegExp(INTEGER_KEY.source));
    expect("MERGE (s:SnomedConcept {{conceptId: '{cid}'}})").not.toMatch(
      new RegExp(INTEGER_KEY.source),
    );
  });

  it("no lookup tries the integer form any more", () => {
    for (const file of [
      "scripts/load_fhir_neo4j.py",
      "neo4j/migrate-terminology-keys.cypher",
    ]) {
      expect(read(file)).not.toMatch(
        /(conceptId|rxcui) IN \[[^\]]*toInteger\(/,
      );
    }
  });
});

describe("the migration and the seed check (#1231)", () => {
  const migration = read("neo4j/migrate-terminology-key-types.cypher");
  const seedSh = read("neo4j/seed.sh");

  it("merges integer twins into the string node, then converts the rest", () => {
    for (const [label, key] of [
      ["SnomedConcept", "conceptId"],
      ["RxNormConcept", "rxcui"],
    ]) {
      expect(migration).toContain(
        `MATCH (twin:${label} {${key}: toString(n.${key})})`,
      );
      expect(migration).toContain(`SET n.${key} = toString(n.${key})`);
    }
    expect(migration).toContain("apoc.refactor.mergeNodes([twin, n]");
  });

  it("runs in both phases, right after the key migration", () => {
    const runs = seedSh.match(
      /migrate-terminology-keys\.cypher[^\n]*\n(?:#[^\n]*\n)*\s*run_file "\$SEED_DIR"\/migrate-terminology-key-types\.cypher/g,
    );
    expect(runs).toHaveLength(2);
  });

  it("fails a run that leaves a key that is not a string", () => {
    expect(seedSh).toContain("terminology keys that are not strings");
    expect(seedSh).toMatch(/NOT n\.conceptId IS :: STRING/);
    expect(seedSh).toMatch(/NOT n\.rxcui IS :: STRING/);
  });
});

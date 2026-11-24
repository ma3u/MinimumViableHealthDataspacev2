/**
 * #514: every HealthDataset names its publisher through
 * (d)-[:PUBLISHED_BY]->(:Participant). The UI's /api/catalog matches only a
 * Participant target, the proxy's HealthDCAT-AP output takes any; the
 * HealthDCAT-AP registration seeds own their dataset through
 * (:Organization)-[:OWNS_DATASET]-> and wrote no PUBLISHED_BY, so the SPE-2
 * dataset showed no publisher in either catalogue.
 *
 * These tests keep the seeds on one target. The seed run itself fails when a
 * dataset is left without a publisher (check_dataset_publishers in seed.sh),
 * and E2E runs seed.sh against a real Neo4j.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "../../../..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf-8");

const seedSh = read("neo4j/seed.sh");
const migration = read("neo4j/migrate-dataset-publishers.cypher");
const cypherSeeds = readdirSync(join(ROOT, "neo4j"))
  .filter((f) => f.endsWith(".cypher"))
  .map((f) => ({ file: f, text: read(`neo4j/${f}`) }));

const MIGRATION_RUN = 'run_file "$SEED_DIR"/migrate-dataset-publishers.cypher';
const R8_RUN = 'run_file "$SEED_DIR"/register-healthdcat-ap-r8.cypher';

describe("dataset publishers (#514)", () => {
  it("the migration links an Organization's dataset to the Participant it stands for", () => {
    expect(migration).toMatch(
      /MATCH \(o:Organization\)-\[:OWNS_DATASET\]->\(d:HealthDataset\)/,
    );
    expect(migration).toContain(
      "MATCH (p:Participant {participantId: o.participantDid})",
    );
    expect(migration).toContain("MERGE (d)-[:PUBLISHED_BY]->(p)");
    expect(migration).not.toMatch(/\bCREATE\b/);
  });

  it("seed.sh runs the migration after the last dataset seed, in both phases", () => {
    const runs = seedSh.split(MIGRATION_RUN).length - 1;
    expect(runs).toBe(2);
    let from = 0;
    for (let i = 0; i < 2; i++) {
      const r8 = seedSh.indexOf(R8_RUN, from);
      const mig = seedSh.indexOf(MIGRATION_RUN, from);
      expect(r8).toBeGreaterThan(-1);
      expect(mig).toBeGreaterThan(r8);
      from = mig + 1;
    }
  });

  it("seed.sh fails a run that leaves a dataset without a publisher", () => {
    expect(seedSh).toMatch(/check_dataset_publishers\(\) \{/);
    expect(seedSh).toContain(
      "NOT EXISTS { MATCH (d)-[:PUBLISHED_BY]->(:Participant) }",
    );
    // once per phase, after the terminology check and before finish
    expect(seedSh.match(/^\s*check_dataset_publishers$/gm)).toHaveLength(2);
  });

  it("no seed points a dataset's PUBLISHED_BY at an Organization", () => {
    const offenders = cypherSeeds
      .filter(({ text }) => /PUBLISHED_BY\]->\(\w*:Organization/.test(text))
      .map(({ file }) => file);
    expect(offenders).toEqual([]);
  });
});

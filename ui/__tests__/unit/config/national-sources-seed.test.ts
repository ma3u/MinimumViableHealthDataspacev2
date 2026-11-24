/**
 * ADR-094, #1123: national health data stays at the source; the hub holds its
 * descriptions and the figures it published. neo4j/seed-national-sources.cypher
 * writes two fictional catalogue entries published by MedReg DE and one
 * PublishedAggregate; ui/public/mock/catalog.json carries the same entries for
 * the static build. These tests keep the seed, the schema and the mock in step.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "../../../..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf-8");

const seed = read("neo4j/seed-national-sources.cypher");
const seedSh = read("neo4j/seed.sh");
const schema = read("neo4j/init-schema.cypher");
const catalog = JSON.parse(read("ui/public/mock/catalog.json")) as Record<
  string,
  unknown
>[];

const NATIONAL = [
  "dataset:medreg:national-claims-epa-research",
  "dataset:medreg:university-hospital-fhir",
];

/** Real bodies the fictional analogues stand for: never in the default build. */
const REAL_NAMES = [
  "FDZ",
  "Forschungsdatenzentrum",
  "BfArM",
  "Medizininformatik",
  "Medical Informatics Initiative",
  "MII",
  "gematik",
  "Forschungsdatenportal",
];

describe("seed-national-sources.cypher", () => {
  it("is idempotent: MERGE only, no bare CREATE", () => {
    expect(seed).not.toMatch(/^\s*CREATE\s+\(/m);
    expect(seed).toMatch(/MERGE \(d:HealthDataset \{datasetId: row\.id\}\)/);
    expect(seed).toContain("ON CREATE SET");
    expect(seed).toContain("ON MATCH SET");
  });

  it("describes both datasets, fictional, SPE only and without download", () => {
    for (const id of NATIONAL) expect(seed).toContain(`id: '${id}'`);
    expect(seed).toContain("d.fictional = true");
    expect(seed).toContain("d.rowLevelDownload = false");
    expect(seed).toContain("secure processing environment only (Art. 73)");
    expect(seed).not.toMatch(/downloadURL\s*=/);
  });

  it("publishes them through the Participant both catalogue readers match (#514)", () => {
    expect(seed).toContain(
      "MATCH (medreg:Participant {participantId: 'did:web:medreg.de:hdab'})",
    );
    expect(seed).toContain("MERGE (d)-[:PUBLISHED_BY]->(medreg)");
    expect(seed).not.toMatch(/PUBLISHED_BY\]->\(\w*:Organization/);
  });

  it("links one fictional PublishedAggregate with its source, licence, date and rule", () => {
    expect(seed).toMatch(/MERGE \(pa:PublishedAggregate \{aggregateId: /);
    for (const p of [
      "pa.sourceUrl",
      "pa.licence",
      "pa.releaseDate",
      "pa.smallCountRule",
      "pa.value",
      "pa.fictional = true",
    ]) {
      expect(seed, p).toContain(p);
    }
    // A reserved domain (RFC 2606), not a real publication.
    expect(seed).toMatch(/pa\.sourceUrl = 'https:\/\/[\w-]+\.example\//);
    expect(seed).toContain("MERGE (d)-[:HAS_PUBLISHED_AGGREGATE]->(pa)");
  });

  it("names no real national body", () => {
    for (const name of REAL_NAMES) {
      expect(seed, name).not.toMatch(new RegExp(`\\b${name}\\b`));
    }
  });

  it("runs before the Release 8 seed, in the full and the demo pipeline", () => {
    for (const marker of [
      'run_file "$SEED_DIR"/seed-national-sources.cypher',
    ]) {
      const at = [
        ...seedSh.matchAll(new RegExp(marker.replace(/[$/.]/g, "\\$&"), "g")),
      ].map((m) => m.index ?? 0);
      const r8 = [
        ...seedSh.matchAll(/run_file "\$SEED_DIR"\/register-healthdcat-ap-r8/g),
      ].map((m) => m.index ?? 0);
      expect(at).toHaveLength(2);
      expect(r8).toHaveLength(2);
      expect(at[0]).toBeLessThan(r8[0]);
      expect(at[1]).toBeLessThan(r8[1]);
    }
  });
});

describe("init-schema.cypher", () => {
  it("declares the PublishedAggregate constraint", () => {
    expect(schema).toContain(
      "CREATE CONSTRAINT published_aggregate_id IF NOT EXISTS FOR (pa:PublishedAggregate) REQUIRE pa.aggregateId IS UNIQUE;",
    );
  });
});

describe("the catalogue mock", () => {
  const entries = NATIONAL.map((id) => catalog.find((d) => d.id === id));
  const live = catalog.find((d) => d.id === "dataset:prostate-cancer-registry");

  it("carries both entries, published and governed by MedReg DE", () => {
    for (const [i, e] of entries.entries()) {
      expect(e, NATIONAL[i]).toBeDefined();
      expect(e?.publisher).toBe("MedReg DE");
      expect(e?.accessBody).toBe("MedReg DE");
      expect(String(e?.legalBasis)).toContain(
        "secure processing environment only",
      );
      expect(String(e?.description)).toContain("no row-level download");
    }
  });

  it("has the shape /api/catalog returns for a seeded dataset", () => {
    // Every key of an existing entry, plus the Release 8 fields the route
    // returns for a dataset that has them.
    for (const e of entries) {
      for (const key of Object.keys(live ?? {})) {
        expect(e, key).toHaveProperty(key);
      }
      for (const key of [
        "healthCategories",
        "populationCoverage",
        "numberOfUniqueIndividuals",
        "minTypicalAge",
        "maxTypicalAge",
      ]) {
        expect(e, key).toHaveProperty(key);
      }
    }
  });

  it("matches the seed's titles, so the static site shows what the graph does", () => {
    for (const e of entries) {
      expect(seed).toContain(`title: '${String(e?.title)}'`);
    }
  });

  it("names no real national body", () => {
    const text = JSON.stringify(entries);
    for (const name of REAL_NAMES) {
      expect(text, name).not.toMatch(new RegExp(`\\b${name}\\b`));
    }
  });
});

/**
 * #1222: docs/health-dataspace-graph-schema.md is the reference for the graph,
 * and it had fallen behind neo4j/init-schema.cypher by thirty labels. Every
 * label a constraint or index is defined on must be named in the doc, in
 * backticks, so a new label cannot land without its documentation.
 *
 * The same issue found Observation documented with `valueUnit` where the
 * loader writes `unit`. No seed may write `valueUnit` without `unit`.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "../../../..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf-8");

const schema = read("neo4j/init-schema.cypher");
const doc = read("docs/health-dataspace-graph-schema.md");

/** Labels a constraint or index is defined on: `FOR (x:Label)`. */
function schemaLabels(cypher: string): string[] {
  const labels = new Set<string>();
  for (const m of cypher.matchAll(/FOR \(\w+:(\w+)\)/g)) labels.add(m[1]);
  // Fulltext indexes name several: FOR (n:A|B|C)
  for (const m of cypher.matchAll(/FOR \(\w+:(\w+(?:\|\w+)+)\)/g)) {
    for (const l of m[1].split("|")) labels.add(l);
  }
  return [...labels].sort();
}

describe("graph schema doc (#1222)", () => {
  const labels = schemaLabels(schema);

  it("finds the labels in init-schema.cypher", () => {
    expect(labels.length).toBeGreaterThan(70);
    expect(labels).toContain("Observation");
    expect(labels).toContain("EEHRxFImplementingAct");
  });

  it.each(labels)("documents %s", (label) => {
    expect(doc).toContain("`" + label + "`");
  });

  it("documents the Observation unit as unit", () => {
    expect(doc).toMatch(/^- `unit: String`/m);
    expect(doc).not.toMatch(/^- `valueUnit: String`$/m);
  });

  it("writes unit wherever a seed writes valueUnit", () => {
    const files = readdirSync(join(ROOT, "neo4j")).filter((f) =>
      f.endsWith(".cypher"),
    );
    const offenders: string[] = [];
    for (const f of files) {
      const text = read(join("neo4j", f));
      for (const m of text.matchAll(/\b(\w+)\.valueUnit\s*=/g)) {
        if (!new RegExp(`\\b${m[1]}\\.unit\\s*=`).test(text)) {
          offenders.push(`${f}: ${m[1]}.valueUnit`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});

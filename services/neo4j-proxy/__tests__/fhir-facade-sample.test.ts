/**
 * The facade sample scripts/eehrxf/validate.py validates (#1144) is what the
 * mapper makes of the committed graph rows. A change to the mapper that is
 * not followed by `npx tsx scripts/export-fhir-facade-samples.ts` and a new
 * validation run fails here, so the validation report never speaks for
 * output the facade no longer serves.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { FACADE_TYPES } from "../src/fhir-resource.js";
import {
  facadeSample,
  sampleText,
  type GraphRows,
} from "../scripts/fhir-facade-sample.js";

const SAMPLES = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  "scripts",
  "eehrxf",
  "samples",
);
const rows = JSON.parse(
  readFileSync(join(SAMPLES, "facade", "graph-rows.json"), "utf8"),
) as GraphRows;
const committed = readFileSync(join(SAMPLES, "facade-sample.json"), "utf8");

describe("the facade sample", () => {
  it("is what the mapper makes of the graph rows", () => {
    // A difference means: run `npx tsx scripts/export-fhir-facade-samples.ts`
    // in services/neo4j-proxy, then python3 scripts/eehrxf/validate.py and
    // python3 scripts/eehrxf/build.py, and commit what they write.
    expect(committed).toBe(sampleText(facadeSample(rows)));
  });

  it("holds every type the facade serves", () => {
    const sample = JSON.parse(committed) as {
      entry: Array<{ resource: { resourceType: string } }>;
    };
    const types = new Set(sample.entry.map((e) => e.resource.resourceType));
    expect([...types].sort()).toEqual([...FACADE_TYPES].sort());
  });

  it("keeps an absolute fullUrl for every entry, each once", () => {
    const sample = JSON.parse(committed) as {
      entry: Array<{ fullUrl: string }>;
    };
    const urls = sample.entry.map((e) => e.fullUrl);
    expect(
      urls.every((u) => /^http:\/\/[^/]+\/fhir\/[A-Z]\w+\/\S+$/.test(u)),
    ).toBe(true);
    expect(new Set(urls).size).toBe(urls.length);
  });
});

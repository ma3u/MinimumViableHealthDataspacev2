/**
 * Every rewritten query parses on the Neo4j the stack runs (5.26, ADR-029).
 *
 * The unit tests pin the text of the rewrite; only a real Neo4j can say the
 * label expressions it writes are Cypher 5. EXPLAIN plans without running.
 * Skipped unless OPT_OUT_IT_BOLT points at a Neo4j, for example:
 *
 *   OPT_OUT_IT_BOLT=bolt://localhost:7687 npx vitest run __tests__/opt-out.neo4j.test.ts
 */
import { readFileSync } from "node:fs";
import neo4j from "neo4j-driver";
import { afterAll, describe, it, expect } from "vitest";
import { secondaryUseView } from "../src/opt-out.js";
import { QUERY_TEMPLATES } from "../src/nlq/engine.js";

const BOLT = process.env.OPT_OUT_IT_BOLT;
const { vectors } = JSON.parse(
  readFileSync(
    new URL("./fixtures/opt-out-vectors.json", import.meta.url),
    "utf8",
  ),
) as { vectors: { name: string; out: string }[] };

describe.skipIf(!BOLT)("rewritten queries parse on Neo4j", () => {
  const driver = neo4j.driver(
    BOLT ?? "bolt://localhost:7687",
    neo4j.auth.basic(
      process.env.NEO4J_USER ?? "neo4j",
      process.env.NEO4J_PASSWORD ?? "healthdataspace",
    ),
  );
  afterAll(() => driver.close());

  const queries = [
    ...vectors.map((v) => [`vector: ${v.name}`, v.out] as const),
    ...QUERY_TEMPLATES.map(
      (t) => [`template: ${t.name}`, secondaryUseView(t.cypher)] as const,
    ),
  ];

  it.each(queries)("%s", async (_name, cypher) => {
    const session = driver.session();
    try {
      await expect(session.run(`EXPLAIN ${cypher}`)).resolves.toBeDefined();
    } finally {
      await session.close();
    }
  });
});

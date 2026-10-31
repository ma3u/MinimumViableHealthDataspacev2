/**
 * A read-only session holds on a real Neo4j (5.26 Community, ADR-029): the
 * server refuses the write the keyword regex lets through, and every NLQ
 * template still runs in one. Writes go to labels no node carries, so even a
 * refusal that did not happen would change nothing.
 * Skipped unless NEO4J_IT_BOLT points at a Neo4j, for example:
 *
 *   NEO4J_IT_BOLT=bolt://localhost:7687 npx vitest run __tests__/read-only-sessions.neo4j.test.ts
 */
import neo4j from "neo4j-driver";
import { afterAll, describe, it, expect } from "vitest";
import { readSession } from "../src/db.js";
import { secondaryUseView } from "../src/opt-out.js";
import { QUERY_TEMPLATES } from "../src/nlq/engine.js";

const BOLT = process.env.NEO4J_IT_BOLT;
const WRITE_PATTERN =
  /\b(CREATE|MERGE|DELETE|DETACH\s+DELETE|SET|REMOVE|DROP|CALL\s*\{[^}]*(CREATE|MERGE|DELETE|SET|REMOVE))/i;

describe.skipIf(!BOLT)("read-only sessions on Neo4j", () => {
  const driver = neo4j.driver(
    BOLT ?? "bolt://localhost:7687",
    neo4j.auth.basic(
      process.env.NEO4J_USER ?? "neo4j",
      process.env.NEO4J_PASSWORD ?? "healthdataspace",
    ),
  );
  afterAll(() => driver.close());

  async function inReadSession(cypher: string) {
    const session = readSession(driver);
    try {
      return await session.run(cypher);
    } finally {
      await session.close();
    }
  }

  const writes = [
    [
      "a label rename, which the regex misses",
      'CALL apoc.refactor.rename.label("ReadOnlyProbe", "ReadOnlyProbe2") YIELD committedOperations RETURN committedOperations',
      false,
    ],
    ["a plain CREATE", "CREATE (n:ReadOnlyProbe) RETURN n", true],
    [
      "a write procedure inside a read procedure",
      'CALL apoc.cypher.doIt("CREATE (n:ReadOnlyProbe) RETURN n", {}) YIELD value RETURN value',
      true,
    ],
  ] as const;

  it.each(writes)("refuses %s", async (_name, cypher, regexCatches) => {
    expect(WRITE_PATTERN.test(cypher)).toBe(regexCatches);
    await expect(inReadSession(cypher)).rejects.toMatchObject({
      code: "Neo.ClientError.Statement.AccessMode",
    });
  });

  it.each(QUERY_TEMPLATES.map((t) => [t.name, t.cypher] as const))(
    "template %s is a read query",
    async (_name, cypher) => {
      const result = await inReadSession(`EXPLAIN ${secondaryUseView(cypher)}`);
      expect(result.summary.queryType).toBe("r");
    },
  );
});

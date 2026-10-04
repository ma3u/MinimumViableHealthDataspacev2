/**
 * Every NLQ template must parse on the Neo4j the stack runs (5.26, ADR-029).
 *
 * `ORDER BY ... NULLS LAST` is Cypher 25 syntax. Neo4j 5.26 answers it with
 * "Invalid input 'NULLS'", so `federated_dataset_search` failed on every call
 * on Azure until 2026-10-04 while its routing test kept passing, because that
 * test never runs the Cypher.
 */
import { describe, it, expect } from "vitest";
import { QUERY_TEMPLATES } from "../src/nlq/engine.js";

const CYPHER_25_ONLY = [/\bNULLS\s+(FIRST|LAST)\b/i];

describe("NLQ templates use Neo4j 5 Cypher", () => {
  it.each(QUERY_TEMPLATES.map((t) => [t.name, t.cypher] as const))(
    "%s has no Cypher 25-only syntax",
    (_name, cypher) => {
      const code = cypher
        .split("\n")
        .filter((line) => !line.trim().startsWith("//"))
        .join("\n");
      for (const pattern of CYPHER_25_ONLY) {
        expect(code).not.toMatch(pattern);
      }
    },
  );
});

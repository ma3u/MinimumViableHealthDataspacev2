/**
 * The quick refusals for Cypher that an LLM wrote or a caller sent (#779).
 *
 * The barrier against writes is the read-only session (`readSession` in
 * db.ts): Neo4j refuses any write in it, procedures included. These patterns
 * only give a clear message before the database is asked.
 *
 * Reads that reach outside the graph are a different matter: read mode does
 * not stop them. `LOAD CSV FROM "file:///..."` reached the file loader in a
 * read session (2026-10-31), and an http URL would make the database fetch
 * whatever address the query names. So these are refused here, and this is
 * the only place that refuses them:
 *
 * - `LOAD CSV`, and `apoc.load.*` / `apoc.import.*`: read files and URLs.
 * - `apoc.export.*`: writes files on the database host.
 * - `apoc.cypher.*`, `apoc.periodic.*`, `apoc.trigger.*`: run Cypher handed to
 *   them as a string, which no pattern here can see into.
 * - `dbms.*`, `apoc.systemdb.*`: server configuration and the system database.
 *
 * Templates are written in this repository and are not checked; they use
 * `apoc.path.*`, which stays allowed.
 */

export const WRITE_PATTERN =
  /\b(CREATE|MERGE|DELETE|DETACH\s+DELETE|SET|REMOVE|DROP|CALL\s*\{[^}]*(CREATE|MERGE|DELETE|SET|REMOVE))/i;

export const OUTSIDE_THE_GRAPH_PATTERN =
  /\bLOAD\s+CSV\b|\bapoc\s*\.\s*(load|import|export|cypher|periodic|trigger|systemdb)\s*\.|\bdbms\s*\./i;

/**
 * The text with `/* ... *\/` and `// ...` comments replaced by a space, in
 * one pass. A regex for this (`\/\*[\s\S]*?\*\/`) is polynomial on input like
 * `/*a/*a/*...` that never closes, and this text comes from the caller.
 */
export function withoutComments(text: string): string {
  let out = "";
  let i = 0;
  while (i < text.length) {
    if (text.startsWith("/*", i)) {
      const end = text.indexOf("*/", i + 2);
      out += " ";
      if (end < 0) break;
      i = end + 2;
    } else if (text.startsWith("//", i)) {
      const end = text.indexOf("\n", i + 2);
      out += " ";
      if (end < 0) break;
      i = end;
    } else {
      out += text[i];
      i += 1;
    }
  }
  return out;
}

/** Why a query is refused, or null when neither pattern matches. */
export function refusedCypher(cypher: string): "write" | "outside" | null {
  // A comment between two keywords (`LOAD/**/CSV`) hides them from a pattern
  // but not from Neo4j, so the text is also checked with comments removed.
  // Removing `//...` can eat the rest of a line after a URL in a string, so
  // the original text is checked as well: either one matching refuses.
  const texts = [cypher, withoutComments(cypher)];
  if (texts.some((t) => OUTSIDE_THE_GRAPH_PATTERN.test(t))) return "outside";
  if (texts.some((t) => WRITE_PATTERN.test(t))) return "write";
  return null;
}

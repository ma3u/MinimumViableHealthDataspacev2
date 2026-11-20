import { readFileSync } from "fs";
import path from "path";

/**
 * The statements of neo4j/fhir-to-omop-transform.cypher, one per entry, as
 * cypher-shell runs them: comment lines dropped, split at each `;`.
 */
export function omopTransformStatements(): string[] {
  const transform = readFileSync(
    path.resolve(__dirname, "../../../neo4j/fhir-to-omop-transform.cypher"),
    "utf8",
  );
  return transform
    .split("\n")
    .filter((l) => !l.trim().startsWith("//"))
    .join("\n")
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * #475, first part: a research question never returns who a patient is.
 *
 * revealsPatientIdentity() is the check every Cypher passes before it runs for
 * a caller without patient identity: a template, a full-text query, or one an
 * LLM wrote.
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("neo4j-driver", () => ({
  default: {
    driver: vi.fn(() => ({ session: vi.fn(), close: vi.fn() })),
    auth: { basic: vi.fn() },
    int: vi.fn((n: number) => n),
    isInt: vi.fn(() => false),
  },
}));

const { revealsPatientIdentity, QUERY_TEMPLATES } = await import(
  "../src/nlq/engine.js"
);

describe("revealsPatientIdentity", () => {
  it.each([
    ["a name", "MATCH (p:Patient) RETURN p.name, p.gender"],
    [
      "a birth date",
      "MATCH (p:Patient)-[:HAS_CONDITION]->(c) RETURN p.birthDate, c.display",
    ],
    [
      "a lookup by name",
      "MATCH (p:Patient) WHERE p.name CONTAINS 'Maria' RETURN count(p)",
    ],
    ["the whole node", "MATCH (p:Patient) RETURN p LIMIT 5"],
    ["a collected node", "MATCH (pt :Patient) RETURN collect(pt)"],
    ["all its properties", "MATCH (p:Patient) RETURN properties(p)"],
    ["a map projection", "MATCH (p:Patient) RETURN p {.*}"],
    ["an address", "MATCH (x:Patient) RETURN x.city, x.postalCode"],
    ["an OMOP person's copied name", "MATCH (op:OMOPPerson) RETURN op.name"],
    [
      "a node in either part of a UNION",
      "MATCH (p:Patient) RETURN p UNION MATCH (c:Condition) RETURN c",
    ],
  ])("refuses %s", (_what, cypher) => {
    expect(revealsPatientIdentity(cypher)).toBe(true);
  });

  it.each([
    ["a count", "MATCH (p:Patient) RETURN count(p) AS patients"],
    ["a gender split", "MATCH (p:Patient) RETURN p.gender, count(*)"],
    [
      "an age band from the year",
      "MATCH (op:OMOPPerson) RETURN op.yearOfBirth / 10 * 10 AS decade, count(*)",
    ],
    [
      "clinical values",
      "MATCH (p:Patient)-[:HAS_CONDITION]->(c:Condition) RETURN c.display, count(DISTINCT p)",
    ],
    ["a dataset name", "MATCH (d:HealthDataset) RETURN d.name"],
    [
      "an age computed from the birth date",
      "MATCH (p:Patient) WITH duration.between(date(p.birthDate), date()).years AS age RETURN age / 10 * 10 AS band, count(*)",
    ],
    [
      "patients collected inside a sub-query",
      "CALL { MATCH (p:Patient) RETURN collect(p) AS cohort } RETURN size(cohort) AS n",
    ],
  ])("lets %s through", (_what, cypher) => {
    expect(revealsPatientIdentity(cypher)).toBe(false);
  });

  it("blocks only the patient journey among the built-in templates", () => {
    const blocked = QUERY_TEMPLATES.filter((t) =>
      revealsPatientIdentity(t.cypher),
    ).map((t) => t.name);
    expect(blocked).toEqual(["patient_journey"]);
  });
});

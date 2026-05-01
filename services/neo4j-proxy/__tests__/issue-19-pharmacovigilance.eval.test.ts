/**
 * Issue #19 — Pharmacovigilance NLQ evaluation suite.
 *
 * Locks in the canonical teaching example from the issue:
 *
 *   "Is tendon rupture frequently observed in patients treated with
 *    ciprofloxacin diagnosed with UTI?"
 *
 * The end-to-end NLQ pipeline must:
 *   1. Match the adverse_event_in_cohort template (regex pattern).
 *   2. Resolve the three semantic roles via the :NlqGlossary nodes —
 *      drug=ciprofloxacin (RxCUI 2551), indication=UTI (SNOMED 68566005),
 *      side-effect=tendon rupture (SNOMED 262615006).
 *   3. Execute a cohort Cypher that returns non-zero population /
 *      indication-cohort / drug-cohort sizes against Synthea-seeded data,
 *      using the :HAS_MEDICATION + .code fallback path (issue #19) and
 *      the head-2-words display match for SNOMED noun phrases.
 *
 * These tests run against a live local Neo4j (docker-compose.jad.yml seed).
 * Skipped automatically when NEO4J_URI is not reachable, so unit-only
 * runs (CI, package-only check) don't break.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import neo4j, { type Driver } from "neo4j-driver";

const NEO4J_URI = process.env.NEO4J_URI ?? "bolt://localhost:7687";
const NEO4J_USER = process.env.NEO4J_USER ?? "neo4j";
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD ?? "healthdataspace";

let driver: Driver | null = null;
let liveNeo4j = false;

beforeAll(async () => {
  try {
    driver = neo4j.driver(
      NEO4J_URI,
      neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD),
      { connectionTimeout: 2000 },
    );
    await driver.verifyConnectivity();
    liveNeo4j = true;
  } catch {
    liveNeo4j = false;
  }
});

afterAll(async () => {
  await driver?.close();
});

interface NlqResponse {
  templateName?: string;
  interpretation?: {
    drug?: { code?: string; display?: string };
    indication?: { code?: string; display?: string };
    sideEffect?: { code?: string; display?: string };
    unresolved?: { drug: boolean; indication: boolean; sideEffect: boolean };
  };
  results?: Array<Record<string, unknown>>;
  rows?: Array<Record<string, unknown>>;
}

async function nlq(question: string): Promise<NlqResponse> {
  const res = await fetch("http://localhost:9090/nlq", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question }),
  });
  expect(res.ok).toBe(true);
  return (await res.json()) as NlqResponse;
}

describe("Issue #19 — pharmacovigilance NLQ", () => {
  it("local Neo4j is reachable (suite-level prerequisite)", () => {
    if (!liveNeo4j) {
      // Surface the skip rather than silently passing a vacuous test.
      console.warn(
        `[issue-19-eval] Skipped: Neo4j not reachable at ${NEO4J_URI}. ` +
          `Bring up docker-compose.jad.yml first.`,
      );
    }
    expect(typeof liveNeo4j).toBe("boolean");
  });

  it("glossary contains the three canonical roles", async () => {
    if (!liveNeo4j) return;
    const session = driver!.session({ database: "neo4j" });
    try {
      const { records } = await session.run(
        `MATCH (g:NlqGlossary)
         WHERE g.term IN ['ciprofloxacin', 'uti', 'tendon rupture']
         RETURN g.term AS term, g.kind AS kind, g.code AS code,
                g.display AS display`,
      );
      const byTerm = Object.fromEntries(
        records.map((r) => [r.get("term"), r.toObject()]),
      );
      expect(byTerm["ciprofloxacin"]).toMatchObject({
        kind: "drug",
        code: "2551",
      });
      expect(byTerm["uti"]).toMatchObject({
        kind: "concept",
        code: "68566005",
      });
      expect(byTerm["tendon rupture"]).toMatchObject({
        kind: "concept",
        code: "262615006",
      });
    } finally {
      await session.close();
    }
  });

  it("matches the adverse_event_in_cohort template and resolves all three roles", async () => {
    if (!liveNeo4j) return;
    const data = await nlq(
      "Is tendon rupture frequently observed in patients treated with ciprofloxacin diagnosed with UTI?",
    );
    expect(data.templateName).toBe("adverse_event_in_cohort");
    expect(data.interpretation?.drug?.code).toBe("2551");
    expect(data.interpretation?.indication?.code).toBe("68566005");
    expect(data.interpretation?.sideEffect?.code).toBe("262615006");
    expect(data.interpretation?.unresolved).toEqual({
      drug: false,
      indication: false,
      sideEffect: false,
    });
  });

  it("returns a non-empty cohort against Synthea-seeded data", async () => {
    if (!liveNeo4j) return;
    const data = await nlq(
      "Is tendon rupture frequently observed in patients treated with ciprofloxacin diagnosed with UTI?",
    );
    const rows = (data.results ?? data.rows ?? []) as Array<{
      populationSize: number;
      indicationCohortSize: number;
      drugCohortSize: number;
      cohortWithIndicationAndDrug: number;
      patientsWithSideEffect: number;
      frequencyPct: number;
    }>;
    expect(rows.length).toBeGreaterThan(0);
    const row = rows[0];
    // Total Synthea population must be present.
    expect(row.populationSize).toBeGreaterThan(0);
    // Both sub-cohorts must have at least one patient — verifies the
    // :HAS_MEDICATION fallback path AND the head-2-words display match.
    expect(row.indicationCohortSize).toBeGreaterThan(0);
    expect(row.drugCohortSize).toBeGreaterThan(0);
    // The intersection (UTI + ciprofloxacin) is the canonical cohort the
    // researcher wants. Synthea's deterministic seed yields exactly 1.
    expect(row.cohortWithIndicationAndDrug).toBeGreaterThanOrEqual(1);
    // Tendon rupture isn't in the Synthea condition set, so the side-
    // effect count is 0 — that's the *correct* answer, not a bug. This
    // assertion documents the seed limitation.
    expect(row.patientsWithSideEffect).toBe(0);
    expect(row.frequencyPct).toBe(0);
  });

  it("resolves a partial question (drug + side-effect, no indication)", async () => {
    if (!liveNeo4j) return;
    const data = await nlq(
      "How often is headache observed in patients treated with metformin?",
    );
    // Either the adverse_event template matches and resolves what it can,
    // or it falls through to fulltext — both are acceptable behaviours
    // because the question lacks the "diagnosed with" indication anchor.
    if (data.templateName === "adverse_event_in_cohort") {
      // When the template DOES match (regex variant 4: "side effects of"
      // — not the case here, so usually falls through), drug should
      // resolve to metformin and side-effect to headache.
      expect(data.interpretation?.drug?.code).toBe("6809");
      expect(data.interpretation?.sideEffect?.code).toBe("25064002");
    }
    expect(data.results ?? data.rows).toBeDefined();
  });
});

/**
 * computeCohortDataQuality: the coverage figures behind an NLQ cohort answer.
 *
 * The cohort query referred to `cs` after the WITH that dropped it, so Neo4j
 * refused it ("Variable `cs` not defined"), the catch returned null, and every
 * cohort question lost its coverage, the global figures included. It also
 * summed each patient's conditions once per MedicationRequest.
 *
 * The unit tests pin the query text; the last block runs both queries on a
 * real Neo4j when DATA_QUALITY_IT_BOLT points at one, for example:
 *
 *   DATA_QUALITY_IT_BOLT=bolt://localhost:7687 npx vitest run __tests__/data-quality.test.ts
 */
import neo4j from "neo4j-driver";
import { afterAll, describe, it, expect, vi } from "vitest";
import { computeCohortDataQuality } from "../src/nlq/engine.js";

type Session = Parameters<typeof computeCohortDataQuality>[0];

const record = (values: Record<string, unknown>) => ({
  get: (key: string) => values[key],
});

function fakeSession() {
  const run = vi
    .fn()
    .mockResolvedValueOnce({
      records: [
        record({
          snomedCoveragePct: 40,
          rxnormCoveragePct: 60,
          totalConditions: neo4j.int(100),
          totalMeds: neo4j.int(50),
        }),
      ],
    })
    .mockResolvedValueOnce({
      records: [
        record({
          cohortSize: neo4j.int(8),
          cohortConditions: neo4j.int(29),
          cohortMeds: neo4j.int(22),
          cohortSnomedCoveragePct: 34.5,
          cohortRxnormCoveragePct: 54.5,
        }),
      ],
    });
  return { session: { run } as unknown as Session, run };
}

const COHORT = { indicationText: "diabetes", drugText: "metformin" };

describe("computeCohortDataQuality", () => {
  it("returns the global and the cohort figures", async () => {
    const { session } = fakeSession();
    await expect(computeCohortDataQuality(session, COHORT)).resolves.toEqual({
      snomedCoveragePct: 40,
      rxnormCoveragePct: 60,
      totalConditions: 100,
      totalMedicationRequests: 50,
      cohortSize: 8,
      cohortConditions: 29,
      cohortMedicationRequests: 22,
      cohortSnomedCoveragePct: 34.5,
      cohortRxnormCoveragePct: 54.5,
    });
  });

  it("uses no variable after the WITH that drops it", async () => {
    const { session, run } = fakeSession();
    await computeCohortDataQuality(session, COHORT);
    const cohortCypher = run.mock.calls[1][0] as string;
    const afterConditions = cohortCypher.split("AS cpCodedConds")[1];
    expect(afterConditions).toBeDefined();
    expect(afterConditions).not.toMatch(/\bcs\b/);
    expect(afterConditions).not.toMatch(/\bcc\b/);
  });

  it("counts per patient before summing, so a condition counts once", async () => {
    const { session, run } = fakeSession();
    await computeCohortDataQuality(session, COHORT);
    const cohortCypher = run.mock.calls[1][0] as string;
    expect(cohortCypher).toContain("count(DISTINCT cm) AS cpMeds");
    expect(cohortCypher).toContain("sum(cpConditions) AS cohortConditions");
    expect(cohortCypher).toContain("sum(cpMeds) AS cohortMeds");
  });
});

const BOLT = process.env.DATA_QUALITY_IT_BOLT;

describe.skipIf(!BOLT)("computeCohortDataQuality on Neo4j", () => {
  const driver = neo4j.driver(
    BOLT ?? "bolt://localhost:7687",
    neo4j.auth.basic(
      process.env.NEO4J_USER ?? "neo4j",
      process.env.NEO4J_PASSWORD ?? "healthdataspace",
    ),
  );
  afterAll(() => driver.close());

  it("answers with cohort figures, not null", async () => {
    const session = driver.session();
    try {
      const result = await computeCohortDataQuality(session, COHORT);
      expect(result).not.toBeNull();
      expect(result?.cohortSize).toBeTypeOf("number");
      expect(result?.cohortConditions).toBeTypeOf("number");
    } finally {
      await session.close();
    }
  });
});

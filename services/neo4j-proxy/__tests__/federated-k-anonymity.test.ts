/**
 * Phase 26e (issue #8) — /federated/query dual-side k-anonymity + ODRL.
 *
 * Covers: contributor-side suppression (rows > 0 but < minK ⇒ contributor
 * suppressed AND global aggregate suppressed with reason
 * "contributor_k_violation"), the passing path, caller-side ODRL
 * re-identification blocking, and the write-query guard.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";

const mockRun = vi.fn();
const mockClose = vi.fn();
const mockSession = { run: mockRun, close: mockClose };
const mockGetServerInfo = vi.fn().mockResolvedValue({ address: "mock:7687" });
const mockDriver = {
  session: vi.fn(() => mockSession),
  getServerInfo: mockGetServerInfo,
  close: vi.fn(),
};

// These tests are about query logic; the audit trail has its own tests in
// audit-chain.test.ts. Every answer now waits for its audit record (fail
// closed, ADR-045), which this mock driver cannot write.
vi.mock("../src/audit-chain.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/audit-chain.js")>()),
  appendQueryAudit: vi.fn().mockResolvedValue({}),
}));

vi.mock("neo4j-driver", () => ({
  default: {
    driver: vi.fn(() => mockDriver),
    auth: { basic: vi.fn() },
    int: vi.fn((n: number) => n),
    isInt: vi.fn(() => false),
  },
}));

const { app, main } = await import("../src/index.js");
import supertest from "supertest";

const request = supertest(app);

/** Fake a Neo4j result whose records all carry the same single column. */
function fakeResult(rows: Array<Record<string, unknown>>) {
  return {
    records: rows.map((row) => ({
      keys: Object.keys(row),
      get: (k: string) => row[k],
    })),
  };
}

beforeAll(async () => {
  vi.spyOn(app, "listen").mockImplementation(
    (_port: unknown, cb?: () => void) => {
      if (cb) cb();
      return { close: vi.fn() } as never;
    },
  );
  await main();
});

beforeEach(() => {
  mockRun.mockReset();
});

describe("POST /federated/query — only aggregates leave the federation (#1236)", () => {
  it("masks a count below minK in each SPE's answer", async () => {
    mockRun.mockResolvedValue(fakeResult([{ cohort: 3 }]));

    const res = await request
      .post("/federated/query")
      .send({ cypher: "MATCH (p:Patient) RETURN count(p) AS cohort" });

    expect(res.status).toBe(200);
    expect(res.body.suppressionReason).toBe("small_cells");
    expect(res.body.aggregateSuppressed).toBe(false);
    expect(res.body.results.length).toBeGreaterThan(0);
    for (const row of res.body.results) expect(row.cohort).toBe("<5");
  });

  it("returns counts of at least minK as they are, one row per SPE", async () => {
    mockRun.mockResolvedValue(fakeResult([{ cohort: 42 }]));

    const res = await request
      .post("/federated/query")
      .send({ cypher: "MATCH (p:Patient) RETURN count(p) AS cohort" });

    expect(res.status).toBe(200);
    expect(res.body.suppressionReason).toBeNull();
    expect(res.body.results.map((r: { cohort: number }) => r.cohort)).toEqual(
      res.body.sources.map(() => 42),
    );
    expect(res.body.minKApplied).toBeGreaterThanOrEqual(5);
  });

  it("withholds a list of records about persons (draft Art. 18(2)(g))", async () => {
    mockRun.mockResolvedValue(
      fakeResult(Array.from({ length: 6 }, () => ({ gender: "female" }))),
    );

    const res = await request
      .post("/federated/query")
      .send({ cypher: "MATCH (p:Patient) RETURN p.gender AS gender" });

    expect(res.status).toBe(200);
    expect(res.body.results).toEqual([]);
    expect(res.body.aggregateSuppressed).toBe(true);
    expect(res.body.suppressionReason).toBe("row_level_in_federation");
    // Never asked: no SPE ran the query, so nothing left any of them.
    expect(mockRun).not.toHaveBeenCalled();
  });

  it("never lowers minK below the server minimum", async () => {
    mockRun.mockResolvedValue(fakeResult([{ cohort: 1 }]));
    const res = await request.post("/federated/query").send({
      cypher: "MATCH (p:Patient) RETURN count(p) AS cohort",
      minK: 1,
    });
    expect(res.body.minKApplied).toBeGreaterThanOrEqual(5);
    expect(res.body.results[0].cohort).toBe("<5");
  });
});

describe("POST /federated/query — caller-side ODRL", () => {
  it("blocks re-identification attempts prohibited by the caller's scope", async () => {
    const res = await request.post("/federated/query").send({
      cypher: "MATCH (p:Patient) RETURN p.name, p.birthDate, p.city",
      odrlScope: {
        participantId: "did:web:pharmaco.de:research",
        policyIds: ["policy-1"],
        prohibitions: ["re_identification"],
        validUntil: null,
      },
    });

    expect(res.status).toBe(403);
    expect(res.body.odrlEnforced).toBe(true);
    expect(res.body.error).toMatch(/re-identification/i);
  });

  it("rejects write queries regardless of scope", async () => {
    const res = await request
      .post("/federated/query")
      .send({ cypher: "MATCH (p) DETACH DELETE p" });
    expect(res.status).toBe(403);
  });
});

describe("POST /federated/query — an SPE that fails (#1029)", () => {
  it("says which SPE failed but not why", async () => {
    mockRun.mockRejectedValue(
      new Error(
        "Neo.ClientError.Statement.SyntaxError: Invalid input at bolt://spe-internal:7687 MATCH (p:Patient {name: 'Erika'})",
      ),
    );
    const res = await request
      .post("/federated/query")
      .send({ cypher: "MATCH (p:Patient) RETURN count(p) AS cohort" });
    expect(res.text).not.toContain("Neo.ClientError");
    expect(res.text).not.toContain("spe-internal");
    expect(res.text).not.toContain("Erika");
  });
});

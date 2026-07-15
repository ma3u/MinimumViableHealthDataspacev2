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

describe("POST /federated/query — contributor-side k-anonymity", () => {
  it("suppresses the aggregate when a contributor is below minK", async () => {
    // 3 identical rows from the only SPE — below the default minK of 5.
    mockRun.mockResolvedValue(
      fakeResult([{ cohort: 42 }, { cohort: 42 }, { cohort: 42 }]),
    );

    const res = await request
      .post("/federated/query")
      .send({ cypher: "MATCH (p:Patient) RETURN count(p) AS cohort" });

    expect(res.status).toBe(200);
    expect(res.body.aggregateSuppressed).toBe(true);
    expect(res.body.suppressionReason).toBe("contributor_k_violation");
    expect(res.body.results).toEqual([]);
  });

  it("returns results when every contributor meets minK", async () => {
    mockRun.mockResolvedValue(
      fakeResult(Array.from({ length: 6 }, () => ({ cohort: 42 }))),
    );

    const res = await request
      .post("/federated/query")
      .send({ cypher: "MATCH (p:Patient) RETURN count(p) AS cohort" });

    expect(res.status).toBe(200);
    expect(res.body.aggregateSuppressed).toBe(false);
    expect(res.body.suppressionReason).toBeNull();
    expect(res.body.results).toHaveLength(6);
    expect(res.body.minKApplied).toBeGreaterThanOrEqual(5);
  });

  it("never lowers minK below the server minimum", async () => {
    mockRun.mockResolvedValue(fakeResult([{ cohort: 1 }]));
    const res = await request
      .post("/federated/query")
      .send({ cypher: "MATCH (p) RETURN count(p) AS cohort", minK: 1 });
    expect(res.body.minKApplied).toBeGreaterThanOrEqual(5);
    expect(res.body.aggregateSuppressed).toBe(true);
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

/**
 * ADR-094, #1123: /federated/stats answers feasibility counts, and a count
 * below k leaves as "<k", per SPE and in the totals. k follows the rules of
 * /federated/query: the server minimum (MIN_COHORT_SIZE, 5) unless the caller
 * asks for more, never less. A total never gives a suppressed SPE count back.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { combineCounts } from "../src/k-anonymity.js";

const mockRun = vi.fn();
const mockClose = vi.fn();
const mockSession = { run: mockRun, close: mockClose };
const mockGetServerInfo = vi.fn().mockResolvedValue({ address: "mock:7687" });
const mockDriver = {
  session: vi.fn(() => mockSession),
  getServerInfo: mockGetServerInfo,
  close: vi.fn(),
};

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
    integer: { toNumber: (n: unknown) => Number(n) },
  },
}));

const { app, main } = await import("../src/index.js");
const { setSpe2Driver } = await import("../src/db.js");
import supertest from "supertest";

const request = supertest(app);

function fakeResult(rows: Array<Record<string, unknown>>) {
  return {
    records: rows.map((row) => ({
      keys: Object.keys(row),
      get: (k: string) => row[k],
    })),
  };
}

/** One SPE's answers to the three queries the route sends. */
function speAnswers(a: {
  patients: number;
  conditions: Array<[string, number]>;
  genders: Array<[string, number]>;
}) {
  return (cypher: string) => {
    if (cypher.includes("AS observations")) {
      return fakeResult([
        {
          patients: a.patients,
          encounters: 40,
          conditions: 30,
          observations: 120,
        },
      ]);
    }
    if (cypher.includes("c.name AS name")) {
      return fakeResult(a.conditions.map(([name, cnt]) => ({ name, cnt })));
    }
    return fakeResult(a.genders.map(([gender, cnt]) => ({ gender, cnt })));
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
  setSpe2Driver(null);
});

describe("GET /federated/stats: small counts are suppressed", () => {
  it("a count of 3 comes back as <5, a count of 12 as 12", async () => {
    mockRun.mockImplementation(
      speAnswers({
        patients: 12,
        conditions: [
          ["Diabetes mellitus type 2 (disorder)", 12],
          ["Rare condition (disorder)", 3],
        ],
        genders: [
          ["female", 12],
          ["male", 3],
        ],
      }),
    );

    const res = await request.get("/federated/stats");

    expect(res.status).toBe(200);
    expect(res.body.minKApplied).toBe(5);
    expect(res.body.suppressionReason).toBe("small_cells");
    expect(res.body.totals.patients).toBe(12);
    expect(res.body.aggregatedConditions).toEqual([
      { name: "Diabetes mellitus type 2 (disorder)", count: 12 },
      { name: "Rare condition (disorder)", count: "<5" },
    ]);
    expect(res.body.aggregatedGenders).toEqual([
      { gender: "female", count: 12 },
      { gender: "male", count: "<5" },
    ]);
    const [spe] = res.body.perSpe;
    expect(spe.source).toBe("SPE-1");
    expect(spe.patients).toBe(12);
    expect(spe.topConditions[1]).toEqual({
      name: "Rare condition (disorder)",
      count: "<5",
    });
    expect(spe.genderBreakdown[1]).toEqual({ gender: "male", count: "<5" });
    // Nowhere in the answer is the 3.
    expect(JSON.stringify(res.body)).not.toMatch(/:3[,}]/);
  });

  it("a total of patients below k is suppressed too", async () => {
    mockRun.mockImplementation(
      speAnswers({ patients: 3, conditions: [], genders: [["female", 3]] }),
    );
    const res = await request.get("/federated/stats");
    expect(res.body.totals.patients).toBe("<5");
    expect(res.body.perSpe[0].patients).toBe("<5");
  });

  it("takes a stricter k from the caller but never a lower one", async () => {
    mockRun.mockImplementation(
      speAnswers({ patients: 12, conditions: [], genders: [["female", 12]] }),
    );

    const stricter = await request.get("/federated/stats?minK=20");
    expect(stricter.body.minKApplied).toBe(20);
    expect(stricter.body.totals.patients).toBe("<20");

    const lower = await request.get("/federated/stats?minK=1");
    expect(lower.body.minKApplied).toBe(5);
    expect(lower.body.totals.patients).toBe(12);

    const nonsense = await request.get("/federated/stats?minK=abc");
    expect(nonsense.body.minKApplied).toBe(5);
  });

  it("a total over two SPEs does not give a suppressed SPE count back", async () => {
    const spe2Run = vi.fn(
      speAnswers({
        patients: 3,
        conditions: [["Diabetes mellitus type 2 (disorder)", 3]],
        genders: [["female", 3]],
      }),
    );
    setSpe2Driver({
      session: () => ({ run: spe2Run, close: vi.fn() }),
    } as never);
    mockRun.mockImplementation(
      speAnswers({
        patients: 12,
        conditions: [["Diabetes mellitus type 2 (disorder)", 12]],
        genders: [["female", 12]],
      }),
    );

    const res = await request.get("/federated/stats");

    expect(res.body.speCount).toBe(2);
    const spe2 = res.body.perSpe.find(
      (s: { source: string }) => s.source === "SPE-2",
    );
    expect(spe2.patients).toBe("<5");
    // 15 minus the 12 SPE-1 shows would be SPE-2's 3: the total says 12.
    expect(res.body.totals.patients).toBe(12);
    expect(res.body.aggregatedConditions[0].count).toBe(12);
  });
});

describe("combineCounts", () => {
  it("adds counts that are all at least k", () => {
    expect(combineCounts([12, 30], 5)).toBe(42);
  });
  it("leaves out one count below k, which the sum would give back", () => {
    expect(combineCounts([12, 3], 5)).toBe(12);
  });
  it("keeps counts below k that add up to k or more", () => {
    expect(combineCounts([12, 3, 4], 5)).toBe(19);
  });
  it("is <k when only counts below k are there, or the total is below k", () => {
    expect(combineCounts([3], 5)).toBe("<5");
    expect(combineCounts([1, 2], 5)).toBe("<5");
  });
  it("is 0 for nothing, and filters nothing with k = 0", () => {
    expect(combineCounts([0, 0], 5)).toBe(0);
    expect(combineCounts([1, 2], 0)).toBe(3);
  });
});

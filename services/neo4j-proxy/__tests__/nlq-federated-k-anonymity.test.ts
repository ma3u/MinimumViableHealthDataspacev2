/**
 * The Federated button on /query asks POST /nlq with `federated: true`.
 * That path merged what every SPE returned and applied no k-anonymity, so
 * an age group of one person left the environment as `count: 1` (found
 * 2026-10-30 against two local SPEs). It now applies the rules of
 * src/k-anonymity.ts, the same /federated/query uses, and so does a question
 * asked of one SPE.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";

const mockRun = vi.fn();
const mockSession = { run: mockRun, close: vi.fn() };
const mockDriver = {
  session: vi.fn(() => mockSession),
  getServerInfo: vi.fn().mockResolvedValue({ address: "mock:7687" }),
  close: vi.fn(),
};

const appendQueryAudit = vi.fn().mockResolvedValue({});
vi.mock("../src/audit-chain.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/audit-chain.js")>()),
  appendQueryAudit: (...a: unknown[]) => appendQueryAudit(...a),
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
const { setSpe2Driver } = await import("../src/db.js");
const { anonymiseAnswer, suppressSmallCells, suppressSmallGroups } =
  await import("../src/k-anonymity.js");
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

beforeAll(async () => {
  vi.spyOn(app, "listen").mockImplementation(
    (_port: unknown, cb?: () => void) => {
      if (cb) cb();
      return { close: vi.fn() } as never;
    },
  );
  await main();
  // A second SPE, so `federated: true` takes the federated path.
  setSpe2Driver(mockDriver as never);
});

beforeEach(() => {
  mockRun.mockReset();
  appendQueryAudit.mockClear();
});

describe("POST /nlq with federated: true", () => {
  it("masks an age group of one person in every SPE's answer", async () => {
    mockRun.mockResolvedValue(
      fakeResult([
        { ageGroup: "0-17", count: 1 },
        { ageGroup: "18-34", count: 40 },
      ]),
    );

    const res = await request
      .post("/nlq")
      .send({ question: "What is the age distribution?", federated: true });

    expect(res.status).toBe(200);
    expect(res.body.federated).toBe(true);
    const young = res.body.results.filter(
      (r: { ageGroup: string }) => r.ageGroup === "0-17",
    );
    expect(young).toHaveLength(2);
    expect(young.every((r: { count: unknown }) => r.count === "<5")).toBe(true);
    expect(
      res.body.results.find((r: { ageGroup: string }) => r.ageGroup === "18-34")
        .count,
    ).toBe(40);
    expect(res.body).toMatchObject({
      minKApplied: 5,
      filtered: 2,
      aggregateSuppressed: false,
      suppressionReason: "small_cells",
    });
    // The audit record says the answer was suppressed in part.
    expect(appendQueryAudit.mock.calls[0][0].federated).toMatchObject({
      suppressionReason: "small_cells",
    });
  });

  it("leaves an answer with no small count as it was", async () => {
    mockRun.mockResolvedValue(fakeResult([{ gender: "female", count: 108 }]));

    const res = await request
      .post("/nlq")
      .send({ question: "Show me patients by gender", federated: true });

    expect(res.status).toBe(200);
    expect(res.body.results.map((r: { count: number }) => r.count)).toEqual([
      108, 108,
    ]);
    expect(res.body).toMatchObject({ filtered: 0, suppressionReason: null });
  });
});

describe("POST /nlq without federated", () => {
  it("masks small counts from one SPE as from several", async () => {
    // Asked of SPE-1 alone, "Patients with diabetes" listed groups of 4 and
    // 1 patients (2026-10-30).
    setSpe2Driver(null);
    try {
      mockRun.mockResolvedValue(
        fakeResult([
          {
            condition: "Type 2 Diabetes",
            occurrences: 16,
            prevalencePercent: 7.41,
          },
          {
            condition: "Type 2 diabetes mellitus",
            occurrences: 4,
            prevalencePercent: 1.85,
          },
        ]),
      );

      const res = await request
        .post("/nlq")
        .send({ question: "Patients with diabetes" });

      expect(res.status).toBe(200);
      expect(res.body.federated).toBe(false);
      expect(res.body.results).toEqual([
        {
          condition: "Type 2 Diabetes",
          occurrences: 16,
          prevalencePercent: 7.41,
        },
        {
          condition: "Type 2 diabetes mellitus",
          occurrences: "<5",
          prevalencePercent: "<5",
        },
      ]);
      expect(res.body).toMatchObject({
        minKApplied: 5,
        filtered: 1,
        suppressionReason: "small_cells",
      });
    } finally {
      setSpe2Driver(mockDriver as never);
    }
  });
});

describe("a question about the SPEs themselves", () => {
  it("asks every SPE, without the Federated button", async () => {
    mockRun.mockResolvedValue(fakeResult([{ patients: 216 }]));

    const res = await request
      .post("/nlq")
      .send({ question: "How many SPE you have access?" });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      method: "template",
      templateName: "spe_access",
      federated: true,
    });
    expect(res.body.results.map((r: { _source: string }) => r._source)).toEqual(
      ["SPE-1", "SPE-2"],
    );
  });

  it("does not search the conditions for a pronoun", async () => {
    // "you~" matched "Gout": the SPE question was answered with gout and
    // diabetes patients (2026-10-30).
    const { fulltextSearch } = await import("../src/nlq/engine.js");
    mockRun.mockResolvedValue(fakeResult([]));

    await fulltextSearch("Did you see abscess?");

    const term = mockRun.mock.calls[0][1].term as string;
    expect(term).not.toMatch(/you/);
    expect(term).toBe("see* abscess* abscess~1");
  });
});

describe("the k-anonymity rules", () => {
  it("takes the share computed from a masked count with it", () => {
    const { rows, filtered } = suppressSmallCells(
      [
        {
          condition: "Type 2 diabetes",
          occurrences: 1,
          total: 216,
          prevalencePercent: 0.46,
        },
      ],
      5,
    );
    expect(rows[0]).toEqual({
      condition: "Type 2 diabetes",
      occurrences: "<5",
      total: 216,
      prevalencePercent: "<5",
    });
    expect(filtered).toBe(1);
  });

  it("drops small groups of records and suppresses a small contributor", () => {
    const many = Array.from({ length: 6 }, () => ({ code: "E11" }));
    expect(
      suppressSmallGroups([{ source: "SPE-1", records: many }], 5).rows,
    ).toHaveLength(6);

    const outcome = suppressSmallGroups(
      [
        { source: "SPE-1", records: many },
        { source: "SPE-2", records: [{ code: "E11" }] },
      ],
      5,
    );
    expect(outcome.rows).toEqual([]);
    expect(outcome.suppressionReason).toBe("contributor_k_violation");
  });

  it("recognises a person label inside the Art. 71 label expression", () => {
    const outcome = anonymiseAnswer(
      "MATCH (p:(Patient)&!OptedOut) RETURN p.gender AS gender, count(*) AS count",
      [{ source: "SPE-1", records: [{ gender: "female", count: 3 }] }],
      5,
    );
    expect(outcome.rows[0].count).toBe("<5");
  });

  it("filters only answers about persons", () => {
    const datasets = [
      { source: "SPE-1", records: [{ publisher: "AlphaKlinik", count: 2 }] },
    ];
    const outcome = anonymiseAnswer(
      "MATCH (d:HealthDataset) RETURN d.publisher AS publisher, count(d) AS count",
      datasets,
      5,
    );
    expect(outcome.rows[0].count).toBe(2);
    expect(outcome.minKApplied).toBe(0);
  });
});

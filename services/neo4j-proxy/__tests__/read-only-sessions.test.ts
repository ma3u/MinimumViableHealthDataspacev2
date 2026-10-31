/**
 * Cypher an LLM or a caller wrote runs in a read-only session, so the
 * database refuses a write the keyword regex misses. The regex lets through
 * `CALL apoc.refactor.rename.label(...)`, which renames every node of a
 * label and contains none of its keywords (found 2026-10-31).
 * read-only-sessions.neo4j.test.ts shows Neo4j refusing it.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";

const mockRun = vi.fn();
/** Each run, with the config of the session it ran in. */
const runs: Array<{ cypher: string; config: unknown }> = [];
const mockDriver = {
  session: vi.fn((config?: unknown) => ({
    run: (cypher: string, params?: unknown) => {
      runs.push({ cypher, config });
      return mockRun(cypher, params);
    },
    close: vi.fn(),
  })),
  getServerInfo: vi.fn().mockResolvedValue({ address: "mock:7687" }),
  close: vi.fn(),
};

// Every answer waits for its audit record (ADR-045), which this mock driver
// cannot write.
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
const { setSpe2Driver } = await import("../src/db.js");
import supertest from "supertest";

const request = supertest(app);
const READ = { database: "neo4j", defaultAccessMode: "READ" };
const RENAME =
  'CALL apoc.refactor.rename.label("Patient", "Renamed") YIELD committedOperations RETURN committedOperations';

function fakeResult(rows: Array<Record<string, unknown>>) {
  return {
    records: rows.map((row) => ({
      keys: Object.keys(row),
      get: (k: string) => row[k],
    })),
  };
}

/** Every session the matching Cypher ran in was read-only, and there was one. */
function expectRanReadOnly(match: (cypher: string) => boolean, atLeast = 1) {
  const sessions = runs.filter((r) => match(r.cypher)).map((r) => r.config);
  expect(sessions.length).toBeGreaterThanOrEqual(atLeast);
  for (const s of sessions) expect(s).toMatchObject(READ);
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
  mockRun.mockResolvedValue(fakeResult([{ committedOperations: 0 }]));
  runs.length = 0;
});

describe("POST /federated/query", () => {
  it("runs the caller's Cypher in a read-only session", async () => {
    await request
      .post("/federated/query")
      .send({ cypher: "MATCH (p:Patient) RETURN count(p) AS cohort" });

    expectRanReadOnly((c) => c.includes("RETURN count(p) AS cohort"));
  });

  it("hands a write the regex misses to a read-only session", async () => {
    await request.post("/federated/query").send({ cypher: RENAME });

    expectRanReadOnly((c) => c.includes("apoc.refactor.rename.label"));
  });
});

describe("POST /nlq", () => {
  it("runs the query in a read-only session on one SPE", async () => {
    mockRun.mockResolvedValue(fakeResult([{ gender: "female", count: 108 }]));
    await request.post("/nlq").send({ question: "Show me patients by gender" });

    expectRanReadOnly((c) => /gender/i.test(c));
  });

  it("runs the query in a read-only session on every SPE", async () => {
    setSpe2Driver(mockDriver as never);
    try {
      mockRun.mockResolvedValue(fakeResult([{ gender: "female", count: 108 }]));
      await request
        .post("/nlq")
        .send({ question: "Show me patients by gender", federated: true });

      expectRanReadOnly((c) => /gender/i.test(c), 2);
    } finally {
      setSpe2Driver(null);
    }
  });
});

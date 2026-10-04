/**
 * Fail closed (ADR-045, #418): a query is answered only once its audit record
 * is written. Without the record the caller gets a 503 and no data; a refused
 * query is recorded too, and stays refused if that record fails.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";

const appendQueryAudit = vi.fn();
vi.mock("../src/audit-chain.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/audit-chain.js")>()),
  appendQueryAudit: (...args: unknown[]) => appendQueryAudit(...args),
}));

const mockRun = vi.fn();
const mockSession = { run: mockRun, close: vi.fn() };
const mockDriver = {
  session: vi.fn(() => mockSession),
  getServerInfo: vi.fn().mockResolvedValue({ address: "mock:7687" }),
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

function rows(data: Array<Record<string, unknown>>) {
  return {
    records: data.map((row) => ({
      keys: Object.keys(row),
      get: (k: string) => row[k],
    })),
  };
}

const SCOPE = {
  participantId: "did:web:pharmaco.de:research",
  participantName: "PharmaCo Research AG",
  permissions: ["read"],
  prohibitions: ["re_identification"],
  accessibleDatasets: [],
  temporalLimit: null,
  policyIds: ["policy-1"],
  hasActiveContract: true,
  hdabApproved: true,
};

beforeAll(async () => {
  vi.spyOn(app, "listen").mockImplementation((_p: unknown, cb?: () => void) => {
    if (cb) cb();
    return { close: vi.fn() } as never;
  });
  await main();
});

beforeEach(() => {
  mockRun.mockReset();
  appendQueryAudit.mockReset();
});

describe("POST /nlq", () => {
  it("answers once the record is written, and records the result count", async () => {
    appendQueryAudit.mockResolvedValue({});
    mockRun.mockResolvedValue(rows([{ patientCount: 174 }]));

    const res = await request
      .post("/nlq")
      .send({ question: "How many patients are in the database?" });

    expect(res.status).toBe(200);
    expect(res.body.results).toEqual([{ patientCount: 174 }]);
    expect(appendQueryAudit).toHaveBeenCalledTimes(1);
    expect(appendQueryAudit.mock.calls[0][0]).toMatchObject({
      outcome: "success",
      resultCount: 1,
      method: "template",
    });
  });

  it("answers 503 with no data when the record cannot be written", async () => {
    appendQueryAudit.mockRejectedValue(new Error("Neo4j unavailable"));
    mockRun.mockResolvedValue(rows([{ patientCount: 174 }]));

    const res = await request
      .post("/nlq")
      .send({ question: "How many patients are in the database?" });

    expect(res.status).toBe(503);
    expect(res.body.error).toMatch(/audit record could not be written/);
    expect(res.body.results).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toContain("174");
  });
});

describe("POST /federated/query", () => {
  const COUNT = "MATCH (p:Patient) RETURN count(p) AS cohort";

  it("answers 503 with no data when the record cannot be written", async () => {
    appendQueryAudit.mockRejectedValue(new Error("Neo4j unavailable"));
    mockRun.mockResolvedValue(
      rows(Array.from({ length: 6 }, () => ({ cohort: 42 }))),
    );

    const res = await request.post("/federated/query").send({ cypher: COUNT });

    expect(res.status).toBe(503);
    expect(res.body.results).toBeUndefined();
  });

  it("records a refused query and still refuses when that record fails", async () => {
    appendQueryAudit.mockRejectedValue(new Error("Neo4j unavailable"));

    const res = await request.post("/federated/query").send({
      cypher: "MATCH (p:Patient) RETURN p.name, p.birthDate, p.city",
      odrlScope: SCOPE,
    });

    expect(res.status).toBe(403);
    expect(mockRun).not.toHaveBeenCalled();
    expect(appendQueryAudit.mock.calls[0][0]).toMatchObject({
      outcome: "refused",
      reason: "ODRL re-identification prohibition",
      resultCount: 0,
    });
  });
});

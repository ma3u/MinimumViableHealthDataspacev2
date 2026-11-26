/**
 * ADR-100 decision 4 (#1236, draft SPE implementing act Art. 18(2)(f)): every
 * federated query has one id, the same on the coordinator's audit record, in
 * the answer and its header, and in the transaction metadata each workspace
 * receives, so the logs of every instance can be joined on it.
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
    integer: { toNumber: (n: unknown) => Number(n) },
  },
}));

const { app, main } = await import("../src/index.js");
const { setSpe2Driver } = await import("../src/db.js");
const { buildQueryAuditEvent } = await import("../src/audit-chain.js");
const { FEDERATION_QUERY_HEADER } = await import("../src/federation-query.js");
import supertest from "supertest";

const request = supertest(app);
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function fakeResult(rows: Array<Record<string, unknown>>) {
  return {
    records: rows.map((row) => ({
      keys: Object.keys(row),
      get: (k: string) => row[k],
    })),
  };
}

/**
 * The federationQueryId of every transaction a workspace was sent. The hub's
 * own TransferEvent write goes to the same mocked session and is left out.
 */
function idsSentToWorkspaces(): unknown[] {
  return mockRun.mock.calls
    .filter((c) => !String(c[0]).includes("TransferEvent"))
    .map(
      (c) =>
        (c[2] as { metadata?: { federationQueryId?: string } } | undefined)
          ?.metadata?.federationQueryId,
    );
}

beforeAll(async () => {
  vi.spyOn(app, "listen").mockImplementation(
    (_port: unknown, cb?: () => void) => {
      if (cb) cb();
      return { close: vi.fn() } as never;
    },
  );
  await main();
  // Two SPEs, so a query is asked of a federation.
  setSpe2Driver(mockDriver as never);
});

beforeEach(() => {
  mockRun.mockReset();
  appendQueryAudit.mockReset();
  appendQueryAudit.mockResolvedValue({});
});

describe("POST /federated/query", () => {
  it("carries one id into the answer, its header, the audit and every workspace", async () => {
    mockRun.mockResolvedValue(fakeResult([{ patients: 40 }]));

    const res = await request.post("/federated/query").send({
      cypher: "MATCH (p:Patient) RETURN count(p) AS patients",
    });

    expect(res.status).toBe(200);
    const id = res.body.federationQueryId;
    expect(id).toMatch(UUID);
    expect(res.headers[FEDERATION_QUERY_HEADER.toLowerCase()]).toBe(id);
    expect(appendQueryAudit.mock.calls[0][0].federationQueryId).toBe(id);
    // Both workspaces were asked, each with the same id.
    expect(idsSentToWorkspaces()).toEqual([id, id]);
  });

  it("gives two queries two ids", async () => {
    mockRun.mockResolvedValue(fakeResult([{ patients: 40 }]));
    const ask = () =>
      request.post("/federated/query").send({
        cypher: "MATCH (p:Patient) RETURN count(p) AS patients",
      });
    const a = await ask();
    const b = await ask();
    expect(a.body.federationQueryId).not.toBe(b.body.federationQueryId);
  });

  it("puts the id on a refusal's audit record too", async () => {
    const res = await request.post("/federated/query").send({
      cypher: "LOAD CSV FROM 'https://example.org/x.csv' AS row RETURN row",
    });

    expect(res.status).toBe(403);
    const id = res.headers[FEDERATION_QUERY_HEADER.toLowerCase()];
    expect(id).toMatch(UUID);
    expect(appendQueryAudit.mock.calls[0][0]).toMatchObject({
      outcome: "refused",
      federationQueryId: id,
    });
    expect(mockRun).not.toHaveBeenCalled();
  });

  it("records a withheld list of persons under its id, and asks no workspace", async () => {
    const res = await request.post("/federated/query").send({
      cypher: "MATCH (p:Patient) RETURN p.name AS name",
    });

    expect(res.status).toBe(200);
    expect(res.body.aggregateSuppressed).toBe(true);
    expect(appendQueryAudit.mock.calls[0][0].federationQueryId).toBe(
      res.body.federationQueryId,
    );
    expect(mockRun).not.toHaveBeenCalled();
  });
});

describe("GET /federated/stats", () => {
  beforeEach(() => {
    mockRun.mockImplementation((cypher: string) => {
      if (cypher.includes("AS observations")) {
        return fakeResult([
          { patients: 20, encounters: 40, conditions: 30, observations: 120 },
        ]);
      }
      return fakeResult([]);
    });
  });

  it("is recorded on the audit chain under its id before it answers", async () => {
    const res = await request.get("/federated/stats");

    expect(res.status).toBe(200);
    const id = res.body.federationQueryId;
    expect(id).toMatch(UUID);
    expect(res.headers[FEDERATION_QUERY_HEADER.toLowerCase()]).toBe(id);
    expect(appendQueryAudit).toHaveBeenCalledTimes(1);
    expect(appendQueryAudit.mock.calls[0][0]).toMatchObject({
      federationQueryId: id,
      method: "federated-stats",
      outcome: "success",
      federated: { contributors: ["SPE-1", "SPE-2"] },
    });
    // Three queries to each of two workspaces, all with the same id.
    expect(idsSentToWorkspaces()).toEqual([id, id, id, id, id, id]);
  });

  it("answers nothing when the audit cannot record it (fail closed)", async () => {
    appendQueryAudit.mockRejectedValue(new Error("chain down"));

    const res = await request.get("/federated/stats");

    expect(res.status).toBe(503);
    expect(res.body.totals).toBeUndefined();
  });
});

describe("POST /nlq with federated: true", () => {
  it("carries one id into the answer, the audit and every workspace", async () => {
    mockRun.mockResolvedValue(fakeResult([{ ageGroup: "18-34", count: 40 }]));

    const res = await request
      .post("/nlq")
      .send({ question: "What is the age distribution?", federated: true });

    expect(res.status).toBe(200);
    const id = res.body.federationQueryId;
    expect(id).toMatch(UUID);
    expect(res.headers[FEDERATION_QUERY_HEADER.toLowerCase()]).toBe(id);
    expect(appendQueryAudit.mock.calls[0][0].federationQueryId).toBe(id);
    expect(idsSentToWorkspaces()).toEqual([id, id]);
  });

  it("gives a question of one SPE no federation id", async () => {
    mockRun.mockResolvedValue(fakeResult([{ ageGroup: "18-34", count: 40 }]));

    const res = await request
      .post("/nlq")
      .send({ question: "What is the age distribution?" });

    expect(res.status).toBe(200);
    expect(res.body.federationQueryId).toBeUndefined();
    expect(res.headers[FEDERATION_QUERY_HEADER.toLowerCase()]).toBeUndefined();
    expect(appendQueryAudit.mock.calls[0][0].federationQueryId).toBeUndefined();
  });
});

describe("the audit record", () => {
  it("names the federation id among its details", () => {
    const event = buildQueryAuditEvent(
      {
        question: "(federated)",
        cypher: "MATCH (p:Patient) RETURN count(p)",
        method: "federated",
        resultCount: 1,
        odrlEnforced: false,
        outcome: "success",
        federationQueryId: "3f1c2b9e-0d7a-4c55-9a51-6c2d8e0f4a11",
      },
      { id: "e1", recorded: "2026-11-25T00:00:00.000Z" },
    );
    expect(JSON.stringify(event)).toContain(
      '"type":"federationQueryId","valueString":"3f1c2b9e-0d7a-4c55-9a51-6c2d8e0f4a11"',
    );
  });
});

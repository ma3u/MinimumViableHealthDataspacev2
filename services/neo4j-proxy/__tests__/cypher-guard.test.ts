/**
 * #779: generated or caller-written Cypher may not read outside the graph.
 * A read-only session stops writes but not `LOAD CSV` or `apoc.load.*`
 * (measured 2026-10-31), so src/cypher-guard.ts refuses them before the
 * database is asked. And every NLQ audit record names the permit the query
 * ran under.
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

// The question reaches the LLM step: no template, no fulltext, no GraphRAG.
const llmText2Cypher = vi.fn();
vi.mock("../src/nlq/engine.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/nlq/engine.js")>()),
  matchTemplate: vi.fn(() => null),
  fulltextSearch: vi.fn(async () => null),
  llmText2Cypher: (...a: unknown[]) => llmText2Cypher(...a),
}));
vi.mock("../src/graphrag.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/graphrag.js")>()),
  runGraphRag: vi.fn(async () => null),
}));

vi.mock("neo4j-driver", () => ({
  default: {
    driver: vi.fn(() => mockDriver),
    auth: { basic: vi.fn() },
    int: vi.fn((n: number) => n),
    isInt: vi.fn(() => false),
  },
}));

const { refusedCypher } = await import("../src/cypher-guard.js");
const { auditPermits, buildQueryAuditEvent } = await import(
  "../src/audit-chain.js"
);
const { app, main } = await import("../src/index.js");
import supertest from "supertest";

const request = supertest(app);

const SCOPE = {
  participantId: "did:web:pharmaco.de:research",
  participantName: "PharmaCo Research AG",
  permissions: ["scientific_research"],
  prohibitions: [],
  accessibleDatasets: ["ds-1"],
  temporalLimit: null,
  policyIds: [],
  hasActiveContract: true,
  hdabApproved: true,
  permits: [
    {
      permitId: "permit-2026-017",
      datasetId: "ds-1",
      datasetTitle: "Diabetes cohort",
      purpose: "scientific_research",
      validUntil: null,
    },
  ],
};

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
  appendQueryAudit.mockClear();
  llmText2Cypher.mockReset();
});

describe("refusedCypher", () => {
  it.each([
    ['LOAD CSV FROM "file:///etc/passwd" AS row RETURN row'],
    ["load csv with headers from 'http://example.org/x.csv' as r return r"],
    [
      'CALL apoc.load.json("http://169.254.169.254/metadata") YIELD value RETURN value',
    ],
    ["CALL apoc.import.csv([], [], {})"],
    ["CALL apoc.export.csv.all('/tmp/all.csv', {})"],
    ["CALL apoc.cypher.run('LOAD CSV FROM \"file:///x\" AS r RETURN r', {})"],
    ["CALL apoc.periodic.iterate('MATCH (n) RETURN n', 'RETURN 1', {})"],
    ["CALL dbms.listConfig()"],
    ["LOAD/**/CSV FROM 'file:///x' AS r RETURN r"],
    [
      'MATCH (n) WHERE n.url = "http://a" CALL apoc.load.json(n.url) YIELD value RETURN value',
    ],
  ])("refuses a read outside the graph: %s", (cypher) => {
    expect(refusedCypher(cypher)).toBe("outside");
  });

  it("still refuses a write", () => {
    expect(refusedCypher("MATCH (n) DETACH DELETE n")).toBe("write");
    expect(refusedCypher('MATCH (n {url: "http://a"}) SET n.x = 1')).toBe(
      "write",
    );
  });

  it("lets graph reads through, apoc.path included", () => {
    expect(
      refusedCypher("MATCH (p:Patient)-[:HAS_CONDITION]->(c) RETURN count(p)"),
    ).toBeNull();
    expect(
      refusedCypher(
        "MATCH (s) CALL apoc.path.subgraphAll(s, {maxLevel: 2}) YIELD nodes RETURN nodes",
      ),
    ).toBeNull();
    expect(
      refusedCypher("MATCH (d:Dataset) WHERE d.loadedAt IS NOT NULL RETURN d"),
    ).toBeNull();
  });
});

describe("POST /nlq with LLM-written Cypher", () => {
  it("refuses LOAD CSV before the database is asked, and records it with the permit", async () => {
    llmText2Cypher.mockResolvedValue(
      'LOAD CSV FROM "file:///etc/passwd" AS row RETURN row',
    );

    const res = await request
      .post("/nlq")
      .send({ question: "show me the passwd file", odrlScope: SCOPE });

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/outside the graph/);
    expect(mockRun).not.toHaveBeenCalled();
    expect(appendQueryAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: "refused",
        reason: "reads outside the graph (#779)",
        permits: [
          { permitId: "permit-2026-017", purpose: "scientific_research" },
        ],
      }),
    );
  });
});

describe("POST /federated/query", () => {
  it("refuses apoc.load.json before any SPE is asked", async () => {
    const res = await request.post("/federated/query").send({
      cypher:
        'CALL apoc.load.json("http://169.254.169.254/metadata") YIELD value RETURN value',
      odrlScope: SCOPE,
    });

    expect(res.status).toBe(403);
    expect(mockRun).not.toHaveBeenCalled();
    expect(appendQueryAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: "refused",
        permits: [
          { permitId: "permit-2026-017", purpose: "scientific_research" },
        ],
      }),
    );
  });

  it("records the permit with an answered query", async () => {
    mockRun.mockResolvedValue({
      records: Array.from({ length: 6 }, () => ({
        keys: ["cohort"],
        get: () => 42,
      })),
    });

    const res = await request.post("/federated/query").send({
      cypher: "MATCH (p:Patient) RETURN count(p) AS cohort",
      odrlScope: SCOPE,
    });

    expect(res.status).toBe(200);
    expect(appendQueryAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: "success",
        permits: [
          { permitId: "permit-2026-017", purpose: "scientific_research" },
        ],
      }),
    );
  });
});

describe("the permit in the audit record", () => {
  it("takes id and purpose from the scope, nothing else", () => {
    expect(auditPermits(SCOPE)).toEqual([
      { permitId: "permit-2026-017", purpose: "scientific_research" },
    ]);
    expect(auditPermits(undefined)).toBeUndefined();
    expect(auditPermits({ permits: [] })).toBeUndefined();
  });

  it("puts the permit ids and purposes into the AuditEvent", () => {
    const event = JSON.stringify(
      buildQueryAuditEvent(
        {
          participantId: SCOPE.participantId,
          question: "q",
          cypher: "MATCH (n) RETURN count(n)",
          method: "llm",
          resultCount: 1,
          odrlEnforced: true,
          outcome: "success",
          permits: [
            { permitId: "permit-2026-017", purpose: "scientific_research" },
            { permitId: "permit-2026-020", purpose: null },
          ],
        },
        { id: "e1", recorded: "2026-11-24T08:00:00.000Z" },
      ),
    );
    expect(event).toContain('"type":"permitIds"');
    expect(event).toContain("permit-2026-017,permit-2026-020");
    expect(event).toContain('"type":"permitPurposes"');
    expect(event).toContain("scientific_research,");
  });
});

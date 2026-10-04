/**
 * The trail can be read and checked by an operator or a dashboard
 * (ADR-045 plane 2, #418): chain verification, and the newest records
 * summarised without any question text.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  chainEvent,
  GENESIS_HASH,
  buildQueryAuditEvent,
  type ChainedEvent,
} from "../src/audit-chain.js";
import { buildDspAuditEvent } from "../src/dsp-audit.js";

const readChain = vi.fn();
const readRecent = vi.fn();
const chainStats = vi.fn();
vi.mock("../src/audit-chain.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/audit-chain.js")>()),
  readChain: (...a: unknown[]) => readChain(...a),
  readRecent: (...a: unknown[]) => readRecent(...a),
  chainStats: (...a: unknown[]) => chainStats(...a),
}));
vi.mock("neo4j-driver", () => ({
  default: {
    driver: vi.fn(),
    auth: { basic: vi.fn() },
    int: vi.fn((n: number) => n),
    isInt: vi.fn(() => false),
  },
}));

const { app } = await import("../src/index.js");
import supertest from "supertest";
const request = supertest(app);

const META = { id: "x", recorded: "2026-10-04T18:00:00.000Z" };
const transfer = buildDspAuditEvent(
  {
    process: "transfer-process",
    event: "started",
    outcome: "success",
    source: "edc-callback",
    processId: "tp-789",
    agreementId: "agr-456",
    permitId: "permit-1",
    consumerId: "did:web:pharmaco.de:research",
  },
  META,
);
const query = buildQueryAuditEvent(
  {
    participantId: "did:web:pharmaco.de:research",
    question: "how many patients named Erika Mustermann",
    cypher: "MATCH (p:Patient {name: 'Erika'}) RETURN count(p)",
    method: "llm",
    resultCount: 1,
    odrlEnforced: true,
    outcome: "success",
  },
  META,
);

function chainOf(resources: Record<string, unknown>[], chain: string) {
  const events: ChainedEvent[] = [];
  let prev = GENESIS_HASH;
  resources.forEach((r, i) => {
    const e = chainEvent(r, chain, i + 1, prev);
    events.push(e);
    prev = e.hash;
  });
  return events;
}

beforeEach(() => {
  readChain.mockReset();
  readRecent.mockReset();
  chainStats.mockReset();
});

describe("GET /audit/chains/:chain/verify", () => {
  it("reports an intact chain with its count and head", async () => {
    const events = chainOf([transfer, transfer], "dsp");
    readChain.mockResolvedValue(events);
    const res = await request.get("/audit/chains/dsp/verify");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      chain: "dsp",
      ok: true,
      count: 2,
      head: events[1].hash,
    });
  });

  it("reports the first altered record", async () => {
    const events = chainOf([transfer, transfer], "dsp");
    events[1] = { ...events[1], resource: { ...transfer, outcome: "8" } };
    readChain.mockResolvedValue(events);
    const res = await request.get("/audit/chains/dsp/verify");
    expect(res.body).toMatchObject({ ok: false, seq: 2 });
  });

  it("knows only the query and dsp chains", async () => {
    const res = await request.get("/audit/chains/other/verify");
    expect(res.status).toBe(404);
    expect(readChain).not.toHaveBeenCalled();
  });
});

describe("GET /audit/chains/:chain/events", () => {
  it("summarises a transfer record with its agreement, permit and parties", async () => {
    readRecent.mockResolvedValue(chainOf([transfer], "dsp"));
    const res = await request.get("/audit/chains/dsp/events?limit=5");
    expect(readRecent).toHaveBeenCalledWith("dsp", 5);
    expect(res.body[0]).toMatchObject({
      seq: 1,
      type: "transfer-process.started",
      outcome: "0",
      source: "edc-callback",
      agents: expect.arrayContaining(["did:web:pharmaco.de:research"]),
      entities: {
        "edc:transfer-process": "tp-789",
        "edc:contract-agreement": "agr-456",
        "ehds:data-permit": "permit-1",
      },
    });
  });

  it("shows no question or Cypher text for a query record", async () => {
    readRecent.mockResolvedValue(chainOf([query], "query"));
    const res = await request.get("/audit/chains/query/events");
    const body = JSON.stringify(res.body);
    expect(res.body[0].type).toBe("search");
    expect(body).not.toContain("Erika");
    expect(body).not.toContain("MATCH");
  });

  it("caps the page at 500 records", async () => {
    readRecent.mockResolvedValue([]);
    await request.get("/audit/chains/dsp/events?limit=100000");
    expect(readRecent).toHaveBeenCalledWith("dsp", 500);
  });
});

describe("GET /audit/chains/:chain/stats", () => {
  it("counts the dashboard's time range, in about 60 buckets", async () => {
    chainStats.mockResolvedValue({ totals: [], series: [] });
    const from = 1_791_000_000_000;
    const to = from + 6 * 3600 * 1000;
    const res = await request.get(
      `/audit/chains/dsp/stats?from=${from}&to=${to}`,
    );
    expect(res.status).toBe(200);
    expect(chainStats).toHaveBeenCalledWith("dsp", from, to, 360);
  });

  it("refuses a range that ends before it starts", async () => {
    const res = await request.get("/audit/chains/dsp/stats?from=2000&to=1000");
    expect(res.status).toBe(400);
    expect(chainStats).not.toHaveBeenCalled();
  });
});

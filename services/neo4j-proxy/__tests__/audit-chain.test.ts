/**
 * The query audit chain (ADR-045 plane 2, #418): canonical JSON, the FHIR
 * AuditEvent it writes, the hash chain and its verification, and the
 * serialised append against Neo4j.
 */
import { describe, it, expect, vi } from "vitest";
import {
  GENESIS_HASH,
  QUERY_CHAIN,
  appendQueryAudit,
  buildQueryAuditEvent,
  canonicalJson,
  chainEvent,
  sha256Hex,
  verifyChain,
  type ChainedEvent,
  type QueryAuditInput,
} from "../src/audit-chain.js";
import { setDriver } from "../src/db.js";

const QUESTION =
  "Which conditions does Erika Mustermann, born 1961-03-04, have?";
const CYPHER = "MATCH (p:Patient {name: 'Erika Mustermann'}) RETURN p";

const input = (over: Partial<QueryAuditInput> = {}): QueryAuditInput => ({
  participantId: "did:web:pharmaco.de:research",
  question: QUESTION,
  cypher: CYPHER,
  method: "template",
  resultCount: 3,
  odrlEnforced: true,
  outcome: "success",
  ...over,
});

function chainOf(n: number): ChainedEvent[] {
  const out: ChainedEvent[] = [];
  let prev = GENESIS_HASH;
  for (let seq = 1; seq <= n; seq++) {
    const resource = buildQueryAuditEvent(input({ resultCount: seq }), {
      id: `id-${seq}`,
      recorded: `2026-10-04T12:00:0${seq}.000Z`,
    });
    const e = chainEvent(resource, QUERY_CHAIN, seq, prev);
    out.push(e);
    prev = e.hash;
  }
  return out;
}

describe("canonicalJson (RFC 8785)", () => {
  it("sorts keys at every level and leaves arrays in order", () => {
    expect(canonicalJson({ b: 1, a: { d: [3, 1], c: null } })).toBe(
      '{"a":{"c":null,"d":[3,1]},"b":1}',
    );
  });

  it("serialises numbers and strings the ECMAScript way", () => {
    expect(canonicalJson([1.0, 1e21, -0.5, "é\n"])).toBe(
      '[1,1e+21,-0.5,"é\\n"]',
    );
  });

  it("drops undefined members and refuses what JSON cannot hold", () => {
    expect(canonicalJson({ a: undefined, b: true })).toBe('{"b":true}');
    expect(() => canonicalJson(Number.NaN)).toThrow();
  });

  it("gives the same text for the same content in any key order", () => {
    expect(canonicalJson({ x: 1, y: 2 })).toBe(canonicalJson({ y: 2, x: 1 }));
  });
});

describe("buildQueryAuditEvent", () => {
  const event = buildQueryAuditEvent(input(), {
    id: "e1",
    recorded: "2026-10-04T12:00:00.000Z",
  });
  const text = JSON.stringify(event);

  it("is a BALP Query AuditEvent", () => {
    expect(event.resourceType).toBe("AuditEvent");
    expect(text).toContain("IHE.BasicAudit.Query");
    expect(event.action).toBe("E");
    expect(event.outcome).toBe("0");
  });

  it("holds neither the question nor the Cypher, only their hashes", () => {
    expect(text).not.toContain("Erika");
    expect(text).not.toContain("1961");
    expect(text).not.toContain("MATCH");
    expect(text).toContain(sha256Hex(QUESTION));
    expect(text).toContain(sha256Hex(CYPHER));
  });

  it("marks a refused query as a failure with its reason", () => {
    const refused = buildQueryAuditEvent(
      input({
        outcome: "refused",
        reason: "ODRL re-identification prohibition",
      }),
      { id: "e2", recorded: "2026-10-04T12:00:00.000Z" },
    );
    expect(refused.outcome).toBe("4");
    expect(refused.outcomeDesc).toBe("ODRL re-identification prohibition");
  });

  it("records federated contributors and suppression", () => {
    const fed = JSON.stringify(
      buildQueryAuditEvent(
        input({
          federated: {
            contributors: ["SPE-1", "SPE-2"],
            aggregateSuppressed: true,
            suppressionReason: "contributor_k_violation",
          },
        }),
        { id: "e3", recorded: "2026-10-04T12:00:00.000Z" },
      ),
    );
    expect(fed).toContain("SPE-1,SPE-2");
    expect(fed).toContain("contributor_k_violation");
  });
});

describe("verifyChain", () => {
  it("accepts an untouched chain and reports its head", () => {
    const chain = chainOf(3);
    expect(verifyChain(chain)).toEqual({
      ok: true,
      count: 3,
      head: chain[2].hash,
    });
  });

  it("accepts the empty chain", () => {
    expect(verifyChain([])).toEqual({ ok: true, count: 0, head: GENESIS_HASH });
  });

  it("finds a record whose content was changed", () => {
    const chain = chainOf(3);
    chain[1] = {
      ...chain[1],
      resource: { ...chain[1].resource, outcome: "4" },
    };
    expect(verifyChain(chain)).toMatchObject({ ok: false, seq: 2 });
  });

  it("finds a record that was removed", () => {
    const chain = chainOf(3);
    chain.splice(1, 1);
    expect(verifyChain(chain)).toMatchObject({ ok: false, seq: 3 });
  });

  it("finds a record re-hashed after a change, by the next record's link", () => {
    const chain = chainOf(3);
    const forged = chainEvent(
      { ...chain[1].resource, outcome: "4" },
      QUERY_CHAIN,
      2,
      chain[1].prevHash,
    );
    chain[1] = forged;
    expect(verifyChain(chain)).toMatchObject({ ok: false, seq: 3 });
  });
});

describe("appendQueryAudit", () => {
  function fakeDriver(head: { seq: number; head: string }) {
    const run = vi
      .fn()
      .mockResolvedValueOnce({
        records: [{ get: (k: string) => (k === "seq" ? head.seq : head.head) }],
      })
      .mockResolvedValueOnce({ records: [] });
    const executeWrite = vi.fn(
      async (work: (tx: { run: typeof run }) => unknown) => work({ run }),
    );
    const close = vi.fn();
    return {
      run,
      close,
      driver: { session: vi.fn(() => ({ executeWrite, close })) },
    };
  }

  it("locks the head, extends it by one and stores the hash", async () => {
    const prev = "a".repeat(64);
    const fake = fakeDriver({ seq: 41, head: prev });
    setDriver(fake.driver as never);

    const event = await appendQueryAudit(input());

    expect(fake.run.mock.calls[0][0]).toMatch(
      /SET c\.lockedAt[\s\S]*RETURN c\.seq/,
    );
    expect(event.seq).toBe(42);
    expect(event.prevHash).toBe(prev);
    expect(event.hash).toBe(
      chainEvent(event.resource, QUERY_CHAIN, 42, prev).hash,
    );
    const written = fake.run.mock.calls[1][1];
    expect(written.hash).toBe(event.hash);
    expect(written.resource).not.toContain("Erika");
    expect(fake.close).toHaveBeenCalled();
  });

  it("rejects when the write fails, so the caller can refuse to answer", async () => {
    const close = vi.fn();
    setDriver({
      session: () => ({
        executeWrite: vi.fn().mockRejectedValue(new Error("Neo4j unavailable")),
        close,
      }),
    } as never);
    await expect(appendQueryAudit(input())).rejects.toThrow(
      "Neo4j unavailable",
    );
    expect(close).toHaveBeenCalled();
  });
});

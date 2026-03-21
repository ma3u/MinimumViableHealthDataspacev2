/**
 * Tests for /api/tasks/route.ts — Task aggregation API
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock edcClient
const mockManagement = vi.fn();
vi.mock("@/lib/edc", () => ({
  edcClient: {
    management: (...args: unknown[]) => mockManagement(...args),
  },
  EDC_CONTEXT: "https://w3id.org/edc/v0.0.1/ns/",
}));

// Mock fetch for neo4j-proxy fallback & sync
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// Mock fs for mock data fallback
vi.mock("fs", () => ({
  default: {},
  promises: {
    readFile: vi.fn().mockRejectedValue(new Error("No mock file")),
  },
}));

import { GET } from "@/app/api/tasks/route";

describe("/api/tasks GET", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockResolvedValue({ ok: false }); // default: sync fails silently
  });

  it("returns empty tasks when no participants found", async () => {
    mockManagement.mockResolvedValueOnce([]);
    const res = await GET();
    const data = await res.json();

    expect(data.tasks).toEqual([]);
    expect(data.counts).toEqual({
      total: 0,
      negotiations: 0,
      transfers: 0,
      active: 0,
    });
  });

  it("returns empty tasks when participants is not an array", async () => {
    mockManagement.mockResolvedValueOnce(null);
    const res = await GET();
    const data = await res.json();
    expect(data.tasks).toEqual([]);
  });

  it("aggregates negotiations from participants", async () => {
    mockManagement
      .mockResolvedValueOnce([
        {
          "@id": "ctx-1",
          participantId: "did:web:example.com:alpha-klinik",
        },
      ])
      // negotiations for ctx-1
      .mockResolvedValueOnce([
        {
          "@id": "neg-1",
          state: "FINALIZED",
          assetId: "fhir-r4-bundle",
          counterPartyId: "did:web:example.com:pharmaco",
          stateTimestamp: 1000,
          contractAgreementId: "contract-1",
        },
      ])
      // transfers for ctx-1
      .mockResolvedValueOnce([]);

    const res = await GET();
    const data = await res.json();

    expect(data.tasks).toHaveLength(1);
    expect(data.tasks[0].type).toBe("negotiation");
    expect(data.tasks[0].participant).toBe("AlphaKlinik Berlin");
    expect(data.tasks[0].state).toBe("FINALIZED");
    expect(data.tasks[0].counterParty).toContain("PharmaCo");
    expect(data.counts.negotiations).toBe(1);
    expect(data.counts.transfers).toBe(0);
  });

  it("aggregates transfers with EDR detection", async () => {
    mockManagement
      .mockResolvedValueOnce([
        { "@id": "ctx-2", participantId: "did:web:example.com:pharmaco" },
      ])
      .mockResolvedValueOnce([]) // negotiations
      .mockResolvedValueOnce([
        {
          "@id": "tx-1",
          state: "STARTED",
          assetId: "omop-cohort",
          stateTimestamp: 2000,
          contractId: "contract-2",
          counterPartyId: "did:web:example.com:alpha-klinik",
          contentDataAddress: {
            "https://w3id.org/edc/v0.0.1/ns/endpoint":
              "http://dp-omop:11012/pull",
          },
          transferType: "HttpData-PULL",
        },
      ]);

    const res = await GET();
    const data = await res.json();

    expect(data.tasks).toHaveLength(1);
    expect(data.tasks[0].type).toBe("transfer");
    expect(data.tasks[0].edrAvailable).toBe(true);
    expect(data.tasks[0].transferType).toBe("HttpData-PULL");
    expect(data.counts.active).toBe(1); // STARTED is active
  });

  it("marks EDR unavailable for non-STARTED transfers", async () => {
    mockManagement
      .mockResolvedValueOnce([{ "@id": "ctx-1", participantId: "test:did" }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          "@id": "tx-2",
          state: "COMPLETED",
          assetId: "test-asset",
          stateTimestamp: 3000,
          contentDataAddress: {
            "https://w3id.org/edc/v0.0.1/ns/endpoint": "http://example.com",
          },
        },
      ]);

    const res = await GET();
    const data = await res.json();

    expect(data.tasks[0].edrAvailable).toBe(false);
    expect(data.counts.active).toBe(0); // COMPLETED is not active
  });

  it("sorts tasks by timestamp descending", async () => {
    mockManagement
      .mockResolvedValueOnce([{ "@id": "ctx-1", participantId: "did:1" }])
      .mockResolvedValueOnce([
        { "@id": "n1", state: "REQUESTED", stateTimestamp: 100, assetId: "a" },
        { "@id": "n2", state: "AGREED", stateTimestamp: 300, assetId: "b" },
        {
          "@id": "n3",
          state: "FINALIZED",
          stateTimestamp: 200,
          assetId: "c",
        },
      ])
      .mockResolvedValueOnce([]);

    const res = await GET();
    const data = await res.json();

    expect(data.tasks[0].timestamp).toBe(300);
    expect(data.tasks[1].timestamp).toBe(200);
    expect(data.tasks[2].timestamp).toBe(100);
  });

  it("handles edc-prefixed fields", async () => {
    mockManagement
      .mockResolvedValueOnce([{ "@id": "ctx-1", participantId: "did:1" }])
      .mockResolvedValueOnce([
        {
          "@id": "n4",
          "edc:state": "OFFERED",
          "edc:assetId": "my-asset",
          "edc:stateTimestamp": 500,
          "edc:counterPartyId": "did:web:example.com:lmc",
        },
      ])
      .mockResolvedValueOnce([]);

    const res = await GET();
    const data = await res.json();

    expect(data.tasks[0].state).toBe("OFFERED");
    expect(data.tasks[0].counterParty).toBe("Limburg Medical Centre"); // lmc → SLUG_NAMES["lmc"]
  });

  it("handles negotiation and transfer fetch failures gracefully", async () => {
    mockManagement
      .mockResolvedValueOnce([{ "@id": "ctx-1", participantId: "did:1" }])
      .mockRejectedValueOnce(new Error("EDC unavailable")) // negotiations fail
      .mockRejectedValueOnce(new Error("EDC unavailable")); // transfers fail

    const res = await GET();
    const data = await res.json();

    expect(data.tasks).toEqual([]);
    expect(data.counts.total).toBe(0);
  });

  it("falls back to neo4j-proxy when EDC-V is completely offline", async () => {
    mockManagement.mockRejectedValueOnce(new Error("Connection refused"));

    mockFetch
      // sync call won't happen
      // persistent fallback
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            tasks: [{ id: "fallback-1", type: "negotiation" }],
            counts: { total: 1, negotiations: 1, transfers: 0, active: 0 },
          }),
      });

    const res = await GET();
    const data = await res.json();

    expect(data.tasks).toHaveLength(1);
    expect(data.tasks[0].id).toBe("fallback-1");
  });

  it("computes active count excluding terminal states", async () => {
    mockManagement
      .mockResolvedValueOnce([{ "@id": "ctx-1", participantId: "did:1" }])
      .mockResolvedValueOnce([
        { "@id": "n1", state: "REQUESTED", stateTimestamp: 1, assetId: "a" },
        { "@id": "n2", state: "FINALIZED", stateTimestamp: 2, assetId: "b" },
        { "@id": "n3", state: "TERMINATED", stateTimestamp: 3, assetId: "c" },
        { "@id": "n4", state: "AGREED", stateTimestamp: 4, assetId: "d" },
      ])
      .mockResolvedValueOnce([
        { "@id": "t1", state: "STARTED", stateTimestamp: 5, assetId: "e" },
        { "@id": "t2", state: "COMPLETED", stateTimestamp: 6, assetId: "f" },
      ]);

    const res = await GET();
    const data = await res.json();

    expect(data.counts.total).toBe(6);
    expect(data.counts.active).toBe(3); // REQUESTED + AGREED + STARTED
    expect(data.counts.negotiations).toBe(4);
    expect(data.counts.transfers).toBe(2);
  });
});

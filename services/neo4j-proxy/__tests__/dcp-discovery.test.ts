/**
 * Phase 26a (issue #8) — DCP trust-anchor discovery loop.
 * Verifies dcpDiscoveryTick() pulls the trust anchor, filters non-DID
 * entries, and MERGEs :Participant {source: 'dcp'} rows idempotently.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";

process.env.DCP_DISCOVERY_URL = "http://trust-anchor.test/participants";

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

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

const { app, main, dcpDiscoveryTick } = await import("../src/index.js");

beforeAll(async () => {
  vi.spyOn(app, "listen").mockImplementation(
    (_port: unknown, cb?: () => void) => {
      if (cb) cb();
      return { close: vi.fn() } as never;
    },
  );
  mockFetch.mockResolvedValue({ ok: true, json: async () => [] });
  await main();
});

beforeEach(() => {
  mockRun.mockReset();
  mockFetch.mockReset();
});

describe("dcpDiscoveryTick", () => {
  it("MERGEs trust-anchor participants as source 'dcp'", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        participants: [
          {
            did: "did:web:riverside-general.example:clinic",
            name: "Riverside General",
            country: "DE",
            dspCatalogUrl: "https://riverside-general.example/api/dsp/catalog",
          },
          { did: "not-a-did", name: "Bogus" },
          { name: "No DID at all" },
        ],
      }),
    });
    mockRun.mockResolvedValue({ records: [] });

    const upserted = await dcpDiscoveryTick();

    expect(upserted).toBe(1);
    const [cypher, params] = mockRun.mock.calls[0];
    expect(cypher).toContain("MERGE (p:Participant {participantId: row.did})");
    expect(cypher).toContain("p.source = 'dcp'");
    expect(params.rows).toEqual([
      {
        did: "did:web:riverside-general.example:clinic",
        name: "Riverside General",
        walletType: "business",
        country: "DE",
        dspCatalogUrl: "https://riverside-general.example/api/dsp/catalog",
      },
    ]);
  });

  it("returns 0 without writing when the anchor has no valid entries", async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => [] });
    expect(await dcpDiscoveryTick()).toBe(0);
    expect(mockRun).not.toHaveBeenCalled();
  });

  it("throws on a non-2xx trust anchor response", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 503 });
    await expect(dcpDiscoveryTick()).rejects.toThrow(/503/);
  });
});

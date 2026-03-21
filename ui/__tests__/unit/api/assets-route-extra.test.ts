/**
 * Extra coverage tests for /api/assets route.
 *
 * Targets uncovered lines: 45 (loadMockAssets success), 105 (per-participant
 * asset-fetch catch), 117-127 (mock-asset merge/dedup logic).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Track fs mock so individual tests can override behaviour
const mockReadFile = vi.fn();

vi.mock("fs", () => ({
  default: { promises: { readFile: (...a: unknown[]) => mockReadFile(...a) } },
  promises: { readFile: (...a: unknown[]) => mockReadFile(...a) },
}));

vi.mock("@/lib/edc", () => ({
  edcClient: { management: vi.fn() },
  EDC_CONTEXT: "https://w3id.org/edc/connector/management/v2",
}));

import { edcClient } from "@/lib/edc";
import { GET, POST } from "@/app/api/assets/route";

const mockManagement = vi.mocked(edcClient.management);

describe("/api/assets – extra coverage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: no mock file
    mockReadFile.mockRejectedValue(new Error("no mock file"));
  });

  // ── loadMockAssets success path (line 45) ──────────────────────────────

  it("GET aggregation merges successfully-loaded mock assets for new identities", async () => {
    // EDC returns one active participant with one asset
    mockManagement
      .mockResolvedValueOnce([
        { "@id": "ctx-1", identity: "did:web:spe-1", state: "ACTIVATED" },
      ])
      .mockResolvedValueOnce([{ "@id": "asset-1", properties: { name: "A" } }]);

    // Mock file returns a participant whose identity is NOT in the real set
    mockReadFile.mockResolvedValue(
      JSON.stringify([
        {
          participantId: "mock-ctx",
          identity: "did:web:mock-only",
          assets: [{ "@id": "mock-asset-1", name: "Mock" }],
        },
      ]),
    );

    const res = await GET(new NextRequest("http://localhost/api/assets"));
    const data = await res.json();

    expect(res.status).toBe(200);
    // Should contain both the real participant and the mock-only one
    expect(data).toHaveLength(2);
    expect(data.map((d: { identity: string }) => d.identity)).toContain(
      "did:web:mock-only",
    );
  });

  // ── Per-participant asset-fetch catch (line 105) ───────────────────────

  it("GET catches per-participant asset errors and returns empty assets array", async () => {
    mockManagement
      .mockResolvedValueOnce([
        { "@id": "ctx-ok", identity: "did:web:ok", state: "ACTIVATED" },
        { "@id": "ctx-bad", identity: "did:web:bad", state: "ACTIVATED" },
      ])
      // First participant's assets succeed
      .mockResolvedValueOnce([{ "@id": "a1", properties: { name: "Good" } }])
      // Second participant's assets fail
      .mockRejectedValueOnce(new Error("timeout"));

    const res = await GET(new NextRequest("http://localhost/api/assets"));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toHaveLength(2);
    // The failed participant still appears with an empty assets array
    const bad = data.find(
      (d: { participantId: string }) => d.participantId === "ctx-bad",
    );
    expect(bad).toBeDefined();
    expect(bad.assets).toEqual([]);
  });

  // ── Mock-asset merge with matching identity (lines 117-127) ────────────

  it("GET merges mock assets into real participant, deduplicating by @id", async () => {
    mockManagement
      .mockResolvedValueOnce([
        { "@id": "ctx-1", identity: "did:web:shared", state: "ACTIVATED" },
      ])
      .mockResolvedValueOnce([
        { "@id": "dup-asset", properties: { name: "Real" } },
      ]);

    // Mock file has the same identity with one duplicate and one new asset
    mockReadFile.mockResolvedValue(
      JSON.stringify([
        {
          participantId: "mock-ctx",
          identity: "did:web:shared",
          assets: [
            { "@id": "dup-asset", name: "DuplicateIgnored" },
            { "@id": "new-mock-asset", name: "ExtraMock" },
          ],
        },
      ]),
    );

    const res = await GET(new NextRequest("http://localhost/api/assets"));
    const data = await res.json();

    expect(res.status).toBe(200);
    // Only one participant entry (merged)
    expect(data).toHaveLength(1);
    const entry = data[0];
    // Contains the real asset + the new mock asset, but NOT the duplicate
    const ids = entry.assets.map((a: { "@id": string }) => a["@id"]);
    expect(ids).toContain("dup-asset");
    expect(ids).toContain("new-mock-asset");
    expect(ids).toHaveLength(2);
  });

  it("GET adds mock participant when its identity has no real match", async () => {
    mockManagement
      .mockResolvedValueOnce([
        { "@id": "ctx-1", identity: "did:web:real", state: "ACTIVATED" },
      ])
      .mockResolvedValueOnce([]);

    mockReadFile.mockResolvedValue(
      JSON.stringify([
        {
          participantId: "m1",
          identity: "did:web:only-in-mock",
          assets: [{ "@id": "m-a1" }],
        },
      ]),
    );

    const res = await GET(new NextRequest("http://localhost/api/assets"));
    const data = await res.json();

    expect(data).toHaveLength(2);
    expect(
      data.find(
        (d: { identity: string }) => d.identity === "did:web:only-in-mock",
      ),
    ).toBeDefined();
  });

  // ── normaliseAsset fallback branches ───────────────────────────────────

  it("GET normalises assets using top-level edc:* fields when properties is absent", async () => {
    mockManagement.mockResolvedValue([
      {
        "@id": "legacy-1",
        "edc:name": "LegacyName",
        "edc:description": "LegacyDesc",
        "edc:contenttype": "text/plain",
      },
    ]);

    const res = await GET(
      new NextRequest("http://localhost/api/assets?participantId=p1"),
    );
    const data = await res.json();

    expect(data[0].name).toBe("LegacyName");
    expect(data[0].description).toBe("LegacyDesc");
    expect(data[0].contenttype).toBe("text/plain");
    expect(data[0]["edc:name"]).toBe("LegacyName");
  });

  it("GET normalises asset falling back to @id when no name fields exist", async () => {
    mockManagement.mockResolvedValue([{ "@id": "bare-asset" }]);

    const res = await GET(
      new NextRequest("http://localhost/api/assets?participantId=p1"),
    );
    const data = await res.json();

    expect(data[0].name).toBe("bare-asset");
    expect(data[0]["edc:name"]).toBe("bare-asset");
    expect(data[0].description).toBe("");
    expect(data[0].contenttype).toBe("");
  });

  // ── Aggregation with null/non-array participants response ──────────────

  it("GET handles non-array participants response gracefully", async () => {
    // EDC returns null or a non-array value
    mockManagement.mockResolvedValueOnce(null);

    const res = await GET(new NextRequest("http://localhost/api/assets"));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(Array.isArray(data)).toBe(true);
  });

  it("GET filters out non-ACTIVATED participants from aggregation", async () => {
    mockManagement.mockResolvedValueOnce([
      { "@id": "active", identity: "did:web:a", state: "ACTIVATED" },
      { "@id": "stale", identity: "did:web:b", state: "CREATED" },
    ]);
    // Only the ACTIVATED participant's assets are fetched
    mockManagement.mockResolvedValueOnce([{ "@id": "a1" }]);

    const res = await GET(new NextRequest("http://localhost/api/assets"));
    const data = await res.json();

    expect(data).toHaveLength(1);
    expect(data[0].participantId).toBe("active");
  });

  it("GET treats missing state as ACTIVATED (default)", async () => {
    mockManagement
      .mockResolvedValueOnce([{ "@id": "no-state", identity: "did:web:ns" }])
      .mockResolvedValueOnce([]);

    const res = await GET(new NextRequest("http://localhost/api/assets"));
    const data = await res.json();

    expect(data).toHaveLength(1);
    expect(data[0].participantId).toBe("no-state");
  });

  // ── Outer catch: full EDC failure falls back to mock data (line 45) ────

  it("GET falls back to mock data when outer EDC call fails and mock file available", async () => {
    mockManagement.mockRejectedValue(new Error("ECONNREFUSED"));
    mockReadFile.mockResolvedValue(
      JSON.stringify([
        { participantId: "fb", identity: "did:web:fb", assets: [] },
      ]),
    );

    const res = await GET(new NextRequest("http://localhost/api/assets"));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toHaveLength(1);
    expect(data[0].participantId).toBe("fb");
  });

  // ── POST: defaults when optional fields omitted ────────────────────────

  it("POST uses default description and contentType when not provided", async () => {
    mockManagement.mockResolvedValue({ "@id": "asset-def" });

    const req = new NextRequest("http://localhost/api/assets", {
      method: "POST",
      body: JSON.stringify({
        participantId: "p1",
        assetId: "asset-def",
        name: "Minimal",
      }),
    });
    const res = await POST(req);

    expect(res.status).toBe(201);
    expect(mockManagement).toHaveBeenCalledWith(
      "/v5alpha/participants/p1/assets",
      "POST",
      expect.objectContaining({
        properties: expect.objectContaining({
          description: "",
          contenttype: "application/json",
        }),
        dataAddress: expect.objectContaining({
          baseUrl: "http://neo4j-proxy:9090",
        }),
      }),
    );
  });

  it("POST returns 400 when assetId is missing", async () => {
    const req = new NextRequest("http://localhost/api/assets", {
      method: "POST",
      body: JSON.stringify({ participantId: "p1", name: "NoId" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("POST returns 400 when name is missing", async () => {
    const req = new NextRequest("http://localhost/api/assets", {
      method: "POST",
      body: JSON.stringify({ participantId: "p1", assetId: "a1" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("GET returns null-safe normalised assets when management returns null", async () => {
    mockManagement.mockResolvedValue(null);

    const res = await GET(
      new NextRequest("http://localhost/api/assets?participantId=p1"),
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toEqual([]);
  });
});

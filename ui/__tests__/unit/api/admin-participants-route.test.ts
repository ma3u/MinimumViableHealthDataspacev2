/**
 * Unit tests for /api/admin/participants — Phase 26a participant directory
 * (issue #8). Covers RBAC, listing with summary, POST validation, and the
 * seed-protection rule on DELETE.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { getServerSession } from "next-auth/next";

const mockRunQuery = vi.fn();
vi.mock("@/lib/neo4j", () => ({
  runQuery: (...args: unknown[]) => mockRunQuery(...args),
}));

import { GET, POST, DELETE } from "@/app/api/admin/participants/route";

const PARTICIPANT_ROW = {
  participantId: "did:web:alpha-klinik.de:participant",
  name: "AlphaKlinik Berlin",
  participantType: "DATA_HOLDER",
  source: "seed",
  walletType: "business",
  country: "DE",
  dspCatalogUrl: "https://ehds.mabu.red/api/mock-dsp/alpha-klinik",
  crawlerEnabled: true,
  onboardedAt: "2026-01-15T09:00:00Z",
  datasetCount: 6,
};

function postRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/admin/participants", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

function deleteRequest(id?: string): NextRequest {
  const url = new URL("http://localhost/api/admin/participants");
  if (id) url.searchParams.set("id", id);
  return new NextRequest(url, { method: "DELETE" });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getServerSession).mockResolvedValue({
    user: { name: "Test Admin" },
    roles: ["EDC_ADMIN"],
  } as never);
});

describe("GET /api/admin/participants", () => {
  it("returns 401 without a session", async () => {
    vi.mocked(getServerSession).mockResolvedValue(null as never);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-admin roles", async () => {
    vi.mocked(getServerSession).mockResolvedValue({
      user: { name: "Researcher" },
      roles: ["DATA_USER"],
    } as never);
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it("lists participants with a source summary", async () => {
    mockRunQuery.mockResolvedValue([
      PARTICIPANT_ROW,
      {
        ...PARTICIPANT_ROW,
        participantId: "did:web:riverside-general.example:clinic",
        name: "Riverside General",
        source: "dcp",
      },
      {
        ...PARTICIPANT_ROW,
        participantId: "did:web:medreg.de:hdab",
        name: "MedReg DE",
        dspCatalogUrl: null,
        crawlerEnabled: false,
      },
    ]);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.participants).toHaveLength(3);
    expect(body.summary).toEqual({
      total: 3,
      crawlable: 2,
      bySource: { seed: 2, dcp: 1 },
    });
  });

  it("returns 502 when Neo4j is unreachable", async () => {
    mockRunQuery.mockRejectedValue(new Error("connection refused"));
    const res = await GET();
    expect(res.status).toBe(502);
  });
});

describe("POST /api/admin/participants", () => {
  it("rejects a non-DID participantId", async () => {
    const res = await POST(
      postRequest({ participantId: "not-a-did", name: "X" }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/DID/);
  });

  it("rejects a missing name", async () => {
    const res = await POST(
      postRequest({ participantId: "did:web:x.example", name: "" }),
    );
    expect(res.status).toBe(400);
  });

  it("rejects an unknown walletType", async () => {
    const res = await POST(
      postRequest({
        participantId: "did:web:x.example",
        name: "X",
        walletType: "corporate",
      }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/walletType/);
  });

  it("rejects a non-http dspCatalogUrl", async () => {
    const res = await POST(
      postRequest({
        participantId: "did:web:x.example",
        name: "X",
        dspCatalogUrl: "ftp://nope",
      }),
    );
    expect(res.status).toBe(400);
  });

  it("MERGEs a valid participant and returns 201", async () => {
    mockRunQuery.mockResolvedValue([]);
    const res = await POST(
      postRequest({
        participantId: "did:web:nordsee-klinikum.example:participant",
        name: "Nordsee Klinikum",
        walletType: "business",
        source: "business-wallet",
        country: "de",
        dspCatalogUrl: "https://nordsee-klinikum.example/api/dsp/catalog",
      }),
    );
    expect(res.status).toBe(201);
    const [cypher, params] = mockRunQuery.mock.calls[0];
    expect(cypher).toContain("MERGE (p:Participant");
    expect(params).toMatchObject({
      participantId: "did:web:nordsee-klinikum.example:participant",
      country: "DE",
    });
  });
});

describe("DELETE /api/admin/participants", () => {
  it("requires the id query parameter", async () => {
    const res = await DELETE(deleteRequest());
    expect(res.status).toBe(400);
  });

  it("returns 404 for an unknown participant", async () => {
    mockRunQuery.mockResolvedValue([]);
    const res = await DELETE(deleteRequest("did:web:ghost.example"));
    expect(res.status).toBe(404);
  });

  it("refuses to delete seeded demo participants", async () => {
    mockRunQuery.mockResolvedValue([{ source: "seed" }]);
    const res = await DELETE(
      deleteRequest("did:web:alpha-klinik.de:participant"),
    );
    expect(res.status).toBe(409);
    expect(mockRunQuery).toHaveBeenCalledTimes(1);
  });

  it("DETACH DELETEs non-seed participants", async () => {
    mockRunQuery
      .mockResolvedValueOnce([{ source: "business-wallet" }])
      .mockResolvedValueOnce([]);
    const res = await DELETE(
      deleteRequest("did:web:nordsee-klinikum.example:participant"),
    );
    expect(res.status).toBe(200);
    expect(mockRunQuery.mock.calls[1][0]).toContain("DETACH DELETE");
  });
});

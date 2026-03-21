/**
 * Unit tests for /api/negotiations route — focusing on uncovered branches.
 *
 * Covers: catalog pre-fetch mode, buildDspEndpoint variants, policyId
 * fallback, providerDid/counterPartyId assigner logic, deduplication of
 * real + mock negotiations, non-array EDC response, error message types.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Mocks ────────────────────────────────────────────────────────────
const mockManagement = vi.fn();
vi.mock("@/lib/edc", () => ({
  edcClient: {
    management: (...args: unknown[]) => mockManagement(...args),
  },
  EDC_CONTEXT: "https://w3id.org/edc/connector/management/v2",
}));

const mockReadFile = vi.fn();
vi.mock("fs", () => ({
  default: {
    promises: {
      readFile: (...args: unknown[]) => mockReadFile(...args),
    },
  },
  promises: {
    readFile: (...args: unknown[]) => mockReadFile(...args),
  },
}));

import { GET, POST } from "@/app/api/negotiations/route";

// ── Setup ────────────────────────────────────────────────────────────
beforeEach(() => {
  vi.clearAllMocks();
  mockReadFile.mockReset();
});

// =====================================================================
// GET /api/negotiations
// =====================================================================
describe("GET /api/negotiations", () => {
  it("should return 400 when participantId is missing", async () => {
    const res = await GET(
      new NextRequest("http://localhost:3000/api/negotiations"),
    );

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("participantId");
  });

  // ── Catalog pre-fetch mode ────────────────────────────────────────

  it("should fetch provider catalog when catalog=true", async () => {
    const mockCatalog = {
      "@type": "dcat:Catalog",
      "dcat:dataset": [{ "@id": "asset-1" }],
    };
    mockManagement.mockResolvedValue(mockCatalog);

    const res = await GET(
      new NextRequest(
        "http://localhost:3000/api/negotiations?participantId=ctx-1&catalog=true&providerDid=did:web:alpha-klinik.de",
      ),
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data["@type"]).toBe("dcat:Catalog");
    expect(mockManagement).toHaveBeenCalledWith(
      "/v1alpha/participants/ctx-1/catalog",
      "POST",
      { counterPartyDid: "did:web:alpha-klinik.de" },
    );
  });

  it("should return 400 when catalog=true but providerDid is missing", async () => {
    const res = await GET(
      new NextRequest(
        "http://localhost:3000/api/negotiations?participantId=ctx-1&catalog=true",
      ),
    );
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toContain("providerDid");
  });

  it("should return 502 when catalog fetch fails", async () => {
    mockManagement.mockRejectedValue(new Error("Catalog unreachable"));

    const res = await GET(
      new NextRequest(
        "http://localhost:3000/api/negotiations?participantId=ctx-1&catalog=true&providerDid=did:web:test",
      ),
    );
    const data = await res.json();

    expect(res.status).toBe(502);
    expect(data.error).toContain("catalog");
    expect(data.detail).toBe("Catalog unreachable");
  });

  it("should stringify non-Error catalog exceptions", async () => {
    mockManagement.mockRejectedValue("string error");

    const res = await GET(
      new NextRequest(
        "http://localhost:3000/api/negotiations?participantId=ctx-1&catalog=true&providerDid=did:web:test",
      ),
    );
    const data = await res.json();

    expect(res.status).toBe(502);
    expect(data.detail).toBe("string error");
  });

  // ── Negotiation list + mock merging ───────────────────────────────

  it("should merge real and mock negotiations", async () => {
    mockManagement.mockResolvedValue([
      { "@id": "neg-real-1", state: "CONFIRMED" },
    ]);
    mockReadFile.mockResolvedValue(
      JSON.stringify([
        { "@id": "neg-mock-1", state: "FINALIZED" },
        { "@id": "neg-mock-2", state: "REQUESTED" },
      ]),
    );

    const res = await GET(
      new NextRequest(
        "http://localhost:3000/api/negotiations?participantId=ctx-1",
      ),
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toHaveLength(3);
    expect(data[0]["@id"]).toBe("neg-real-1");
  });

  it("should deduplicate mock negotiations that have same @id as real ones", async () => {
    mockManagement.mockResolvedValue([{ "@id": "neg-1", state: "CONFIRMED" }]);
    mockReadFile.mockResolvedValue(
      JSON.stringify([
        { "@id": "neg-1", state: "REQUESTED" }, // duplicate
        { "@id": "neg-2", state: "FINALIZED" },
      ]),
    );

    const res = await GET(
      new NextRequest(
        "http://localhost:3000/api/negotiations?participantId=ctx-1",
      ),
    );
    const data = await res.json();

    // neg-1 from mock is deduplicated, only real neg-1 + mock neg-2 remain
    expect(data).toHaveLength(2);
    expect(data[0]).toEqual({ "@id": "neg-1", state: "CONFIRMED" });
    expect(data[1]).toEqual({ "@id": "neg-2", state: "FINALIZED" });
  });

  it("should convert non-array EDC response to empty array", async () => {
    mockManagement.mockResolvedValue({ unexpected: true });
    mockReadFile.mockRejectedValue(new Error("ENOENT"));

    const res = await GET(
      new NextRequest(
        "http://localhost:3000/api/negotiations?participantId=ctx-1",
      ),
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(Array.isArray(data)).toBe(true);
  });

  it("should return only mock data when EDC fails gracefully", async () => {
    mockManagement.mockRejectedValue(new Error("Connection refused"));
    mockReadFile.mockResolvedValue(
      JSON.stringify([{ "@id": "neg-mock-1", state: "FINALIZED" }]),
    );

    const res = await GET(
      new NextRequest(
        "http://localhost:3000/api/negotiations?participantId=ctx-1",
      ),
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toHaveLength(1);
    expect(data[0]["@id"]).toBe("neg-mock-1");
  });

  it("should return empty array when both EDC and mock file fail", async () => {
    mockManagement.mockRejectedValue(new Error("Connection refused"));
    mockReadFile.mockRejectedValue(new Error("ENOENT"));

    const res = await GET(
      new NextRequest(
        "http://localhost:3000/api/negotiations?participantId=ctx-1",
      ),
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toEqual([]);
  });

  it("should call correct EDC endpoint for negotiation list", async () => {
    mockManagement.mockResolvedValue([]);
    mockReadFile.mockRejectedValue(new Error("ENOENT"));

    await GET(
      new NextRequest(
        "http://localhost:3000/api/negotiations?participantId=my-ctx",
      ),
    );

    expect(mockManagement).toHaveBeenCalledWith(
      "/v5alpha/participants/my-ctx/contractnegotiations/request",
      "POST",
      expect.objectContaining({
        "@type": "QuerySpec",
        filterExpression: [],
      }),
    );
  });
});

// =====================================================================
// POST /api/negotiations
// =====================================================================
describe("POST /api/negotiations", () => {
  function postReq(body: unknown) {
    return new NextRequest("http://localhost:3000/api/negotiations", {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  // ── Validation ─────────────────────────────────────────────────────

  it("should return 400 when participantId is missing", async () => {
    const res = await POST(
      postReq({ counterPartyAddress: "http://cp:8082/dsp", assetId: "a1" }),
    );

    expect(res.status).toBe(400);
  });

  it("should return 400 when counterPartyAddress is missing", async () => {
    const res = await POST(
      postReq({ participantId: "ctx-1", assetId: "a1", offerId: "o1" }),
    );

    expect(res.status).toBe(400);
  });

  it("should return 400 when assetId is missing", async () => {
    const res = await POST(
      postReq({
        participantId: "ctx-1",
        counterPartyAddress: "http://cp:8082/dsp",
        offerId: "o1",
      }),
    );

    expect(res.status).toBe(400);
  });

  it("should return 400 when both offerId and policyId are missing", async () => {
    const res = await POST(
      postReq({
        participantId: "ctx-1",
        counterPartyAddress: "http://cp:8082/dsp",
        assetId: "a1",
      }),
    );
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toContain("offerId");
  });

  // ── DSP endpoint building ─────────────────────────────────────────

  it("should build DSP endpoint with counterPartyId and version suffix", async () => {
    mockManagement.mockResolvedValue({ "@id": "neg-1" });

    await POST(
      postReq({
        participantId: "ctx-1",
        counterPartyAddress: "http://cp:8082/api/dsp",
        counterPartyId: "provider-ctx",
        assetId: "a1",
        offerId: "offer-1",
      }),
    );

    expect(mockManagement).toHaveBeenCalledWith(
      expect.any(String),
      "POST",
      expect.objectContaining({
        counterPartyAddress: "http://cp:8082/api/dsp/provider-ctx/2025-1",
      }),
    );
  });

  it("should not add version suffix when endpoint already ends with /2025-1", async () => {
    mockManagement.mockResolvedValue({ "@id": "neg-1" });

    await POST(
      postReq({
        participantId: "ctx-1",
        counterPartyAddress: "http://cp:8082/api/dsp/provider-ctx/2025-1",
        counterPartyId: "provider-ctx",
        assetId: "a1",
        offerId: "offer-1",
      }),
    );

    expect(mockManagement).toHaveBeenCalledWith(
      expect.any(String),
      "POST",
      expect.objectContaining({
        counterPartyAddress: "http://cp:8082/api/dsp/provider-ctx/2025-1",
      }),
    );
  });

  it("should strip trailing slashes from counterPartyAddress", async () => {
    mockManagement.mockResolvedValue({ "@id": "neg-1" });

    await POST(
      postReq({
        participantId: "ctx-1",
        counterPartyAddress: "http://cp:8082/api/dsp///",
        counterPartyId: "prov",
        assetId: "a1",
        offerId: "offer-1",
      }),
    );

    expect(mockManagement).toHaveBeenCalledWith(
      expect.any(String),
      "POST",
      expect.objectContaining({
        counterPartyAddress: "http://cp:8082/api/dsp/prov/2025-1",
      }),
    );
  });

  it("should handle endpoint with ctxId already embedded", async () => {
    mockManagement.mockResolvedValue({ "@id": "neg-1" });

    await POST(
      postReq({
        participantId: "ctx-1",
        counterPartyAddress: "http://cp:8082/api/dsp/prov-id",
        counterPartyId: "prov-id",
        assetId: "a1",
        offerId: "offer-1",
      }),
    );

    expect(mockManagement).toHaveBeenCalledWith(
      expect.any(String),
      "POST",
      expect.objectContaining({
        counterPartyAddress: "http://cp:8082/api/dsp/prov-id/2025-1",
      }),
    );
  });

  // ── Policy ID selection ───────────────────────────────────────────

  it("should use offerId as the ODRL offer @id", async () => {
    mockManagement.mockResolvedValue({ "@id": "neg-1" });

    await POST(
      postReq({
        participantId: "ctx-1",
        counterPartyAddress: "http://cp:8082/dsp",
        counterPartyId: "prov",
        assetId: "a1",
        offerId: "my-offer",
      }),
    );

    expect(mockManagement).toHaveBeenCalledWith(
      expect.any(String),
      "POST",
      expect.objectContaining({
        policy: expect.objectContaining({
          "@id": "my-offer",
        }),
      }),
    );
  });

  it("should fall back to policyId when offerId is not provided", async () => {
    mockManagement.mockResolvedValue({ "@id": "neg-1" });

    await POST(
      postReq({
        participantId: "ctx-1",
        counterPartyAddress: "http://cp:8082/dsp",
        counterPartyId: "prov",
        assetId: "a1",
        policyId: "legacy-policy",
      }),
    );

    expect(mockManagement).toHaveBeenCalledWith(
      expect.any(String),
      "POST",
      expect.objectContaining({
        policy: expect.objectContaining({
          "@id": "legacy-policy",
        }),
      }),
    );
  });

  // ── Assigner logic ────────────────────────────────────────────────

  it("should use providerDid as ODRL assigner", async () => {
    mockManagement.mockResolvedValue({ "@id": "neg-1" });

    await POST(
      postReq({
        participantId: "ctx-1",
        counterPartyAddress: "http://cp:8082/dsp",
        counterPartyId: "prov",
        providerDid: "did:web:alpha-klinik.de",
        assetId: "a1",
        offerId: "offer-1",
      }),
    );

    expect(mockManagement).toHaveBeenCalledWith(
      expect.any(String),
      "POST",
      expect.objectContaining({
        policy: expect.objectContaining({
          assigner: "did:web:alpha-klinik.de",
        }),
      }),
    );
  });

  it("should fall back to counterPartyId as assigner when providerDid is missing", async () => {
    mockManagement.mockResolvedValue({ "@id": "neg-1" });

    await POST(
      postReq({
        participantId: "ctx-1",
        counterPartyAddress: "http://cp:8082/dsp",
        counterPartyId: "prov-uuid",
        assetId: "a1",
        offerId: "offer-1",
      }),
    );

    expect(mockManagement).toHaveBeenCalledWith(
      expect.any(String),
      "POST",
      expect.objectContaining({
        policy: expect.objectContaining({
          assigner: "prov-uuid",
        }),
      }),
    );
  });

  it("should use empty string as assigner when neither providerDid nor counterPartyId provided", async () => {
    mockManagement.mockResolvedValue({ "@id": "neg-1" });

    await POST(
      postReq({
        participantId: "ctx-1",
        counterPartyAddress: "http://cp:8082/dsp",
        assetId: "a1",
        offerId: "offer-1",
      }),
    );

    expect(mockManagement).toHaveBeenCalledWith(
      expect.any(String),
      "POST",
      expect.objectContaining({
        policy: expect.objectContaining({
          assigner: "",
        }),
      }),
    );
  });

  // ── Successful negotiation ────────────────────────────────────────

  it("should return 201 with EDC result on successful negotiation", async () => {
    const mockResult = {
      "@id": "neg-new",
      "@type": "ContractNegotiation",
      state: "REQUESTED",
    };
    mockManagement.mockResolvedValue(mockResult);

    const res = await POST(
      postReq({
        participantId: "ctx-1",
        counterPartyAddress: "http://cp:8082/dsp",
        counterPartyId: "prov",
        assetId: "a1",
        offerId: "offer-1",
      }),
    );
    const data = await res.json();

    expect(res.status).toBe(201);
    expect(data).toEqual(mockResult);
  });

  it("should include DSP protocol version in negotiation payload", async () => {
    mockManagement.mockResolvedValue({ "@id": "neg-1" });

    await POST(
      postReq({
        participantId: "ctx-1",
        counterPartyAddress: "http://cp:8082/dsp",
        counterPartyId: "prov",
        assetId: "a1",
        offerId: "offer-1",
      }),
    );

    expect(mockManagement).toHaveBeenCalledWith(
      expect.any(String),
      "POST",
      expect.objectContaining({
        protocol: "dataspace-protocol-http:2025-1",
        "@type": "ContractRequest",
      }),
    );
  });

  it("should set assetId as the ODRL policy target", async () => {
    mockManagement.mockResolvedValue({ "@id": "neg-1" });

    await POST(
      postReq({
        participantId: "ctx-1",
        counterPartyAddress: "http://cp:8082/dsp",
        counterPartyId: "prov",
        assetId: "my-asset",
        offerId: "offer-1",
      }),
    );

    expect(mockManagement).toHaveBeenCalledWith(
      expect.any(String),
      "POST",
      expect.objectContaining({
        policy: expect.objectContaining({
          target: "my-asset",
          permission: [{ action: "use" }],
        }),
      }),
    );
  });

  // ── Error paths ───────────────────────────────────────────────────

  it("should return 502 when EDC negotiation initiation fails", async () => {
    mockManagement.mockRejectedValue(new Error("Service unavailable"));

    const res = await POST(
      postReq({
        participantId: "ctx-1",
        counterPartyAddress: "http://cp:8082/dsp",
        counterPartyId: "prov",
        assetId: "a1",
        offerId: "offer-1",
      }),
    );
    const data = await res.json();

    expect(res.status).toBe(502);
    expect(data.error).toContain("Failed to initiate");
    expect(data.detail).toBe("Service unavailable");
  });

  it("should stringify non-Error exceptions in POST", async () => {
    mockManagement.mockRejectedValue("raw string error");

    const res = await POST(
      postReq({
        participantId: "ctx-1",
        counterPartyAddress: "http://cp:8082/dsp",
        counterPartyId: "prov",
        assetId: "a1",
        offerId: "offer-1",
      }),
    );
    const data = await res.json();

    expect(res.status).toBe(502);
    expect(data.detail).toBe("raw string error");
  });

  it("should use empty counterPartyId when not provided", async () => {
    mockManagement.mockResolvedValue({ "@id": "neg-1" });

    await POST(
      postReq({
        participantId: "ctx-1",
        counterPartyAddress: "http://cp:8082/dsp",
        assetId: "a1",
        offerId: "offer-1",
      }),
    );

    expect(mockManagement).toHaveBeenCalledWith(
      expect.any(String),
      "POST",
      expect.objectContaining({
        counterPartyId: "",
      }),
    );
  });
});

/**
 * API route tests for GET /api/negotiations/[id]
 *
 * Tests the single-negotiation detail endpoint.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/edc", () => ({
  edcClient: {
    management: vi.fn(),
  },
}));

import { edcClient } from "@/lib/edc";
import { EdcApiError } from "@/lib/edc/client";
import { GET } from "@/app/api/negotiations/[id]/route";

const mockManagement = vi.mocked(edcClient.management);

describe("GET /api/negotiations/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return 400 when participantId query param is missing", async () => {
    const req = new NextRequest(
      "http://localhost:3000/api/negotiations/neg-123",
    );
    const response = await GET(req, {
      params: Promise.resolve({ id: "neg-123" }),
    });

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain("participantId");
  });

  it("should return the negotiation detail on success", async () => {
    const mockNeg = {
      "@id": "neg-123",
      state: "CONFIRMED",
      contractAgreementId: "ca-456",
    };
    mockManagement.mockResolvedValue(mockNeg);

    const req = new NextRequest(
      "http://localhost:3000/api/negotiations/neg-123?participantId=spe-1",
    );
    const response = await GET(req, {
      params: Promise.resolve({ id: "neg-123" }),
    });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual(mockNeg);
    expect(mockManagement).toHaveBeenCalledWith(
      "/v5/participants/spe-1/contractnegotiations/neg-123",
    );
  });

  it("should return 502 when EDC API fails", async () => {
    mockManagement.mockRejectedValue(new Error("Connection refused"));

    const req = new NextRequest(
      "http://localhost:3000/api/negotiations/neg-123?participantId=spe-1",
    );
    const response = await GET(req, {
      params: Promise.resolve({ id: "neg-123" }),
    });

    expect(response.status).toBe(502);
    const data = await response.json();
    expect(data.error).toContain("Failed to get negotiation");
  });

  // The spec promises a 404 for an id the connector does not know. Until
  // 2026-11-11 the hub answered 502, as if the connector had not answered.
  it("answers 404 when the connector has no such negotiation", async () => {
    mockManagement.mockRejectedValue(
      new EdcApiError(
        "EDC API error [management] GET /v5/participants/ctx-1/contractnegotiations/nope: 404 Not Found",
        404,
      ),
    );

    const req = new NextRequest(
      "http://localhost:3000/api/negotiations/nope?participantId=ctx-1",
    );
    const response = await GET(req, {
      params: Promise.resolve({ id: "nope" }),
    });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Not found" });
  });
});

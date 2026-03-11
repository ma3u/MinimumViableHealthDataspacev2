/**
 * API route tests for GET/POST /api/negotiations
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Mock the EDC client
vi.mock("@/lib/edc", () => ({
  edcClient: {
    management: vi.fn(),
  },
  EDC_CONTEXT: "https://w3id.org/edc/connector/management/v2",
}));

import { edcClient } from "@/lib/edc";
import { GET, POST } from "@/app/api/negotiations/route";

const mockManagement = vi.mocked(edcClient.management);

describe("/api/negotiations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("GET", () => {
    it("should return 400 when participantId is missing", async () => {
      const req = new NextRequest("http://localhost:3000/api/negotiations");
      const response = await GET(req);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain("participantId");
    });

    it("should list negotiations for a participant", async () => {
      const mockNegotiations = [
        { "@id": "neg-1", state: "CONFIRMED" },
        { "@id": "neg-2", state: "REQUESTED" },
      ];
      mockManagement.mockResolvedValue(mockNegotiations);

      const req = new NextRequest(
        "http://localhost:3000/api/negotiations?participantId=spe-1",
      );
      const response = await GET(req);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual(mockNegotiations);
      expect(mockManagement).toHaveBeenCalledWith(
        "/v5alpha/participants/spe-1/contractnegotiations/request",
        "POST",
        expect.objectContaining({ "@type": "QuerySpec" }),
      );
    });

    it("should return 502 when EDC management API fails", async () => {
      mockManagement.mockRejectedValue(new Error("Connection refused"));

      const req = new NextRequest(
        "http://localhost:3000/api/negotiations?participantId=spe-1",
      );
      const response = await GET(req);

      expect(response.status).toBe(502);
      const data = await response.json();
      expect(data.error).toContain("Failed to list negotiations");
    });
  });

  describe("POST", () => {
    it("should return 400 when required fields are missing", async () => {
      const req = new NextRequest("http://localhost:3000/api/negotiations", {
        method: "POST",
        body: JSON.stringify({ participantId: "spe-1" }),
      });
      const response = await POST(req);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain("required");
    });

    it("should initiate a contract negotiation", async () => {
      const mockResult = { "@id": "neg-new", state: "REQUESTED" };
      mockManagement.mockResolvedValue(mockResult);

      const req = new NextRequest("http://localhost:3000/api/negotiations", {
        method: "POST",
        body: JSON.stringify({
          participantId: "spe-1",
          counterPartyAddress: "http://counter.party:8081/api/dsp",
          assetId: "asset-1",
          counterPartyId: "spe-2",
          offerId: "offer-1",
        }),
      });
      const response = await POST(req);
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data).toEqual(mockResult);
      expect(mockManagement).toHaveBeenCalledWith(
        "/v5alpha/participants/spe-1/contractnegotiations",
        "POST",
        expect.objectContaining({
          "@type": "ContractRequest",
          counterPartyAddress: "http://counter.party:8081/api/dsp",
          protocol: "dataspace-protocol-http",
        }),
      );
    });

    it("should return 502 when negotiation initiation fails", async () => {
      mockManagement.mockRejectedValue(new Error("API error"));

      const req = new NextRequest("http://localhost:3000/api/negotiations", {
        method: "POST",
        body: JSON.stringify({
          participantId: "spe-1",
          counterPartyAddress: "http://counter.party:8081/api/dsp",
          assetId: "asset-1",
        }),
      });
      const response = await POST(req);

      expect(response.status).toBe(502);
      const data = await response.json();
      expect(data.error).toContain("Failed to initiate");
    });
  });
});

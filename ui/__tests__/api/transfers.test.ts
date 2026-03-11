/**
 * API route tests for GET/POST /api/transfers
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
import { GET, POST } from "@/app/api/transfers/route";

const mockManagement = vi.mocked(edcClient.management);

describe("/api/transfers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("GET", () => {
    it("should return 400 when participantId is missing", async () => {
      const req = new NextRequest("http://localhost:3000/api/transfers");
      const response = await GET(req);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain("participantId");
    });

    it("should list transfers for a participant", async () => {
      const mockTransfers = [
        { "@id": "tp-1", state: "COMPLETED" },
        { "@id": "tp-2", state: "STARTED" },
      ];
      mockManagement.mockResolvedValue(mockTransfers);

      const req = new NextRequest(
        "http://localhost:3000/api/transfers?participantId=spe-1",
      );
      const response = await GET(req);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual(mockTransfers);
      expect(mockManagement).toHaveBeenCalledWith(
        "/v5alpha/participants/spe-1/transferprocesses/request",
        "POST",
        expect.objectContaining({ "@type": "QuerySpec" }),
      );
    });

    it("should return 502 when EDC API fails", async () => {
      mockManagement.mockRejectedValue(new Error("Timeout"));

      const req = new NextRequest(
        "http://localhost:3000/api/transfers?participantId=spe-1",
      );
      const response = await GET(req);

      expect(response.status).toBe(502);
    });
  });

  describe("POST", () => {
    it("should return 400 when required fields are missing", async () => {
      const req = new NextRequest("http://localhost:3000/api/transfers", {
        method: "POST",
        body: JSON.stringify({ participantId: "spe-1" }),
      });
      const response = await POST(req);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain("required");
    });

    it("should initiate a data transfer", async () => {
      const mockResult = { "@id": "tp-new", state: "REQUESTED" };
      mockManagement.mockResolvedValue(mockResult);

      const req = new NextRequest("http://localhost:3000/api/transfers", {
        method: "POST",
        body: JSON.stringify({
          participantId: "spe-1",
          contractId: "contract-123",
          counterPartyAddress: "http://counter.party:8081/api/dsp",
          assetId: "asset-1",
          transferType: "HttpData-PULL",
        }),
      });
      const response = await POST(req);
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data).toEqual(mockResult);
      expect(mockManagement).toHaveBeenCalledWith(
        "/v5alpha/participants/spe-1/transferprocesses",
        "POST",
        expect.objectContaining({
          "@type": "TransferRequest",
          contractId: "contract-123",
          counterPartyAddress: "http://counter.party:8081/api/dsp",
          protocol: "dataspace-protocol-http",
          transferType: "HttpData-PULL",
          dataDestination: expect.objectContaining({
            "@type": "DataAddress",
            type: "HttpProxy",
          }),
        }),
      );
    });

    it("should use default transferType when not provided", async () => {
      mockManagement.mockResolvedValue({ "@id": "tp-new" });

      const req = new NextRequest("http://localhost:3000/api/transfers", {
        method: "POST",
        body: JSON.stringify({
          participantId: "spe-1",
          contractId: "contract-123",
          counterPartyAddress: "http://counter.party:8081/api/dsp",
        }),
      });
      await POST(req);

      expect(mockManagement).toHaveBeenCalledWith(
        expect.any(String),
        "POST",
        expect.objectContaining({
          transferType: "HttpData-PULL",
        }),
      );
    });

    it("should return 502 when transfer initiation fails", async () => {
      mockManagement.mockRejectedValue(new Error("API error"));

      const req = new NextRequest("http://localhost:3000/api/transfers", {
        method: "POST",
        body: JSON.stringify({
          participantId: "spe-1",
          contractId: "contract-123",
          counterPartyAddress: "http://counter.party:8081/api/dsp",
        }),
      });
      const response = await POST(req);

      expect(response.status).toBe(502);
      const data = await response.json();
      expect(data.error).toContain("Failed to initiate");
    });
  });
});

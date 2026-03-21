/**
 * API route tests for /api/assets
 *
 * Tests data asset listing and creation endpoints.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/edc", () => ({
  edcClient: {
    management: vi.fn(),
  },
  EDC_CONTEXT: "https://w3id.org/edc/connector/management/v2",
}));

// Mock fs to prevent loadMockAssets from reading bundled JSON
vi.mock("fs", () => ({
  default: {
    promises: {
      readFile: vi.fn().mockRejectedValue(new Error("mock fs disabled")),
    },
  },
  promises: {
    readFile: vi.fn().mockRejectedValue(new Error("mock fs disabled")),
  },
}));

import { edcClient } from "@/lib/edc";
import { GET, POST } from "@/app/api/assets/route";

const mockManagement = vi.mocked(edcClient.management);

describe("/api/assets", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("GET", () => {
    it("should list assets for a specific participant", async () => {
      const mockAssets = [
        {
          "@id": "asset-1",
          properties: { name: "FHIR Cohort" },
        },
      ];
      mockManagement.mockResolvedValue(mockAssets);

      const req = new NextRequest(
        "http://localhost:3000/api/assets?participantId=spe-1",
      );
      const response = await GET(req);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toHaveLength(1);
      expect(data[0]).toEqual(
        expect.objectContaining({ "@id": "asset-1", name: "FHIR Cohort" }),
      );
      expect(mockManagement).toHaveBeenCalledWith(
        "/v5alpha/participants/spe-1/assets/request",
        "POST",
        expect.objectContaining({ "@type": "QuerySpec" }),
      );
    });

    it("should aggregate assets across all participants when no participantId", async () => {
      mockManagement
        .mockResolvedValueOnce([{ "@id": "ctx-1", identity: "did:web:spe-1" }])
        .mockResolvedValueOnce([{ "@id": "asset-1" }]);

      const req = new NextRequest("http://localhost:3000/api/assets");
      const response = await GET(req);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toHaveLength(1);
      expect(data[0].participantId).toBe("ctx-1");
    });

    it("should return 200 with empty array when EDC fails (graceful degradation)", async () => {
      mockManagement.mockRejectedValue(new Error("Connection refused"));

      const req = new NextRequest("http://localhost:3000/api/assets");
      const response = await GET(req);

      // Route gracefully degrades — returns mock data (empty because fs is mocked)
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(Array.isArray(data)).toBe(true);
    });
  });

  describe("POST", () => {
    it("should return 400 when required fields are missing", async () => {
      const req = new NextRequest("http://localhost:3000/api/assets", {
        method: "POST",
        body: JSON.stringify({ participantId: "spe-1" }),
      });
      const response = await POST(req);
      expect(response.status).toBe(400);
    });

    it("should create asset successfully", async () => {
      mockManagement.mockResolvedValue({ "@id": "asset-new" });

      const req = new NextRequest("http://localhost:3000/api/assets", {
        method: "POST",
        body: JSON.stringify({
          participantId: "spe-1",
          assetId: "asset-new",
          name: "New Dataset",
          description: "A new test dataset",
          contentType: "application/fhir+json",
          dataAddress: {
            type: "HttpData",
            baseUrl: "http://neo4j-proxy:9090/fhir/Patient",
          },
        }),
      });
      const response = await POST(req);
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data["@id"]).toBe("asset-new");
    });

    it("should return 502 when asset creation fails", async () => {
      mockManagement.mockRejectedValue(new Error("API error"));

      const req = new NextRequest("http://localhost:3000/api/assets", {
        method: "POST",
        body: JSON.stringify({
          participantId: "spe-1",
          assetId: "asset-fail",
          name: "Fail",
          description: "Should fail",
          contentType: "application/json",
          dataAddress: { type: "HttpData", baseUrl: "http://example.com" },
        }),
      });
      const response = await POST(req);
      expect(response.status).toBe(502);
    });
  });
});

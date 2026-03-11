/**
 * API route tests for /api/participants and /api/participants/me
 *
 * Tests EDC-V participant management endpoints.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/edc", () => ({
  edcClient: {
    management: vi.fn(),
    tenant: vi.fn(),
  },
  EDC_CONTEXT: "https://w3id.org/edc/connector/management/v2",
}));

import { edcClient } from "@/lib/edc";
import { GET, POST } from "@/app/api/participants/route";

const mockManagement = vi.mocked(edcClient.management);
const mockTenant = vi.mocked(edcClient.tenant);

describe("/api/participants", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("GET", () => {
    it("should list all participant contexts", async () => {
      const mockParticipants = [
        { "@id": "ctx-1", identity: "did:web:spe-1" },
        { "@id": "ctx-2", identity: "did:web:cro-bayer" },
      ];
      mockManagement.mockResolvedValue(mockParticipants);

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toHaveLength(2);
      expect(mockManagement).toHaveBeenCalledWith("/v5alpha/participants");
    });

    it("should return 502 when EDC API fails", async () => {
      mockManagement.mockRejectedValue(new Error("Connection refused"));

      const response = await GET();
      expect(response.status).toBe(502);
      const data = await response.json();
      expect(data.error).toBeDefined();
    });
  });

  describe("POST", () => {
    it("should return 400 when displayName is missing", async () => {
      const req = new NextRequest("http://localhost:3000/api/participants", {
        method: "POST",
        body: JSON.stringify({ role: "data_holder" }),
      });
      const response = await POST(req);
      expect(response.status).toBe(400);
    });

    it("should return 400 when role is missing", async () => {
      const req = new NextRequest("http://localhost:3000/api/participants", {
        method: "POST",
        body: JSON.stringify({ displayName: "Test" }),
      });
      const response = await POST(req);
      expect(response.status).toBe(400);
    });

    it("should return 503 when no cells found", async () => {
      mockTenant.mockResolvedValue([]);

      const req = new NextRequest("http://localhost:3000/api/participants", {
        method: "POST",
        body: JSON.stringify({
          displayName: "Test Clinic",
          role: "data_holder",
        }),
      });
      const response = await POST(req);
      expect(response.status).toBe(503);
      const data = await response.json();
      expect(data.error).toContain("cells");
    });
  });
});

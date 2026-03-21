/**
 * API route tests for /api/admin/policies
 *
 * Tests policy definition listing and creation endpoints.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/edc", () => ({
  edcClient: {
    management: vi.fn(),
  },
  EDC_CONTEXT: "https://w3id.org/edc/connector/management/v2",
}));

// Mock fs to prevent fallback to bundled admin_policies.json
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
import { GET, POST } from "@/app/api/admin/policies/route";

const mockManagement = vi.mocked(edcClient.management);

describe("/api/admin/policies", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("GET", () => {
    it("should list policies for a specific participant", async () => {
      const mockPolicies = [{ "@id": "pol-1", policy: {} }];
      mockManagement.mockResolvedValue(mockPolicies);

      const req = new NextRequest(
        "http://localhost:3000/api/admin/policies?participantId=spe-1",
      );
      const response = await GET(req);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.participantId).toBe("spe-1");
      expect(data.policies).toEqual(mockPolicies);
    });

    it("should aggregate policies across all participants", async () => {
      mockManagement
        .mockResolvedValueOnce([{ "@id": "ctx-1", identity: "did:web:spe-1" }])
        .mockResolvedValueOnce([{ "@id": "pol-1" }]);

      const req = new NextRequest("http://localhost:3000/api/admin/policies");
      const response = await GET(req);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.participants).toHaveLength(1);
    });

    it("should return 502 when EDC API fails", async () => {
      mockManagement.mockRejectedValue(new Error("Timeout"));

      const req = new NextRequest("http://localhost:3000/api/admin/policies");
      const response = await GET(req);
      expect(response.status).toBe(502);
    });
  });

  describe("POST", () => {
    it("should return 400 when required fields missing", async () => {
      const req = new NextRequest("http://localhost:3000/api/admin/policies", {
        method: "POST",
        body: JSON.stringify({ participantId: "spe-1" }),
      });
      const response = await POST(req);
      expect(response.status).toBe(400);
    });

    it("should create policy successfully", async () => {
      mockManagement.mockResolvedValue({ "@id": "pol-new" });

      const req = new NextRequest("http://localhost:3000/api/admin/policies", {
        method: "POST",
        body: JSON.stringify({
          participantId: "spe-1",
          policy: {
            "@type": "PolicyDefinition",
            policy: { permissions: [] },
          },
        }),
      });
      const response = await POST(req);
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data["@id"]).toBe("pol-new");
    });
  });
});

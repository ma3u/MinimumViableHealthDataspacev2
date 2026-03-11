/**
 * API route tests for GET /api/transfers/[id]
 *
 * Tests the single-transfer detail endpoint.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/edc", () => ({
  edcClient: {
    management: vi.fn(),
  },
}));

import { edcClient } from "@/lib/edc";
import { GET } from "@/app/api/transfers/[id]/route";

const mockManagement = vi.mocked(edcClient.management);

describe("GET /api/transfers/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return 400 when participantId query param is missing", async () => {
    const req = new NextRequest("http://localhost:3000/api/transfers/tp-123");
    const response = await GET(req, {
      params: Promise.resolve({ id: "tp-123" }),
    });

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain("participantId");
  });

  it("should return the transfer detail on success", async () => {
    const mockTransfer = {
      "@id": "tp-123",
      state: "COMPLETED",
      type: "HttpData-PULL",
    };
    mockManagement.mockResolvedValue(mockTransfer);

    const req = new NextRequest(
      "http://localhost:3000/api/transfers/tp-123?participantId=spe-1",
    );
    const response = await GET(req, {
      params: Promise.resolve({ id: "tp-123" }),
    });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual(mockTransfer);
    expect(mockManagement).toHaveBeenCalledWith(
      "/v5alpha/participants/spe-1/transferprocesses/tp-123",
    );
  });

  it("should return 502 when EDC API fails", async () => {
    mockManagement.mockRejectedValue(new Error("Timeout"));

    const req = new NextRequest(
      "http://localhost:3000/api/transfers/tp-123?participantId=spe-1",
    );
    const response = await GET(req, {
      params: Promise.resolve({ id: "tp-123" }),
    });

    expect(response.status).toBe(502);
    const data = await response.json();
    expect(data.error).toContain("Failed to get transfer");
  });
});

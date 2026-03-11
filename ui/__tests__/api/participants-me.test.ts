/**
 * API route tests for GET /api/participants/me
 *
 * Tests the participant profile endpoint (CFM TenantManager).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/edc", () => ({
  edcClient: {
    tenant: vi.fn(),
  },
}));

import { edcClient } from "@/lib/edc";
import { GET } from "@/app/api/participants/me/route";

const mockTenant = vi.mocked(edcClient.tenant);

describe("GET /api/participants/me", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return enriched tenant list with participant profiles", async () => {
    // First call: list tenants
    mockTenant.mockResolvedValueOnce([
      { id: "t-1", version: 1, properties: { displayName: "Clinic A" } },
      { id: "t-2", version: 1, properties: { displayName: "CRO B" } },
    ]);
    // Second call: profiles for t-1
    mockTenant.mockResolvedValueOnce([{ id: "pp-1", cellId: "cell-1" }]);
    // Third call: profiles for t-2
    mockTenant.mockResolvedValueOnce([{ id: "pp-2", cellId: "cell-1" }]);

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toHaveLength(2);
    expect(data[0].participantProfiles).toHaveLength(1);
    expect(data[1].participantProfiles).toHaveLength(1);
    expect(mockTenant).toHaveBeenCalledWith("/v1alpha1/tenants");
  });

  it("should handle profile fetch failures gracefully", async () => {
    mockTenant.mockResolvedValueOnce([
      { id: "t-1", version: 1, properties: { displayName: "Clinic A" } },
    ]);
    // Profile fetch fails
    mockTenant.mockRejectedValueOnce(new Error("Not found"));

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toHaveLength(1);
    expect(data[0].participantProfiles).toEqual([]);
  });

  it("should return 502 when tenant list fails", async () => {
    mockTenant.mockRejectedValue(new Error("Connection refused"));

    const response = await GET();

    expect(response.status).toBe(502);
    const data = await response.json();
    expect(data.error).toContain("Failed to get participant profile");
  });
});

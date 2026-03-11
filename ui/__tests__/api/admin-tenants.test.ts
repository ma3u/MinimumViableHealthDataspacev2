/**
 * API route tests for /api/admin/tenants
 *
 * Tests the admin tenant listing endpoint.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/edc", () => ({
  edcClient: {
    management: vi.fn(),
    tenant: vi.fn(),
  },
  EDC_CONTEXT: "https://w3id.org/edc/connector/management/v2",
}));

import { edcClient } from "@/lib/edc";
import { GET } from "@/app/api/admin/tenants/route";

const mockManagement = vi.mocked(edcClient.management);
const mockTenant = vi.mocked(edcClient.tenant);

describe("GET /api/admin/tenants", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return enriched tenants with participant data", async () => {
    const mockTenants = [
      {
        id: "t-1",
        version: 1,
        properties: { displayName: "Test Clinic", role: "data_holder" },
      },
    ];
    const mockParticipants = [
      { "@id": "ctx-1", identity: "did:web:spe-1", state: "ACTIVE" },
    ];

    mockTenant
      .mockResolvedValueOnce(mockTenants) // /v1alpha1/tenants
      .mockResolvedValueOnce([{ profileId: "p1" }]); // profiles for t-1
    mockManagement.mockResolvedValue(mockParticipants);

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.tenants).toHaveLength(1);
    expect(data.participants).toHaveLength(1);
    expect(data.summary.totalTenants).toBe(1);
    expect(data.summary.byRole.data_holder).toBe(1);
  });

  it("should return 502 when CFM is unavailable", async () => {
    mockTenant.mockRejectedValue(new Error("Connection refused"));

    const response = await GET();
    expect(response.status).toBe(502);
    const data = await response.json();
    expect(data.error).toContain("tenants");
  });
});

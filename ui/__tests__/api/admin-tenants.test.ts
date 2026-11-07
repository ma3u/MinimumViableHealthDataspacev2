/**
 * API route tests for /api/admin/tenants
 *
 * Tests the admin tenant listing endpoint. A participant is its control plane
 * context since ADR-078; Neo4j backs the list when the control plane is down.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/edc", () => ({
  edcClient: {
    management: vi.fn(),
    identity: vi.fn(),
  },
  EDC_CONTEXT: "https://w3id.org/edc/connector/management/v2",
}));

vi.mock("@/lib/neo4j", () => ({
  runQuery: vi.fn(),
}));

import { edcClient } from "@/lib/edc";
import { runQuery } from "@/lib/neo4j";
import { GET } from "@/app/api/admin/tenants/route";

const mockManagement = vi.mocked(edcClient.management);
const mockIdentity = vi.mocked(edcClient.identity);
const mockRunQuery = vi.mocked(runQuery);

describe("GET /api/admin/tenants", () => {
  beforeEach(() => {
    mockManagement.mockReset();
    mockIdentity.mockReset();
    mockRunQuery.mockReset();
  });

  it("lists the control plane's contexts as tenants and participants", async () => {
    mockManagement.mockResolvedValue([
      {
        "@id": "ctx-1",
        identity: "did:web:identityhub%3A7083:test-clinic-1a2b3c",
        state: "CREATED",
        properties: { displayName: "Test Clinic", role: "data_holder" },
      },
      {
        "@id": "ctx-lmc",
        identity: "did:web:identityhub%3A7083:lmc",
        state: "CREATED",
        properties: {},
      },
    ]);
    mockIdentity.mockResolvedValue([{ id: "vc" }]);

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.source).toBe("controlplane");
    expect(data.tenants.map((t: { id: string }) => t.id)).toEqual([
      "ctx-1",
      "ctx-lmc",
    ]);
    expect(data.tenants[1].properties.displayName).toBe(
      "Limburg Medical Centre",
    );
    expect(data.participants).toEqual([
      {
        "@id": "ctx-1",
        identity: "did:web:identityhub%3A7083:test-clinic-1a2b3c",
        state: "CREATED",
      },
      {
        "@id": "ctx-lmc",
        identity: "did:web:identityhub%3A7083:lmc",
        state: "CREATED",
      },
    ]);
    expect(data.summary).toMatchObject({
      totalTenants: 2,
      totalParticipants: 2,
      byRole: { data_holder: 1, DATA_HOLDER: 1 },
    });
    expect(mockRunQuery).not.toHaveBeenCalled();
  });

  it("returns 502 when the control plane and the Neo4j fallback are both unavailable", async () => {
    mockManagement.mockRejectedValue(new Error("Connection refused"));
    mockRunQuery.mockRejectedValue(new Error("Neo4j unreachable"));

    const response = await GET();
    expect(response.status).toBe(502);
    const data = await response.json();
    expect(data.error).toContain("tenants");
  });
});

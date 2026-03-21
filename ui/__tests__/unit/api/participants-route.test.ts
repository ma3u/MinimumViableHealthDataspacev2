/**
 * Tests for participant API routes:
 * - /api/participants/[id]/route.ts (PATCH)
 * - /api/participants/[id]/credentials/route.ts (GET)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Mock edcClient
const mockTenant = vi.fn();
const mockIdentity = vi.fn();
vi.mock("@/lib/edc", () => ({
  edcClient: {
    tenant: (...args: unknown[]) => mockTenant(...args),
    identity: (...args: unknown[]) => mockIdentity(...args),
  },
}));

import { PATCH } from "@/app/api/participants/[id]/route";
import { GET as GetCredentials } from "@/app/api/participants/[id]/credentials/route";

describe("/api/participants/[id] PATCH", () => {
  beforeEach(() => {
    mockTenant.mockReset();
  });

  it("updates tenant properties successfully", async () => {
    mockTenant.mockResolvedValue({ ok: true });

    const req = new NextRequest("http://localhost/api/participants/tenant-1", {
      method: "PATCH",
      body: JSON.stringify({
        properties: { displayName: "Updated Clinic" },
      }),
    });
    const res = await PATCH(req, { params: { id: "tenant-1" } });
    const data = await res.json();

    expect(data.ok).toBe(true);
    expect(mockTenant).toHaveBeenCalledWith(
      "/v1alpha1/tenants/tenant-1",
      "PATCH",
      { properties: { displayName: "Updated Clinic" } },
    );
  });

  it("returns 400 when properties is missing", async () => {
    const req = new NextRequest("http://localhost/api/participants/tenant-1", {
      method: "PATCH",
      body: JSON.stringify({}),
    });
    const res = await PATCH(req, { params: { id: "tenant-1" } });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Missing properties");
  });

  it("returns 400 when properties is not an object", async () => {
    const req = new NextRequest("http://localhost/api/participants/tenant-1", {
      method: "PATCH",
      body: JSON.stringify({ properties: "not-object" }),
    });
    const res = await PATCH(req, { params: { id: "tenant-1" } });

    expect(res.status).toBe(400);
  });

  it("returns 502 when TenantManager is unreachable", async () => {
    mockTenant.mockRejectedValue(new Error("ECONNREFUSED"));

    const req = new NextRequest("http://localhost/api/participants/tenant-1", {
      method: "PATCH",
      body: JSON.stringify({ properties: { name: "test" } }),
    });
    const res = await PATCH(req, { params: { id: "tenant-1" } });

    expect(res.status).toBe(502);
    const data = await res.json();
    expect(data.error).toBe("Failed to update participant");
  });

  it("returns result from tenant manager when available", async () => {
    mockTenant.mockResolvedValue(null);

    const req = new NextRequest("http://localhost/api/participants/tenant-1", {
      method: "PATCH",
      body: JSON.stringify({ properties: { enabled: "true" } }),
    });
    const res = await PATCH(req, { params: { id: "tenant-1" } });
    const data = await res.json();

    expect(data.ok).toBe(true);
  });
});

describe("/api/participants/[id]/credentials GET", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns credentials for a participant with a context ID", async () => {
    mockTenant.mockResolvedValue([
      {
        id: "profile-1",
        identifier: "did:web:alpha-klinik.de:participant",
        properties: {
          "cfm.vpa.state": { participantContextId: "ctx-abc" },
        },
      },
    ]);

    mockIdentity.mockResolvedValue([
      {
        id: "vc-1",
        verifiableCredential: {
          credential: {
            id: "urn:vc:ehds-participant-1",
            type: ["VerifiableCredential", "EHDSParticipantCredential"],
            issuer: { id: "did:web:issuer.localhost" },
            issuanceDate: "2025-01-01T00:00:00Z",
            credentialSubject: [{ participantId: "alpha-klinik" }],
          },
        },
      },
    ]);

    const req = new NextRequest(
      "http://localhost/api/participants/tenant-1/credentials",
    );
    const res = await GetCredentials(req, { params: { id: "tenant-1" } });
    const data = await res.json();

    expect(data).toHaveLength(1);
    expect(data[0].credentials).toHaveLength(1);
    expect(data[0].credentials[0].type).toContain("EHDSParticipantCredential");
    expect(data[0].did).toBe("did:web:alpha-klinik.de:participant");
  });

  it("returns empty credentials when no context ID available", async () => {
    mockTenant.mockResolvedValue([
      {
        id: "profile-2",
        properties: {},
      },
    ]);

    const req = new NextRequest(
      "http://localhost/api/participants/tenant-2/credentials",
    );
    const res = await GetCredentials(req, { params: { id: "tenant-2" } });
    const data = await res.json();

    expect(data[0].credentials).toEqual([]);
    expect(data[0].error).toBeDefined();
  });

  it("handles identity hub fetch errors per profile", async () => {
    mockTenant.mockResolvedValue([
      {
        id: "profile-3",
        properties: {
          "cfm.vpa.state": { participantContextId: "ctx-err" },
        },
      },
    ]);

    mockIdentity.mockRejectedValue(new Error("Identity Hub offline"));

    const req = new NextRequest(
      "http://localhost/api/participants/tenant-3/credentials",
    );
    const res = await GetCredentials(req, { params: { id: "tenant-3" } });
    const data = await res.json();

    expect(data[0].credentials).toEqual([]);
    expect(data[0].error).toContain("Identity Hub offline");
  });

  it("returns 502 when TenantManager is completely down", async () => {
    mockTenant.mockRejectedValue(new Error("ECONNREFUSED"));

    const req = new NextRequest(
      "http://localhost/api/participants/tenant-4/credentials",
    );
    const res = await GetCredentials(req, { params: { id: "tenant-4" } });

    expect(res.status).toBe(502);
  });
});

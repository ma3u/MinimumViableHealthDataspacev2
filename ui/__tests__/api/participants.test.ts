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

// Mock fs to prevent fallback to bundled participants.json
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
import { __resetDemoRecordsForTests } from "@/lib/demo-records";
import { GET, POST } from "@/app/api/participants/route";
import { GET as ME_GET } from "@/app/api/participants/me/route";

const mockManagement = vi.mocked(edcClient.management);
const mockTenant = vi.mocked(edcClient.tenant);

describe("/api/participants", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __resetDemoRecordsForTests();
  });

  describe("GET", () => {
    it("should list all participant contexts", async () => {
      const mockParticipants = [
        { "@id": "ctx-1", identity: "did:web:spe-1", state: "ACTIVATED" },
        { "@id": "ctx-2", identity: "did:web:pharmaco", state: "ACTIVATED" },
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

    // Issue #203. On the Azure deployment there is no cell, no dataspace
    // profile and possibly no Tenant Manager at all, because nothing outside
    // jad/seed-jad.sh creates them and the cfm database is never created. That
    // is the expected state there, not a failed registration, and it must never
    // be reported as a provisioned participant either.
    function register(displayName = "Test Clinic") {
      return new NextRequest("http://localhost:3000/api/participants", {
        method: "POST",
        body: JSON.stringify({
          displayName,
          organization: "Test Org",
          role: "data_holder",
        }),
      });
    }

    it("records the registration when the TenantManager has no cell", async () => {
      mockTenant.mockResolvedValue([]);

      const response = await POST(register());
      expect(response.status).toBe(201);

      const data = await response.json();
      expect(data.provisioned).toBe(false);
      expect(data.demo).toBe(true);
      expect(data.demoReason).toMatch(/no did was registered/i);
      expect(data.upstreamError).toContain("cell");
    });

    it("records the registration when there is no dataspace profile", async () => {
      mockTenant
        .mockResolvedValueOnce([{ id: "cell-1" }]) // cells
        .mockResolvedValueOnce([]); // profiles, empty

      const response = await POST(register());
      expect(response.status).toBe(201);

      const data = await response.json();
      expect(data.provisioned).toBe(false);
      expect(data.upstreamError).toContain("dataspace profile");
    });

    it("records the registration when the TenantManager is unreachable", async () => {
      mockTenant.mockRejectedValue(new Error("dial tcp: connection refused"));

      const response = await POST(register());
      expect(response.status).toBe(201);

      const data = await response.json();
      expect(data.provisioned).toBe(false);
      // The cause travels with the answer, which is the whole point of #203.
      expect(data.upstreamError).toContain("connection refused");
      // Nothing was created, so nothing may be claimed.
      expect(data.participantProfiles).toEqual([]);
      expect(mockTenant).not.toHaveBeenCalledWith(
        "/v1alpha1/tenants",
        "POST",
        expect.anything(),
      );
    });

    it("keeps the recorded registration in the list the page reloads", async () => {
      mockTenant.mockRejectedValue(new Error("connection refused"));
      await POST(register("Recorded Clinic"));

      const listed = await (await ME_GET()).json();

      // The page calls loadTenants() straight after submitting; a registration
      // that vanished there would look like it had failed.
      expect(listed).toHaveLength(1);
      expect(listed[0].properties.displayName).toBe("Recorded Clinic");
      expect(listed[0].provisioned).toBe(false);
    });

    it("should create tenant + participant and return 201", async () => {
      mockTenant
        .mockResolvedValueOnce([{ id: "cell-1" }]) // cells
        .mockResolvedValueOnce([{ id: "profile-1" }]) // profiles
        .mockResolvedValueOnce({ id: "tenant-abc" }) // create tenant
        .mockResolvedValueOnce({ id: "participant-xyz" }); // create participant

      const req = new NextRequest("http://localhost:3000/api/participants", {
        method: "POST",
        body: JSON.stringify({
          displayName: "Test Clinic",
          organization: "Test Org",
          role: "data_holder",
          ehdsParticipantType: "data_holder",
        }),
      });
      const response = await POST(req);
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.tenantId).toBe("tenant-abc");
      expect(data.participantId).toBe("participant-xyz");
      expect(data.displayName).toBe("Test Clinic");
      expect(data.status).toBe("provisioning");

      // Verify tenant creation call
      expect(mockTenant).toHaveBeenCalledWith(
        "/v1alpha1/tenants",
        "POST",
        expect.objectContaining({
          properties: expect.objectContaining({
            displayName: "Test Clinic",
            organization: "Test Org",
          }),
        }),
      );

      // Verify participant profile creation call
      expect(mockTenant).toHaveBeenCalledWith(
        "/v1alpha1/tenants/tenant-abc/participant-profiles",
        "POST",
        { cellId: "cell-1", dataspaceProfileId: "profile-1" },
      );
    });

    it("should return 502 when tenant creation fails", async () => {
      // The cell and the profile are there, so this deployment can provision:
      // a refusal of the write is then a real fault and must stay visible. The
      // previous version of this test rejected the very first call, so it never
      // reached tenant creation at all.
      mockTenant
        .mockResolvedValueOnce([{ id: "cell-1" }]) // cells
        .mockResolvedValueOnce([{ id: "profile-1" }]) // profiles
        .mockRejectedValueOnce(new Error("422 duplicate tenant"));

      const response = await POST(register());
      expect(response.status).toBe(502);

      const data = await response.json();
      expect(data.error).toContain("Failed to create participant");
      // "Failed to create participant" on its own was all the UI ever got.
      expect(data.detail).toContain("422 duplicate tenant");
      expect(data.provisioned).toBeUndefined();
    });

    it("marks a genuinely provisioned participant as provisioned", async () => {
      mockTenant
        .mockResolvedValueOnce([{ id: "cell-1" }])
        .mockResolvedValueOnce([{ id: "profile-1" }])
        .mockResolvedValueOnce({ id: "tenant-abc" })
        .mockResolvedValueOnce({ id: "participant-xyz" });

      const data = await (await POST(register())).json();

      expect(data.provisioned).toBe(true);
      expect(data.demo).toBeUndefined();
    });
  });
});

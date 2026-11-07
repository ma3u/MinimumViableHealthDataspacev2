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
    identity: vi.fn(),
    issuer: vi.fn(),
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
const mockIdentity = vi.mocked(edcClient.identity);
const mockIssuer = vi.mocked(edcClient.issuer);

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
      expect(mockManagement).toHaveBeenCalledWith("/v5/participants");
    });

    it("lists CREATED contexts when nothing is ACTIVATED, and says so", async () => {
      // The live Azure state since the 2026-10-28 re-seed: real contexts, all
      // CREATED, which still answer DSP catalog requests. Serving the mock
      // file here sent compose-stack ids to the Azure connector (#876).
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      mockManagement.mockResolvedValue([
        { "@id": "ctx-1", identity: "did:web:alpha-klinik", state: "CREATED" },
        { "@id": "ctx-2", identity: "did:web:pharmaco", state: "CREATED" },
      ]);

      const data = await (await GET()).json();

      expect(data.map((p: { "@id": string }) => p["@id"])).toEqual([
        "ctx-1",
        "ctx-2",
      ]);
      const said = warn.mock.calls.map((c) => String(c[0])).join("\n");
      expect(said).toContain("no ACTIVATED participant context");
      expect(said).toContain("2 CREATED context(s)");
      warn.mockRestore();
    });

    it("says the API answered but nothing is usable, not that it failed", async () => {
      // Answered, but with nothing ACTIVATED or CREATED. That must not read
      // the same as an unreachable Management API (#317).
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      mockManagement.mockResolvedValue([
        {
          "@id": "ctx-1",
          identity: "did:web:alpha-klinik",
          state: "DEACTIVATED",
        },
      ]);

      await GET();

      const said = warn.mock.calls.map((c) => String(c[0])).join("\n");
      expect(said).toContain("1 participant context(s), none ACTIVATED");
      expect(said).toContain("DEACTIVATED");
      warn.mockRestore();
    });

    it("says the list was empty when the control plane holds nothing", async () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      mockManagement.mockResolvedValue([]);

      await GET();

      const said = warn.mock.calls.map((c) => String(c[0])).join("\n");
      expect(said).toContain("empty participant list");
      expect(said).toContain("#316");
      warn.mockRestore();
    });

    it("names the two likely causes when the Management API is unreachable", async () => {
      // A wrong port and a wrong version segment both land here, and both are
      // what actually went wrong (#307, #317), so the log names them.
      const err = vi.spyOn(console, "error").mockImplementation(() => {});
      mockManagement.mockRejectedValue(new Error("404 Not Found"));

      await GET();

      const said = err.mock.calls.map((c) => String(c[0])).join("\n");
      expect(said).toContain("EDC_MANAGEMENT_URL");
      expect(said).toContain("EDC_MGMT_API_VERSION");
      expect(said).toContain("8081");
      err.mockRestore();
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

    /** The 1.0 stack answering every step, as lib/edc/provision.ts calls it. */
    function stackAnswers() {
      mockManagement.mockImplementation(async (path, method) =>
        path === "/v5/participants" && method === "POST"
          ? { "@id": "ctx-new" }
          : undefined,
      );
      mockIdentity.mockResolvedValue(undefined);
      mockIssuer.mockImplementation(async (path) =>
        String(path).endsWith("/credentialdefinitions/query")
          ? [{ id: "membership-def", credentialType: "MembershipCredential" }]
          : undefined,
      );
    }

    // ADR-078: the hub provisions the participant itself, without CFM.
    it("provisions on the control plane and answers 201 with the context", async () => {
      stackAnswers();

      const response = await POST(register());
      expect(response.status).toBe(201);

      const data = await response.json();
      expect(data).toMatchObject({
        tenantId: "ctx-new",
        participantId: "ctx-new",
        displayName: "Test Clinic",
        role: "data_holder",
        status: "provisioning",
        provisioned: true,
      });
      expect(data.did).toMatch(/^did:web:identityhub%3A7083:test-clinic-/);
      expect(data.steps).toHaveLength(7);
      expect(mockManagement).toHaveBeenCalledWith(
        "/v5/participants",
        "POST",
        expect.objectContaining({
          properties: expect.objectContaining({
            displayName: "Test Clinic",
            organization: "Test Org",
          }),
        }),
      );
    });

    // A control plane that does not answer is the hosted demo outside its
    // operating window (ADR-053), not a refused registration.
    it("answers 503 and records nothing when the control plane is unreachable", async () => {
      mockManagement.mockRejectedValue(new TypeError("fetch failed"));

      const response = await POST(register("Asleep Clinic"));
      expect(response.status).toBe(503);

      const data = await response.json();
      expect(data.error).toMatch(/not running/i);
      expect(data.detail).toMatch(/nothing was registered/i);
      expect(data.detail).toMatch(/07:00 to 20:00 Europe\/Berlin/);
      // The cause travels with the answer, which is the whole point of #203.
      expect(data.upstreamError).toContain("fetch failed");
      expect(mockIdentity).not.toHaveBeenCalled();

      // Nothing appears in the list the page reloads either.
      const listed = await (await ME_GET()).json();
      expect(listed).toEqual([]);
    });

    it("answers 502 with the failed step and what was undone", async () => {
      stackAnswers();
      mockIdentity.mockImplementation(async (path, method) => {
        if (path === "/v1/participants" && method === "POST") {
          throw new Error("EDC API error [identity] POST: 409 Conflict");
        }
        return undefined;
      });

      const response = await POST(register());
      expect(response.status).toBe(502);

      const data = await response.json();
      expect(data.error).toBe("Failed to create participant");
      expect(data.detail).toContain("IdentityHub participant failed");
      expect(data.detail).toContain("409");
      expect(data.steps.at(-1)).toEqual({
        step: "undo: control plane context",
        ok: true,
      });
      expect(mockManagement).toHaveBeenCalledWith(
        "/v5/participants/ctx-new",
        "DELETE",
      );
    });

    it("answers 400 to a body that is not JSON", async () => {
      const req = new NextRequest("http://localhost:3000/api/participants", {
        method: "POST",
        body: "not json",
      });
      expect((await POST(req)).status).toBe(400);
    });
  });

  describe("GET /me provisioning state", () => {
    const ctx = (registeredAt?: string) => ({
      "@id": "ctx-new",
      identity: "did:web:identityhub%3A7083:test-clinic-1a2b3c",
      state: "CREATED",
      properties: {
        displayName: "Test Clinic",
        role: "data_holder",
        ...(registeredAt ? { registeredAt } : {}),
      },
    });

    it("lists each context in the tenant shape, active once it holds its credential", async () => {
      mockManagement.mockResolvedValue([ctx(new Date().toISOString())]);
      mockIdentity.mockResolvedValue([{ id: "vc-1" }]);

      const listed = await (await ME_GET()).json();

      expect(listed).toHaveLength(1);
      expect(listed[0]).toMatchObject({
        id: "ctx-new",
        properties: { displayName: "Test Clinic" },
        provisioningComplete: true,
        provisioningStalled: false,
      });
      expect(listed[0].participantProfiles[0].identifier).toBe(
        "did:web:identityhub%3A7083:test-clinic-1a2b3c",
      );
      expect(mockIdentity).toHaveBeenCalledWith(
        "/v1/participants/ctx-new/credentials?type=MembershipCredential",
      );
    });

    it("leaves a fresh registration provisioning while its credential is on the way", async () => {
      mockManagement.mockResolvedValue([ctx(new Date().toISOString())]);
      mockIdentity.mockResolvedValue([]);

      const [one] = await (await ME_GET()).json();
      expect(one.provisioningComplete).toBe(false);
      expect(one.provisioningStalled).toBe(false);
      expect(one.vpaSummary.pendingTypes).toEqual(["MembershipCredential"]);
    });

    it("marks it stalled, with the reason, when the credential never came", async () => {
      mockManagement.mockResolvedValue([ctx("2026-09-17T19:53:20Z")]);
      mockIdentity.mockResolvedValue([]);

      const [one] = await (await ME_GET()).json();
      expect(one.provisioningStalled).toBe(true);
      expect(one.stalledReason).toContain("MembershipCredential");
      expect(one.stalledReason).toContain("2026-09-17");
    });

    it("lists the newest registration first", async () => {
      mockManagement.mockResolvedValue([
        { ...ctx("2026-11-01T10:00:00Z"), "@id": "older" },
        { ...ctx("2026-11-05T10:00:00Z"), "@id": "newer" },
      ]);
      mockIdentity.mockResolvedValue([]);

      const listed = await (await ME_GET()).json();
      expect(listed.map((t: { id: string }) => t.id)).toEqual([
        "newer",
        "older",
      ]);
    });

    it("answers an empty list, not a 502, when the control plane is down", async () => {
      mockManagement.mockRejectedValue(new TypeError("fetch failed"));
      const response = await ME_GET();
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual([]);
    });
  });
});

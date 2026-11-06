/**
 * Tests for participant API routes:
 * - /api/participants/[id]/route.ts (PATCH)
 * - /api/participants/[id]/credentials/route.ts (GET)
 *
 * The id is the control plane context id since ADR-078; IdentityHub shares it.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Mock edcClient
const mockManagement = vi.fn();
const mockIdentity = vi.fn();
vi.mock("@/lib/edc", () => ({
  edcClient: {
    management: (...args: unknown[]) => mockManagement(...args),
    identity: (...args: unknown[]) => mockIdentity(...args),
  },
  EDC_CONTEXT: "https://w3id.org/edc/connector/management/v2",
}));

import { PATCH } from "@/app/api/participants/[id]/route";
import { GET as GetCredentials } from "@/app/api/participants/[id]/credentials/route";

const CTX = {
  "@id": "ctx-1",
  identity: "did:web:identityhub%3A7083:alpha-klinik",
  state: "CREATED",
  properties: { displayName: "Clinic", organization: "Clinic Org" },
};

describe("/api/participants/[id] PATCH", () => {
  beforeEach(() => {
    mockManagement.mockReset();
  });

  it("merges the new properties into the context's and PUTs the context", async () => {
    mockManagement.mockResolvedValueOnce(CTX).mockResolvedValueOnce(undefined);

    const req = new NextRequest("http://localhost/api/participants/ctx-1", {
      method: "PATCH",
      body: JSON.stringify({
        properties: { displayName: "Updated Clinic" },
      }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: "ctx-1" }) });
    const data = await res.json();

    expect(data.ok).toBe(true);
    expect(mockManagement).toHaveBeenNthCalledWith(1, "/v5/participants/ctx-1");
    expect(mockManagement).toHaveBeenNthCalledWith(
      2,
      "/v5/participants/ctx-1",
      "PUT",
      expect.objectContaining({
        "@id": "ctx-1",
        identity: "did:web:identityhub%3A7083:alpha-klinik",
        properties: {
          displayName: "Updated Clinic",
          organization: "Clinic Org",
        },
      }),
    );
  });

  it("returns 400 when properties is missing", async () => {
    const req = new NextRequest("http://localhost/api/participants/ctx-1", {
      method: "PATCH",
      body: JSON.stringify({}),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: "ctx-1" }) });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Missing properties");
  });

  it("returns 400 when properties is not an object", async () => {
    const req = new NextRequest("http://localhost/api/participants/ctx-1", {
      method: "PATCH",
      body: JSON.stringify({ properties: "not-object" }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: "ctx-1" }) });

    expect(res.status).toBe(400);
  });

  it("returns 502 when the control plane is unreachable", async () => {
    mockManagement.mockRejectedValue(new Error("ECONNREFUSED"));

    const req = new NextRequest("http://localhost/api/participants/ctx-1", {
      method: "PATCH",
      body: JSON.stringify({ properties: { name: "test" } }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: "ctx-1" }) });

    expect(res.status).toBe(502);
    const data = await res.json();
    expect(data.error).toBe("Failed to update participant");
  });
});

describe("/api/participants/[id]/credentials GET", () => {
  beforeEach(() => {
    mockManagement.mockReset();
    mockIdentity.mockReset();
  });

  it("returns the context's credentials from IdentityHub", async () => {
    mockManagement.mockResolvedValue(CTX);
    mockIdentity.mockResolvedValue([
      {
        id: "vc-1",
        verifiableCredential: {
          credential: {
            id: "urn:vc:ehds-participant-1",
            type: ["VerifiableCredential", "MembershipCredential"],
            issuer: { id: "did:web:issuerservice%3A10016:issuer" },
            issuanceDate: "2026-11-05T00:00:00Z",
            credentialSubject: [{ participantId: "alpha-klinik" }],
          },
        },
      },
    ]);

    const req = new NextRequest(
      "http://localhost/api/participants/ctx-1/credentials",
    );
    const res = await GetCredentials(req, {
      params: Promise.resolve({ id: "ctx-1" }),
    });
    const data = await res.json();

    expect(mockIdentity).toHaveBeenCalledWith(
      "/v1/participants/ctx-1/credentials",
    );
    expect(data).toHaveLength(1);
    expect(data[0]).toMatchObject({
      profileId: "ctx-1",
      participantContextId: "ctx-1",
      did: "did:web:identityhub:7083:alpha-klinik",
    });
    expect(data[0].credentials[0].type).toContain("MembershipCredential");
  });

  it("carries an IdentityHub error rather than failing the request", async () => {
    mockManagement.mockResolvedValue(CTX);
    mockIdentity.mockRejectedValue(new Error("Identity Hub offline"));

    const req = new NextRequest(
      "http://localhost/api/participants/ctx-1/credentials",
    );
    const res = await GetCredentials(req, {
      params: Promise.resolve({ id: "ctx-1" }),
    });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data[0].credentials).toEqual([]);
    expect(data[0].error).toContain("Identity Hub offline");
  });

  it("returns 502, with the cause, when the context cannot be read", async () => {
    mockManagement.mockRejectedValue(new Error("ECONNREFUSED"));

    const req = new NextRequest(
      "http://localhost/api/participants/ctx-4/credentials",
    );
    const res = await GetCredentials(req, {
      params: Promise.resolve({ id: "ctx-4" }),
    });

    expect(res.status).toBe(502);
    expect((await res.json()).detail).toContain("ECONNREFUSED");
  });
});

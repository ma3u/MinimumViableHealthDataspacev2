/**
 * Extra coverage tests for /api/participants route.
 *
 * Targets uncovered lines: 80-92 (CFM tenant enrichment loop),
 * 141-143 (mock-file fallback success path), and branch fallbacks
 * in the displayName resolution chain.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockReadFile = vi.fn();

vi.mock("fs", () => ({
  default: { promises: { readFile: (...a: unknown[]) => mockReadFile(...a) } },
  promises: { readFile: (...a: unknown[]) => mockReadFile(...a) },
}));

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

describe("/api/participants – extra coverage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReadFile.mockRejectedValue(new Error("no mock file"));
  });

  // ── CFM tenant enrichment (lines 80-92) ────────────────────────────────

  it("GET enriches participants with CFM tenant displayNames via DID slug", async () => {
    mockManagement.mockResolvedValue([
      {
        "@id": "ctx-1",
        identity: "did:web:identityhub%3A7083:alpha-klinik",
        state: "ACTIVATED",
      },
    ]);
    mockTenant.mockResolvedValue([
      {
        id: "t1",
        properties: {
          displayName: "AlphaKlinik Berlin",
          participantDid: "did:web:identityhub%3A7083:alpha-klinik",
        },
      },
    ]);

    const res = await GET();
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toHaveLength(1);
    expect(data[0].displayName).toBe("AlphaKlinik Berlin");
  });

  it("GET skips tenants with no displayName in the enrichment loop", async () => {
    mockManagement.mockResolvedValue([
      { "@id": "ctx-1", identity: "did:web:unknown-slug", state: "ACTIVATED" },
    ]);
    mockTenant.mockResolvedValue([
      {
        id: "t-no-dn",
        properties: {
          // displayName is missing → should be skipped
          participantDid: "did:web:unknown-slug",
        },
      },
    ]);

    const res = await GET();
    const data = await res.json();

    expect(data).toHaveLength(1);
    // Falls through to slug-based name since tenant had no displayName
    expect(data[0].displayName).toBe("unknown-slug");
  });

  it("GET indexes tenant by displayName slug for looser matching", async () => {
    mockManagement.mockResolvedValue([
      {
        "@id": "ctx-1",
        identity: "did:web:identityhub:pharmaco",
        state: "ACTIVATED",
      },
    ]);
    mockTenant.mockResolvedValue([
      {
        id: "t2",
        properties: {
          displayName: "PharmaCo Research AG",
          participantDid: "did:web:identityhub:pharmaco",
        },
      },
    ]);

    const res = await GET();
    const data = await res.json();

    // Should pick up tenantMap entry via slug match
    expect(data[0].displayName).toBe("PharmaCo Research AG");
  });

  it("GET handles tenant with empty participantDid gracefully", async () => {
    mockManagement.mockResolvedValue([
      { "@id": "ctx-x", identity: "did:web:x", state: "ACTIVATED" },
    ]);
    mockTenant.mockResolvedValue([
      {
        id: "t3",
        properties: {
          displayName: "Some Name",
          // participantDid missing → slug will be empty, should not crash
        },
      },
    ]);

    const res = await GET();
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toHaveLength(1);
  });

  it("GET falls back to static SLUG_DISPLAY_NAMES when CFM tenant fails", async () => {
    mockManagement.mockResolvedValue([
      {
        "@id": "ctx-ak",
        identity: "did:web:identityhub%3A7083:alpha-klinik",
        state: "ACTIVATED",
      },
    ]);
    // CFM tenant call fails → falls to catch
    mockTenant.mockRejectedValue(new Error("CFM offline"));

    const res = await GET();
    const data = await res.json();

    expect(res.status).toBe(200);
    // Static fallback for alpha-klinik slug
    expect(data[0].displayName).toBe("AlphaKlinik Berlin");
    expect(data[0].role).toBe("DATA_HOLDER");
  });

  // ── displayName resolution chain ───────────────────────────────────────

  it("GET falls back to slug when no tenant or static match", async () => {
    mockManagement.mockResolvedValue([
      {
        "@id": "ctx-unknown",
        identity: "did:web:some-random-slug",
        state: "ACTIVATED",
      },
    ]);
    mockTenant.mockRejectedValue(new Error("failed"));

    const res = await GET();
    const data = await res.json();

    expect(data[0].displayName).toBe("some-random-slug");
    expect(data[0].role).toBe("");
  });

  it("GET falls back to @id prefix when identity is empty", async () => {
    mockManagement.mockResolvedValue([
      { "@id": "abcdefghijklmno", state: "ACTIVATED" },
    ]);
    mockTenant.mockRejectedValue(new Error("failed"));

    const res = await GET();
    const data = await res.json();

    // slug is empty → falls to p["@id"].slice(0,12)
    expect(data[0].displayName).toBe("abcdefghijkl");
  });

  it("GET uses participantId field when identity is absent", async () => {
    mockManagement.mockResolvedValue([
      {
        "@id": "ctx-pid",
        participantId: "did:web:via-pid",
        state: "ACTIVATED",
      },
    ]);
    mockTenant.mockRejectedValue(new Error("failed"));

    const res = await GET();
    const data = await res.json();

    expect(data[0].slug).toBe("via-pid");
  });

  // ── Non-array participants response ────────────────────────────────────

  it("GET falls through to mock when management returns non-array", async () => {
    mockManagement.mockResolvedValue(null);
    mockTenant.mockRejectedValue(new Error("down"));
    mockReadFile.mockResolvedValue(
      JSON.stringify([
        { "@id": "mock-1", displayName: "MockClinic", role: "DATA_HOLDER" },
      ]),
    );

    const res = await GET();
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toHaveLength(1);
    expect(data[0].displayName).toBe("MockClinic");
  });

  // ── Mock-file fallback success (lines 141-143) ─────────────────────────

  it("GET serves bundled mock data when EDC offline and mock file available", async () => {
    mockManagement.mockRejectedValue(new Error("ECONNREFUSED"));
    mockReadFile.mockResolvedValue(
      JSON.stringify([
        {
          "@id": "mock-1",
          displayName: "MockClinic",
          role: "DATA_HOLDER",
        },
      ]),
    );

    const res = await GET();
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toHaveLength(1);
    expect(data[0].displayName).toBe("MockClinic");
  });

  it("GET returns 502 when both EDC and mock file are unavailable", async () => {
    mockManagement.mockRejectedValue(new Error("ECONNREFUSED"));
    mockReadFile.mockRejectedValue(new Error("ENOENT"));

    const res = await GET();
    const data = await res.json();

    expect(res.status).toBe(502);
    expect(data.error).toBeDefined();
  });

  // ── POST: defaults for optional fields ─────────────────────────────────

  it("POST defaults organization to displayName when omitted", async () => {
    mockTenant
      .mockResolvedValueOnce([{ id: "cell-1" }])
      .mockResolvedValueOnce([{ id: "profile-1" }])
      .mockResolvedValueOnce({ id: "tenant-new" })
      .mockResolvedValueOnce({ id: "part-new" });

    const req = new NextRequest("http://localhost/api/participants", {
      method: "POST",
      body: JSON.stringify({ displayName: "Test", role: "DATA_USER" }),
    });
    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(201);
    expect(data.tenantId).toBe("tenant-new");

    // Verify organization defaulted to displayName
    expect(mockTenant).toHaveBeenCalledWith(
      "/v1alpha1/tenants",
      "POST",
      expect.objectContaining({
        properties: expect.objectContaining({
          organization: "Test",
          ehdsParticipantType: "DATA_USER",
        }),
      }),
    );
  });

  it("POST defaults ehdsParticipantType to role when omitted", async () => {
    mockTenant
      .mockResolvedValueOnce([{ id: "cell-1" }])
      .mockResolvedValueOnce([{ id: "profile-1" }])
      .mockResolvedValueOnce({ id: "t-x" })
      .mockResolvedValueOnce({ id: "p-x" });

    const req = new NextRequest("http://localhost/api/participants", {
      method: "POST",
      body: JSON.stringify({
        displayName: "Clinic",
        organization: "Org",
        role: "HDAB",
      }),
    });
    const res = await POST(req);

    expect(res.status).toBe(201);
    expect(mockTenant).toHaveBeenCalledWith(
      "/v1alpha1/tenants",
      "POST",
      expect.objectContaining({
        properties: expect.objectContaining({ ehdsParticipantType: "HDAB" }),
      }),
    );
  });

  it("POST returns 400 when both displayName and role are missing", async () => {
    const req = new NextRequest("http://localhost/api/participants", {
      method: "POST",
      body: JSON.stringify({}),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});

/**
 * Extra coverage tests for /api/participants route.
 *
 * Targets the displayName resolution chain (the context's own properties,
 * then the seeded five's names, then the slug), the mock-file fallback, and
 * POST's defaults for the optional fields.
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
    identity: vi.fn(),
    issuer: vi.fn(),
  },
  EDC_CONTEXT: "https://w3id.org/edc/connector/management/v2",
}));

import { edcClient } from "@/lib/edc";
import { GET, POST } from "@/app/api/participants/route";

const mockManagement = vi.mocked(edcClient.management);
const mockIdentity = vi.mocked(edcClient.identity);
const mockIssuer = vi.mocked(edcClient.issuer);

/** The 1.0 stack answering every provisioning step (lib/edc/provision.ts). */
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

/** The properties the context was created with. */
function createdProperties() {
  const call = mockManagement.mock.calls.find(
    (c) => c[0] === "/v5/participants" && c[1] === "POST",
  );
  return (call?.[2] as { properties: Record<string, string> }).properties;
}

describe("/api/participants – extra coverage", () => {
  beforeEach(() => {
    mockManagement.mockReset();
    mockIdentity.mockReset();
    mockIssuer.mockReset();
    mockReadFile.mockReset();
    mockReadFile.mockRejectedValue(new Error("no mock file"));
  });

  // ── Which contexts are listed (#876) ───────────────────────────────────

  it("GET lists only the ACTIVATED contexts when there are any", async () => {
    mockManagement.mockResolvedValue([
      {
        "@id": "ctx-live",
        identity: "did:web:identityhub%3A7083:alpha-klinik",
        state: "ACTIVATED",
      },
      {
        "@id": "ctx-stale",
        identity: "did:web:identityhub%3A7083:alpha-klinik",
        state: "CREATED",
      },
    ]);

    const data = await (await GET()).json();

    expect(data.map((p: { "@id": string }) => p["@id"])).toEqual(["ctx-live"]);
  });

  it("GET lists the CREATED contexts, not the mock file, when none is ACTIVATED", async () => {
    // The Azure control plane since the 2026-10-28 re-seed: every context
    // CREATED, and still answering DSP catalog requests.
    mockManagement.mockResolvedValue([
      {
        "@id": "36b1a04b-e352-47cb-b3ea-76412c70f405",
        identity: "did:web:mvhd-identityhub%3A7083:alpha-klinik",
        state: "CREATED",
      },
      {
        "@id": "3386f049-185a-4b5c-a24a-e5719df88412",
        identity: "did:web:mvhd-identityhub%3A7083:pharmaco",
        state: "CREATED",
      },
      { "@id": "ctx-gone", identity: "did:web:x", state: "DEACTIVATED" },
    ]);
    mockReadFile.mockResolvedValue(JSON.stringify([{ "@id": "mock-ctx" }]));

    const data = await (await GET()).json();

    expect(data).toHaveLength(2);
    expect(data[0]).toMatchObject({
      participantId: "36b1a04b-e352-47cb-b3ea-76412c70f405",
      identity: "did:web:mvhd-identityhub%3A7083:alpha-klinik",
      displayName: "AlphaKlinik Berlin",
      role: "DATA_HOLDER",
      state: "CREATED",
    });
    expect(data[1]).toMatchObject({
      displayName: "PharmaCo Research AG",
      role: "DATA_USER",
    });
    expect(mockReadFile).not.toHaveBeenCalled();
  });

  it("GET serves the mock file when no context is ACTIVATED or CREATED", async () => {
    mockManagement.mockResolvedValue([
      { "@id": "ctx-gone", identity: "did:web:x", state: "DEACTIVATED" },
    ]);
    mockReadFile.mockResolvedValue(JSON.stringify([{ "@id": "mock-ctx" }]));

    const data = await (await GET()).json();

    expect(data).toEqual([{ "@id": "mock-ctx" }]);
  });

  // ── The context's own properties (ADR-078) ────────────────────────────

  it("GET names a participant onboarded through the hub by its own properties", async () => {
    mockManagement.mockResolvedValue([
      {
        "@id": "ctx-1",
        identity: "did:web:identityhub%3A7083:riverside-general-4f2a91",
        state: "CREATED",
        properties: { displayName: "Riverside General", role: "DATA_HOLDER" },
      },
    ]);

    const res = await GET();
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data[0]).toMatchObject({
      displayName: "Riverside General",
      role: "DATA_HOLDER",
      slug: "riverside-general-4f2a91",
    });
  });

  it("GET falls back to the seeded five's names when the context has none", async () => {
    mockManagement.mockResolvedValue([
      {
        "@id": "ctx-ak",
        identity: "did:web:identityhub%3A7083:alpha-klinik",
        state: "ACTIVATED",
        properties: {},
      },
    ]);

    const res = await GET();
    const data = await res.json();

    expect(res.status).toBe(200);
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

    const res = await GET();
    const data = await res.json();

    expect(data[0].displayName).toBe("some-random-slug");
    expect(data[0].role).toBe("");
  });

  it("GET falls back to @id prefix when identity is empty", async () => {
    mockManagement.mockResolvedValue([
      { "@id": "abcdefghijklmno", state: "ACTIVATED" },
    ]);

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

    const res = await GET();
    const data = await res.json();

    expect(data[0].slug).toBe("via-pid");
  });

  // ── Non-array participants response ────────────────────────────────────

  it("GET falls through to mock when management returns non-array", async () => {
    mockManagement.mockResolvedValue(null);
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
    stackAnswers();

    const req = new NextRequest("http://localhost/api/participants", {
      method: "POST",
      body: JSON.stringify({ displayName: "Test", role: "DATA_USER" }),
    });
    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(201);
    expect(data.tenantId).toBe("ctx-new");
    expect(createdProperties()).toMatchObject({
      organization: "Test",
      ehdsParticipantType: "DATA_USER",
    });
  });

  it("POST gives the participant a fresh did:web under the IdentityHub", async () => {
    stackAnswers();

    const req = new NextRequest("http://localhost/api/participants", {
      method: "POST",
      body: JSON.stringify({
        displayName: "Testpraxis Lindenhof",
        role: "data-holder",
        ehdsParticipantType: "data-holder",
      }),
    });
    const res = await POST(req);

    expect(res.status).toBe(201);
    const { did } = await res.json();
    expect(did).toMatch(
      /^did:web:identityhub%3A7083:testpraxis-lindenhof-[0-9a-f]{6}$/,
    );
    expect(mockIdentity).toHaveBeenCalledWith(
      "/v1/participants",
      "POST",
      expect.objectContaining({ participantContextId: "ctx-new", did }),
    );
  });

  it("POST defaults ehdsParticipantType to role when omitted", async () => {
    stackAnswers();

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
    expect(createdProperties()).toMatchObject({
      organization: "Org",
      ehdsParticipantType: "HDAB",
    });
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

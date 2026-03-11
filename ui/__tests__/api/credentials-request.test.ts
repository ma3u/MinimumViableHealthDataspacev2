/**
 * API route tests for POST /api/credentials/request
 *
 * Tests credential issuance request endpoint.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/edc", () => ({
  edcClient: {
    issuer: vi.fn(),
  },
}));

import { edcClient } from "@/lib/edc";
import { POST } from "@/app/api/credentials/request/route";

const mockIssuer = vi.mocked(edcClient.issuer);

describe("POST /api/credentials/request", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return 400 when participantContextId is missing", async () => {
    const req = new NextRequest(
      "http://localhost:3000/api/credentials/request",
      {
        method: "POST",
        body: JSON.stringify({ credentialType: "EHDSDataAccessCredential" }),
      },
    );
    const response = await POST(req);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain("participantContextId");
  });

  it("should return 400 when credentialType is missing", async () => {
    const req = new NextRequest(
      "http://localhost:3000/api/credentials/request",
      {
        method: "POST",
        body: JSON.stringify({ participantContextId: "ctx-1" }),
      },
    );
    const response = await POST(req);

    expect(response.status).toBe(400);
  });

  it("should return 404 when no matching credential definition found", async () => {
    mockIssuer.mockResolvedValue([
      { credentialType: "SomeOtherType", id: "def-1" },
    ]);

    const req = new NextRequest(
      "http://localhost:3000/api/credentials/request",
      {
        method: "POST",
        body: JSON.stringify({
          participantContextId: "ctx-1",
          credentialType: "EHDSDataAccessCredential",
        }),
      },
    );
    const response = await POST(req);
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toContain("No credential definition found");
    expect(data.availableTypes).toEqual(["SomeOtherType"]);
  });

  it("should submit credential request when definition found", async () => {
    mockIssuer.mockResolvedValue([
      { credentialType: "EHDSDataAccessCredential", id: "def-1" },
    ]);

    const req = new NextRequest(
      "http://localhost:3000/api/credentials/request",
      {
        method: "POST",
        body: JSON.stringify({
          participantContextId: "ctx-1",
          credentialType: "EHDSDataAccessCredential",
        }),
      },
    );
    const response = await POST(req);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.status).toBe("credential_request_submitted");
    expect(data.credentialType).toBe("EHDSDataAccessCredential");
    expect(data.participantContextId).toBe("ctx-1");
  });

  it("should return 502 when issuer API fails", async () => {
    mockIssuer.mockRejectedValue(new Error("Connection refused"));

    const req = new NextRequest(
      "http://localhost:3000/api/credentials/request",
      {
        method: "POST",
        body: JSON.stringify({
          participantContextId: "ctx-1",
          credentialType: "EHDSDataAccessCredential",
        }),
      },
    );
    const response = await POST(req);

    expect(response.status).toBe(502);
    const data = await response.json();
    expect(data.error).toContain("Failed to request credential issuance");
  });
});

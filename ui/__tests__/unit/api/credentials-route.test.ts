/**
 * Tests for credential API routes:
 * - /api/credentials/[id]/route.ts (DELETE)
 * - /api/credentials/definitions/route.ts (GET)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Mock neo4j runQuery
const mockRunQuery = vi.fn();
vi.mock("@/lib/neo4j", () => ({
  runQuery: (...args: unknown[]) => mockRunQuery(...args),
}));

// Mock edcClient
const mockIssuer = vi.fn();
vi.mock("@/lib/edc", () => ({
  edcClient: {
    issuer: (...args: unknown[]) => mockIssuer(...args),
  },
}));

import { DELETE } from "@/app/api/credentials/[id]/route";
import { GET as GetDefinitions } from "@/app/api/credentials/definitions/route";

describe("/api/credentials/[id] DELETE", () => {
  beforeEach(() => {
    mockRunQuery.mockReset();
  });

  it("deletes a credential and returns success", async () => {
    mockRunQuery.mockResolvedValue([{ deleted: 1 }]);

    const req = new NextRequest("http://localhost/api/credentials/vc-123");
    const res = await DELETE(req, { params: { id: "vc-123" } });
    const data = await res.json();

    expect(data.status).toBe("deleted");
    expect(data.id).toBe("vc-123");
    expect(mockRunQuery).toHaveBeenCalledWith(
      expect.stringContaining("DETACH DELETE"),
      { id: "vc-123" },
    );
  });

  it("returns 404 when credential not found", async () => {
    mockRunQuery.mockResolvedValue([{ deleted: 0 }]);

    const req = new NextRequest(
      "http://localhost/api/credentials/non-existent",
    );
    const res = await DELETE(req, { params: { id: "non-existent" } });
    const data = await res.json();

    expect(res.status).toBe(404);
    expect(data.error).toBe("Credential not found");
  });

  it("returns 400 when id is empty", async () => {
    const req = new NextRequest("http://localhost/api/credentials/");
    const res = await DELETE(req, { params: { id: "" } });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Credential ID is required");
  });

  it("handles empty query result", async () => {
    mockRunQuery.mockResolvedValue([]);

    const req = new NextRequest("http://localhost/api/credentials/vc-empty");
    const res = await DELETE(req, { params: { id: "vc-empty" } });

    expect(res.status).toBe(404);
  });
});

describe("/api/credentials/definitions GET", () => {
  beforeEach(() => {
    mockIssuer.mockReset();
  });

  it("returns credential definitions from IssuerService", async () => {
    mockIssuer.mockResolvedValue([
      {
        id: "def-1",
        credentialType: "EHDSParticipantCredential",
        format: "JWT",
        attestations: [],
        validity: "P1Y",
      },
      {
        id: "def-2",
        type: "DataProcessingPurposeCredential",
        format: "JSON-LD",
      },
    ]);

    const res = await GetDefinitions();
    const data = await res.json();

    expect(data.definitions).toHaveLength(2);
    expect(data.definitions[0].credentialType).toBe(
      "EHDSParticipantCredential",
    );
    expect(data.definitions[1].credentialType).toBe(
      "DataProcessingPurposeCredential",
    );
  });

  it("returns empty array when IssuerService is unreachable", async () => {
    mockIssuer.mockRejectedValue(new Error("ECONNREFUSED"));

    const res = await GetDefinitions();
    const data = await res.json();

    expect(data.definitions).toEqual([]);
    expect(data.error).toBeDefined();
  });

  it("handles non-array response gracefully", async () => {
    mockIssuer.mockResolvedValue({ unexpected: "format" });

    const res = await GetDefinitions();
    const data = await res.json();

    expect(data.definitions).toEqual([]);
  });
});

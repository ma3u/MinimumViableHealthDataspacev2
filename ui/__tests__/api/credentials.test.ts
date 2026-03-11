/**
 * API route tests for GET /api/credentials
 *
 * Tests the credentials API handler by mocking the Neo4j runQuery function.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/neo4j", () => ({
  runQuery: vi.fn(),
}));

import { runQuery } from "@/lib/neo4j";
import { GET } from "@/app/api/credentials/route";

const mockRunQuery = vi.mocked(runQuery);

describe("GET /api/credentials", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return credentials list from Neo4j", async () => {
    const mockCredentials = [
      {
        credentialId: "vc-001",
        credentialType: "EHDSParticipantCredential",
        subjectDid: "did:web:spe-1",
        issuerDid: "did:web:bfarm",
        status: "active",
        participantRole: "data_holder",
        holderName: "SPE-1 Test Clinic",
        holderType: "SPE",
        issuedAt: "2024-01-01T00:00:00Z",
        expiresAt: "2025-01-01T00:00:00Z",
        purpose: null,
        datasetId: null,
        completeness: null,
        conformance: null,
        timeliness: null,
      },
    ];

    mockRunQuery.mockResolvedValue(mockCredentials);

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.credentials).toHaveLength(1);
    expect(data.credentials[0].credentialType).toBe(
      "EHDSParticipantCredential",
    );
    expect(mockRunQuery).toHaveBeenCalledOnce();
    expect(mockRunQuery.mock.calls[0][0]).toContain("VerifiableCredential");
  });

  it("should return empty credentials array", async () => {
    mockRunQuery.mockResolvedValue([]);

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.credentials).toEqual([]);
  });

  it("should return quality credentials with completeness/conformance", async () => {
    const mockCredentials = [
      {
        credentialId: "vc-quality-001",
        credentialType: "DataQualityCredential",
        subjectDid: "did:web:spe-1",
        issuerDid: "did:web:bfarm",
        status: "active",
        participantRole: null,
        holderName: "SPE-1 Test Clinic",
        holderType: "SPE",
        issuedAt: "2024-06-01T00:00:00Z",
        expiresAt: "2025-06-01T00:00:00Z",
        purpose: "research",
        datasetId: "ds-001",
        completeness: 0.95,
        conformance: 0.88,
        timeliness: 0.92,
      },
    ];

    mockRunQuery.mockResolvedValue(mockCredentials);

    const response = await GET();
    const data = await response.json();

    expect(data.credentials[0].completeness).toBe(0.95);
    expect(data.credentials[0].datasetId).toBe("ds-001");
  });
});

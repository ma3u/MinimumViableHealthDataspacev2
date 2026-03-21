/**
 * Tests for admin API routes:
 * - /api/admin/audit/route.ts
 * - /api/admin/components/route.ts
 * - /api/admin/components/topology/route.ts
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Mock global fetch for audit route (Neo4j HTTP API)
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import { GET as AuditGET } from "@/app/api/admin/audit/route";

function mockNeo4jResponse(data: unknown[]) {
  return {
    ok: true,
    json: () =>
      Promise.resolve({
        results: [{ data: data.map((row) => ({ row: [row] })) }],
        errors: [],
      }),
  };
}

function mockNeo4jMultiColResponse(rows: unknown[][]) {
  return {
    ok: true,
    json: () =>
      Promise.resolve({
        results: [{ data: rows.map((row) => ({ row })) }],
        errors: [],
      }),
  };
}

describe("/api/admin/audit GET", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("returns transfers for type=transfers", async () => {
    mockFetch.mockResolvedValueOnce(
      mockNeo4jResponse([
        {
          transferId: "tx-1",
          status: "COMPLETED",
          consumerName: "PharmaCo",
          providerName: "AlphaKlinik",
          accessLogCount: 3,
        },
      ]),
    );

    const req = new NextRequest(
      "http://localhost/api/admin/audit?type=transfers",
    );
    const res = await AuditGET(req);
    const data = await res.json();

    expect(data.type).toBe("transfers");
    expect(data.transfers).toHaveLength(1);
    expect(data.transfers[0].transferId).toBe("tx-1");
  });

  it("returns negotiations for type=negotiations", async () => {
    mockFetch.mockResolvedValueOnce(
      mockNeo4jResponse([
        {
          negotiationId: "neg-1",
          status: "FINALIZED",
          consumerName: "PharmaCo",
        },
      ]),
    );

    const req = new NextRequest(
      "http://localhost/api/admin/audit?type=negotiations",
    );
    const res = await AuditGET(req);
    const data = await res.json();

    expect(data.type).toBe("negotiations");
    expect(data.negotiations).toHaveLength(1);
  });

  it("returns participants list for type=participants", async () => {
    mockFetch.mockResolvedValueOnce(
      mockNeo4jMultiColResponse([
        [
          "did:web:alpha-klinik.de:participant",
          "AlphaKlinik Berlin",
          "DE",
          "Dr. Müller",
          "mueller@alpha-klinik.de",
          "+49 30 1234",
          "http://cp.localhost",
        ],
      ]),
    );

    const req = new NextRequest(
      "http://localhost/api/admin/audit?type=participants",
    );
    const res = await AuditGET(req);
    const data = await res.json();

    expect(data.participants).toHaveLength(1);
    expect(data.participants[0].name).toBe("AlphaKlinik Berlin");
    expect(data.participants[0].country).toBe("DE");
  });

  it("applies limit parameter (capped at 200)", async () => {
    mockFetch.mockResolvedValue(mockNeo4jResponse([]));

    const req = new NextRequest(
      "http://localhost/api/admin/audit?type=transfers&limit=500",
    );
    const res = await AuditGET(req);
    const data = await res.json();

    expect(data.limit).toBe(200);
  });

  it("defaults limit to 50", async () => {
    mockFetch.mockResolvedValue(mockNeo4jResponse([]));

    const req = new NextRequest(
      "http://localhost/api/admin/audit?type=transfers",
    );
    const res = await AuditGET(req);
    const data = await res.json();

    expect(data.limit).toBe(50);
  });

  it("handles Neo4j connection error", async () => {
    mockFetch.mockRejectedValue(new Error("ECONNREFUSED"));

    const req = new NextRequest(
      "http://localhost/api/admin/audit?type=transfers",
    );
    const res = await AuditGET(req);

    expect(res.status).toBe(502);
    const data = await res.json();
    expect(data.error).toBeDefined();
  });

  it("returns all types when type=all", async () => {
    // transfers, negotiations, credentials, then 2 stats queries
    mockFetch
      .mockResolvedValueOnce(mockNeo4jResponse([])) // transfers
      .mockResolvedValueOnce(mockNeo4jResponse([])) // negotiations
      .mockResolvedValueOnce(mockNeo4jResponse([])) // credentials
      .mockResolvedValueOnce(
        // stats
        mockNeo4jMultiColResponse([
          ["DataTransfer", 5],
          ["ContractNegotiation", 3],
        ]),
      )
      .mockResolvedValueOnce(
        // access stats
        mockNeo4jMultiColResponse([["PharmaCo", 10, 1024, "2024-01-01"]]),
      );

    const req = new NextRequest("http://localhost/api/admin/audit?type=all");
    const res = await AuditGET(req);
    const data = await res.json();

    expect(data.type).toBe("all");
    expect(data).toHaveProperty("transfers");
    expect(data).toHaveProperty("negotiations");
    expect(data).toHaveProperty("credentials");
    expect(data).toHaveProperty("summary");
  });

  it("applies filter parameters to queries", async () => {
    mockFetch.mockResolvedValue(mockNeo4jResponse([]));

    const req = new NextRequest(
      "http://localhost/api/admin/audit?type=transfers&status=COMPLETED&crossBorder=true",
    );
    const res = await AuditGET(req);
    const data = await res.json();

    expect(data.filters.status).toBe("COMPLETED");
    expect(data.filters.crossBorder).toBe("true");
  });

  it("returns credentials for type=credentials", async () => {
    mockFetch.mockResolvedValueOnce(
      mockNeo4jResponse([
        {
          credentialId: "vc-1",
          type: "EHDSParticipantCredential",
          participant: "AlphaKlinik Berlin",
        },
      ]),
    );

    const req = new NextRequest(
      "http://localhost/api/admin/audit?type=credentials",
    );
    const res = await AuditGET(req);
    const data = await res.json();

    expect(data.credentials).toHaveLength(1);
  });

  it("returns access logs for type=accesslogs", async () => {
    mockFetch.mockResolvedValueOnce(
      mockNeo4jResponse([
        {
          logId: "al-1",
          consumerName: "PharmaCo",
          accessedAt: "2024-06-01T10:00:00Z",
        },
      ]),
    );

    const req = new NextRequest(
      "http://localhost/api/admin/audit?type=accesslogs",
    );
    const res = await AuditGET(req);
    const data = await res.json();

    expect(data).toHaveProperty("accesslogs");
  });
});

/**
 * Tests for /api/admin/audit/route.ts.
 *
 * Neo4j is reached through runQuery() from @/lib/neo4j (Bolt on 7687). The
 * route used to call the transactional HTTP API on port 7474, which Azure
 * Container Apps never exposed, so the page was blank on the live site
 * (issue #205). The last test pins that no HTTP call is made.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import neo4j from "neo4j-driver";

vi.mock("@/lib/neo4j", () => ({
  runQuery: vi.fn(),
}));

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import { runQuery } from "@/lib/neo4j";
import { GET as AuditGET } from "@/app/api/admin/audit/route";

const mockRunQuery = vi.mocked(runQuery);

describe("/api/admin/audit GET", () => {
  beforeEach(() => {
    mockRunQuery.mockReset();
    mockFetch.mockReset();
  });

  it("returns transfers for type=transfers", async () => {
    mockRunQuery.mockResolvedValueOnce([
      {
        transfer: {
          transferId: "tx-1",
          status: "COMPLETED",
          consumerName: "PharmaCo Research AG",
          providerName: "AlphaKlinik Berlin",
          accessLogCount: 3,
        },
      },
    ]);

    const req = new NextRequest(
      "http://localhost/api/admin/audit?type=transfers",
    );
    const res = await AuditGET(req);
    const data = await res.json();

    expect(data.type).toBe("transfers");
    expect(data.transfers).toHaveLength(1);
    expect(data.transfers[0].transferId).toBe("tx-1");
    expect(mockRunQuery).toHaveBeenCalledTimes(1);
    expect(mockRunQuery.mock.calls[0][0]).toContain("MATCH (t:DataTransfer)");
  });

  it("returns negotiations for type=negotiations", async () => {
    mockRunQuery.mockResolvedValueOnce([
      {
        negotiation: {
          negotiationId: "neg-1",
          status: "FINALIZED",
          consumerName: "PharmaCo Research AG",
        },
      },
    ]);

    const req = new NextRequest(
      "http://localhost/api/admin/audit?type=negotiations",
    );
    const res = await AuditGET(req);
    const data = await res.json();

    expect(data.negotiations).toHaveLength(1);
    expect(data.negotiations[0].negotiationId).toBe("neg-1");
    expect(mockRunQuery.mock.calls[0][0]).toContain(
      "MATCH (n:ContractNegotiation)",
    );
  });

  it("returns participants list for type=participants", async () => {
    mockRunQuery.mockResolvedValueOnce([
      {
        did: "did:web:alpha-klinik.de:participant",
        name: "AlphaKlinik Berlin",
        country: "DE",
        complianceOfficerName: "Dr. Müller",
        complianceOfficerEmail: "mueller@alpha-klinik.de",
        complianceOfficerPhone: "+49 30 1234",
        edcEndpoint: "http://cp.localhost",
      },
    ]);

    const req = new NextRequest(
      "http://localhost/api/admin/audit?type=participants",
    );
    const res = await AuditGET(req);
    const data = await res.json();

    expect(data.participants).toHaveLength(1);
    expect(data.participants[0].name).toBe("AlphaKlinik Berlin");
    expect(data.participants[0].country).toBe("DE");
    expect(data.participants[0].did).toBe(
      "did:web:alpha-klinik.de:participant",
    );
  });

  it("passes LIMIT as a Neo4j integer, capped at 200", async () => {
    mockRunQuery.mockResolvedValue([]);

    const req = new NextRequest(
      "http://localhost/api/admin/audit?type=transfers&limit=500",
    );
    const res = await AuditGET(req);
    const data = await res.json();

    expect(data.limit).toBe(200);
    const params = mockRunQuery.mock.calls[0][1] as {
      limit: { toNumber(): number };
    };
    expect(neo4j.isInt(params.limit)).toBe(true);
    expect(params.limit.toNumber()).toBe(200);
  });

  it("defaults limit to 50", async () => {
    mockRunQuery.mockResolvedValue([]);

    const req = new NextRequest(
      "http://localhost/api/admin/audit?type=transfers",
    );
    const res = await AuditGET(req);
    const data = await res.json();

    expect(data.limit).toBe(50);
  });

  it("answers 502 with the reason when Neo4j is unreachable", async () => {
    mockRunQuery.mockRejectedValue(new Error("ECONNREFUSED"));

    const req = new NextRequest(
      "http://localhost/api/admin/audit?type=transfers",
    );
    const res = await AuditGET(req);

    expect(res.status).toBe(502);
    const data = await res.json();
    expect(data.error).toBe("Failed to query audit log");
    expect(data.detail).toContain("ECONNREFUSED");
  });

  it("returns all types when type=all", async () => {
    // transfers, negotiations, credentials, then 2 stats queries
    mockRunQuery
      .mockResolvedValueOnce([]) // transfers
      .mockResolvedValueOnce([]) // negotiations
      .mockResolvedValueOnce([]) // credentials
      .mockResolvedValueOnce([
        // node counts
        { label: "DataTransfer", count: 5 },
        { label: "ContractNegotiation", count: 3 },
      ])
      .mockResolvedValueOnce([
        // access stats
        {
          consumerName: "PharmaCo Research AG",
          totalAccesses: 10,
          totalBytes: 1024,
          lastAccess: "2024-01-01",
        },
      ]);

    const req = new NextRequest("http://localhost/api/admin/audit?type=all");
    const res = await AuditGET(req);
    const data = await res.json();

    expect(data.type).toBe("all");
    expect(data).toHaveProperty("transfers");
    expect(data).toHaveProperty("negotiations");
    expect(data).toHaveProperty("credentials");
    expect(data.summary.nodeCounts).toEqual({
      DataTransfer: 5,
      ContractNegotiation: 3,
    });
    expect(data.summary.accessByConsumer).toHaveLength(1);
    expect(data.summary.accessByConsumer[0].consumerName).toBe(
      "PharmaCo Research AG",
    );
    expect(mockRunQuery).toHaveBeenCalledTimes(5);
  });

  it("applies filter parameters to queries", async () => {
    mockRunQuery.mockResolvedValue([]);

    const req = new NextRequest(
      "http://localhost/api/admin/audit?type=transfers&status=COMPLETED&crossBorder=true",
    );
    const res = await AuditGET(req);
    const data = await res.json();

    expect(data.filters.status).toBe("COMPLETED");
    expect(data.filters.crossBorder).toBe("true");
    const [cypher, params] = mockRunQuery.mock.calls[0];
    expect(cypher).toContain("t.status = $filterStatus");
    expect(cypher).toContain("t.crossBorder = true");
    expect(params).toMatchObject({ filterStatus: "COMPLETED" });
  });

  it("returns credentials for type=credentials", async () => {
    mockRunQuery.mockResolvedValueOnce([
      {
        credential: {
          credentialId: "vc-1",
          type: "EHDSParticipantCredential",
          participant: "AlphaKlinik Berlin",
        },
      },
    ]);

    const req = new NextRequest(
      "http://localhost/api/admin/audit?type=credentials",
    );
    const res = await AuditGET(req);
    const data = await res.json();

    expect(data.credentials).toHaveLength(1);
    expect(data.credentials[0].credentialId).toBe("vc-1");
  });

  it("returns access logs for type=accesslogs", async () => {
    mockRunQuery.mockResolvedValueOnce([
      {
        log: {
          logId: "al-1",
          consumerName: "PharmaCo Research AG",
          accessedAt: "2024-06-01T10:00:00Z",
        },
      },
    ]);

    const req = new NextRequest(
      "http://localhost/api/admin/audit?type=accesslogs&contractId=c-1",
    );
    const res = await AuditGET(req);
    const data = await res.json();

    expect(data.accesslogs).toHaveLength(1);
    expect(data.accesslogs[0].logId).toBe("al-1");
    const [cypher, params] = mockRunQuery.mock.calls[0];
    // The recorder (neo4j-proxy) writes TransferEvent; the tab read a label
    // nothing writes until issue #205.
    expect(cypher).toContain("MATCH (te:TransferEvent)");
    expect(cypher).not.toContain("DataAccessLog");
    expect(cypher).toContain("te.contractId = $filterContractId");
    expect(params).toMatchObject({ filterContractId: "c-1" });
  });

  it("filters access logs by consumer, provider and date", async () => {
    mockRunQuery.mockResolvedValue([]);

    const req = new NextRequest(
      "http://localhost/api/admin/audit?type=accesslogs" +
        "&consumerDid=did:web:pharmaco.de:research" +
        "&providerDid=did:web:alpha-klinik.de:participant" +
        "&dateFrom=2026-09-01&dateTo=2026-09-17",
    );
    const res = await AuditGET(req);
    expect(res.status).toBe(200);

    const [cypher, params] = mockRunQuery.mock.calls[0];
    expect(cypher).toContain(
      "coalesce(te.consumerDid, te.participant) = $filterConsumerDid",
    );
    expect(cypher).toContain("te.providerDid = $filterProviderDid");
    expect(cypher).toContain("toString(te.timestamp) >= $filterDateFrom");
    expect(params).toMatchObject({
      filterConsumerDid: "did:web:pharmaco.de:research",
      filterProviderDid: "did:web:alpha-klinik.de:participant",
      filterDateFrom: "2026-09-01",
      filterDateTo: "2026-09-17T23:59:59Z",
    });
  });

  it("never touches Neo4j's HTTP port", async () => {
    mockRunQuery.mockResolvedValue([]);

    await AuditGET(
      new NextRequest("http://localhost/api/admin/audit?type=all"),
    );

    expect(mockFetch).not.toHaveBeenCalled();
  });
});

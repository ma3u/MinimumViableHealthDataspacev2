/**
 * Unit tests for /api/compliance route — focusing on uncovered branches.
 *
 * Covers: list-mode EDC fallback for consumers, dataset fallback from
 * HealthDataset nodes, didSlug parsing, SLUG_DISPLAY mapping, EDC
 * participant state filtering, multiple approval chains in check mode.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ────────────────────────────────────────────────────────────
const mockRunQuery = vi.fn();
vi.mock("@/lib/neo4j", () => ({
  runQuery: (...args: unknown[]) => mockRunQuery(...args),
}));

const mockManagement = vi.fn();
vi.mock("@/lib/edc", () => ({
  edcClient: {
    management: (...args: unknown[]) => mockManagement(...args),
  },
}));

import { GET } from "@/app/api/compliance/route";

// ── Setup ────────────────────────────────────────────────────────────
beforeEach(() => {
  vi.clearAllMocks();
});

// =====================================================================
// List mode — no consumerId / datasetId
// =====================================================================
describe("GET /api/compliance — list mode", () => {
  it("should return consumers and datasets when Neo4j has data", async () => {
    mockRunQuery
      .mockResolvedValueOnce([
        { id: "pharmaco", name: "PharmaCo Research AG", type: "DATA_USER" },
      ])
      .mockResolvedValueOnce([{ id: "ds-1", title: "FHIR Cohort" }]);

    const res = await GET(new Request("http://localhost:3000/api/compliance"));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.consumers).toHaveLength(1);
    expect(data.datasets).toHaveLength(1);
    // EDC management should NOT be called when Neo4j has consumers
    expect(mockManagement).not.toHaveBeenCalled();
  });

  // ── Consumer fallback to EDC-V ──────────────────────────────────

  it("should fall back to EDC-V participants when Neo4j consumers are empty", async () => {
    mockRunQuery
      .mockResolvedValueOnce([]) // consumers
      .mockResolvedValueOnce([{ id: "ds-1", title: "FHIR Cohort" }]); // datasets

    mockManagement.mockResolvedValue([
      {
        "@id": "ctx-alpha",
        identity: "did:web:alpha-klinik",
        state: "ACTIVATED",
      },
      {
        "@id": "ctx-pharmaco",
        identity: "did:web:pharmaco",
        state: "ACTIVATED",
      },
    ]);

    const res = await GET(new Request("http://localhost:3000/api/compliance"));
    const data = await res.json();

    expect(data.consumers).toHaveLength(2);
    // Verify SLUG_DISPLAY mapping was applied
    expect(data.consumers[0].name).toBe("AlphaKlinik Berlin");
    expect(data.consumers[0].type).toBe("DATA_HOLDER");
    expect(data.consumers[1].name).toBe("PharmaCo Research AG");
    expect(data.consumers[1].type).toBe("DATA_USER");
  });

  it("should filter EDC participants by ACTIVATED state", async () => {
    mockRunQuery
      .mockResolvedValueOnce([]) // consumers
      .mockResolvedValueOnce([{ id: "ds-1", title: "Data" }]); // datasets

    mockManagement.mockResolvedValue([
      {
        "@id": "ctx-1",
        identity: "did:web:alpha-klinik.de:p",
        state: "ACTIVATED",
      },
      {
        "@id": "ctx-2",
        identity: "did:web:pharmaco.de:p",
        state: "DEACTIVATED",
      },
    ]);

    const res = await GET(new Request("http://localhost:3000/api/compliance"));
    const data = await res.json();

    // Only ACTIVATED participants are returned
    expect(data.consumers).toHaveLength(1);
    expect(data.consumers[0].id).toBe("ctx-1");
  });

  it("should treat missing state as ACTIVATED", async () => {
    mockRunQuery
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: "ds-1", title: "Data" }]);

    mockManagement.mockResolvedValue([
      { "@id": "ctx-1", identity: "did:web:medreg" },
    ]);

    const res = await GET(new Request("http://localhost:3000/api/compliance"));
    const data = await res.json();

    expect(data.consumers).toHaveLength(1);
    expect(data.consumers[0].name).toBe("MedReg DE");
    expect(data.consumers[0].type).toBe("HDAB");
  });

  it("should use @id as identity fallback when identity is undefined", async () => {
    mockRunQuery
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: "ds-1", title: "Data" }]);

    mockManagement.mockResolvedValue([
      { "@id": "ctx-unknown", state: "ACTIVATED" },
    ]);

    const res = await GET(new Request("http://localhost:3000/api/compliance"));
    const data = await res.json();

    // No SLUG_DISPLAY match, falls back to slug then @id prefix
    expect(data.consumers).toHaveLength(1);
    expect(data.consumers[0].type).toBe("PARTICIPANT");
  });

  it("should handle non-array EDC response gracefully", async () => {
    mockRunQuery
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: "ds-1", title: "Data" }]);

    // EDC returns an object instead of array (unexpected response)
    mockManagement.mockResolvedValue({ error: "unexpected" });

    const res = await GET(new Request("http://localhost:3000/api/compliance"));
    const data = await res.json();

    // Should treat non-array as empty — no consumers returned
    expect(data.consumers).toEqual([]);
  });

  it("should keep consumers empty when EDC-V also fails", async () => {
    mockRunQuery
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: "ds-1", title: "Data" }]);

    mockManagement.mockRejectedValue(new Error("ECONNREFUSED"));

    const res = await GET(new Request("http://localhost:3000/api/compliance"));
    const data = await res.json();

    expect(data.consumers).toEqual([]);
  });

  // ── Dataset fallback ──────────────────────────────────────────────

  it("should fall back to HealthDataset nodes when approval-linked datasets are empty", async () => {
    mockRunQuery
      .mockResolvedValueOnce([
        { id: "c1", name: "Consumer", type: "DATA_USER" },
      ])
      .mockResolvedValueOnce([]) // no approval-linked datasets
      .mockResolvedValueOnce([
        { id: "ds-graph", title: "Graph Dataset" },
        { id: "ds-graph-2", title: "Another Dataset" },
      ]); // HealthDataset fallback

    const res = await GET(new Request("http://localhost:3000/api/compliance"));
    const data = await res.json();

    expect(data.datasets).toHaveLength(2);
    expect(data.datasets[0].id).toBe("ds-graph");
  });

  it("should return empty datasets when both approval and graph queries return empty", async () => {
    mockRunQuery
      .mockResolvedValueOnce([
        { id: "c1", name: "Consumer", type: "DATA_USER" },
      ])
      .mockResolvedValueOnce([]) // no approval-linked datasets
      .mockResolvedValueOnce([]); // no HealthDataset nodes either

    const res = await GET(new Request("http://localhost:3000/api/compliance"));
    const data = await res.json();

    expect(data.datasets).toEqual([]);
  });

  it("should not query HealthDataset fallback when approval datasets exist", async () => {
    mockRunQuery
      .mockResolvedValueOnce([
        { id: "c1", name: "Consumer", type: "DATA_USER" },
      ])
      .mockResolvedValueOnce([{ id: "ds-1", title: "Approved Dataset" }]);

    const res = await GET(new Request("http://localhost:3000/api/compliance"));
    const data = await res.json();

    expect(data.datasets).toHaveLength(1);
    // runQuery should have been called exactly 2 times (consumers + datasets)
    expect(mockRunQuery).toHaveBeenCalledTimes(2);
  });

  // ── DID slug parsing & display mapping ────────────────────────────

  it("should resolve 'lmc' slug to Limburg Medical Centre", async () => {
    mockRunQuery
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: "ds-1", title: "Data" }]);

    mockManagement.mockResolvedValue([
      {
        "@id": "ctx-lmc",
        identity: "did:web:lmc",
        state: "ACTIVATED",
      },
    ]);

    const res = await GET(new Request("http://localhost:3000/api/compliance"));
    const data = await res.json();

    expect(data.consumers[0].name).toBe("Limburg Medical Centre");
    expect(data.consumers[0].type).toBe("DATA_HOLDER");
  });

  it("should resolve 'irs' slug to Institut de Recherche Santé", async () => {
    mockRunQuery
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: "ds-1", title: "Data" }]);

    mockManagement.mockResolvedValue([
      {
        "@id": "ctx-irs",
        identity: "did:web:irs",
        state: "ACTIVATED",
      },
    ]);

    const res = await GET(new Request("http://localhost:3000/api/compliance"));
    const data = await res.json();

    expect(data.consumers[0].name).toBe("Institut de Recherche Santé");
    expect(data.consumers[0].type).toBe("HDAB");
  });

  it("should handle URL-encoded DID components", async () => {
    mockRunQuery
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: "ds-1", title: "Data" }]);

    mockManagement.mockResolvedValue([
      {
        "@id": "ctx-enc",
        identity: "did:web:alpha-klinik.de%3Aparticipant",
        state: "ACTIVATED",
      },
    ]);

    const res = await GET(new Request("http://localhost:3000/api/compliance"));
    const data = await res.json();

    // After decodeURIComponent, the last segment should match
    expect(data.consumers).toHaveLength(1);
  });

  // ── Both consumers + datasets fallback simultaneously ─────────────

  it("should apply both consumer and dataset fallbacks simultaneously", async () => {
    mockRunQuery
      .mockResolvedValueOnce([]) // no consumers
      .mockResolvedValueOnce([]) // no approval-linked datasets
      .mockResolvedValueOnce([{ id: "ds-fallback", title: "Fallback DS" }]); // HealthDataset fallback

    mockManagement.mockResolvedValue([
      {
        "@id": "ctx-1",
        identity: "did:web:alpha-klinik.de:p",
        state: "ACTIVATED",
      },
    ]);

    const res = await GET(new Request("http://localhost:3000/api/compliance"));
    const data = await res.json();

    expect(data.consumers).toHaveLength(1);
    expect(data.datasets).toHaveLength(1);
    expect(data.datasets[0].id).toBe("ds-fallback");
  });
});

// =====================================================================
// Check mode — consumerId + datasetId
// =====================================================================
describe("GET /api/compliance — check mode", () => {
  it("should return compliant=true with full approval chain", async () => {
    mockRunQuery.mockResolvedValue([
      {
        consumer: "pharmaco",
        applicationId: "app-001",
        applicationStatus: "approved",
        approvalId: "aprv-001",
        approvalStatus: "granted",
        ehdsArticle: "Art.46",
        dataset: "ds-001",
        contract: "ctr-001",
      },
    ]);

    const res = await GET(
      new Request(
        "http://localhost:3000/api/compliance?consumerId=pharmaco&datasetId=ds-001",
      ),
    );
    const data = await res.json();

    expect(data.compliant).toBe(true);
    expect(data.chain).toHaveLength(1);
  });

  it("should return compliant=false when no chain exists", async () => {
    mockRunQuery.mockResolvedValue([]);

    const res = await GET(
      new Request(
        "http://localhost:3000/api/compliance?consumerId=unknown&datasetId=ds-001",
      ),
    );
    const data = await res.json();

    expect(data.compliant).toBe(false);
    expect(data.chain).toEqual([]);
  });

  it("should handle multiple approval chains for same consumer+dataset", async () => {
    mockRunQuery.mockResolvedValue([
      {
        consumer: "pharmaco",
        applicationId: "app-001",
        applicationStatus: "approved",
        approvalId: "aprv-001",
        approvalStatus: "granted",
        ehdsArticle: "Art.46",
        dataset: "ds-001",
        contract: "ctr-001",
      },
      {
        consumer: "pharmaco",
        applicationId: "app-002",
        applicationStatus: "approved",
        approvalId: "aprv-002",
        approvalStatus: "granted",
        ehdsArticle: "Art.53",
        dataset: "ds-001",
        contract: null,
      },
    ]);

    const res = await GET(
      new Request(
        "http://localhost:3000/api/compliance?consumerId=pharmaco&datasetId=ds-001",
      ),
    );
    const data = await res.json();

    expect(data.compliant).toBe(true);
    expect(data.chain).toHaveLength(2);
    expect(data.chain[1].contract).toBeNull();
  });

  it("should pass consumerId and datasetId to Neo4j query", async () => {
    mockRunQuery.mockResolvedValue([]);

    await GET(
      new Request(
        "http://localhost:3000/api/compliance?consumerId=ctx-1&datasetId=ds-99",
      ),
    );

    expect(mockRunQuery).toHaveBeenCalledWith(
      expect.stringContaining("WHERE"),
      { consumerId: "ctx-1", datasetId: "ds-99" },
    );
  });

  it("should only use consumerId for list mode (partial params)", async () => {
    // Only consumerId provided → list mode (missing datasetId)
    mockRunQuery
      .mockResolvedValueOnce([
        { id: "c1", name: "Consumer", type: "DATA_USER" },
      ])
      .mockResolvedValueOnce([{ id: "ds-1", title: "Dataset" }]);

    const res = await GET(
      new Request("http://localhost:3000/api/compliance?consumerId=pharmaco"),
    );
    const data = await res.json();

    // Should be in list mode since datasetId is missing
    expect(data.consumers).toBeDefined();
    expect(data.datasets).toBeDefined();
    expect(data.compliant).toBeUndefined();
  });

  it("should enter list mode when only datasetId is provided", async () => {
    mockRunQuery
      .mockResolvedValueOnce([
        { id: "c1", name: "Consumer", type: "DATA_USER" },
      ])
      .mockResolvedValueOnce([{ id: "ds-1", title: "Dataset" }]);

    const res = await GET(
      new Request("http://localhost:3000/api/compliance?datasetId=ds-001"),
    );
    const data = await res.json();

    expect(data.consumers).toBeDefined();
    expect(data.compliant).toBeUndefined();
  });
});

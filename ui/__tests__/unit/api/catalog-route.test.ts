/**
 * Tests for the Catalog API route: /api/catalog/route.ts
 *
 * Covers: GET (Neo4j + mock merging, deduplication, fallback),
 * POST (validation, Neo4j write, mock JSON fallback, update vs create),
 * DELETE (validation, Neo4j delete, mock JSON fallback).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Mocks ────────────────────────────────────────────────────────────
const mockRunQuery = vi.fn();
vi.mock("@/lib/neo4j", () => ({
  runQuery: (...args: unknown[]) => mockRunQuery(...args),
}));

const mockReadFile = vi.fn();
const mockWriteFile = vi.fn();

vi.mock("fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("fs")>();
  return {
    ...actual,
    default: {
      ...actual,
      promises: {
        ...actual.promises,
        readFile: (...args: unknown[]) => mockReadFile(...args),
        writeFile: (...args: unknown[]) => mockWriteFile(...args),
      },
    },
    promises: {
      ...actual.promises,
      readFile: (...args: unknown[]) => mockReadFile(...args),
      writeFile: (...args: unknown[]) => mockWriteFile(...args),
    },
  };
});
vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("fs")>();
  return {
    ...actual,
    default: {
      ...actual,
      promises: {
        ...actual.promises,
        readFile: (...args: unknown[]) => mockReadFile(...args),
        writeFile: (...args: unknown[]) => mockWriteFile(...args),
      },
    },
    promises: {
      ...actual.promises,
      readFile: (...args: unknown[]) => mockReadFile(...args),
      writeFile: (...args: unknown[]) => mockWriteFile(...args),
    },
  };
});

import { GET, POST, DELETE } from "@/app/api/catalog/route";

// ── Helpers ──────────────────────────────────────────────────────────
const MOCK_ENTRY_A = {
  id: "dataset:fhir-patients",
  title: "Synthetic FHIR Cohort",
  description: "A synthetic patient cohort",
  license: "CC-BY-4.0",
  conformsTo: "http://hl7.org/fhir/R4",
  publisher: "AlphaKlinik Berlin",
  theme: "Clinical Research",
  datasetType: "SyntheticData",
  legalBasis: "EHDS Article 53",
  recordCount: 10000,
};

const MOCK_ENTRY_B = {
  id: "dataset:cancer-registry",
  title: "Cancer Registry Limburg",
  description: "Regional cancer registry data",
  license: "CC-BY-NC-4.0",
  conformsTo: "http://hl7.org/fhir/R4",
  publisher: "Limburg Medical Centre",
  theme: "Cancer Registry",
  datasetType: "Registry",
  legalBasis: "GDPR Art 9(2)(j)",
  recordCount: 5000,
};

function jsonBody(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/catalog", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ── Setup ────────────────────────────────────────────────────────────
beforeEach(() => {
  mockRunQuery.mockReset();
  mockReadFile.mockReset();
  mockWriteFile.mockReset();
});

// ── GET /api/catalog ─────────────────────────────────────────────────
describe("GET /api/catalog", () => {
  it("returns merged results from Neo4j and mock file", async () => {
    mockRunQuery.mockResolvedValue([MOCK_ENTRY_A]);
    mockReadFile.mockResolvedValue(JSON.stringify([MOCK_ENTRY_B]));

    const res = await GET();
    const data = await res.json();

    expect(data).toHaveLength(2);
    expect(data[0].id).toBe("dataset:fhir-patients");
    expect(data[1].id).toBe("dataset:cancer-registry");
  });

  it("deduplicates entries with same id (Neo4j wins)", async () => {
    const neo4jVersion = { ...MOCK_ENTRY_A, title: "Neo4j Title" };
    const mockVersion = { ...MOCK_ENTRY_A, title: "Mock Title" };

    mockRunQuery.mockResolvedValue([neo4jVersion]);
    mockReadFile.mockResolvedValue(JSON.stringify([mockVersion]));

    const res = await GET();
    const data = await res.json();

    expect(data).toHaveLength(1);
    expect(data[0].title).toBe("Neo4j Title");
  });

  it("returns only mock data when Neo4j is unavailable", async () => {
    mockRunQuery.mockRejectedValue(new Error("ECONNREFUSED"));
    mockReadFile.mockResolvedValue(
      JSON.stringify([MOCK_ENTRY_A, MOCK_ENTRY_B]),
    );

    const res = await GET();
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toHaveLength(2);
  });

  it("returns only Neo4j data when mock file is missing", async () => {
    mockRunQuery.mockResolvedValue([MOCK_ENTRY_A]);
    mockReadFile.mockRejectedValue(new Error("ENOENT"));

    const res = await GET();
    const data = await res.json();

    expect(data).toHaveLength(1);
    expect(data[0].id).toBe("dataset:fhir-patients");
  });

  it("returns empty array when both Neo4j and mock fail", async () => {
    mockRunQuery.mockRejectedValue(new Error("ECONNREFUSED"));
    mockReadFile.mockRejectedValue(new Error("ENOENT"));

    const res = await GET();
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toEqual([]);
  });

  it("calls runQuery with the correct MATCH query", async () => {
    mockRunQuery.mockResolvedValue([]);
    mockReadFile.mockRejectedValue(new Error("ENOENT"));

    await GET();

    expect(mockRunQuery).toHaveBeenCalledOnce();
    expect(mockRunQuery.mock.calls[0][0]).toContain("MATCH (d:HealthDataset)");
  });

  it("returns empty array when Neo4j returns [] and mock is empty", async () => {
    mockRunQuery.mockResolvedValue([]);
    mockReadFile.mockResolvedValue("[]");

    const res = await GET();
    const data = await res.json();

    expect(data).toEqual([]);
  });

  it("handles mock file with invalid JSON gracefully", async () => {
    mockRunQuery.mockResolvedValue([MOCK_ENTRY_A]);
    mockReadFile.mockResolvedValue("not valid json");

    // Should throw during JSON.parse in loadMockCatalog but the catch returns []
    const res = await GET();
    const data = await res.json();

    expect(data).toHaveLength(1);
    expect(data[0].id).toBe("dataset:fhir-patients");
  });

  it("preserves all fields from Neo4j rows", async () => {
    mockRunQuery.mockResolvedValue([MOCK_ENTRY_A]);
    mockReadFile.mockRejectedValue(new Error("ENOENT"));

    const res = await GET();
    const data = await res.json();

    expect(data[0]).toMatchObject({
      id: "dataset:fhir-patients",
      title: "Synthetic FHIR Cohort",
      description: "A synthetic patient cohort",
      license: "CC-BY-4.0",
      publisher: "AlphaKlinik Berlin",
      recordCount: 10000,
    });
  });

  it("merges multiple Neo4j rows with multiple mock rows", async () => {
    const neo4jRows = [
      MOCK_ENTRY_A,
      { ...MOCK_ENTRY_B, id: "dataset:neo4j-only" },
    ];
    const mockRows = [
      MOCK_ENTRY_B,
      { ...MOCK_ENTRY_A, id: "dataset:mock-only" },
    ];

    mockRunQuery.mockResolvedValue(neo4jRows);
    mockReadFile.mockResolvedValue(JSON.stringify(mockRows));

    const res = await GET();
    const data = await res.json();

    // Neo4j has A + neo4j-only; mock has B + mock-only
    // B is not in Neo4j IDs, mock-only is not in Neo4j IDs → both merge in
    expect(data).toHaveLength(4);
    const ids = data.map((d: { id: string }) => d.id);
    expect(ids).toContain("dataset:fhir-patients");
    expect(ids).toContain("dataset:neo4j-only");
    expect(ids).toContain("dataset:cancer-registry");
    expect(ids).toContain("dataset:mock-only");
  });
});

// ── POST /api/catalog ────────────────────────────────────────────────
describe("POST /api/catalog", () => {
  it("creates entry via Neo4j and returns success", async () => {
    mockRunQuery.mockResolvedValue([]);

    const req = jsonBody({
      id: "dataset:new-one",
      title: "New Dataset",
      description: "A fresh dataset",
      publisher: "PharmaCo Research AG",
    });
    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.id).toBe("dataset:new-one");
  });

  it("calls runQuery with MERGE for the dataset", async () => {
    mockRunQuery.mockResolvedValue([]);

    const req = jsonBody({
      id: "dataset:test",
      title: "Test",
      publisher: "Test Publisher",
    });
    await POST(req);

    expect(mockRunQuery).toHaveBeenCalledOnce();
    const cypher = mockRunQuery.mock.calls[0][0] as string;
    expect(cypher).toContain("MERGE (d:HealthDataset {id: $id})");
    expect(cypher).toContain("MERGE (p:Participant {name: $publisher})");
    expect(cypher).toContain("MERGE (p)-[:PUBLISHES]->(d)");
  });

  it("passes all HealthDCAT-AP parameters to Neo4j", async () => {
    mockRunQuery.mockResolvedValue([]);

    const req = jsonBody({
      id: "ds:full",
      title: "Full Dataset",
      description: "Desc",
      publisher: "Pub",
      license: "CC-BY",
      conformsTo: "fhir",
      theme: "Research",
      datasetType: "Cohort",
      legalBasis: "Art 53",
      recordCount: 100,
      personalData: true,
      sensitiveData: false,
      purpose: "Research",
      populationCoverage: "EU",
      numberOfUniqueIndividuals: 50,
      healthCategory: "Cardiology",
      minTypicalAge: 18,
      maxTypicalAge: 80,
      publisherType: "Hospital",
      language: "de",
      spatial: "DE",
    });
    await POST(req);

    const params = mockRunQuery.mock.calls[0][1] as Record<string, unknown>;
    expect(params.id).toBe("ds:full");
    expect(params.title).toBe("Full Dataset");
    expect(params.personalData).toBe(true);
    expect(params.sensitiveData).toBe(false);
    expect(params.language).toBe("de");
    expect(params.spatial).toBe("DE");
    expect(params.recordCount).toBe(100);
    expect(params.healthCategory).toBe("Cardiology");
  });

  it("returns 400 when id is missing", async () => {
    const req = jsonBody({ title: "No ID" });
    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toContain("id and title are required");
  });

  it("returns 400 when title is missing", async () => {
    const req = jsonBody({ id: "dataset:no-title" });
    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toContain("id and title are required");
  });

  it("returns 400 when both id and title are missing", async () => {
    const req = jsonBody({ description: "nothing else" });
    const res = await POST(req);

    expect(res.status).toBe(400);
  });

  it("falls back to mock JSON when Neo4j is unavailable", async () => {
    mockRunQuery.mockRejectedValue(new Error("ECONNREFUSED"));
    mockReadFile.mockResolvedValue(JSON.stringify([]));
    mockWriteFile.mockResolvedValue(undefined);

    const req = jsonBody({
      id: "dataset:fallback",
      title: "Fallback Entry",
      description: "Written to mock",
      publisher: "Test",
    });
    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(mockWriteFile).toHaveBeenCalledOnce();
  });

  it("writes correctly shaped JSON to mock file on fallback", async () => {
    mockRunQuery.mockRejectedValue(new Error("ECONNREFUSED"));
    mockReadFile.mockResolvedValue("[]");
    mockWriteFile.mockResolvedValue(undefined);

    const req = jsonBody({
      id: "ds:written",
      title: "Written",
      description: "Desc",
      publisher: "Pub",
      license: "MIT",
    });
    await POST(req);

    const written = JSON.parse(mockWriteFile.mock.calls[0][1] as string);
    expect(written).toHaveLength(1);
    expect(written[0].id).toBe("ds:written");
    expect(written[0].title).toBe("Written");
    expect(written[0].license).toBe("MIT");
  });

  it("updates existing entry in mock file by matching id", async () => {
    mockRunQuery.mockRejectedValue(new Error("ECONNREFUSED"));
    mockReadFile.mockResolvedValue(JSON.stringify([{ ...MOCK_ENTRY_A }]));
    mockWriteFile.mockResolvedValue(undefined);

    const req = jsonBody({
      id: MOCK_ENTRY_A.id,
      title: "Updated Title",
    });
    await POST(req);

    const written = JSON.parse(mockWriteFile.mock.calls[0][1] as string);
    expect(written).toHaveLength(1);
    expect(written[0].title).toBe("Updated Title");
  });

  it("appends new entry to existing mock catalog", async () => {
    mockRunQuery.mockRejectedValue(new Error("ECONNREFUSED"));
    mockReadFile.mockResolvedValue(JSON.stringify([MOCK_ENTRY_A]));
    mockWriteFile.mockResolvedValue(undefined);

    const req = jsonBody({
      id: "dataset:brand-new",
      title: "Brand New",
    });
    await POST(req);

    const written = JSON.parse(mockWriteFile.mock.calls[0][1] as string);
    expect(written).toHaveLength(2);
  });

  it("starts fresh mock catalog when file read fails", async () => {
    mockRunQuery.mockRejectedValue(new Error("ECONNREFUSED"));
    mockReadFile.mockRejectedValue(new Error("ENOENT"));
    mockWriteFile.mockResolvedValue(undefined);

    const req = jsonBody({ id: "ds:fresh", title: "Fresh" });
    await POST(req);

    const written = JSON.parse(mockWriteFile.mock.calls[0][1] as string);
    expect(written).toHaveLength(1);
    expect(written[0].id).toBe("ds:fresh");
  });

  it("defaults optional fields when not provided", async () => {
    mockRunQuery.mockResolvedValue([]);

    const req = jsonBody({ id: "ds:minimal", title: "Minimal" });
    await POST(req);

    const params = mockRunQuery.mock.calls[0][1] as Record<string, unknown>;
    expect(params.description).toBe("");
    expect(params.publisher).toBe("");
    expect(params.license).toBe("");
    expect(params.personalData).toBe(false);
    expect(params.sensitiveData).toBe(false);
    expect(params.language).toBe("en");
    expect(params.recordCount).toBeNull();
  });

  it("returns 500 on unexpected error (e.g. invalid body)", async () => {
    const req = new NextRequest("http://localhost/api/catalog", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not-json",
    });
    const res = await POST(req);

    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toBe("Internal server error");
  });
});

// ── DELETE /api/catalog ──────────────────────────────────────────────
describe("DELETE /api/catalog", () => {
  it("deletes entry via Neo4j and returns success", async () => {
    mockRunQuery.mockResolvedValue([]);

    const req = new NextRequest(
      "http://localhost/api/catalog?id=dataset:fhir-patients",
      { method: "DELETE" },
    );
    const res = await DELETE(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.ok).toBe(true);
  });

  it("calls runQuery with DETACH DELETE for the given id", async () => {
    mockRunQuery.mockResolvedValue([]);

    const req = new NextRequest(
      "http://localhost/api/catalog?id=ds:to-delete",
      { method: "DELETE" },
    );
    await DELETE(req);

    expect(mockRunQuery).toHaveBeenCalledWith(
      expect.stringContaining("DETACH DELETE d"),
      { id: "ds:to-delete" },
    );
  });

  it("returns 400 when id query param is missing", async () => {
    const req = new NextRequest("http://localhost/api/catalog", {
      method: "DELETE",
    });
    const res = await DELETE(req);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toBe("id is required");
  });

  it("falls back to mock file removal when Neo4j is unavailable", async () => {
    mockRunQuery.mockRejectedValue(new Error("ECONNREFUSED"));
    mockReadFile.mockResolvedValue(
      JSON.stringify([MOCK_ENTRY_A, MOCK_ENTRY_B]),
    );
    mockWriteFile.mockResolvedValue(undefined);

    const req = new NextRequest(
      `http://localhost/api/catalog?id=${MOCK_ENTRY_A.id}`,
      { method: "DELETE" },
    );
    const res = await DELETE(req);
    const data = await res.json();

    expect(data.ok).toBe(true);
    const written = JSON.parse(mockWriteFile.mock.calls[0][1] as string);
    expect(written).toHaveLength(1);
    expect(written[0].id).toBe(MOCK_ENTRY_B.id);
  });

  it("succeeds even when mock file is missing on fallback", async () => {
    mockRunQuery.mockRejectedValue(new Error("ECONNREFUSED"));
    mockReadFile.mockRejectedValue(new Error("ENOENT"));

    const req = new NextRequest("http://localhost/api/catalog?id=ds:missing", {
      method: "DELETE",
    });
    const res = await DELETE(req);
    const data = await res.json();

    expect(data.ok).toBe(true);
  });

  it("removes the correct entry from mock catalog", async () => {
    mockRunQuery.mockRejectedValue(new Error("ECONNREFUSED"));
    mockReadFile.mockResolvedValue(
      JSON.stringify([MOCK_ENTRY_A, MOCK_ENTRY_B]),
    );
    mockWriteFile.mockResolvedValue(undefined);

    const req = new NextRequest(
      `http://localhost/api/catalog?id=${MOCK_ENTRY_B.id}`,
      { method: "DELETE" },
    );
    await DELETE(req);

    const written = JSON.parse(mockWriteFile.mock.calls[0][1] as string);
    expect(written).toHaveLength(1);
    expect(written[0].id).toBe(MOCK_ENTRY_A.id);
  });

  it("handles URL-encoded id parameter", async () => {
    mockRunQuery.mockResolvedValue([]);

    const req = new NextRequest(
      "http://localhost/api/catalog?id=dataset%3Aencoded",
      { method: "DELETE" },
    );
    const res = await DELETE(req);

    expect(res.status).toBe(200);
    expect(mockRunQuery).toHaveBeenCalledWith(expect.any(String), {
      id: "dataset:encoded",
    });
  });

  it("does not write to mock file when Neo4j succeeds", async () => {
    mockRunQuery.mockResolvedValue([]);

    const req = new NextRequest("http://localhost/api/catalog?id=ds:neo4j-ok", {
      method: "DELETE",
    });
    await DELETE(req);

    expect(mockWriteFile).not.toHaveBeenCalled();
  });

  it("returns ok even if entry was not found in Neo4j", async () => {
    // The route does not check deletion count — always returns ok
    mockRunQuery.mockResolvedValue([]);

    const req = new NextRequest(
      "http://localhost/api/catalog?id=ds:nonexistent",
      { method: "DELETE" },
    );
    const res = await DELETE(req);
    const data = await res.json();

    expect(data.ok).toBe(true);
  });
});

/**
 * API route tests for GET /api/compliance
 *
 * Tests EHDS compliance check (consumer+dataset validation).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/neo4j", () => ({
  runQuery: vi.fn(),
}));

import { runQuery } from "@/lib/neo4j";
import { GET } from "@/app/api/compliance/route";

const mockRunQuery = vi.mocked(runQuery);

describe("GET /api/compliance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("list mode (no consumerId/datasetId)", () => {
    it("should return consumers and datasets dropdown data", async () => {
      const mockConsumers = [
        { id: "pharmaco", name: "PharmaCo Research AG", type: "DATA_USER" },
      ];
      const mockDatasets = [{ id: "ds-001", title: "FHIR Cohort Alpha" }];

      mockRunQuery
        .mockResolvedValueOnce(mockConsumers)
        .mockResolvedValueOnce(mockDatasets);

      const req = new Request("http://localhost:3000/api/compliance");
      const response = await GET(req);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.consumers).toHaveLength(1);
      expect(data.datasets).toHaveLength(1);
    });

    it("should handle empty consumers and datasets", async () => {
      mockRunQuery.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

      const req = new Request("http://localhost:3000/api/compliance");
      const response = await GET(req);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.consumers).toEqual([]);
      expect(data.datasets).toEqual([]);
    });
  });

  describe("check mode (with consumerId and datasetId)", () => {
    it("should return compliant when approval chain exists", async () => {
      const mockRows = [
        {
          consumer: "pharmaco",
          applicationId: "app-001",
          applicationStatus: "approved",
          approvalId: "approval-001",
          approvalStatus: "granted",
          ehdsArticle: "Art.46",
          dataset: "ds-001",
          contract: "contract-001",
        },
      ];

      mockRunQuery.mockResolvedValue(mockRows);

      const req = new Request(
        "http://localhost:3000/api/compliance?consumerId=pharmaco&datasetId=ds-001",
      );
      const response = await GET(req);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.compliant).toBe(true);
      expect(data.chain).toHaveLength(1);
      expect(data.chain[0].ehdsArticle).toBe("Art.46");
    });

    it("should return non-compliant when no approval chain exists", async () => {
      mockRunQuery.mockResolvedValue([]);

      const req = new Request(
        "http://localhost:3000/api/compliance?consumerId=unknown&datasetId=ds-001",
      );
      const response = await GET(req);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.compliant).toBe(false);
      expect(data.chain).toEqual([]);
    });
  });
});

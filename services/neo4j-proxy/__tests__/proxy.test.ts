/**
 * Integration tests for the Neo4j Query Proxy (services/neo4j-proxy)
 *
 * Uses Supertest to hit Express routes with a mocked Neo4j driver.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";

// Mock neo4j-driver BEFORE importing the app
const mockRun = vi.fn();
const mockClose = vi.fn();
const mockSession = { run: mockRun, close: mockClose };
const mockGetServerInfo = vi.fn().mockResolvedValue({ address: "mock:7687" });
const mockDriverClose = vi.fn();
const mockDriver = {
  session: vi.fn(() => mockSession),
  getServerInfo: mockGetServerInfo,
  close: mockDriverClose,
};

vi.mock("neo4j-driver", () => ({
  default: {
    driver: vi.fn(() => mockDriver),
    auth: {
      basic: vi.fn(),
    },
    int: vi.fn((n: number) => n),
    integer: {
      toNumber: (v: any) => (typeof v === "number" ? v : Number(v)),
    },
  },
}));

// Import app and main AFTER mocking
const { app, main } = await import("../src/index.js");
import supertest from "supertest";

const request = supertest(app);

describe("Neo4j Proxy API", () => {
  // Initialize the driver by calling main() — this sets the module-level `driver`
  // The mock getServerInfo already resolves, so main() succeeds.
  // We mock app.listen to prevent actual port binding.
  beforeAll(async () => {
    vi.spyOn(app, "listen").mockImplementation((_port: any, cb?: any) => {
      if (cb) cb(); // trigger the callback without binding
      return { close: vi.fn() } as any;
    });
    await main();
  });

  beforeEach(() => {
    // Only clear mocks that are per-test; preserve driver setup
    mockRun.mockReset();
    mockGetServerInfo.mockReset();
  });

  // ── Health Check ─────────────────────────────────────────────────────────
  describe("GET /health", () => {
    it("should return 200 OK when Neo4j is reachable", async () => {
      mockGetServerInfo.mockResolvedValue({ address: "localhost:7687" });

      const res = await request.get("/health");

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        status: "ok",
        neo4j: "localhost:7687",
      });
    });

    it("should return 503 when Neo4j is unreachable", async () => {
      mockGetServerInfo.mockRejectedValue(new Error("Connection refused"));

      const res = await request.get("/health");

      expect(res.status).toBe(503);
      expect(res.body.status).toBe("error");
    });
  });

  // ── FHIR Patient ────────────────────────────────────────────────────────
  describe("GET /fhir/Patient", () => {
    it("should return a FHIR Bundle with patient entries", async () => {
      mockRun.mockResolvedValue({
        records: [
          {
            get: vi.fn((key: string) => {
              if (key === "p")
                return {
                  properties: {
                    fhirId: "pat-001",
                    firstName: "Alice",
                    lastName: "Smith",
                    gender: "female",
                  },
                };
            }),
          },
          {
            get: vi.fn((key: string) => {
              if (key === "p")
                return {
                  properties: {
                    fhirId: "pat-002",
                    firstName: "Bob",
                    lastName: "Jones",
                    gender: "male",
                  },
                };
            }),
          },
        ],
      });

      const res = await request
        .get("/fhir/Patient")
        .expect("Content-Type", /fhir\+json/);

      expect(res.status).toBe(200);
      expect(res.body.resourceType).toBe("Bundle");
      expect(res.body.type).toBe("searchset");
      expect(res.body.total).toBe(2);
      expect(res.body.entry).toHaveLength(2);
      expect(res.body.entry[0].fullUrl).toBe("Patient/pat-001");
      expect(res.body.entry[0].resource.resourceType).toBe("Patient");
      expect(res.body.entry[0].resource.firstName).toBe("Alice");
    });

    it("should support _count query parameter", async () => {
      mockRun.mockResolvedValue({ records: [] });

      await request.get("/fhir/Patient?_count=5");

      expect(mockRun).toHaveBeenCalledWith(
        expect.stringContaining("LIMIT $limit"),
        expect.objectContaining({ limit: 5 }),
      );
    });

    it("should support gender filter", async () => {
      mockRun.mockResolvedValue({ records: [] });

      await request.get("/fhir/Patient?gender=female");

      expect(mockRun).toHaveBeenCalledWith(
        expect.stringContaining("p.gender = $gender"),
        expect.objectContaining({ gender: "female" }),
      );
    });

    it("should return empty bundle when no patients found", async () => {
      mockRun.mockResolvedValue({ records: [] });

      const res = await request.get("/fhir/Patient");

      expect(res.status).toBe(200);
      expect(res.body.total).toBe(0);
      expect(res.body.entry).toEqual([]);
    });
  });

  // ── OMOP Cohort ─────────────────────────────────────────────────────────
  describe("POST /omop/cohort", () => {
    it("should return cohort statistics grouped by concept", async () => {
      mockRun.mockResolvedValue({
        records: [
          {
            toObject: () => ({ group: "Diabetes", count: 42 }),
            get: vi.fn((key: string) => {
              if (key === "group") return "Diabetes";
              if (key === "count") return 42;
            }),
            keys: ["group", "count"],
          },
        ],
      });

      const res = await request
        .post("/omop/cohort")
        .send({ groupBy: "concept" });

      expect(res.status).toBe(200);
    });

    it("should support gender grouping", async () => {
      mockRun.mockResolvedValue({ records: [] });

      await request.post("/omop/cohort").send({ groupBy: "gender" });

      expect(mockRun).toHaveBeenCalledWith(
        expect.stringContaining("genderSourceValue"),
        expect.any(Object),
      );
    });
  });

  // ── Catalog Datasets ────────────────────────────────────────────────────
  describe("GET /catalog/datasets", () => {
    it("should return HealthDCAT-AP datasets as JSON-LD", async () => {
      mockRun.mockResolvedValue({
        records: [
          {
            get: vi.fn((key: string) => {
              switch (key) {
                case "ds":
                  return {
                    properties: {
                      datasetId: "ds-001",
                      title: "FHIR Cohort Alpha",
                      description: "Test dataset",
                      license: "CC-BY-4.0",
                    },
                  };
                case "distributions":
                  return [];
                case "pub":
                  return { properties: { name: "SPE-1" } };
                case "cp":
                  return null;
                default:
                  return null;
              }
            }),
          },
        ],
      });

      const res = await request.get("/catalog/datasets");

      expect(res.status).toBe(200);
      expect(res.body["@context"]).toBeDefined();
      expect(res.body["dcat:dataset"]).toBeDefined();
    });
  });

  // ── NLQ Templates ──────────────────────────────────────────────────────
  describe("GET /nlq/templates", () => {
    it("should return available query templates", async () => {
      const res = await request.get("/nlq/templates");

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("templates");
      expect(Array.isArray(res.body.templates)).toBe(true);
      expect(res.body.templates.length).toBeGreaterThan(0);
      expect(res.body.templates[0]).toHaveProperty("name");
      expect(res.body.templates[0]).toHaveProperty("description");
      expect(res.body).toHaveProperty("llmAvailable");
    });
  });

  // ── Trust Center (Phase 18) ──────────────────────────────────────────────
  describe("GET /trust-center", () => {
    it("should return a list of trust centers", async () => {
      mockRun.mockResolvedValue({
        records: [
          {
            get: vi.fn((key: string) => {
              const data: Record<string, any> = {
                name: "RKI Trust Center DE",
                operatedBy: "Robert Koch Institute",
                country: "DE",
                status: "active",
                protocol: "deterministic-pseudonym-v1",
                createdAt: "2026-01-01T00:00:00Z",
                hdabName: "MedReg DE",
                hdabDid: "did:web:medreg.de:hdab",
                datasetCount: 3,
                sampleDatasets: ["dataset:cardiac-outcomes-eu-2025"],
              };
              return data[key];
            }),
          },
        ],
      });

      const res = await request.get("/trust-center");

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("trustCenters");
      expect(res.body.trustCenters).toHaveLength(1);
      expect(res.body.trustCenters[0].name).toBe("RKI Trust Center DE");
      expect(res.body.trustCenters[0].country).toBe("DE");
      expect(res.body.trustCenters[0].status).toBe("active");
    });
  });

  describe("POST /trust-center/resolve", () => {
    it("should reject requests with fewer than 2 pseudonyms", async () => {
      const res = await request
        .post("/trust-center/resolve")
        .send({
          trustCenter: "RKI Trust Center DE",
          providerPseudonyms: ["PSN-AK-00742"],
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain("2 PSNs");
    });

    it("should reject requests without trust center name", async () => {
      const res = await request
        .post("/trust-center/resolve")
        .send({
          providerPseudonyms: ["PSN-AK-00742", "PSN-LMC-09451"],
        });

      expect(res.status).toBe(400);
    });

    it("should return 404 for unknown trust center", async () => {
      mockRun.mockResolvedValue({ records: [] });

      const res = await request
        .post("/trust-center/resolve")
        .send({
          trustCenter: "Nonexistent TC",
          providerPseudonyms: ["PSN-A", "PSN-B"],
        });

      expect(res.status).toBe(404);
    });

    it("should resolve pseudonyms in stateless mode", async () => {
      // First call: trust center check returns a result
      mockRun
        .mockResolvedValueOnce({
          records: [{ get: vi.fn(() => ({ properties: {} })) }],
        })
        // Second call: persist mapping
        .mockResolvedValueOnce({ records: [] })
        // Third call: audit log
        .mockResolvedValueOnce({ records: [] });

      const res = await request
        .post("/trust-center/resolve")
        .send({
          trustCenter: "RKI Trust Center DE",
          providerPseudonyms: ["PSN-AK-00742", "PSN-LMC-09451"],
          mode: "stateless",
        });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("researchPseudonym");
      expect(res.body.researchPseudonym).toMatch(/^RPSN-/);
      expect(res.body.mode).toBe("stateless");
      expect(res.body.linkedPseudonyms).toBe(2);
    });

    it("should produce deterministic RPSN for same inputs in stateless mode", async () => {
      const psns = ["PSN-AK-00742", "PSN-LMC-09451"];

      // Two resolve calls with same inputs
      for (let i = 0; i < 2; i++) {
        mockRun
          .mockResolvedValueOnce({
            records: [{ get: vi.fn(() => ({ properties: {} })) }],
          })
          .mockResolvedValueOnce({ records: [] })
          .mockResolvedValueOnce({ records: [] });
      }

      const res1 = await request
        .post("/trust-center/resolve")
        .send({ trustCenter: "RKI", providerPseudonyms: psns, mode: "stateless" });
      const res2 = await request
        .post("/trust-center/resolve")
        .send({ trustCenter: "RKI", providerPseudonyms: psns, mode: "stateless" });

      expect(res1.body.researchPseudonym).toBe(res2.body.researchPseudonym);
    });
  });

  describe("DELETE /trust-center/revoke/:rpsn", () => {
    it("should revoke an existing research pseudonym", async () => {
      mockRun
        .mockResolvedValueOnce({
          records: [
            {
              get: vi.fn((key: string) => {
                if (key === "rpsn") return "RPSN-DE-1138";
                if (key === "status") return "revoked";
              }),
            },
          ],
        })
        // audit log
        .mockResolvedValueOnce({ records: [] });

      const res = await request.delete("/trust-center/revoke/RPSN-DE-1138");

      expect(res.status).toBe(200);
      expect(res.body.rpsn).toBe("RPSN-DE-1138");
      expect(res.body.status).toBe("revoked");
    });

    it("should return 404 for unknown RPSN", async () => {
      mockRun.mockResolvedValue({ records: [] });

      const res = await request.delete("/trust-center/revoke/RPSN-UNKNOWN");

      expect(res.status).toBe(404);
    });
  });

  describe("GET /trust-center/audit", () => {
    it("should return audit entries", async () => {
      mockRun.mockResolvedValue({
        records: [
          {
            get: vi.fn((key: string) => {
              const data: Record<string, any> = {
                rpsn: "RPSN-DE-1138",
                status: "active",
                mode: "stateless",
                createdAt: "2026-03-15T10:00:00Z",
                trustCenter: "RKI Trust Center DE",
                providerPsns: ["PSN-AK-00742", "PSN-LMC-09451"],
              };
              return data[key];
            }),
          },
        ],
      });

      const res = await request.get("/trust-center/audit");

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("entries");
      expect(res.body.entries).toHaveLength(1);
      expect(res.body.entries[0].rpsn).toBe("RPSN-DE-1138");
    });
  });

  describe("GET /trust-center/spe-sessions", () => {
    it("should return SPE sessions with attestation info", async () => {
      mockRun.mockResolvedValue({
        records: [
          {
            get: vi.fn((key: string) => {
              const data: Record<string, any> = {
                sessionId: "spe-session-001",
                status: "active",
                approvedCodeHash: "sha256:a1b2c3d4e5f6",
                attestationType: "sgx-v3.1",
                kAnonymityThreshold: 5,
                createdAt: "2026-03-15T10:00:00Z",
                createdBy: "MedReg DE",
                pseudonymCount: 2,
              };
              return data[key];
            }),
          },
        ],
      });

      const res = await request.get("/trust-center/spe-sessions");

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("sessions");
      expect(res.body.sessions).toHaveLength(1);
      expect(res.body.sessions[0].sessionId).toBe("spe-session-001");
      expect(res.body.sessions[0].attestationType).toBe("sgx-v3.1");
      expect(res.body.sessions[0].kAnonymityThreshold).toBe(5);
    });
  });
});

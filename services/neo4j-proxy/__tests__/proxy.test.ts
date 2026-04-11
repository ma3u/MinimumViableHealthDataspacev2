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
    isInt: vi.fn(() => false),
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

  // ── NLQ Template Matching (Tier 1) ────────────────────────────────────
  describe("POST /nlq — template matching", () => {
    it("should match 'how many patients' to patient_count template", async () => {
      const record = {
        keys: ["patientCount"],
        get: vi.fn((key: string) => (key === "patientCount" ? 174 : null)),
      };
      // forEach used by keys iteration in the handler
      record.keys.forEach = Array.prototype.forEach.bind(record.keys);
      mockRun.mockResolvedValue({ records: [record] });

      const res = await request
        .post("/nlq")
        .send({ question: "How many patients are in the database?" });

      expect(res.status).toBe(200);
      expect(res.body.method).toBe("template");
      expect(res.body.templateName).toBe("patient_count");
      expect(res.body.results).toBeDefined();
      expect(res.body.totalRows).toBeGreaterThanOrEqual(0);
    });

    it("should match 'top conditions' to top_conditions template", async () => {
      const record = {
        keys: ["condition", "count"],
        get: vi.fn((key: string) => {
          if (key === "condition") return "Hypertension";
          if (key === "count") return 42;
          return null;
        }),
      };
      record.keys.forEach = Array.prototype.forEach.bind(record.keys);
      mockRun.mockResolvedValue({ records: [record] });

      const res = await request
        .post("/nlq")
        .send({ question: "What are the top 5 conditions?" });

      expect(res.status).toBe(200);
      expect(res.body.method).toBe("template");
      expect(res.body.templateName).toBe("top_conditions");
    });

    it("should match 'patients by gender' template", async () => {
      const record = {
        keys: ["gender", "count"],
        get: vi.fn((key: string) => {
          if (key === "gender") return "female";
          if (key === "count") return 80;
          return null;
        }),
      };
      record.keys.forEach = Array.prototype.forEach.bind(record.keys);
      mockRun.mockResolvedValue({ records: [record] });

      const res = await request
        .post("/nlq")
        .send({ question: "Show me patients by gender" });

      expect(res.status).toBe(200);
      expect(res.body.method).toBe("template");
      expect(res.body.templateName).toBe("patient_by_gender");
    });

    it("should return 400 when question is missing", async () => {
      const res = await request.post("/nlq").send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toContain("Missing");
    });

    it("should return method=none when no template matches and no LLM configured", async () => {
      // No fulltext indexes in mock, no LLM configured
      mockRun.mockRejectedValue(new Error("no such index"));

      const res = await request
        .post("/nlq")
        .send({ question: "xyzzy foobar nonsense" });

      expect(res.status).toBe(200);
      expect(res.body.method).toBe("none");
      expect(res.body.availableTemplates).toBeDefined();
    });
  });

  // ── NLQ Write Guard (Safety) ──────────────────────────────────────────
  describe("POST /nlq — write guard", () => {
    it("should return structured error on query execution failure", async () => {
      // Force template match but execution failure
      mockRun.mockRejectedValue(
        new Error("Neo.ClientError.Statement.SyntaxError"),
      );

      const res = await request
        .post("/nlq")
        .send({ question: "How many patients are in the database?" });

      expect(res.status).toBe(200);
      expect(res.body.error).toBeDefined();
      expect(res.body.results).toEqual([]);
      expect(res.body.totalRows).toBe(0);
      expect(res.body.method).toBeDefined();
    });
  });

  // ── NLQ Response Structure ────────────────────────────────────────────
  describe("POST /nlq — response structure", () => {
    it("should always include question, cypher, method, results, totalRows", async () => {
      const record = {
        keys: ["patientCount"],
        get: vi.fn(() => 100),
      };
      record.keys.forEach = Array.prototype.forEach.bind(record.keys);
      mockRun.mockResolvedValue({ records: [record] });

      const res = await request
        .post("/nlq")
        .send({ question: "How many patients?" });

      expect(res.status).toBe(200);
      const body = res.body;
      expect(body).toHaveProperty("question");
      expect(body).toHaveProperty("cypher");
      expect(body).toHaveProperty("method");
      expect(body).toHaveProperty("results");
      expect(body).toHaveProperty("totalRows");
      expect(typeof body.question).toBe("string");
      expect(typeof body.cypher).toBe("string");
      expect(Array.isArray(body.results)).toBe(true);
    });

    it("should include odrlEnforced field in response", async () => {
      const record = {
        keys: ["patientCount"],
        get: vi.fn(() => 50),
      };
      record.keys.forEach = Array.prototype.forEach.bind(record.keys);
      mockRun.mockResolvedValue({ records: [record] });

      const res = await request
        .post("/nlq")
        .send({ question: "How many patients?" });

      expect(res.body).toHaveProperty("odrlEnforced");
    });
  });

  // ── Rate Limiting ─────────────────────────────────────────────────────
  describe("Rate limiting", () => {
    it("should include rate limit headers", async () => {
      mockGetServerInfo.mockResolvedValue({ address: "localhost:7687" });

      const res = await request.get("/health");

      // express-rate-limit standardHeaders returns these
      expect(res.headers).toHaveProperty("ratelimit-limit");
    });
  });
});

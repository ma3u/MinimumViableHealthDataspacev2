/**
 * GET /fhir/Patient/:id/$everything carries the whole record (ADR-059): the
 * resources hanging off an Encounter and those hanging off the Patient, and
 * the DiagnosticReports, Immunizations and MedicationStatements the hub
 * seeds beside the laboratory values.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";

const mockRun = vi.fn();
const mockSession = { run: mockRun, close: vi.fn() };
const mockGetServerInfo = vi.fn().mockResolvedValue({ address: "mock:7687" });
vi.mock("../src/audit-chain.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/audit-chain.js")>()),
  appendQueryAudit: vi.fn().mockResolvedValue({}),
}));
vi.mock("neo4j-driver", () => ({
  default: {
    driver: vi.fn(() => ({
      session: vi.fn(() => mockSession),
      getServerInfo: mockGetServerInfo,
      close: vi.fn(),
    })),
    auth: { basic: vi.fn() },
  },
}));

const { app, main } = await import("../src/index.js");
import supertest from "supertest";
const request = supertest(app);

const node = (properties: Record<string, unknown>) => ({ properties });

function record(fields: Record<string, unknown>) {
  return {
    has: (key: string) => key in fields,
    get: (key: string) => fields[key],
  };
}

describe("GET /fhir/Patient/:id/$everything", () => {
  beforeAll(async () => {
    vi.spyOn(app, "listen").mockImplementation((_port: any, cb?: any) => {
      if (cb) cb();
      return { close: vi.fn() } as any;
    });
    await main();
  });
  beforeEach(() => {
    mockRun.mockReset();
  });

  it("matches the patient by fhirId, id or resourceId", async () => {
    mockRun.mockResolvedValue({ records: [] });
    const res = await request.get("/fhir/Patient/P1/$everything");
    expect(res.status).toBe(404);
    const cypher: string = mockRun.mock.calls[0][0];
    expect(cypher).toMatch(
      /p\.fhirId = \$patientId OR p\.id = \$patientId OR p\.resourceId = \$patientId/,
    );
    expect(mockRun.mock.calls[0][1]).toEqual({ patientId: "P1" });
  });

  it("carries reports, immunizations and the medication plan beside the rest", async () => {
    mockRun.mockResolvedValue({
      records: [
        record({
          p: node({ resourceId: "P1", name: "Maria Schmidt" }),
          encounters: [node({ resourceId: "enc-p1-2026-02-10" })],
          conditions: [
            node({
              resourceId: "cond-p1-73211009",
              display: "Diabetes mellitus type 2",
            }),
          ],
          observations: [
            node({ resourceId: "obs-p1-4548-4-2026-02-10", code: "4548-4" }),
          ],
          procedures: [],
          medications: [
            node({
              resourceId: "med-p1-860975",
              display: "Metformin 500 mg oral tablet",
            }),
          ],
          reports: [
            node({
              resourceId: "dr-ecg-p1-2026-03-04",
              code: "11524-6",
              category: "EC",
            }),
          ],
          immunizations: [
            node({ resourceId: "imm-p1-2025-10-14-150", vaccineCode: "150" }),
          ],
          statements: [
            node({
              resourceId: "ms-p1-A10BA02",
              medicationCode: "A10BA02",
              dosageText: "1-0-1",
            }),
          ],
        }),
      ],
    });
    const res = await request.get("/fhir/Patient/P1/$everything");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/application\/fhir\+json/);
    const types = res.body.entry.map((e: any) => e.resource.resourceType);
    expect(types).toEqual([
      "Patient",
      "Encounter",
      "Condition",
      "Observation",
      "MedicationRequest",
      "DiagnosticReport",
      "Immunization",
      "MedicationStatement",
    ]);
    expect(res.body.total).toBe(8);
    const report = res.body.entry.find(
      (e: any) => e.resource.resourceType === "DiagnosticReport",
    ).resource;
    expect(report.code).toBe("11524-6");
    expect(report.category).toBe("EC");
  });

  it("answers a record without the new resources as before", async () => {
    mockRun.mockResolvedValue({
      records: [
        record({
          p: node({ fhirId: "pat-001" }),
          encounters: [],
          conditions: [],
          observations: [],
          procedures: [],
          medications: [],
        }),
      ],
    });
    const res = await request.get("/fhir/Patient/pat-001/$everything");
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.entry[0].resource.resourceType).toBe("Patient");
  });
});

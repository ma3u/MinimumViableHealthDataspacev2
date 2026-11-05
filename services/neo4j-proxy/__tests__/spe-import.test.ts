/**
 * A transfer's data into an SPE workspace (#876): the bundle becomes one
 * dataset of records and references, written into the SPE the user chose.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { bundleToRecords, MAX_RECORDS } from "../src/spe-import.js";

const speDrivers = vi.fn();
vi.mock("../src/db.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/db.js")>()),
  getSpeDrivers: () => speDrivers(),
}));
vi.mock("neo4j-driver", () => ({
  default: {
    driver: vi.fn(),
    auth: { basic: vi.fn() },
    int: vi.fn((n: number) => n),
    isInt: vi.fn(() => false),
  },
}));

const { app } = await import("../src/index.js");
import supertest from "supertest";
const request = supertest(app);

const BUNDLE = {
  resourceType: "Bundle",
  type: "searchset",
  entry: [
    {
      resource: {
        resourceType: "Patient",
        id: "p-3f2a",
        gender: "female",
        birthDate: "1971",
      },
    },
    {
      resource: {
        resourceType: "Condition",
        id: "c1",
        code: { coding: [{ display: "Type 2 diabetes mellitus" }] },
        subject: { reference: "Patient/p-3f2a" },
      },
    },
    {
      resource: {
        resourceType: "Observation",
        id: "o1",
        code: { text: "HbA1c" },
        subject: { reference: "urn:x/Patient/p-3f2a" },
        hasMember: [{ reference: "Observation/elsewhere" }],
      },
    },
  ],
};

describe("bundleToRecords", () => {
  it("keys each record on the dataset and keeps references inside the bundle", () => {
    const { records, references } = bundleToRecords("tp-1", BUNDLE);

    expect(records.map((r) => r.recordKey)).toEqual([
      "tp-1/Patient/p-3f2a",
      "tp-1/Condition/c1",
      "tp-1/Observation/o1",
    ]);
    expect(records[1].name).toBe("Condition: Type 2 diabetes mellitus");
    expect(records[0].name).toBe("Patient p-3f2a, female, 1971");
    expect(JSON.parse(records[2].resource).code.text).toBe("HbA1c");
    expect(references).toEqual([
      {
        from: "tp-1/Condition/c1",
        to: "tp-1/Patient/p-3f2a",
        path: "subject",
      },
      {
        from: "tp-1/Observation/o1",
        to: "tp-1/Patient/p-3f2a",
        path: "subject",
      },
    ]);
  });

  it("refuses data that is not a FHIR Bundle", () => {
    expect(() => bundleToRecords("tp-1", { datasets: [] })).toThrow(
      /Only a FHIR Bundle/,
    );
  });

  it("refuses a bundle too large to import at once", () => {
    const entry = Array.from({ length: MAX_RECORDS + 1 }, (_, i) => ({
      resource: { resourceType: "Patient", id: `p${i}` },
    }));
    expect(() =>
      bundleToRecords("tp-1", { resourceType: "Bundle", entry }),
    ).toThrow(/at most/);
  });
});

function fakeDriver() {
  const run = vi.fn().mockResolvedValue({ records: [] });
  const session = {
    executeWrite: vi.fn(async (work: (tx: { run: typeof run }) => unknown) =>
      work({ run }),
    ),
    run,
    close: vi.fn(),
  };
  return { driver: { session: vi.fn(() => session) }, session, run };
}

const row = (o: Record<string, unknown>) => ({ get: (k: string) => o[k] });

describe("POST /spe/:speId/import", () => {
  beforeEach(() => {
    speDrivers.mockReset();
  });

  it("writes the dataset into the chosen SPE and says what it holds", async () => {
    const spe1 = fakeDriver();
    const spe2 = fakeDriver();
    speDrivers.mockReturnValue([
      { label: "SPE-1", driver: spe1.driver },
      { label: "SPE-2", driver: spe2.driver },
    ]);

    const res = await request.post("/spe/SPE-2/import").send({
      datasetId: "tp-1",
      transferId: "tp-1",
      assetId: "fhir-patient-search",
      pseudonymised: true,
      bundle: BUNDLE,
    });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      datasetId: "tp-1",
      speId: "SPE-2",
      records: 3,
      relationships: 2,
      byType: { Patient: 1, Condition: 1, Observation: 1 },
    });
    expect(spe1.run).not.toHaveBeenCalled();
    const [cypher, params] = spe2.run.mock.calls[0];
    expect(cypher).toContain("MERGE (d)-[:LOADED_INTO]->(w)");
    expect(params.meta).toMatchObject({ speId: "SPE-2", pseudonymised: true });
    expect(spe2.session.close).toHaveBeenCalled();
  });

  it("answers 422 when the data is not a bundle, and writes nothing", async () => {
    const spe1 = fakeDriver();
    speDrivers.mockReturnValue([{ label: "SPE-1", driver: spe1.driver }]);

    const res = await request
      .post("/spe/SPE-1/import")
      .send({ datasetId: "tp-1", bundle: { total: 3 } });

    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/FHIR Bundle/);
    expect(spe1.run).not.toHaveBeenCalled();
  });

  it("answers 503 for an SPE that is not connected", async () => {
    speDrivers.mockReturnValue([
      { label: "SPE-1", driver: fakeDriver().driver },
    ]);

    const res = await request
      .post("/spe/SPE-2/import")
      .send({ datasetId: "tp-1", bundle: BUNDLE });

    expect(res.status).toBe(503);
    expect(res.body.error).toMatch(/SPE-2 is not connected/);
  });

  it("refuses an unknown SPE", async () => {
    const res = await request
      .post("/spe/SPE-9/import")
      .send({ datasetId: "tp-1", bundle: BUNDLE });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Unknown SPE/);
  });
});

describe("GET /spe/:speId/import/:datasetId/graph", () => {
  beforeEach(() => {
    speDrivers.mockReset();
  });

  it("draws the dataset, its workspace, its records and their references", async () => {
    const spe1 = fakeDriver();
    spe1.run
      .mockResolvedValueOnce({
        records: [
          row({
            d: {
              datasetId: "tp-1",
              name: "Transfer of x",
              provider: "did:web:alpha",
              agreementId: "agr-1",
              records: 2,
            },
            speId: "SPE-1",
          }),
        ],
      })
      .mockResolvedValueOnce({
        records: [
          row({ key: "tp-1/Patient/p1", type: "Patient", name: "Patient p1" }),
          row({
            key: "tp-1/Condition/c1",
            type: "Condition",
            name: "Condition: x",
          }),
        ],
      })
      .mockResolvedValueOnce({
        records: [row({ from: "tp-1/Condition/c1", to: "tp-1/Patient/p1" })],
      });
    speDrivers.mockReturnValue([{ label: "SPE-1", driver: spe1.driver }]);

    const res = await request.get("/spe/SPE-1/import/tp-1/graph");

    expect(res.status).toBe(200);
    expect(res.body.nodes.map((n: { id: string }) => n.id)).toEqual([
      "import:tp-1",
      "spe:SPE-1",
      "import-provider:did:web:alpha",
      "import-agreement:agr-1",
      "import:tp-1/Patient/p1",
      "import:tp-1/Condition/c1",
    ]);
    expect(res.body.nodes[0].properties).toMatchObject({
      provider: "did:web:alpha",
      agreementId: "agr-1",
      records: 2,
    });
    expect(res.body.nodes[4].properties).toEqual({
      resourceType: "Patient",
      resourceId: "p1",
    });
    expect(res.body.links.map((l: { type: string }) => l.type)).toEqual(
      expect.arrayContaining(["PROVIDED_BY", "UNDER_AGREEMENT"]),
    );
    expect(res.body.links).toContainEqual({
      source: "import:tp-1/Condition/c1",
      target: "import:tp-1/Patient/p1",
      type: "REFERS_TO",
    });
    expect(res.body.truncated).toBe(false);
  });

  it("answers 404 for a dataset the workspace does not hold", async () => {
    speDrivers.mockReturnValue([
      { label: "SPE-1", driver: fakeDriver().driver },
    ]);

    const res = await request.get("/spe/SPE-1/import/nope/graph");

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Not found");
  });
});

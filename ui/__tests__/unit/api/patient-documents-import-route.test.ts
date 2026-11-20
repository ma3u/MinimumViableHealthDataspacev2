// @vitest-environment node
/**
 * POST /api/patient/documents (#1173): a FHIR document read into a record.
 * Pins who may import (the person, a holder for a patient it treats, the
 * operator), the order of the checks (shape, the validator, the record, the
 * audit trail, then the write), and that nothing is written when the
 * validator or the audit trail is missing (fail closed).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "fs";
import path from "path";

vi.unmock("@/lib/auth-guard");
import { getServerSession } from "next-auth/next";

const mockRunQuery = vi.fn();
vi.mock("@/lib/neo4j", () => ({
  runQuery: (...args: unknown[]) => mockRunQuery(...args),
}));

import { POST } from "@/app/api/patient/documents/route";

type Session = Awaited<ReturnType<typeof getServerSession>>;
const session = (roles: string[], email: string, preferredUsername?: string) =>
  ({
    user: {
      name: "Test",
      email,
      ...(preferredUsername ? { preferredUsername } : {}),
    },
    roles,
  }) as unknown as Session;
const ADMIN = session(["EDC_ADMIN"], "admin@ci.test");
const CLINIC = session(
  ["EDC_USER_PARTICIPANT", "DATA_HOLDER"],
  "clinic@health-dataspace.local",
);
const PATIENT1 = session(["PATIENT"], "patient1@ci.test", "patient1");

const LAB = readFileSync(
  path.join(
    __dirname,
    "../lib/fixtures/fhir-documents/hl7-eu-lab-simple-chemistry.json",
  ),
  "utf8",
);

const post = (body: string, qs = "?patientId=P1") =>
  POST(
    new Request(`http://localhost/api/patient/documents${qs}`, {
      method: "POST",
      headers: { "Content-Type": "application/fhir+json" },
      body,
    }),
  );

const STORED = {
  imports: 1,
  reports: 1,
  reportsCreated: 1,
  observations: 2,
  observationsCreated: 2,
  conditions: 0,
  conditionsCreated: 0,
  allergies: 0,
  allergiesCreated: 0,
  statements: 0,
  statementsCreated: 0,
  requests: 0,
  requestsCreated: 0,
  immunizations: 0,
  immunizationsCreated: 0,
  procedures: 0,
  proceduresCreated: 0,
};

let treated = true;
let foreign: string[] = [];
let stored: Record<string, number>[] = [STORED];
function graph() {
  mockRunQuery.mockImplementation(async (cypher: string) => {
    if (cypher.includes("toString(p.birthDate)")) {
      return [
        {
          id: "P1",
          name: "Maria Schmidt",
          gender: "female",
          birthDate: "1979-03-15",
        },
      ];
    }
    if (cypher.includes("TREATED_AT")) return [{ treated }];
    if (cypher.includes("UNWIND $ids AS key"))
      return foreign.map((key) => ({ key }));
    if (cypher.includes("MERGE (doc:DocumentReference")) return stored;
    return [];
  });
}

let outcome: Record<string, unknown> = {
  resourceType: "OperationOutcome",
  issue: [
    { severity: "information", code: "informational", diagnostics: "ok" },
  ],
};
let auditStatus = 201;
const audits: Record<string, unknown>[] = [];
const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
  if (url.includes("/$validate")) {
    return new Response(JSON.stringify(outcome), { status: 200 });
  }
  if (url.endsWith("/audit/record")) {
    audits.push(JSON.parse(String(init?.body)));
    return new Response("{}", { status: auditStatus });
  }
  return new Response("{}", { status: 404 });
});

describe("POST /api/patient/documents", () => {
  beforeEach(() => {
    mockRunQuery.mockReset();
    treated = true;
    foreign = [];
    stored = [STORED];
    auditStatus = 201;
    audits.length = 0;
    outcome = {
      resourceType: "OperationOutcome",
      issue: [
        { severity: "information", code: "informational", diagnostics: "ok" },
      ],
    };
    graph();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("FHIR_VALIDATOR_URL", "http://matchbox.test/fhir");
    vi.mocked(getServerSession).mockResolvedValue(ADMIN);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  const writes = () =>
    mockRunQuery.mock.calls.filter(([q]) =>
      String(q).includes("MERGE (doc:DocumentReference"),
    ).length;

  it("answers 401 without a session", async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);
    expect((await post(LAB)).status).toBe(401);
  });

  it("refuses a researcher: importing is primary use", async () => {
    vi.mocked(getServerSession).mockResolvedValue(
      session(["DATA_USER"], "researcher@ci.test"),
    );
    expect((await post(LAB)).status).toBe(403);
    expect(writes()).toBe(0);
  });

  it("imports a valid HL7 Europe lab report for the operator, audited first", async () => {
    const res = await post(LAB);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toMatchObject({
      kind: "lab-report",
      profile:
        "http://hl7.eu/fhir/laboratory/StructureDefinition/Bundle-eu-lab",
      imports: 1,
      created: { reports: 1, observations: 2 },
      linked: { observations: 0 },
      skipped: [],
    });
    expect(body.provenanceId).toMatch(/^[0-9a-f-]{36}$/);
    expect(audits).toEqual([
      expect.objectContaining({
        event: "document-import",
        outcome: "success",
        patientId: "P1",
        actorRole: "EDC_ADMIN",
        documentType: "11502-2",
      }),
    ]);
    const validate = fetchMock.mock.calls.find(([u]) =>
      String(u).includes("$validate"),
    );
    expect(String(validate?.[0])).toContain(
      encodeURIComponent(
        "http://hl7.eu/fhir/laboratory/StructureDefinition/Bundle-eu-lab",
      ),
    );
  });

  it("lets a holder import for a patient it treats, and only then", async () => {
    vi.mocked(getServerSession).mockResolvedValue(CLINIC);
    expect((await post(LAB)).status).toBe(201);
    expect(audits[0]).toMatchObject({
      actorRole: "DATA_HOLDER",
      actorId: "did:web:alpha-klinik.de:participant",
    });
    treated = false;
    const res = await post(LAB);
    expect(res.status).toBe(403);
    expect((await res.json()).reason).toMatch(/own patients/);
  });

  it("lets a patient import into their own record only", async () => {
    vi.mocked(getServerSession).mockResolvedValue(PATIENT1);
    expect((await post(LAB)).status).toBe(201);
    expect(audits[0]).toMatchObject({
      actorRole: "PATIENT",
      actorId: "patient-record:P1",
    });
    expect((await post(LAB, "?patientId=P2")).status).toBe(403);
  });

  it("refuses what is not a document, with the problems, and audits the refusal", async () => {
    const collection = JSON.stringify({
      ...JSON.parse(LAB),
      type: "collection",
    });
    const res = await post(collection);
    expect(res.status).toBe(422);
    expect((await res.json()).problems).toContain(
      "Bundle.type is collection, not document",
    );
    expect(audits).toEqual([expect.objectContaining({ outcome: "refused" })]);
    expect(writes()).toBe(0);
  });

  it("refuses a document of a type it does not read", async () => {
    const other = JSON.parse(LAB);
    other.entry[0].resource.type.coding[0].code = "34105-7";
    expect((await post(JSON.stringify(other))).status).toBe(415);
  });

  it("answers 400 for a body that is not JSON", async () => {
    expect((await post("{not json")).status).toBe(400);
  });

  it("refuses what the validator refuses, with the validator's words", async () => {
    outcome = {
      resourceType: "OperationOutcome",
      issue: [
        {
          severity: "error",
          code: "structure",
          expression: ["Bundle.identifier"],
          details: {
            text: "Bundle.identifier: minimum required = 1, but only found 0",
          },
        },
      ],
    };
    const res = await post(LAB);
    expect(res.status).toBe(422);
    expect((await res.json()).issues).toEqual([
      {
        severity: "error",
        location: "Bundle.identifier",
        message: "Bundle.identifier: minimum required = 1, but only found 0",
      },
    ]);
    expect(writes()).toBe(0);
  });

  it("imports nothing when no validator is configured", async () => {
    vi.stubEnv("FHIR_VALIDATOR_URL", "");
    const res = await post(LAB);
    expect(res.status).toBe(503);
    expect((await res.json()).reason).toMatch(/FHIR_VALIDATOR_URL/);
    expect(writes()).toBe(0);
  });

  it("refuses a document naming another person's entries", async () => {
    foreign = ["obs-p2-4548-4-2025-03-04"];
    // A document that names one of the hub's nodes, as an exported one does.
    const named = JSON.parse(LAB);
    const observation = named.entry.find(
      (e: { resource: { resourceType: string } }) =>
        e.resource.resourceType === "Observation",
    ).resource;
    observation.identifier = [
      {
        system: "https://ehds.mabu.red/fhir/sid/graph-node",
        value: "obs-p2-4548-4-2025-03-04",
      },
    ];
    const res = await post(JSON.stringify(named));
    expect(res.status).toBe(409);
    expect((await res.json()).entries).toEqual(foreign);
    expect(writes()).toBe(0);
  });

  it("refuses a document about another record", async () => {
    const theirs = JSON.parse(LAB);
    const patient = theirs.entry.find(
      (e: { resource: { resourceType: string } }) =>
        e.resource.resourceType === "Patient",
    ).resource;
    patient.identifier.push({
      system: "https://ehds.mabu.red/fhir/sid/patient-record",
      value: "P2",
    });
    const res = await post(JSON.stringify(theirs));
    expect(res.status).toBe(409);
    expect(writes()).toBe(0);
  });

  it("writes nothing when the audit trail cannot record the import", async () => {
    auditStatus = 503;
    const res = await post(LAB);
    expect(res.status).toBe(503);
    expect(writes()).toBe(0);
  });

  it("answers 404 for a record that does not exist", async () => {
    mockRunQuery.mockResolvedValue([]);
    expect((await post(LAB, "?patientId=nobody")).status).toBe(404);
  });
});

/**
 * /api/patient/documents, /patient-summary and /lab-report (#1171): a
 * record's FHIR documents, primary use only. Pins the gate (401, 403 for a
 * researcher and a holder, 403 for another patient's record), the identity
 * rule (#475), 400 and 404, and the media type.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// The real requireAuth() against the mocked session (setup.ts mocks it open).
vi.unmock("@/lib/auth-guard");
import { getServerSession } from "next-auth/next";

const mockRunQuery = vi.fn();
vi.mock("@/lib/neo4j", () => ({
  runQuery: (...args: unknown[]) => mockRunQuery(...args),
}));

import { GET as index } from "@/app/api/patient/documents/route";
import { GET as summary } from "@/app/api/patient/documents/patient-summary/route";
import { GET as labReport } from "@/app/api/patient/documents/lab-report/route";

type Session = Awaited<ReturnType<typeof getServerSession>>;
const session = (roles: string[], preferredUsername?: string) =>
  ({
    user: { name: "Test", email: "t@test.example" },
    roles,
    ...(preferredUsername ? { preferredUsername } : {}),
  }) as unknown as Session;

const req = (route: string, qs: string) =>
  new Request(`http://localhost/api/patient/documents${route}${qs}`);

const PATIENT_ROW = {
  id: "P1",
  name: "Maria Schmidt",
  gender: "female",
  birthDate: "1979-03-15",
};
const LAB_ROW = {
  id: "obs-p1-4548-4-2024-09-12",
  code: "4548-4",
  display: "Hemoglobin A1c/Hemoglobin.total in Blood",
  value: 6.4,
  unit: "%",
  low: 4,
  high: 6,
  rangeText: "4.0 - 6.0 %",
  effective: "2024-09-12T08:30:00Z",
  status: "final",
  performer: "AlphaKlinik Berlin, Zentrallabor (fictional)",
  sourceKind: null,
  sourceLine: null,
  sourceRegion: null,
  sourceReport: null,
  reportNodeId: null,
  reportTitle: null,
  reportIssued: null,
  reportConclusion: null,
};

/** Answers each query by what it reads. */
function graph(patient: typeof PATIENT_ROW | null = PATIENT_ROW) {
  mockRunQuery.mockImplementation(async (cypher: string) => {
    if (
      cypher.includes("p.birthDate AS birthDate") ||
      cypher.includes("toString(p.birthDate)")
    ) {
      return patient ? [patient] : [];
    }
    if (cypher.includes("HAS_OBSERVATION")) return [LAB_ROW];
    if (cypher.includes("HAS_CONDITION")) {
      return [
        {
          id: "cond-p1-38341003",
          code: "38341003",
          system: "http://snomed.info/sct",
          display: "Hypertension",
          clinicalStatus: "active",
          onset: "2015-11-02",
        },
      ];
    }
    return [];
  });
}

describe("FHIR documents of a record", () => {
  beforeEach(() => {
    mockRunQuery.mockReset();
    graph();
    vi.mocked(getServerSession).mockResolvedValue(session(["EDC_ADMIN"]));
  });

  it.each([
    ["", index],
    ["/patient-summary", summary],
    ["/lab-report", labReport],
  ] as const)("%s answers 401 without a session", async (route, handler) => {
    vi.mocked(getServerSession).mockResolvedValue(null);
    const res = await handler(req(route, "?patientId=P1"));
    expect(res.status).toBe(401);
    expect(mockRunQuery).not.toHaveBeenCalled();
  });

  it.each([
    ["DATA_USER"],
    ["HDAB_AUTHORITY"],
    ["DATA_HOLDER"],
    ["TRUST_CENTER_OPERATOR"],
  ])("refuses %s: a record's documents are primary use", async (role) => {
    vi.mocked(getServerSession).mockResolvedValue(session([role]));
    const res = await summary(req("/patient-summary", "?patientId=P1"));
    expect(res.status).toBe(403);
    expect(mockRunQuery).not.toHaveBeenCalled();
  });

  it("asks for the record", async () => {
    const res = await summary(req("/patient-summary", ""));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/patientId/);
  });

  it("refuses a patient another patient's record (Art. 3)", async () => {
    vi.mocked(getServerSession).mockResolvedValue(
      session(["PATIENT"], "patient1"),
    );
    const res = await labReport(req("/lab-report", "?patientId=P2"));
    expect(res.status).toBe(403);
    expect(await res.json()).toHaveProperty("error");
  });

  it("gives the operator the named Patient Summary as FHIR", async () => {
    const res = await summary(req("/patient-summary", "?patientId=P1"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/fhir+json");
    const doc = await res.json();
    expect(doc.type).toBe("document");
    expect(doc.entry[0].resource.resourceType).toBe("Composition");
    const patient = doc.entry.find(
      (e: { resource: { resourceType: string } }) =>
        e.resource.resourceType === "Patient",
    ).resource;
    expect(patient.name).toEqual([{ text: "Maria Schmidt" }]);
    expect(patient.birthDate).toBe("1979-03-15");
  });

  it("gives a patient their own copy under their pseudonym", async () => {
    vi.mocked(getServerSession).mockResolvedValue(
      session(["PATIENT"], "patient1"),
    );
    const res = await summary(req("/patient-summary", "?patientId=P1"));
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).not.toContain("Maria Schmidt");
    expect(text).not.toContain("1979-03-15");
    expect(text).toMatch(/"Patient [0-9a-f]{8}"/);
  });

  it("serves the newest lab report, or the one named", async () => {
    const newest = await labReport(req("/lab-report", "?patientId=P1"));
    expect(newest.status).toBe(200);
    const doc = await newest.json();
    expect(doc.meta.profile).toEqual([
      "http://hl7.eu/fhir/laboratory/StructureDefinition/Bundle-eu-lab",
    ]);
    const id = "lab-p1-2024-09-12-alphaklinik-berlin-zentrallabor-fictional";
    const named = await labReport(
      req("/lab-report", `?patientId=P1&reportId=${id}`),
    );
    expect(named.status).toBe(200);
    const missing = await labReport(
      req("/lab-report", "?patientId=P1&reportId=nope"),
    );
    expect(missing.status).toBe(404);
  });

  it("lists the documents with where to fetch each", async () => {
    const res = await index(req("", "?patientId=P1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.patientId).toBe("P1");
    expect(body.documents.map((d: { type: string }) => d.type)).toEqual([
      "patient-summary",
      "lab-report",
    ]);
    expect(body.documents[1].href).toBe(
      "/api/patient/documents/lab-report?patientId=P1&reportId=lab-p1-2024-09-12-alphaklinik-berlin-zentrallabor-fictional",
    );
  });

  it("answers 404 for a record that does not exist", async () => {
    graph(null);
    for (const [route, handler] of [
      ["", index],
      ["/patient-summary", summary],
      ["/lab-report", labReport],
    ] as const) {
      const res = await handler(req(route, "?patientId=nobody"));
      expect(res.status).toBe(404);
    }
  });

  it("answers 502 when Neo4j does not", async () => {
    mockRunQuery.mockRejectedValue(new Error("connection refused"));
    const res = await summary(req("/patient-summary", "?patientId=P1"));
    expect(res.status).toBe(502);
  });
});

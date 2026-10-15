/**
 * Tests for /api/patient/observations/route.ts (issue #271 M1)
 *
 * Art. 3 and Art. 14: a patient's laboratory results as a FHIR R4 searchset
 * Bundle with the printed reference ranges. Covers auth (401, 403), the
 * own-record rule for PATIENT, the missing id (400), the unknown patient
 * (404), the Bundle shape and the code filter.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Run the real requireAuth() against the mocked session, so the 401/403
// cases below pin the gate (__tests__/setup.ts mocks the guard open).
vi.unmock("@/lib/auth-guard");
import { getServerSession } from "next-auth/next";

const mockRunQuery = vi.fn();
vi.mock("@/lib/neo4j", () => ({
  runQuery: (...args: unknown[]) => mockRunQuery(...args),
}));

import { GET } from "@/app/api/patient/observations/route";

type Session = Awaited<ReturnType<typeof getServerSession>>;

function makeReq(qs = ""): Request {
  return new Request(`http://localhost/api/patient/observations${qs}`);
}

function session(roles: string[], name = "Test Admin"): Session {
  return {
    user: { name, email: "t@test.example" },
    roles,
  } as unknown as Session;
}

const ROWS = [
  {
    id: "obs-p1-4548-4-2024-09-12",
    code: "4548-4",
    display: "Hemoglobin A1c/Hemoglobin.total in Blood",
    value: 6.4,
    unit: "%",
    low: 4,
    high: 6,
    rangeText: "4.0 - 6.0 % (as printed on the report)",
    category: "laboratory",
    effective: "2024-09-12",
    performer: "AlphaKlinik Berlin, Zentrallabor (fictional)",
  },
  {
    id: "obs-p1-33914-3-2024-09-12",
    code: "33914-3",
    display: "Glomerular filtration rate/1.73 sq M.predicted",
    value: 96,
    unit: "mL/min/{1.73_m2}",
    low: 90,
    high: null,
    rangeText: "> 90 mL/min/{1.73_m2} (as printed on the report)",
    category: "laboratory",
    effective: "2024-09-12T08:30:00Z",
    performer: null,
  },
];

describe("GET /api/patient/observations", () => {
  beforeEach(() => {
    mockRunQuery.mockReset();
    vi.mocked(getServerSession).mockResolvedValue(session(["EDC_ADMIN"]));
  });

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(null);
    const res = await GET(makeReq("?patientId=P1"));
    expect(res.status).toBe(401);
  });

  it("returns 403 for a researcher", async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(session(["DATA_USER"]));
    const res = await GET(makeReq("?patientId=P1"));
    expect(res.status).toBe(403);
    expect(mockRunQuery).not.toHaveBeenCalled();
  });

  it("returns 400 without a patientId", async () => {
    const res = await GET(makeReq(""));
    expect(res.status).toBe(400);
  });

  it("lets a patient read their own record only (Art. 3)", async () => {
    vi.mocked(getServerSession).mockResolvedValue(
      session(["PATIENT"], "patient1"),
    );
    const other = await GET(makeReq("?patientId=P2"));
    expect(other.status).toBe(403);
    expect((await other.json()).reason).toContain("Art. 3");
    expect(mockRunQuery).not.toHaveBeenCalled();

    mockRunQuery
      .mockResolvedValueOnce([{ id: "P1", name: "Anna Müller" }])
      .mockResolvedValueOnce(ROWS);
    const own = await GET(makeReq("?patientId=P1"));
    expect(own.status).toBe(200);
  });

  it("recognises the patient by the Keycloak login name behind a display name", async () => {
    vi.mocked(getServerSession).mockResolvedValue({
      user: { name: "Maria Schmidt", email: "patient1@health-dataspace.local" },
      roles: ["PATIENT"],
      preferredUsername: "patient1",
    } as unknown as Session);
    mockRunQuery
      .mockResolvedValueOnce([{ id: "P1", name: "Anna Müller" }])
      .mockResolvedValueOnce(ROWS);
    const res = await GET(makeReq("?patientId=P1"));
    expect(res.status).toBe(200);
  });

  it("returns 404 for an unknown patient", async () => {
    mockRunQuery.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    const res = await GET(makeReq("?patientId=nobody"));
    expect(res.status).toBe(404);
  });

  it("returns a FHIR R4 searchset with the printed reference ranges", async () => {
    mockRunQuery
      .mockResolvedValueOnce([{ id: "P1", name: "Anna Müller" }])
      .mockResolvedValueOnce(ROWS);
    const res = await GET(makeReq("?patientId=P1"));
    expect(res.status).toBe(200);
    const bundle = await res.json();
    expect(bundle.resourceType).toBe("Bundle");
    expect(bundle.type).toBe("searchset");
    expect(bundle.total).toBe(2);
    expect(bundle.link[0].url).toBe("/api/patient/observations?patientId=P1");
    const [hba1c, egfr] = bundle.entry.map(
      (e: { resource: unknown }) => e.resource,
    );
    expect(hba1c.subject).toEqual({
      reference: "Patient/P1",
      display: "Anna Müller",
    });
    expect(hba1c.code.coding[0]).toEqual({
      system: "http://loinc.org",
      code: "4548-4",
      display: "Hemoglobin A1c/Hemoglobin.total in Blood",
    });
    expect(hba1c.effectiveDateTime).toBe("2024-09-12T00:00:00Z");
    expect(hba1c.valueQuantity).toMatchObject({ value: 6.4, unit: "%" });
    expect(hba1c.referenceRange[0]).toEqual({
      low: { value: 4, unit: "%" },
      high: { value: 6, unit: "%" },
      text: "4.0 - 6.0 % (as printed on the report)",
    });
    expect(hba1c.performer[0].display).toContain("fictional");
    // an open-ended range has no high
    expect(egfr.referenceRange[0].high).toBeUndefined();
    expect(egfr.referenceRange[0].low.value).toBe(90);
    expect(egfr.performer).toBeUndefined();
    expect(egfr.effectiveDateTime).toBe("2024-09-12T08:30:00Z");
  });

  it("passes the code filter to the query", async () => {
    mockRunQuery
      .mockResolvedValueOnce([{ id: "P1", name: "Anna Müller" }])
      .mockResolvedValueOnce([ROWS[0]]);
    const res = await GET(makeReq("?patientId=P1&code=4548-4"));
    expect(res.status).toBe(200);
    const params = mockRunQuery.mock.calls[1][1];
    expect(params).toEqual({ patientId: "P1", code: "4548-4" });
  });

  it("returns 502 when Neo4j is down", async () => {
    mockRunQuery.mockRejectedValue(new Error("ECONNREFUSED"));
    const res = await GET(makeReq("?patientId=P1"));
    expect(res.status).toBe(502);
  });
});

describe("GET /api/patient/observations?include=all (ADR-059)", () => {
  beforeEach(() => {
    mockRunQuery.mockReset();
    vi.mocked(getServerSession).mockResolvedValue(session(["EDC_ADMIN"]));
  });

  const REPORT = {
    id: "dr-ecg-p1-2026-03-04",
    code: "11524-6",
    display: "EKG study",
    category: "EC",
    categoryDisplay: "Electrocardiac (e.g., EKG, EEC, Holter)",
    status: "final",
    effective: "2026-03-04",
    issued: "2026-03-04T10:00:00Z",
    performer: "AlphaKlinik Berlin, Kardiologie (fictional)",
    conclusion: "Sinus rhythm, normal intervals.",
    results: ["dr-ecg-p1-2026-03-04-8867-4"],
  };
  const IMMUNIZATION = {
    id: "imm-p1-2025-10-14-150",
    code: "150",
    system: "http://hl7.org/fhir/sid/cvx",
    display: "Influenza, injectable, quadrivalent, preservative free",
    status: "completed",
    occurrence: "2025-10-14",
    lot: "FLU25-7731",
    performer: "Hausarztpraxis Musterstadt (fictional)",
  };
  const STATEMENT = {
    id: "ms-p1-A10BA02",
    code: "A10BA02",
    system: "http://www.whocc.no/atc",
    display: "Metformin 500 mg",
    status: "active",
    dosage: "1-0-1",
    dose: 500,
    doseUnit: "mg",
    reason: "Diabetes mellitus type 2",
    since: "2018-04-10",
    planId: "bmp-p1-2026-08-21",
    planPrinted: "2026-08-21",
    source: "Bundeseinheitlicher Medikationsplan (fictional)",
  };

  it("appends the reports, vaccinations and the medication plan to the Bundle", async () => {
    mockRunQuery
      .mockResolvedValueOnce([{ id: "P1", name: "Anna Müller" }])
      .mockResolvedValueOnce(ROWS)
      .mockResolvedValueOnce([REPORT])
      .mockResolvedValueOnce([IMMUNIZATION])
      .mockResolvedValueOnce([STATEMENT]);
    const res = await GET(makeReq("?patientId=P1&include=all"));
    expect(res.status).toBe(200);
    const body = await res.json();
    const types = body.entry.map(
      (e: { resource: { resourceType: string } }) => e.resource.resourceType,
    );
    expect(types.filter((t: string) => t === "Observation")).toHaveLength(
      ROWS.length,
    );
    expect(types).toContain("DiagnosticReport");
    expect(types).toContain("Immunization");
    expect(types).toContain("MedicationStatement");
    expect(body.total).toBe(ROWS.length + 3);
    expect(mockRunQuery).toHaveBeenCalledTimes(5);

    const report = body.entry.find(
      (e: { resource: { resourceType: string } }) =>
        e.resource.resourceType === "DiagnosticReport",
    ).resource;
    expect(report.code.coding[0]).toEqual({
      system: "http://loinc.org",
      code: "11524-6",
      display: "EKG study",
    });
    expect(report.category[0].coding[0].code).toBe("EC");
    expect(report.result).toEqual([
      { reference: "urn:uuid:dr-ecg-p1-2026-03-04-8867-4" },
    ]);
    const statement = body.entry.find(
      (e: { resource: { resourceType: string } }) =>
        e.resource.resourceType === "MedicationStatement",
    ).resource;
    expect(statement.dosage[0].text).toBe("1-0-1");
    expect(statement.dosage[0].doseAndRate[0].doseQuantity).toEqual({
      value: 500,
      unit: "mg",
    });
    expect(statement.identifier[0].value).toBe("bmp-p1-2026-08-21");
  });

  it("leaves the Bundle Observations only without include", async () => {
    mockRunQuery
      .mockResolvedValueOnce([{ id: "P1", name: "Anna Müller" }])
      .mockResolvedValueOnce(ROWS);
    const res = await GET(makeReq("?patientId=P1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.total).toBe(ROWS.length);
    expect(mockRunQuery).toHaveBeenCalledTimes(2);
  });

  it("keeps a record without extras a valid Bundle", async () => {
    mockRunQuery
      .mockResolvedValueOnce([{ id: "P1", name: "Anna Müller" }])
      .mockResolvedValueOnce(ROWS)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    const res = await GET(makeReq("?patientId=P1&include=all"));
    const body = await res.json();
    expect(body.total).toBe(ROWS.length);
    expect(body.entry).toHaveLength(ROWS.length);
  });
});
